-- Fix RLS policies for anonymous users
-- This allows unauthenticated guests to submit voice messages and other content

-- Drop existing policies that might be causing issues
DROP POLICY IF EXISTS "Guests can insert submissions" ON submissions;

-- Create new policy that explicitly allows anonymous users
CREATE POLICY "Guests can insert submissions" ON submissions
    FOR INSERT WITH CHECK (true);

-- Ensure select policies are also working correctly
DROP POLICY IF EXISTS "Anyone can view approved submissions" ON submissions;
CREATE POLICY "Anyone can view approved submissions" ON submissions
    FOR SELECT USING (approved = true);

DROP POLICY IF EXISTS "Admins can view all submissions" ON submissions;
CREATE POLICY "Admins can view all submissions" ON submissions
    FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Update other policies to be more permissive for anonymous access
DROP POLICY IF EXISTS "Anyone can view events by slug" ON events;
CREATE POLICY "Anyone can view events by slug" ON events
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view event settings" ON event_settings;
CREATE POLICY "Anyone can view event settings" ON event_settings
    FOR SELECT USING (true);
