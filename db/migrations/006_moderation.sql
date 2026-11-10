CREATE TABLE wedding.admin_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES wedding.events(id),
  user_id uuid NOT NULL REFERENCES wedding.users(id),
  operation text NOT NULL,
  target_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_event ON wedding.admin_audit (event_id, created_at DESC);
GRANT SELECT, INSERT ON wedding.admin_audit TO wedding_api;
GRANT UPDATE (moderation) ON wedding.media, wedding.submissions TO wedding_api;

CREATE FUNCTION wedding.set_guest_event_config(
  session_hash text, target uuid, gallery boolean, uploads boolean, messages boolean, voice boolean
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE actor uuid;
BEGIN
  SELECT user_id INTO actor FROM wedding.admin_sessions WHERE token_hash=session_hash AND expires_at > now();
  IF NOT wedding.can_administer_event(actor,target,'manage') THEN RETURN false; END IF;
  INSERT INTO wedding.event_settings (event_id,guest_gallery_enabled,guest_uploads_enabled,collect_messages,collect_voicemails)
  VALUES (target,gallery,uploads,messages,voice)
  ON CONFLICT (event_id) DO UPDATE SET
    guest_gallery_enabled=EXCLUDED.guest_gallery_enabled, guest_uploads_enabled=EXCLUDED.guest_uploads_enabled,
    collect_messages=EXCLUDED.collect_messages, collect_voicemails=EXCLUDED.collect_voicemails;
  INSERT INTO wedding.admin_audit (event_id,user_id,operation) VALUES(target,actor,'event_settings');
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION wedding.set_guest_event_config(text,uuid,boolean,boolean,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wedding.set_guest_event_config(text,uuid,boolean,boolean,boolean,boolean) TO wedding_api;
