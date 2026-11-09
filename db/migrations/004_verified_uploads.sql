CREATE TABLE wedding.guest_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES wedding.events (id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE (event_id, id)
);
CREATE TABLE wedding.guest_grants (
  token_hash text PRIMARY KEY,
  event_id uuid NOT NULL,
  link_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  UNIQUE (event_id, token_hash),
  FOREIGN KEY (event_id, link_id) REFERENCES wedding.guest_links (event_id, id)
);
CREATE INDEX guest_grants_expiry ON wedding.guest_grants (expires_at);
CREATE TABLE wedding.upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  grant_hash text NOT NULL,
  request_id uuid NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 524288000),
  provider_id text,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','uploaded','failed','cancelled')),
  lease_id uuid,
  lease_until timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, grant_hash, request_id),
  UNIQUE (event_id, id),
  FOREIGN KEY (event_id, grant_hash) REFERENCES wedding.guest_grants (event_id, token_hash)
);
CREATE INDEX upload_sessions_expiry ON wedding.upload_sessions (expires_at) WHERE state = 'pending';
CREATE TABLE wedding.media (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  object_key text NOT NULL UNIQUE,
  filename text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (event_id, id) REFERENCES wedding.upload_sessions (event_id, id)
);
GRANT SELECT, INSERT, UPDATE ON wedding.guest_links, wedding.guest_grants, wedding.upload_sessions TO wedding_api;
GRANT SELECT, INSERT ON wedding.media TO wedding_api;
