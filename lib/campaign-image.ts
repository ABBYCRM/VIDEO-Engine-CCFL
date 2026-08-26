import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { generateA2eGptImage, getImageApiKey, getImageModel, getImageProvider, ImageUpstreamError } from "@/lib/avatar-generation/client";
import { generateAvatarImage } from "@/lib/nvidia/image";
import { saveGeneratedImage } from "@/lib/media-library";
import { composeStillPost } from "@/lib/still-compose";
import { getStillPostTemplate } from "@/lib/still-post-templates";

function resolveReferencePath(referenceImagePath:string){
  if(referenceImagePath.startsWith("/avatars/"))return path.resolve(process.cwd(),"public",referenceImagePath.slice(1));
  if(referenceImagePath.startsWith("/public/"))return path.resolve(process.cwd(),referenceImagePath.slice(1));
  if(referenceImagePath.startsWith("public/"))return path.resolve(process.cwd(),referenceImagePath);
  if(path.isAbsolute(referenceImagePath))return referenceImagePath;
  return path.resolve(process.cwd(),referenceImagePath);
}
function mimeFor(pathname:string){const lower=pathname.toLowerCase();return lower.endsWith(".png")?"image/png":lower.endsWith(".webp")?"image/webp":"image/jpeg";}

async function editWithGemini(referencePath:string|null,prompt:string,model:string){
  const key=getImageApiKey(),ac=new AbortController(),timer=setTimeout(()=>ac.abort(),45_000);
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
async function editWithOpenAI(referencePath:string|null,prompt:string,model:string){
  const key=getImageApiKey(),ac=new AbortController(),timer=setTimeout(()=>ac.abort(),120_000);
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

async function renderWithConfiguredProvider(prompt:string, referencePath:string|null){
  const provider=getImageProvider(),model=getImageModel();
  if(provider==="a2e"){
    const generated=await generateA2eGptImage({prompt,model,referencePath,aspectRatio:"9:16"});
    return{base64:generated.png.toString("base64"),mimeType:"image/png",model:generated.model};
  }
  if(provider==="openai")return editWithOpenAI(referencePath,prompt,model);
  if(provider==="gemini")return editWithGemini(referencePath,prompt,model);
  if(provider==="xai"){
    if(referencePath)throw new ImageUpstreamError("The selected xAI image provider cannot edit a canonical reference. Choose A2E, Gemini, or OpenAI for identity-preserving campaign stills.",400);
    const key=getImageApiKey(),ac=new AbortController(),timer=setTimeout(()=>ac.abort(),45_000);
    try{
      const r=await fetch("https://api.x.ai/v1/images/generations",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},signal:ac.signal,body:JSON.stringify({model:model.startsWith("grok-")?model:"grok-imagine-image",prompt,n:1})});
      if(!r.ok)throw new ImageUpstreamError(`xAI image API HTTP ${r.status}: ${(await r.text()).slice(0,300)}`,r.status);
      const json=await r.json() as {data?:Array<{url?:string;b64_json?:string}>};
      const item=json.data?.[0];
      if(item?.b64_json)return{base64:item.b64_json,mimeType:"image/png",model};
      if(!item?.url)throw new ImageUpstreamError("xAI returned no image",502);
      const dl=await fetch(item.url,{signal:ac.signal,cache:"no-store"});
      if(!dl.ok)throw new ImageUpstreamError(`xAI image download HTTP ${dl.status}`,dl.status);
      return{base64:Buffer.from(await dl.arrayBuffer()).toString("base64"),mimeType:"image/png",model};
    }finally{clearTimeout(timer)}
  }
  if(provider==="mock")throw new ImageUpstreamError("Mock image mode cannot produce a campaign-ready still.",400);
  const fresh=await generateAvatarImage({prompt});
  return{base64:fresh.base64,mimeType:fresh.mimeType,model:fresh.model};
}

export async function generateCampaignStill(input:{prompt:string;avatarId?:string|null;createCalendarPost?:boolean;stillTemplateId?:string|null}){
  const template=input.stillTemplateId?getStillPostTemplate(input.stillTemplateId):null;
  const prompt=`Create one bold, scroll-stopping vertical editorial photograph for a social post — the kind of image that makes someone stop scrolling in under a second, not a flat evenly-lit stock photo. ${input.prompt}${template?`\nTemplate image direction: ${template.imagePromptHints}.`:""}\nUse dramatic, high-contrast lighting, a single clear focal point, confident and slightly dynamic framing (not a static passport-photo pose), and rich, saturated color. Photorealistic unless the creative direction explicitly requests another style.\nReturn only the photograph itself: no social-media interface, phone screen, app frame, post mockup, buttons, counters, captions, lettering, logos, or text artifacts. No fabricated legal results, settlement amounts, testimonials, injuries, or statistics.`;
  let reference:string|null=null;
  if(input.avatarId){
    const avatar=db.prepare("SELECT id,name,reference_image_path FROM avatars WHERE id=?").get(input.avatarId) as {id:string;name:string;reference_image_path:string|null}|undefined;
    if(!avatar)throw new Error("Selected canonical avatar was not found");
    const front=db.prepare("SELECT file_path,status FROM avatar_views WHERE avatar_id=? AND view='front'").get(input.avatarId) as {file_path:string|null;status:string}|undefined;
    const raw=front?.status==="ready"&&front.file_path?front.file_path:avatar.reference_image_path;
    if(!raw)throw new Error(`${avatar.name} has no usable identity image`);
    reference=resolveReferencePath(raw);
  }
  const result=await renderWithConfiguredProvider(prompt,reference);
  let base64=result.base64,mimeType=result.mimeType;
  if(template){
    const tempDir=path.resolve(process.env.VIDEO_OUTPUT_DIR||"./data/videos"),"still-compose"),token=crypto.randomUUID(),photoPath=path.join(tempDir,`${token}.${mimeType==="image/jpeg"?"jpg":mimeType==="image/webp"?"webp":"png"}`),outPath=path.join(tempDir,`${token}-composed.png`);
    await fs.mkdir(tempDir,{recursive:true});
    try{await fs.writeFile(photoPath,Buffer.from(base64,"base64"));await composeStillPost({photoPath,templateId:template.id,outPath});base64=(await fs.readFile(outPath)).toString("base64");mimeType="image/png";}
    finally{await Promise.all([fs.unlink(photoPath).catch(()=>{}),fs.unlink(outPath).catch(()=>{})]);}
  }
  const saved=await saveGeneratedImage({base64,source:"campaign-still",model:result.model,prompt,mimeType,createCalendarPost:input.createCalendarPost});
  return{...result,base64,mimeType,assetId:saved.id,assetUrl:saved.url};
}
