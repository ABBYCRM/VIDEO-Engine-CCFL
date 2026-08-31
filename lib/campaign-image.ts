import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { generateA2eGptImage, getImageApiKey, getImageApiKeyForProvider, getImageModel, getImageProvider, ImageUpstreamError } from "@/lib/avatar-generation/client";
import { generateAvatarImage } from "@/lib/nvidia/image";
import { saveGeneratedImage } from "@/lib/media-library";
import { composeStillPost } from "@/lib/still-compose";
import { getStillPostTemplate } from "@/lib/still-post-templates";
import { composeCartoonStillPost, planCartoonStill, type CartoonOverlaySpec } from "@/lib/cartoon-still-compose";
import { getCartoonTemplate, pickCartoonTemplateForCategory, pickCartoonVariant } from "@/lib/cartoon-still-templates";

function resolveReferencePath(referenceImagePath:string){
  if(referenceImagePath.startsWith("/avatars/"))return path.resolve(process.cwd(),"public",referenceImagePath.slice(1));
  if(referenceImagePath.startsWith("/public/"))return path.resolve(process.cwd(),referenceImagePath.slice(1));
  if(referenceImagePath.startsWith("public/"))return path.resolve(process.cwd(),referenceImagePath);
  if(path.isAbsolute(referenceImagePath))return referenceImagePath;
  return path.resolve(process.cwd(),referenceImagePath);
}
function mimeFor(pathname:string){const lower=pathname.toLowerCase();return lower.endsWith(".png")?"image/png":lower.endsWith(".webp")?"image/webp":"image/jpeg";}

