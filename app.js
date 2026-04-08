// --- ELEMENT REFERENCES ---
const loginWrapper = document.getElementById('login-wrapper');
const appWrapper = document.getElementById('app-wrapper');
const registerButton = document.getElementById('registerButton');
const userNameInput = document.getElementById('userName');
const userAgeInput = document.getElementById('userAge');

const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const repCountElement = document.getElementById('rep-count');
const stageTextElement = document.getElementById('stage-text');
const loadingMessage = document.getElementById('loading-message');
const exerciseChoice = document.getElementById('exercise-choice');
const qualityTextElement = document.getElementById('quality-text');

const demoContainer = document.getElementById('demo-container');
const demoVideoElement = document.getElementById('demoVideo');
const toggleDemoButton = document.getElementById('toggleDemoButton');

const repGoalInput = document.getElementById('repGoal');
const progressBar = document.getElementById('progressBar');
const repSound = document.getElementById('repSound');

const sidebarLinks = document.querySelectorAll('.sidebar-menu a');
const pages = document.querySelectorAll('.page');
const profileName = document.getElementById('profile-name');
const profileAge = document.getElementById('profile-age');
const logoutButton = document.getElementById('logoutButton');

const demoVideos = {
    seatedMarch: 'https://storage.googleapis.com/rehab-demos/seated-march.mp4',
    shoulderAbduction: 'https://storage.googleapis.com/rehab-demos/shoulder-abduction.mp4',
    wallPushup: 'https://storage.googleapis.com/rehab-demos/wall-pushup.mp4'
};

// --- GLOBAL VARIABLES & ACCURACY BUFFERS ---
let repCounter = 0;
let stage = 'down'; // Default starting stage
let isSessionActive = false;
let camera = null;
let currentExercise = 'seatedMarch';
let repGoal = 10;
let user = null;

let angleHistory = [];
const SMOOTHING_FRAMES = 5; 

// --- CORE MATH LOGIC (BULLETPROOFED) ---
function calculateAngle(a, b, c) {
    // If MediaPipe loses track, prevent the app from crashing
    if (!a || !b || !c) return 0; 
    
    let radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) { angle = 360 - angle; }
    return Math.round(angle); // Keep it to clean whole numbers
}

function getSmoothedAngle(newAngle) {
    // Failsafe: Prevent NaN (Not a Number) from breaking the array
    if (isNaN(newAngle) || newAngle === 0) return angleHistory.length > 0 ? angleHistory[angleHistory.length - 1] : 0;

    angleHistory.push(newAngle);
    if (angleHistory.length > SMOOTHING_FRAMES) {
        angleHistory.shift(); 
    }
    const sum = angleHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / angleHistory.length);
}

// --- UI UPDATES ---
function updateProgressBar() {
    const progress = (repCounter / repGoal) * 100;
    progressBar.style.width = `${progress > 100 ? 100 : progress}%`;
}

function onRepComplete() {
    if (repCounter >= repGoal) return;
    repCounter++;
    repCountElement.textContent = repCounter;
    
    // Play sound safely
    if (repSound) {
        repSound.currentTime = 0;
        repSound.play().catch(e => console.log("Sound muted by browser"));
    }
    
    updateProgressBar();
    if (repCounter >= repGoal) { 
        qualityTextElement.textContent = "Goal Complete! 🎉"; 
    }
}

// --- EXERCISE LOGIC (HIGHLY FORGIVING) ---
function handleSeatedMarch(landmarks) {
    // USING RIGHT SIDE ONLY
    const shoulder = landmarks[12]; 
    const hip = landmarks[24];      
    const knee = landmarks[26];     

    const rawAngle = calculateAngle(shoulder, hip, knee);
    const angle = getSmoothedAngle(rawAngle);

    // LIVE TELEMETRY: This proves the math is working!
    qualityTextElement.textContent = `Live Hip Angle: ${angle}°`;

    // Forgiving Logic: 
    // Sitting normal is roughly 90-110 degrees. Lifting knee brings it to 60-70 degrees.
    if (angle > 85) { 
        stage = "down";
        stageTextElement.textContent = "Down";
    }
    if (angle < 75 && stage === 'down') {
        stage = "up";
        stageTextElement.textContent = "Up";
        onRepComplete();
    }
}

function handleShoulderAbduction(landmarks) {
    // USING RIGHT SIDE ONLY
    const hip = landmarks[24];      
    const shoulder = landmarks[12]; 
    const elbow = landmarks[14];    

    const rawAngle = calculateAngle(hip, shoulder, elbow);
    const angle = getSmoothedAngle(rawAngle);

    // LIVE TELEMETRY
    qualityTextElement.textContent = `Live Shoulder Angle: ${angle}°`;

    // Forgiving Logic:
    // Arm resting is roughly 15-30 degrees. Raising it brings it above 75 degrees.
    if (angle < 45) {
        stage = "down";
        stageTextElement.textContent = "Down";
    }
    if (angle > 70 && stage === 'down') {
        stage = "up";
        stageTextElement.textContent = "Up";
        onRepComplete();
    }
}

