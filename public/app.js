/* ============================================================
   MCR Notebook+ — frontend logic
   ============================================================ */
(function () {
    'use strict';

    // ===== State =====
    var API = {
        login: '/api/auth/login',
        register: '/api/auth/register',
        logout: '/api/auth/logout',
        me: '/api/auth/me',
        changePassword: '/api/auth/change-password',
        notes: '/api/notes',
        filters: '/api/filters',
        upload: '/api/upload'
    };

    var state = {
        token: localStorage.getItem('notes_token') || '',
        user: null,
        notes: [],
        courses: [],
        semesters: [],
        activeCourse: 'All',
        activeSemester: 'All',
        isAdmin: false
    };

    // ===== DOM shortcuts =====
    function $(id) { return document.getElementById(id); }

    // ===== API helpers =====
    function apiFetch(url, options) {
        options = options || {};
        options.headers = Object.assign({}, options.headers || {});
        if (state.token) options.headers['Authorization'] = 'Bearer ' + state.token;
        if (options.body && typeof options.body !== 'string') {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }
        return fetch(url, options).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok) throw new Error(data.error || 'Request failed');
                return data;
            });
        });
    }

    // ===== Toast =====
    var toastTimer = null;
    function showToast(msg, type) {
        var t = $('toast');
        t.textContent = msg;
        t.className = 'toast show' + (type ? ' ' + type : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3000);
    }

    // ===== Screen navigation =====
    function showScreen(id) {
        var screens = document.querySelectorAll('.screen');
        for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
        $(id).classList.add('active');

        var items = document.querySelectorAll('.nav-item');
        for (var j = 0; j < items.length; j++) items[j].classList.remove('active');
        var navMap = { homeScreen: 'nav-home', notesScreen: 'nav-notes', profileScreen: 'nav-profile', uploadScreen: 'nav-upload' };
        if (navMap[id]) $(navMap[id]).classList.add('active');
    }

    // ===== Init / boot =====
    function boot() {
        registerServiceWorker();
        setupEvents();

        var token = localStorage.getItem('notes_token');
        if (token) {
            state.token = token;
            apiFetch(API.me).then(function (data) {
                state.user = data.user;
                state.isAdmin = !!data.user.is_admin;
                $('headerActions').style.display = 'flex';
                renderAll();
                showScreen('homeScreen');
            }).catch(function () {
                state.token = '';
                localStorage.removeItem('notes_token');
                showScreen('loginScreen');
            });
        } else {
            showScreen('loginScreen');
        }
    }

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/service-worker.js').catch(function () {});
        }
    }

    // ===== Auth UI =====
    function setupEvents() {
        // Toggle login/register
        $('showRegister').addEventListener('click', function () {
            $('loginCard').style.display = 'none';
            $('registerCard').style.display = 'block';
        });
        $('showLogin').addEventListener('click', function () {
            $('loginCard').style.display = 'block';
            $('registerCard').style.display = 'none';
        });

        // Login submit
        $('loginBtn').addEventListener('click', function () {
            var email = $('loginEmail').value.trim();
            var password = $('loginPassword').value;
            if (!email || !password) { showToast('Please enter email and password', 'error'); return; }
            this.disabled = true;
            apiFetch(API.login, {
                method: 'POST',
                body: { email: email, password: password }
            }).then(function (data) {
                state.token = data.token;
                state.user = data.user;
                state.isAdmin = !!data.user.is_admin;
                localStorage.setItem('notes_token', data.token);
                updateAdminUI();
                $('headerActions').style.display = 'flex';
                showToast('Welcome back, ' + data.user.name + '!', 'success');
                loadAllData();
            }).catch(function (e) {
                showToast(e.message, 'error');
            }).finally(function () {
                var btn = $('loginBtn');
                if (btn) btn.disabled = false;
            });
        });

        // Register submit
        $('registerBtn').addEventListener('click', function () {
            var name = $('regName').value.trim();
            var email = $('regEmail').value.trim();
            var password = $('regPassword').value;
            if (!name) { showToast('Please enter your name', 'error'); return; }
            if (!email) { showToast('Please enter your Gmail', 'error'); return; }
            if (password.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
            this.disabled = true;
            apiFetch(API.register, {
                method: 'POST',
                body: { name: name, email: email, password: password }
            }).then(function (data) {
                state.token = data.token;
                state.user = data.user;
                state.isAdmin = !!data.user.is_admin;
                localStorage.setItem('notes_token', data.token);
                showToast('Account created! Welcome ' + data.user.name + ' 🎉', 'success');
                loadAllData();
            }).catch(function (e) {
                showToast(e.message, 'error');
            }).finally(function () {
                var btn = $('registerBtn');
                if (btn) btn.disabled = false;
            });
        });

        // Logout
        function doLogout() {
            apiFetch(API.logout, { method: 'POST' }).catch(function () {});
            state.token = '';
            state.user = null;
            state.isAdmin = false;
            localStorage.removeItem('notes_token');
            $('headerActions').style.display = 'none';
            updateAdminUI();
            showToast('Logged out', 'success');
            showScreen('loginScreen');
        }
        $('logoutBtn').addEventListener('click', doLogout);
        $('menuLogout').addEventListener('click', doLogout);

        // Profile menu: admin panel
        $('menuAdmin').addEventListener('click', function () {
            if (state.isAdmin) window.open('/admin?token=' + state.token, '_blank');
            else showToast('Only the admin can access this.', 'error');
        });

        // ===== Upload: select files =====
        var selectedFiles = [];
        var fileInput = $('fileInput');
        var uploadArea = $('uploadArea');

        uploadArea.addEventListener('click', function () { fileInput.click(); });

        fileInput.addEventListener('change', function () {
            selectedFiles = Array.prototype.slice.call(this.files);
            renderFileList();
        });

        uploadArea.addEventListener('dragover', function (e) {
            e.preventDefault();
            this.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', function () { this.classList.remove('dragover'); });
        uploadArea.addEventListener('drop', function (e) {
            e.preventDefault();
            this.classList.remove('dragover');
            var ok = Array.prototype.filter.call(e.dataTransfer.files, function (f) {
                return f.type.indexOf('image/') === 0 || f.type === 'application/pdf';
            });
            if (ok.length) { selectedFiles = ok; renderFileList(); }
            else showToast('Only images and PDFs allowed', 'error');
        });

        function renderFileList() {
            var list = $('fileList');
            if (!selectedFiles.length) { list.style.display = 'none'; list.innerHTML = ''; return; }
            list.style.display = 'block';
            var html = '';
            for (var i = 0; i < selectedFiles.length; i++) {
                html += '<div class="file-item"><i class="fas fa-file"></i><span class="fname">' +
                    selectedFiles[i].name + '</span><span class="remove" data-i="' + i + '">&times;</span></div>';
            }
            list.innerHTML = html;
            var removes = list.querySelectorAll('.remove');
            for (var j = 0; j < removes.length; j++) {
                (function (idx) {
                    removes[j].addEventListener('click', function () {
                        selectedFiles.splice(idx, 1);
                        renderFileList();
                    });
                })(j);
            }
        }

        // ===== Upload: submit =====
        $('uploadBtn').addEventListener('click', function () {
            var course = $('noteCourse').value;
            var semester = $('noteSemester').value;
            if (!course) { showToast('Please select a course', 'error'); return; }
            if (!semester) { showToast('Please select a semester', 'error'); return; }
            if (!selectedFiles.length) { showToast('Please select files first', 'error'); return; }

            var formData = new FormData();
            for (var i = 0; i < selectedFiles.length; i++) formData.append('notes', selectedFiles[i]);
            var title = $('noteTitle').value.trim();
            if (title) formData.append('title', title);
            formData.append('category', $('noteCategory').value);
            formData.append('course', course);
            formData.append('semester', semester);

            var btn = this;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

            fetch(API.upload, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + state.token },
                body: formData
            }).then(function (res) {
                return res.json().then(function (data) {
                    if (!res.ok) throw new Error(data.error || 'Upload failed');
                    return data;
                });
            }).then(function (data) {
                showToast((data.notes ? data.notes.length : 0) + ' note(s) added successfully! 🎉', 'success');
                // Reset form
                selectedFiles = [];
                $('fileInput').value = '';
                $('noteTitle').value = '';
                $('noteCourse').value = '';
                $('noteSemester').value = '';
                renderFileList();
                // Refresh notes
                loadAllData();
                showScreen('notesScreen');
            }).catch(function (e) {
                showToast(e.message, 'error');
            }).finally(function () {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-upload"></i> Add Notes';
            });
        });

        // Course tabs
        $('courseTabs').addEventListener('click', function (e) {
            var tab = e.target.closest('.course-tab');
            if (!tab) return;
            var tabs = document.querySelectorAll('.course-tab');
            for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
            tab.classList.add('active');
            state.activeCourse = tab.dataset.course;
            renderNotes();
        });

        // Semester filter
        $('semesterFilter').addEventListener('change', function () {
            state.activeSemester = this.value;
            renderNotes();
        });

        // Bottom nav
        $('nav-home').addEventListener('click', function () { showScreen('homeScreen'); });
        $('nav-notes').addEventListener('click', function () { showScreen('notesScreen'); });
        $('nav-upload').addEventListener('click', function () {
            if (!state.isAdmin) { showToast('Only the admin can add notes.', 'error'); return; }
            showScreen('uploadScreen');
        });
        $('nav-profile').addEventListener('click', function () { showScreen('profileScreen'); });

        // Quick links on home
        $('quickBrowse').addEventListener('click', function () { showScreen('notesScreen'); });
        $('quickAdmin').addEventListener('click', function () {
            if (state.isAdmin) window.open('/admin?token=' + state.token, '_blank');
            else showToast('Only the admin can access this.', 'error');
        });

        // Modal close
        $('modalClose').addEventListener('click', closeModal);
        $('modalOverlay').addEventListener('click', function (e) {
            if (e.target === this) closeModal();
        });
    }

    // ===== Data loading =====
    function loadAllData() {
        Promise.all([
            apiFetch(API.notes),
            apiFetch(API.filters)
        ]).then(function (results) {
            state.notes = results[0];
            var f = results[1];
            state.courses = f.courses || [];
            state.semesters = f.semesters || [];
            renderAll();
            showScreen('homeScreen');
        }).catch(function (e) {
            showToast(e.message, 'error');
            showScreen('loginScreen');
        });
    }

    function renderAll() {
        renderHome();
        renderNotes();
        renderProfile();
        renderCourseTabs();
        renderSemesterOptions();
        updateAdminUI();
    }

    // ===== Show/hide admin-only UI (Add tab + quick links) =====
    function updateAdminUI() {
        var addTab = $('nav-upload');
        var adminLink = $('quickAdmin');
        var menuAdmin = $('menuAdmin');
        if (state.isAdmin) {
            if (addTab) addTab.style.display = 'block';
            if (adminLink) adminLink.style.display = 'flex';
            if (menuAdmin) menuAdmin.style.display = 'flex';
        } else {
            if (addTab) addTab.style.display = 'none';
            if (adminLink) adminLink.style.display = 'none';
            if (menuAdmin) menuAdmin.style.display = 'none';
        }
    }

    // ===== Render Home =====
    function renderHome() {
        var uname = state.user ? state.user.name : '';
        var first = uname ? uname.charAt(0).toUpperCase() : '?';
        $('homeHeroGreet').textContent = 'Welcome, ' + (state.user ? state.user.name.split(' ')[0] : 'Student') + '!';
        $('homeHeroSub').textContent = state.isAdmin
            ? 'You have admin access — you can upload & manage notes.'
            : 'Browse handwritten notes by course & semester.';

        $('statTotalNotes').textContent = state.notes.length;
        $('statCourses').textContent = state.courses.length || '-';
        $('statSemesters').textContent = state.semesters.length || '-';

        var adminLink = $('quickAdmin');
        if (state.isAdmin) {
            adminLink.style.display = 'flex';
        } else {
            adminLink.style.display = 'none';
        }

        var avatarEl = $('homeAvatar');
        if (avatarEl) avatarEl.textContent = first;
    }

    // ===== Render course tabs =====
    function renderCourseTabs() {
        var wrap = $('courseTabs');
        var courses = state.courses.slice();
        if (courses.indexOf('All') === -1) courses.unshift('All');
        // Always show a "Common" tab (all-department notes)
        if (courses.indexOf('Common') === -1) courses.splice(1, 0, 'Common');

        var html = '';
        for (var i = 0; i < courses.length; i++) {
            var c = courses[i];
            var icon = 'fa-th-large';
            var label = c === 'All' ? 'All Notes' : c;
            if (c === 'Common') { icon = 'fa-star'; label = 'Common'; }
            else if (c === 'BCA') icon = 'fa-laptop-code';
            else if (c === 'BSc.AI&ML') icon = 'fa-robot';
            else if (c === 'BCS') icon = 'fa-code';
            else if (c === 'IT') icon = 'fa-network-wired';
            else if (c === 'PYQ') icon = 'fa-file-alt';
            var active = state.activeCourse === c ? ' active' : '';
            html += '<button class="course-tab' + active + '" data-course="' + c + '"><i class="fas ' + icon + '"></i> ' + label + '</button>';
        }
        wrap.innerHTML = html;
    }

    // ===== Render semester options =====
    function renderSemesterOptions() {
        var sel = $('semesterFilter');
        var sems = state.semesters.slice().sort(function (a, b) { return a - b; });
        var html = '<option value="All">All Semesters</option>';
        for (var i = 0; i < sems.length; i++) {
            var selected = sems[i] === state.activeSemester ? ' selected' : '';
            html += '<option value="' + sems[i] + '"' + selected + '>Semester ' + sems[i] + '</option>';
        }
        sel.innerHTML = html;
    }

    // ===== Render Notes =====
    function renderNotes() {
        var grid = $('notesGrid');
        var notes = state.notes.slice();

        if (state.activeCourse !== 'All') {
            // Show notes for the selected course AND common notes (all departments)
            notes = notes.filter(function (n) { return n.course === state.activeCourse || n.course === 'Common'; });
        }
        if (state.activeSemester !== 'All') {
            notes = notes.filter(function (n) { return n.semester === state.activeSemester; });
        }

        grid.innerHTML = '';
        if (notes.length === 0) {
            grid.innerHTML = '<div class="notes-empty"><i class="fas fa-file-alt"></i><p>No notes found for this selection.</p></div>';
            return;
        }

        // Newest first
        notes.reverse();
        for (var i = 0; i < notes.length; i++) {
            var note = notes[i];
            var card = document.createElement('div');
            card.className = 'note-card';
            var isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(note.url);

            var html = '';
            if (isImage) {
                html += '<img src="' + note.url + '" alt="' + (note.title || 'note') + '" loading="lazy">';
            } else {
                html += '<div class="pdf-icon"><i class="fas fa-file-pdf"></i></div>';
            }
            html += '<div class="note-info">';
            html += '<h4>' + (note.title || 'Untitled') + '</h4>';
            html += '<div class="badge-row">';
            if (note.course) {
                if (note.course === 'Common') html += '<span class="badge badge-common"><i class="fas fa-star"></i> All Departments</span>';
                else html += '<span class="badge badge-course">' + note.course + '</span>';
            }
            if (note.semester) html += '<span class="badge badge-sem">Sem ' + note.semester + '</span>';
            html += '</div>';
            if (note.date) html += '<div class="note-date">' + new Date(note.date).toLocaleDateString() + '</div>';
            html += '</div>';
            card.innerHTML = html;

            (function (url, title) {
                card.addEventListener('click', function () { openNote(url, title); });
            })(note.url, note.title);

            grid.appendChild(card);
        }
    }

    // ===== Render Profile =====
    function renderProfile() {
        var user = state.user;
        if (!user) return;
        var first = (user.name || '?').charAt(0).toUpperCase();
        $('profileAvatar').textContent = first;
        $('profileName').textContent = user.name;
        $('profileEmail').textContent = user.email;

        var badge = $('adminBadge');
        if (state.isAdmin) badge.style.display = 'inline-flex';
        else badge.style.display = 'none';
    }

    // ===== Note viewer =====
    function openNote(url, title) {
        var overlay = $('modalOverlay');
        var container = $('modalContent');
        container.innerHTML = '';
        $('modalTitle').textContent = title || 'Note';

        var isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
        if (isImage) {
            var img = document.createElement('img');
            img.src = url;
            img.alt = title || 'note';
            container.appendChild(img);
        } else {
            var iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.style.width = '100%';
            iframe.style.height = '78vh';
            container.appendChild(iframe);
        }
        overlay.classList.add('open');
    }

    function closeModal() {
        $('modalOverlay').classList.remove('open');
        $('modalContent').innerHTML = '';
    }

    // ===== Boot =====
    document.addEventListener('DOMContentLoaded', boot);
})();

