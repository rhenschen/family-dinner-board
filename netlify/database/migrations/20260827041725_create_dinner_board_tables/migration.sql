CREATE TABLE "day_away" (
	"day_iso" text,
	"member_id" integer,
	CONSTRAINT "day_away_pkey" PRIMARY KEY("day_iso","member_id")
);
--> statement-breakpoint
CREATE TABLE "day_menu_items" (
	"day_iso" text,
	"meal_id" integer,
	"is_new" boolean DEFAULT false NOT NULL,
	CONSTRAINT "day_menu_items_pkey" PRIMARY KEY("day_iso","meal_id")
);
--> statement-breakpoint
CREATE TABLE "days" (
	"day_iso" text PRIMARY KEY,
	"is_open" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_members" (
	"id" integer PRIMARY KEY,
	"name" text NOT NULL,
	"keyword" text DEFAULT '' NOT NULL,
	"gcal_id" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" serial PRIMARY KEY,
	"meal_id" integer NOT NULL,
	"name" text NOT NULL,
	"qty" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" integer PRIMARY KEY,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" integer PRIMARY KEY,
	"name" text NOT NULL,
	"by_name" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"date_label" text DEFAULT '' NOT NULL,
	"done" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" integer PRIMARY KEY,
	"name" text NOT NULL,
	"by_name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"date_label" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"day_iso" text,
	"meal_id" integer,
	"voter_name" text,
	CONSTRAINT "votes_pkey" PRIMARY KEY("day_iso","meal_id","voter_name")
);
