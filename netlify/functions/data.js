const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const store = getStore({ name: 'dinner-board', consistency: 'strong' });
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod === 'GET') {
    try {
      const data = await store.get('app-state', { type: 'json' });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data || {}),
      };
    } catch (e) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({}),
      };
    }
  }

  if (event.httpMethod === 'PUT') {
    try {
      const body = JSON.parse(event.body);
      await store.setJSON('app-state', body);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true }),
      };
    } catch (e) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: e.message }),
      };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ message: 'Method not allowed' }) };
};
