console.log('Body Posture Detection - Script Loading...');

// DOM elements
const webcamElement = document.getElementById('webcam');
const canvasElement = document.getElementById('canvas');
const startBtn = document.getElementById('startBtn');
const detectBtn = document.getElementById('detectBtn');
const stopBtn = document.getElementById('stopBtn');
const shoulderAngleElement = document.getElementById('shoulderAngle');
const neckAngleElement = document.getElementById('neckAngle');
const postureStatusElement = document.getElementById('postureStatus');
const postureAlertElement = document.getElementById('postureAlert');
const loadingElement = document.getElementById('loading');
const statusElement = document.getElementById('status');
const instructionsElement = document.getElementById('instructions');

// Context for canvas drawing
const canvasCtx = canvasElement?.getContext('2d');

// Detection variables
let camera = null;
let pose = null;
let isDetecting = false;

// Posture thresholds - IMPROVED VALUES
const GOOD_SHOULDER_ANGLE_THRESHOLD = 12; // More forgiving for natural shoulder differences
const GOOD_NECK_FORWARD_THRESHOLD = 0.06; // Distance ratio for forward head posture  
const GOOD_SHOULDER_SLOUCH_THRESHOLD = 0.04; // Shoulder elevation ratio
const SEVERE_SHOULDER_TILT_THRESHOLD = 15; // Only flag really bad shoulder tilts

// Audio System
class AudioFeedback {
  constructor() {
    this.audioContext = null;
    this.isEnabled = true;
    this.lastSoundTime = 0;
    this.soundCooldown = 100;
    this.init();
  }

  async init() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
      console.warn('Audio not supported:', error);
      this.isEnabled = false;
    }
  }

  async ensureAudioContext() {
    if (!this.isEnabled || !this.audioContext) return false;
    
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (error) {
        console.warn('Failed to resume audio context:', error);
        return false;
      }
    }
    return true;
  }

  canPlaySound() {
    const now = Date.now();
    if (now - this.lastSoundTime < this.soundCooldown) return false;
    this.lastSoundTime = now;
    return true;
  }

  async playTone(frequency, duration, type = 'sine', volume = 0.3) {
    if (!await this.ensureAudioContext() || !this.canPlaySound()) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
      oscillator.type = type;

      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration);
    } catch (error) {
      console.warn('Failed to play tone:', error);
    }
  }

  async playClick() {
    await this.playTone(800, 0.05, 'square', 0.2);
  }

  async playGoodPosture() {
    await this.playTone(600, 0.15, 'sine', 0.15);
  }

  async playBadPosture() {
    await this.playTone(200, 0.3, 'sawtooth', 0.15);
  }

  async playStartup() {
    if (!await this.ensureAudioContext()) return;
    
    try {
      const frequencies = [220, 330, 440, 550];
      for (let i = 0; i < frequencies.length; i++) {
        setTimeout(() => this.playTone(frequencies[i], 0.1, 'sine', 0.15), i * 50);
      }
    } catch (error) {
      console.warn('Failed to play startup sound:', error);
    }
  }

  toggle() {
    this.isEnabled = !this.isEnabled;
    return this.isEnabled;
  }
}

// Initialize audio system
const audioFeedback = new AudioFeedback();

// Navigation Functions
function showMainContent() {
  console.log('Showing main content...');
  
  const titleSection = document.getElementById('titleSection');
  const mainContent = document.getElementById('mainContent');
  
  if (titleSection && mainContent) {
    // Hide title section
    titleSection.classList.add('hidden');
    titleSection.style.display = 'none';
    
    // Show main content
    mainContent.classList.add('active');
    mainContent.style.display = 'block';
    
    console.log('Navigation to main content completed');
    audioFeedback.playClick();
  } else {
    console.error('Could not find navigation elements');
  }
}

function returnToTitle() {
  console.log('Returning to title...');
  
  const titleSection = document.getElementById('titleSection');
  const mainContent = document.getElementById('mainContent');
  
  if (titleSection && mainContent) {
    // Stop detection if active
    if (isDetecting) {
      stopDetection();
    }
    
    // Stop camera if running
    if (camera && webcamElement.srcObject) {
      const tracks = webcamElement.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      webcamElement.srcObject = null;
      camera = null;
    }
    
    // Reset UI elements
    if (detectBtn) detectBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = true;
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = "Start Camera";
    }
    if (statusElement) statusElement.textContent = "Status: Ready to start";
    if (postureStatusElement) postureStatusElement.textContent = "Not detecting";
    if (postureAlertElement) postureAlertElement.className = "alert";
    if (shoulderAngleElement) shoulderAngleElement.textContent = "--°";
    if (neckAngleElement) neckAngleElement.textContent = "--°";
    
    // Hide main content
    mainContent.classList.remove('active');
    mainContent.style.display = 'none';
    
    // Show title section
    titleSection.classList.remove('hidden');
    titleSection.style.display = 'flex';
    
    console.log('Return to title completed');
    audioFeedback.playClick();
  }
}

