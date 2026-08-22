import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteSite, getSiteWithToken, updateSite } from "@/lib/sites";

export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await requireAdmin())) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params; const site=getSiteWithToken(id);
  if(!site) return NextResponse.json({error:"Site not found"},{status:404});
  return NextResponse.json({site});
}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await requireAdmin())) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params; const site=updateSite(id,await req.json().catch(()=>({})));
  if(!site) return NextResponse.json({error:"Site not found"},{status:404});
  return NextResponse.json({site});
}
export async function DELETE(_req:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await requireAdmin())) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params; return NextResponse.json({ok:deleteSite(id)});
}
