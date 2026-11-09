CREATE SCHEMA wedding;
REVOKE ALL ON SCHEMA wedding FROM PUBLIC;

CREATE TABLE wedding.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text NOT NULL,
  date date,
  welcome_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  cover_photo_url text,
  primary_color text,
  secondary_color text,
  accent_color text,
  primary_font text
);

CREATE TABLE wedding.event_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE REFERENCES wedding.events (id),
  collect_photos boolean NOT NULL DEFAULT true,
  collect_messages boolean NOT NULL DEFAULT true,
  collect_voicemails boolean NOT NULL DEFAULT true,
  moderation_enabled boolean NOT NULL DEFAULT true,
  show_ceremony_tab boolean NOT NULL DEFAULT true,
  show_afterparty_tab boolean NOT NULL DEFAULT true,
  show_album_tab boolean NOT NULL DEFAULT true,
  tab_ceremony_name text,
  tab_afterparty_name text,
  tab_album_name text,
  tab_ceremony_content text,
  tab_afterparty_content text,
  tab_album_content text,
  manual_approval boolean NOT NULL DEFAULT true,
  auto_approval_delay integer NOT NULL DEFAULT 0 CHECK (auto_approval_delay >= 0)
);

CREATE TABLE wedding.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES wedding.events (id),
  type text NOT NULL CHECK (type IN ('photo', 'video', 'message', 'voice')),
  message_text text,
  guest_name text,
  moderation text NOT NULL DEFAULT 'pending'
    CHECK (moderation IN ('pending', 'approved', 'rejected', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX submissions_event_order ON wedding.submissions (event_id, created_at DESC, id DESC);
CREATE INDEX submissions_approved_order ON wedding.submissions (event_id, created_at DESC, id DESC)
  WHERE moderation = 'approved' AND deleted_at IS NULL;
