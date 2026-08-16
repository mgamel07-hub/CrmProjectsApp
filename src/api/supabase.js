import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rkabarrbzgtnofpyutrk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_b7p4DYp3hnqdOkoHKJ6gLw_BKtqSdGL';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
