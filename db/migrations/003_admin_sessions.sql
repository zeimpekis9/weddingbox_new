ALTER TABLE wedding.users ADD COLUMN totp_encrypted text;
ALTER TABLE wedding.users ADD COLUMN last_totp_step bigint;

CREATE TABLE wedding.admin_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES wedding.users (id),
  expires_at timestamptz NOT NULL
);
CREATE INDEX admin_sessions_expiry ON wedding.admin_sessions (expires_at);
CREATE INDEX admin_sessions_user ON wedding.admin_sessions (user_id);
CREATE TABLE wedding.admin_login_limits (
  bucket text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL
);
CREATE INDEX admin_login_limits_expiry ON wedding.admin_login_limits (expires_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON wedding.admin_login_limits TO wedding_api;
GRANT SELECT, DELETE ON wedding.admin_sessions TO wedding_api;

CREATE FUNCTION wedding.admin_login_account(login_email text)
RETURNS TABLE (id uuid, password_hash text, totp_encrypted text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT id, password_hash, totp_encrypted FROM wedding.users
  WHERE email = login_email AND disabled_at IS NULL
    AND EXISTS (SELECT 1 FROM wedding.event_members WHERE user_id = users.id)
$$;

CREATE FUNCTION wedding.start_admin_session(
  actor_id uuid, expected_password_hash text, expected_totp text, totp_step bigint, session_hash text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE wedding.users SET last_totp_step = totp_step
  WHERE id = actor_id AND disabled_at IS NULL AND password_hash = expected_password_hash
    AND totp_encrypted = expected_totp AND (last_totp_step IS NULL OR last_totp_step < totp_step)
    AND EXISTS (SELECT 1 FROM wedding.event_members WHERE user_id = actor_id);
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO wedding.admin_sessions VALUES (session_hash, actor_id, now() + interval '8 hours');
  RETURN true;
END
$$;

CREATE FUNCTION wedding.admin_events(session_hash text)
RETURNS TABLE (id uuid, slug text, title text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT event.id, event.slug, event.title, member.role
  FROM wedding.admin_sessions AS session
  JOIN wedding.users AS account ON account.id = session.user_id AND account.disabled_at IS NULL
  JOIN wedding.event_members AS member ON member.user_id = account.id
  JOIN wedding.events AS event ON event.id = member.event_id
  WHERE session.token_hash = session_hash AND session.expires_at > now()
  ORDER BY event.title, event.id
$$;

REVOKE ALL ON FUNCTION wedding.admin_login_account(text),
  wedding.start_admin_session(uuid,text,text,bigint,text), wedding.admin_events(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wedding.admin_login_account(text),
  wedding.start_admin_session(uuid,text,text,bigint,text), wedding.admin_events(text) TO wedding_api;
