BEGIN;

-- Add musicbrainz_row_id column to the "user" table
ALTER TABLE "user" ADD COLUMN musicbrainz_row_id INTEGER;

COMMIT;
