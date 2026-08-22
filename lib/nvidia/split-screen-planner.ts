import { chatCompletion, getNvidiaModel, isNvidiaEnabled } from "@/lib/nvidia/client";

const SUBJECTS:Record<string,string>={
  car_accident:"car-accident / collision awareness and practical next steps",
  rideshare:"rideshare / Uber / Lyft incident awareness and practical next steps",
  trucking:"commercial truck / 18-wheeler incident awareness and evidence preservation",
  slip_fall:"slip-and-fall / premises incident awareness and documentation",
  ugc:"creator-style social campaign with a useful, credible takeaway"
};
const RELATIONSHIPS:Record<string,string>={
  anchor_field:"Upper lane is a polished TV/news studio anchor asking a concise question. Lower lane is an on-scene field reporter answering it. They are different people in different environments, but the dialogue must connect naturally.",
  question_answer:"Upper lane asks a direct viewer-style question. Lower lane gives the concise expert/spokesperson answer. Different subjects are allowed; the second lane must clearly answer the first.",
  context_commentary:"Upper lane visually establishes the scenario/context without requiring dialogue. Lower lane is a spokesperson explaining the useful takeaway.",
  reaction:"Upper lane shows the triggering scenario. Lower lane reacts/commentates conversationally. The subjects may be completely different people and places.",
  parallel:"Upper and lower lanes tell two complementary sides of the same topic. They do not speak to each other but should make sense when viewed simultaneously."
};

export type SplitPlan={
  hook:string; caption:string; relationshipSummary:string;
  upper:{mission:string;subject:string;script:string;visualDirection:string};
  lower:{mission:string;subject:string;script:string;visualDirection:string};
};

export async function planSplitScreen(input:{category:string;relationship:string;upperProvider:string;lowerProvider:string;upperSeconds:number;lowerSeconds:number;lowerAvatarName?:string|null}):Promise<SplitPlan>{
  if(!isNvidiaEnabled())throw new Error("NVIDIA content intelligence is not configured");
  const subject=SUBJECTS[input.category]||SUBJECTS.ugc;
  const relationship=RELATIONSHIPS[input.relationship]||RELATIONSHIPS.context_commentary;
  const response=await chatCompletion({model:getNvidiaModel(),temperature:.55,maxTokens:1800,jsonMode:true,messages:[
    {role:"system",content:"You plan two-lane vertical split-screen social videos for an internal campaign tool. Return JSON only. Never invent settlements, testimonials, legal outcomes, diagnoses, statistics, or client facts. The upper and lower lanes may show completely different people/places unless the selected relationship requires dialogue. Keep each lane simple enough for one continuous AI video generation."},
    {role:"user",content:`Campaign subject: ${subject}\nRelationship preset: ${relationship}\nUpper engine: ${input.upperProvider}; upper duration: ${Math.max(8,Math.min(30,input.upperSeconds))}s.\nLower engine: ${input.lowerProvider}; lower duration: ${Math.max(8,Math.min(30,input.lowerSeconds))}s.\nLower canonical spokesperson: ${input.lowerAvatarName||"none selected"}.\n\nReturn {"hook":"","caption":"","relationshipSummary":"","upper":{"mission":"","subject":"","script":"","visualDirection":""},"lower":{"mission":"","subject":"","script":"","visualDirection":""}}. If relationship is anchor_field or question_answer, upper.script must be a concise question and lower.script must directly answer it. If lower engine is Hedra, lower.script must be naturally speakable within its duration.`}
  ]});
  let p:any;try{p=JSON.parse(response.text.trim().replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/, ""));}catch{throw new Error("Split-screen planner returned invalid JSON. Retry.");}
  const s=(v:any,n:number)=>String(v||"").trim().slice(0,n);const plan:SplitPlan={hook:s(p.hook,300),caption:s(p.caption,2200),relationshipSummary:s(p.relationshipSummary,1200),upper:{mission:s(p.upper?.mission,2500),subject:s(p.upper?.subject,2500),script:s(p.upper?.script,2200),visualDirection:s(p.upper?.visualDirection,2800)},lower:{mission:s(p.lower?.mission,2500),subject:s(p.lower?.subject,2500),script:s(p.lower?.script,2200),visualDirection:s(p.lower?.visualDirection,2800)}};
  if(!plan.upper.mission||!plan.lower.mission)throw new Error("Split-screen planner returned an incomplete plan. Retry.");return plan;
}
