const { getStore } = require('@netlify/blobs');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const data = JSON.parse(event.body);
    const store = getStore({ name: 'dinner-board', consistency: 'strong' });

    // Save each data category as a separate blob for efficiency
    const saves = [];

    if (data.meals !== undefined) {
      saves.push(store.setJSON('meals', { meals: data.meals, nMeal: data.nMeal }));
    }
    if (data.fam !== undefined) {
      saves.push(store.setJSON('fam', { fam: data.fam, nFam: data.nFam }));
    }
    if (data.dayMenus !== undefined) {
      saves.push(store.setJSON('dayMenus', data.dayMenus));
    }
    if (data.ings !== undefined) {
      saves.push(store.setJSON('ings', data.ings));
    }
    if (data.reqs !== undefined) {
      saves.push(store.setJSON('reqs', { reqs: data.reqs, nReq: data.nReq }));
    }
    if (data.sugs !== undefined) {
      saves.push(store.setJSON('sugs', { sugs: data.sugs, nSug: data.nSug }));
    }
    if (data.dayData !== undefined) {
      saves.push(store.setJSON('dayData', data.dayData));
    }

    await Promise.all(saves);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    console.error('Save error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to save: ' + err.message })
    };
  }
};
