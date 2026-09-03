import { marketingTerms } from "./catalog.ts";
import type { MarketingCategory, MarketingTerm, UsageGuide } from "./types.ts";

interface CategoryPlaybook {
  when: string;
  where: string;
  how: string;
  why: string;
  caution?: string;
}

const categoryPlaybooks: Record<MarketingCategory, CategoryPlaybook> = {
  "advertising-creative": {
    when: "Use during campaign concepting, production, testing, or creative refreshes.",
    where: "Use in paid social, video, display, landing-page, and creator briefs.",
    how: "Tie it to one audience insight and one conversion goal; build a controlled version, launch it, and compare it with the current control.",
    why: "It turns strategy into something the audience can notice, understand, and act on.",
  },
  "offers-conversion": {
    when: "Use when designing the value exchange or removing purchase hesitation.",
    where: "Use on pricing, product, sales, landing, checkout, and post-purchase pages.",
    how: "Define the customer outcome, quantify value where defensible, reduce legitimate risk, and test the change against profit—not conversion rate alone.",
    why: "It affects whether attention becomes economically useful customer action.",
    caution: "Never fabricate scarcity, urgency, savings, guarantees, or proof.",
  },
  "funnels-journeys": {
    when: "Use when mapping, building, diagnosing, or automating movement between customer stages.",
    where: "Use across ads, pages, forms, checkout, email, onboarding, product, and support.",
    how: "Assign an audience state, desired next action, owner, event, and success metric to every step; remove dead ends and unnecessary handoffs.",
    why: "It makes the complete customer path visible and measurable instead of optimizing isolated assets.",
  },
  copywriting: {
    when: "Use when turning research and positioning into persuasive language.",
    where: "Use in ads, scripts, landing pages, email, product UI, sales collateral, and offers.",
    how: "Start with Voice-of-Customer evidence, match the reader's awareness level, make one defensible promise, support it with proof, and end with a specific next step.",
    why: "It helps the audience quickly understand relevance, value, credibility, and action.",
  },
  "consumer-psychology": {
    when: "Use when diagnosing attention, comprehension, motivation, choice, or memory—not as a substitute for product value.",
    where: "Use in research, messaging, pricing presentation, UX, onboarding, loyalty, and experimentation.",
    how: "Form a behavioral hypothesis, make the smallest transparent intervention, test it with a control, and check for harm or unintended pressure.",
    why: "It explains predictable decision patterns that can make experiences clearer and easier.",
    caution: "Use transparently. Do not create dark patterns, fake pressure, hidden defaults, or exploit vulnerable audiences.",
  },
  "strategy-positioning": {
    when: "Use before channel execution and whenever growth stalls because the market, audience, category, or advantage is unclear.",
    where: "Use in planning, research, product strategy, go-to-market documents, briefs, and executive decisions.",
    how: "Ground it in customer and competitive evidence, choose explicit tradeoffs, document the decision, and translate it into audience, message, offer, and channel rules.",
    why: "It concentrates resources on a coherent way to create and capture value.",
  },
  branding: {
    when: "Use when creating or measuring memory structures and consistent market perception over time.",
    where: "Use across identity, product, packaging, campaigns, retail, support, partnerships, and employer communications.",
    how: "Define the intended association, encode it in repeatable verbal and visual assets, apply it consistently, and measure recognition and perception in the target market.",
    why: "It increases recognition, trust, salience, and long-term demand beyond a single campaign.",
  },
  "paid-media": {
    when: "Use when planning, buying, optimizing, or evaluating paid distribution.",
    where: "Use in ad-platform setup, analytics, finance models, experiments, and reporting dashboards.",
    how: "Write the exact numerator, denominator, attribution window, data source, and decision threshold before launch; segment results and compare incrementally where possible.",
    why: "It links media delivery to customer and financial outcomes.",
    caution: "Attributed performance is not automatically causal; use holdouts or lift tests for incrementality.",
  },
  "growth-lifecycle": {
    when: "Use when growth depends on repeated acquisition, activation, retention, referral, or expansion behavior.",
    where: "Use in product analytics, lifecycle messaging, experiments, community, partnerships, and revenue planning.",
    how: "Define the value event, segment users into cohorts, change one part of the loop, and measure downstream retention and unit economics.",
    why: "It shifts optimization from one-time acquisition toward compounding customer value.",
  },
  "content-seo-social": {
    when: "Use when earning discoverability, attention, authority, or engagement through search and social channels.",
    where: "Use on websites, search engines, social platforms, creator channels, and editorial calendars.",
    how: "Map a real audience question to its intent, publish the most useful format, distribute it, connect it to a next step, and update it using performance evidence.",
    why: "It creates discoverable assets that can build demand and trust over time.",
  },
  "email-crm": {
    when: "Use when managing permissioned relationships, qualification, segmentation, follow-up, or lifecycle communication.",
    where: "Use in CRM, email, marketing automation, sales handoffs, customer success, and support systems.",
    how: "Collect consent, define the lifecycle rule and trigger, personalize only with reliable data, suppress ineligible contacts, and monitor delivery and downstream action.",
    why: "It coordinates relevant communication while preserving customer history and permission.",
    caution: "Honor consent, privacy, suppression, and applicable messaging laws in every workflow.",
  },
  "research-analytics": {
    when: "Use before making uncertain decisions and after execution to distinguish signal from noise.",
    where: "Use in discovery, analytics implementation, dashboards, experimentation, usability work, and decision reviews.",
    how: "State the decision and hypothesis first, choose an appropriate method and sample, record limitations, and connect findings to a concrete action.",
    why: "It reduces guesswork and makes marketing decisions falsifiable and improvable.",
  },
  "strategic-shorthand": {
    when: "Use when the concept accurately describes the business, commercial constraint, document, or operating metric.",
    where: "Use in planning, finance, sales, procurement, operations, product, and cross-functional communication.",
    how: "Define the term once for the team, state its scope and calculation where relevant, and avoid using the acronym as a substitute for a decision.",
    why: "It gives teams a compact shared language for recurring commercial concepts.",
  },
};

