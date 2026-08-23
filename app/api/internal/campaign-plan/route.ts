import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { planCampaign } from "@/lib/nvidia/campaign-planner";

const VIDEO_PROVIDERS=new Set(["veo","grok","a2e","hedra"]);
export async function POST(req:Request){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>({})),provider=VIDEO_PROVIDERS.has(String(body.provider))?String(body.provider):"veo";
  try{
    const plan=await planCampaign({
      category:String(body.category||"ugc"),
      provider,
      model:body.model?String(body.model).slice(0,100):undefined,
      durationSeconds:Number(body.durationSeconds||8),
      avatarName:body.avatarName?String(body.avatarName):null,
      outputMode:String(body.outputMode||"video")
    });
    const response=NextResponse.json({plan});
    response.cookies.set("ve_campaign_provider",provider,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60*6});
    return response;
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}
}
