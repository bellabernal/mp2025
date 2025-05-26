// Matrix Rain Effect
const canvas = document.getElementById('matrixCanvas');
const ctx = canvas.getContext('2d');

// Audio context for title sequence
let titleAudioContext = null;
let titleOscillator = null;
let titleGainNode = null;

// Set canvas size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

resizeCanvas();

// Start title sequence audio
function startTitleSequenceAudio() {
    try {
        titleAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create a subtle ambient drone
        titleOscillator = titleAudioContext.createOscillator();
        titleGainNode = titleAudioContext.createGain();
        
        // Create a low frequency filter for ambience
        const filter = titleAudioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, titleAudioContext.currentTime);
        
        // Connect the audio nodes
        titleOscillator.connect(filter);
        filter.connect(titleGainNode);
        titleGainNode.connect(titleAudioContext.destination);
        
        // Set oscillator to a low ambient frequency
        titleOscillator.frequency.setValueAtTime(55, titleAudioContext.currentTime); // Low A note
        titleOscillator.type = 'sawtooth';
        
        // Very quiet ambient volume
        titleGainNode.gain.setValueAtTime(0, titleAudioContext.currentTime);
        titleGainNode.gain.linearRampToValueAtTime(0.02, titleAudioContext.currentTime + 1);
        
        // Add subtle frequency modulation for cyberpunk atmosphere
        const lfo = titleAudioContext.createOscillator();
        const lfoGain = titleAudioContext.createGain();
        lfo.frequency.setValueAtTime(0.1, titleAudioContext.currentTime);
        lfoGain.gain.setValueAtTime(2, titleAudioContext.currentTime);
        lfo.connect(lfoGain);
        lfoGain.connect(titleOscillator.frequency);
        
        // Start the audio
        titleOscillator.start(titleAudioContext.currentTime);
        lfo.start(titleAudioContext.currentTime);
        
        // Stop after 15 seconds (title sequence duration)
        setTimeout(() => {
            if (titleGainNode && titleOscillator) {
                titleGainNode.gain.linearRampToValueAtTime(0, titleAudioContext.currentTime + 1);
                setTimeout(() => {
                    titleOscillator.stop();
                    lfo.stop();
                }, 1000);
            }
        }, 14000);
        
    } catch (error) {
        console.log('Title sequence audio not supported or blocked');
    }
}

// Start title audio when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure everything is loaded
    setTimeout(startTitleSequenceAudio, 500);
});

// Set canvas size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

resizeCanvas();

// Matrix characters
const matrix = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%^&*()*&^%+-/~{[|`]}";
const matrixArray = matrix.split("");

const fontSize = 10;
let columns = canvas.width / fontSize;

// Initialize drops array
const drops = [];
for(let x = 0; x < columns; x++) {
    drops[x] = 1;
}

// Draw matrix rain
function drawMatrix() {
    // Semi-transparent black background for trail effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Matrix green text
    ctx.fillStyle = '#0F3';
    ctx.font = fontSize + 'px monospace';
    
    // Draw characters
    for(let i = 0; i < drops.length; i++) {
        const text = matrixArray[Math.floor(Math.random() * matrixArray.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        
        // Reset drop when it reaches bottom (with some randomness)
        if(drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
            drops[i] = 0;
        }
        drops[i]++;
    }
}

// Start matrix animation
const matrixInterval = setInterval(drawMatrix, 35);

// Handle window resize
window.addEventListener('resize', () => {
    resizeCanvas();
    columns = canvas.width / fontSize;
    
    // Reinitialize drops for new canvas size
    for(let x = drops.length; x < columns; x++) {
        drops[x] = 1;
    }
});

// Sound Effects
function playClickSound() {
    // Create a simple click sound using Web Audio API
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
        console.log('Audio not supported or blocked');
    }
}

// Background Music Toggle
let audioEnabled = false;

function toggleBackgroundMusic() {
    const btn = document.getElementById('muteBtn');
    
    if (!audioEnabled) {
        // Enable audio (placeholder - add your background music logic here)
        btn.textContent = 'MUTED';
        btn.style.opacity = '0.5';
        audioEnabled = true;
        console.log('Background music enabled');
    } else {
        // Disable audio
        btn.textContent = 'AUDIO';
        btn.style.opacity = '1';
        audioEnabled = false;
        console.log('Background music disabled');
    }
}

// Button Click Handler
function handleButtonClick(button, action) {
    // Visual feedback animation
    button.style.transform = 'scale(0.95)';
    
    // Create ripple effect
    createRipple(button, event);
    
    // Play click sound
    playClickSound();
    
    // Reset button transform after animation
    setTimeout(() => {
        button.style.transform = '';
    }, 150);

    // Handle different actions
    switch(action) {
        case 'start':
            console.log('Starting wellness journey...');
            // Since bodyposture.html is in the same folder as index.html
            window.location.href = 'bodyposture.html';
            break;
        case 'learn':
            console.log('Viewing health insights...');
            // Navigate to necktilt.html in the same folder
            window.location.href = 'necktilt.html';
            break;
        default:
            console.log('Unknown action:', action);
    }
}

// Ripple Effect
function createRipple(element, event) {
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    
    element.appendChild(ripple);
    
    // Remove ripple after animation
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

// Enhanced Interactive Effects
document.addEventListener('DOMContentLoaded', function() {
    // Start title sequence audio
    setTimeout(startTitleSequenceAudio, 500);

    // Add click effects to navigation links
    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Visual feedback
            link.style.transform = 'scale(0.95)';
            setTimeout(() => {
                link.style.transform = '';
            }, 100);
            
            // Play sound
            playClickSound();
            
            console.log('Navigation clicked:', link.textContent);
        });
    });

    // Keyboard navigation support
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            const focusedElement = document.activeElement;
            if (focusedElement.classList.contains('cta-button')) {
                event.preventDefault();
                focusedElement.click();
            }
        }
    });
});

// Utility Functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Smooth scroll utility (for future navigation)
function smoothScrollTo(targetId) {
    const target = document.getElementById(targetId);
    if (target) {
        target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
}


