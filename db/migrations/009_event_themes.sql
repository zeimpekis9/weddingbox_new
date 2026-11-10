CREATE TABLE wedding.event_themes (
  event_id uuid PRIMARY KEY REFERENCES wedding.events(id),
  draft jsonb NOT NULL CHECK (jsonb_typeof(draft) = 'object'),
  published jsonb CHECK (jsonb_typeof(published) = 'object'),
  revision integer NOT NULL CHECK (revision > 0),
  published_revision integer CHECK (published_revision BETWEEN 1 AND revision),
  CHECK ((published IS NULL) = (published_revision IS NULL))
);

CREATE TABLE wedding.theme_assets (
  event_id uuid NOT NULL REFERENCES wedding.events(id),
  id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('cover', 'monogram')),
  ready boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, id)
);

GRANT SELECT, INSERT, UPDATE ON wedding.event_themes TO wedding_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON wedding.theme_assets TO wedding_api;
