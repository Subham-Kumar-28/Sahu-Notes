/**
 * database.js — SQLite (sql.js) wrapper
 * 
 * Uses sql.js (pure-JS SQLite) so no native compilation is needed.
 * The database is persisted to a file on disk after every write.
 */
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'notes-app.db');
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'myselfsubhamkumar@gmail.com').toLowerCase();

let db = null;

async function initDatabase() {
    const SQL = await initSqlJs({
        locateFile: file => path.join(path.dirname(require.resolve('sql.js')), file)
    });

    if (fs.existsSync(DB_PATH)) {
        const buf = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buf);
    } else {
        db = new SQL.Database();
    }

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            filename TEXT DEFAULT '',
            originalName TEXT DEFAULT '',
            title TEXT DEFAULT '',
            category TEXT DEFAULT '',
            course TEXT DEFAULT '',
            semester TEXT DEFAULT '',
            url TEXT DEFAULT '',
            date TEXT DEFAULT '',
            size INTEGER DEFAULT 0
        );
    `);
    persist();
    migrateNotesFromJson();
    seedAdmin();
    console.log('✅ Database ready:', DB_PATH);
    console.log('   Tables: notes, users, sessions');
}

/** Write the current in-memory DB to disk. */
function persist() {
    if (!db) return;
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/** Run a SELECT query and return array of row objects. */
function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

/** Run a SELECT query and return the first row object (or null). */
function queryOne(sql, params = []) {
    const rows = queryAll(sql, params);
    return rows.length ? rows[0] : null;
}

/** Run an INSERT/UPDATE/DELETE and persist to disk. */
function run(sql, params = []) {
    db.run(sql, params);
    persist();
}

/** Migrate notes from the old notes-data.json into SQLite (only once). */
function migrateNotesFromJson() {
    try {
        const { count } = queryOne('SELECT COUNT(*) AS count FROM notes');
        if (count > 0) return;

        const jsonPath = path.join(__dirname, 'notes-data.json');
        if (!fs.existsSync(jsonPath)) return;

        const notes = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (!Array.isArray(notes) || notes.length === 0) return;

        const stmt = db.prepare(
            `INSERT INTO notes (id, filename, originalName, title, category, course, semester, url, date, size)
             VALUES (?,?,?,?,?,?,?,?,?,?)`
        );
        for (const n of notes) {
            stmt.run([
                n.id || String(Date.now()) + Math.random(),
                n.filename || '',
                n.originalName || '',
                n.title || '',
                n.category || '',
                n.course || '',
                n.semester || '',
                n.url || '',
                n.date || new Date().toISOString(),
                n.size || 0
            ]);
        }
        stmt.free();
        persist();
        console.log(`📦 Migrated ${notes.length} notes from notes-data.json`);
    } catch (e) {
        console.error('⚠️  Migration error:', e.message);
    }
}

/** Ensure the admin account exists. */
function seedAdmin() {
    const existing = queryOne('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL]);
    if (existing) {
        db.run('UPDATE users SET is_admin = 1 WHERE email = ?', [ADMIN_EMAIL]);
        persist();
        return;
    }
    const bcrypt = require('bcryptjs');
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin@123';
    const hash = bcrypt.hashSync(adminPassword, 10);
    run(
        `INSERT INTO users (name, email, password_hash, is_admin, created_at) VALUES (?,?,?,1,?)`,
        ['Subham Sahu', ADMIN_EMAIL, hash, new Date().toISOString()]
    );
    console.log('👑 Admin account ready:', ADMIN_EMAIL);
    console.log('   Default password: ' + adminPassword + '  →  CHANGE IT after first login!');
}

module.exports = {
    initDatabase,
    queryAll,
    queryOne,
    run,
    persist,
    getDb: () => db,
    ADMIN_EMAIL
};

