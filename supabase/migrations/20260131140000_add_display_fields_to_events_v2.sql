-- Add subtitle, venue_name, and address to events_v2 for custom display/overrides
ALTER TABLE "public"."events_v2" 
ADD COLUMN IF NOT EXISTS "subtitle" text,
ADD COLUMN IF NOT EXISTS "venue_name" text,
ADD COLUMN IF NOT EXISTS "address" text;

-- Comment on columns
COMMENT ON COLUMN "public"."events_v2"."subtitle" IS 'Short subtitle/tagline for the event';
COMMENT ON COLUMN "public"."events_v2"."venue_name" IS 'Display name of the venue (overrides linked venue id if set, or serves as cache)';
COMMENT ON COLUMN "public"."events_v2"."address" IS 'Display address of the venue';
