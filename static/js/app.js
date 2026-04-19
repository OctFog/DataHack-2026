// ========================================================================
//  NatureSnap — Apple-style 5-tab app
// ========================================================================

// -------- State --------
let stream = null;
let currentImageData = null;
let currentLocation = null;
let collection = JSON.parse(localStorage.getItem('animalCollection')) || [];
let mapInstance = null;
let mapMarkers = [];

// -------- Badge definitions --------
const BADGES = [
    { id: 'first',     emoji: '🌱', name: 'First Snap',     goal: 1,  test: c => c.length },
    { id: 'birds',     emoji: '🐦', name: 'Bird Watcher',   goal: 5,  test: c => uniqueByCategory(c, ['bird']) },
    { id: 'cats',      emoji: '🐱', name: 'Cat Friend',     goal: 3,  test: c => uniqueByCategory(c, ['cat']) },
    { id: 'dogs',      emoji: '🐶', name: 'Dog Lover',      goal: 3,  test: c => uniqueByCategory(c, ['dog']) },
    { id: 'wild',      emoji: '🦊', name: 'Wild Spotter',   goal: 5,  test: c => uniqueByCategory(c, ['fox','bear','deer','wolf']) },
    { id: 'horse',     emoji: '🐴', name: 'Horse Whisperer',goal: 2,  test: c => uniqueByCategory(c, ['horse']) },
    { id: 'streak',    emoji: '🔥', name: 'Daily Streak',   goal: 3,  test: c => calculateStreak(c) },
    { id: 'collector', emoji: '🏆', name: 'Collector',      goal: 20, test: c => c.length },
];

// -------- Mock leaderboard data --------
const LEADERBOARDS = {
    global: [
        { name: 'Aria S.',       score: 482, snaps: 24 },
        { name: 'Marcus L.',     score: 421, snaps: 19 },
        { name: 'Yuki T.',       score: 398, snaps: 18 },
        { name: 'Priya N.',      score: 355, snaps: 16 },
        { name: 'Diego R.',      score: 320, snaps: 15 },
        { name: 'Emma K.',       score: 280, snaps: 12 },
        { name: 'Liam P.',       score: 245, snaps: 11 },
        { name: 'Sophie M.',     score: 210, snaps: 9  },
    ],
    friends: [
        { name: 'Marcus L.',     score: 421, snaps: 19 },
        { name: 'Sophie M.',     score: 210, snaps: 9  },
        { name: 'Liam P.',       score: 245, snaps: 11 },
    ],
    local: [
        { name: 'Yuki T.',       score: 398, snaps: 18 },
        { name: 'Priya N.',      score: 355, snaps: 16 },
        { name: 'Emma K.',       score: 280, snaps: 12 },
    ],
};

// -------- DOM --------
const video = document.getElementById('camera-feed');
const canvas = document.getElementById('photo-canvas');
const ctx = canvas.getContext('2d');

const views = {
    home:       document.getElementById('view-home'),
    challenge:  document.getElementById('view-challenge'),
    capture:    document.getElementById('view-capture'),
    preview:    document.getElementById('view-preview'),
    result:     document.getElementById('view-result'),
    map:        document.getElementById('view-map'),
    collection: document.getElementById('view-collection'),
};

const headerTitle = document.getElementById('header-title');
const navItems = document.querySelectorAll('.nav-item');

const TITLES = {
    home: 'NatureSnap',
    challenge: 'Weekly Challenge',
    capture: 'Camera',
    preview: 'Preview',
    result: 'Identified',
    map: 'Map',
    collection: 'Collection',
};

// ========================================================================
//  Init
// ========================================================================
function init() {
    setupEventListeners();
    renderHome();
    renderChallenge();
    renderCollection();
    renderBadges();
    showView('home');
}

window.addEventListener('DOMContentLoaded', init);

// ========================================================================
//  Navigation
// ========================================================================
function showView(viewName) {
    Object.values(views).forEach(v => v && v.classList.remove('active'));
    if (views[viewName]) views[viewName].classList.add('active');

    headerTitle.textContent = TITLES[viewName] || 'NatureSnap';

    // Bottom nav active state — only certain views map to a nav button
    const navMap = {
        home: 'view-home',
        challenge: 'view-challenge',
        capture: 'view-capture',
        preview: 'view-capture',
        result: 'view-collection',
        map: 'view-map',
        collection: 'view-collection',
    };
    const target = navMap[viewName];
    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.target === target);
    });

    // Camera lifecycle
    if (viewName === 'capture') startCamera();
    else stopCamera();

    // Map lazy init / refresh
    if (viewName === 'map') initMap();

    // Refresh dynamic views
    if (viewName === 'home') renderHome();
    if (viewName === 'challenge') renderChallenge();
    if (viewName === 'collection') { renderCollection(); renderBadges(); }
}

