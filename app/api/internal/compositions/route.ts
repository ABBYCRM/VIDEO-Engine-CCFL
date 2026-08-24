import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureAssetCalendarPost } from "@/lib/calendar-assets";
import { persistComposition } from "@/lib/split-compose";

export async function POST(req:Request){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  try{
    const form=await req.formData(),file=form.get("file");if(!(file instanceof File))return NextResponse.json({error:"Rendered composition file is required"},{status:400});
    if(file.size<1||file.size>300*1024*1024)return NextResponse.json({error:"Composition must be between 1 byte and 300MB"},{status:400});
    const mime=file.type.startsWith("video/mp4")?"video/mp4":file.type.startsWith("video/webm")?"video/webm":"";if(!mime)return NextResponse.json({error:"Composition must be MP4 or WebM"},{status:400});
    const title=String(form.get("title")||"Split-screen composition").slice(0,180),upper=String(form.get("upperSource")||"").slice(0,500),lower=String(form.get("lowerSource")||"").slice(0,500),split=Number(form.get("splitPercent")||33),caption=String(form.get("caption")||"Split-screen campaign").slice(0,5000);
    const saved=await persistComposition({bytes:Buffer.from(await file.arrayBuffer()),title,caption,upperSource:upper,lowerSource:lower,splitPercent:split,mimeType:mime,model:"browser composition"});
    ensureAssetCalendarPost({sourceKey:`composition:${saved.id}`,title:saved.title,contentType:"podcast",mediaUrl:saved.url,mediaType:saved.mimeType,caption});
    return NextResponse.json({id:saved.id,url:saved.url,mimeType:saved.mimeType,title:saved.title},{status:201});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}
}
