const axios = require('axios');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method not allowed' }) };
  }

  const { url } = JSON.parse(event.body);
  if (!url) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Missing recipe URL' }) };
  }

  const apiKey = process.env.ANTHRPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ message: 'API key not configured' }) };
  }

  try {
    // Fetch the recipe page
    const page = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FamilyDinnerBoard/1.0)' },
      timeout: 10000,
    });

    // Extract text content (strip HTML tags for a cleaner prompt)
    const text = page.data.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 12000);

    // Ask Claude to extract ingredients as {n, q} objects matching frontend format
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Extract all ingredients from this recipe page. Return ONLY a JSON array of objects with "n" (ingredient name) and "q" (quantity with unit) fields. Example: [{"n":"flour","q":"2 cups"},{"n":"salt","q":"1 tsp"}]. No other text.\n\n${text}`
      }]
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
        // Split "2 cups flour" into quantity and name
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
