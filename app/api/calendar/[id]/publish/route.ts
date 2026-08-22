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
      const blog=post.source_asset_key?.startsWith("blog:")?db.prepare("SELECT slug FROM blog_posts WHERE id=?").get(String(post.source_asset_key).slice(5)) as any:null;
      result=await publishWebsite({siteId:post.site_id,title:post.title,content:post.caption||"",slug:blog?.slug||null});
    }else{
      return NextResponse.json({error:`${post.network} publishing is not connected yet. Use Instagram, Website, or keep this item in owner review.`},{status:409});
    }
    db.prepare("UPDATE scheduled_posts SET status='published',published_at=?,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(new Date().toISOString(),id);
    return NextResponse.json({ok:true,result});
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    db.prepare("UPDATE scheduled_posts SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(message,id);
    return NextResponse.json({error:message},{status:400});
  }
}
