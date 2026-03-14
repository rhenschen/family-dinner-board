const axios = require('axios');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method not allowed' }) };
  }

  const { url } = JSON.parse(event.body);
  if (!url) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Missing recipe URL' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/';
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ message: 'API key not configured' }) };
  }

  try {
    // Try to fetch the recipe page with browser-like headers
    let pageText = '';
    try {
      const page = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        timeout: 10000,
        maxRedirects: 5,
      });
      pageText = page.data.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 12000);
    } catch (fetchErr) {
      // Page fetch failed — we'll ask Claude to work from the URL alone
      pageText = '';
    }

    // Build the prompt depending on whether we got page content
    let prompt;
    if (pageText.length > 100) {
      prompt = `Extract all ingredients from this recipe page. Return ONLY a JSON array of objects with "n" (ingredient name) and "q" (quantity with unit) fields. Example: [{"n":"flour","q":"2 cups"},{"n":"salt","q":"1 tsp"}]. No other text.\n\n${pageText}`;
    } else {
      prompt = `I have a recipe at this URL: ${url}\nBased on the recipe name/URL, identify the dish and list its typical ingredients. Return ONLY a JSON array of objects with "n" (ingredient name) and "q" (quantity with unit) fields. Example: [{"n":"flour","q":"2 cups"},{"n":"salt","q":"1 tsp"}]. No other text.`;
    }

    // Call Claude via Netlify AI Gateway (uses ANTHROPIC_BASE_URL)
    const response = await axios.post(baseUrl + 'v1/messages', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 30000,
    });

    const content = response.data.content[0].text.trim();
    // Parse the JSON array from Claude's response
    const match = content.match(/\[[\s\S]*\]/);
    const parsed = match ? JSON.parse(match[0]) : [];

    // Normalize: ensure every element is {n, q} as the frontend expects
    const ingredients = parsed.map((item) => {
      if (typeof item === 'string') {
        const m = item.match(/^([\d\u00BC-\u00BE\u2150-\u215E\/.\s-]+\s*\w+)\s+(.+)$/);
        return m ? { n: m[2].trim(), q: m[1].trim() } : { n: item, q: '' };
      }
      return { n: item.n || '', q: item.q || '' };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ingredients }),
    };
  } catch (error) {
    return {
      statusCode: error.response ? error.response.status : 500,
      body: JSON.stringify({ message: error.message }),
    };
  }
};
