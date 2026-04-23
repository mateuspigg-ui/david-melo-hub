import { createClient } from '@supabase/supabase-js';

const CANONICAL_PROJECT_REF = 'cmeirnllnouzdzguuxir';
const CANONICAL_SUPABASE_URL = 'https://cmeirnllnouzdzguuxir.supabase.co';
const CANONICAL_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZWlybmxsbm91emR6Z3V1eGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NzEwNjYsImV4cCI6MjA5MTI0NzA2Nn0.NCqgKFpFND7ljmhFcUsjN9E2C1xazJFCZ0uQQk0LBPE';

const envUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const envProjectId = String(import.meta.env.VITE_SUPABASE_PROJECT_ID || '').trim();
const envKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

const isCanonicalEnv = envProjectId === CANONICAL_PROJECT_REF || envUrl.includes(`${CANONICAL_PROJECT_REF}.supabase.co`);

const SUPABASE_URL = isCanonicalEnv && envUrl ? envUrl : CANONICAL_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = isCanonicalEnv && envKey ? envKey : CANONICAL_PUBLISHABLE_KEY;

export const publicSupabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
