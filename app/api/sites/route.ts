import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSite, listSites } from "@/lib/sites";

export async function GET(){
  if(!(await requireAdmin())) return NextResponse.json({error:"Unauthorized"},{status:401});
  return NextResponse.json({sites:listSites()});
}

export async function POST(req:Request){
  if(!(await requireAdmin())) return NextResponse.json({error:"Unauthorized"},{status:401});
  try{
    const body=await req.json();
    if(!String(body.url||"").trim()) return NextResponse.json({error:"Website URL is required"},{status:400});
    const site=createSite(body);
    return NextResponse.json({site},{status:201});
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    return NextResponse.json({error:message.includes("UNIQUE")?"This website is already connected.":message},{status:400});
  }
}
