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
    // Extract the recipe name from the URL path instead of scraping the page.
    // Most recipe sites encode the dish name in the URL slug, e.g.:
    //   allrecipes.com/recipe/12345/chicken-parmesan/
    //   simplyrecipes.com/chicken-tikka-masala-recipe/
    // This avoids 403/402 blocks from recipe sites that reject server-side fetches.
    const recipeName = extractRecipeNameFromUrl(url);

    const prompt = `You are a recipe ingredient expert. A user wants the ingredient list for a recipe.

Recipe URL: ${url}
${recipeName ? `Recipe name (from URL): ${recipeName}` : ''}

Identify the exact recipe from the URL and recipe name. Then provide the COMPLETE ingredient list with precise quantities, as a home cook would need to shop for this dish (typically serves 4-6).

Return ONLY a valid JSON array of objects. Each object must have:
- "n": ingredient name (e.g. "chicken breast", "olive oil", "garlic cloves")
- "q": quantity with unit (e.g. "2 lbs", "3 tbsp", "4 cloves")

Example format: [{"n":"chicken breast","q":"2 lbs"},{"n":"olive oil","q":"2 tbsp"}]

Return ONLY the JSON array, no other text, no markdown, no explanation.`;

    const response = await axios.post(baseUrl + 'v1/messages', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
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
    if (!match) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ingredients: [] }),
      };
    }

    const parsed = JSON.parse(match[0]);

    // Normalize: ensure every element is {n, q} as the frontend expects
    const ingredients = parsed.map((item) => {
      if (typeof item === 'string') {
        return { n: item, q: '' };
      }
      return { n: item.n || item.name || '', q: item.q || item.quantity || item.amount || '' };
    }).filter((item) => item.n);

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

// Pull the human-readable recipe name out of a URL slug
function extractRecipeNameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    // Remove leading/trailing slashes, split on slashes
    const segments = pathname.replace(/^\/|\/$/g, '').split('/');
    // Find the best slug — usually the longest segment with dashes (the recipe title)
    let best = '';
    for (const seg of segments) {
      // Skip purely numeric segments (IDs) and very short ones
      if (/^\d+$/.test(seg) || seg.length < 3) continue;
      // Prefer longer, hyphenated segments (recipe names)
      if (seg.length > best.length) best = seg;
    }
    // Convert slug to readable name: "chicken-parmesan-recipe" → "chicken parmesan"
    return best
      .replace(/-recipe$/i, '')
      .replace(/[-_]/g, ' ')
      .trim();
  } catch {
    return '';
  }
}
