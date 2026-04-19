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
let envData = null;
let envFetchedAt = 0;
let activeDetailId = null;

// Comments keyed by collection item id: { [id]: [{author, text, date_iso}] }
let comments = JSON.parse(localStorage.getItem('itemComments') || '{}');

// Redemption state: { spent: number, history: [{reward, cost, date_iso}] }
let redemption = JSON.parse(localStorage.getItem('redemption') || 'null') || { spent: 0, history: [] };

// -------- Rewards catalog --------
const REWARDS = [
    { id: 'sticker',    emoji: '🌿', name: 'Leaf Sticker Pack',        cost: 50,
      desc: 'A set of digital stickers to decorate your profile.' },
    { id: 'tree',       emoji: '🌳', name: 'Plant a Tree (Donation)',  cost: 200,
      desc: 'We donate on your behalf to plant one tree.' },
    { id: 'theme',      emoji: '🌅', name: 'Sunset Theme Unlock',       cost: 120,
      desc: 'Unlock a warm sunset-themed app skin.' },
    { id: 'avatar',     emoji: '🦉', name: 'Owl Avatar Frame',          cost: 80,
      desc: 'Show off your night-owl status with this avatar frame.' },
    { id: 'wildlife',   emoji: '🐻', name: 'Wildlife Fund (Donation)',  cost: 500,
      desc: 'Contribute to a wildlife conservation partner.' },
    { id: 'premium',    emoji: '⭐', name: '1 Month Premium',            cost: 750,
      desc: 'Unlock high-resolution identification and ad-free maps.' },
];

// How many points each snap awards (base + species-bonus)
const POINTS_PER_SNAP = 20;
const BONUS_NEW_SPECIES = 15;

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
    redeem:     document.getElementById('view-redeem'),
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
    redeem: 'Redeem Points',
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
    renderPointsSummary();
    renderRewards();
    renderRedemptionHistory();
    fetchEnvironmental();           // initial environmental fetch
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
        redeem: 'view-collection',
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
    if (viewName === 'home') {
        renderHome();
        // Opportunistically refresh env data if it's older than 10 minutes
        if (Date.now() - envFetchedAt > 10 * 60 * 1000) fetchEnvironmental();
    }
    if (viewName === 'challenge') renderChallenge();
    if (viewName === 'collection') {
        renderCollection();
        renderBadges();
        renderPointsSummary();
    }
    if (viewName === 'redeem') {
        renderPointsSummary();
        renderRewards();
        renderRedemptionHistory();
    }
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

    // Environmental refresh
    const envRefreshBtn = document.getElementById('env-refresh');
    if (envRefreshBtn) envRefreshBtn.addEventListener('click', () => fetchEnvironmental(true));

    // Redemption flow
    const redeemBtn = document.getElementById('btn-redeem');
    if (redeemBtn) redeemBtn.addEventListener('click', () => showView('redeem'));
    const backCol = document.getElementById('btn-back-collection');
    if (backCol) backCol.addEventListener('click', () => showView('collection'));

    // Map detail / comments modal
    const mdClose = document.getElementById('md-close');
    const mdBackdrop = document.getElementById('map-detail-backdrop');
    if (mdClose) mdClose.addEventListener('click', closeMapDetail);
    if (mdBackdrop) mdBackdrop.addEventListener('click', closeMapDetail);
    const mdSubmit = document.getElementById('md-comment-submit');
    if (mdSubmit) mdSubmit.addEventListener('click', submitComment);
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
        renderPointsSummary();
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
        const commentCount = (comments[a.id] || []).length;

        // Custom "pin" icon with comment badge
        const icon = L.divIcon({
            className: 'snap-marker-wrapper',
            html: `
                <div class="snap-marker">
                    <div class="snap-marker-pin">
                        <img src="${a.image}" alt="">
                    </div>
                    ${commentCount > 0 ? `<div class="snap-marker-badge">${commentCount}</div>` : ''}
                </div>
            `,
            iconSize: [46, 56],
            iconAnchor: [23, 52],
            popupAnchor: [0, -48],
        });

        const marker = L.marker([a.lat, a.lng], { icon }).addTo(mapInstance);
        marker.bindPopup(`
            <img src="${a.image}" class="popup-img" alt="${escapeHtml(a.name)}">
            <div><strong>${escapeHtml(a.name)}</strong></div>
            <div style="color:#8E8E93;font-size:12px;margin-bottom:8px">${escapeHtml(a.date)}${commentCount ? ` · 💬 ${commentCount}` : ''}</div>
            <button class="popup-btn" data-detail-id="${a.id}">View Details & Comments</button>
        `);

        marker.on('popupopen', () => {
            const btn = document.querySelector(`.popup-btn[data-detail-id="${a.id}"]`);
            if (btn) btn.addEventListener('click', () => {
                marker.closePopup();
                openMapDetail(a);
            });
        });

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

