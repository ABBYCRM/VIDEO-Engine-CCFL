import { getSite, getSitePublishingSecret } from "@/lib/sites";

export async function publishWebsite(input:{siteId:string;title:string;content:string;slug?:string|null}){
  const site=getSite(input.siteId); if(!site) throw new Error("Site not found");
  if(!site.publishConfigured||!site.publishEndpoint) throw new Error("Website publisher is not configured. Open Sites → Configure and add the CMS publishing connection.");
  const secret=getSitePublishingSecret(site.id); if(!secret) throw new Error("Website publishing secret is missing");
  if(site.publishMode==="wordpress-rest"){
    if(!site.publishUsername) throw new Error("WordPress publishing username is missing");
    const auth=Buffer.from(`${site.publishUsername}:${secret}`).toString("base64");
    const r=await fetch(site.publishEndpoint,{method:"POST",headers:{"content-type":"application/json","authorization":`Basic ${auth}`},body:JSON.stringify({title:input.title,content:input.content,status:"publish",slug:input.slug||undefined}),cache:"no-store"});
    const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(`WordPress publish HTTP ${r.status}: ${String(d?.message||JSON.stringify(d)).slice(0,400)}`);
    return {provider:"wordpress",id:d?.id||null,url:d?.link||null,result:d};
  }
  if(site.publishMode==="webhook"){
    const r=await fetch(site.publishEndpoint,{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${secret}`},body:JSON.stringify({siteId:site.id,siteUrl:site.url,title:input.title,content:input.content,slug:input.slug||null,publish:true}),cache:"no-store"});
    const text=await r.text(); if(!r.ok) throw new Error(`Website webhook HTTP ${r.status}: ${text.slice(0,400)}`);
    let result:any=text; try{result=JSON.parse(text)}catch{}
    return {provider:"webhook",result};
  }
  throw new Error("Choose WordPress REST or Custom webhook as the publishing mode in Sites.");
}