// Update status
function updateStatus(message) {
  if (statusElement) {
    statusElement.textContent = `Status: ${message}`;
  }
  if (instructionsElement) {
    instructionsElement.textContent = message;
  }
  console.log(`Status: ${message}`);
}

// Load MediaPipe Pose
async function loadPose() {
  return new Promise((resolve) => {
    if (loadingElement) loadingElement.className = "loading visible";
    updateStatus("Loading MediaPipe Pose model...");
    
    const checkPose = () => {
      if (window.Pose) {
        initializePose(resolve);
      } else {
        setTimeout(checkPose, 100);
      }
    };
    
    checkPose();
  });
}

// Initialize pose with proper options
function initializePose(resolve) {
  try {
    const poseInstance = new window.Pose({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      }
    });
    
    poseInstance.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    
    poseInstance.onResults(onResults);
    
    if (loadingElement) loadingElement.className = "loading";
    updateStatus("MediaPipe Pose model loaded successfully. Click 'Start Camera' to begin.");
    audioFeedback.playStartup();
    resolve(poseInstance);
  } catch (error) {
    console.error("Error initializing Pose:", error);
    if (loadingElement) loadingElement.className = "loading";
    updateStatus("Error loading MediaPipe Pose model");
    audioFeedback.playBadPosture();
    resolve(null);
  }
}

// Start webcam
async function startCamera() {
  updateStatus("Starting camera...");
  const constraints = {
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: 'user'
    }
  };
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    webcamElement.srcObject = stream;
    
    return new Promise((resolve) => {
      webcamElement.onloadedmetadata = () => {
        if (canvasElement) {
          canvasElement.width = webcamElement.videoWidth;
          canvasElement.height = webcamElement.videoHeight;
        }
        updateStatus("Camera started successfully. Click 'Start Detection' to begin posture analysis.");
        audioFeedback.playClick();
        resolve(webcamElement);
      };
    });
  } catch (error) {
    console.error('Error accessing the camera:', error);
    updateStatus("Error accessing camera");
    audioFeedback.playBadPosture();
    alert('Error accessing the camera. Please make sure you have a camera connected and have granted permission to use it.');
    return null;
  }
}

// Process frames
async function processFrame() {
  if (!isDetecting) return;
  
  if (webcamElement.readyState === 4) {
    try {
      await pose.send({ image: webcamElement });
    } catch (error) {
      console.error("Error processing frame:", error);
    }
  }
  
  requestAnimationFrame(processFrame);
}

// Calculate angle between three points (in degrees)
function calculateAngle(p1, p2, p3) {
  const angle = Math.abs(Math.atan2(
    p3.y - p2.y,
    p3.x - p2.x
  ) - Math.atan2(
    p1.y - p2.y,
    p1.x - p2.x
  )) * (180 / Math.PI);
  
  return Math.round(angle);
}

// Check posture and update UI - IMPROVED DETECTION
let lastPostureState = null;
let badPostureStartTime = null;
const BAD_POSTURE_ALERT_DELAY = 2000; // 2 seconds of bad posture before popup

