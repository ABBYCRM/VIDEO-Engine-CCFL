import { markBridgeSeen } from "@/lib/sites";

export async function GET(req:Request){
  const url=new URL(req.url); const key=url.searchParams.get("key")||"";
  if(key) markBridgeSeen(key,req.headers.get("referer"));
  const body=`(()=>{window.__VIDEO_ENGINE_SITE__={connected:true,seenAt:new Date().toISOString()};})();`;
  return new Response(body,{headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*"}});
}
