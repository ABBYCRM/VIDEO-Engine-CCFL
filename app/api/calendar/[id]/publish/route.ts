import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { claimInstagramPublish, publishInstagramPair, releaseInstagramPublish, publishYouTubeShort } from "@/lib/calendar-publisher";
import { verifyPublishedInstagramOnce } from "@/lib/publish-verify";
import { publishWebsite } from "@/lib/site-publish";
import { isYouTubeConnected } from "@/lib/youtube";

export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const{id}=await params;
  const post=db.prepare("SELECT * FROM scheduled_posts WHERE id=?").get(id) as any;
  if(!post)return NextResponse.json({error:"Not found"},{status:404});
  try{
    let result:any;
    if(post.network==="instagram"){
      if(post.generation_status&&post.generation_status!=="ready")return NextResponse.json({error:`Media is ${post.generation_status}; wait for generation to finish before publishing`},{status:409});
      if(!post.video_job_id&&!post.media_url)return NextResponse.json({error:"Attach a generated image or video before publishing"},{status:409});
      if(!claimInstagramPublish(post.id))return NextResponse.json({error:"This Instagram item is already publishing. Wait a few minutes before retrying."},{status:409});
      result=await publishInstagramPair(post);
    }else if(post.network==="youtube"){
      if(!isYouTubeConnected())return NextResponse.json({error:"YouTube is not connected. Save the OAuth client + connect the channel in Settings."},{status:409});
      if(post.generation_status&&post.generation_status!=="ready")return NextResponse.json({error:`Media is ${post.generation_status}; wait for generation to finish before publishing`},{status:409});
      if(!post.media_url)return NextResponse.json({error:"YouTube publishing needs a media_url pointing to a library video asset"},{status:409});
      if(!/^video\//.test(String(post.media_type||"")))return NextResponse.json({error:"YouTube Shorts publishing needs a video asset (not an image)"},{status:409});
      result=await publishYouTubeShort(post);
    }else if(post.network==="website"){
      if(!post.site_id)return NextResponse.json({error:"Website Calendar items must be linked to a Site before publishing"},{status:409});
      if(post.generation_status&&post.generation_status!=="ready")return NextResponse.json({error:`Blog draft is ${post.generation_status}; wait for generation to finish before publishing`},{status:409});
      if(!String(post.content_body||"").trim())return NextResponse.json({error:"Generated article body is empty"},{status:409});
      result=await publishWebsite({siteId:post.site_id,title:post.title,content:post.content_body,slug:post.slug||null,excerpt:post.caption||null,metaTitle:post.seo_title||null,metaDescription:post.meta_description||null,focusKeyword:post.focus_keyword||null,featuredImageUrl:post.media_url||null});
    }else{
      return NextResponse.json({error:`${post.network} publishing is not connected yet. Use Instagram, YouTube, Website, or keep this item in owner review.`},{status:409});
    }
    db.prepare("UPDATE scheduled_posts SET status='published',published_at=?,error=NULL,publishing_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(new Date().toISOString(),id);
    if(post.network==="instagram")setTimeout(()=>{void verifyPublishedInstagramOnce();},15_000).unref?.();
    return NextResponse.json({ok:true,result});
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    releaseInstagramPublish(id);
    db.prepare("UPDATE scheduled_posts SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(message.slice(0,2000),id);
    return NextResponse.json({error:message},{status:400});
  }
}
