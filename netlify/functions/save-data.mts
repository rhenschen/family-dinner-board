import { writeBoard } from '../../db/board.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
}

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })
  }

  try {
    const data = await req.json()
    const rev = await writeBoard(data)
    return Response.json({ ok: true, rev }, { headers: corsHeaders })
  } catch (err: any) {
    console.error('Save error:', err)
    return Response.json({ error: 'Failed to save: ' + err.message }, { status: 500, headers: corsHeaders })
  }
}
