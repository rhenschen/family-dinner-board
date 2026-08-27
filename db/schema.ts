import { pgTable, primaryKey, serial, integer, text, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core'

// Meal ids are assigned by the board UI (the `nMeal` counter) and referenced by
// menus, votes and grocery lists, so they are the primary key rather than a serial.
export const meals = pgTable('meals', {
  id: integer().primaryKey(),
  name: text().notNull(),
  description: text().notNull().default(''),
  link: text().notNull().default(''),
})

export const ingredients = pgTable('ingredients', {
  id: serial().primaryKey(),
  mealId: integer('meal_id').notNull(),
  name: text().notNull(),
  qty: text().notNull().default(''),
  position: integer().notNull().default(0),
})

export const familyMembers = pgTable('family_members', {
  id: integer().primaryKey(),
  name: text().notNull(),
  keyword: text().notNull().default(''),
  gcalId: text('gcal_id').notNull().default(''),
})

export const suggestions = pgTable('suggestions', {
  id: integer().primaryKey(),
  name: text().notNull(),
  byName: text('by_name').notNull().default(''),
  description: text().notNull().default(''),
  link: text().notNull().default(''),
  dateLabel: text('date_label').notNull().default(''),
})

export const requests = pgTable('requests', {
  id: integer().primaryKey(),
  name: text().notNull(),
  byName: text('by_name').notNull().default(''),
  note: text().notNull().default(''),
  dateLabel: text('date_label').notNull().default(''),
  done: boolean().notNull().default(false),
})

// One row per calendar day the board knows about, keyed by ISO date (YYYY-MM-DD).
export const days = pgTable('days', {
  dayIso: text('day_iso').primaryKey(),
  isOpen: boolean('is_open').notNull().default(true),
})

// Which meals appear on a given day's menu, and which are flagged as new.
export const dayMenuItems = pgTable(
  'day_menu_items',
  {
    dayIso: text('day_iso').notNull(),
    mealId: integer('meal_id').notNull(),
    isNew: boolean('is_new').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.dayIso, t.mealId] })],
)

// Family members marked as working/away for a given day.
export const dayAway = pgTable(
  'day_away',
  {
    dayIso: text('day_iso').notNull(),
    memberId: integer('member_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.dayIso, t.memberId] })],
)

export const votes = pgTable(
  'votes',
  {
    dayIso: text('day_iso').notNull(),
    mealId: integer('meal_id').notNull(),
    voterName: text('voter_name').notNull(),
  },
  (t) => [primaryKey({ columns: [t.dayIso, t.mealId, t.voterName] })],
)

// Board-wide settings: id counters, Google Calendar config, Telegram chat id.
export const settings = pgTable('settings', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
