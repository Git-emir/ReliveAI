// Get references to HTML elements
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const repCountElement = document.getElementById('rep-count');
const stageTextElement = document.getElementById('stage-text');
const loadingMessage = document.getElementById('loading-message');
const exerciseChoice = document.getElementById('exercise-choice');
const exerciseTitle = document.querySelector('.controls-panel h2');
const qualityTextElement = document.getElementById('quality-text');

const demoContainer = document.getElementById('demo-container');
const demoVideoElement = document.getElementById('demoVideo');
const toggleDemoButton = document.getElementById('toggleDemoButton');

// NEW: References for interactive features
const repGoalInput = document.getElementById('repGoal');
const progressBar = document.getElementById('progressBar');
const repSound = document.getElementById('repSound');

const demoVideos = {
    seatedMarch: 'https://storage.googleapis.com/rehab-demos/seated-march.mp4',
    shoulderAbduction: 'https://storage.googleapis.com/rehab-demos/shoulder-abduction.mp4',
    wallPushup: 'https://storage.googleapis.com/rehab-demos/wall-pushup.mp4'
};


// Global variables
let repCounter = 0;
let stage = '';
let isSessionActive = false;
let camera = null;
let currentExercise = 'seatedMarch';
let repGoal = 10; // Default goal

// Function to calculate angle between three points
function calculateAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) {
        angle = 360 - angle;
    }
    return angle;
}

// Function to update the progress bar
function updateProgressBar() {
    const progress = (repCounter / repGoal) * 100;
    progressBar.style.width = `${progress}%`;

    if (repCounter >= repGoal) {
        qualityTextElement.textContent = "Goal Complete! 🎉";
        // Optionally stop the session automatically
        // stopButton.click(); 
    }
}

// Function to be called after a successful rep
function onRepComplete() {
    repCounter++;
    repCountElement.textContent = repCounter;
    // UPDATED: Rewind the sound to the start before playing
    repSound.currentTime = 0;
    repSound.play().catch(e => console.error("Could not play sound:", e)); // Play the sound effect
    updateProgressBar(); // Update the progress bar
}


// =================================================================
// REHAB EXERCISE LOGIC (Updated to call onRepComplete)
// =================================================================
function handleSeatedMarch(landmarks) {
    const shoulder = landmarks[24];
    const hip = landmarks[24];
    const knee = landmarks[26];
    const angle = calculateAngle(shoulder, hip, knee);

    if (angle < 95) { qualityTextElement.textContent = "Great lift!"; } 
    else if (angle < 110) { qualityTextElement.textContent = "Lift a little higher."; } 
    else { qualityTextElement.textContent = "Lift your knee."; }

    if (angle > 130) { stage = "down"; stageTextElement.textContent = "Down"; }
    if (angle < 95 && stage === 'down') {
        stage = "up";
        stageTextElement.textContent = "Up";
        onRepComplete();
    }
}

function handleShoulderAbduction(landmarks) {
    const hip = landmarks[24];
    const shoulder = landmarks[12];
    const elbow = landmarks[14];
    const angle = calculateAngle(hip, shoulder, elbow);

    if (angle > 85) { qualityTextElement.textContent = "Excellent form!"; } 
    else if (angle > 60) { qualityTextElement.textContent = "Good, a little higher."; } 
    else { qualityTextElement.textContent = "Raise arm to the side."; }

    if (angle < 30) { stage = "down"; stageTextElement.textContent = "Down"; }
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
    const angle = calculateAngle(shoulder, elbow, wrist);

    if (angle < 95) { qualityTextElement.textContent = "Excellent push!"; } 
    else if (angle < 120) { qualityTextElement.textContent = "A little deeper."; } 
    else { qualityTextElement.textContent = "Bend your elbows."; }

    if (angle > 160) { stage = "out"; stageTextElement.textContent = "Out"; }
    if (angle < 95 && stage === 'out') {
        stage = "in";
        stageTextElement.textContent = "In";
        onRepComplete();
    }
}


// Main AI processing loop
function onResults(results) {
    if (!results.poseLandmarks || !isSessionActive) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
    drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });
    
    try {
        const landmarks = results.poseLandmarks;
        switch(currentExercise) {
            case 'seatedMarch': handleSeatedMarch(landmarks); break;
            case 'shoulderAbduction': handleShoulderAbduction(landmarks); break;
            case 'wallPushup': handleWallPushup(landmarks); break;
        }
    } catch (error) { /* Generic error handling */ }
    canvasCtx.restore();
}

// Initialize MediaPipe Pose
const pose = new Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });
pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
pose.onResults(onResults);

// Function to update demo video
async function updateDemoVideo(exercise) {
    const videoUrl = demoVideos[exercise];
    if (videoUrl) {
        demoVideoElement.src = videoUrl;
        try { await demoVideoElement.play(); } 
        catch (err) { console.error("Video autoplay failed:", err); }
    }
}

// Event Listeners
exerciseChoice.addEventListener('change', (e) => {
    currentExercise = e.target.value;
    const selectedOption = e.target.options[e.target.selectedIndex].text;
    exerciseTitle.textContent = selectedOption;
    repCounter = 0;
    repCountElement.textContent = repCounter;
    updateProgressBar();
    stage = '';
    stageTextElement.textContent = '-';
    qualityTextElement.textContent = 'Begin exercise';
    updateDemoVideo(currentExercise);
});

toggleDemoButton.addEventListener('click', () => {
    demoContainer.style.display = (demoContainer.style.display === 'block') ? 'none' : 'block';
});

repGoalInput.addEventListener('change', () => {
    repGoal = parseInt(repGoalInput.value);
    updateProgressBar(); // Update bar in case goal changes mid-session
});

// Start Session Logic
startButton.addEventListener('click', () => {
    isSessionActive = true;
    repGoal = parseInt(repGoalInput.value); // Set goal at start
    startButton.disabled = true;
    stopButton.disabled = false;
    exerciseChoice.disabled = true;
    repGoalInput.disabled = true;
    
    // UPDATED: Prime the audio to allow it to play
    repSound.play().catch(e => console.log("Audio interaction needed"));
    repSound.pause();
    
    videoElement.style.display = "block";
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

// Stop Session Logic
stopButton.addEventListener('click', () => {
    isSessionActive = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    exerciseChoice.disabled = false;
    repGoalInput.disabled = false;
    
    if (camera) { camera.stop(); camera = null; }
    
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    repCounter = 0;
    repCountElement.textContent = repCounter;
    updateProgressBar();
    stage = '';
    stageTextElement.textContent = '-';
    qualityTextElement.textContent = 'Session Over';
    videoElement.style.display = "none";
    loadingMessage.style.display = 'block';
    loadingMessage.textContent = 'Session Over';
});

// Initialize the app
pose.initialize().then(() => {
    loadingMessage.textContent = 'AI Model Ready. Click Start!';
    updateDemoVideo(currentExercise);
});
