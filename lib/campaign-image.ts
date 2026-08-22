import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { getImageApiKey, getImageModel, getImageProvider, ImageUpstreamError } from "@/lib/avatar-generation/client";
import { generateAvatarImage } from "@/lib/nvidia/image";
import { saveGeneratedImage } from "@/lib/media-library";

function resolveReferencePath(referenceImagePath:string){
  if(referenceImagePath.startsWith("/avatars/"))return path.resolve(process.cwd(),"public",referenceImagePath.slice(1));
  if(referenceImagePath.startsWith("/public/"))return path.resolve(process.cwd(),referenceImagePath.slice(1));
  if(referenceImagePath.startsWith("public/"))return path.resolve(process.cwd(),referenceImagePath);
  if(path.isAbsolute(referenceImagePath))return referenceImagePath;
  return path.resolve(process.cwd(),referenceImagePath);
}
function mimeFor(pathname:string){const lower=pathname.toLowerCase();return lower.endsWith(".png")?"image/png":lower.endsWith(".webp")?"image/webp":"image/jpeg";}

async function editWithGemini(referencePath:string,prompt:string,model:string){
  const key=getImageApiKey(),b64=(await fs.readFile(referencePath)).toString("base64"),ac=new AbortController(),timer=setTimeout(()=>ac.abort(),45_000);
  try{
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",signal:ac.signal,body:JSON.stringify({contents:[{role:"user",parts:[{inline_data:{mime_type:mimeFor(referencePath),data:b64}},{text:prompt}]}],generationConfig:{responseModalities:["IMAGE"],temperature:.35}})});
    if(!r.ok)throw new ImageUpstreamError(`Gemini image API HTTP ${r.status}: ${(await r.text()).slice(0,300)}`,r.status);
    const json=await r.json() as {candidates?:Array<{content?:{parts?:Array<{inline_data?:{data?:string}}>} }>};
    const data=json.candidates?.[0]?.content?.parts?.find(p=>p.inline_data?.data)?.inline_data?.data;if(!data)throw new ImageUpstreamError("Gemini returned no image",502);return{base64:data,mimeType:"image/png",model};
  }finally{clearTimeout(timer)}
}
async function editWithOpenAI(referencePath:string,prompt:string,model:string){
  if(model==="dall-e-3")throw new ImageUpstreamError("DALL-E 3 cannot preserve a supplied canonical identity. Select gpt-image-1 for campaign stills with a spokesperson.",400);
  const key=getImageApiKey(),bytes=await fs.readFile(referencePath),form=new FormData(),ac=new AbortController(),timer=setTimeout(()=>ac.abort(),45_000);form.append("model",model);form.append("image",new Blob([bytes]),"reference.png");form.append("prompt",prompt);form.append("n","1");form.append("size","1024x1536");form.append("input_fidelity","high");
  try{const r=await fetch("https://api.openai.com/v1/images/edits",{method:"POST",headers:{Authorization:`Bearer ${key}`},body:form,signal:ac.signal});if(!r.ok)throw new ImageUpstreamError(`OpenAI image API HTTP ${r.status}: ${(await r.text()).slice(0,300)}`,r.status);const json=await r.json() as {data?:Array<{b64_json?:string}>};const data=json.data?.[0]?.b64_json;if(!data)throw new ImageUpstreamError("OpenAI returned no image",502);return{base64:data,mimeType:"image/png",model};}finally{clearTimeout(timer)}
}

export async function generateCampaignStill(input:{prompt:string;avatarId?:string|null}){
  const prompt=`Create one campaign-ready vertical social-media still. ${input.prompt}\nPhotorealistic unless the creative direction explicitly requests another style. No fabricated legal results, settlement amounts, testimonials, injuries, statistics, logos, or text artifacts.`;
  let result:{base64:string;mimeType:string;model:string};
  if(input.avatarId){
    const avatar=db.prepare("SELECT id,name,reference_image_path,wardrobe_regeneration_prompt FROM avatars WHERE id=?").get(input.avatarId) as {id:string;name:string;reference_image_path:string|null;wardrobe_regeneration_prompt:string|null}|undefined;
    if(!avatar)throw new Error("Selected canonical avatar was not found");
    const front=db.prepare("SELECT file_path,status FROM avatar_views WHERE avatar_id=? AND view='front'").get(input.avatarId) as {file_path:string|null;status:string}|undefined;
    let reference=front?.status==="ready"&&front.file_path?front.file_path:avatar.reference_image_path;
    if(!reference)throw new Error(`${avatar.name} has no usable identity image`);
    if(front?.status!=="ready"&&avatar.wardrobe_regeneration_prompt)throw new Error(`${avatar.name} requires a campaign-safe canonical front view before image/video production. Generate or upload the professional front view in Avatars first.`);
    const provider=getImageProvider(),model=getImageModel();
    if(provider==="xai")throw new ImageUpstreamError("The selected xAI image provider cannot edit a canonical reference. Choose Gemini or OpenAI in Avatars image settings for identity-preserving campaign stills.",400);
    if(provider==="mock")throw new ImageUpstreamError("Mock image mode cannot produce a campaign-ready identity-preserving still.",400);
    reference=resolveReferencePath(reference);
    result=provider==="openai"?await editWithOpenAI(reference,prompt,model):await editWithGemini(reference,prompt,model);
  }else{
    const fresh=await generateAvatarImage({prompt});result={base64:fresh.base64,mimeType:fresh.mimeType,model:fresh.model};
  }
  const saved=await saveGeneratedImage({base64:result.base64,source:"campaign-still",model:result.model,prompt,mimeType:result.mimeType});
  return{...result,assetId:saved.id,assetUrl:saved.url};
}
