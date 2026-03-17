import { getStore } from '@netlify/blobs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })
  }

  try {
    const store = getStore({ name: 'dinner-board', consistency: 'strong' })

    const [meals, fam, dayMenus, ings, reqs, sugs, dayData] = await Promise.all([
      store.get('meals', { type: 'json' }).catch(() => null),
      store.get('fam', { type: 'json' }).catch(() => null),
      store.get('dayMenus', { type: 'json' }).catch(() => null),
      store.get('ings', { type: 'json' }).catch(() => null),
      store.get('reqs', { type: 'json' }).catch(() => null),
      store.get('sugs', { type: 'json' }).catch(() => null),
      store.get('dayData', { type: 'json' }).catch(() => null),
    ])

    return Response.json({
      meals, fam, dayMenus, ings, reqs, sugs, dayData,
    }, { headers: corsHeaders })
  } catch (err) {
    console.error('Load error:', err)
    return Response.json({ error: 'Failed to load: ' + err.message }, { status: 500, headers: corsHeaders })
  }
}
