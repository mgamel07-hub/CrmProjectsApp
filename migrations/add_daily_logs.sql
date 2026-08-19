-- Run in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS daily_logs (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  crm_user_id TEXT        NOT NULL,
  date        DATE        NOT NULL DEFAULT CURRENT_DATE,
  type        TEXT        NOT NULL CHECK (type IN ('visit','issue','study','meeting','other')),
  client_name TEXT,
  details     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daily_logs_user_date ON daily_logs(crm_user_id, date DESC);
CREATE INDEX IF NOT EXISTS daily_logs_date      ON daily_logs(date DESC);
