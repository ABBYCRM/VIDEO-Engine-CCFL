import dns from "node:dns/promises";
import net from "node:net";
import { chatCompletion, getNvidiaModel } from "@/lib/nvidia/client";

export type SiteResearch = {
  siteName:string; language:string; targetAudience:string; brandVoice:string; topicFocus:string; keywords:string;
  articleLength:"short"|"medium"|"long"|"pillar"; cadence:"daily"|"3-week"|"weekly"; cta:string;
  internalLinking:boolean; externalLinks:boolean; imageStyle:string; imageAspectRatio:string;
  cms:"wordpress"|"shopify"|"webflow"|"wix"|"ghost"|"hubspot"|"nextjs"|"custom";
  summary:string; pagesAnalyzed:string[];
};

function isPrivateIp(ip:string){
  if(net.isIP(ip)===4){const p=ip.split(".").map(Number);return p[0]===10||p[0]===127||p[0]===0||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168);}
  const v=ip.toLowerCase();return v==="::1"||v.startsWith("fc")||v.startsWith("fd")||v.startsWith("fe80:");
}

export async function validatePublicWebsite(raw:string){
  let url:URL;try{url=new URL(raw.trim());}catch{throw new Error("Enter a full website URL, for example https://example.com.");}
  if(!["http:","https:"].includes(url.protocol))throw new Error("Website URL must start with http:// or https://.");
  if(url.username||url.password)throw new Error("Website URLs with embedded credentials are not supported.");
  const host=url.hostname.toLowerCase();if(host==="localhost"||host.endsWith(".localhost"))throw new Error("Local/private websites cannot be researched from the hosted app.");
  const addresses=await dns.lookup(host,{all:true}).catch(()=>[]);if(!addresses.length)throw new Error("The website hostname could not be resolved.");
  if(addresses.some(a=>isPrivateIp(a.address)))throw new Error("Private-network websites cannot be researched from the hosted app.");
  url.hash="";return url;
}

function textFromHtml(html:string){return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim();}
function linksFromHtml(html:string,base:URL){const found:string[]=[];for(const m of html.matchAll(/href=["']([^"'#]+)["']/gi)){try{const u=new URL(m[1],base);if(u.origin===base.origin&&["http:","https:"].includes(u.protocol)){u.hash="";u.search="";if(!/\.(?:jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mov|mp3)$/i.test(u.pathname))found.push(u.toString());}}catch{}}return [...new Set(found)];}
async function fetchPage(url:URL){const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),8000);try{const r=await fetch(url,{headers:{"user-agent":"VIDEO-Engine Site Research/1.0"},redirect:"follow",cache:"no-store",signal:ac.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);const type=r.headers.get("content-type")||"";if(!type.includes("text/html"))throw new Error("not HTML");const html=(await r.text()).slice(0,1_500_000);return {text:textFromHtml(html).slice(0,18000),links:linksFromHtml(html,url)};}finally{clearTimeout(timer);}}

export async function researchWebsite(rawUrl:string):Promise<SiteResearch>{
  const root=await validatePublicWebsite(rawUrl);root.pathname=root.pathname||"/";root.search="";
  const queue=[root.toString()];const visited=new Set<string>();const pages:Array<{url:string;text:string}>=[];
  while(queue.length&&pages.length<6){const next=queue.shift()!;if(visited.has(next))continue;visited.add(next);try{const u=await validatePublicWebsite(next);if(u.origin!==root.origin)continue;const page=await fetchPage(u);if(page.text.length>120)pages.push({url:u.toString(),text:page.text});for(const link of page.links){if(queue.length>24)break;if(!visited.has(link))queue.push(link);}}catch{}}
  if(!pages.length)throw new Error("I could not read this website. Confirm it is public and reachable, then try again.");
  const corpus=pages.map((p,i)=>`PAGE ${i+1}: ${p.url}\n${p.text}`).join("\n\n").slice(0,65000);
  const model=getNvidiaModel();const response=await chatCompletion({model,jsonMode:true,temperature:0.25,maxTokens:2200,messages:[
    {role:"system",content:"You are an SEO strategist onboarding a real website into an autonomous blog system. Infer only from supplied site content. Return valid JSON only. Do not invent awards, results, claims, locations, credentials, or services. Choose sensible defaults so the owner does not have to answer setup questions."},
    {role:"user",content:`Analyze this website crawl and return: {"siteName":"","language":"en","targetAudience":"","brandVoice":"","topicFocus":"","keywords":"comma-separated","articleLength":"short|medium|long|pillar","cadence":"daily|3-week|weekly","cta":"","internalLinking":true,"externalLinks":true,"imageStyle":"hyper-realistic|editorial photography|cinematic photography|clean commercial|documentary|3D render|digital illustration|minimal graphic|no image","imageAspectRatio":"16:9|4:3|1:1|3:2","cms":"wordpress|shopify|webflow|wix|ghost|hubspot|nextjs|custom","summary":"2-4 sentence explanation"}. Detect CMS only when evidence supports it; otherwise use custom. Favor owner-review-safe editorial defaults and useful evergreen SEO.\n\n${corpus}`}
  ]});
  let x:any;try{x=JSON.parse(response.text.replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/,""));}catch{throw new Error("AI site analysis returned invalid JSON. Please retry.");}
  const one=(v:any,n:number)=>String(v||"").trim().slice(0,n);const article=["short","medium","long","pillar"].includes(x.articleLength)?x.articleLength:"long";const cadence=["daily","3-week","weekly"].includes(x.cadence)?x.cadence:"weekly";const styles=["hyper-realistic","editorial photography","cinematic photography","clean commercial","documentary","3D render","digital illustration","minimal graphic","no image"];const ratios=["16:9","4:3","1:1","3:2"];const cms=["wordpress","shopify","webflow","wix","ghost","hubspot","nextjs","custom"].includes(x.cms)?x.cms:"custom";
  return {siteName:one(x.siteName,120)||root.hostname,language:one(x.language,20)||"en",targetAudience:one(x.targetAudience,2000),brandVoice:one(x.brandVoice,3000)||"authoritative, useful, natural",topicFocus:one(x.topicFocus,3000),keywords:one(x.keywords,3000),articleLength:article,cadence,cta:one(x.cta,2000),internalLinking:x.internalLinking!==false,externalLinks:x.externalLinks!==false,imageStyle:styles.includes(x.imageStyle)?x.imageStyle:"editorial photography",imageAspectRatio:ratios.includes(x.imageAspectRatio)?x.imageAspectRatio:"16:9",cms,summary:one(x.summary,1500),pagesAnalyzed:pages.map(p=>p.url)} as SiteResearch;
}
