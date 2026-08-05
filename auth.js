/**
 * auth.js — Gmail + password authentication
 *
 * - Register / Login / Logout / Me / Change-password
 * - Passwords are hashed with bcryptjs (never stored in plain text)
 * - Sessions are stored in SQLite, one token per login
 * - Uses Supabase cloud storage when configured (permanent on Render)
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./database');
const cloud = require('./cloud');

const router = express.Router();

function publicUser(u) {
    return {
        id: u.id,
        name: u.name,
        email: u.email,
        is_admin: !!u.is_admin,
        created_at: u.created_at
    };
}

async function getUserByToken(token) {
    if (!token) return null;
    // Cloud mode
    if (cloud.isConfigured()) {
        return await cloud.findUserByToken(token);
    }
    // Local mode
    const s = db.queryOne('SELECT * FROM sessions WHERE token = ?', [token]);
    if (!s) return null;
    return db.queryOne('SELECT * FROM users WHERE id = ?', [s.user_id]);
}

function requireAuth(req, res, next) {
    const auth = req.headers.authorization || '';
    const token = auth.replace('Bearer ', '').trim();
    getUserByToken(token).then(user => {
        if (!user) {
            return res.status(401).json({ error: 'Please login to continue.' });
        }
        req.user = user;
        req.token = token;
        next();
    }).catch(() => {
        res.status(401).json({ error: 'Please login to continue.' });
    });
}

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (!req.user.is_admin) {
            return res.status(403).json({ error: 'Admin access only.' });
        }
        next();
    });
}

// ===== POST /api/auth/register =====
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body || {};
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email and password are required.' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Please enter a valid email address.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        const em = email.trim().toLowerCase();

        // Cloud mode
        if (cloud.isConfigured()) {
            const existing = await cloud.findUserByEmail(em);
            if (existing) {
                return res.status(409).json({ error: 'An account with this email already exists. Please login.' });
            }
            const hash = bcrypt.hashSync(password, 10);
            const createdAt = new Date().toISOString();
            const user = {
                name: name.trim(),
                email: em,
                password_hash: hash,
                is_admin: 0,
                created_at: createdAt
            };
            await cloud.insertUser(user);
            const created = await cloud.findUserByEmail(em);
            const token = crypto.randomBytes(32).toString('hex');
            await cloud.insertSession(token, created.id);
            return res.json({ success: true, token, user: publicUser(created) });
        }

        // Local mode
        const existing = db.queryOne('SELECT id FROM users WHERE email = ?', [em]);
        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists. Please login.' });
        }
        const hash = bcrypt.hashSync(password, 10);
        const createdAt = new Date().toISOString();
        db.run(
            'INSERT INTO users (name, email, password_hash, is_admin, created_at) VALUES (?,?,?,0,?)',
            [name.trim(), em, hash, createdAt]
        );
        const user = db.queryOne('SELECT * FROM users WHERE email = ?', [em]);
        const token = crypto.randomBytes(32).toString('hex');
        db.run('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)', [token, user.id, createdAt]);

        res.json({ success: true, token, user: publicUser(user) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== POST /api/auth/login =====
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }
        const em = email.trim().toLowerCase();

        // Cloud mode
        if (cloud.isConfigured()) {
            const user = await cloud.findUserByEmail(em);
            if (!user || !bcrypt.compareSync(password, user.password_hash)) {
                return res.status(401).json({ error: 'Invalid email or password.' });
            }
            const token = crypto.randomBytes(32).toString('hex');
            await cloud.insertSession(token, user.id);
            return res.json({ success: true, token, user: publicUser(user) });
        }

        // Local mode
        const user = db.queryOne('SELECT * FROM users WHERE email = ?', [em]);
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        const token = crypto.randomBytes(32).toString('hex');
        db.run('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)', [token, user.id, new Date().toISOString()]);

        res.json({ success: true, token, user: publicUser(user) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== POST /api/auth/logout =====
router.post('/logout', requireAuth, async (req, res) => {
    try {
        if (cloud.isConfigured()) {
            await cloud.deleteSession(req.token);
        } else {
            db.run('DELETE FROM sessions WHERE token = ?', [req.token]);
        }
        res.json({ success: true, message: 'Logged out.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== GET /api/auth/me =====
router.get('/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
});

// ===== POST /api/auth/change-password =====
router.post('/change-password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body || {};
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required.' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters.' });
        }
        if (!bcrypt.compareSync(currentPassword, req.user.password_hash)) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }
        const hash = bcrypt.hashSync(newPassword, 10);
        if (cloud.isConfigured()) {
            await cloud.updateUserPassword(req.user.id, hash);
        } else {
            db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
        }
        res.json({ success: true, message: 'Password updated successfully.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = { router, requireAuth, requireAdmin, getUserByToken, publicUser };

