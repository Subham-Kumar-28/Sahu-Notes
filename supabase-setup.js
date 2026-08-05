/**
 * supabase-setup.js — ONE-TIME setup for your Supabase project.
 *
 * Run this ONCE after creating your free Supabase project to create the
 * database tables + storage bucket needed by the app.
 *
 * Usage:
 *   node supabase-setup.js
 *
 * It reads SUPABASE_URL and SUPABASE_SERVICE_KEY from the environment
 * (set them in a .env file, or set them in your terminal).
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ===== Sanitize the Supabase URL =====
// The dashboard shows several URLs (Project URL, REST/GraphQL endpoints, etc.).
// If the user accidentally pastes e.g. ".../rest/v1/" the client builds a broken
// path → "Invalid path specified in request URL". Normalize to the bare project URL.
function sanitizeSupabaseUrl(raw) {
    if (!raw) return '';
    let url = String(raw).trim();
    if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
        url = url.slice(1, -1);
    }
    url = url.replace(/\/(?:rest|auth|storage|graphql)\/v\d+\/?/i, '');
    url = url.replace(/\/+$/, '');
    return url;
}

const SUPABASE_URL = sanitizeSupabaseUrl(process.env.SUPABASE_URL || '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY.');
    console.error('   Create a .env file with:');
    console.error('   SUPABASE_URL=https://YOURPROJECT.supabase.co');
    console.error('   SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
});

// ===== SQL for Postgres tables =====
const TABLES_SQL = `
CREATE TABLE IF NOT EXISTS public.users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin SMALLINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sessions (
    token TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.notes (
    id TEXT PRIMARY KEY,
    filename TEXT DEFAULT '',
    "originalName" TEXT DEFAULT '',
    title TEXT DEFAULT '',
    category TEXT DEFAULT '',
    course TEXT DEFAULT '',
    semester TEXT DEFAULT '',
    url TEXT DEFAULT '',
    date TEXT DEFAULT '',
    size BIGINT DEFAULT 0
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
`;

async function run() {
    console.log('☁️  Setting up Supabase project...');
    console.log('   URL: ' + SUPABASE_URL);

    // 1) Create tables using SQL endpoint
    try {
        const { error } = await supabase.rpc('exec_sql', { sql: TABLES_SQL });
        if (error) {
            // exec_sql RPC may not exist yet — try direct schema via a fallback
            console.log('   ⚠️  exec_sql not available, using fallback (manual SQL needed).');
            console.log('   📋 Please run the SQL below in your Supabase SQL Editor:');
            console.log('');
            console.log(TABLES_SQL);
        } else {
            console.log('✅ Tables created (users, sessions, notes).');
        }
    } catch (e) {
        console.log('   ⚠️  Could not auto-run SQL. Please run the SQL below in your Supabase SQL Editor:');
        console.log('');
        console.log(TABLES_SQL);
    }

    // 2) Create storage bucket (public) for uploaded files
    try {
        const { data, error } = await supabase.storage.getBucket('notes');
        if (error && error.message && error.message.toLowerCase().includes('not found')) {
            const { error: createErr } = await supabase.storage.createBucket('notes', { public: true });
            if (createErr) {
                console.log('⚠️  Bucket create issue:', createErr.message);
            } else {
                console.log('✅ Storage bucket "notes" created (public).');
            }
        } else if (data) {
            console.log('✅ Storage bucket "notes" already exists.');
        } else {
            console.log('✅ Storage bucket "notes" verified.');
        }
    } catch (e) {
        console.log('⚠️  Could not verify bucket:', e.message);
    }

    console.log('');
    console.log('🎉 Setup complete! Copy these into Render.com environment:');
    console.log('   SUPABASE_URL = ' + SUPABASE_URL);
    console.log('   SUPABASE_SERVICE_KEY = ' + (SUPABASE_SERVICE_KEY ? '***** (your service key)' : 'MISSING'));
}

run().catch(e => {
    console.error('Fatal:', e.message);
    process.exit(1);
});