function handleWallPushup(landmarks) {
    // USING RIGHT SIDE ONLY
    const shoulder = landmarks[12]; 
    const elbow = landmarks[14];    
    const wrist = landmarks[16];    

    const rawAngle = calculateAngle(shoulder, elbow, wrist);
    const angle = getSmoothedAngle(rawAngle);

    // LIVE TELEMETRY
    qualityTextElement.textContent = `Live Elbow Angle: ${angle}°`;

    // Forgiving Logic:
    // Arms extended is roughly 160-180 degrees. Bending them drops it below 120.
    if (angle > 140) {
        stage = "out";
        stageTextElement.textContent = "Out";
    }
    if (angle < 120 && stage === 'out') {
        stage = "in";
        stageTextElement.textContent = "In";
        onRepComplete();
    }
}

// --- AI & CAMERA ---
function onResults(results) {
    if (!results.poseLandmarks || !isSessionActive) return;
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw the tracking dots
    drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
    drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });
    
    try {
        const landmarks = results.poseLandmarks;
        switch (currentExercise) {
            case 'seatedMarch': handleSeatedMarch(landmarks); break;
            case 'shoulderAbduction': handleShoulderAbduction(landmarks); break;
            case 'wallPushup': handleWallPushup(landmarks); break;
        }
    } catch (error) { 
        console.error("Logic Error: ", error); 
    }
    canvasCtx.restore();
}

const pose = new Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });

// Most reliable settings for webcams
pose.setOptions({ 
    modelComplexity: 1, 
    smoothLandmarks: true, 
    enableSegmentation: false,
    minDetectionConfidence: 0.5, 
    minTrackingConfidence: 0.5   
});
pose.onResults(onResults);

async function updateDemoVideo(exercise) {
    const videoUrl = demoVideos[exercise];
    if (videoUrl) {
        demoVideoElement.src = videoUrl;
        try { await demoVideoElement.play(); } 
        catch (err) { console.log("Video autoplay blocked"); }
    }
}

// --- PAGE & USER MANAGEMENT ---
function showPage(pageId) {
    pages.forEach(page => page.classList.add('hidden'));
    document.getElementById(`page-${pageId}`).classList.remove('hidden');

    sidebarLinks.forEach(link => {
        link.parentElement.classList.remove('active');
        if (link.dataset.page === pageId) {
            link.parentElement.classList.add('active');
        }
    });

    if (pageId !== 'live-session' && isSessionActive) {
        stopButton.click();
    }
}

function login(name, age) {
    user = { name, age };
    localStorage.setItem('rehabUser', JSON.stringify(user));
    loginWrapper.classList.add('hidden');
    appWrapper.classList.remove('hidden');
    updateUIForUser();
}

function logout() {
    user = null;
    localStorage.removeItem('rehabUser');
    appWrapper.classList.add('hidden');
    loginWrapper.classList.remove('hidden');
    if (isSessionActive) { stopButton.click(); }
}

function updateUIForUser() {
    if (user) {
        profileName.textContent = user.name;
        profileAge.textContent = user.age;
    }
}

function checkForSavedUser() {
    const savedUser = localStorage.getItem('rehabUser');
    if (savedUser) {
        login(JSON.parse(savedUser).name, JSON.parse(savedUser).age);
    }
}

// --- EVENT LISTENERS ---
registerButton.addEventListener('click', () => {
    const name = userNameInput.value.trim();
    const age = userAgeInput.value;
    if (name && age) { login(name, age); } 
    else { alert("Please enter both name and age."); }
});

sidebarLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const pageId = link.dataset.page;
        showPage(pageId);
    });
});

logoutButton.addEventListener('click', (e) => {
    e.preventDefault();
    logout();
});

exerciseChoice.addEventListener('change', (e) => {
    currentExercise = e.target.value;
    repCounter = 0;
    angleHistory = []; 
    stage = 'down'; // Reset stage
    repCountElement.textContent = repCounter;
    updateProgressBar();
    stageTextElement.textContent = '-';
    qualityTextElement.textContent = 'Begin exercise';
    updateDemoVideo(currentExercise);
});

repGoalInput.addEventListener('change', () => {
    repGoal = parseInt(repGoalInput.value);
    if (!isSessionActive) updateProgressBar();
});

startButton.addEventListener('click', () => {
    if (repSound) {
        repSound.play().then(() => {
            repSound.pause();
            repSound.currentTime = 0;
        }).catch(e => console.log("Audio prep failed"));
    }

    isSessionActive = true;
    repGoal = parseInt(repGoalInput.value);
    angleHistory = []; 
    stage = 'down'; // Force starting stage
    
    startButton.disabled = true;
    stopButton.disabled = false;
    exerciseChoice.disabled = true;
    repGoalInput.disabled = true;

    videoElement.style.display = "block";
    canvasElement.width = 640;
    canvasElement.height = 480;

    camera = new Camera(videoElement, {
        onFrame: async () => {
            if (isSessionActive) await pose.send({ image: videoElement });
        },
        width: 640,
        height: 480
    });
    camera.start();
    loadingMessage.style.display = 'none';
});

stopButton.addEventListener('click', () => {
    isSessionActive = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    exerciseChoice.disabled = false;
    repGoalInput.disabled = false;

    if (camera) { camera.stop(); camera = null; }

    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    repCounter = 0;
    angleHistory = []; 
    repCountElement.textContent = repCounter;
    updateProgressBar();
    stageTextElement.textContent = '-';
    qualityTextElement.textContent = 'Session Over';
    videoElement.style.display = "none";
    loadingMessage.style.display = 'block';
    loadingMessage.textContent = 'Session Over';
});

// --- INITIALIZE APP ---
checkForSavedUser();
pose.initialize().then(() => {
    loadingMessage.textContent = 'AI Model Ready. Click Start!';
    updateDemoVideo(currentExercise);
});
