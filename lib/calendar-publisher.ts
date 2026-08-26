import { db } from "@/lib/db";
import { publishInstagram } from "@/lib/instagram-publish";
import { publishWebsite } from "@/lib/site-publish";
import { publicCaptionForSlot, isOperatorCopy } from "@/lib/public-copy";
import "@/lib/calendar-assets";
import { verifyPublishedInstagramOnce } from "@/lib/publish-verify";
import { isYouTubeConnected, uploadYouTubeShort } from "@/lib/youtube";
import { getPersistentLibraryAsset, savePersistentLibraryAsset } from "@/lib/persistent-library";
import { spawn } from "node:child_process";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";

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
function waveHasVideoSlot(post:any){
  const row=db.prepare("SELECT COUNT(*) as c FROM scheduled_posts WHERE scheduled_at=? AND id<>? AND network='instagram' AND content_type<>'image' AND status='approved'").get(post.scheduled_at,post.id) as {c:number};
  return row.c>0;
}

function runFfmpegOnce(args:string[]){
  const bin=process.env.FFMPEG_PATH||"ffmpeg";
  return new Promise<void>((resolve,reject)=>{
    const child=spawn(bin,args,{stdio:["ignore","pipe","pipe"]});
    let err="";
    child.stderr.on("data",d=>{err+=String(d);});
    child.on("error",reject);
    child.on("close",code=>code===0?resolve():reject(new Error(`ffmpeg exited ${code}: ${err.slice(-400)}`)));
  });
}

/** Re-frame the 2:3 feed still as a 1080x1920 Story image: blurred cover
 *  background with the full still centered on top. Saved to the persistent
 *  library under a deterministic id so publish retries reuse it. */
async function ensureStillStoryAsset(post:any):Promise<string>{
  const match=/^\/api\/library\/assets\/([^/]+)\/file(?:\?.*)?$/.exec(String(post.media_url||""));
  if(!match)throw new Error("Story publish needs a library still asset");
  const asset=await getPersistentLibraryAsset(decodeURIComponent(match[1]));
  if(!asset)throw new Error("Library asset not found for the story variant");
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),"story-"));
  const ext=String(asset.mimeType||"").includes("png")?"png":"jpg";
  const inPath=path.join(dir,`in.${ext}`);
  const outPath=path.join(dir,"out.jpg");
  try{
    await fsp.writeFile(inPath,asset.bytes);
    await runFfmpegOnce(["-y","-i",inPath,
      "-filter_complex",
      "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=40:5[bg];[0:v]scale=1000:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2",
      "-frames:v","1","-q:v","3",outPath]);
    const bytes=await fsp.readFile(outPath);
    const url=await savePersistentLibraryAsset({
      id:`${post.id}-story-9x16`,
      kind:"calendar-story",
      mediaType:"image",
      label:"Story 9:16",
      title:`${post.title||"Calendar still"} (story)`,
      mimeType:"image/jpeg",
      bytes,
      model:"ffmpeg story re-frame"
    });
    if(!url)throw new Error("Persistent library is not configured; cannot host the story variant");
    return url;
  }finally{
    await fsp.rm(dir,{recursive:true,force:true}).catch(()=>{});
  }
}

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
  // Video slots mirror the reel as a 9:16 Story. Still slots mirror the feed
  // photo as a Story ONLY when no video slot shares the wave (the morning
  // still-only wave); at night the reel already provides the Story. The 2:3
  // feed still is re-framed onto a blurred 9:16 backdrop first, because
  // Instagram center-crops raw Story images and chops the layout.
  const isStillImage=post.content_type==="image"||String(post.media_type||"").startsWith("image");
  if(!post.instagram_story_id&&isStillImage&&!waveHasVideoSlot(post)){
    const storyUrl=await ensureStillStoryAsset(post);
    story=await publishInstagram({mediaUrl:storyUrl,mediaType:"image/jpeg",caption:post.caption,postType:"story"});
    const id=String(story.mediaId||story.creationId||"");
    if(!id)throw new Error("Instagram Story publish completed without a media id");
    db.prepare("UPDATE scheduled_posts SET instagram_story_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id,post.id);
    post.instagram_story_id=id;
  }
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

const YT_BACKFILL_PAUSE_KEY="youtube_backfill_paused_until";

/** Backfill: mirror every already-published reel to YouTube, oldest first,
 *  one per publisher pass. YouTube's default API quota only covers ~6
 *  uploads/day (videos.insert costs 1600 of 10000 units), so on a quota error
 *  we pause until just after the next UTC midnight and retry that reel first. */
async function backfillOneYouTubeShort(){
  if(!isYouTubeConnected())return;
  const paused=(db.prepare("SELECT value FROM settings WHERE key=?").get(YT_BACKFILL_PAUSE_KEY) as {value:string}|undefined)?.value;
  if(paused&&new Date(paused).getTime()>Date.now())return;
  const row=db.prepare("SELECT * FROM scheduled_posts WHERE network='instagram' AND content_type<>'image' AND instagram_reel_id IS NOT NULL AND (youtube_video_id IS NULL OR youtube_video_id='') AND (youtube_error IS NULL OR youtube_error='') AND media_url LIKE '/api/library/assets/%' ORDER BY scheduled_at ASC LIMIT 1").get() as any;
  if(!row)return;
  await maybePublishYouTubeShort(row);
  const err=String((db.prepare("SELECT youtube_error FROM scheduled_posts WHERE id=?").get(row.id) as any)?.youtube_error||"");
  if(/quota/i.test(err)){
    const t=new Date();t.setUTCHours(24,5,0,0);
    db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(YT_BACKFILL_PAUSE_KEY,t.toISOString());
    db.prepare("UPDATE scheduled_posts SET youtube_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
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
    try{await backfillOneYouTubeShort();}catch{}
    return{processed};
  }finally{running=false;}
}

export function startCalendarPublisherLoop(){
  if(started||process.env.NODE_ENV==="test")return;started=true;
  setInterval(()=>{void runCalendarPublisherOnce();},60_000).unref?.();
  setInterval(()=>{void verifyPublishedInstagramOnce();},120_000).unref?.();
  setTimeout(()=>{void runCalendarPublisherOnce();},5_000).unref?.();
}
