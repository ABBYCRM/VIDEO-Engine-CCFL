import { chatCompletion, getNvidiaModel, isNvidiaEnabled } from "@/lib/nvidia/client";
import { getA2eModel } from "@/lib/a2e-model-catalog";

const CAMPAIGN_BRIEFS:Record<string,string>={
  car_accident:"Personal-injury awareness creative about a car crash, roadside aftermath, insurance confusion, medical follow-up, or the first steps after a collision. Keep claims factual and avoid invented outcomes, settlements, statistics, injuries, or testimonials.",
  vehicle_accident:"Personal-injury awareness creative about a car crash, roadside aftermath, insurance confusion, medical follow-up, or the first steps after a collision. Keep claims factual and avoid invented outcomes, settlements, statistics, injuries, or testimonials.",
  rideshare:"Personal-injury awareness creative involving Uber/Lyft/rideshare passenger or driver scenarios, insurance complexity, and practical next steps. Do not invent platform policies, case values, statistics, or outcomes.",
  rideshare_accident:"Personal-injury awareness creative involving Uber/Lyft/rideshare passenger or driver scenarios, insurance complexity, and practical next steps. Do not invent platform policies, case values, statistics, or outcomes.",
  trucking:"Personal-injury awareness creative involving commercial trucks / 18-wheelers, scene preservation, multiple responsible parties, and urgency around evidence. Avoid invented legal conclusions, statistics, settlements, or guarantees.",
  trucking_accident:"Personal-injury awareness creative involving commercial trucks / 18-wheelers, scene preservation, multiple responsible parties, and urgency around evidence. Avoid invented legal conclusions, statistics, settlements, or guarantees.",
  slip_fall:"Premises-liability awareness creative about a fall, unsafe condition, documentation, reporting, medical follow-up, or preserving evidence. Avoid claiming a property owner is liable without facts.",
  ugc:"Creator-style direct-response social creative. Natural, conversational, thumb-stopping, credible and concise. It may use a spokesperson reacting to a common problem or explaining one useful next step without fake testimonials or fabricated facts."
};

const PROVIDER_GUIDANCE:Record<string,string>={
  veo:"One continuous cinematic 8-second shot. No cuts, stitching, montage, extension, or multi-scene sequence. Native audiovisual direction must fit eight seconds.",
  grok:"One concise social/cinematic shot up to 15 seconds. Keep the visual action simple enough for a single coherent generation.",
  a2e:"Use the exact selected A2E model contract and duration. Do not assume Veo limitations when a longer or reference-capable A2E model is selected.",
  hedra:"Talking-character/avatar performance driven by audio. The dialogue is the primary timing source. Camera and background should remain stable and spokesperson-centric.",
  generic:"Create a reusable campaign brief suitable for Calendar planning. Focus on message, audience, spokesperson direction, hook and caption rather than one model-specific shot."
};
const OUTPUT_GUIDANCE:Record<string,string>={
  video:"The requested output is a video. Plan motion, framing, timing and dialogue appropriate to the selected video provider and exact model.",
  image:"The requested output is a single still social post. Plan one decisive frame with a photorealistic/editorial visual direction and no motion-only instructions. Dialogue should be empty unless it is useful as overlay copy.",
  auto_mix:"The campaign alternates video and still-image posts. Make the core hook/caption reusable across both, and make visualDirection describe a concept that can be expressed as either a motion shot or a single strong frame."
};

export type CampaignPlan={mission:string;subject:string;script:string;hook:string;caption:string;visualDirection:string;rationale:string};

function exactModelGuidance(provider:string,model:string|undefined,duration:number){
  if(provider!=="a2e")return model?`Selected model: ${model}.`:"";
  const def=getA2eModel(model||"");
  if(!def)return model?`Selected A2E model: ${model}. Follow its native generation constraints.`:"";
  const requirements=[
    def.requiresTwin?"This is a trained Video Twin/avatar workflow; write spoken dialogue for the driving audio and keep framing presenter-centric.":"",
    def.requiresImage?"A reference image is required; visual direction must animate or preserve that supplied identity/reference rather than invent a disconnected subject.":"",
    def.requiresAudio?"Driving audio is required; spoken script must fit the requested duration naturally.":""
  ].filter(Boolean).join(" ");
  return `Exact A2E model: ${def.label} (${def.id}). ${def.description} Requested duration: ${duration}s. ${requirements}`;
}

export async function planCampaign(input:{category:string;provider:string;model?:string;durationSeconds:number;avatarName?:string|null;outputMode?:"video"|"image"|"auto_mix"|string}):Promise<CampaignPlan>{
  if(!isNvidiaEnabled())throw new Error("NVIDIA content intelligence is not configured");
  const brief=CAMPAIGN_BRIEFS[input.category]||CAMPAIGN_BRIEFS.ugc;
  const provider=PROVIDER_GUIDANCE[input.provider]||PROVIDER_GUIDANCE.generic;
  const output=OUTPUT_GUIDANCE[input.outputMode||"video"]||OUTPUT_GUIDANCE.video;
  const duration=Math.max(2,Math.min(30,Math.round(input.durationSeconds||8)));
  const modelGuidance=exactModelGuidance(input.provider,input.model,duration);
  const avatar=input.avatarName?`Use canonical spokesperson ${input.avatarName}; preserve that identity consistently.`:"Choose an appropriate adult spokesperson or subject for the concept.";
  const requiresTimedDialogue=input.provider==="hedra"||(input.provider==="a2e"&&getA2eModel(input.model||"")?.requiresAudio);
  const response=await chatCompletion({model:getNvidiaModel(),temperature:.55,maxTokens:1400,jsonMode:true,messages:[
    {role:"system",content:"You are the creative planner inside an internal campaign-content application. The operator chooses a campaign type, output mode, exact content model/provider and optionally a canonical spokesperson; you do the prompt-writing work. Return JSON only with mission, subject, script, hook, caption, visualDirection, rationale. Never invent case results, settlements, testimonials, legal guarantees, medical diagnoses, statistics, factual claims, or client-specific details. Make the plan immediately executable and reusable for Calendar scheduling."},
    {role:"user",content:`Campaign brief: ${brief}\nOutput requirement: ${output}\nProvider constraint: ${provider}\nModel constraint: ${modelGuidance}\nTarget duration when applicable: ${duration} seconds.\nSpokesperson: ${avatar}\n\nCreate a strong but compliant campaign concept. mission = what the content accomplishes; subject = precise person/environment/camera direction; script = exact spoken dialogue only when useful${requiresTimedDialogue?` and MUST be naturally speakable within ${duration} seconds`:""}; hook = short opening line; caption = social post copy; visualDirection = generation-ready visual action/frame tailored to the selected model; rationale = one concise sentence explaining the choice.`}
  ]});
  let p:any;try{p=JSON.parse(response.text.trim().replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/, ""));}catch{throw new Error("Campaign planner returned invalid JSON. Retry the AI plan.");}
  const s=(v:any,n:number)=>String(v||"").trim().slice(0,n);
  const plan={mission:s(p.mission,2500),subject:s(p.subject,2500),script:s(p.script,2500),hook:s(p.hook,300),caption:s(p.caption,2200),visualDirection:s(p.visualDirection,3000),rationale:s(p.rationale,1000)};
  if(!plan.mission||!plan.subject)throw new Error("Campaign planner returned an incomplete plan. Retry.");
  if(requiresTimedDialogue&&!plan.script)throw new Error("Campaign planner omitted required avatar dialogue. Retry the AI plan.");
  return plan;
}