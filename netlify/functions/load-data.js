const { getStore } = require('@netlify/blobs');

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const store = getStore({ name: 'dinner-board', consistency: 'strong' });

    // Load all data categories in parallel
    const [meals, fam, dayMenus, ings, reqs, sugs, dayData] = await Promise.all([
      store.get('meals', { type: 'json' }),
      store.get('fam', { type: 'json' }),
      store.get('dayMenus', { type: 'json' }),
      store.get('ings', { type: 'json' }),
      store.get('reqs', { type: 'json' }),
      store.get('sugs', { type: 'json' }),
      store.get('dayData', { type: 'json' }),
    ]);

    return {
      statusCode: 200,
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
      body: JSON.stringify({ error: 'Failed to load: ' + err.message })
    };
  }
};