async function editWithGemini(referencePath:string|null,prompt:string,model:string, apiKey?: string){
  const key=apiKey ?? getImageApiKey(),ac=new AbortController(),timer=setTimeout(()=>ac.abort(),45_000);
  const parts:Array<Record<string,unknown>>=[{text:prompt}];
  if(referencePath){
    const b64=(await fs.readFile(referencePath)).toString("base64");
    parts.unshift({inline_data:{mime_type:mimeFor(referencePath),data:b64}});
  }
  try{
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",signal:ac.signal,body:JSON.stringify({contents:[{role:"user",parts}],generationConfig:{responseModalities:["IMAGE"],temperature:.35}})});
    if(!r.ok)throw new ImageUpstreamError(`Gemini image API HTTP ${r.status}: ${(await r.text()).slice(0,300)}`,r.status);
    const json=await r.json() as {candidates?:Array<{content?:{parts?:Array<{inline_data?:{data?:string}}>} }>};
    const data=json.candidates?.[0]?.content?.parts?.find(p=>p.inline_data?.data)?.inline_data?.data;if(!data)throw new ImageUpstreamError("Gemini returned no image",502);return{base64:data,mimeType:"image/png",model};
  }finally{clearTimeout(timer)}
}
async function editWithOpenAI(referencePath:string|null,prompt:string,model:string, apiKey?: string){
  const key=apiKey ?? getImageApiKey(),ac=new AbortController(),timer=setTimeout(()=>ac.abort(),120_000);
  try{
    let r:Response;
    if(!referencePath || model==="dall-e-3"){
      r=await fetch("https://api.openai.com/v1/images/generations",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},signal:ac.signal,body:JSON.stringify({model,prompt,n:1,size:"1024x1536",response_format:"b64_json"})});
    }else{
      const bytes=await fs.readFile(referencePath),form=new FormData();
      form.append("model",model);form.append("image",new Blob([bytes]),"reference.png");form.append("prompt",prompt);form.append("n","1");form.append("size","1024x1536");form.append("input_fidelity","high");
      r=await fetch("https://api.openai.com/v1/images/edits",{method:"POST",headers:{Authorization:`Bearer ${key}`},body:form,signal:ac.signal});
    }
    if(!r.ok)throw new ImageUpstreamError(`OpenAI image API HTTP ${r.status}: ${(await r.text()).slice(0,300)}`,r.status);
    const json=await r.json() as {data?:Array<{b64_json?:string}>};const data=json.data?.[0]?.b64_json;if(!data)throw new ImageUpstreamError("OpenAI returned no image",502);return{base64:data,mimeType:"image/png",model};
  }finally{clearTimeout(timer)}
}
async function editWithHedra(referencePath:string|null,prompt:string,model:string){
  // Hedra v3 image: submit + poll + read result. Same shape as the other image adapters.
  // Model id is the user-selected one (gpt-image-2, flux2-max, imagen-4, seedream-5, etc.)
  //
  // Field compatibility:
  //  - gpt-image-2/1.5: needs `quality: high` (and accepts `resolution: 1K`).
  //  - Most text-to-image models: accept `resolution`. Sending it to flux2-max
  //    returns HTTP 400 "Extra inputs are not permitted", so it's gated.
  //  - Reference image: gpt-image-2 is an EDIT model — it REQUIRES an input image.
  //    The reference is sent as `images: [{ source: "url", url: <uploaded file url> }]`,
  //    so we first POST the avatar file to /v3/files and get back a server URL.
  //    flux2-max is a text-to-image model; it ignores `images`.
  const { getProviderKey } = await import("@/lib/providers");
  const key=getProviderKey("hedra"),ac=new AbortController();
  const TIMEOUT_MS=120_000;
  const submitTimer=setTimeout(()=>ac.abort(),TIMEOUT_MS);
  const MODELS_NEEDING_QUALITY = new Set(["gpt-image-2", "gpt-image-1.5"]);
  const MODELS_ACCEPTING_RESOLUTION = new Set([
    "gpt-image-2", "gpt-image-1.5",
    "imagen-4", "nano-banana-pro",
    "ideogram-v4", "recraft-v3", "seedream-5"
  ]);
  const MODELS_REQUIRING_REFERENCE = new Set(["gpt-image-2", "gpt-image-1.5"]);

  // If a reference is required and we have one, upload it first and capture the URL.
  let referenceImageUrl: string | null = null;
  if (MODELS_REQUIRING_REFERENCE.has(model) && referencePath) {
    try {
      const bytes = await fs.readFile(referencePath);
      const mime = mimeFor(referencePath);
      const form = new FormData();
      form.append("file", new Blob([bytes]), `reference.${mime === "image/png" ? "png" : "jpg"}`);
      const up = await fetch("https://api.hedra.com/v3/files", {
        method: "POST",
        headers: { "Authorization": `Key ${key}` },
        body: form,
        signal: ac.signal
      });
      if (!up.ok) throw new ImageUpstreamError(`Hedra file upload HTTP ${up.status}: ${(await up.text()).slice(0,300)}`, up.status);
      const upJson = await up.json() as { url?: string; data?: { url?: string } };
      referenceImageUrl = upJson.url || upJson.data?.url || null;
      if (!referenceImageUrl) throw new ImageUpstreamError("Hedra file upload returned no url", 502);
    } catch (e) {
      if (e instanceof ImageUpstreamError) throw e;
      throw new ImageUpstreamError(`Hedra file upload failed: ${e instanceof Error ? e.message : String(e)}`, 502);
    }
  }

  const input:Record<string,unknown> = { prompt, aspect_ratio: "9:16" };
  if (MODELS_NEEDING_QUALITY.has(model)) input.quality = "high";
  if (MODELS_ACCEPTING_RESOLUTION.has(model)) input.resolution = "1K";
  if (referenceImageUrl) input.images = [{ source: "url", url: referenceImageUrl }];

  try{
    const submit:Response = await fetch(`https://api.hedra.com/v3/models/${encodeURIComponent(model)}`, {
      method: "POST",
      headers: { "Authorization": `Key ${key}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: ac.signal,
      body: JSON.stringify({ input })
    });
    if(!submit.ok)throw new ImageUpstreamError(`Hedra image submit HTTP ${submit.status}: ${(await submit.text()).slice(0,300)}`,submit.status);
    const sub=await submit.json() as {job_id?:string;id?:string};
    const jobId=sub.job_id||sub.id;
    if(!jobId)throw new ImageUpstreamError("Hedra image submit returned no job id",502);
    const pollStart=Date.now();let status="queued";
    while(Date.now()-pollStart<TIMEOUT_MS){
      await new Promise(r=>setTimeout(r,1500));
      const pr=await fetch(`https://api.hedra.com/v3/jobs/${encodeURIComponent(jobId)}/status`,{headers:{"Authorization":`Key ${key}`},cache:"no-store"});
      if(!pr.ok)throw new ImageUpstreamError(`Hedra image poll HTTP ${pr.status}: ${(await pr.text()).slice(0,300)}`,pr.status);
      const pj=await pr.json() as {status?:string;state?:string};
      status=(pj.status||pj.state||"queued").toLowerCase();
      if(status==="completed"||status==="succeeded"||status==="success")break;
      if(status==="failed"||status==="error"||status==="cancelled")throw new ImageUpstreamError(`Hedra image job ${jobId} ${status}`,502);
    }
    if(status!=="completed"&&status!=="succeeded"&&status!=="success")throw new ImageUpstreamError(`Hedra image job ${jobId} timed out after ${TIMEOUT_MS}ms (last status: ${status})`,504);
    const rj=await fetch(`https://api.hedra.com/v3/jobs/${encodeURIComponent(jobId)}`,{headers:{"Authorization":`Key ${key}`},cache:"no-store"});
    if(!rj.ok)throw new ImageUpstreamError(`Hedra image result HTTP ${rj.status}: ${(await rj.text()).slice(0,300)}`,rj.status);
    const j=await rj.json() as {outputs?:Array<{url?:string;b64?:string;data?:string}>;data?:Array<{url?:string;b64?:string;data?:string}>};
    const outputs=j.outputs||j.data||[];const out=outputs[0];
    if(!out)throw new ImageUpstreamError("Hedra returned no image output",502);
    if(out.b64||out.data)return{base64:(out.b64||out.data) as string,mimeType:"image/png",model};
    if(out.url){
      const dl=await fetch(out.url,{signal:ac.signal,cache:"no-store"});
      if(!dl.ok)throw new ImageUpstreamError(`Hedra image download HTTP ${dl.status}`,dl.status);
      return{base64:Buffer.from(await dl.arrayBuffer()).toString("base64"),mimeType:"image/png",model};
    }
    throw new ImageUpstreamError("Hedra output had no url or b64 data",502);
  }catch(e){
    if(e instanceof Error && e.name==="AbortError")throw new ImageUpstreamError(`Hedra image API timed out after ${TIMEOUT_MS}ms`,504);
    throw e;
  }finally{clearTimeout(submitTimer)}
}

// One render call → one image. The chain below tries the configured
// provider first, then walks a fixed fallback order if that one throws.
// Without this, a single transient failure (Hedra job 4xx, Grok HTTP 400,
// Veo busy, etc.) used to kill the Site/IG autopilot pipeline for the
// whole day even when 4 other live providers were ready to render the
// same prompt. The cartoon stills path in particular has no reference
// image requirement, so the chain is unrestricted there.
async function renderWithConfiguredProvider(prompt: string, referencePath: string | null) {
  const errors: Array<{ provider: string; error: string }> = [];
  // Configured provider first (operator's pick). Then the live fallback
  // order — the chain skips providers that can't do the job (xAI without
  // a reference path is not allowed; OpenAI without a key is not
  // allowed) and tries the rest in this order: gemini, a2e, openai,
  // hedra, xai. Veo is the Google video model and not on this list —
  // the cartoon/photoreal still path doesn't use it.
  const configuredFirst = (() => {
    const p = getImageProvider();
    const m = getImageModel();
    if (p === "a2e")     return { provider: "a2e",     fn: () => generateA2eGptImage({ prompt, model: m, referencePath, aspectRatio: "9:16" }).then((g) => ({ base64: g.png.toString("base64"), mimeType: "image/png" as const, model: g.model })) };
    if (p === "openai")  return { provider: "openai",  fn: () => editWithOpenAI(referencePath, prompt, m) };
    if (p === "gemini")  return { provider: "gemini",  fn: () => editWithGemini(referencePath, prompt, m) };
    if (p === "hedra")   return { provider: "hedra",   fn: () => editWithHedra(referencePath, prompt, m) };
    if (p === "xai")     return { provider: "xai",     fn: async () => {
      if (referencePath) throw new ImageUpstreamError("xAI cannot edit a canonical reference; pass null referencePath or pick another provider", 400);
      return renderWithXai(prompt, m);
    } };
    if (p === "mock")   return { provider: "mock",    fn: async () => { throw new ImageUpstreamError("Mock image mode cannot produce a campaign-ready still.", 400); } };
    // Unknown / unset default → Hedra, same behavior as before.
    return { provider: "hedra", fn: () => editWithHedra(referencePath, prompt, m) };
  })();

  // Configured provider is the operator's choice — try it first; on
  // failure, fall through.
  const tryOrder: Array<{ provider: string; fn: () => Promise<{ base64: string; mimeType: string; model: string }> }> = [configuredFirst];
  // Operator-locked image fallback chain (2026-08-30): only the providers
  // the operator has paid budget for, in the order they want them tried.
  //   1. Hedra   (paid)
  //   2. Gemini  (Google, paid)
  //   3. Grok    (xAI, paid)
  //   4. OpenAI  (paid)
  // A2E and the (no-reference-only) xAI generation path are intentionally
  // dropped from the daily chain because the operator hasn't allocated
  // budget for them; they're available via explicit /api/avatar-generation
  // and /api/internal/ugc/batch calls if needed.
  //
  // Every fallback call resolves its OWN key via getImageApiKeyForProvider,
  // never getImageApiKey() (which returns the key for whatever provider is
  // CONFIGURED, not the one actually being attempted here) -- calling that
  // instead would mean, say, a Hedra-configured deployment falling through
  // to Gemini using its Hedra key, guaranteeing a 401 on every fallback
  // attempt except Hedra itself and defeating the whole point of this
  // chain. getImageApiKeyForProvider() throws when that provider's key
  // isn't configured at all; letting that throw happen inside fn() (rather
  // than resolving the key eagerly here) means an unconfigured fallback is
  // just another caught-and-skipped attempt, same as a real upstream error.
  const fallbacks: Array<{ provider: string; fn: () => Promise<{ base64: string; mimeType: string; model: string }> }> = [
    { provider: "hedra",  fn: () => editWithHedra(referencePath, prompt, "gpt-image-2") },
    { provider: "gemini", fn: () => editWithGemini(referencePath, prompt, "gemini-2.5-flash-image", getImageApiKeyForProvider("gemini")) },
    { provider: "openai", fn: () => editWithOpenAI(referencePath, prompt, "gpt-image-1", getImageApiKeyForProvider("openai")) }
  ];
  // xAI/Grok last and ONLY if there's no reference path (it can't edit
  // a canonical avatar — it would reject the call). The cartoon-stills
  // path runs without a reference, so the operator still gets xAI in
  // that one case.
  if (!referencePath) fallbacks.push({ provider: "xai", fn: () => renderWithXai(prompt, "grok-imagine-image", getImageApiKeyForProvider("xai")) });
  for (const fb of fallbacks) if (fb.provider !== configuredFirst.provider) tryOrder.push(fb);

  for (const attempt of tryOrder) {
    try {
      const result = await attempt.fn();
      if (errors.length) {
        console.warn(`[campaign-image] primary provider ${configuredFirst.provider} failed; fell through ${errors.map((e) => e.provider).join(", ")} and rendered via ${attempt.provider}`);
      }
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ provider: attempt.provider, error: msg });
      // Continue to the next provider. Only stop when we run out.
    }
  }
  // Every provider failed. Surface the chain so the run log shows
  // exactly which ones the operator needs to investigate.
  const summary = errors.map((e) => `${e.provider}: ${e.error.slice(0, 120)}`).join(" | ");
  throw new ImageUpstreamError(`All image providers failed. Chain: ${summary}`, 502);
}

