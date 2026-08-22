import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { publishInstagram } from "@/lib/instagram-publish";
import { publishWebsite } from "@/lib/site-publish";

export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const{id}=await params;
  const post=db.prepare("SELECT * FROM scheduled_posts WHERE id=?").get(id) as any;
  if(!post)return NextResponse.json({error:"Not found"},{status:404});
  try{
    let result:any;
    if(post.network==="instagram"){
      if(!post.video_job_id&&!post.media_url)return NextResponse.json({error:"Attach a generated image or video before publishing"},{status:409});
      result=await publishInstagram({jobId:post.video_job_id,mediaUrl:post.media_url,mediaType:post.media_type,caption:post.caption});
    }else if(post.network==="website"){
      if(!post.site_id)return NextResponse.json({error:"Website Calendar items must be linked to a Site before publishing"},{status:409});
      if(post.generation_status&&post.generation_status!=="ready")return NextResponse.json({error:`Blog draft is ${post.generation_status}; wait for generation to finish before publishing`},{status:409});
      if(!String(post.content_body||"").trim())return NextResponse.json({error:"Generated article body is empty"},{status:409});
      result=await publishWebsite({siteId:post.site_id,title:post.title,content:post.content_body,slug:post.slug||null,excerpt:post.caption||null,metaTitle:post.seo_title||null,metaDescription:post.meta_description||null,focusKeyword:post.focus_keyword||null,featuredImageUrl:post.media_url||null});
    }else{
      return NextResponse.json({error:`${post.network} publishing is not connected yet. Use Instagram, Website, or keep this item in owner review.`},{status:409});
    }
    db.prepare("UPDATE scheduled_posts SET status='published',published_at=?,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(new Date().toISOString(),id);
    return NextResponse.json({ok:true,result});
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    db.prepare("UPDATE scheduled_posts SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(message.slice(0,2000),id);
    return NextResponse.json({error:message},{status:400});
  }
}
