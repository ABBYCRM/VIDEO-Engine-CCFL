import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { publishInstagram } from "@/lib/instagram-publish";

export async function POST(req:Request){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  try{const body=await req.json().catch(()=>({}));const postType=body.postType==="story"?"story":"feed";const result=await publishInstagram({jobId:body.jobId?String(body.jobId):null,mediaUrl:body.mediaUrl?String(body.mediaUrl):null,mediaType:body.mediaType?String(body.mediaType):null,caption:String(body.caption||""),postType});return NextResponse.json({ok:true,...result});}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}
}
