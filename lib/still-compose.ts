import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { getStillPostTemplate } from "@/lib/still-post-templates";
import { pickReviewCard } from "@/lib/review-pool";

function run(cmd:string,args:string[],timeoutMs=120_000){
  return new Promise<void>((resolve,reject)=>{
    const child=spawn(cmd,args,{stdio:["ignore","pipe","pipe"]});let err="",done=false;let timer:NodeJS.Timeout|undefined;
    const finish=(error?:Error)=>{if(done)return;done=true;if(timer)clearTimeout(timer);if(error)reject(error);else resolve();};
    child.stderr.on("data",chunk=>{err=`${err}${String(chunk)}`.slice(-12_000);});
    child.on("error",error=>finish(new Error(`${cmd} is not available: ${error.message}`)));
    child.on("close",code=>{if(code===0)finish();else finish(new Error((err||`${cmd} exited ${code}`).slice(-1800)));});
    timer=setTimeout(()=>{child.kill("SIGKILL");finish(new Error(`${cmd} timed out after ${Math.round(timeoutMs/1000)} seconds`));},timeoutMs);timer.unref?.();
  });
}

async function resolveFontPath(){
  const candidates=[
    process.env.FONT_PATH,
    path.resolve(process.cwd(),"public","fonts","DejaVuSans-Bold.ttf"),
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
  ].filter((p):p is string=>Boolean(p));
  for(const candidate of candidates){try{await fs.access(candidate);return candidate;}catch{}}
  return candidates[0];
}

function escDrawtext(s:string){
  return s.replace(/\\/g,"\\\\").replace(/:/g,"\\:").replace(/,/g,"\\,").replace(/'/g,"\u2019");
}

export async function composeStillPost(input:{photoPath:string;templateId:string;outPath:string;seed?:string|null}){
  const template=getStillPostTemplate(input.templateId);
  const templatePath=path.resolve(process.cwd(),"public",template.assetPath.replace(/^\//,""));
  await fs.mkdir(path.dirname(input.outPath),{recursive:true});
  let filter="[0:v]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350[bg];[bg][1:v]overlay=0:0:format=auto[v]";
  if(template.id==="post-clients-say"){
    // The frame PNG carries a baked sample quote. Cover the card text zone
    // with white and draw a varied peer-to-peer review instead, so every
    // post reads differently (stars, wording, and attribution rotate).
    const review=pickReviewCard(input.seed);
    const font=await resolveFontPath();
    const parts:string[]=[
      "drawbox=x=470:y=330:w=548:h=292:color=0xF8FAFC:t=fill",
      "drawbox=x=470:y=622:w=452:h=196:color=0xF8FAFC:t=fill",
      `drawtext=fontfile='${font}':text='${"\u2605".repeat(Math.max(1,Math.min(5,review.stars)))}':fontcolor=0xF26B1D:fontsize=46:x=492:y=352`
    ];
    review.lines.slice(0,3).forEach((line,i)=>{
      parts.push(`drawtext=fontfile='${font}':text='${escDrawtext(line)}':fontcolor=0x101B33:fontsize=40:x=492:y=${440+i*56}`);
    });
    parts.push(`drawtext=fontfile='${font}':text='${escDrawtext(review.attribution)}':fontcolor=0x101B33:fontsize=34:x=492:y=680`);
    filter="[0:v]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350[bg];[bg][1:v]overlay=0:0:format=auto,"+parts.join(",")+"[v]";
  }
  await run(process.env.FFMPEG_PATH||"ffmpeg",[
    "-y","-i",input.photoPath,"-i",templatePath,
    "-filter_complex",filter,
    "-map","[v]","-frames:v","1",input.outPath
  ]);
}