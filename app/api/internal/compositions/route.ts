import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureAssetCalendarPost } from "@/lib/calendar-assets";

db.exec(`CREATE TABLE IF NOT EXISTS generated_compositions(id TEXT PRIMARY KEY,title TEXT NOT NULL,file_path TEXT NOT NULL,mime_type TEXT NOT NULL,upper_source TEXT,lower_source TEXT,split_percent INTEGER NOT NULL DEFAULT 33,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE INDEX IF NOT EXISTS idx_generated_compositions_created_at ON generated_compositions(created_at);`);

export async function POST(req:Request){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  try{
    const form=await req.formData(),file=form.get("file");if(!(file instanceof File))return NextResponse.json({error:"Rendered composition file is required"},{status:400});
    if(file.size<1||file.size>300*1024*1024)return NextResponse.json({error:"Composition must be between 1 byte and 300MB"},{status:400});
    const mime=file.type.startsWith("video/mp4")?"video/mp4":file.type.startsWith("video/webm")?"video/webm":"";if(!mime)return NextResponse.json({error:"Composition must be MP4 or WebM"},{status:400});
    const id=crypto.randomUUID(),ext=mime==="video/mp4"?"mp4":"webm",relative=`/generated/compositions/${id}.${ext}`,absolute=path.resolve(process.cwd(),"public",relative.slice(1));await fs.mkdir(path.dirname(absolute),{recursive:true});await fs.writeFile(absolute,Buffer.from(await file.arrayBuffer()));
    const title=String(form.get("title")||"Split-screen composition").slice(0,180),upper=String(form.get("upperSource")||"").slice(0,500),lower=String(form.get("lowerSource")||"").slice(0,500),split=Math.max(25,Math.min(45,Number(form.get("splitPercent")||33))),caption=String(form.get("caption")||"Split-screen campaign").slice(0,5000);
    db.prepare("INSERT INTO generated_compositions(id,title,file_path,mime_type,upper_source,lower_source,split_percent) VALUES(?,?,?,?,?,?,?)").run(id,title,relative,mime,upper||null,lower||null,split);
    ensureAssetCalendarPost({sourceKey:`composition:${id}`,title,contentType:"podcast",mediaUrl:relative,mediaType:mime,caption});
    return NextResponse.json({id,url:relative,mimeType:mime,title},{status:201});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}
}
