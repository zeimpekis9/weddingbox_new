-- =====================================================
-- Wedding Guest App - Database Tables Only
-- =====================================================
-- Run this in Supabase SQL Editor
-- Storage will be set up manually after this
-- =====================================================

-- 1. Create events table
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    date DATE NOT NULL,
    welcome_message TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create event_settings table
CREATE TABLE event_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    collect_photos BOOLEAN DEFAULT true,
    collect_messages BOOLEAN DEFAULT true,
    collect_voicemails BOOLEAN DEFAULT true,
    moderation_enabled BOOLEAN DEFAULT false
);

-- 3. Create submissions table
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    type TEXT CHECK (type IN ('photo', 'video', 'message', 'voice')) NOT NULL,
    content_url TEXT,
    message_text TEXT,
    guest_name TEXT,
    approved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Enable RLS on all tables
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for events table
CREATE POLICY "Anyone can view events by slug" ON events
    FOR SELECT USING (true);

CREATE POLICY "Admins can insert events" ON events
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admins can update their events" ON events
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can delete their events" ON events
    FOR DELETE USING (auth.role() = 'authenticated');

-- 6. RLS Policies for event_settings table
CREATE POLICY "Anyone can view event settings" ON event_settings
    FOR SELECT USING (true);

CREATE POLICY "Admins can insert event settings" ON event_settings
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admins can update event settings" ON event_settings
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can delete event settings" ON event_settings
    FOR DELETE USING (auth.role() = 'authenticated');

-- 7. RLS Policies for submissions table
CREATE POLICY "Guests can insert submissions" ON submissions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view approved submissions" ON submissions
    FOR SELECT USING (approved = true);

CREATE POLICY "Admins can view all submissions" ON submissions
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can update submissions" ON submissions
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can delete submissions" ON submissions
    FOR DELETE USING (auth.role() = 'authenticated');

-- 8. Sample data for testing
INSERT INTO events (title, date, welcome_message, slug) VALUES
('John & Sarah''s Wedding', '2024-06-15', 'Welcome to our wedding celebration! Please share your favorite memories, photos, and well wishes with us. Your precious moments will become part of our forever story.', 'john-sarah-2024'),
('Michael & Emma''s Big Day', '2024-08-22', 'Thank you for being part of our special day! We would love to see your photos and read your messages. Help us capture every beautiful moment of our wedding journey.', 'michael-emma-2024');

INSERT INTO event_settings (event_id, collect_photos, collect_messages, collect_voicemails, moderation_enabled) VALUES
((SELECT id FROM events WHERE slug = 'john-sarah-2024'), true, true, true, false),
((SELECT id FROM events WHERE slug = 'michael-emma-2024'), true, true, true, true);

INSERT INTO submissions (event_id, type, message_text, guest_name, approved) VALUES
((SELECT id FROM events WHERE slug = 'john-sarah-2024'), 'message', 'Congratulations to the beautiful couple! Wishing you a lifetime of love and happiness. ❤️', 'Aunt Mary', true),
((SELECT id FROM events WHERE slug = 'john-sarah-2024'), 'message', 'So happy for you both! May your love story be as magical as your wedding day. 🎉', 'College Friend', true),
((SELECT id FROM events WHERE slug = 'john-sarah-2024'), 'message', 'Welcome to the family! Can''t wait to celebrate with you all. 💐', 'Future In-Law', false);

-- =====================================================
-- DATABASE SETUP COMPLETE!
-- =====================================================
-- Next: Set up storage manually in dashboard
