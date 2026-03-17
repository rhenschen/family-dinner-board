const { getStore } = require('@netlify/blobs');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const store = getStore({ name: 'dinner-board', consistency: 'strong' });

    // Load all data categories in parallel
    const [meals, fam, dayMenus, ings, reqs, sugs, dayData] = await Promise.all([
      store.get('meals', { type: 'json' }).catch(() => null),
      store.get('fam', { type: 'json' }).catch(() => null),
      store.get('dayMenus', { type: 'json' }).catch(() => null),
      store.get('ings', { type: 'json' }).catch(() => null),
      store.get('reqs', { type: 'json' }).catch(() => null),
      store.get('sugs', { type: 'json' }).catch(() => null),
      store.get('dayData', { type: 'json' }).catch(() => null),
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        meals: meals,
        fam: fam,
        dayMenus: dayMenus,
        ings: ings,
        reqs: reqs,
        sugs: sugs,
        dayData: dayData,
      })
    };
  } catch (err) {
    console.error('Load error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to load: ' + err.message })
    };
  }
};
