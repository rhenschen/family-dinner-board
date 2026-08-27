import { readBoard, importLegacyBlobsIfNeeded } from '../../db/board.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
}

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })
  }

  try {
    // Carries over anything the board saved before it moved to the database.
    try {
      await importLegacyBlobsIfNeeded()
    } catch (err: any) {
      console.error('Legacy blobs import skipped:', err.message)
    }

    const board = await readBoard()
    return Response.json(board, { headers: corsHeaders })
  } catch (err: any) {
    console.error('Load error:', err)
    return Response.json({ error: 'Failed to load: ' + err.message }, { status: 500, headers: corsHeaders })
  }
}
