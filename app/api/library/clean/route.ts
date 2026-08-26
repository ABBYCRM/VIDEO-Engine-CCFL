import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listLibraryTextOverrides, setLibraryTextOverride } from "@/lib/library-overrides";
import { listGeneratedImages } from "@/lib/media-library";
import { chatCompletion, getNvidiaModel } from "@/lib/nvidia/client";
import { listPersistentLibraryAssets } from "@/lib/persistent-library";

type CleanableAsset={id:string;kind:string;title:string;label:string;model:string|null;prompt:string|null;createdAt:string};
type CleanResult={id:string;title:string;label:string};

function fallbackCopy(asset:CleanableAsset):Omit<CleanResult,"id">{
  const parsed=new Date(asset.createdAt),date=Number.isNaN(parsed.getTime())?"Unknown date":new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(parsed);
  const names:Record<string,string>={composition:"Split-screen video",video:"Campaign video",generated:"Generated image"};
  const labels:Record<string,string>={composition:"Personal injury video",video:"Case Closed FL video",generated:"Case Closed FL visual"};
  return{title:`${names[asset.kind]||"Library asset"} · ${date}`.slice(0,60),label:labels[asset.kind]||"Case Closed FL content"};
}

async function cleanCopy(asset:CleanableAsset):Promise<Omit<CleanResult,"id">>{
  const fallback=fallbackCopy(asset);
  try{
    const response=await chatCompletion({model:getNvidiaModel(),temperature:0.2,maxTokens:180,jsonMode:true,messages:[
      {role:"system",content:"Rewrite library metadata for the personal-injury law firm Case Closed FL. Return ONLY a JSON object with exactly two string keys: title and label. The title must be 60 characters or fewer. The label must be a short, useful content-type label. Be professional and specific, with no hype, emojis, or hashtags. Never copy or include raw AI prompt text. Do not invent case facts, outcomes, statistics, or legal claims."},
      {role:"user",content:`Clean this library item's writing:\n${JSON.stringify({title:asset.title,label:asset.label,model:asset.model,promptSnippet:asset.prompt?.slice(0,500)||null,createdAt:asset.createdAt})}`}
    ]});
    const parsed=JSON.parse(response.text.trim()) as unknown;
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("Invalid JSON object");
    const record=parsed as Record<string,unknown>,keys=Object.keys(record);
    if(keys.length!==2||!keys.includes("title")||!keys.includes("label")||typeof record.title!=="string"||typeof record.label!=="string")throw new Error("Invalid clean-copy shape");
    const title=record.title.trim(),label=record.label.trim();
    if(!title||title.length>60||!label||label.length>50||title.includes("#")||label.includes("#")||/[\r\n]/.test(title+label))throw new Error("Invalid clean-copy values");
    return{title,label};
  }catch{return fallback}
}

export async function POST(request:Request){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  let body:unknown={};try{body=await request.json()}catch{return NextResponse.json({error:"Invalid JSON body"},{status:400})}
  if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({error:"Body must be an object"},{status:400});
  const requested=(body as {assetIds?:unknown}).assetIds;
  if(requested!==undefined&&(!Array.isArray(requested)||requested.some(id=>typeof id!=="string")))return NextResponse.json({error:"assetIds must be an array of strings"},{status:400});
  const persistent=(await listPersistentLibraryAssets().catch(()=>[])).map(asset=>({id:asset.id,kind:asset.kind,title:asset.title,label:asset.label,model:asset.model||null,prompt:asset.prompt||null,createdAt:asset.createdAt}));
  const generated=listGeneratedImages().map(image=>({id:`generated:${image.id}`,kind:"generated",title:image.model||"Generated image",label:image.source==="nvidia-avatar"?"Generated avatar":image.source,model:image.model,prompt:image.prompt,createdAt:image.createdAt}));
  const videos=(db.prepare("SELECT id,category,provider,model,prompt,created_at,updated_at FROM video_jobs WHERE status='succeeded' AND output_path IS NOT NULL ORDER BY updated_at DESC").all() as Array<any>).map(v=>({id:`video:${v.id}`,kind:"video",title:`${String(v.provider||"AI").toUpperCase()} generated video`,label:`${String(v.category||"campaign").replaceAll("_"," ")} video`,model:v.model||v.provider||null,prompt:v.prompt||null,createdAt:v.updated_at||v.created_at}));
  let compositions:Array<CleanableAsset>=[];try{compositions=(db.prepare("SELECT id,title,split_percent,created_at FROM generated_compositions ORDER BY created_at DESC").all() as Array<any>).map(c=>({id:`composition:${c.id}`,kind:"composition",title:c.title,label:`Split-screen · ${c.split_percent}% top`,model:"browser composition",prompt:null,createdAt:c.created_at}))}catch{}
  const deduped=new Map<string,CleanableAsset>();for(const asset of [...persistent,...generated,...videos,...compositions])if(!deduped.has(asset.id))deduped.set(asset.id,asset);
  const overrides=new Map(listLibraryTextOverrides().map(item=>[item.assetId,item]));for(const [id,asset]of deduped){const override=overrides.get(id);if(override)deduped.set(id,{...asset,title:override.title,label:override.label,prompt:override.hidePrompt?null:asset.prompt})}
  const ids=requested as string[]|undefined,candidates=[...deduped.values()].filter(asset=>ids?ids.includes(asset.id):["video","composition","generated"].includes(asset.kind));
  const results=await Promise.all(candidates.map(async asset=>{const copy=await cleanCopy(asset);setLibraryTextOverride({assetId:asset.id,title:copy.title,label:copy.label,hidePrompt:true});return{id:asset.id,...copy}}));
  return NextResponse.json({cleaned:results.length,results});
}