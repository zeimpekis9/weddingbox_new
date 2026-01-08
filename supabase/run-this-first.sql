-- Add cover photo and theme colors to events table
ALTER TABLE events 
ADD COLUMN cover_photo_url TEXT,
ADD COLUMN primary_color TEXT DEFAULT '#a67c52',
ADD COLUMN secondary_color TEXT DEFAULT '#ede1d1',
ADD COLUMN accent_color TEXT DEFAULT '#704a3a',
ADD COLUMN primary_font TEXT DEFAULT 'Playfair Display';

-- Add tab settings to event_settings table
ALTER TABLE event_settings 
ADD COLUMN show_ceremony_tab BOOLEAN DEFAULT true,
ADD COLUMN show_afterparty_tab BOOLEAN DEFAULT true,
ADD COLUMN show_album_tab BOOLEAN DEFAULT true,
ADD COLUMN tab_ceremony_name TEXT DEFAULT 'Ceremony',
ADD COLUMN tab_afterparty_name TEXT DEFAULT 'After Party',
ADD COLUMN tab_album_name TEXT DEFAULT 'Album';

-- Add tab content filtering to event_settings table
ALTER TABLE event_settings 
ADD COLUMN tab_ceremony_content TEXT DEFAULT 'all',
ADD COLUMN tab_afterparty_content TEXT DEFAULT 'all',
ADD COLUMN tab_album_content TEXT DEFAULT 'all';

-- Add auto-approval settings to event_settings table
ALTER TABLE event_settings 
ADD COLUMN manual_approval BOOLEAN DEFAULT false,
ADD COLUMN auto_approval_delay INTEGER DEFAULT 5;
