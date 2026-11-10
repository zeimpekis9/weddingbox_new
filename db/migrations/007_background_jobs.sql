ALTER TABLE wedding.media ADD COLUMN thumbnail_key text;
ALTER TABLE wedding.media ADD CONSTRAINT media_event_identity UNIQUE (event_id,id);
CREATE ROLE wedding_worker NOLOGIN;
GRANT USAGE ON SCHEMA wedding TO wedding_worker;
GRANT SELECT ON wedding.media, wedding.submissions TO wedding_worker;
GRANT UPDATE (thumbnail_key) ON wedding.media TO wedding_worker;

CREATE TABLE wedding.background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES wedding.events(id),
  media_id uuid,
  kind text NOT NULL CHECK (kind IN ('thumbnail','export')),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','ready','failed')),
  attempts integer NOT NULL DEFAULT 0,
  run_at timestamptz NOT NULL DEFAULT now(),
  lease uuid,
  lease_until timestamptz,
  object_key text,
  sha256 text,
  item_count integer NOT NULL DEFAULT 0,
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  FOREIGN KEY (event_id,media_id) REFERENCES wedding.media(event_id,id),
  CHECK ((kind='thumbnail' AND media_id IS NOT NULL) OR (kind='export' AND media_id IS NULL))
);
CREATE INDEX background_jobs_ready ON wedding.background_jobs (run_at,id) WHERE state='queued';
CREATE INDEX background_jobs_stalled ON wedding.background_jobs (lease_until,id) WHERE state='running';
CREATE INDEX background_jobs_event ON wedding.background_jobs (event_id,kind,created_at DESC);
CREATE UNIQUE INDEX background_thumbnail_once ON wedding.background_jobs (media_id) WHERE kind='thumbnail';
CREATE UNIQUE INDEX background_active_export ON wedding.background_jobs (event_id)
  WHERE kind='export' AND state IN ('queued','running');
GRANT SELECT, INSERT ON wedding.background_jobs TO wedding_api;
GRANT SELECT, UPDATE ON wedding.background_jobs TO wedding_worker;

CREATE FUNCTION wedding.schedule_thumbnail()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.content_type LIKE 'image/%' THEN
    INSERT INTO wedding.background_jobs(event_id,media_id,kind) VALUES (NEW.event_id,NEW.id,'thumbnail')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION wedding.schedule_thumbnail() FROM PUBLIC;
CREATE TRIGGER media_thumbnail AFTER INSERT ON wedding.media
  FOR EACH ROW EXECUTE FUNCTION wedding.schedule_thumbnail();
INSERT INTO wedding.background_jobs(event_id,media_id,kind)
SELECT event_id,id,'thumbnail' FROM wedding.media WHERE content_type LIKE 'image/%'
ON CONFLICT DO NOTHING;
