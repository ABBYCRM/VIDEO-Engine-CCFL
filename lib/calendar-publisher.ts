import { db } from "@/lib/db";
import { publishInstagram } from "@/lib/instagram-publish";
import { publishWebsite } from "@/lib/site-publish";
import { publicCaptionForSlot, isOperatorCopy } from "@/lib/public-copy";
import "@/lib/calendar-assets";
import { verifyPublishedInstagramOnce } from "@/lib/publish-verify";
import { isYouTubeConnected, uploadYouTubeShort } from "@/lib/youtube";
import { getPersistentLibraryAsset } from "@/lib/persistent-library";

let started=false;
let running=false;
const PUBLISH_LOCK_MS = 15 * 60 * 1000;

export function claimInstagramPublish(postId:string){
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PUBLISH_LOCK_MS).toISOString();
  const result = db.prepare("UPDATE scheduled_posts SET publishing_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND (publishing_at IS NULL OR publishing_at<?)").run(now.toISOString(),postId,staleBefore);
  return result.changes > 0;
}

export function releaseInstagramPublish(postId:string){
  db.prepare("UPDATE scheduled_posts SET publishing_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(postId);
}

/** Resume safely after a partial Reel/Story publish: each remote media id is persisted immediately. */
export async function publishInstagramPair(post:any){
  if(post.generation_status&&post.generation_status!=="ready")throw new Error("Media is "+post.generation_status+"; it is not ready to publish");
  if(!post.video_job_id&&!post.media_url)throw new Error("Auto-post requires generated media");
  let reel:any = post.instagram_reel_id ? { mediaId:post.instagram_reel_id,resumed:true } : null;
  let story:any = post.instagram_story_id ? { mediaId:post.instagram_story_id,resumed:true } : null;
  if(!post.instagram_reel_id){
    reel=await publishInstagram({jobId:post.video_job_id,mediaUrl:post.media_url,mediaType:post.media_type,caption:post.caption,postType:"feed"});
    const id=String(reel.mediaId||reel.creationId||"");
    if(!id)throw new Error("Instagram Reel publish completed without a media id");
    db.prepare("UPDATE scheduled_posts SET instagram_reel_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id,post.id);
    post.instagram_reel_id=id;
  }
  // Still-image slots publish to the feed only. Stills are composed 2:3 for the feed;
  // Instagram center-crops Stories to 9:16 and chops the layout, so only video slots
  // (which are already 9:16) get the companion Story.
  const isStillImage=post.content_type==="image"||String(post.media_type||"").startsWith("image");
  if(!post.instagram_story_id&&!isStillImage){
    story=await publishInstagram({jobId:post.video_job_id,mediaUrl:post.media_url,mediaType:post.media_type,caption:post.caption,postType:"story"});
    const id=String(story.mediaId||story.creationId||"");
    if(!id)throw new Error("Instagram Story publish completed without a media id");
    db.prepare("UPDATE scheduled_posts SET instagram_story_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id,post.id);
    post.instagram_story_id=id;
  }
  return {reel,story};
}

/** Mirror every published Reel to YouTube as a Short. Never blocks or fails the
 *  Instagram publish: a YouTube failure is recorded on the slot and retried on
 *  the next publisher pass only if the slot itself republishes. */
async function maybePublishYouTubeShort(post:any){
  const isStillImage=post.content_type==="image"||String(post.media_type||"").startsWith("image");
  if(isStillImage||post.youtube_video_id||!isYouTubeConnected())return;
  try{
    const match=/^\/api\/library\/assets\/([^/]+)\/file(?:\?.*)?$/.exec(String(post.media_url||""));
    if(!match)throw new Error("YouTube upload needs a library video asset");
    const asset=await getPersistentLibraryAsset(decodeURIComponent(match[1]));
    if(!asset)throw new Error("Library asset not found for YouTube upload");
    const videoId=await uploadYouTubeShort({bytes:asset.bytes,mimeType:asset.mimeType||"video/mp4",caption:String(post.caption||"").trim()});
    db.prepare("UPDATE scheduled_posts SET youtube_video_id=?,youtube_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(videoId,post.id);
    post.youtube_video_id=videoId;
  }catch(e){
    db.prepare("UPDATE scheduled_posts SET youtube_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run((e instanceof Error?e.message:String(e)).slice(0,2000),post.id);
  }
}

async function publishRow(post:any){
  if(post.network==="instagram"){const pair=await publishInstagramPair(post);await maybePublishYouTubeShort(post);return pair;}
  if(post.network==="website"){
    if(!post.site_id)throw new Error("Website auto-post item has no Site");
    if(post.generation_status&&post.generation_status!=="ready")throw new Error("Website draft is "+post.generation_status+"; it is not ready to publish");
    if(!String(post.content_body||"").trim())throw new Error("Website article body is empty");
    return publishWebsite({siteId:post.site_id,title:post.title,content:post.content_body,slug:post.slug||null,excerpt:(isOperatorCopy(post.caption||"")?publicCaptionForSlot({category:post.category||"car_accident",title:post.title}).caption:post.caption),metaTitle:post.seo_title||null,metaDescription:post.meta_description||null,focusKeyword:post.focus_keyword||null,featuredImageUrl:post.media_url||null});
  }
  throw new Error(post.network+" auto-post publisher is not connected");
}

export async function runCalendarPublisherOnce(){
  if(running)return{processed:0};running=true;let processed=0;
  try{
    const rows=db.prepare("SELECT * FROM scheduled_posts WHERE auto_post=1 AND status='approved' AND scheduled_at<=? AND (generation_status IS NULL OR generation_status='ready') ORDER BY scheduled_at ASC LIMIT 10").all(new Date().toISOString()) as any[];
    for(const post of rows){
      if(post.network==="instagram"&&!claimInstagramPublish(post.id))continue;
      try{await publishRow(post);db.prepare("UPDATE scheduled_posts SET status='published',published_at=?,error=NULL,publishing_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(new Date().toISOString(),post.id);}
      catch(e){releaseInstagramPublish(post.id);db.prepare("UPDATE scheduled_posts SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run((e instanceof Error?e.message:String(e)).slice(0,2000),post.id);}
      processed++;
    }
    if(processed>0)setTimeout(()=>{void verifyPublishedInstagramOnce();},20_000).unref?.();
    return{processed};
  }finally{running=false;}
}

export function startCalendarPublisherLoop(){
  if(started||process.env.NODE_ENV==="test")return;started=true;
  setInterval(()=>{void runCalendarPublisherOnce();},60_000).unref?.();
  setInterval(()=>{void verifyPublishedInstagramOnce();},120_000).unref?.();
  setTimeout(()=>{void runCalendarPublisherOnce();},5_000).unref?.();
}
