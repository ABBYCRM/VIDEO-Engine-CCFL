const OPERATOR =
  /ONE CONTINUOUS SHOT|Calendar variation|Campaign mission|professional wardrobe|newsroom credibility|8-second attention|attention-grabbing hook|Comprehensive campaign for|Fill Calendar|visual direction|wardrobe standard|canonical spokesperson|Generate a campaign|Photorealistic vertical|Subject\/reference objective|operator language|AI language|Raise awareness about|educate, build trust|drive consultation/i;

export type PublicCopy = { hook: string; caption: string };

const CTA = "CaseClosedFL.com connects you with the best attorneys in Florida — free consultation, no pressure.";

const PACKAGES: Record<string, PublicCopy[]> = {
  car_accident: [
    {
      hook: "This one thing changes everything after a crash.",
      caption:
        `Most people don't realize the first few minutes after a car accident can shape the entire outcome. If it's safe, document the scene, exchange contact and insurance info, and get checked out.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #CarAccident #CaseClosedFL`
    },
    {
      hook: "People still don't know this about car accidents.",
      caption:
        `Insurance companies move fast after a crash — and they're not working for you. Save your photos, records, and any witness info before it disappears.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #KnowYourRights #CaseClosedFL`
    },
    {
      hook: "The mistake most drivers make after a crash.",
      caption:
        `Talking to the other insurance company before you talk to anyone else? That's the #1 mistake. Get safe, get documented, get informed first.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #CarAccidentTips #CaseClosedFL`
    },
    {
      hook: "One call can change your entire case.",
      caption:
        `Before you sign anything or say more than you have to, know who's actually in your corner.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #CarAccident #CaseClosedFL`
    },
    {
      hook: "This is the one thing insurance adjusters hope you skip.",
      caption:
        `A full record of the scene — photos, damage, contacts — is your strongest asset after a crash. Don't rely on memory.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #CarAccidentSafety #CaseClosedFL`
    },
    {
      hook: "Still don't know your rights after a crash?",
      caption:
        `You're not alone — most people don't, until it's too late. Get the facts, get checked out, and get connected to real help.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #KnowYourNextStep #CaseClosedFL`
    },
    {
      hook: "The clock starts the moment it happens.",
      caption:
        `Evidence disappears fast after a crash — the scene gets cleared, memories fade. Document what you can, safely, and don't wait to get advice.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #CarAccident #CaseClosedFL`
    }
  ],
  rideshare: [
    {
      hook: "This one thing matters most after a rideshare crash.",
      caption:
        `Rideshare accidents involve extra layers — the driver's insurance, the platform's insurance, and yours. Get safe first, then document everything.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #RideshareAccident #CaseClosedFL`
    },
    {
      hook: "People still don't know this about Uber and Lyft accidents.",
      caption:
        `Which insurance policy applies can depend on whether the driver was on a trip, waiting for one, or offline. Save your trip receipt and screenshots.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #Rideshare #CaseClosedFL`
    },
    {
      hook: "The mistake riders make after a rideshare crash.",
      caption:
        `Accepting a quick settlement offer before you know the full picture can cost you later. Get informed before you sign anything.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #RideshareSafety #CaseClosedFL`
    },
    {
      hook: "One decision after a rideshare crash can change everything.",
      caption:
        `Before you talk to the driver's insurance or the platform, know your options.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #Rideshare #CaseClosedFL`
    },
    {
      hook: "This is what rideshare companies hope you don't ask.",
      caption:
        `Whether the app was active matters more than most riders realize. Save your ride history and any messages before they're gone.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #RideshareAccident #CaseClosedFL`
    }
  ],
  trucking: [
    {
      hook: "This one thing matters most after a truck accident.",
      caption:
        `Commercial trucking crashes involve companies, insurers, and evidence that can vanish fast — data logs, dashcam footage, maintenance records. Document what you safely can.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #TruckAccident #CaseClosedFL`
    },
    {
      hook: "People still don't know this about 18-wheeler crashes.",
      caption:
        `Trucking companies often send investigators to the scene within hours. Your own documentation matters just as much.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #TruckingAccident #CaseClosedFL`
    },
    {
      hook: "The mistake people make after a commercial truck crash.",
      caption:
        `Waiting too long to preserve evidence — like driver logs or black box data — can mean it's gone for good. Act early.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #TruckAccident #CaseClosedFL`
    },
    {
      hook: "One record can change a trucking case.",
      caption:
        `Photos of the scene, damage, and conditions can matter more than you'd expect in a commercial crash. Document safely, then get advice.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #Trucking #CaseClosedFL`
    },
    {
      hook: "This is what trucking companies hope you skip.",
      caption:
        `Preserving the evidence before it's gone is one of the biggest factors in a commercial crash case. Don't wait.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #TruckAccident #CaseClosedFL`
    }
  ],
  slip_fall: [
    {
      hook: "This one thing matters most after a fall.",
      caption:
        `Conditions that caused a slip-and-fall can be fixed or cleared within hours. If it's safe, photograph what caused it before it's gone.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #SlipAndFall #CaseClosedFL`
    },
    {
      hook: "People still don't know this about premises accidents.",
      caption:
        `Property owners have a duty to keep conditions safe — and evidence of a hazard matters. Document it, then get medical care.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #PremisesSafety #CaseClosedFL`
    },
    {
      hook: "The mistake most people make after a fall.",
      caption:
        `Not reporting it right away can weaken your case later. Report it, document it, and get checked out.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #SlipAndFall #CaseClosedFL`
    },
    {
      hook: "One photo can change everything after a fall.",
      caption:
        `The exact condition — wet floor, poor lighting, broken step — rarely stays the same for long. Capture it if it's safe to do so.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #PremisesAccident #CaseClosedFL`
    },
    {
      hook: "This is what property owners hope you don't do.",
      caption:
        `Document the hazard, report the incident, and get medical attention — in that order of safety, not urgency.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #SlipAndFall #CaseClosedFL`
    }
  ],
  ugc: [
    {
      hook: "This one thing people still don't know.",
      caption:
        `Whatever happened, the smartest first move is almost always the same: get safe, get documented, get informed.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #KnowYourNextStep #CaseClosedFL`
    },
    {
      hook: "People still don't know this simple step.",
      caption:
        `A little documentation now can save a lot of stress later. Keep it simple, keep it safe.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #CaseClosedFL`
    },
    {
      hook: "The one thing worth doing first.",
      caption:
        `Before anything else, make sure you're safe. Then document, then reach out for real answers.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #CaseClosedFL`
    },
    {
      hook: "This is the step most people skip.",
      caption:
        `Getting informed early changes everything about how the rest plays out. Don't guess — get real answers.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #CaseClosedFL`
    },
    {
      hook: "One decision. A different outcome.",
      caption:
        `The right first move is rarely complicated — it's just often skipped. Stay safe, stay documented, stay informed.\n\n${CTA}\n\nGeneral information only—not legal advice.\n\n#Florida #CaseClosedFL`
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
