-- Run this in your Supabase SQL Editor
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completion_notes TEXT;