function checkPosture(landmarks) {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftEar = landmarks[7];
  const rightEar = landmarks[8];
  const nose = landmarks[0];
  const leftEye = landmarks[2];
  const rightEye = landmarks[5];
  
  // Calculate shoulder tilt angle (more accurate method)
  const shoulderDifference = Math.abs(leftShoulder.y - rightShoulder.y);
  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
  const shoulderTiltRatio = shoulderDifference / shoulderWidth;
  const shoulderAngle = Math.atan(shoulderTiltRatio) * (180 / Math.PI);
  
  // Calculate forward head posture (improved method)
  const midShoulder = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2
  };
  
  // Use eyes for more accurate head position
  const midEye = {
    x: (leftEye.x + rightEye.x) / 2,
    y: (leftEye.y + rightEye.y) / 2
  };
  
  // Forward head posture: how far forward the head is relative to shoulders
  const headForwardDistance = midShoulder.x - midEye.x; // Positive = head forward
  const shoulderToHeadVertical = Math.abs(midShoulder.y - midEye.y);
  const forwardHeadRatio = Math.abs(headForwardDistance) / shoulderToHeadVertical;
  
  // Shoulder slouch detection: compare shoulder height to ear height
  const earToShoulderDistance = Math.abs(midShoulder.y - ((leftEar.y + rightEar.y) / 2));
  const expectedEarShoulderRatio = 0.15; // Normal ratio
  const actualEarShoulderRatio = earToShoulderDistance;
  const shoulderSlouch = actualEarShoulderRatio < expectedEarShoulderRatio ? 
    (expectedEarShoulderRatio - actualEarShoulderRatio) : 0;
  
  // Update UI with new measurements
  if (shoulderAngleElement) shoulderAngleElement.textContent = `${shoulderAngle.toFixed(1)}°`;
  if (neckAngleElement) neckAngleElement.textContent = `${(forwardHeadRatio * 100).toFixed(1)}%`;
  
  // Determine posture quality with multiple factors
  let postureIssues = [];
  let hasGoodPosture = true;
  
  // Check shoulder tilt - more forgiving approach
  if (shoulderAngle > SEVERE_SHOULDER_TILT_THRESHOLD) {
    hasGoodPosture = false;
    postureIssues.push("severely uneven shoulders");
  } else if (shoulderAngle > GOOD_SHOULDER_ANGLE_THRESHOLD) {
    // Minor shoulder tilt - only warn if combined with other issues
    if (forwardHeadRatio > GOOD_NECK_FORWARD_THRESHOLD || shoulderSlouch > GOOD_SHOULDER_SLOUCH_THRESHOLD) {
      hasGoodPosture = false;
      postureIssues.push("slightly uneven shoulders");
    }
  }
  
  // Check forward head posture (more sensitive)
  if (forwardHeadRatio > GOOD_NECK_FORWARD_THRESHOLD) {
    hasGoodPosture = false;
    postureIssues.push("forward head posture");
  }
  
  // Check shoulder slouching
  if (shoulderSlouch > GOOD_SHOULDER_SLOUCH_THRESHOLD) {
    hasGoodPosture = false;
    postureIssues.push("slouched shoulders");
  }
  
  // Additional check: head too far forward horizontally
  if (Math.abs(headForwardDistance) > 0.08) {
    hasGoodPosture = false;
    if (!postureIssues.includes("forward head posture")) {
      postureIssues.push("head position");
    }
  }
  
  // Handle bad posture timing and popup
  if (!hasGoodPosture) {
    if (badPostureStartTime === null) {
      badPostureStartTime = Date.now();
    } else if (Date.now() - badPostureStartTime >= BAD_POSTURE_ALERT_DELAY) {
      // Show popup after 2 seconds of bad posture
      showPostureWarningPopup();
      badPostureStartTime = null; // Reset to avoid repeated popups
    }
  } else {
    badPostureStartTime = null; // Reset timer when posture improves
  }
  
  // Update posture status and alert with specific feedback
  if (hasGoodPosture) {
    if (postureStatusElement) postureStatusElement.textContent = "Good posture";
    if (postureAlertElement) {
      postureAlertElement.className = "alert good visible";
      postureAlertElement.textContent = "Excellent! Your posture looks great.";
    }
    
    // Play sound only when posture changes to good
    if (lastPostureState === false) {
      audioFeedback.playGoodPosture();
    }
    lastPostureState = true;
  } else {
    if (postureStatusElement) postureStatusElement.textContent = "Poor posture";
    if (postureAlertElement) {
      postureAlertElement.className = "alert visible";
      
      // Provide specific feedback based on detected issues
      let feedbackMessage = "Posture issues detected: " + postureIssues.join(", ");
      if (postureIssues.includes("forward head posture") || postureIssues.includes("head position")) {
        feedbackMessage += ". Pull your head back and align ears over shoulders.";
      }
      if (postureIssues.includes("slouched shoulders")) {
        feedbackMessage += ". Sit up straight and pull shoulders back.";
      }
      if (postureIssues.includes("uneven shoulders")) {
        feedbackMessage += ". Level your shoulders.";
      }
      
      postureAlertElement.textContent = feedbackMessage;
    }
    
    // Play sound only when posture changes to bad
    if (lastPostureState === true) {
      audioFeedback.playBadPosture();
    }
    lastPostureState = false;
  }
  
  // Debug logging for fine-tuning
  console.log(`Posture Debug - Shoulder Angle: ${shoulderAngle.toFixed(1)}°, Forward Head: ${(forwardHeadRatio * 100).toFixed(1)}%, Slouch: ${(shoulderSlouch * 100).toFixed(1)}%`);
}

