import { chatCompletion, getNvidiaModel, isNvidiaEnabled } from "@/lib/nvidia/client";

const CAMPAIGN_BRIEFS:Record<string,string>={
  car_accident:"Personal-injury awareness creative about a car crash, roadside aftermath, insurance confusion, medical follow-up, or the first steps after a collision. Keep claims factual and avoid invented outcomes, settlements, statistics, injuries, or testimonials.",
  rideshare:"Personal-injury awareness creative involving Uber/Lyft/rideshare passenger or driver scenarios, insurance complexity, and practical next steps. Do not invent platform policies, case values, statistics, or outcomes.",
  trucking:"Personal-injury awareness creative involving commercial trucks / 18-wheelers, scene preservation, multiple responsible parties, and urgency around evidence. Avoid invented legal conclusions, statistics, settlements, or guarantees.",
  slip_fall:"Premises-liability awareness creative about a fall, unsafe condition, documentation, reporting, medical follow-up, or preserving evidence. Avoid claiming a property owner is liable without facts.",
  ugc:"Creator-style direct-response social video. Natural, conversational, thumb-stopping, credible and concise. It may use a spokesperson reacting to a common problem or explaining one useful next step without fake testimonials or fabricated facts."
};

const PROVIDER_GUIDANCE:Record<string,string>={
  veo:"One continuous cinematic 8-second shot. No cuts, stitching, montage, extension, or multi-scene sequence. Native audiovisual direction must fit eight seconds.",
  grok:"One concise social/cinematic shot up to 15 seconds. Keep the visual action simple enough for a single coherent generation.",
  a2e:"Single coherent provider-routed shot. Avoid model-specific tricks and keep the prompt portable.",
  hedra:"Talking-character/avatar performance driven by audio. The dialogue is the primary timing source. Camera and background should remain stable and spokesperson-centric."
};

export type CampaignPlan={mission:string;subject:string;script:string;hook:string;caption:string;visualDirection:string;rationale:string};

export async function planCampaign(input:{category:string;provider:string;durationSeconds:number;avatarName?:string|null}):Promise<CampaignPlan>{
  if(!isNvidiaEnabled())throw new Error("NVIDIA content intelligence is not configured");
  const brief=CAMPAIGN_BRIEFS[input.category]||CAMPAIGN_BRIEFS.ugc;
  const provider=PROVIDER_GUIDANCE[input.provider]||PROVIDER_GUIDANCE.a2e;
  const duration=Math.max(8,Math.min(30,Math.round(input.durationSeconds||8)));
  const avatar=input.avatarName?`Use canonical spokesperson ${input.avatarName}; preserve that identity consistently.`:"Choose an appropriate adult spokesperson or subject for the concept.";
  const response=await chatCompletion({model:getNvidiaModel(),temperature:.55,maxTokens:1400,jsonMode:true,messages:[
    {role:"system",content:"You are the creative planner inside an internal campaign-video application. The operator chooses a campaign type and video provider; you do the prompt-writing work. Return JSON only with mission, subject, script, hook, caption, visualDirection, rationale. Never invent case results, settlements, testimonials, legal guarantees, medical diagnoses, statistics, factual claims, or client-specific details. Make the plan immediately executable by the selected provider."},
    {role:"user",content:`Campaign brief: ${brief}\nProvider constraint: ${provider}\nTarget duration: ${duration} seconds.\nSpokesperson: ${avatar}\n\nCreate a strong but compliant campaign concept. mission = what the content accomplishes; subject = precise person/environment/camera direction; script = exact spoken dialogue only when useful (for Hedra always provide dialogue timed to duration); hook = short opening line; caption = social post copy; visualDirection = provider-ready visual action; rationale = one concise sentence explaining the choice.`}
  ]});
  let p:any;try{p=JSON.parse(response.text.trim().replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/, ""));}catch{throw new Error("Campaign planner returned invalid JSON. Retry the AI plan.");}
  const s=(v:any,n:number)=>String(v||"").trim().slice(0,n);
  const plan={mission:s(p.mission,2500),subject:s(p.subject,2500),script:s(p.script,2500),hook:s(p.hook,300),caption:s(p.caption,2200),visualDirection:s(p.visualDirection,3000),rationale:s(p.rationale,1000)};
  if(!plan.mission||!plan.subject)throw new Error("Campaign planner returned an incomplete plan. Retry.");
  return plan;
}
