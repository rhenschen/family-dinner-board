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
    const body = await req.json()
    const calendarId = body.calendarId
    const apiKey = body.apiKey || process.env.GOOGLE_CALENDAR_API_KEY

    if (!calendarId) {
      return Response.json({ error: 'No calendarId provided' }, { status: 400, headers: corsHeaders })
    }
    if (!apiKey) {
      return Response.json({ error: 'No Google Calendar API key configured. Set GOOGLE_CALENDAR_API_KEY env variable or provide apiKey.' }, { status: 400, headers: corsHeaders })
    }

    // Build date range: from today to 14 days out, focusing on 4PM-11:59PM window
    const now = new Date()
    const startDate = new Date(now)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + 15) // 14 days + buffer

    const timeMin = startDate.toISOString()
    const timeMax = endDate.toISOString()

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?`
      + `key=${encodeURIComponent(apiKey)}`
      + `&timeMin=${encodeURIComponent(timeMin)}`
      + `&timeMax=${encodeURIComponent(timeMax)}`
      + `&singleEvents=true`
      + `&orderBy=startTime`
      + `&maxResults=250`

    const resp = await fetch(url)
    if (!resp.ok) {
      const errText = await resp.text()
      let errMsg = 'Google Calendar API error (' + resp.status + ')'
      try {
        const errJson = JSON.parse(errText)
        if (errJson.error && errJson.error.message) errMsg = errJson.error.message
      } catch (e) { /* ignore parse error */ }
      return Response.json({ error: errMsg }, { status: resp.status, headers: corsHeaders })
    }

    const data = await resp.json()
    const events = (data.items || []).map(function (ev) {
      return {
        summary: ev.summary || '',
        description: ev.description || '',
        start: ev.start.dateTime || ev.start.date || '',
        end: ev.end.dateTime || ev.end.date || '',
      }
    })

    const titlesFound = events.filter(e => e.summary).length
    return Response.json({ events: events, titlesFound: titlesFound, totalEvents: events.length }, { headers: corsHeaders })
  } catch (err) {
    console.error('Google Calendar error:', err)
    return Response.json({ error: 'Failed to fetch calendar: ' + err.message }, { status: 500, headers: corsHeaders })
  }
}