const exactHow: Readonly<Record<string, string>> = {
  "video sales letter": "Build a hook, problem, mechanism, proof, offer, objection handling, guarantee, and CTA; match length to awareness and traffic temperature.",
  hook: "Write several openings around pain, desire, curiosity, proof, and contrast; test the opening independently using hold-rate and qualified-action metrics.",
  "call to action": "Ask for one specific next action, state what happens next, use concrete button or spoken language, and remove competing actions.",
  offer: "Combine the product, promised outcome, price, terms, bonuses, proof, and risk reversal into one clear value exchange.",
  "a/b test": "Preselect one primary metric and minimum sample, randomly split eligible traffic, change one meaningful variable, and run to the stopping rule.",
  "multivariate test": "Use only with enough traffic to estimate interactions; predefine combinations and analyze them without repeatedly peeking.",
  scarcity: "Show only a real inventory, capacity, access, or availability limit and explain what changes when the limit is reached.",
  urgency: "State a real time-sensitive reason, exact deadline, timezone, and post-deadline consequence.",
  "customer interview": "Ask about a specific past behavior, trigger, alternatives, decision process, and outcome; avoid pitching or asking hypothetical leading questions.",
  "voice of customer": "Collect exact phrases from interviews, calls, reviews, search queries, and support tickets; tag recurring pains, desired outcomes, objections, and triggers.",
  "conversion rate": "Calculate conversions divided by eligible opportunities for the same population and interval; report the denominator and uncertainty.",
  "return on ad spend": "Calculate attributed revenue divided by ad spend, then pair it with margin, returns, attribution limits, and incrementality evidence.",
  "customer acquisition cost": "Divide all relevant sales and marketing acquisition expense by new customers for the same cohort and period.",
  "customer lifetime value": "Estimate cohort contribution profit across the expected relationship; document retention, margin, discounting, and horizon assumptions.",
  "statistical significance": "Choose the hypothesis, error rate, power, effect size, and sample plan before analysis; also report practical effect size and uncertainty.",
  "ideal customer profile": "Score observable firmographic or customer attributes against retention, expansion, sales effort, margin, and product success evidence.",
  positioning: "Define the target, category or frame of reference, differentiated value, proof, and explicit alternatives in a one-page positioning statement.",
  "jobs to be done": "Interview recent switchers about the situation, push, pull, anxieties, and habits; describe the progress sought rather than demographics alone.",
  "lead magnet": "Solve one narrow, urgent problem quickly, preview the paid value, request only necessary data, and connect delivery to a relevant nurture path.",
  onboarding: "Identify the first value event, remove setup friction, guide the shortest successful path, and measure time-to-value and retained activation.",
  "utm parameters": "Apply a documented lowercase naming convention for source, medium, campaign, content, and term; preserve values through redirects and QA every link.",
};

const normalize = (value: string): string =>
  value.toLocaleLowerCase("en-US").replace(/[–—]/g, "-").replace(/[^a-z0-9:]+/g, " ").trim();

export function findTerms(query: string): MarketingTerm[] {
  const key = normalize(query);
  if (!key) return [];
  const exact = marketingTerms.filter((term) =>
    [term.name, ...term.aliases].some((candidate) => normalize(candidate) === key),
  );
  if (exact.length) return exact;
  return marketingTerms.filter((term) =>
    [term.name, term.definition, ...term.aliases].some((candidate) => normalize(candidate).includes(key)),
  );
}

export function explainTerm(term: MarketingTerm): UsageGuide {
  const defaults = categoryPlaybooks[term.category];
  const guide: UsageGuide = {
    ...term,
    when: defaults.when,
    where: defaults.where,
    how: exactHow[normalize(term.name)] ?? `${defaults.how} Operational definition: ${term.definition}`,
    why: `${term.definition} ${defaults.why}`,
  };
  if (defaults.caution) guide.caution = defaults.caution;
  return guide;
}

export function explainAllTerms(): UsageGuide[] {
  return marketingTerms.map(explainTerm);
}