// On results from MediaPipe Pose
function onResults(results) {
  if (!canvasCtx) return;
  
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  
  if (results.poseLandmarks) {
    canvasCtx.save();
    canvasCtx.drawImage(
      results.image, 0, 0, canvasElement.width, canvasElement.height
    );
    
    drawCustomConnections(results.poseLandmarks);
    drawCustomLandmarks(results.poseLandmarks);
    checkPosture(results.poseLandmarks);
    
    canvasCtx.restore();
  }
}

// Draw landmarks on canvas
function drawCustomLandmarks(landmarks) {
  canvasCtx.fillStyle = '#00FF00';
  
  for (const landmark of landmarks) {
    const x = landmark.x * canvasElement.width;
    const y = landmark.y * canvasElement.height;
    
    canvasCtx.beginPath();
    canvasCtx.arc(x, y, 5, 0, 2 * Math.PI);
    canvasCtx.fill();
  }
}

// Draw connections between landmarks
function drawCustomConnections(landmarks) {
  const connections = [
    [11, 12], [12, 24], [24, 23], [23, 11],
    [0, 7], [0, 8],
    [11, 13], [13, 15], [12, 14], [14, 16],
    [23, 25], [25, 27], [24, 26], [26, 28]
  ];
  
  canvasCtx.strokeStyle = '#00FF00';
  canvasCtx.lineWidth = 2;
  
  for (const [i, j] of connections) {
    const landmark1 = landmarks[i];
    const landmark2 = landmarks[j];
    
    if (landmark1 && landmark2) {
      canvasCtx.beginPath();
      canvasCtx.moveTo(
        landmark1.x * canvasElement.width,
        landmark1.y * canvasElement.height
      );
      canvasCtx.lineTo(
        landmark2.x * canvasElement.width,
        landmark2.y * canvasElement.height
      );
      canvasCtx.stroke();
    }
  }
}

// Start detection
async function startDetection() {
  if (!camera) {
    alert('Please start the camera first.');
    return;
  }
  
  isDetecting = true;
  if (detectBtn) detectBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;
  
  if (postureStatusElement) postureStatusElement.textContent = "Detecting...";
  updateStatus("Detection started - analyzing your posture...");
  audioFeedback.playClick();
  processFrame();
}

// Stop detection
function stopDetection() {
  isDetecting = false;
  if (detectBtn) detectBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
  
  if (postureStatusElement) postureStatusElement.textContent = "Not detecting";
  if (postureAlertElement) postureAlertElement.className = "alert";
  if (shoulderAngleElement) shoulderAngleElement.textContent = "--°";
  if (neckAngleElement) neckAngleElement.textContent = "--°";
  
  updateStatus("Detection stopped");
  audioFeedback.playClick();
  lastPostureState = null; // Reset posture state
}