// ========================================================================
//  ENVIRONMENTAL DATA (AQI / PM2.5)
// ========================================================================
async function fetchEnvironmental(manual = false) {
    const card = document.getElementById('env-card');
    if (!card) return;

    if (manual) {
        card.classList.add('env-refreshing');
    }
    card.classList.add('env-loading');

    // Try device location first; fall back to backend default (SF).
    let loc = null;
    try {
        loc = await Promise.race([
            getLocation(),
            new Promise(resolve => setTimeout(() => resolve(null), 3500)),
        ]);
    } catch (_) { loc = null; }

    const params = loc
        ? `?lat=${loc.lat}&lng=${loc.lng}`
        : '';

    try {
        const url = `http://127.0.0.1:5000/api/environmental${params}`;
        console.log('Fetching AQI from:', url);
        const resp = await fetch(url);
        console.log('Response status:', resp.status);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        console.log('Received data:', data);
        if (data.error) throw new Error(data.error + (data.detail ? ': ' + data.detail : ''));

        envData = data;
        envFetchedAt = Date.now();
        renderEnvironmental(data, loc);
    } catch (err) {
        console.error('Environmental fetch failed:', err);
        renderEnvironmentalError(err.message || 'Unable to load air quality');
    } finally {
        card.classList.remove('env-loading');
        card.classList.remove('env-refreshing');
    }
}

function renderEnvironmental(data, loc) {
    const card = document.getElementById('env-card');
    if (!card) return;

    // Clear any previous level class
    card.classList.remove('env-good','env-moderate','env-usg','env-unhealthy','env-very_unhealthy','env-hazardous','env-unknown');
    card.classList.add(`env-${data.level || 'unknown'}`);

    document.getElementById('env-category').textContent =
        `${data.category || 'Air Quality'} · AQI ${data.aqi != null ? Math.round(data.aqi) : '—'}`;

    const locText = loc
        ? `Near ${loc.lat.toFixed(2)}, ${loc.lng.toFixed(2)}`
        : 'San Francisco (default)';
    document.getElementById('env-location').textContent = locText;

    document.getElementById('env-aqi').textContent =
        data.aqi != null ? Math.round(data.aqi) : '—';

    const pm = data.pm2_5;
    const pmNode = document.getElementById('env-pm25');
    pmNode.innerHTML = pm != null
        ? `${Number(pm).toFixed(1)}<span class="env-metric-unit"> µg/m³</span>`
        : `—<span class="env-metric-unit"> µg/m³</span>`;

    document.getElementById('env-advice').textContent =
        data.advice || 'Air quality data loaded.';
}

function renderEnvironmentalError(msg) {
    const card = document.getElementById('env-card');
    if (!card) return;
    card.classList.remove('env-good','env-moderate','env-usg','env-unhealthy','env-very_unhealthy','env-hazardous');
    card.classList.add('env-unknown');
    document.getElementById('env-category').textContent = 'Air Quality Unavailable';
    document.getElementById('env-location').textContent = 'Check your connection and try again';
    document.getElementById('env-aqi').textContent = '—';
    document.getElementById('env-pm25').innerHTML = '—<span class="env-metric-unit"> µg/m³</span>';
    document.getElementById('env-advice').textContent = msg;
}

// ========================================================================
//  POINTS & REDEMPTION
// ========================================================================
function calculateEarned() {
    // Base points per snap
    let total = collection.length * POINTS_PER_SNAP;
    // Bonus for unique species
    const unique = new Set(collection.map(c => (c.name || '').toLowerCase())).size;
    total += unique * BONUS_NEW_SPECIES;
    // Bonus for earned badges
    const earnedBadges = BADGES.filter(b => b.test(collection) >= b.goal).length;
    total += earnedBadges * 40;
    return total;
}

function currentBalance() {
    const earned = calculateEarned();
    return Math.max(0, earned - (redemption.spent || 0));
}

function renderPointsSummary() {
    const balance = currentBalance();
    const earned = calculateEarned();
    const balanceEl = document.getElementById('points-balance');
    if (balanceEl) balanceEl.textContent = balance;
    const subEl = document.getElementById('points-card-sub');
    if (subEl) {
        const suffix = earned === balance
            ? `${earned} pts earned · Keep snapping!`
            : `${earned} earned · ${redemption.spent || 0} spent`;
        subEl.textContent = suffix;
    }
    const redeemBal = document.getElementById('redeem-balance');
    if (redeemBal) redeemBal.textContent = balance;
}

function renderRewards() {
    const container = document.getElementById('reward-list');
    if (!container) return;
    container.innerHTML = '';
    const balance = currentBalance();

    REWARDS.forEach(r => {
        const affordable = balance >= r.cost;
        const row = document.createElement('div');
        row.className = 'reward-row' + (affordable ? '' : ' locked');
        row.innerHTML = `
            <div class="reward-emoji">${r.emoji}</div>
            <div class="reward-info">
                <div class="reward-name">${escapeHtml(r.name)}</div>
                <div class="reward-desc">${escapeHtml(r.desc)}</div>
                <div class="reward-cost">${r.cost} pts</div>
            </div>
            <button class="reward-btn" ${affordable ? '' : 'disabled'} data-reward="${r.id}">
                ${affordable ? 'Redeem' : 'Locked'}
            </button>
        `;
        container.appendChild(row);
    });

    container.querySelectorAll('.reward-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => redeemReward(btn.dataset.reward));
    });
}

