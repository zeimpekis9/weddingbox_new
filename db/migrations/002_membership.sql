CREATE ROLE wedding_api NOLOGIN;
GRANT USAGE ON SCHEMA wedding TO wedding_api;

CREATE TABLE wedding.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND email <> ''),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);

CREATE TABLE wedding.event_members (
  event_id uuid NOT NULL REFERENCES wedding.events (id),
  user_id uuid NOT NULL REFERENCES wedding.users (id),
  role text NOT NULL CHECK (role IN ('owner', 'moderator')),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX event_members_user_event ON wedding.event_members (user_id, event_id);

-- Actor identity must come from a verified server-side session.
CREATE FUNCTION wedding.can_administer_event(actor_id uuid, target_event_id uuid, action text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM wedding.event_members AS member
    JOIN wedding.users AS account ON account.id = member.user_id
    WHERE member.event_id = target_event_id
      AND member.user_id = actor_id
      AND account.disabled_at IS NULL
      AND (action IN ('read', 'moderate') OR (action = 'manage' AND member.role = 'owner'))
  );
$$;
REVOKE ALL ON FUNCTION wedding.can_administer_event(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wedding.can_administer_event(uuid, uuid, text) TO wedding_api;
