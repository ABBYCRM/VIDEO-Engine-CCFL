import crypto from "node:crypto";

// Peer-to-peer review cards for the Clients Say still template. Varied tone
// and star counts so the feed never repeats one identical glowing quote.
// Rules: no outcome or money claims, no settlement promises, first name +
// city only. Curly apostrophes only (straight quotes break ffmpeg drawtext).
export type ReviewCard = { stars: number; lines: string[]; attribution: string };

export const REVIEW_CARDS: ReviewCard[] = [
  { stars: 5, lines: ["Real people answered", "every time I called.", "That mattered to me."], attribution: "\u2014 Denise \u00b7 Boca Raton" },
  { stars: 4, lines: ["Kept it simple and", "never pushed me.", "I liked that."], attribution: "\u2014 Marcus \u00b7 Fort Lauderdale" },
  { stars: 5, lines: ["Plain English answers.", "No runaround. No", "weird pressure."], attribution: "\u2014 Carla \u00b7 West Palm Beach" },
  { stars: 4, lines: ["Quick replies and zero", "pressure. Wish I had", "called sooner."], attribution: "\u2014 Jay \u00b7 Delray Beach" },
  { stars: 5, lines: ["I had no clue where to", "start after my wreck.", "They laid out steps."], attribution: "\u2014 Tanya \u00b7 Lake Worth" },
  { stars: 4, lines: ["Not flashy. Just steady", "help week after week."], attribution: "\u2014 Rob \u00b7 Boynton Beach" },
  { stars: 5, lines: ["They checked in even", "when I forgot to.", "Felt looked after."], attribution: "\u2014 Priya \u00b7 Jupiter" },
  { stars: 5, lines: ["Straight answers even", "when it was not what I", "hoped to hear."], attribution: "\u2014 Luis \u00b7 PB Gardens" },
  { stars: 4, lines: ["Answered my late night", "texts. Small thing but", "it meant a lot."], attribution: "\u2014 Keisha \u00b7 Wellington" },
  { stars: 5, lines: ["My cousin used them", "first. Now I get why", "she kept saying call."], attribution: "\u2014 Dan \u00b7 Port St. Lucie" }
];

export function pickReviewCard(seed?: string | null): ReviewCard {
  if (seed) {
    const h = crypto.createHash("sha1").update(String(seed)).digest();
    return REVIEW_CARDS[h.readUInt32BE(0) % REVIEW_CARDS.length];
  }
  return REVIEW_CARDS[Math.floor(Math.random() * REVIEW_CARDS.length)];
}
