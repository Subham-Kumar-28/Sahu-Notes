============================================================
📱 NOTES APP — Subham Sahu's Handwritten Notes Website + App
============================================================

WHAT THIS IS
------------
A full app (PWA) + website for sharing handwritten study notes.
Anyone with a phone (mobile data OR any Wi-Fi) can open the URL,
sign up with their Gmail + password, and browse notes.

It works BOTH as:
  🌐 A normal website (open the URL in any browser)
  📲 An installable app (tap "Add to Home Screen" on phone)

------------------------------------------------------------
🔑 LOGIN SYSTEM
------------------------------------------------------------
- Everyone must create an account with Gmail + password to view notes
- Passwords are stored HASHED (never plain text)
- Your admin Gmail: myselfsubhamkumar@gmail.com
- Admin default password: admin@123   ← CHANGE IT AFTER FIRST LOGIN!
- ONLY your admin Gmail can upload notes (in-app "+" button)

------------------------------------------------------------
💾 PERMANENT CLOUD STORAGE (Supabase) — IMPORTANT
------------------------------------------------------------
Render.com's FREE plan uses a TEMPORARY filesystem. If you upload
notes to a local SQLite file or local uploads folder, they get
ERASED every time the app restarts or redeploys!

To make notes PERMANENT (like a real app), we connect to Supabase
(free cloud database + file storage). Files are stored in the cloud,
NOT on Render. Setup takes ~5 minutes (once):

  1. Go to https://supabase.com → "Start your project" → free plan
  2. Name it (e.g. "notes-app") and pick a region near you
  3. Save the "Project URL" (e.g. https://xyz.supabase.co)
  4. In Settings → API, find the "service_role" key (secret)
     ⚠️  Keep it secret — it's the admin key!
  5. Run this ONCE (from your PC):
     Set-Content -Path .env -Value @"
     SUPABASE_URL=https://YOURPROJECT.supabase.co
     SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY
     "@
     node supabase-setup.js
     (This creates the notes/users/sessions tables + storage bucket)

  OR run the SQL from supabase-setup.js manually in
  Dashboard → SQL Editor (only if the script can't).

---- WITHOUT Supabase (local testing only) ----
  The app still runs 100% fine locally using SQLite (notes-app.db).
  Use it for testing on your PC / same Wi-Fi.
  For real public deployment, you NEED Supabase so notes stay forever.

------------------------------------------------------------
📤 HOW TO ADD YOUR NOTES (ADMIN) — IN THE APP
------------------------------------------------------------
1. Open the app URL & login with your ADMIN Gmail + password
   (myselfsubhamkumar@gmail.com / admin@123)
2. You'll see a special "➕ Add" button in the bottom navigation
   (normal students DON'T see this)
3. Tap "Add" → choose your files (images JPG/PNG/WEBP or PDF)
4. Choose the COURSE:
   - ⭐ Common (All Departments) → shows in ALL departments at once
   - BCA / BSc AI&ML / BCS / IT / PYQ → shows only in that department
5. Choose the SEMESTER (1 to 8)
6. (Optional) Add a title + subject category
7. Tap "Add Notes" ✅ — done! Notes appear instantly & stay forever.

⭐ TIP: Upload a note once as "Common (All Departments)" and it will
automatically appear for every department — no need to upload 4 times!

(There is also a full admin panel at /admin with the same features.)

------------------------------------------------------------
🚀 RUN LOCALLY (testing on your PC)
------------------------------------------------------------
1. Install Node.js from https://nodejs.org (v16+)
2. Open this folder in terminal
3. Run:   npm install
4. Run:   npm start   (or: node server.js)
5. Open:  http://localhost:3000

Same Wi-Fi (phone testing):
- The server prints your local IP, e.g. http://192.168.1.5:3000
- Open that on your phone (same Wi-Fi)

------------------------------------------------------------
🌍 DEPLOY ONLINE (any phone, any data/Wi-Fi — RECOMMENDED)
------------------------------------------------------------

OPTION 1 — Render.com (FREE) + Supabase (FREE)  ✅ BEST
1. Push this project to GitHub (search "how to push folder to github")
   - IMPORTANT: do NOT push .env or notes-app.db
     (.gitignore already excludes them)
2. Create a free account at https://render.com
3. Click "New" → "Blueprint" → connect your GitHub repo
   - Render reads render.yaml automatically
4. Add these environment variables in Render → your service → Environment:
     SUPABASE_URL = https://YOURPROJECT.supabase.co
     SUPABASE_SERVICE_KEY = YOUR_SERVICE_ROLE_KEY
     ADMIN_PASSWORD = (your own strong password — CHANGE from admin@123)
   ⚠️  YOU MUST add SUPABASE_URL + SUPABASE_SERVICE_KEY, otherwise
       notes get wiped on every restart (free tier ephemeral disk).
5. Deploy. You get a public URL like: https://notes-app.onrender.com
6. Share that URL — anyone with a phone can open it with their DATA!

OPTION 2 — Quick tunnel (test public access from your PC now)
1. Make sure server is running (npm start)
2. In a new terminal, run:   npx localtunnel --port 3000
3. It prints a public URL like https://something.loca.lt
4. Open that URL on any phone (anywhere) — works with data/Wi-Fi
   Note: Tunnel is temporary (while your PC stays on) and NOT for
   long-term use — use Render for the real app.

OPTION 3 — Railway / Fly.io / Heroku
- Same as Render: push to GitHub, connect, set SUPABASE env vars.

------------------------------------------------------------
🛠️ ADMIN PANEL (web version)
------------------------------------------------------------
- URL: http://YOUR-URL/admin
- Login with: myselfsubhamkumar@gmail.com / (your ADMIN_PASSWORD)
- Upload notes (images or PDF) with course + semester
- ⭐ "Common (All Departments)" option uploads once for every department
- Delete notes

NOTE: The admin password is set in:
- .env file (create from .env.example) OR
- Environment variables on Render (ADMIN_PASSWORD)
Change it BEFORE sharing the app with others!

------------------------------------------------------------
📁 PROJECT STRUCTURE
------------------------------------------------------------
server.js          — main server (Express + SQLite/Supabase + auth + PWA)
database.js        — local SQLite database setup & migration (dev)
cloud.js           — ☁️ Supabase cloud persistence (production)
auth.js            — Gmail+password auth routes
supabase-setup.js  — one-time Supabase table/bucket setup
intro.html         — the app (PWA shell: login, home, notes, upload, profile)
admin/index.html   — admin upload panel (auth protected)
public/            — app.css, app.js, offline.html, icons
uploads/           — local uploaded files (dev only; cloud uses Supabase)
manifest.json      — PWA install config
service-worker.js  — offline support
render.yaml        — one-click deploy config for Render.com
Procfile           — deploy start command
.env.example       — environment variables template

------------------------------------------------------------
✅ STATUS: IMPLEMENTATION COMPLETE
   · PWA app + website (installable on phone)
   · Gmail + password login for everyone
   · Admin-only in-app upload ("+" button) + Common all-dept notes
   · Permanent cloud storage via Supabase (no more lost notes)
   · One-click deployment to Render.com
------------------------------------------------------------