// Show posture warning popup
function showPostureWarningPopup() {
  // Don't show multiple popups
  if (document.getElementById('posture-warning-popup')) {
    return;
  }
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'posture-warning-popup';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease-in;
  `;

  // Create popup content
  const popup = document.createElement('div');
  popup.style.cssText = `
    background: linear-gradient(135deg, #ff4444, #cc0000);
    padding: 40px;
    border-radius: 20px;
    text-align: center;
    box-shadow: 0 20px 40px rgba(255, 68, 68, 0.3);
    max-width: 500px;
    width: 90%;
    animation: popIn 0.5s ease-out;
    border: 2px solid #ff6666;
  `;

  popup.innerHTML = `
    <div style="font-size: 60px; margin-bottom: 20px;">⚠️</div>
    <h2 style="color: #fff; margin: 0 0 15px 0; font-size: 28px; font-family: 'Courier New', monospace;">
      POSTURE ALERT!
    </h2>
    <p style="color: #fff; margin: 0 0 25px 0; font-size: 18px; font-family: 'Courier New', monospace; line-height: 1.4;">
      <strong>Technology won't fix your posture, but your neck pain will remind you to!</strong>
    </p>
    <p style="color: #ffcccc; margin: 0 0 25px 0; font-size: 16px; font-family: 'Courier New', monospace;">
      Straighten up! Your future self will thank you.
    </p>
    <button id="close-posture-popup" style="
      background: #fff;
      color: #cc0000;
      border: none;
      padding: 12px 25px;
      border-radius: 25px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.3s ease;
      font-family: 'Courier New', monospace;
      text-transform: uppercase;
    ">Got It!</button>
  `;

  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes popIn {
      from { transform: scale(0.5); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    #close-posture-popup:hover {
      background: #f0f0f0 !important;
      transform: scale(1.05);
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  // Close popup functionality
  const closeButton = document.getElementById('close-posture-popup');
  const closePopup = () => {
    audioFeedback.playClick();
    overlay.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    }, 300);
  };

  closeButton.addEventListener('click', closePopup);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePopup();
  });

  // Auto-close after 10 seconds
  setTimeout(() => {
    if (document.getElementById('posture-warning-popup')) {
      closePopup();
    }
  }, 10000);

  // Play warning sound
  audioFeedback.playBadPosture();
}
function createAudioToggle() {
  const audioToggle = document.createElement('button');
  audioToggle.id = 'audio-toggle';
  audioToggle.textContent = '🔊 Audio: ON';
  audioToggle.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0, 255, 0, 0.8);
    color: black;
    border: none;
    padding: 10px 15px;
    border-radius: 25px;
    cursor: pointer;
    font-weight: bold;
    z-index: 1000;
    transition: all 0.3s ease;
    font-family: 'Courier New', monospace;
  `;
  
  audioToggle.addEventListener('click', () => {
    const isEnabled = audioFeedback.toggle();
    audioToggle.textContent = isEnabled ? '🔊 Audio: ON' : '🔇 Audio: OFF';
    audioToggle.style.background = isEnabled ? 'rgba(0, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)';
    
    if (isEnabled) {
      audioFeedback.playClick();
    }
  });
  
  document.body.appendChild(audioToggle);
}

// Initialize application
async function init() {
  try {
    updateStatus("Initializing posture detection system...");
    
    setTimeout(async () => {
      try {
        pose = await loadPose();
        
        if (!pose) {
          updateStatus("Failed to load MediaPipe Pose model");
          return;
        }
        
        // Set up event listeners for buttons
        if (startBtn) {
          startBtn.addEventListener('click', async () => {
            startBtn.disabled = true;
            camera = await startCamera();
            
            if (camera) {
              if (detectBtn) detectBtn.disabled = false;
              startBtn.textContent = "Camera Started";
            } else {
              startBtn.disabled = false;
            }
          });
        }
        
        if (detectBtn) detectBtn.addEventListener('click', startDetection);
        if (stopBtn) stopBtn.addEventListener('click', stopDetection);
        
        updateStatus("Initialization complete. Click 'Start Camera' to begin.");
        
        // Create audio toggle after initialization
        createAudioToggle();
        
      } catch (error) {
        console.error("Error in delayed initialization:", error);
        updateStatus("Initialization failed");
      }
    }, 1000);
    
  } catch (error) {
    console.error('Error initializing application:', error);
    updateStatus("Initialization failed");
    alert('Error initializing the application. Please check console for details.');
  }
}

// Main event listener setup
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM Content Loaded - Setting up navigation...');
  
  // Initialize the posture detection app
  init();
  
  // Set up navigation - using direct element references for reliability
  const letsBeginBtn = document.getElementById('letsBeginBtn');
  const returnBtn = document.getElementById('returnBtn');
  
  console.log('Let\'s Begin button:', letsBeginBtn);
  console.log('Return button:', returnBtn);
  
  // Let's Begin button event listener
  if (letsBeginBtn) {
    letsBeginBtn.addEventListener('click', function(event) {
      event.preventDefault();
      console.log('Let\'s Begin clicked!');
      showMainContent();
    });
    console.log('Let\'s Begin button listener added');
  } else {
    console.error('Could not find Let\'s Begin button');
  }
  
  // Return button event listener
  if (returnBtn) {
    returnBtn.addEventListener('click', function(event) {
      event.preventDefault();
      console.log('Return clicked!');
      returnToTitle();
    });
    console.log('Return button listener added');
  } else {
    console.error('Could not find Return button');
  }
  
  // Enable audio context on first user interaction
  document.addEventListener('click', () => {
    audioFeedback.ensureAudioContext();
  }, { once: true });
  
  console.log('Navigation setup complete');
});