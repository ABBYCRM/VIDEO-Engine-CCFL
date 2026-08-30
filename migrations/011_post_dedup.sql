-- 011_post_dedup.sql
-- Backstop against duplicate scheduled_posts rows (and therefore duplicate
-- real-world publishes) from a double-click, a client-side retry, two
-- browser tabs, or two app instances racing the same manual-trigger route.
-- See lib/post-dedup.ts for the full rationale and the windowed (not
-- permanent-unique) lookup this column backs.
--
-- The PG mirror auto-runs the runtime DDL verbatim on first write as a
-- fallback (lib/post-dedup.ts's own ALTER-TABLE-if-missing guard); hand-
-- running this migration is the explicit path.

ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_content_hash ON scheduled_posts(content_hash, created_at);
