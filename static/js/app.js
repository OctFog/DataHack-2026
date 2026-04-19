// State Management
let stream = null;
let currentImageData = null;
let currentLocation = null;
let collection = JSON.parse(localStorage.getItem('animalCollection')) || [];

// DOM Elements
const video = document.getElementById('camera-feed');
const canvas = document.getElementById('photo-canvas');
const ctx = canvas.getContext('2d');

const views = {
    capture: document.getElementById('view-capture'),
    preview: document.getElementById('view-preview'),
    result: document.getElementById('view-result'),
    collection: document.getElementById('view-collection')
};

const headerTitle = document.getElementById('header-title');
const navItems = document.querySelectorAll('.nav-item');

// Initialize Application
function init() {
    setupEventListeners();
    renderCollection();
    startCamera();
}

// Navigation & View Management
function showView(viewName, title = 'NatureSnap') {
    // Hide all views
    Object.values(views).forEach(v => v.classList.remove('active'));

    // Show target view
    if (views[viewName]) {
        views[viewName].classList.add('active');
    }

    // Update Header
    headerTitle.textContent = title;

    // Update Bottom Nav Active State
    if (viewName === 'capture' || viewName === 'collection') {
        navItems.forEach(item => {
            if (item.dataset.target === `view-${viewName}`) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // Handle Camera Lifecycle
    if (viewName === 'capture') {
        startCamera();
    } else {
        stopCamera();
    }
}

// Event Listeners setup
function setupEventListeners() {
    // Nav Navigation
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const target = e.currentTarget.dataset.target.replace('view-', '');
            showView(target, target === 'collection' ? 'My Collection' : 'NatureSnap');
        });
    });

    // Capture Photo
    document.getElementById('btn-capture').addEventListener('click', capturePhoto);

    // Retake Photo
    document.getElementById('btn-retake').addEventListener('click', () => {
        showView('capture');
    });

    // Confirm & Upload
    document.getElementById('btn-confirm').addEventListener('click', handleUpload);
}

// Camera Operations
async function startCamera() {
    if (stream) return; // Already running
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }, // Prefers back camera on mobile
            audio: false
        });
        video.srcObject = stream;
    } catch (err) {
        console.error("Error accessing camera:", err);
        alert("Camera access is required to identify animals.");
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        video.srcObject = null;
    }
}

// Capture Logic
function capturePhoto() {
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to base64 image data
    currentImageData = canvas.toDataURL('image/jpeg', 0.8);

    showView('preview', 'Preview');
}

// Location & Upload Logic
async function handleUpload() {
    const btnGroup = document.querySelector('.button-group');
    const spinner = document.getElementById('loading-spinner');

    // UI State: Loading
    btnGroup.classList.add('hidden');
    spinner.classList.remove('hidden');

    try {
        // 1. Get Location
        currentLocation = await getLocation();

        // 2. Send to Backend (Mock Fetch)
        // 将原来的: const result = await mockBackendIdentify(currentImageData, currentLocation);
// 修改为:
const result = await backendIdentify(currentImageData, currentLocation);

        // 3. Save to Collection
        const newEntry = {
            id: Date.now().toString(),
            image: currentImageData,
            name: result.name,
            description: result.description,
            lat: currentLocation ? currentLocation.lat : null,
            lng: currentLocation ? currentLocation.lng : null,
            date: new Date().toLocaleDateString()
        };

        collection.unshift(newEntry); // Add to beginning
        localStorage.setItem('animalCollection', JSON.stringify(collection));
        renderCollection(); // Update grid UI

        // 4. Show Results
        displayResult(newEntry);

    } catch (error) {
        alert("Failed to identify animal: " + error.message);
    } finally {
        // Restore UI State
        btnGroup.classList.remove('hidden');
        spinner.classList.add('hidden');
    }
}

// Geolocation Wrapper
function getLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(null); // Geolocation not supported
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
            (error) => resolve(null), // On error/denial, proceed without location
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 }
        );
    });
}

// 真实的 Backend API Call
async function backendIdentify(image, location) {
    try {
        // Flask 后端的地址
        const response = await fetch('http://127.0.0.1:5000/api/identify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: image,
                location: location
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        return {
            name: data.name,
            description: data.description
        };
    } catch (error) {
        console.error("Backend request failed:", error);
        // 如果后端连接失败，提供一个友好的错误提示
        return {
            name: "Connection Error",
            description: "Could not reach the server. Please make sure the Python backend is running."
        };
    }
}

// Display Result / Detail
function displayResult(animal) {
    document.getElementById('result-image').src = animal.image;
    document.getElementById('result-name').textContent = animal.name;
    document.getElementById('result-description').textContent = animal.description;

    const locText = animal.lat && animal.lng
        ? `Location: ${animal.lat.toFixed(4)}, ${animal.lng.toFixed(4)}`
        : `Location: Not provided`;

    document.getElementById('result-location').textContent = locText;

    showView('result', animal.name);
}

// Render Collection Grid
function renderCollection() {
    const grid = document.getElementById('collection-grid');
    const emptyState = document.getElementById('empty-state');

    grid.innerHTML = ''; // Clear current

    if (collection.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    collection.forEach(animal => {
        const card = document.createElement('div');
        card.className = 'grid-item';
        card.innerHTML = `
            <img src="${animal.image}" alt="${animal.name}">
            <p>${animal.name}</p>
        `;

        // Add click listener to show detail view
        card.addEventListener('click', () => displayResult(animal));

        grid.appendChild(card);
    });
}

// Boot up
window.addEventListener('DOMContentLoaded', init);