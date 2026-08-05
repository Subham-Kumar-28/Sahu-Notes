/**
 * cloud.js — Supabase cloud persistence layer
 *
 * Render.com's FREE tier uses an ephemeral filesystem — local SQLite and
 * local uploads get wiped whenever the server restarts or redeploys.
 * To make notes PERMANENT, we store everything in Supabase (free cloud):
 *   - notes metadata  → Postgres table 'notes'
 *   - users/sessions  → Postgres tables 'users' & 'sessions'
 *   - uploaded files  → Supabase Storage bucket 'notes'
 *
 * If SUPABASE_URL / SUPABASE_SERVICE_KEY are NOT configured, the app
 * gracefully falls back to local SQLite + local uploads (for local dev).
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

let supabase = null;
let configured = false;

function initCloud() {
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
        supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
        configured = true;
        console.log('☁️  Supabase cloud storage ENABLED — notes will be permanent.');
    } else {
        configured = false;
        console.log('💾 Supabase not configured — using local SQLite (for local dev only).');
    }
    return configured;
}

function isConfigured() { return configured; }

// ===== Bucket: ensure 'notes' bucket exists =====
async function ensureBucket() {
    if (!configured) return;
    try {
        const { data, error } = await supabase.storage.getBucket('notes');
        if (error && error.message && error.message.toLowerCase().includes('not found')) {
            await supabase.storage.createBucket('notes', { public: true });
            console.log('📦 Created Supabase storage bucket: notes');
        }
    } catch (e) {
        console.error('⚠️  Could not verify bucket:', e.message);
    }
}

// ===== NOTES =====
async function getAllNotes() {
    if (!configured) return null;
    const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('id', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
}

async function getNoteById(id) {
    if (!configured) return null;
    const { data, error } = await supabase.from('notes').select('*').eq('id', id).single();
    if (error) return null;
    return data;
}

async function insertNote(note) {
    if (!configured) return;
    const { error } = await supabase.from('notes').insert([note]);
    if (error) throw new Error(error.message);
}

async function deleteNote(id) {
    if (!configured) return;
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) throw new Error(error.message);
}

// ===== FILES (Storage) =====
async function uploadFile(fileBuffer, filename, contentType) {
    if (!configured) return null;
    const { error } = await supabase.storage.from('notes').upload(filename, fileBuffer, {
        contentType: contentType || 'application/octet-stream',
        upsert: true
    });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('notes').getPublicUrl(filename);
    return data.publicUrl;
}

async function deleteFile(filename) {
    if (!configured) return;
    try {
        await supabase.storage.from('notes').remove([filename]);
    } catch (e) { /* ignore */ }
}

// ===== USERS =====
async function findUserByEmail(email) {
    if (!configured) return null;
    const { data, error } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
    if (error) return null;
    return data;
}

async function findUserById(id) {
    if (!configured) return null;
    const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
    if (error) return null;
    return data;
}

async function insertUser(user) {
    if (!configured) return;
    const { error } = await supabase.from('users').insert([user]);
    if (error) throw new Error(error.message);
}

async function updateUserPassword(id, hash) {
    if (!configured) return;
    const { error } = await supabase.from('users').update({ password_hash: hash }).eq('id', id);
    if (error) throw new Error(error.message);
}

// ===== SESSIONS =====
async function findUserByToken(token) {
    if (!configured) return null;
    const { data: s, error } = await supabase.from('sessions').select('user_id').eq('token', token).maybeSingle();
    if (error || !s) return null;
    return findUserById(s.user_id);
}

async function insertSession(token, userId) {
    if (!configured) return;
    const { error } = await supabase.from('sessions').insert([{
        token,
        user_id: userId,
        created_at: new Date().toISOString()
    }]);
    if (error) throw new Error(error.message);
}

async function deleteSession(token) {
    if (!configured) return;
    const { error } = await supabase.from('sessions').delete().eq('token', token);
    if (error) throw new Error(error.message);
}

module.exports = {
    initCloud,
    isConfigured,
    ensureBucket,
    getAllNotes,
    getNoteById,
    insertNote,
    deleteNote,
    uploadFile,
    deleteFile,
    findUserByEmail,
    findUserById,
    insertUser,
    updateUserPassword,
    findUserByToken,
    insertSession,
    deleteSession
};

