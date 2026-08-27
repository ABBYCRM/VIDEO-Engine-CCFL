// Cartoon still templates — "The Animated Legal Ad" style
//
// Visual system (locked 2026-08-27, per operator's spec):
//   • High-end 3D animation (Pixar / Illumination aesthetic)
//   • Recurring characters: "Injured Worker" (blue work clothes, expressive eyes) and
//     "Legal Professional" (navy suit, white shirt, gold tie)
//   • Scene is always a recognizable accident or injury context, with a clear
//     storytelling prop (banana peel, smashed vehicle, "UBER" sign, past-due bills)
//   • Bottom ~15% of the canvas is a solid orange (#FF6D00) bar with:
//       Left  : "CaseClosedFL.com | (561) 566-1360"
//       Right : "CaseClosedFL"
//   • Below the bar, fine print centered: "Not a law firm · No legal advice · No outcome guarantees"
//
// The bottom bar + fine print are composited by `composeCartoonStillPost()` in
// lib/cartoon-still-compose.ts. The TOP ~85% is what the image model is asked to
// generate. Every prompt re-asserts the recurring characters so the visual identity
// stays consistent across the campaign.
//
// Each template maps to a campaign category and includes:
//   - id             → stable id stored in scheduled_posts.still_template_id
//   - label          → human-readable
//   - category       → campaign category this template is best for
//   - topic          → a sub-topic key used to rotate variations (prevents the
//                      "same image over and over" problem)
//   - scene          → the long scene description injected into the image prompt
//   - headline       → the H1 line drawn on the navy left panel (large, white)
//   - subhead        → the orange subtitle below the H1
//   - cta            → the small action line near the bottom of the navy panel
//   - variants       → an array of { scene, headline, subhead, cta } that the
//                      planner picks from so the same template id can produce
//                      visually distinct posts

export type CartoonVariant = {
  scene: string;
  headline: string;
  subhead: string;
  cta: string;
};

export type CartoonTemplateDef = {
  id: string;
  label: string;
  category: "car_accident" | "rideshare" | "trucking" | "slip_fall" | "workplace" | "pedestrian" | "ugc" | "general";
  topic: string;
  defaultHeadline: string;
  defaultSubhead: string;
  defaultCta: string;
  variants: CartoonVariant[];
};

const INJURED_WORKER = `A stylized male cartoon figure with smooth features, large expressive circular eyes, a prominent rounded nose, and stylized brown hair. He consistently wears a blue work jacket/collared shirt, white undershirt, and blue pants. Injuries are always clear and prominent (pained expression, large bandage on head, cast on leg/arm, or neck brace).`;

const LEGAL_PRO = `A clean-cut male cartoon professional with swept dark hair, large expressive eyes, a rounded nose, and smooth skin. He wears a fitted navy-blue suit, clean white shirt, and a solid gold tie. He always has a confident, reassuring expression, often with one hand on the injured worker's shoulder.`;

const STYLE_BLOCK = `High-end 3D animation in the style of Pixar or Illumination Entertainment. Soft even lighting, slightly oversaturated but cohesive colors, clean simplified backgrounds, exaggerated facial expressions for clarity, smooth rounded forms, no photorealism, no live-action references. Cartoon proportions (slightly larger heads, big eyes, simple rounded hands). Vertical 4:5 framing, scene fills the upper portion of the frame. The bottom ~15% of the image must be left empty as a clean solid-color zone (the image-generation model does NOT draw the orange footer — that is composited on top afterwards). No text, no letters, no numbers, no logos, no watermarks anywhere in the generated image.`;

const CHARACTERS = `Recurring characters (always exactly as described, with consistent clothing and proportions across all posts):
1. INJURED WORKER: ${INJURED_WORKER}
2. LEGAL PROFESSIONAL: ${LEGAL_PRO}
3. Optional supporting family/witness: same stylized 3D human form, simplified features, distinct but simplified clothing, exaggerated but clear expressions (shock, worry, relief).`;

