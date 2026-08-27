import { db } from "@/lib/db";
import { type AvatarView } from "@/lib/avatars";
import * as legacy from "@/lib/avatar-generation/client";

export type AvatarImageProvider="nvidia"|legacy.ImageProvider;
const KEY="avatar_image_provider";

function raw(){return (db.prepare("SELECT value FROM settings WHERE key=?").get(KEY) as {value:string}|undefined)?.value||null;}
function save(value:string){db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(KEY,value);}

export function getAvatarImageProvider():AvatarImageProvider{
  const value=raw();
  if(value==="nvidia")return "nvidia";
  if(value==="gemini"||value==="openai"||value==="xai"||value==="a2e"||value==="hedra"||value==="mock")return value;
  return legacy.getImageProvider();
}
export function setAvatarImageProvider(provider:AvatarImageProvider){save(provider);if(provider!=="nvidia")legacy.setImageProvider(provider);}
export function getAvatarImageModel(){return getAvatarImageProvider()==="nvidia"?"black-forest-labs/flux.2-klein-4b":legacy.getImageModel();}
export function listAvatarImageModelChoices(){return getAvatarImageProvider()==="nvidia"?["black-forest-labs/flux.2-klein-4b"]:legacy.listImageModelChoices();}
export function isAvatarImageProviderConfigured(){
  if(getAvatarImageProvider()==="nvidia")return Boolean(process.env.NVIDIA_API_KEY);
  return legacy.isImageProviderConfigured();
}
export function saveAvatarImageApiKey(value:string){
  if(getAvatarImageProvider()==="nvidia")throw new Error("NVIDIA uses the server-side NVIDIA_API_KEY environment variable. Configure it in DigitalOcean rather than pasting it here.");
  legacy.saveImageApiKey(value);
}
export function setAvatarImageModel(model:string){
  if(getAvatarImageProvider()==="nvidia"){
    if(model!=="black-forest-labs/flux.2-klein-4b")throw new Error("Invalid NVIDIA portrait model");
    return;
  }
  legacy.setImageModel(model);
}
export function listAvatarImageProviders(){return [
  {
    id:"nvidia" as const,
    label:"NVIDIA FLUX.2 Klein 4B",
    envVar:"NVIDIA_API_KEY",
    help:"Hosted NVIDIA endpoint can generate fresh portraits, but the live API rejects arbitrary base64 reference-image edits. Do not use it for canonical 4-view identity turnaround.",
    models:["black-forest-labs/flux.2-klein-4b"],
    supportsTurnaround:false
  },
  ...legacy.listImageProviders().map(p=>({
    ...p,
    models: legacy.listImageModelsFor(p.id),
    supportsTurnaround:p.id==="gemini"||p.id==="a2e"||p.id==="openai"||p.id==="hedra"||p.id==="mock"
  }))
];}
export async function startAvatarTurnaround(id:string,opts:{views?:AvatarView[]}={}){
  const provider=getAvatarImageProvider();
  if(provider==="nvidia")throw new Error("NVIDIA FLUX.2 hosted API cannot edit your uploaded reference image for the canonical 4-view turnaround. Choose Hedra, Gemini, or OpenAI for Generate all 4; NVIDIA remains available for generating a fresh portrait reference.");
  if(provider==="xai")throw new Error("xAI Grok Imagine does not support reference-image editing for the canonical 4-view turnaround. Choose Hedra, Gemini, or OpenAI.");
  return legacy.startTurnaround(id,opts);
}
