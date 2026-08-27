import { eq, gte, lt, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from './index.js'
import {
  meals,
  ingredients,
  familyMembers,
  suggestions,
  requests,
  days,
  dayMenuItems,
  dayAway,
  votes,
  settings,
} from './schema.js'

// The board UI keeps its whole state in memory and exchanges it as one JSON
// document. These helpers translate between that document and the tables above,
// so the front end contract stays exactly the same.

const COUNTERS_KEY = 'counters'
const GCAL_KEY = 'gcal'
const TELEGRAM_KEY = 'telegram'
const BLOB_IMPORT_KEY = 'blob_import'
const REVISION_KEY = 'revision'

async function readSettings() {
  const rows = await db.select().from(settings)
  const map: Record<string, any> = {}
  rows.forEach((r) => {
    map[r.key] = r.value
  })
  return map
}

async function putSetting(key: string, value: any) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: sql`now()` } })
}

// The board only ever shows a rolling two-week window. Days well outside it are
// history: they are not sent to the browser and are eventually pruned, so the
// payload and the tables stay a fixed size no matter how long the board runs.
const READ_WINDOW_DAYS = 28
const KEEP_WINDOW_DAYS = 120

function isoDaysAgo(offset: number) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().slice(0, 10)
}

// A stale device could resend an id it already used; keeping the first copy is
// safer than letting Postgres reject the whole save.
function dedupeById(rows: any[]): any[] {
  const seen = new Set<number>()
  return rows.filter((r) => {
    if (Number.isNaN(r.id) || seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })
}

function nextId(rows: Array<{ id: number }>, floor: number) {
  return rows.reduce((max, r) => (r.id >= max ? r.id + 1 : max), floor)
}

// ── READ ──

export async function readBoard() {
  const windowStart = isoDaysAgo(READ_WINDOW_DAYS)
  const [
    mealRows,
    ingRows,
    famRows,
    sugRows,
    reqRows,
    dayRows,
    menuRows,
    awayRows,
    voteRows,
    settingsMap,
  ] = await Promise.all([
    db.select().from(meals),
    db.select().from(ingredients),
    db.select().from(familyMembers),
    db.select().from(suggestions),
    db.select().from(requests),
    db.select().from(days).where(gte(days.dayIso, windowStart)),
    db.select().from(dayMenuItems).where(gte(dayMenuItems.dayIso, windowStart)),
    db.select().from(dayAway).where(gte(dayAway.dayIso, windowStart)),
    db.select().from(votes).where(gte(votes.dayIso, windowStart)),
    readSettings(),
  ])

  const counters = settingsMap[COUNTERS_KEY] || {}
  const hasBoard = mealRows.length > 0 || famRows.length > 0

  const ings: Record<string, Array<{ n: string; q: string }>> = {}
  ingRows
    .slice()
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .forEach((r) => {
      if (!ings[r.mealId]) ings[r.mealId] = []
      ings[r.mealId].push({ n: r.name, q: r.qty })
    })

  const dayMenus: Record<string, { mealIds: number[]; newMealIds: number[] }> = {}
  dayRows.forEach((d) => {
    dayMenus[d.dayIso] = { mealIds: [], newMealIds: [] }
  })
  menuRows.forEach((r) => {
    if (!dayMenus[r.dayIso]) dayMenus[r.dayIso] = { mealIds: [], newMealIds: [] }
    dayMenus[r.dayIso].mealIds.push(r.mealId)
    if (r.isNew) dayMenus[r.dayIso].newMealIds.push(r.mealId)
  })

  const dayData: Record<string, { open: boolean; away: number[]; votes: Record<string, { voters: string[] }> }> = {}
  const day = (iso: string) => {
    if (!dayData[iso]) dayData[iso] = { open: true, away: [], votes: {} }
    return dayData[iso]
  }
  dayRows.forEach((d) => {
    day(d.dayIso).open = d.isOpen
  })
  awayRows.forEach((r) => {
    day(r.dayIso).away.push(r.memberId)
  })
  voteRows.forEach((r) => {
    const d = day(r.dayIso)
    if (!d.votes[r.mealId]) d.votes[r.mealId] = { voters: [] }
    d.votes[r.mealId].voters.push(r.voterName)
  })

  return {
    // `null` tells the board "nothing saved yet, use your built-in defaults".
    meals: hasBoard
      ? {
          meals: mealRows.map((m) => ({ id: m.id, name: m.name, desc: m.description, link: m.link })),
          nMeal: counters.nMeal || nextId(mealRows, 10),
        }
      : null,
    fam: hasBoard
      ? {
          fam: famRows.map((f) => ({ id: f.id, name: f.name, kw: f.keyword, gcalId: f.gcalId })),
          nFam: counters.nFam || nextId(famRows, 10),
        }
      : null,
    dayMenus: Object.keys(dayMenus).length ? dayMenus : null,
    ings: Object.keys(ings).length ? ings : null,
    reqs: {
      reqs: reqRows.map((r) => ({
        id: r.id,
        name: r.name,
        by: r.byName,
        note: r.note,
        date: r.dateLabel,
        done: r.done,
      })),
      nReq: counters.nReq || nextId(reqRows, 1),
    },
    sugs: {
      sugs: sugRows.map((s) => ({
        id: s.id,
        name: s.name,
        by: s.byName,
        desc: s.description,
        link: s.link,
        date: s.dateLabel,
      })),
      nSug: counters.nSug || nextId(sugRows, 1),
    },
    dayData: Object.keys(dayData).length ? dayData : null,
    gcalSettings: settingsMap[GCAL_KEY] || null,
    tgSettings: settingsMap[TELEGRAM_KEY] || null,
    // Bumped on every write so other devices can cheaply spot a newer board.
    rev: (settingsMap[REVISION_KEY] && settingsMap[REVISION_KEY].n) || 0,
  }
}

// ── WRITE ──
// Every section is optional: callers send only what changed. Rows are upserted
// and only genuinely removed items are deleted, so a partial failure can never
// leave the board empty.

export async function writeBoard(data: any) {
  if (Array.isArray(data.meals)) {
    const rows = dedupeById(
      data.meals.map((m: any) => ({
        id: Number(m.id),
        name: String(m.name || ''),
        description: String(m.desc || ''),
        link: String(m.link || ''),
      })),
    )
    if (rows.length) {
      await db
        .insert(meals)
        .values(rows)
        .onConflictDoUpdate({
          target: meals.id,
          set: {
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            link: sql`excluded.link`,
          },
        })
      const keep = rows.map((r: any) => r.id)
      await db.delete(meals).where(notInArray(meals.id, keep))
      await db.delete(dayMenuItems).where(notInArray(dayMenuItems.mealId, keep))
      await db.delete(votes).where(notInArray(votes.mealId, keep))
    } else {
      await db.delete(meals)
      await db.delete(dayMenuItems)
      await db.delete(votes)
    }
  }

  // Grocery lists arrive as the full map of meal id -> ingredients.
  if (data.ings && typeof data.ings === 'object') {
    const mealIds = Object.keys(data.ings).map(Number).filter((n) => !Number.isNaN(n))
    const rows: Array<{ mealId: number; name: string; qty: string; position: number }> = []
    mealIds.forEach((mealId) => {
      const list = Array.isArray(data.ings[mealId]) ? data.ings[mealId] : []
      list.forEach((i: any, idx: number) => {
        if (!i || !i.n) return
        rows.push({ mealId, name: String(i.n), qty: String(i.q || ''), position: idx })
      })
    })
    if (mealIds.length) await db.delete(ingredients).where(inArray(ingredients.mealId, mealIds))
    if (rows.length) await db.insert(ingredients).values(rows)
  }

  if (Array.isArray(data.fam)) {
    const rows = dedupeById(
      data.fam.map((f: any) => ({
        id: Number(f.id),
        name: String(f.name || ''),
        keyword: String(f.kw || ''),
        gcalId: String(f.gcalId || ''),
      })),
    )
    if (rows.length) {
      await db
        .insert(familyMembers)
        .values(rows)
        .onConflictDoUpdate({
          target: familyMembers.id,
          set: {
            name: sql`excluded.name`,
            keyword: sql`excluded.keyword`,
            gcalId: sql`excluded.gcal_id`,
          },
        })
      const keep = rows.map((r: any) => r.id)
      await db.delete(familyMembers).where(notInArray(familyMembers.id, keep))
      await db.delete(dayAway).where(notInArray(dayAway.memberId, keep))
    } else {
      await db.delete(familyMembers)
      await db.delete(dayAway)
    }
  }

  if (Array.isArray(data.reqs)) {
    const rows = dedupeById(
      data.reqs.map((r: any) => ({
        id: Number(r.id),
        name: String(r.name || ''),
        byName: String(r.by || ''),
        note: String(r.note || ''),
        dateLabel: String(r.date || ''),
        done: !!r.done,
      })),
    )
    if (rows.length) {
      await db
        .insert(requests)
        .values(rows)
        .onConflictDoUpdate({
          target: requests.id,
          set: {
            name: sql`excluded.name`,
            byName: sql`excluded.by_name`,
            note: sql`excluded.note`,
            dateLabel: sql`excluded.date_label`,
            done: sql`excluded.done`,
          },
        })
      await db.delete(requests).where(notInArray(requests.id, rows.map((r: any) => r.id)))
    } else {
      await db.delete(requests)
    }
  }

  if (Array.isArray(data.sugs)) {
    const rows = dedupeById(
      data.sugs.map((s: any) => ({
        id: Number(s.id),
        name: String(s.name || ''),
        byName: String(s.by || ''),
        description: String(s.desc || ''),
        link: String(s.link || ''),
        dateLabel: String(s.date || ''),
      })),
    )
    if (rows.length) {
      await db
        .insert(suggestions)
        .values(rows)
        .onConflictDoUpdate({
          target: suggestions.id,
          set: {
            name: sql`excluded.name`,
            byName: sql`excluded.by_name`,
            description: sql`excluded.description`,
            link: sql`excluded.link`,
            dateLabel: sql`excluded.date_label`,
          },
        })
      await db.delete(suggestions).where(notInArray(suggestions.id, rows.map((s: any) => s.id)))
    } else {
      await db.delete(suggestions)
    }
  }

  // Day-scoped data is rewritten one day at a time so days outside the board's
  // current 14-day window are never touched.
  if (data.dayMenus && typeof data.dayMenus === 'object') {
    for (const iso of Object.keys(data.dayMenus)) {
      const dm = data.dayMenus[iso] || {}
      const mealIds: number[] = Array.isArray(dm.mealIds) ? dm.mealIds.map(Number) : []
      const newIds: number[] = Array.isArray(dm.newMealIds) ? dm.newMealIds.map(Number) : []
      await db.insert(days).values({ dayIso: iso }).onConflictDoNothing()
      await db.delete(dayMenuItems).where(eq(dayMenuItems.dayIso, iso))
      const rows = mealIds
        .filter((id, i) => !Number.isNaN(id) && mealIds.indexOf(id) === i)
        .map((id) => ({ dayIso: iso, mealId: id, isNew: newIds.includes(id) }))
      if (rows.length) await db.insert(dayMenuItems).values(rows)
    }
  }

  if (data.dayData && typeof data.dayData === 'object') {
    for (const iso of Object.keys(data.dayData)) {
      const dd = data.dayData[iso] || {}
      const isOpen = dd.open !== undefined ? !!dd.open : true
      await db
        .insert(days)
        .values({ dayIso: iso, isOpen })
        .onConflictDoUpdate({ target: days.dayIso, set: { isOpen } })

      await db.delete(dayAway).where(eq(dayAway.dayIso, iso))
      const awayIds: number[] = Array.isArray(dd.away) ? dd.away.map(Number) : []
      const awayRows = awayIds
        .filter((id, i) => !Number.isNaN(id) && awayIds.indexOf(id) === i)
        .map((id) => ({ dayIso: iso, memberId: id }))
      if (awayRows.length) await db.insert(dayAway).values(awayRows)

      if (dd.votes && typeof dd.votes === 'object') {
        await db.delete(votes).where(eq(votes.dayIso, iso))
        const voteRows: Array<{ dayIso: string; mealId: number; voterName: string }> = []
        Object.keys(dd.votes).forEach((mealId) => {
          const id = Number(mealId)
          if (Number.isNaN(id)) return
          const voters = (dd.votes[mealId] && dd.votes[mealId].voters) || []
          voters.forEach((name: any) => {
            if (!name) return
            const voterName = String(name)
            if (voteRows.some((v) => v.mealId === id && v.voterName === voterName)) return
            voteRows.push({ dayIso: iso, mealId: id, voterName })
          })
        })
        if (voteRows.length) await db.insert(votes).values(voteRows)
      }
    }
  }

  const counterKeys = ['nMeal', 'nFam', 'nReq', 'nSug']
  const incoming = counterKeys.filter((k) => typeof data[k] === 'number')
  if (incoming.length) {
    const current = (await readSettings())[COUNTERS_KEY] || {}
    const merged = { ...current }
    // Counters only ever move forward, so a stale device cannot reuse an id.
    incoming.forEach((k) => {
      merged[k] = Math.max(Number(current[k]) || 0, Number(data[k]))
    })
    await putSetting(COUNTERS_KEY, merged)
  }

  // Calendar and Telegram settings are shared by every device. Blank values are
  // ignored unless the save explicitly asks to clear them, so a device that has
  // not loaded them yet can never wipe them for everyone.
  if (data.gcalSettings) {
    const s = data.gcalSettings
    const clear = !!s.clear
    const existing = (await readSettings())[GCAL_KEY] || {}
    const next = {
      calendarId: s.calendarId || (clear ? '' : existing.calendarId || ''),
      apiKey: s.apiKey || (clear ? '' : existing.apiKey || ''),
    }
    if (clear || next.calendarId || next.apiKey) await putSetting(GCAL_KEY, next)
  }

  if (data.tgSettings) {
    const s = data.tgSettings
    const clear = !!s.clear
    const existing = (await readSettings())[TELEGRAM_KEY] || {}
    const next = { chatId: s.chatId || (clear ? '' : existing.chatId || '') }
    if (clear || next.chatId) await putSetting(TELEGRAM_KEY, next)
  }

  // Drop long-past days so the tables do not grow without bound.
  const keepFrom = isoDaysAgo(KEEP_WINDOW_DAYS)
  await db.delete(votes).where(lt(votes.dayIso, keepFrom))
  await db.delete(dayAway).where(lt(dayAway.dayIso, keepFrom))
  await db.delete(dayMenuItems).where(lt(dayMenuItems.dayIso, keepFrom))
  await db.delete(days).where(lt(days.dayIso, keepFrom))

  const rev = (await readSettings())[REVISION_KEY]
  const next = ((rev && rev.n) || 0) + 1
  await putSetting(REVISION_KEY, { n: next })
  return next
}

// ── ONE-TIME IMPORT OF THE OLD NETLIFY BLOBS DATA ──
// The board previously stored everything in a Netlify Blobs store. The first
// request after this change copies that data into the database so nothing the
// family already entered is lost.

export async function importLegacyBlobsIfNeeded() {
  const settingsMap = await readSettings()
  if (settingsMap[BLOB_IMPORT_KEY]) return false

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(meals)
  if (count > 0) {
    await putSetting(BLOB_IMPORT_KEY, { done: true, imported: false, reason: 'database already populated' })
    return false
  }

  const { getStore } = await import('@netlify/blobs')
  const store = getStore({ name: 'dinner-board', consistency: 'strong' })
  const keys = ['meals', 'fam', 'dayMenus', 'ings', 'reqs', 'sugs', 'dayData', 'gcalSettings', 'tgSettings']
  const values = await Promise.all(keys.map((k) => store.get(k, { type: 'json' }).catch(() => null)))
  const blob: Record<string, any> = {}
  keys.forEach((k, i) => {
    blob[k] = values[i]
  })

  const payload: Record<string, any> = {}
  if (blob.meals && Array.isArray(blob.meals.meals)) {
    payload.meals = blob.meals.meals
    payload.nMeal = blob.meals.nMeal
  }
  if (blob.fam && Array.isArray(blob.fam.fam)) {
    payload.fam = blob.fam.fam
    payload.nFam = blob.fam.nFam
  }
  if (blob.reqs && Array.isArray(blob.reqs.reqs)) {
    payload.reqs = blob.reqs.reqs
    payload.nReq = blob.reqs.nReq
  }
  if (blob.sugs && Array.isArray(blob.sugs.sugs)) {
    payload.sugs = blob.sugs.sugs
    payload.nSug = blob.sugs.nSug
  }
  if (blob.ings) payload.ings = blob.ings
  if (blob.dayMenus) payload.dayMenus = blob.dayMenus
  if (blob.dayData) payload.dayData = blob.dayData
  if (blob.gcalSettings) payload.gcalSettings = blob.gcalSettings
  if (blob.tgSettings) payload.tgSettings = blob.tgSettings

  const imported = Object.keys(payload).length > 0
  if (imported) await writeBoard(payload)
  await putSetting(BLOB_IMPORT_KEY, { done: true, imported })
  return imported
}
