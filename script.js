// Simple stage manager for Melody Quest
// - Wrap your screens in elements with class="scene" and data-stage="0", "1", ...
// - This script shows one scene at a time and wires Back/Next controls.

document.addEventListener('DOMContentLoaded', () => {
  const scenes = Array.from(document.querySelectorAll('.scene'));
  if (!scenes.length) return;

  const backBtn = document.getElementById('backBtn');
  const nextBtn = document.getElementById('nextBtn');
  const PRIMARY_SELECTOR = '.primary-action';

  // Restore saved stage or start at 0
  let current = parseInt(localStorage.getItem('mq-stage') || '0', 10);
  if (Number.isNaN(current) || current < 0 || current >= scenes.length) current = 0;

  function show(index) {
    if (index < 0 || index >= scenes.length) return;
    scenes.forEach((s, i) => s.classList.toggle('active', i === index));
    current = index;
    localStorage.setItem('mq-stage', String(current));
    if (backBtn) backBtn.disabled = current === 0;
    // Disable Next in Scene 4 (camera scene), allow navigation through Scene 6 otherwise
    if (nextBtn) nextBtn.disabled = (current === 4) || (current >= 6);
  }

  // Expose a simple helper for DevTools: mqShow(index)
  try {
    window.mqShow = (i) => {
      const n = parseInt(i, 10);
      if (!Number.isNaN(n)) show(n);
    };
  } catch (e) {}

  // Wire persistent nav buttons
  if (backBtn) backBtn.addEventListener('click', () => show(current - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => show(Math.min(current + 1, 6)));

  // Wire primary action inside each scene (eg the Ready! button),
  // but DO NOT treat the camera open button as a primary navigation action.
  scenes.forEach(scene => {
    const primary = scene.querySelector(PRIMARY_SELECTOR);
    // Do not auto-wire navigation for camera or spin buttons
    if (primary && primary.id !== 'cameraBtn' && primary.id !== 'spinBtn') {
      primary.addEventListener('click', () => {
        // move to next scene if possible (respect cap at 6)
        show(Math.min(current + 1, 6));
      });
    }
  });

  // Optional: keyboard navigation (ArrowRight / ArrowLeft)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(Math.min(current + 1, 6));
    if (e.key === 'ArrowLeft') show(Math.max(current - 1, 0));
  });

  // Show the saved/initial scene
  show(current);

  // Dev jump button (if present)
  const goto4Btn = document.getElementById('goto4Btn');
  if (goto4Btn) {
    goto4Btn.addEventListener('click', () => {
      localStorage.setItem('mq-stage','4');
      show(4);
    });
  }

  // Wheel spinner (Scene 3) — inline SVG group rotation
  const wheelGroup = document.getElementById('wheelGroup');
  const spinBtn = document.getElementById('spinBtn');
  const resetBtn = document.getElementById('resetBtn');
  const resultEl = document.getElementById('wheelResult');
  let lastRotation = 0;
  const scene3Char = document.querySelector('.bottom-character-inner');
  const CHAR4_SRC = 'SeminarCharacter4.svg';
  const CHAR5_SRC = 'SeminarCharacter5.svg';
  // Scene 6 quiz character swap targets
  const scene6Char = document.querySelector('.scene[data-stage="6"] .bottom-character');
  const SCENE6_DEFAULT_CHAR = 'SeminarCharacter3.svg';
  const SCENE6_INCORRECT_CHAR = 'SeminarCharacter6.svg';
  const SCENE6_CORRECT_CHAR = 'SeminarCharacter5.svg';
  try { const _p6 = new Image(); _p6.src = SCENE6_CORRECT_CHAR; } catch (e) {}
  // preload swap image to reduce flicker
  try { const _p = new Image(); _p.src = CHAR5_SRC; } catch (e) {}
  if (wheelGroup && spinBtn) {
    // prepare transform settings so CSS transforms use the SVG bounding box
    wheelGroup.style.transformBox = 'fill-box';
    wheelGroup.style.transformOrigin = '50% 50%';

    const slices = 6;
    let spinning = false;
    const rewards = ['C','C','C','C','C','C'];

    // If the user has already spun (persisted), disable Spin until reset
    if (localStorage.getItem('mq-spun') === '1') {
      spinBtn.disabled = true;
    }

    spinBtn.addEventListener('click', () => {
      if (spinning) return;
      spinning = true;
      resultEl.textContent = '';

      const spins = 6 + Math.floor(Math.random() * 3);
      const randomness = Math.random() * 360; // random final offset
      const degrees = spins * 360 + randomness;

      lastRotation += degrees;
      wheelGroup.style.transition = 'transform 4s cubic-bezier(0.33,1,0.68,1)';
      wheelGroup.style.transform = `rotate(${lastRotation}deg)`;

      function onEnd() {
        wheelGroup.removeEventListener('transitionend', onEnd);
        // determine which slice is currently at the pointer (top)
        const rot = ((lastRotation % 360) + 360) % 360; // 0..359
        // targetAngle that should match a slice center: C_i + rot === -90 (mod 360) => C_i === -90 - rot
        const targetAngle = ((-90 - rot) % 360 + 360) % 360;
        // slice center angles (normalized 0..360): -60 + 60*i
        let closest = 0;
        let bestDiff = 360;
        for (let i=0;i<slices;i++) {
          const center = ((-60 + 60 * i) % 360 + 360) % 360;
          const diff = Math.min(Math.abs(center - targetAngle), 360 - Math.abs(center - targetAngle));
          if (diff < bestDiff) { bestDiff = diff; closest = i; }
        }
        const letter = rewards[closest];
        resultEl.textContent = `You won: ${letter}`;
        handleSpinResult(letter);
        // persist that a spin has occurred and disable Spin until Reset
        try { localStorage.setItem('mq-spun', '1'); } catch (e) {}
        spinBtn.disabled = true;
        spinning = false;
      }

      wheelGroup.addEventListener('transitionend', onEnd);
    });
  }

  // --- Persistent collection + visuals + sound ---
  const COL_KEY = 'mq-collected';
  const collectedEl = document.getElementById('collectedNotes');

  function loadCollected() {
    try {
      const raw = localStorage.getItem(COL_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveCollected(arr) {
    try { localStorage.setItem(COL_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function updateCollectedUI() {
    if (!collectedEl) return;
    const arr = loadCollected();
    collectedEl.innerHTML = '';
    arr.forEach(letter => {
      const d = document.createElement('div');
      d.className = 'collected-note';
      d.textContent = letter;
      collectedEl.appendChild(d);
    });
  }

  // play a short tone for a given letter using WebAudio
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const audioCtx = AudioContext ? new AudioContext() : null;
  const noteFreq = { A:440, B:494, C:523.25, D:587.33, E:659.25, F:698.46 };

  function playNote(letter, duration = 600) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = noteFreq[letter] || 440;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration/1000);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(now); o.stop(now + duration/1000 + 0.05);
  }

  // simple confetti spawn near center-top of viewport
  function spawnConfetti(count = 20) {
    const colors = ['#f94144','#f3722c','#f8961e','#f9c74f','#90be6d','#577590'];
    for (let i=0;i<count;i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.background = colors[Math.floor(Math.random()*colors.length)];
      c.style.left = (50 + (Math.random()*40-20)) + '%';
      c.style.top = (30 + Math.random()*5) + '%';
      c.style.transform = `translateX(${(Math.random()*120-60)}px) rotate(${Math.floor(Math.random()*360)}deg)`;
      document.body.appendChild(c);
      // remove after animation
      setTimeout(() => c.remove(), 1400);
    }
  }

  function showQuarterNote(letter) {
    const el = document.createElement('div');
    el.className = 'quarter-note';
    el.innerHTML = `<div class="note-symbol">♪</div><div class="note-text">You collected: ${letter}</div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  function handleSpinResult(letter) {
    // ensure audio context resumed on user interaction
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    playNote(letter);
    const arr = loadCollected();
    if (!arr.includes(letter)) {
      arr.push(letter);
      saveCollected(arr);
      updateCollectedUI();
      // celebration
      showQuarterNote(letter);
      spawnConfetti(26);
      // swap the scene 3 character to the celebratory one
      if (scene3Char) scene3Char.src = CHAR5_SRC;
    } else {
      // already collected - still show note briefly
      showQuarterNote(letter);
      if (scene3Char) scene3Char.src = CHAR5_SRC;
    }
  }

  // Reset handler: clear collected notes and spun flag, reset visuals
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      try { localStorage.removeItem('mq-collected'); localStorage.removeItem('mq-spun'); } catch (e) {}
      updateCollectedUI();
      // reset wheel rotation
      lastRotation = 0;
      if (wheelGroup) {
        wheelGroup.style.transition = 'transform 0.2s ease-out';
        wheelGroup.style.transform = `rotate(0deg)`;
        setTimeout(() => { wheelGroup.style.transition = ''; }, 250);
      }
      if (resultEl) resultEl.textContent = '';
      if (scene3Char) scene3Char.src = CHAR4_SRC;
      if (spinBtn) spinBtn.disabled = false;
      
      // Reset Scene 6 quiz
      const quizChoices = document.querySelectorAll('.quiz-choice');
      const quizFeedback = document.getElementById('quizFeedback');
      quizChoices.forEach(c => {
        c.disabled = false;
        c.style.background = '';
        c.style.color = '';
      });
      if (quizFeedback) {
        quizFeedback.style.display = 'none';
        quizFeedback.innerHTML = '';
      }
      // Restore scene 6 character if it was swapped on incorrect answer
      if (scene6Char) scene6Char.src = SCENE6_DEFAULT_CHAR;
    });
  }

  // init collected UI
  updateCollectedUI();

  // --- Camera handlers for Scene 4 with QR scanning ---
  const cameraBtn = document.getElementById('cameraBtn');
  const stopCameraBtn = document.getElementById('stopCameraBtn');
  const cameraVideo = document.getElementById('cameraVideo');
  const cameraCanvas = document.getElementById('cameraCanvas');
  const qrResult = document.getElementById('qrResult');
  let cameraStream = null;
  let scanningQR = false;
  let lastQRText = '';
  let consecutiveDetections = 0;
  let pendingScene = null;

  if (cameraVideo) {
    cameraVideo.muted = true;
    cameraVideo.playsInline = true;
  }

  function scanQRCode() {
    if (!scanningQR || !cameraVideo || !cameraCanvas) return;
    
    const canvas = cameraCanvas;
    const video = cameraVideo;
    const ctx = canvas.getContext('2d');
    
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR ? window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" }) : null;
      
      if (code && code.data) {
        const text = String(code.data).trim();
        if (qrResult) {
          qrResult.innerHTML = `<strong>QR Code Found:</strong><br>${text}`;
          qrResult.style.display = 'block';
        }
        console.log('QR Code detected:', text);
        // consecutive detection tracking
        if (text === lastQRText) {
          consecutiveDetections++;
        } else {
          lastQRText = text;
          consecutiveDetections = 1;
        }
        // Strictly prefixed commands; auto-navigate after two consecutive detections
        const sceneMatch = text.match(/^scene:?([0-9]+)$/i);
        if (sceneMatch) {
          const targetScene = parseInt(sceneMatch[1], 10);
          if (!isNaN(targetScene)) {
            if (qrResult) {
              qrResult.innerHTML = `<strong>QR Detected:</strong> scene:${targetScene}`;
              qrResult.style.display = 'block';
            }
            if (consecutiveDetections >= 2 && targetScene >= 0 && targetScene < scenes.length) {
              scanningQR = false;
              // small delay to avoid flapping
              setTimeout(() => {
                show(targetScene);
                if (stopCameraBtn) stopCameraBtn.click();
              }, 300);
            }
          }
        }
      }
    }
    
    if (scanningQR) {
      requestAnimationFrame(scanQRCode);
    }
  }

  if (cameraBtn) {
    cameraBtn.addEventListener('click', async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Camera not supported on this device/browser.');
        return;
      }
      if (!window.jsQR) {
        alert('QR scanner library not loaded. Please refresh the page.');
        return;
      }
      if (qrResult) { qrResult.style.display = 'none'; qrResult.innerHTML = ''; }
      lastQRText = '';
      consecutiveDetections = 0;
      pendingScene = null;
      cameraBtn.disabled = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        cameraStream = stream;
        if (cameraVideo) {
          cameraVideo.srcObject = stream;
          cameraVideo.style.display = 'block';
          if (cameraCanvas) cameraCanvas.style.display = 'none';
          try { 
            await cameraVideo.play();
            scanningQR = true;
            scanQRCode();
          } catch(e) { 
            console.warn('Autoplay issue', e);
          }
        }
        if (stopCameraBtn) stopCameraBtn.disabled = false;
      } catch (err) {
        console.error('Camera access error', err);
        alert('Unable to access camera: ' + (err && err.message ? err.message : err));
        cameraBtn.disabled = false;
      }
    });
  }

  if (stopCameraBtn) {
    stopCameraBtn.addEventListener('click', () => {
      scanningQR = false;
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
      }
      if (cameraVideo) {
        cameraVideo.pause();
        cameraVideo.srcObject = null;
        cameraVideo.style.display = 'none';
      }
      if (qrResult) {
        qrResult.style.display = 'none';
        qrResult.innerHTML = '';
      }
      lastQRText = '';
      consecutiveDetections = 0;
      pendingScene = null;
      if (cameraBtn) cameraBtn.disabled = false;
      stopCameraBtn.disabled = true;
    });
  }

  // --- Multiple choice quiz handler for Scene 6 ---
  const quizChoices = document.querySelectorAll('.quiz-choice');
  const quizFeedback = document.getElementById('quizFeedback');

  quizChoices.forEach(choice => {
    choice.addEventListener('click', () => {
      const isCorrect = choice.getAttribute('data-answer') === 'correct';
      
      // Disable all choices after selection
      quizChoices.forEach(c => c.disabled = true);
      
      if (isCorrect) {
        choice.style.background = '#90be6d';
        choice.style.color = '#fff';
        if (quizFeedback) {
          quizFeedback.innerHTML = '<strong style="color:#90be6d;">✓ Correct!</strong>';
          quizFeedback.style.display = 'block';
        }
        // Award note D and celebrate
        handleSpinResult('D');
        // Swap to celebratory character for correct answer
        if (scene6Char) scene6Char.src = SCENE6_CORRECT_CHAR;
        // Optional: advance to next scene or give reward after a delay
        // setTimeout(() => show(Math.min(current + 1, scenes.length - 1)), 1500);
      } else {
        choice.style.background = '#f94144';
        choice.style.color = '#fff';
        if (quizFeedback) {
          quizFeedback.innerHTML = '<strong style="color:#f94144;">✗ Try again!</strong>';
          quizFeedback.style.display = 'block';
        }
        // Swap to incorrect answer character; persists until reset
        if (scene6Char) scene6Char.src = SCENE6_INCORRECT_CHAR;
        // Re-enable choices after a delay for retry
        setTimeout(() => {
          quizChoices.forEach(c => c.disabled = false);
          choice.style.background = '';
          choice.style.color = '';
          if (quizFeedback) quizFeedback.style.display = 'none';
        }, 1500);
      }
    });
  });
});
