\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';

SELECT current_setting('server_version') AS server_version;
SELECT table_name, column_name, data_type, is_nullable, column_default IS NOT NULL AS has_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('events', 'event_settings', 'submissions')
ORDER BY table_name, ordinal_position;

SELECT rel.relname AS table_name, rel.relrowsecurity AS rls, rel.relforcerowsecurity AS force_rls
FROM pg_class rel JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE (ns.nspname = 'public' AND rel.relname IN ('events', 'event_settings', 'submissions'))
   OR (ns.nspname = 'storage' AND rel.relname IN ('buckets', 'objects'))
ORDER BY ns.nspname, rel.relname;

SELECT rel.relname AS table_name, con.conname, con.contype, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = 'public' AND rel.relname IN ('events', 'event_settings', 'submissions')
ORDER BY rel.relname, con.conname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('events', 'event_settings', 'submissions')
ORDER BY tablename, indexname;

SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN ('events', 'event_settings', 'submissions'))
   OR (schemaname = 'storage' AND tablename IN ('buckets', 'objects'))
ORDER BY schemaname, tablename, policyname;

SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.table_privileges
WHERE (table_schema = 'public' AND table_name IN ('events', 'event_settings', 'submissions'))
   OR (table_schema = 'storage' AND table_name IN ('buckets', 'objects'))
ORDER BY table_schema, table_name, grantee, privilege_type;

SELECT ns.nspname AS schema, proc.proname AS name, pg_get_function_identity_arguments(proc.oid) AS arguments
FROM pg_proc proc JOIN pg_namespace ns ON ns.oid = proc.pronamespace
WHERE ns.nspname = 'public'
ORDER BY name, arguments;
SELECT event_object_schema, event_object_table, trigger_name, event_manipulation
FROM information_schema.triggers
WHERE event_object_schema IN ('public', 'auth', 'storage')
ORDER BY event_object_schema, event_object_table, trigger_name, event_manipulation;
SELECT pubname, schemaname, tablename, rowfilter IS NOT NULL AS has_filter
FROM pg_publication_tables
ORDER BY pubname, schemaname, tablename;
SELECT extname, extversion FROM pg_extension ORDER BY extname;

-- Dashboard inventory still needed for Auth, Edge Functions and Storage settings.
-- Review expression bodies and object inventories in a restricted channel.
ROLLBACK;
