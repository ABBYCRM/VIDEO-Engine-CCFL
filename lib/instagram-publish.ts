import { getComposio } from "@/lib/composio/client";
import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/publish-media";

function pickId(value:any):string|null{return value?.data?.id||value?.data?.data?.id||value?.id||value?.creation_id||value?.data?.creation_id||null;}
function absoluteMediaUrl(url:string){if(/^https?:\/\//i.test(url))return url;const base=(process.env.PUBLIC_BASE_URL||"").replace(/\/$/,"");if(!base)throw new Error("PUBLIC_BASE_URL is required for social publishing");return `${base}${url.startsWith("/")?url:`/${url}`}`;}
export async function publishInstagram(input:{jobId?:string|null;mediaUrl?:string|null;mediaType?:string|null;caption?:string}){
  const caption=String(input.caption||"").trim().slice(0,2200); let mediaUrl=input.mediaUrl?absoluteMediaUrl(input.mediaUrl):null; let mediaType=input.mediaType||null;
  if(input.jobId){const job=db.prepare("SELECT id,status FROM video_jobs WHERE id=?").get(input.jobId) as {id:string;status:string}|undefined;if(!job||job.status!=="succeeded")throw new Error("Video must finish before publishing");mediaUrl=publicMediaUrl(input.jobId);mediaType="video/mp4";}
  if(!mediaUrl)throw new Error("A generated media asset is required before publishing");
  const composio:any=getComposio(),userId="admin",toolOptions={dangerouslySkipVersionCheck:true};const info=await composio.tools.execute("INSTAGRAM_GET_USER_INFO",{userId,arguments:{}},toolOptions),igUserId=pickId(info);if(!igUserId)throw new Error("Could not resolve the connected Instagram Business/Creator account id. Reconnect Instagram in Integrations.");
  const isVideo=String(mediaType||"").startsWith("video/"); const args:any={ig_user_id:igUserId,caption}; if(isVideo){args.video_url=mediaUrl;args.media_type="REELS";}else args.image_url=mediaUrl;
  const created=await composio.tools.execute("INSTAGRAM_POST_IG_USER_MEDIA",{userId,arguments:args},toolOptions),creationId=pickId(created);if(!creationId)throw new Error("Instagram media container was created without a creation id");
  const published=await composio.tools.execute("INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH",{userId,arguments:{ig_user_id:igUserId,creation_id:creationId}},toolOptions);return{creationId,mediaId:pickId(published),result:published};
}
