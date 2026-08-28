import { getSite, getSitePublishingSecret } from "@/lib/sites";

function escapeHtml(value:string){return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function inlineMarkdown(value:string){
  let out=escapeHtml(value);
  out=out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" rel="noopener noreferrer">$1</a>');
  out=out.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/\*([^*]+)\*/g,"<em>$1</em>");
  return out;
}
export function markdownToHtml(markdown:string){
  const lines=markdown.replace(/\r/g,"").split("\n");const html:string[]=[];let list:"ul"|"ol"|null=null;
  const closeList=()=>{if(list){html.push(`</${list}>`);list=null;}};
  for(const raw of lines){const line=raw.trim();if(!line){closeList();continue;}
    const heading=line.match(/^(#{2,4})\s+(.+)$/);if(heading){closeList();const level=heading[1].length;html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);continue;}
    const bullet=line.match(/^[-*]\s+(.+)$/);if(bullet){if(list!=="ul"){closeList();list="ul";html.push("<ul>");}html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);continue;}
    const numbered=line.match(/^\d+[.)]\s+(.+)$/);if(numbered){if(list!=="ol"){closeList();list="ol";html.push("<ol>");}html.push(`<li>${inlineMarkdown(numbered[1])}</li>`);continue;}
    closeList();html.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  closeList();return html.join("\n");
}

function authHeaders(username:string|null,secret:string){
  if(username)return {"authorization":`Basic ${Buffer.from(`${username}:${secret}`).toString("base64")}`};
  return {"authorization":`Bearer ${secret}`};
}
function absoluteMediaUrl(url:string|null|undefined){
  if(!url)return null;if(/^https?:\/\//i.test(url))return url;
  const base=(process.env.PUBLIC_BASE_URL||"").replace(/\/$/,"");return base?`${base}${url.startsWith("/")?url:`/${url}`}`:null;
}
async function uploadWordPressMedia(endpoint:string,auth:Record<string,string>,mediaUrl:string){
  const source=await fetch(mediaUrl,{cache:"no-store"});if(!source.ok)throw new Error(`Feature image download HTTP ${source.status}`);
  const bytes=Buffer.from(await source.arrayBuffer());const contentType=source.headers.get("content-type")||"image/png";const ext=contentType.includes("jpeg")?"jpg":contentType.includes("webp")?"webp":"png";
  const postUrl=new URL(endpoint);postUrl.pathname=postUrl.pathname.replace(/\/posts\/?$/,"/media");
  const r=await fetch(postUrl,{method:"POST",headers:{...auth,"content-type":contentType,"content-disposition":`attachment; filename="video-engine-feature.${ext}"`},body:bytes,cache:"no-store"});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`WordPress media HTTP ${r.status}: ${String(d?.message||JSON.stringify(d)).slice(0,400)}`);return d?.id?Number(d.id):null;
}

export async function publishWebsite(input:{siteId:string;title:string;content:string;slug?:string|null;excerpt?:string|null;metaTitle?:string|null;metaDescription?:string|null;focusKeyword?:string|null;featuredImageUrl?:string|null}){
  const site=getSite(input.siteId); if(!site) throw new Error("Site not found");
  if(!site.publishConfigured||!site.publishEndpoint) throw new Error("Website publisher is not configured. Open Sites → Configure and add the CMS publishing connection.");
  const secret=getSitePublishingSecret(site.id); if(!secret) throw new Error("Website publishing secret is missing");
  if(site.publishMode==="wordpress-rest"){
    if(!site.publishUsername) throw new Error("WordPress publishing username is missing");
    const auth=authHeaders(site.publishUsername,secret);let featuredMedia:number|null=null;const mediaUrl=absoluteMediaUrl(input.featuredImageUrl);
    if(input.featuredImageUrl&&!mediaUrl)throw new Error("PUBLIC_BASE_URL is required to publish the generated WordPress feature image");
    if(mediaUrl)featuredMedia=await uploadWordPressMedia(site.publishEndpoint,auth,mediaUrl);
    const r=await fetch(site.publishEndpoint,{method:"POST",headers:{"content-type":"application/json",...auth},body:JSON.stringify({title:input.metaTitle||input.title,content:markdownToHtml(input.content),excerpt:input.metaDescription||input.excerpt||undefined,status:"publish",slug:input.slug||undefined,featured_media:featuredMedia||undefined}),cache:"no-store"});
    const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(`WordPress publish HTTP ${r.status}: ${String(d?.message||JSON.stringify(d)).slice(0,400)}`);
    return {provider:"wordpress",id:d?.id||null,url:d?.link||null,featuredMedia,result:d};
  }
  if(site.publishMode==="shopify"){
    // publishEndpoint is the full articles.json URL for one blog, e.g.
    // https://{shop}.myshopify.com/admin/api/2024-10/blogs/{blog_id}/articles.json
    // publishSecret is the Shopify Admin API access token (shpat_...).
    const auth={"x-shopify-access-token":secret};
    const r=await fetch(site.publishEndpoint,{method:"POST",headers:{"content-type":"application/json",...auth},body:JSON.stringify({article:{title:input.metaTitle||input.title,body_html:markdownToHtml(input.content),summary_html:input.metaDescription||input.excerpt||undefined,handle:input.slug||undefined,published:true,tags:input.focusKeyword||undefined,image:absoluteMediaUrl(input.featuredImageUrl)?{src:absoluteMediaUrl(input.featuredImageUrl)}:undefined}}),cache:"no-store"});
    const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(`Shopify publish HTTP ${r.status}: ${String(d?.errors?JSON.stringify(d.errors):JSON.stringify(d)).slice(0,400)}`);
    return {provider:"shopify",id:d?.article?.id||null,url:d?.article?.handle?`${new URL(site.publishEndpoint).origin.replace(/\.myshopify\.com$/,".myshopify.com")}/blogs/news/${d.article.handle}`:null,result:d};
  }
  if(site.publishMode==="webflow"){
    // publishEndpoint is the full collection items URL, e.g.
    // https://api.webflow.com/v2/collections/{collection_id}/items
    // publishSecret is a Webflow site/API token. Field slugs below match the
    // default Webflow blog-template collection ("name","slug","post-body",
    // "post-summary","main-image"); a site using custom field slugs needs
    // its own mapping, same as any CMS integration.
    const auth={"authorization":`Bearer ${secret}`};
    const image=absoluteMediaUrl(input.featuredImageUrl);
    const r=await fetch(site.publishEndpoint,{method:"POST",headers:{"content-type":"application/json",...auth},body:JSON.stringify({isArchived:false,isDraft:false,fieldData:{name:input.metaTitle||input.title,slug:input.slug||undefined,"post-body":markdownToHtml(input.content),"post-summary":input.metaDescription||input.excerpt||undefined,...(image?{"main-image":{url:image}}:{})}}),cache:"no-store"});
    const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(`Webflow publish HTTP ${r.status}: ${String(d?.message||JSON.stringify(d)).slice(0,400)}`);
    return {provider:"webflow",id:d?.id||null,url:null,result:d};
  }
  if(site.publishMode==="webhook"){
    const r=await fetch(site.publishEndpoint,{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${secret}`},body:JSON.stringify({siteId:site.id,siteUrl:site.url,title:input.title,contentMarkdown:input.content,contentHtml:markdownToHtml(input.content),slug:input.slug||null,excerpt:input.excerpt||null,seo:{title:input.metaTitle||null,description:input.metaDescription||null,focusKeyword:input.focusKeyword||null},featuredImageUrl:absoluteMediaUrl(input.featuredImageUrl)||input.featuredImageUrl||null,publish:true}),cache:"no-store"});
    const text=await r.text(); if(!r.ok) throw new Error(`Website webhook HTTP ${r.status}: ${text.slice(0,400)}`);
    let result:any=text; try{result=JSON.parse(text)}catch{}
    return {provider:"webhook",result};
  }
  throw new Error("Choose WordPress REST, Shopify, Webflow, or Custom webhook as the publishing mode in Sites.");
}