// ── TEMPLATES ──────────────────────────────────────────────────────────

export const CARTOON_TEMPLATES: CartoonTemplateDef[] = [
  // 1. Slip & fall — grocery store (the canonical banana-peel)
  {
    id: "cartoon-slip-fall-grocery",
    label: "Slip & fall — grocery aisle",
    category: "slip_fall",
    topic: "grocery_store",
    defaultHeadline: "FREE\nEligibility Check.",
    defaultSubhead: "FAST\nIntake in Minutes.",
    defaultCta: "ZERO\nPressure. Ever.",
    variants: [
      {
        scene: `${CHARACTERS}\n\nScene: A clean, brightly-lit grocery store aisle with a tiled checker floor. The INJURED WORKER is mid-fall backwards on a banana peel near a "GROCERIES" overhead sign, arms flailing, mouth open in a surprised shout, a paper grocery bag of apples and a loaf of bread tumbling through the air above him. A shopping cart is tipped over nearby. The LEGAL PROFESSIONAL is kneeling beside him, one hand on his shoulder, pointing at a wet-floor caution cone that the worker slipped past. Background: simplified stylized shelves with cereal boxes and canned goods in a Pixar aesthetic. Lighting is bright, warm, even. ${STYLE_BLOCK}`,
        headline: "FREE\nEligibility Check.",
        subhead: "FAST\nIntake in Minutes.",
        cta: "ZERO\nPressure. Ever.",
      },
      {
        scene: `${CHARACTERS}\n\nScene: The same grocery store, but the aisle is a fresh-produce section. The INJURED WORKER has slipped on a puddle of spilled red juice near a display of stacked oranges. A small black cartoon bird stands on the wet floor looking shocked, flapping its wings. The INJURED WORKER is on his back with a bandage on his forehead, holding a hand to his head in pain. The LEGAL PROFESSIONAL stands over him with a reassuring smile, holding a clipboard. Background: simplified stylized produce displays, soft warm lighting, no text. ${STYLE_BLOCK}`,
        headline: "SLIPPED\nin a store?",
        subhead: "Their floor.\nTheir problem.",
        cta: "Free case review.\nNo fees unless you win.",
      },
      {
        scene: `${CHARACTERS}\n\nScene: The same grocery store, frozen-food aisle. The INJURED WORKER slipped where the floor is icy from a freezer-case leak. Visible cartoon ice crystals and a small puddle near his feet. He's sitting up holding his lower back, a cast already on his right arm from a previous incident being referenced. A worried wife in a teal patterned blouse stands behind him with a hand over her mouth. The LEGAL PROFESSIONAL is in the foreground, looking at the camera with a confident reassuring expression, hand on the worker's shoulder. Background: stylized freezers, frost on the ground, simplified 3D aesthetic. ${STYLE_BLOCK}`,
        headline: "INJURED\non a wet floor?",
        subhead: "You didn't fall.\nYou were pushed.",
        cta: "Free consult.\nNo win = no fee.",
      },
    ],
  },

  // 2. Car accident — rear-end collision
  {
    id: "cartoon-car-crash-rear-end",
    label: "Car crash — rear-end",
    category: "car_accident",
    topic: "rear_end",
    defaultHeadline: "HIT\nfrom behind?",
    defaultSubhead: "Not your fault.",
    defaultCta: "Free consult.",
    variants: [
      {
        scene: `${CHARACTERS}\n\nScene: A clean stylized city street with simplified 3D buildings and a streetlamp. A classic rounded blue cartoon car has rear-ended a red cartoon sedan — the blue car's hood is crumpled and the red car's trunk is buckled. The INJURED WORKER is standing beside the red car, neck in a soft cervical collar, holding a stack of past-due medical bills with a pained expression. The LEGAL PROFESSIONAL stands next to him, pointing at the crumpled blue car and a glowing holographic interface that reads "INSURANCE DISPUTE RESOLUTION" in simplified iconography (not text). Background: clean urban setting, soft golden-hour lighting, simplified 3D. ${STYLE_BLOCK}`,
        headline: "HIT\nfrom behind?",
        subhead: "Not your fault.\nNot your bill.",
        cta: "Free consult.\nNo win = no fee.",
      },
      {
        scene: `${CHARACTERS}\n\nScene: A four-way intersection. A yellow cartoon taxi has rear-ended the INJURED WORKER's red compact car. The INJURED WORKER is sitting on the curb, a cast on his left arm and a small bandage on his forehead, looking dazed. The LEGAL PROFESSIONAL kneels beside him, handing him a business card with a reassuring smile. A small "TAXI" sign is visible on the yellow car's roof. Background: simplified traffic light, storefronts, no text. ${STYLE_BLOCK}`,
        headline: "REAR-ENDED\nin a taxi?",
        subhead: "Their insurance.\nYour recovery.",
        cta: "Free case review\nin minutes.",
      },
      {
        scene: `${CHARACTERS}\n\nScene: A rainy two-lane road at dusk. A blue SUV has rear-ended a silver sedan. The INJURED WORKER is standing in the rain with a worried wife holding a yellow umbrella over him, both looking shaken. The LEGAL PROFESSIONAL stands in the foreground holding a large umbrella of his own, a confident reassuring expression, gesturing calmly. A single police car with flashing red-and-blue lights is parked in the soft-focus background. Rain streaks, soft glow from headlights, simplified 3D, Pixar aesthetic. ${STYLE_BLOCK}`,
        headline: "HIT\nat a light?",
        subhead: "Rain or shine.\nTheir fault is their fault.",
        cta: "Free case review.\nNo pressure.",
      },
    ],
  },

  // 3. Trucking — commercial truck accident
  {
    id: "cartoon-trucking-highway",
    label: "Trucking — highway crash",
    category: "trucking",
    topic: "highway_truck",
    defaultHeadline: "BIG RIG\nhit you?",
    defaultSubhead: "Their insurance\nisn't yours.",
    defaultCta: "Free consult.",
    variants: [
      {
        scene: `${CHARACTERS}\n\nScene: A sunlit highway lined with stylized trees. A yellow cartoon box truck has T-boned a blue cartoon motorcycle at an intersection. The INJURED WORKER is on his back on the asphalt, the motorcycle crumpled next to him, holding his left leg which has a bright white cast. Pieces of yellow and blue plastic debris scatter across the ground. The LEGAL PROFESSIONAL is in the foreground, kneeling, examining the case with a confident smile, looking at the camera. Background: stylized city skyline, soft sun, simplified 3D. ${STYLE_BLOCK}`,
        headline: "BIG RIG\nhit you?",
        subhead: "Their insurance\nisn't yours.",
        cta: "Free consult.\nNo fees until you win.",
      },
      {
        scene: `${CHARACTERS}\n\nScene: A foggy two-lane highway. A massive white semi-truck has jackknifed across the road, blocking both lanes. A small red compact car is wedged under the trailer's side, its front crumpled. The INJURED WORKER is sitting on the grassy shoulder, head in his hands, a bandage wrapped around his head, looking defeated. The LEGAL PROFESSIONAL stands next to him, hand on his shoulder, pointing at the truck with a determined expression. Background: fog, soft emergency-light glow in the distance, simplified 3D, Pixar aesthetic. ${STYLE_BLOCK}`,
        headline: "TRUCK\nwrecked your car?",
        subhead: "Federal rules.\nMillion-dollar policies.",
        cta: "Free case review\ntoday.",
      },
      {
        scene: `${CHARACTERS}\n\nScene: A construction zone with orange cones and a "ROAD WORK" sign. A yellow commercial truck has clipped a stopped worker's car. The INJURED WORKER (in his blue work clothes) is sitting on the curb, a large white cast on his right arm, looking frustrated. His worried wife and a small girl with pigtails stand behind him. The LEGAL PROFESSIONAL is in the foreground, holding a giant check from the insurance company (the check has no real numbers, just a stylized dollar sign) with a triumphant smile. Background: construction site, cones, simplified 3D, bright daylight. ${STYLE_BLOCK}`,
        headline: "WORK\nzone crash?",
        subhead: "Contractors carry\nbig policies.",
        cta: "Free consult.\nWe come to you.",
      },
    ],
  },

  // 4. Rideshare — Uber/Lyft injury
  {
    id: "cartoon-rideshare-curbside",
    label: "Rideshare — Uber/Lyft injury",
    category: "rideshare",
    topic: "rideshare",
    defaultHeadline: "UBER\ncrash?",
    defaultSubhead: "Two insurance\npolicies on\nthe hook.",
    defaultCta: "Free consult.",
    variants: [
      {
        scene: `${CHARACTERS}\n\nScene: A nighttime city street with a stylized glowing "UBER" sign on a black sedan. The INJURED WORKER is being helped out of the back seat by the LEGAL PROFESSIONAL, holding his neck with one hand, a soft cervical collar visible. A worried driver stands by the open door with his hands raised apologetically. Streetlights glow warm orange in the background, soft bokeh of city lights, simplified 3D, Pixar aesthetic. ${STYLE_BLOCK}`,
        headline: "UBER\ncrash?",
        subhead: "Two insurance\npolicies on\nthe hook.",
        cta: "Free case review.",
      },
      {
        scene: `${CHARACTERS}\n\nScene: A bright daylight curbside drop-off. A pink Lyft-style car has been rear-ended by a delivery van. The INJURED WORKER is standing beside the pink car holding a phone, a bandage on his head, looking frustrated. The LEGAL PROFESSIONAL stands between the two vehicles, hand raised in a confident "we've got this" pose, smiling at the camera. Background: stylized city sidewalk, soft daylight, simplified 3D. ${STYLE_BLOCK}`,
        headline: "RIDESHARE\nwreck?",
        subhead: "Their app.\nTheir coverage.",
        cta: "Free consult.\nNo fees until you win.",
      },
      {
        scene: `${CHARACTERS}\n\nScene: Inside a stylized 3D car interior at night, looking out the side window. The INJURED WORKER is in the back seat, neck brace, eyes wide with shock. The driver is looking back apologetically. Through the window, blurred streetlights and a green traffic light are visible. The LEGAL PROFESSIONAL's face is visible in the foreground outside the window, knocking gently to get attention, holding a business card. Simplified 3D, Pixar interior detail. ${STYLE_BLOCK}`,
        headline: "HURT\nin a Lyft?",
        subhead: "You were a\npassenger.\nYou're covered.",
        cta: "Free case review\nin minutes.",
      },
    ],
  },

  // 5. Workplace injury
  {
    id: "cartoon-workplace-construction",
    label: "Workplace injury — construction",
    category: "workplace",
    topic: "construction",
    defaultHeadline: "HURT\non the job?",
    defaultSubhead: "Workers' comp\nis just the start.",
    defaultCta: "Free consult.",
    variants: [
      {
        scene: `${CHARACTERS}\n\nScene: A bright stylized construction site. The INJURED WORKER is sitting on a stack of lumber, holding a bandaged right hand, a hard hat beside him on the lumber. A fallen ladder is visible in the background. The LEGAL PROFESSIONAL stands next to him holding a clipboard with a confident smile, gesturing at the site. Background: scaffolding, a yellow crane, simplified buildings in the distance, bright daylight, simplified 3D, Pixar aesthetic. ${STYLE_BLOCK}`,
        headline: "HURT\non the job?",
        subhead: "Workers' comp\nis just the start.",
        cta: "Free consult.\nNo fees until you win.",
      },
      {
        scene: `${CHARACTERS}\n\nScene: A warehouse with stacked boxes. The INJURED WORKER is on the floor, a heavy box on his foot (he's holding his foot, an "ouch" expression), a yellow "CAUTION WET FLOOR" sign tipped over nearby. The LEGAL PROFESSIONAL is kneeling beside him, hand on his shoulder, looking at the camera reassuringly. Background: pallet racking, forklift in the distance, simplified 3D. ${STYLE_BLOCK}`,
        headline: "SLIPPED\nat work?",
        subhead: "Report it.\nThen call us.",
        cta: "Free case review\ntoday.",
      },
      {
        scene: `${CHARACTERS}\n\nScene: A scaffolding accident scene. The INJURED WORKER is on a stretcher being attended to by a stylized paramedic character, a neck brace on. Below, the LEGAL PROFESSIONAL is interviewing a worried co-worker in a yellow vest, taking notes on a tablet. Background: high-rise construction site, blue sky, simplified 3D, Pixar aesthetic. ${STYLE_BLOCK}`,
        headline: "FELL\nfrom height?",
        subhead: "OSHA violations\n= bigger settlements.",
        cta: "Free consult.\nConfidential.",
      },
    ],
  },

  // 6. Pedestrian accident
  {
    id: "cartoon-pedestrian-crosswalk",
    label: "Pedestrian — crosswalk",
    category: "pedestrian",
    topic: "pedestrian",
    defaultHeadline: "HIT\nwalking?",
    defaultSubhead: "Walk-sign or not.\nTheir duty still applies.",
    defaultCta: "Free consult.",
    variants: [
      {
        scene: `${CHARACTERS}\n\nScene: A stylized crosswalk at an intersection. A cartoon blue sedan has stopped too late, its front bumper just touching the crosswalk. The INJURED WORKER is on the hood of the car (a classic windshield-claim gag), arms flailing, dazed, a small bandage on his head. The LEGAL PROFESSIONAL is standing beside the car, arms crossed, looking at the camera with a confident "we've got this" smile. Background: traffic light, stylized storefronts, soft daylight, simplified 3D, Pixar aesthetic. ${STYLE_BLOCK}`,
        headline: "HIT\nwalking?",
        subhead: "Walk-sign or not.\nTheir duty still applies.",
        cta: "Free consult.",
      },
      {
        scene: `${CHARACTERS}\n\nScene: A suburban crosswalk at dusk. A grey minivan has clipped a pedestrian. The INJURED WORKER is on the ground holding his knee (white cast), a worried driver standing over him with hands raised apologetically. The LEGAL PROFESSIONAL is already at the scene, kneeling next to the worker, hand on his shoulder, looking at the driver with a confident firm expression. Background: trees, a "SCHOOL" crossing sign, soft streetlight, simplified 3D. ${STYLE_BLOCK}`,
        headline: "HIT\nin a crosswalk?",
        subhead: "Walk-sign or not.\nTheir duty still applies.",
        cta: "Free consult.\nNo fees until you win.",
      },
    ],
  },

  // 7. Medical bills / financial worry
  {
    id: "cartoon-medical-bills",
    label: "Medical bills — post-treatment",
    category: "ugc",
    topic: "medical_bills",
    defaultHeadline: "BILLS\npiling up?",
    defaultSubhead: "You didn't pay\nfor this accident.",
    defaultCta: "Free case review.",
    variants: [
      {
        scene: `${CHARACTERS}\n\nScene: A stylized home dining table overflowing with paper medical bills, EOB statements, and a small stack of past-due notices. The INJURED WORKER is sitting at the table, head in his hands, neck in a soft cervical collar, looking defeated. His worried wife stands behind him, hand on his shoulder, looking at the camera. The LEGAL PROFESSIONAL is at the door, holding a giant manila envelope marked with a stylized dollar sign, smiling reassuringly. Background: simplified home interior, warm lighting, Pixar aesthetic. ${STYLE_BLOCK}`,
        headline: "BILLS\npiling up?",
        subhead: "You didn't pay\nfor this accident.",
        cta: "Free case review.",
      },
      {
        scene: `${CHARACTERS}\n\nScene: A stylized hospital hallway. The INJURED WORKER is walking out with a cane and a small cast on his wrist, his wife carrying a paper bag of prescriptions. The LEGAL PROFESSIONAL is in the foreground holding a giant "WE'LL FIGHT THIS" sign (no actual text — just a giant gold shield with a check mark). Background: simplified hospital reception, nurse station, soft clean lighting, Pixar aesthetic. ${STYLE_BLOCK}`,
        headline: "OUT OF\nthe hospital\nNOW WHAT?",
        subhead: "The bills don't\nhave to be yours.",
        cta: "Free consult.\nNo fees until you win.",
      },
    ],
  },
];