async function renderWithXai(prompt: string, model: string, apiKey?: string) {
  const key = apiKey ?? getImageApiKey();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 45_000);
  try {
    const r = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: ac.signal,
      body: JSON.stringify({ model: model.startsWith("grok-") ? model : "grok-imagine-image", prompt, n: 1 })
    });
    if (!r.ok) throw new ImageUpstreamError(`xAI image API HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`, r.status);
    const json = await r.json() as { data?: Array<{ url?: string; b64_json?: string }> };
    const item = json.data?.[0];
    if (item?.b64_json) return { base64: item.b64_json, mimeType: "image/png", model };
    if (!item?.url) throw new ImageUpstreamError("xAI returned no image", 502);
    const dl = await fetch(item.url, { signal: ac.signal, cache: "no-store" });
    if (!dl.ok) throw new ImageUpstreamError(`xAI image download HTTP ${dl.status}`, dl.status);
    return { base64: Buffer.from(await dl.arrayBuffer()).toString("base64"), mimeType: "image/png", model };
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeStillPrompt(raw:string){
  // The MANDATORY BRAND CONTACT mandate is for spoken video dialogue. In an
  // image prompt it makes the model paint the phone number and its spelled
  // out pronunciation into the photo (in any language). Strip it: the frame
  // overlay carries all branding and contact text.
  return String(raw||"")
    .replace(/MANDATORY BRAND CONTACT:[^\n]*/gi,"")
    .replace(/five six one[^.\n]*/gi,"")
    .replace(/cinco seis uno[^.\n]*/gi,"")
    .replace(/\(?\s*561\s*\)?[\s.\u00b7-]*566[\s.\u00b7-]*1360/g,"")
    .replace(/caseclosedfl\.?\s*com/gi,"")
    .replace(/instagram automation/gi,"")
    .replace(/d\u00edas? \d+|day \d+/gi,"");
}

