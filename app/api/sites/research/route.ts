import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { researchWebsite } from "@/lib/site-research";

export async function POST(req:Request){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>({}));
  const url=String(body.url||"").trim();
  if(!url)return NextResponse.json({error:"Enter your website URL first."},{status:400});
  try{return NextResponse.json({research:await researchWebsite(url)});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}
}
