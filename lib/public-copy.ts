const OPERATOR =
  /ONE CONTINUOUS SHOT|Calendar variation|Campaign mission|professional wardrobe|newsroom credibility|8-second attention|attention-grabbing hook|Comprehensive campaign for|Fill Calendar|visual direction|wardrobe standard|canonical spokesperson|Generate a campaign|Photorealistic vertical|Subject\/reference objective|operator language|AI language|Raise awareness about|educate, build trust|drive consultation/i;

export type PublicCopy = { hook: string; caption: string };

const PACKAGES: Record<string, PublicCopy[]> = {
  car_accident: [
    {
      hook: "After a crash, start here.",
      caption:
        "After a collision, document the scene only when it is safe. Save photos, exchange contact and insurance details, and keep relevant records.\n\nGeneral information only—not legal advice.\n\n#Florida #CarAccidentSafety #KnowYourNextStep"
    },
    {
      hook: "Don't leave empty-handed.",
      caption:
        "If everyone is safe, photograph vehicle positions, visible damage, and the roadway before anything is moved. Keep names, numbers, and insurance cards together.\n\nGeneral information only—not legal advice.\n\n#Florida #CrashTips #DocumentTheScene"
    },
    {
      hook: "Safety first. Then the details.",
      caption:
        "Check for injuries and call for help before you pick up a phone for photos. When it is safe, capture the scene, contacts, and insurance information so you are not relying on memory later.\n\nGeneral information only—not legal advice.\n\n#Florida #CarAccident #StaySafe"
    },
    {
      hook: "What to save after a collision.",
      caption:
        "Photos of the scene, driver and insurance details, and any witness contacts can disappear fast. Collect them only when it is safe, then get medical care if you need it.\n\nGeneral information only—not legal advice.\n\n#KnowYourNextStep #FloridaDrivers #AccidentInfo"
    },
    {
      hook: "The scene changes fast.",
      caption:
        "Cars get towed. Debris gets cleared. Lighting changes. If it is safe, take photos before the roadway returns to normal, and keep a simple record of who you spoke with.\n\nGeneral information only—not legal advice.\n\n#Florida #CarAccidentSafety #PreserveTheScene"
    },
    {
      hook: "A calm next step.",
      caption:
        "You do not need a perfect statement on the roadside. Get to safety, document what you can, exchange information, and follow up with a medical check if anything feels off.\n\nGeneral information only—not legal advice.\n\n#Florida #AfterACrash #PracticalSteps"
    },
    {
      hook: "Keep the facts, not the guesswork.",
      caption:
        "Write down time, location, weather, and who was involved while it is fresh. Save photos and insurance details. Skip guesses about fault on the spot.\n\nGeneral information only—not legal advice.\n\n#Florida #CarAccident #KnowYourNextStep"
    }
  ],
  rideshare: [
    {
      hook: "Rideshare crash? Save this.",
      caption:
        "After a rideshare collision, get to safety first. Then save the trip details, driver/vehicle info, photos if it is safe, and a record of who you contacted.\n\nGeneral information only—not legal advice.\n\n#RideshareSafety #Florida #KnowYourNextStep"
    }
  ],
  trucking: [
    {
      hook: "Commercial crash scenes move fast.",
      caption:
        "After a truck collision, safety comes first. If it is safe, photograph vehicle positions, nearby conditions, and identifying details before the scene is cleared.\n\nGeneral information only—not legal advice.\n\n#TruckAccident #Florida #DocumentTheScene"
    }
  ],
  slip_fall: [
    {
      hook: "If you fall, document the condition.",
      caption:
        "Once you are safe, photograph the area, lighting, and what caused the fall if it is still visible. Report it, get medical care if you need it, and keep those records.\n\nGeneral information only—not legal advice.\n\n#PremisesSafety #Florida #KnowYourNextStep"
    }
  ],
  ugc: [
    {
      hook: "One useful next step.",
      caption:
        "Keep it practical: stay safe, save what you can document, and follow up. No hype, no invented results.\n\nGeneral information only—not legal advice.\n\n#KnowYourNextStep"
    }
  ]
};

function packagesFor(category: string): PublicCopy[] {
  const key = category === "vehicle_accident" ? "car_accident" : category;
  return PACKAGES[key] || PACKAGES.car_accident;
}

export function isOperatorCopy(text: unknown): boolean {
  const t = String(text || "").trim();
  if (!t) return true;
  if (OPERATOR.test(t)) return true;
  if (t.length > 280 && /wardrobe|newsroom|mission|ONE CONTINUOUS/i.test(t)) return true;
  return false;
}

export function dayIndexFromTitle(title?: string | null): number {
  const match = /Day\s+(\d+)/i.exec(String(title || ""));
  const n = match ? Number(match[1]) : 1;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

export function publicCaptionForSlot(input: {
  category?: string | null;
  title?: string | null;
  hook?: string | null;
  caption?: string | null;
  mission?: string | null;
}): PublicCopy {
  const packs = packagesFor(String(input.category || "car_accident"));
  const fallback = packs[(dayIndexFromTitle(input.title) - 1) % packs.length];
  const hook =
    input.hook && !isOperatorCopy(input.hook) && input.hook.trim().length <= 120
      ? input.hook.trim()
      : fallback.hook;
  let caption = String(input.caption || "").trim();
  if (isOperatorCopy(caption) || caption === String(input.mission || "").trim()) {
    caption = fallback.caption;
  }
  if (hook && !caption.toLowerCase().startsWith(hook.toLowerCase())) {
    caption = `${hook}\n\n${caption}`;
  }
  if (!/not legal advice/i.test(caption)) {
    caption = `${caption.trim()}\n\nGeneral information only—not legal advice.`;
  }
  return { hook: hook.slice(0, 120), caption: caption.slice(0, 2200) };
}
