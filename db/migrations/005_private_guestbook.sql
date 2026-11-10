ALTER TABLE wedding.event_settings
  ADD COLUMN guest_gallery_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN guest_uploads_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE wedding.media ADD COLUMN moderation text NOT NULL DEFAULT 'pending'
  CHECK (moderation IN ('pending', 'approved', 'rejected', 'hidden'));
CREATE INDEX media_feed ON wedding.media (event_id, created_at DESC, id DESC)
  WHERE moderation = 'approved';
CREATE INDEX media_moderation_queue ON wedding.media (event_id, moderation, created_at DESC, id DESC);

ALTER TABLE wedding.submissions ADD COLUMN client_request_id uuid;
ALTER TABLE wedding.submissions ADD COLUMN guest_grant_hash text;
ALTER TABLE wedding.submissions ADD CONSTRAINT submissions_guest_event
  FOREIGN KEY (event_id, guest_grant_hash) REFERENCES wedding.guest_grants (event_id, token_hash);
CREATE UNIQUE INDEX submissions_guest_request ON wedding.submissions (event_id, guest_grant_hash, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE FUNCTION wedding.guest_event_config(target uuid)
RETURNS TABLE (title text, welcome_message text, gallery_enabled boolean, uploads_enabled boolean, messages_enabled boolean, voice_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT event.title, event.welcome_message,
    COALESCE(settings.guest_gallery_enabled, false),
    COALESCE(settings.guest_uploads_enabled AND settings.collect_photos, true),
    COALESCE(settings.collect_messages, true),
    COALESCE(settings.collect_voicemails, true)
  FROM wedding.events AS event LEFT JOIN wedding.event_settings AS settings ON settings.event_id=event.id
  WHERE event.id=target
$$;
REVOKE ALL ON FUNCTION wedding.guest_event_config(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wedding.guest_event_config(uuid) TO wedding_api;
GRANT SELECT, INSERT ON wedding.submissions TO wedding_api;