function setupEventListeners() {
    navItems.forEach(item => {
        item.addEventListener('click', e => {
            const target = e.currentTarget.dataset.target.replace('view-', '');
            showView(target);
        });
    });

    document.getElementById('btn-capture').addEventListener('click', capturePhoto);
    document.getElementById('btn-retake').addEventListener('click', () => showView('capture'));
    document.getElementById('btn-confirm').addEventListener('click', handleUpload);
    document.getElementById('btn-back-home').addEventListener('click', () => showView('home'));

    // Challenge segmented control
    document.querySelectorAll('.seg-btn[data-seg]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.seg-btn[data-seg]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderLeaderboard(btn.dataset.seg);
        });
    });

    // Collection segmented control
    document.querySelectorAll('.seg-btn[data-col]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.seg-btn[data-col]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.dataset.col;
            document.getElementById('col-badges').classList.toggle('hidden', target !== 'badges');
            document.getElementById('col-species').classList.toggle('hidden', target !== 'species');
        });
    });
}

// ========================================================================
//  HOME
// ========================================================================
function renderHome() {
    // Greeting
    const hour = new Date().getHours();
    let greet = 'Good evening 🌙';
    if (hour < 12) greet = 'Good morning 🌿';
    else if (hour < 18) greet = 'Good afternoon ☀️';
    document.getElementById('home-greeting').textContent = greet;
    document.getElementById('home-date').textContent =
        new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

    // Weekly stats
    const weekStart = startOfWeek(new Date());
    const weekly = collection.filter(c => new Date(c.date_iso || c.date) >= weekStart);
    const speciesSet = new Set(collection.map(c => c.name));
    const earnedBadges = BADGES.filter(b => b.test(collection) >= b.goal).length;
    const streak = calculateStreak(collection);

    document.getElementById('stat-snaps').textContent   = weekly.length;
    document.getElementById('stat-species').textContent = speciesSet.size;
    document.getElementById('stat-badges').textContent  = earnedBadges;
    document.getElementById('stat-streak').textContent  = streak;

    // Next badge progress
    const next = BADGES.find(b => b.test(collection) < b.goal) || BADGES[BADGES.length - 1];
    const cur  = Math.min(next.test(collection), next.goal);
    const pct  = Math.round((cur / next.goal) * 100);

    document.getElementById('progress-badge-icon').textContent = next.emoji;
    document.getElementById('progress-name').textContent  = next.name;
    document.getElementById('progress-sub').textContent   = badgeDescription(next);
    document.getElementById('progress-percent').textContent = pct + '%';
    document.getElementById('progress-bar-fill').style.width = pct + '%';
    document.getElementById('progress-count').textContent = `${cur} / ${next.goal}`;

    // Hero ring (overall progress = badges earned / total)
    const overallPct = Math.round((earnedBadges / BADGES.length) * 100);
    const ring = document.getElementById('home-ring');
    const circ = 2 * Math.PI * 26;
    ring.setAttribute('stroke-dasharray', circ);
    ring.setAttribute('stroke-dashoffset', circ * (1 - overallPct / 100));
    document.getElementById('home-ring-label').textContent = overallPct + '%';

    // Recent activity
    const recentList = document.getElementById('recent-list');
    recentList.innerHTML = '';
    if (collection.length === 0) {
        recentList.innerHTML = '<div class="empty-state small"><p>No activity yet. Tap the camera to start!</p></div>';
    } else {
        collection.slice(0, 4).forEach(a => {
            const row = document.createElement('div');
            row.className = 'recent-row';
            row.innerHTML = `
                <img src="${a.image}" alt="${escapeHtml(a.name)}">
                <div class="recent-info">
                    <div class="recent-name">${escapeHtml(a.name)}</div>
                    <div class="recent-meta">${escapeHtml(a.date)}${a.lat ? ' · ' + a.lat.toFixed(2) + ', ' + a.lng.toFixed(2) : ''}</div>
                </div>
                <div class="chev">›</div>
            `;
            row.addEventListener('click', () => displayResult(a));
            recentList.appendChild(row);
        });
    }
}

