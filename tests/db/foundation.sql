\set ON_ERROR_STOP on
BEGIN;
INSERT INTO wedding.events (id, slug, title) VALUES
 ('10000000-0000-0000-0000-000000000001', 'test-a', 'A'),
 ('10000000-0000-0000-0000-000000000002', 'test-b', 'B');
INSERT INTO wedding.users (id, email, password_hash) VALUES
 ('20000000-0000-0000-0000-000000000001', 'owner@example.invalid', 'fixture'),
 ('20000000-0000-0000-0000-000000000002', 'moderator@example.invalid', 'fixture'),
 ('20000000-0000-0000-0000-000000000003', 'second-owner@example.invalid', 'fixture');
INSERT INTO wedding.event_members (event_id, user_id, role) VALUES
 ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'owner'),
 ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'owner'),
 ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'moderator');

SET LOCAL ROLE wedding_api;
DO $$
DECLARE
  event_a constant uuid := '10000000-0000-0000-0000-000000000001';
  event_b constant uuid := '10000000-0000-0000-0000-000000000002';
  owner_a constant uuid := '20000000-0000-0000-0000-000000000001';
  moderator_b constant uuid := '20000000-0000-0000-0000-000000000002';
  second_owner constant uuid := '20000000-0000-0000-0000-000000000003';
BEGIN
  IF wedding.can_administer_event(owner_a, event_a, 'manage') IS DISTINCT FROM true
     OR wedding.can_administer_event(second_owner, event_a, 'manage') IS DISTINCT FROM true
     OR wedding.can_administer_event(moderator_b, event_b, 'moderate') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'authorized member was denied';
  END IF;
  IF wedding.can_administer_event(owner_a, event_b, 'read') IS DISTINCT FROM false
     OR wedding.can_administer_event(moderator_b, event_a, 'moderate') IS DISTINCT FROM false
     OR wedding.can_administer_event(moderator_b, event_b, 'manage') IS DISTINCT FROM false
     OR wedding.can_administer_event(owner_a, event_a, 'unknown') IS DISTINCT FROM false
     OR wedding.can_administer_event(NULL, event_a, 'read') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'unauthorized access was granted';
  END IF;
  IF has_table_privilege('wedding.event_members', 'SELECT')
     OR has_table_privilege('wedding.events', 'UPDATE')
     OR has_table_privilege('wedding.users', 'SELECT') THEN
    RAISE EXCEPTION 'API role has unexpected direct access';
  END IF;
END
$$;
RESET ROLE;

UPDATE wedding.users SET disabled_at = now()
WHERE id = '20000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF wedding.can_administer_event(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001', 'read'
  ) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'disabled user retained access';
  END IF;
  BEGIN
    INSERT INTO wedding.event_settings (event_id)
    VALUES ('10000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'orphan event settings were accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END
$$;
ROLLBACK;
