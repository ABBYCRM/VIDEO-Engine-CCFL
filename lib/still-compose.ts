import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { getStillPostTemplate } from "@/lib/still-post-templates";

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

export async function composeStillPost(input:{photoPath:string;templateId:string;outPath:string}){
  const template=getStillPostTemplate(input.templateId);
  const templatePath=path.resolve(process.cwd(),"public",template.assetPath.replace(/^\//,""));
  await fs.mkdir(path.dirname(input.outPath),{recursive:true});
  await run(process.env.FFMPEG_PATH||"ffmpeg",[
    "-y","-i",input.photoPath,"-i",templatePath,
    "-filter_complex","[0:v]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350[bg];[bg][1:v]overlay=0:0:format=auto[v]",
    "-map","[v]","-frames:v","1",input.outPath
  ]);
}