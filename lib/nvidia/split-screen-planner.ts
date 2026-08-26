import { chatCompletion, getNvidiaModel, isNvidiaEnabled } from "@/lib/nvidia/client";
import { publicCaptionForSlot } from "@/lib/public-copy";
import type { VideoPromptHints } from "@/lib/split-templates";

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

function s(v:any,n:number){return String(v||"").trim().slice(0,n)}

function withPublicCopy(plan:SplitPlan, input:{category:string;title?:string;mission?:string}):SplitPlan{
  const copy=publicCaptionForSlot({category:input.category,title:input.title,hook:plan.hook,caption:plan.caption,mission:input.mission});
  return {...plan, hook:copy.hook, caption:copy.caption};
}

export function fallbackSplitPlan(input:{category:string;relationship:string;mission?:string;title?:string;upperIsStock?:boolean;lowerAvatarName?:string|null}):SplitPlan{
  const subject=SUBJECTS[input.category]||SUBJECTS.ugc;
  const relationship=RELATIONSHIPS[input.relationship]||RELATIONSHIPS.anchor_field;
  const title=s(input.title,180);
  const variation=title?` Calendar variation: ${title}.`:"";
  const avatar=input.lowerAvatarName?` Use canonical spokesperson ${input.lowerAvatarName}; preserve that identity.`:" A calm adult spokesperson.";
  const plan:SplitPlan={
    hook:"",
    caption:"",
    relationshipSummary:relationship.slice(0,1200),
    upper: input.upperIsStock ? {
      mission:"Use the supplied contextual footage as the upper lane. Do not generate a replacement scene.",
      subject:"Operator-supplied accident-context footage, cropped to the upper split-screen pane.",
      script:"",
      visualDirection:"Keep the uploaded clip unchanged except for split-screen crop, loop, or trim to 8 seconds."
    } : {
      mission:`Upper lane${variation} Establish the scene for ${subject} in ONE CONTINUOUS SHOT ONLY.`.slice(0,2500),
      subject:"Professional broadcast studio or contextual field environment, eye-level camera, no fabricated news chyrons.",
      script:input.relationship==="parallel"||input.relationship==="context_commentary"?"":"What should someone document first if it is safe to do so?",
      visualDirection:"One continuous 8-second camera move. No cuts, no collage, no fake evidence."
    },
    lower:{
      mission:`Lower lane${variation}${avatar} Delivers the useful takeaway for ${subject} in ONE CONTINUOUS SHOT ONLY.`.slice(0,2500),
      subject: input.lowerAvatarName
        ? `${input.lowerAvatarName}, campaign-safe wardrobe, direct-to-camera, realistic lighting.`
        : "Professional adult spokesperson, campaign-safe wardrobe, direct-to-camera, realistic lighting.",
      script:"If it is safe, photograph the scene, visible conditions, and identifying information before details disappear. CaseClosedFL.com connects you with the best attorneys in Florida — free, fast, no pressure.",
      visualDirection:"Stable medium close-up, one continuous 8-second take, no cuts."
    }
  };
  return withPublicCopy(plan, input);
}

