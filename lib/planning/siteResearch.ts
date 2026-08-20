export async function crawlSite(url: string) {
  // Skeleton-only crawler. Replace with real fetch + parsing + robots compliance.
  return {
    url,
    title: 'Pending crawl',
    summary: 'Site crawl wiring point. Fetch the website, summarize practice areas, offers, proof points, forms, and CTAs.',
    primaryCtas: ['Free consultation', 'Call now', 'Submit case review'],
    pagesToInspect: ['home', 'practice areas', 'about', 'results', 'faq', 'contact']
  };
}

export async function analyzeCompetitors(seed: string) {
  return {
    query: seed,
    angles: [
      'Local proof and speed-to-contact',
      'Simple next-step education',
      'Trust-building spokesperson delivery'
    ],
    todo: 'Connect search/news provider and ad libraries for live competitor capture.'
  };
}
