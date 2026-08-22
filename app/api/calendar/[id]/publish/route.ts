import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { publishInstagram } from "@/lib/instagram-publish";

export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const{id}=await params;const post=db.prepare("SELECT * FROM scheduled_posts WHERE id=?").get(id) as any;if(!post)return NextResponse.json({error:"Not found"},{status:404});
  if(post.network!=="instagram")return NextResponse.json({error:`Post now is currently connected for Instagram. ${post.network} remains in the approval queue until its publisher is connected.`},{status:409});
  if(!post.video_job_id&&!post.media_url)return NextResponse.json({error:"Attach a generated image or video before publishing"},{status:409});
  try{const result=await publishInstagram({jobId:post.video_job_id,mediaUrl:post.media_url,mediaType:post.media_type,caption:post.caption});db.prepare("UPDATE scheduled_posts SET status='published',published_at=?,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(new Date().toISOString(),id);return NextResponse.json({ok:true,result});}
  catch(e){const message=e instanceof Error?e.message:String(e);db.prepare("UPDATE scheduled_posts SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(message,id);return NextResponse.json({error:message},{status:400});}
}
