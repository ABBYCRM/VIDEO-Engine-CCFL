export async function searchDuckDuckGo(query: string) {
  const url = new URL('https://api.duckduckgo.com/');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('no_html', '1');
  url.searchParams.set('skip_disambig', '1');

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': process.env.DUCKDUCKGO_APP_NAME || 'video-engine'
    },
    next: { revalidate: 60 }
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo lookup failed: ${response.status}`);
  }

  return response.json();
}
