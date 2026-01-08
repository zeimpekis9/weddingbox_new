-- Simple Storage Fix (no admin permissions needed)
-- Run this in Supabase SQL Editor

-- 1. Check if bucket exists and create basic policies
-- This version only uses what you have permission to do

-- Fix submissions RLS policies (this should work)
DROP POLICY IF EXISTS "Guests can insert submissions" ON submissions;
CREATE POLICY "Guests can insert submissions" ON submissions
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view approved submissions" ON submissions;
CREATE POLICY "Anyone can view approved submissions" ON submissions
    FOR SELECT USING (approved = true);

-- Alternative: Temporarily disable RLS for testing
-- Uncomment the line below if the above doesn't work
-- ALTER TABLE submissions DISABLE ROW LEVEL SECURITY;
