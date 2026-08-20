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