export async function generateCampaignStill(input:{prompt:string;avatarId?:string|null;createCalendarPost?:boolean;stillTemplateId?:string|null;seed?:string|null;category?:string|null;cartoonVariantOverride?:import("@/lib/cartoon-still-templates").CartoonVariant|null}){
  // Two template systems:
  //  - "cartoon-..." ids  → "The Animated Legal Ad" (Pixar-style 3D cartoon, orange footer, navy panel)
  //  - everything else    → the existing photoreal still template system
  const isCartoon = (input.stillTemplateId || "").startsWith("cartoon-");
  const template = isCartoon ? null : (input.stillTemplateId ? getStillPostTemplate(input.stillTemplateId) : null);

  // Build the prompt
  let prompt: string;
  let cartoonOverlay: import("@/lib/cartoon-still-compose").CartoonOverlaySpec | null = null;
  if (isCartoon) {
    const plan = planCartoonStill({
      category: input.category || "car_accident",
      seed: input.seed,
      templateId: input.stillTemplateId,
      variantOverride: input.cartoonVariantOverride,
    });
    cartoonOverlay = plan.overlay;
    prompt = plan.imagePrompt;
  } else {
    prompt = `Create one bold, scroll-stopping vertical editorial photograph for a social post — the kind of image that makes someone stop scrolling in under a second, not a flat evenly-lit stock photo. ${sanitizeStillPrompt(input.prompt)}${template?`\nTemplate image direction: ${template.imagePromptHints}.`:""}\nUse dramatic, high-contrast lighting, a single clear focal point, confident and slightly dynamic framing (not a static passport-photo pose), and rich, saturated color. Photorealistic unless the creative direction explicitly requests another style.\nReturn only the photograph itself: no social-media interface, phone screen, app frame, post mockup, buttons, counters, captions, lettering, logos, or text artifacts. No fabricated legal results, settlement amounts, testimonials, injuries, or statistics.\nSTRICT: the photograph itself must contain absolutely no words, letters, digits, signage text, or phone numbers anywhere in the frame — every headline, phone number, and brand mark is added afterwards by a designed overlay. Show every person fully framed: never crop a person at the neck, waist, or knees by the edge of the frame.`;
  }

  let reference:string|null=null;
  if(input.avatarId&&getImageProvider()==="xai"){
    // xAI cannot edit a reference image; generate from the prompt alone instead of failing the slot.
  }else if(input.avatarId){
    const avatar=db.prepare("SELECT id,name,reference_image_path FROM avatars WHERE id=?").get(input.avatarId) as {id:string;name:string;reference_image_path:string|null}|undefined;
    if(!avatar)throw new Error("Selected canonical avatar was not found");
    const front=db.prepare("SELECT file_path,status FROM avatar_views WHERE avatar_id=? AND view='front'").get(input.avatarId) as {file_path:string|null;status:string}|undefined;
    const raw=front?.status==="ready"&&front.file_path?front.file_path:avatar.reference_image_path;
    if(!raw)throw new Error(`${avatar.name} has no usable identity image`);
    reference=resolveReferencePath(raw);
  }
  const result=await renderWithConfiguredProvider(prompt,reference);
  let base64=result.base64,mimeType=result.mimeType;
  if(isCartoon && cartoonOverlay){
    const tempDir=path.join(path.resolve(process.env.VIDEO_OUTPUT_DIR||"./data/videos"),"cartoon-compose"),token=crypto.randomUUID(),photoPath=path.join(tempDir,`${token}.${mimeType==="image/jpeg"?"jpg":mimeType==="image/webp"?"webp":"png"}`),outPath=path.join(tempDir,`${token}-composed.png`);
    await fs.mkdir(tempDir,{recursive:true});
    try{await fs.writeFile(photoPath,Buffer.from(base64,"base64"));await composeCartoonStillPost({photoPath,overlay:cartoonOverlay,outPath});base64=(await fs.readFile(outPath)).toString("base64");mimeType="image/png";}
    finally{await Promise.all([fs.unlink(photoPath).catch(()=>{}),fs.unlink(outPath).catch(()=>{})]);}
  } else if(template){
    const tempDir=path.join(path.resolve(process.env.VIDEO_OUTPUT_DIR||"./data/videos"),"still-compose"),token=crypto.randomUUID(),photoPath=path.join(tempDir,`${token}.${mimeType==="image/jpeg"?"jpg":mimeType==="image/webp"?"webp":"png"}`),outPath=path.join(tempDir,`${token}-composed.png`);
    await fs.mkdir(tempDir,{recursive:true});
    try{await fs.writeFile(photoPath,Buffer.from(base64,"base64"));await composeStillPost({photoPath,templateId:template.id,outPath,seed:input.seed});base64=(await fs.readFile(outPath)).toString("base64");mimeType="image/png";}
    finally{await Promise.all([fs.unlink(photoPath).catch(()=>{}),fs.unlink(outPath).catch(()=>{})]);}
  }
  const saved=await saveGeneratedImage({base64,source:"campaign-still",model:result.model,prompt,mimeType,createCalendarPost:input.createCalendarPost});
  return{...result,base64,mimeType,assetId:saved.id,assetUrl:saved.url};
}