// ========================================================================
//  WEEKLY CHALLENGE
// ========================================================================
function renderChallenge() {
    // Challenge: snap 5 different birds this week
    const weekStart = startOfWeek(new Date());
    const birdsThisWeek = collection.filter(c =>
        new Date(c.date_iso || c.date) >= weekStart &&
        /bird|sparrow|owl|eagle|robin|finch|crow|parrot|pigeon/i.test(c.name)
    );
    const cur = Math.min(birdsThisWeek.length, 5);
    const pct = (cur / 5) * 100;

    document.getElementById('challenge-progress-fill').style.width = pct + '%';
    document.getElementById('challenge-progress-label').textContent = `${cur} / 5`;

    // Days remaining until end of week (Sunday)
    const now = new Date();
    const day = now.getDay(); // 0 = Sun
    const daysLeft = day === 0 ? 0 : 7 - day;
    document.getElementById('challenge-days').textContent = daysLeft;

    // Render leaderboard
    const activeSeg = document.querySelector('.seg-btn[data-seg].active');
    renderLeaderboard(activeSeg ? activeSeg.dataset.seg : 'global');
}

function renderLeaderboard(segment) {
    const data = LEADERBOARDS[segment] || LEADERBOARDS.global;

    // Inject "you" (the current user) based on actual snaps
    const yourScore = collection.length * 20;
    const yourEntry = { name: 'You', score: yourScore, snaps: collection.length, you: true };
    const merged = [...data, yourEntry].sort((a, b) => b.score - a.score);

    const container = document.getElementById('leaderboard');
    container.innerHTML = '';
    merged.forEach((entry, i) => {
        const rank = i + 1;
        const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
        const row = document.createElement('div');
        row.className = 'lb-row' + (entry.you ? ' you' : '');
        row.innerHTML = `
            <div class="lb-rank ${rankClass}">${rank}</div>
            <div class="lb-avatar">${initials(entry.name)}</div>
            <div class="lb-info">
                <div class="lb-name">${escapeHtml(entry.name)}</div>
                <div class="lb-meta">${entry.snaps} snaps</div>
            </div>
            <div class="lb-score">${entry.score} pts</div>
        `;
        container.appendChild(row);
    });
}

// ========================================================================
//  CAMERA / CAPTURE
// ========================================================================
async function startCamera() {
    if (stream) return;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false,
        });
        video.srcObject = stream;
    } catch (err) {
        console.error('Error accessing camera:', err);
        // Don't alert immediately — user might just be browsing other tabs
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
        video.srcObject = null;
    }
}

function capturePhoto() {
    if (!video.videoWidth) {
        alert('Camera not ready yet. Please wait a moment.');
        return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    currentImageData = canvas.toDataURL('image/jpeg', 0.8);
    showView('preview');
}

async function handleUpload() {
    const btnGroup = document.querySelector('#view-preview .button-group');
    const spinner = document.getElementById('loading-spinner');

    btnGroup.classList.add('hidden');
    spinner.classList.remove('hidden');

    try {
        currentLocation = await getLocation();
        const result = await backendIdentify(currentImageData, currentLocation);

        const newEntry = {
            id: Date.now().toString(),
            image: currentImageData,
            name: result.name,
            description: result.description,
            lat: currentLocation ? currentLocation.lat : null,
            lng: currentLocation ? currentLocation.lng : null,
            date: new Date().toLocaleDateString(),
            date_iso: new Date().toISOString(),
        };

        collection.unshift(newEntry);
        localStorage.setItem('animalCollection', JSON.stringify(collection));

        renderCollection();
        renderBadges();
        displayResult(newEntry);
    } catch (err) {
        alert('Failed to identify animal: ' + err.message);
    } finally {
        btnGroup.classList.remove('hidden');
        spinner.classList.add('hidden');
    }
}

function getLocation() {
    return new Promise(resolve => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 }
        );
    });
}

async function backendIdentify(image, location) {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/identify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image, location }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return { name: data.name, description: data.description };
    } catch (err) {
        console.error('Backend request failed:', err);
        return {
            name: 'Connection Error',
            description: 'Could not reach the server. Please make sure the Python backend is running.',
        };
    }
}

function displayResult(animal) {
    document.getElementById('result-image').src = animal.image;
    document.getElementById('result-name').textContent = animal.name;
    document.getElementById('result-description').textContent = animal.description;
    const locText = animal.lat && animal.lng
        ? `Location: ${animal.lat.toFixed(4)}, ${animal.lng.toFixed(4)}`
        : 'Location: Not provided';
    document.getElementById('result-location').textContent = locText;
    showView('result');
}

