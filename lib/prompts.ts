export const contentTemplates = {
  reel: {
    title: "Instagram Reel",
    instruction: "Hyper-realistic cinematic social media reel. ONE CONTINUOUS SHOT ONLY. No cuts, no montage. Vertical 9:16 format. Photorealistic smartphone footage quality with natural lighting, subtle handheld motion, realistic skin texture, anatomically correct features. Professional yet authentic feel. Duration exactly 8 seconds. SCRIPT MUST BE 15-20 WORDS MAX for natural 8-second delivery at normal speaking pace.",
    aspectRatio: "9:16" as const,
    duration: 8,
    platform: "instagram_reel",
    provider: "grok" as const,
    model: "grok-imagine-video-1.5" as const
  },
  story: {
    title: "Instagram Story",
    instruction: "Hyper-realistic Instagram Story content. ONE CONTINUOUS SHOT ONLY. Vertical 9:16 format. Intimate, personal-feeling footage. Natural lighting, realistic skin pores, fine facial texture, stable eyes and teeth. Authentic smartphone capture aesthetic. Duration exactly 8 seconds. SCRIPT MUST BE 15-20 WORDS MAX for natural 8-second delivery.",
    aspectRatio: "9:16" as const,
    duration: 8,
    platform: "instagram_story",
    provider: "grok" as const,
    model: "grok-imagine-video-1.5" as const
  },
  ugc: {
    title: "UGC Creator",
    instruction: "Authentic creator-style UGC content. ONE CONTINUOUS SHOT ONLY. Hyper-realistic smartphone footage. Natural facial microexpressions, accurate skin texture and eyes, realistic hands, conversational delivery, restrained gestures, subtle autofocus behavior. Believable room or outdoor ambience. Duration exactly 8 seconds. SCRIPT MUST BE 15-20 WORDS MAX for natural 8-second delivery at conversational pace.",
    aspectRatio: "9:16" as const,
    duration: 8,
    platform: "ugc",
    provider: "grok" as const,
    model: "grok-imagine-video-1.5" as const
  },
  cinematic: {
    title: "Cinematic",
    instruction: "Cinematic hyper-realistic video. ONE CONTINUOUS SHOT ONLY. Professional-grade photorealism. Dramatic but natural lighting, film-quality textures, anatomically perfect human subjects if present. No CGI appearance. Professional camera motion. Duration exactly 8 seconds. If dialogue exists, SCRIPT MUST BE 15-20 WORDS MAX.",
    aspectRatio: "16:9" as const,
    duration: 8,
    platform: "cinematic",
    provider: "grok" as const,
    model: "grok-imagine-video-1.5" as const
  }
} as const;

export type ContentTemplateId = keyof typeof contentTemplates;

export const campaignTemplates = {
  car_accident: {
    title: "Car Accident",
    instruction: "Personal-injury marketing scene involving a realistic motor-vehicle accident or aftermath. Prefer believable roadside aftermath over sensational impact. Keep vehicle geometry and damage physically plausible and consistent. No gore, no fire unless causally justified."
  },
  rideshare: {
    title: "Rideshare / Uber / Lyft",
    instruction: "Personal-injury marketing scene involving an adult rideshare passenger or driver after a collision. Show authentic pickup, vehicle-interior, curbside, or aftermath context. Do not imply a named platform caused the crash or endorses the campaign. Avoid fabricated app UI or insurance guarantees."
  },
  trucking: {
    title: "Trucking / 18-Wheeler",
    instruction: "Personal-injury marketing scene involving a commercial tractor-trailer. Respect truck scale, braking distance, trailer articulation, road physics, mass differences, and realistic damage. No gore or sensational destruction."
  },
  slip_fall: {
    title: "Slip & Fall",
    instruction: "Personal-injury marketing scene involving a plausible premises hazard such as a wet floor, uneven walkway, poor lighting, or unsafe stair condition. Human balance loss must follow gravity, reflexes, and realistic biomechanics. Avoid comedic ragdoll motion or graphic injury."
  },
  ugc: {
    title: "UGC Video",
    instruction: "Authentic creator-style UGC. Prioritize real smartphone optics, natural facial microexpressions, accurate skin texture and eyes, realistic hands, conversational delivery, restrained gestures, subtle autofocus/exposure behavior, and believable room or outdoor ambience."
  }
} as const;
export type CampaignCategory = keyof typeof campaignTemplates;
