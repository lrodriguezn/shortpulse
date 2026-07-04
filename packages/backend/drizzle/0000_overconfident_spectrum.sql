CREATE TABLE IF NOT EXISTS "analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text NOT NULL,
	"user_agent" text,
	"referer" text,
	"country" text,
	"city" text,
	"browser" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_url" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analytics" ADD CONSTRAINT "analytics_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_link_id_idx" ON "analytics" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_timestamp_desc_idx" ON "analytics" USING btree ("timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "links_slug_uidx" ON "links" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "links_created_at_idx" ON "links" USING btree ("created_at");