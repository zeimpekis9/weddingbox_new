-- Add font field to events table
ALTER TABLE events 
ADD COLUMN primary_font TEXT DEFAULT 'Playfair Display';

-- Update existing events to have default font
UPDATE events 
SET primary_font = 'Playfair Display' 
WHERE primary_font IS NULL;