export async function planSplitScreen(input:{
  category:string;
  relationship:string;
  upperProvider:string;
  lowerProvider:string;
  upperSeconds:number;
  lowerSeconds:number;
  lowerAvatarName?:string|null;
  mission?:string;
  title?:string;
  upperIsStock?:boolean;
  templatePurpose?:string;
  videoPromptHints?:VideoPromptHints;
}):Promise<SplitPlan>{
  if(!isNvidiaEnabled())return fallbackSplitPlan(input);
  const subject=SUBJECTS[input.category]||SUBJECTS.ugc;
  const relationship=input.upperIsStock
    ? RELATIONSHIPS.context_commentary
    : (RELATIONSHIPS[input.relationship]||RELATIONSHIPS.context_commentary);
  try{
    const response=await chatCompletion({model:getNvidiaModel(),temperature:.55,maxTokens:1800,jsonMode:true,messages:[
      {role:"system",content:"You plan two-lane vertical split-screen Instagram Reels for a Florida personal-injury law firm (CaseClosedFL.com). Return JSON only. Never invent settlements, testimonials, legal outcomes, diagnoses, statistics, or client facts. hook and caption are PUBLIC Instagram marketing copy a stranger reads under the Reel. hook must be a short, attention-grabbing opener in the style of 'This one thing changes everything', 'People still don't know this', 'The mistake most people make', or 'One decision, a different outcome' — never a bland instruction like 'Know what to do next'. caption is 2-4 useful lines, must explicitly mention CaseClosedFL.com connecting the reader to the best attorneys in Florida, the disclaimer 'General information only—not legal advice.', and 3-8 hashtags. NEVER put internal/operator language in caption or hook (no mission, wardrobe, newsroom credibility, 8-second, ONE CONTINUOUS SHOT, calendar variation, AI, generate, campaign brief). lower.script (the on-camera spokesperson's spoken line) must end by naming CaseClosedFL.com and saying it connects viewers with the best attorneys in Florida — spoken naturally, not read like an ad. The upper and lower lanes may show completely different people/places unless the selected relationship requires dialogue. Keep each generated lane simple enough for one continuous 8-second AI video."},
      {role:"user",content:`Campaign subject: ${subject}\nRelationship preset: ${relationship}\nCampaign mission (INTERNAL ONLY — do not copy into caption): ${s(input.mission,1200)||"none"}\nCalendar item: ${s(input.title,180)||"none"}\nSelected template purpose: ${s(input.templatePurpose,500)||"general split-screen reel"}\nTemplate video guidance: ${s(JSON.stringify(input.videoPromptHints||{}),1200)||"none"}\nUpper engine: ${input.upperIsStock?"operator-supplied stock footage (do not write an AI generation brief that replaces it)":input.upperProvider}; upper duration: ${Math.max(8,Math.min(30,input.upperSeconds))}s.\nLower engine: ${input.lowerProvider}; lower duration: ${Math.max(8,Math.min(30,input.lowerSeconds))}s.\nLower canonical spokesperson: ${input.lowerAvatarName||"none selected"}.\n\nTreat the selected template purpose and video guidance as requirements for the missions, scripts, subjects, and visual directions. Language instructions in the template apply to the hook, caption, and spoken scripts too.\n\nReturn {"hook":"","caption":"","relationshipSummary":"","upper":{"mission":"","subject":"","script":"","visualDirection":""},"lower":{"mission":"","subject":"","script":"","visualDirection":""}}. Caption must be Instagram-ready marketing copy that names CaseClosedFL.com and the best attorneys in Florida. If relationship is anchor_field or question_answer and upper is not stock, upper.script must be a concise question and lower.script must directly answer it, then name CaseClosedFL.com. If lower engine is Hedra, lower.script must be naturally speakable within its duration. If a canonical spokesperson is named, lower.subject must preserve that identity.`}
    ]});
    let p:any;try{p=JSON.parse(response.text.trim().replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/, ""));}catch{return fallbackSplitPlan(input);}
    const plan:SplitPlan={hook:s(p.hook,300),caption:s(p.caption,2200),relationshipSummary:s(p.relationshipSummary,1200),upper:{mission:s(p.upper?.mission,2500),subject:s(p.upper?.subject,2500),script:s(p.upper?.script,2200),visualDirection:s(p.upper?.visualDirection,2800)},lower:{mission:s(p.lower?.mission,2500),subject:s(p.lower?.subject,2500),script:s(p.lower?.script,2200),visualDirection:s(p.lower?.visualDirection,2800)}};
    if(!plan.upper.mission||!plan.lower.mission)return fallbackSplitPlan(input);
    if(input.upperIsStock){
      plan.upper.script="";
      plan.upper.mission="Use the supplied contextual footage as the upper lane. Do not generate a replacement scene.";
    }
    return withPublicCopy(plan, input);
  }catch{
    return fallbackSplitPlan(input);
  }
}