function redeemReward(rewardId) {
    const reward = REWARDS.find(r => r.id === rewardId);
    if (!reward) return;
    const balance = currentBalance();
    if (balance < reward.cost) {
        showToast('Not enough points for this reward');
        return;
    }
    const ok = confirm(`Redeem "${reward.name}" for ${reward.cost} pts?`);
    if (!ok) return;

    redemption.spent = (redemption.spent || 0) + reward.cost;
    redemption.history.unshift({
        reward_id: reward.id,
        reward: reward.name,
        emoji: reward.emoji,
        cost: reward.cost,
        date_iso: new Date().toISOString(),
    });
    localStorage.setItem('redemption', JSON.stringify(redemption));

    renderPointsSummary();
    renderRewards();
    renderRedemptionHistory();
    showToast(`Redeemed: ${reward.name}`);
}

function renderRedemptionHistory() {
    const el = document.getElementById('redemption-history');
    if (!el) return;
    const hist = redemption.history || [];
    if (!hist.length) {
        el.innerHTML = '<div class="empty-state small"><p>No redemptions yet.</p></div>';
        return;
    }
    el.innerHTML = '';
    hist.forEach(h => {
        const d = new Date(h.date_iso);
        const row = document.createElement('div');
        row.className = 'history-row';
        row.innerHTML = `
            <div class="history-emoji">${h.emoji || '🎁'}</div>
            <div class="history-info">
                <div class="history-name">${escapeHtml(h.reward)}</div>
                <div class="history-date">${d.toLocaleDateString()} · ${d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
            </div>
            <div class="history-cost">-${h.cost} pts</div>
        `;
        el.appendChild(row);
    });
}

// ========================================================================
//  MAP DETAIL / COMMENTS MODAL
// ========================================================================
function openMapDetail(item) {
    activeDetailId = item.id;
    document.getElementById('md-image').src = item.image;
    document.getElementById('md-image').alt = item.name;
    document.getElementById('md-name').textContent = item.name;
    document.getElementById('md-meta').textContent = item.date || '';
    document.getElementById('md-description').textContent = item.description || '';
    document.getElementById('md-coords').textContent =
        item.lat && item.lng ? `${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}` : 'No location';

    // Clear the input fields
    document.getElementById('md-comment-text').value = '';

    renderComments(item.id);

    const modal = document.getElementById('map-detail');
    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('open'));
}

function closeMapDetail() {
    const modal = document.getElementById('map-detail');
    modal.classList.remove('open');
    setTimeout(() => modal.classList.add('hidden'), 220);
    activeDetailId = null;
}

function renderComments(itemId) {
    const list = comments[itemId] || [];
    document.getElementById('md-comment-count').textContent = list.length;
    const container = document.getElementById('md-comments');
    container.innerHTML = '';

    if (!list.length) {
        container.innerHTML = '<div class="empty-state small"><p>No comments yet. Be the first!</p></div>';
        return;
    }

    list.forEach(c => {
        const d = new Date(c.date_iso);
        const row = document.createElement('div');
        row.className = 'comment-row';
        row.innerHTML = `
            <div class="comment-avatar">${escapeHtml(initials(c.author || 'You'))}</div>
            <div class="comment-body">
                <div class="comment-head">
                    <span class="comment-author">${escapeHtml(c.author || 'You')}</span>
                    <span class="comment-time">${d.toLocaleDateString()} · ${d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                </div>
                <div class="comment-text">${escapeHtml(c.text)}</div>
            </div>
        `;
        container.appendChild(row);
    });
}

function submitComment() {
    if (!activeDetailId) return;
    const textEl = document.getElementById('md-comment-text');
    const authorEl = document.getElementById('md-comment-author');
    const text = (textEl.value || '').trim();
    const author = (authorEl.value || '').trim() || 'You';
    if (!text) {
        showToast('Please enter a comment');
        return;
    }

    if (!comments[activeDetailId]) comments[activeDetailId] = [];
    comments[activeDetailId].unshift({
        author,
        text,
        date_iso: new Date().toISOString(),
    });
    localStorage.setItem('itemComments', JSON.stringify(comments));

    textEl.value = '';
    renderComments(activeDetailId);
    // refresh the markers so the badge count reflects updated comment count
    if (mapInstance) initMap();
    showToast('Comment posted');
}

// ========================================================================
//  Toast
// ========================================================================
let toastTimer = null;
function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('hidden');
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.classList.add('hidden'), 220);
    }, 1800);
}
