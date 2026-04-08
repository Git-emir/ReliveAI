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
let stage = '';
let isSessionActive = false;
let camera = null;
let currentExercise = 'seatedMarch';
let repGoal = 10;
let user = null;

// Buffers for Smoothing (Accuracy Improvement - The "Sweet Spot")
let angleHistory = [];
const SMOOTHING_FRAMES = 10; // Averages last 10 frames to prevent jitter
const MIN_VISIBILITY = 0.5;  // Lenient enough to work in normal lighting

// --- CORE ACCURACY FUNCTIONS ---

function calculateAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) { angle = 360 - angle; }
    return angle;
}

function getSmoothedAngle(newAngle) {
    angleHistory.push(newAngle);
    if (angleHistory.length > SMOOTHING_FRAMES) {
        angleHistory.shift(); 
    }
    const sum = angleHistory.reduce((a, b) => a + b, 0);
    return sum / angleHistory.length;
}

function areJointsVisible(...joints) {
    return joints.every(joint => joint.visibility > MIN_VISIBILITY);
}

// --- UI UPDATES ---
function updateProgressBar() {
    const progress = (repCounter / repGoal) * 100;
    progressBar.style.width = `${progress > 100 ? 100 : progress}%`;
    if (repCounter >= repGoal) { qualityTextElement.textContent = "Goal Complete! 🎉"; }
}

function onRepComplete() {
    if (repCounter >= repGoal) return;
    repCounter++;
    repCountElement.textContent = repCounter;
    repSound.currentTime = 0;
    repSound.play().catch(e => console.error("Could not play sound:", e));
    updateProgressBar();
}

// --- EXERCISE LOGIC (BALANCED ACCURACY & HYSTERESIS) ---
function handleSeatedMarch(landmarks) {
    const shoulder = landmarks[12]; // Fixed joint reference
    const hip = landmarks[24];
    const knee = landmarks[26];

    if (!areJointsVisible(shoulder, hip, knee)) {
        qualityTextElement.textContent = "Ensure your side profile is visible.";
        return;
    }

    const rawAngle = calculateAngle(shoulder, hip, knee);
    const angle = getSmoothedAngle(rawAngle);

    // Provide form feedback based on angle
    if (repCounter < repGoal) {
        if (angle < 90) {
            qualityTextElement.textContent = "Great lift! Hold it.";
        } else if (angle < 110) {
            qualityTextElement.textContent = "Lift a little higher.";
        } else {
            qualityTextElement.textContent = "Lift your knee.";
        }
    }

    // Strict gaps to prevent accidental reps (Hysteresis)
    if (angle > 140) { 
        stage = "down";
        stageTextElement.textContent = "Down";
    }
    if (angle < 90 && stage === 'down') {
        stage = "up";
        stageTextElement.textContent = "Up";
        onRepComplete();
    }
}

function handleShoulderAbduction(landmarks) {
    const hip = landmarks[24];
    const shoulder = landmarks[12];
    const elbow = landmarks[14];

    if (!areJointsVisible(hip, shoulder, elbow)) {
        qualityTextElement.textContent = "Ensure your arm is visible.";
        return;
    }

    const rawAngle = calculateAngle(hip, shoulder, elbow);
    const angle = getSmoothedAngle(rawAngle);

    if (repCounter < repGoal) {
        if (angle > 85) {
            qualityTextElement.textContent = "Excellent form! Hold it.";
        } else if (angle > 60) {
            qualityTextElement.textContent = "Good, a little higher.";
        } else {
            qualityTextElement.textContent = "Raise arm to the side.";
        }
    }

    // Strict gaps
    if (angle < 40) {
        stage = "down";
        stageTextElement.textContent = "Down";
    }
    if (angle > 85 && stage === 'down') {
        stage = "up";
        stageTextElement.textContent = "Up";
        onRepComplete();
    }
}

function handleWallPushup(landmarks) {
    const shoulder = landmarks[12];
    const elbow = landmarks[14];
    const wrist = landmarks[16];

    if (!areJointsVisible(shoulder, elbow, wrist)) {
        qualityTextElement.textContent = "Ensure your arm is visible.";
        return;
    }

    const rawAngle = calculateAngle(shoulder, elbow, wrist);
    const angle = getSmoothedAngle(rawAngle);

    if (repCounter < repGoal) {
        if (angle < 95) {
            qualityTextElement.textContent = "Excellent push! Now extend.";
        } else if (angle < 120) {
            qualityTextElement.textContent = "A little deeper.";
        } else {
            qualityTextElement.textContent = "Bend your elbows.";
        }
    }

    // Strict gaps
    if (angle > 160) {
        stage = "out";
        stageTextElement.textContent = "Out";
    }
    if (angle < 100 && stage === 'out') {
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
    
    // Draw lines and dots on the user
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
        console.error("Tracking Error: ", error); 
    }
    canvasCtx.restore();
}

const pose = new Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });

// Sweet Spot AI Settings
pose.setOptions({ 
    modelComplexity: 1, 
    smoothLandmarks: true, 
    enableSegmentation: false,
    minDetectionConfidence: 0.6, // Perfect balance
    minTrackingConfidence: 0.6   // Perfect balance
});
pose.onResults(onResults);

async function updateDemoVideo(exercise) {
    const videoUrl = demoVideos[exercise];
    if (videoUrl) {
        demoVideoElement.src = videoUrl;
        try { await demoVideoElement.play(); } 
        catch (err) { console.error("Video autoplay failed:", err); }
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
    if (name && age) {
        login(name, age);
    } else {
        alert("Please enter both name and age.");
    }
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
    angleHistory = []; // Reset the smoothing buffer
    repCountElement.textContent = repCounter;
    updateProgressBar();
    stage = '';
    stageTextElement.textContent = '-';
    qualityTextElement.textContent = 'Begin exercise';
    updateDemoVideo(currentExercise);
});

toggleDemoButton.addEventListener('click', () => {
    demoContainer.style.display = (demoContainer.style.display === 'none' || demoContainer.style.display === '') ? 'block' : 'none';
});

repGoalInput.addEventListener('change', () => {
    repGoal = parseInt(repGoalInput.value);
    if (!isSessionActive) {
        updateProgressBar();
    }
});

startButton.addEventListener('click', () => {
    repSound.play().then(() => {
        repSound.pause();
        repSound.currentTime = 0;
    }).catch(e => console.log("Audio priming failed."));

    isSessionActive = true;
    repGoal = parseInt(repGoalInput.value);
    angleHistory = []; // Clear buffer on start
    startButton.disabled = true;
    stopButton.disabled = false;
    exerciseChoice.disabled = true;
    repGoalInput.disabled = true;

    videoElement.style.display = "block";
    
    // REVERTED to original logic so the video won't break
    canvasElement.width = videoElement.clientWidth;
    canvasElement.height = videoElement.clientHeight;

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
    angleHistory = []; // Clear buffer on stop
    repCountElement.textContent = repCounter;
    updateProgressBar();
    stage = '';
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