// ── HELPERS ────────────────────────────────────────────────────────────

export function getCartoonTemplate(id?: string | null): CartoonTemplateDef | null {
  if (!id) return null;
  return CARTOON_TEMPLATES.find(t => t.id === id) || null;
}

/** Pick a template that matches the campaign category, with topic rotation. */
export function pickCartoonTemplateForCategory(
  category: string,
  seed?: string | null
): CartoonTemplateDef {
  const matches = CARTOON_TEMPLATES.filter(t => t.category === category);
  const pool = matches.length > 0 ? matches : CARTOON_TEMPLATES;
  // Deterministic pick from seed so the same slot id always renders the same template,
  // but different slot ids rotate through the pool.
  const idx = hashSeed(seed || category) % pool.length;
  return pool[idx];
}

/** Pick a variant for a given template. Deterministic per (template, seed). */
export function pickCartoonVariant(
  template: CartoonTemplateDef,
  seed?: string | null
): CartoonVariant {
  if (template.variants.length === 0) {
    return {
      scene: "",
      headline: template.defaultHeadline,
      subhead: template.defaultSubhead,
      cta: template.defaultCta,
    };
  }
  const idx = hashSeed(`${template.id}:${seed || "default"}`) % template.variants.length;
  return template.variants[idx];
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ── PROMPT BUILDER ─────────────────────────────────────────────────────

/**
 * Build the final image-model prompt for a cartoon still.
 * Includes:
 *  - style block (locked Pixar aesthetic)
 *  - the picked variant scene
 *  - explicit "no text in the image" guard (we composite text ourselves)
 *  - explicit "leave bottom 15% empty" guard (so the orange footer fits cleanly)
 */
export function buildCartoonImagePrompt(
  template: CartoonTemplateDef,
  variant: CartoonVariant
): string {
  return [
    variant.scene,
    "",
    "ADDITIONAL RULES (must follow):",
    "- The cartoon scene fills the upper ~85% of the image.",
    "- The bottom ~15% of the image must be left as a clean, even, uncluttered solid-color zone (no characters, no props, no scenery touching this strip). The image-generation model does NOT draw the orange footer — that is composited on top afterwards.",
    "- Do NOT draw any text, letters, numbers, logos, watermarks, phone numbers, or URLs anywhere in the image. The model must output pure illustration only.",
  ].join("\n");
}

/**
 * Build the full text overlay spec for the still.
 * The composer uses this to draw the navy panel + orange footer + fine print.
 */
export type CartoonOverlaySpec = {
  templateId: string;
  variantIndex: number;
  headline: string;
  subhead: string;
  cta: string;
  small: string; // the "No account required. Start with 4 simple details." line
  footerLeft: string;
  footerRight: string;
  finePrint: string;
};

export function buildCartoonOverlaySpec(
  template: CartoonTemplateDef,
  variant: CartoonVariant,
  variantIndex: number
): CartoonOverlaySpec {
  return {
    templateId: template.id,
    variantIndex,
    headline: variant.headline || template.defaultHeadline,
    subhead: variant.subhead || template.defaultSubhead,
    cta: variant.cta || template.defaultCta,
    small: "No account required.\nStart with 4 simple details.",
    footerLeft: "CaseClosedFL.com  |  (561) 566-1360",
    footerRight: "CaseClosedFL",
    finePrint: "Not a law firm  ·  No legal advice  ·  No outcome guarantees",
  };
}