// ========================================================================
//  COLLECTION (species grid)
// ========================================================================
function renderCollection() {
    const grid = document.getElementById('collection-grid');
    const emptyState = document.getElementById('empty-state');
    if (!grid) return;

    grid.innerHTML = '';
    if (collection.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    collection.forEach(a => {
        const card = document.createElement('div');
        card.className = 'grid-item';
        card.innerHTML = `
            <img src="${a.image}" alt="${escapeHtml(a.name)}">
            <p>${escapeHtml(a.name)}</p>
        `;
        card.addEventListener('click', () => displayResult(a));
        grid.appendChild(card);
    });
}

// ========================================================================
//  BADGES
// ========================================================================
function renderBadges() {
    const grid = document.getElementById('badge-grid');
    if (!grid) return;
    grid.innerHTML = '';

    let earned = 0;
    BADGES.forEach(b => {
        const cur = b.test(collection);
        const isEarned = cur >= b.goal;
        if (isEarned) earned++;

        const tile = document.createElement('div');
        tile.className = 'badge-tile' + (isEarned ? '' : ' locked');
        tile.innerHTML = `
            <div class="badge-emoji">${b.emoji}</div>
            <div class="badge-name">${b.name}</div>
            <div class="badge-tile-progress">${Math.min(cur, b.goal)} / ${b.goal}</div>
        `;
        grid.appendChild(tile);
    });

    document.getElementById('badge-earned').textContent = earned;
    document.getElementById('badge-total').textContent = BADGES.length;

    const ring = document.getElementById('badge-ring');
    const circ = 2 * Math.PI * 24;
    ring.setAttribute('stroke-dasharray', circ);
    ring.setAttribute('stroke-dashoffset', circ * (1 - earned / BADGES.length));
}

// ========================================================================
//  MAP
// ========================================================================
function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    if (!mapInstance) {
        const center = collection.find(c => c.lat && c.lng);
        const startLatLng = center ? [center.lat, center.lng] : [37.7749, -122.4194];

        mapInstance = L.map('map', { zoomControl: true }).setView(startLatLng, 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap',
        }).addTo(mapInstance);
    }

    // Force Leaflet to recalc size after view becomes visible
    setTimeout(() => mapInstance.invalidateSize(), 100);

    // Refresh markers
    mapMarkers.forEach(m => mapInstance.removeLayer(m));
    mapMarkers = [];

    const located = collection.filter(c => c.lat && c.lng);
    located.forEach(a => {
        const marker = L.marker([a.lat, a.lng]).addTo(mapInstance);
        marker.bindPopup(`
            <img src="${a.image}" class="popup-img" alt="${escapeHtml(a.name)}">
            <div><strong>${escapeHtml(a.name)}</strong></div>
            <div style="color:#8E8E93;font-size:12px">${escapeHtml(a.date)}</div>
        `);
        mapMarkers.push(marker);
    });

    if (located.length > 1) {
        const group = L.featureGroup(mapMarkers);
        mapInstance.fitBounds(group.getBounds().pad(0.3));
    }

    document.getElementById('map-count').textContent =
        `${located.length} sighting${located.length === 1 ? '' : 's'}`;
}

// ========================================================================
//  Helpers
// ========================================================================
function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function startOfWeek(d) {
    const x = new Date(d);
    const day = x.getDay(); // 0 = Sun
    const diff = day === 0 ? 6 : day - 1; // week starts Monday
    x.setDate(x.getDate() - diff);
    x.setHours(0, 0, 0, 0);
    return x;
}

function uniqueByCategory(coll, keywords) {
    const matches = coll.filter(c =>
        keywords.some(kw => new RegExp(kw, 'i').test(c.name))
    );
    return new Set(matches.map(c => c.name.toLowerCase())).size;
}

function calculateStreak(coll) {
    if (!coll.length) return 0;
    const days = new Set(coll.map(c => {
        const d = new Date(c.date_iso || c.date);
        return d.toISOString().slice(0, 10);
    }));
    let streak = 0;
    const cur = new Date();
    cur.setHours(0, 0, 0, 0);
    while (days.has(cur.toISOString().slice(0, 10))) {
        streak++;
        cur.setDate(cur.getDate() - 1);
    }
    return streak;
}

function badgeDescription(b) {
    const map = {
        first:     'Take your first photo',
        birds:     'Snap 5 different birds',
        cats:      'Snap 3 different cats',
        dogs:      'Snap 3 different dogs',
        wild:      'Find 5 wild animals',
        horse:     'Snap 2 horses',
        streak:    'Snap something 3 days in a row',
        collector: 'Reach 20 total snaps',
    };
    return map[b.id] || `Reach ${b.goal}`;
}
