-- Disable RLS temporarily to test uploads
-- Run this in Supabase SQL Editor

-- This will disable row-level security completely for submissions table
ALTER TABLE submissions DISABLE ROW LEVEL SECURITY;

-- If this works, we know the issue is with RLS policies
-- You can re-enable it later with: ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
