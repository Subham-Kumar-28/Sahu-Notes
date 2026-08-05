/**
 * server.js — Notes App server
 *
 * - SQLite database (sql.js) for notes + users + sessions (local dev)
 * - Supabase cloud storage (Postgres + file storage) when configured (Render production)
 * - Gmail + password auth (register/login/logout)
 * - Admin protected upload/delete APIs
 * - Serves PWA (manifest, service worker, app shell)
 * - Shows local IP + prints public deploy instructions
 */
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const db = require('./database');
const auth = require('./auth');
const cloud = require('./cloud');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'myselfsubhamkumar@gmail.com').toLowerCase();

// ===== Middleware =====
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== Static folders =====
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/manifest.json', express.static(path.join(__dirname, 'manifest.json')));
app.use('/service-worker.js', express.static(path.join(__dirname, 'service-worker.js')));
app.use('/offline.html', express.static(path.join(__dirname, 'public', 'offline.html')));

// ===== Multer config for file uploads =====
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = file.originalname.replace(ext, '').replace(/[^a-zA-Z0-9]/g, '_');
        cb(null, `${name}_${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp|pdf/;
        const ok = allowed.test(path.extname(file.originalname).toLowerCase()) || allowed.test(file.mimetype);
        if (ok) cb(null, true);
        else cb(new Error('Only images (JPG, PNG, GIF, WEBP) and PDF are allowed.'));
    }
});

// ===== Auth routes =====
app.use('/api/auth', auth.router);

// ===== API: Health / diagnostics (no auth) =====
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        cloudMode: cloud.isConfigured(),
        supabaseUrl: process.env.SUPABASE_URL ? sanitizeDisplay(process.env.SUPABASE_URL) : '(not set)',
        adminEmail: ADMIN_EMAIL
    });
});

// Helper to safely show the Supabase URL without leaking secrets
function sanitizeDisplay(raw) {
    if (!raw) return '(not set)';
    try {
        const parsed = new URL(String(raw).trim().replace(/^["']|["']$/g, ''));
        return parsed.protocol + '//' + parsed.host;
    } catch (e) {
        return '(invalid URL format)';
    }
}

// ===== Helper: seed admin in cloud (idempotent) =====
async function seedAdminCloud() {
    if (!cloud.isConfigured()) return;
    try {
        const existing = await cloud.findUserByEmail(ADMIN_EMAIL);
        if (!existing) {
            const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin@123', 10);
            await cloud.insertUser({
                name: 'Subham Sahu',
                email: ADMIN_EMAIL,
                password_hash: hash,
                is_admin: 1,
                created_at: new Date().toISOString()
            });
            console.log('👑 Cloud admin account seeded:', ADMIN_EMAIL);
        } else if (!existing.is_admin) {
            // ensure admin flag
            const supabase = require('@supabase/supabase-js');
            // (simple update via direct client not exposed — handled below)
        }
    } catch (e) {
        console.error('⚠️  Could not seed cloud admin:', e.message);
    }
}

// ===== API: Get all notes (public, but requires login) =====
app.get('/api/notes', auth.requireAuth, async (req, res) => {
    try {
        let notes;
        if (cloud.isConfigured()) {
            notes = await cloud.getAllNotes();
        } else {
            notes = db.queryAll('SELECT * FROM notes ORDER BY rowid DESC');
        }

        const { course, semester } = req.query;
        if (course && course !== 'All') {
            // Show notes for the selected course AND common notes (all departments)
            notes = notes.filter(n => n.course === course || n.course === 'Common');
        }
        if (semester && semester !== 'All') notes = notes.filter(n => n.semester === semester);

        res.json(notes);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== API: Get distinct courses and semesters =====
app.get('/api/filters', auth.requireAuth, async (req, res) => {
    try {
        let notes;
        if (cloud.isConfigured()) {
            notes = await cloud.getAllNotes();
        } else {
            notes = db.queryAll('SELECT * FROM notes');
        }
        const courses = [...new Set(notes.map(n => n.course || 'All'))];
        const semesters = [...new Set(notes.map(n => n.semester || '1'))].sort((a, b) => a - b);
        res.json({ courses, semesters });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== API: Upload notes (ADMIN only) =====
app.post('/api/upload', auth.requireAdmin, upload.array('notes', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded.' });
        }

        const newNotes = [];
        for (const file of req.files) {
            const note = {
                id: uuidv4(),
                filename: file.filename,
                originalName: file.originalname,
                title: req.body.title || file.originalname.replace(/\.[^.]+$/, ''),
                category: req.body.category || 'Uncategorized',
                course: req.body.course || 'All',
                semester: req.body.semester || '1',
                url: `/uploads/${file.filename}`,
                date: new Date().toISOString(),
                size: file.size
            };

            // Cloud mode: upload file to Supabase Storage, store note in Postgres
            if (cloud.isConfigured()) {
                const fileBuffer = fs.readFileSync(file.path);
                const publicUrl = await cloud.uploadFile(fileBuffer, file.filename, file.mimetype);
                note.url = publicUrl;
                await cloud.insertNote(note);
                // Clean up local temp file (already persisted to cloud)
                try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
            } else {
                db.run(
                    `INSERT INTO notes (id, filename, originalName, title, category, course, semester, url, date, size)
                     VALUES (?,?,?,?,?,?,?,?,?,?)`,
                    [note.id, note.filename, note.originalName, note.title, note.category, note.course, note.semester, note.url, note.date, note.size]
                );
            }
            newNotes.push(note);
        }

        res.json({ success: true, notes: newNotes });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== API: Delete a note (ADMIN only) =====
app.delete('/api/notes/:id', auth.requireAdmin, async (req, res) => {
    try {
        let note;
        if (cloud.isConfigured()) {
            note = await cloud.getNoteById(req.params.id);
        } else {
            note = db.queryOne('SELECT * FROM notes WHERE id = ?', [req.params.id]);
        }
        if (!note) return res.status(404).json({ error: 'Note not found.' });

        if (cloud.isConfigured()) {
            await cloud.deleteNote(note.id);
            await cloud.deleteFile(note.filename);
        } else {
            db.run('DELETE FROM notes WHERE id = ?', [note.id]);
            const filePath = path.join(__dirname, 'uploads', note.filename);
            if (note.filename && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }

        res.json({ success: true, message: 'Note deleted.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== API: Delete multiple notes (ADMIN only) =====
app.post('/api/notes/bulk-delete', auth.requireAdmin, async (req, res) => {
    try {
        const { ids } = req.body || {};
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ error: 'Provide array of ids.' });
        }
        let deleted = 0;
        for (const id of ids) {
            let note;
            if (cloud.isConfigured()) {
                note = await cloud.getNoteById(id);
                if (note) {
                    await cloud.deleteNote(id);
                    await cloud.deleteFile(note.filename);
                    deleted++;
                }
            } else {
                note = db.queryOne('SELECT * FROM notes WHERE id = ?', [id]);
                if (note) {
                    db.run('DELETE FROM notes WHERE id = ?', [id]);
                    const fp = path.join(__dirname, 'uploads', note.filename);
                    if (note.filename && fs.existsSync(fp)) fs.unlinkSync(fp);
                    deleted++;
                }
            }
        }
        res.json({ success: true, deleted });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== Serve the PWA app shell =====
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'intro.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'intro.html'));
});

// ===== Admin page =====
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// ===== Start =====
async function start() {
    // Always init local SQLite first (for dev fallback)
    await db.initDatabase();

    // Init cloud (Supabase) if configured
    cloud.initCloud();
    if (cloud.isConfigured()) {
        await cloud.ensureBucket();
        await seedAdminCloud();
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log('');
        console.log('🚀 Notes App is running!');
        console.log('   Public (app): http://localhost:' + PORT);
        console.log('   Admin page  : http://localhost:' + PORT + '/admin');
        console.log('');

        // Show local network IPs
        const nets = os.networkInterfaces();
        const ips = [];
        for (const name of Object.keys(nets)) {
            for (const net of nets[name] || []) {
                if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
            }
        }
        if (ips.length) {
            console.log('📱 On the same Wi-Fi, open on your phone:');
            ips.forEach(ip => console.log('   http://' + ip + ':' + PORT));
        }
        console.log('');
        console.log('🌍 For access from ANY phone with data/Wi-Fi (like a normal app):');
        console.log('   Deploy to Render.com — see README for step-by-step');
        console.log('');
        if (cloud.isConfigured()) {
            console.log('☁️  Cloud storage ACTIVE — notes saved permanently.');
        } else {
            console.log('⚠️  Local storage mode (dev). Add SUPABASE_URL + SUPABASE_SERVICE_KEY for permanent cloud storage.');
        }
        console.log('👑 Admin login: ' + ADMIN_EMAIL + '  /  password: ' + (process.env.ADMIN_PASSWORD || 'admin@123'));
        console.log('   ⚠️  CHANGE the admin password after first login!');
    });
}

start().catch(e => {
    console.error('Fatal error starting server:', e);
    process.exit(1);
});

