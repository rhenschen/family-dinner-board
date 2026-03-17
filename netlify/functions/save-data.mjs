import { getStore } from '@netlify/blobs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })
  }

  try {
    const data = await req.json()
    const store = getStore({ name: 'dinner-board', consistency: 'strong' })

    const saves = []

    if (data.meals !== undefined) {
      saves.push(store.setJSON('meals', { meals: data.meals, nMeal: data.nMeal }))
    }
    if (data.fam !== undefined) {
      saves.push(store.setJSON('fam', { fam: data.fam, nFam: data.nFam }))
    }
    if (data.dayMenus !== undefined) {
      saves.push(store.setJSON('dayMenus', data.dayMenus))
    }
    if (data.ings !== undefined) {
      saves.push(store.setJSON('ings', data.ings))
    }
    if (data.reqs !== undefined) {
      saves.push(store.setJSON('reqs', { reqs: data.reqs, nReq: data.nReq }))
    }
    if (data.sugs !== undefined) {
      saves.push(store.setJSON('sugs', { sugs: data.sugs, nSug: data.nSug }))
    }
    if (data.dayData !== undefined) {
      saves.push(store.setJSON('dayData', data.dayData))
    }
    if (data.gcalSettings !== undefined) {
      saves.push(store.setJSON('gcalSettings', data.gcalSettings))
    }
    if (data.tgSettings !== undefined) {
      saves.push(store.setJSON('tgSettings', data.tgSettings))
    }

    await Promise.all(saves)

    return Response.json({ ok: true }, { headers: corsHeaders })
  } catch (err) {
    console.error('Save error:', err)
    return Response.json({ error: 'Failed to save: ' + err.message }, { status: 500, headers: corsHeaders })
  }
}
