import axios from 'axios';

export async function tavilySearch(query: string) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    console.warn('[Tavily] No API key set');
    return [];
  }
  const endpoint = 'https://api.tavily.com/search';
  console.log('[Tavily] Attempt search', { endpoint, query });
  try {
    const res = await axios.post(endpoint, {
      api_key: key,
      query,
      max_results: 3
    });
    const results = res.data.results ?? [];
    console.log('[Tavily] Success', { query, resultCount: results.length });
    return results;
  } catch (e:any) {
    console.error('[Tavily] Error', { endpoint, query, status: e.response?.status, data: e.response?.data, message: e.message });
    throw e;
  }
}
