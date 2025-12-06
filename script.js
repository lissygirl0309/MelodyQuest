// Simple stage manager for Melody Quest
// - Wrap your screens in elements with class="scene" and data-stage="0", "1", ...
// - This script shows one scene at a time and wires Back/Next controls.

document.addEventListener('DOMContentLoaded', () => {
  const scenes = Array.from(document.querySelectorAll('.scene'));
  if (!scenes.length) return;

  function resolveSceneFromText(text) {
    if (!text) return null;
    // direct pattern: scene:8 or scene=8 anywhere in the string
    const m = String(text).match(/scene[:=]?\s*([0-9]+)/i);
    if (m && !Number.isNaN(parseInt(m[1], 10))) return parseInt(m[1], 10);
    // try URL query param ?scene=8
    try {
      const url = new URL(String(text));
      const sceneParam = url.searchParams.get('scene');
      if (sceneParam && !Number.isNaN(parseInt(sceneParam, 10))) return parseInt(sceneParam, 10);
      // explicit allowlist for provided QR short link
      if (url.hostname.includes('qrcodeveloper.com') && url.pathname.includes('-yu71YHLI1K6fVbT')) return 8;
      if (url.hostname.includes('qrcodeveloper.com') && url.pathname.includes('FPvbrgycb7LAysQB')) return 10;
    } catch (e) {}
    return null;
  }

  const backBtn = document.getElementById('backBtn');
  const nextBtn = document.getElementById('nextBtn');
  const PRIMARY_SELECTOR = '.primary-action';
  const SCENE8_PRIZE_KEY = 'mq-scene8-prize';
  const SCENE10_PRIZE_KEY = 'mq-scene10-prize';
  const SCENE11_QUIZ_KEY = 'mq-scene11-quiz';
  let scene8PrizeGiven = false;
  let scene10PrizeGiven = false;
  let scene11QuizCompleted = false;

  // Restore saved stage or start at 0
  let current = parseInt(localStorage.getItem('mq-stage') || '0', 10);
  if (Number.isNaN(current) || current < 0 || current >= scenes.length) current = 0;
  try { scene8PrizeGiven = localStorage.getItem(SCENE8_PRIZE_KEY) === '1'; } catch (e) {}
  try { scene10PrizeGiven = localStorage.getItem(SCENE10_PRIZE_KEY) === '1'; } catch (e) {}
  try { scene11QuizCompleted = localStorage.getItem(SCENE11_QUIZ_KEY) === '1'; } catch (e) {}

  function show(index) {
    if (index < 0 || index >= scenes.length) return;
    scenes.forEach((s, i) => s.classList.toggle('active', i === index));
    current = index;
    localStorage.setItem('mq-stage', String(current));
    if (backBtn) backBtn.disabled = current === 0;
    // Disable Next in camera scenes (4,7,9) and at end (scene 11)
    if (nextBtn) nextBtn.disabled = (current === 4) || (current === 7) || (current === 9) || (current === 11);
    // Award scene 8 prize (note E) once on first visit
    if (current === 8 && !scene8PrizeGiven) {
      handleSpinResult('E');
      scene8PrizeGiven = true;
      try { localStorage.setItem(SCENE8_PRIZE_KEY, '1'); } catch (e) {}
    }
    // Award scene 10 prize (note F) once on first visit
    if (current === 10 && !scene10PrizeGiven) {
      handleSpinResult('F');
      scene10PrizeGiven = true;
      try { localStorage.setItem(SCENE10_PRIZE_KEY, '1'); } catch (e) {}
    }
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
  if (nextBtn) nextBtn.addEventListener('click', () => show(Math.min(current + 1, 11)));

  // Wire primary action inside each scene (eg the Ready! button),
  // but DO NOT treat the camera open button as a primary navigation action.
  scenes.forEach(scene => {
    const primary = scene.querySelector(PRIMARY_SELECTOR);
    // Do not auto-wire navigation for camera or spin buttons
    if (primary && primary.id !== 'cameraBtn' && primary.id !== 'cameraBtn7' && primary.id !== 'cameraBtn9' && primary.id !== 'spinBtn') {
      primary.addEventListener('click', () => {
        // move to next scene if possible (respect cap at 6)
        show(Math.min(current + 1, 6));
      });
    }
  });

  // Optional: keyboard navigation (ArrowRight / ArrowLeft)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(Math.min(current + 1, 10));
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
    // Always add the note (allow duplicates)
    arr.push(letter);
    saveCollected(arr);
    updateCollectedUI();
    // celebration
    showQuarterNote(letter);
    spawnConfetti(26);
    // swap the scene 3 character to the celebratory one
    if (scene3Char) scene3Char.src = CHAR5_SRC;
  }

  // Reset handler: clear collected notes and spun flag, reset visuals
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      try { localStorage.removeItem('mq-collected'); localStorage.removeItem('mq-spun'); localStorage.removeItem(SCENE8_PRIZE_KEY); localStorage.removeItem(SCENE10_PRIZE_KEY); localStorage.removeItem(SCENE11_QUIZ_KEY); } catch (e) {}
      scene8PrizeGiven = false;
      scene10PrizeGiven = false;
      scene11QuizCompleted = false;
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
      const quizChoices = document.querySelectorAll('.scene[data-stage="6"] .quiz-choice');
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
      
      // Reset Scene 11 quiz
      const quizChoices11 = Array.from(document.querySelectorAll('.scene[data-stage="11"] .quiz-choice'));
      const quizFeedback11 = document.getElementById('quizFeedback11');
      quizChoices11.forEach(c => {
        c.disabled = false;
        c.style.background = '';
        c.style.color = '';
      });
      if (quizFeedback11) {
        quizFeedback11.style.display = 'none';
        quizFeedback11.innerHTML = '';
      }
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
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
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
        console.log('QR Code detected (Scene 4):', JSON.stringify(text), 'Length:', text.length);
        // consecutive detection tracking
        if (text === lastQRText) {
          consecutiveDetections++;
        } else {
          lastQRText = text;
          consecutiveDetections = 1;
        }
        // Strictly prefixed commands; auto-navigate after two consecutive detections
        const targetScene = resolveSceneFromText(text);
        console.log('Scene 4: Resolved target scene:', targetScene, 'detections:', consecutiveDetections, 'scenes.length:', scenes.length);
        if (targetScene !== null && consecutiveDetections >= 1 && targetScene >= 0 && targetScene < scenes.length) {
          console.log(`Scene 4: Navigating to scene ${targetScene}`);
          if (qrResult) {
            qrResult.innerHTML = `<strong>QR Detected:</strong> scene:${targetScene} (detections: ${consecutiveDetections}/1)`;
            qrResult.style.display = 'block';
          }
          scanningQR = false;
          setTimeout(() => {
            show(targetScene);
            if (stopCameraBtn) stopCameraBtn.click();
          }, 150);
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
  const quizChoices = document.querySelectorAll('.scene[data-stage="6"] .quiz-choice');
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

  // --- Multiple choice quiz handler for Scene 11 (2+2 question) ---
  const quizFeedback11 = document.getElementById('quizFeedback11');
  const quizChoices11 = Array.from(document.querySelectorAll('.scene[data-stage="11"] .quiz-choice'));

  console.log('Scene 11 quiz choices found:', quizChoices11.length);

  // If quiz was already completed, disable buttons and show completed state
  if (scene11QuizCompleted) {
    quizChoices11.forEach(c => {
      c.disabled = true;
      if (c.getAttribute('data-answer') === 'correct') {
        c.style.background = '#90be6d';
        c.style.color = '#fff';
      }
    });
    if (quizFeedback11) {
      quizFeedback11.innerHTML = '<strong style="color:#90be6d;">✓ Correct!</strong>';
      quizFeedback11.style.display = 'block';
    }
  }

  quizChoices11.forEach(choice => {
    choice.addEventListener('click', () => {
      const isCorrect = choice.getAttribute('data-answer') === 'correct';
      
      // Disable all choices after selection
      quizChoices11.forEach(c => c.disabled = true);
      
      if (isCorrect) {
        choice.style.background = '#90be6d';
        choice.style.color = '#fff';
        if (quizFeedback11) {
          quizFeedback11.innerHTML = '<strong style="color:#90be6d;">✓ Correct!</strong>';
          quizFeedback11.style.display = 'block';
        }
        // Award note F and celebrate with confetti (only once)
        if (!scene11QuizCompleted) {
          handleSpinResult('F');
          scene11QuizCompleted = true;
          try { localStorage.setItem(SCENE11_QUIZ_KEY, '1'); } catch (e) {}
        }
      } else {
        choice.style.background = '#f94144';
        choice.style.color = '#fff';
        if (quizFeedback11) {
          quizFeedback11.innerHTML = '<strong style="color:#f94144;">✗ Try again!</strong>';
          quizFeedback11.style.display = 'block';
        }
        // Re-enable choices after a delay for retry
        setTimeout(() => {
          quizChoices11.forEach(c => c.disabled = false);
          choice.style.background = '';
          choice.style.color = '';
          if (quizFeedback11) quizFeedback11.style.display = 'none';
        }, 1500);
      }
    });
  });

  // --- Camera handlers for Scene 7 (duplicate of Scene 4 logic) ---
  const cameraBtn7 = document.getElementById('cameraBtn7');
  const stopCameraBtn7 = document.getElementById('stopCameraBtn7');
  const cameraVideo7 = document.getElementById('cameraVideo7');
  const cameraCanvas7 = document.getElementById('cameraCanvas7');
  const qrResult7 = document.getElementById('qrResult7');
  let cameraStream7 = null;
  let scanningQR7 = false;
  let lastQRText7 = '';
  let consecutiveDetections7 = 0;

  if (cameraVideo7) {
    cameraVideo7.muted = true;
    cameraVideo7.playsInline = true;
  }

  function scanQRCode7() {
    if (!scanningQR7 || !cameraVideo7 || !cameraCanvas7) return;
    
    const canvas = cameraCanvas7;
    const video = cameraVideo7;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR ? window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" }) : null;
      
      if (code && code.data) {
        const text = String(code.data).trim();
        if (qrResult7) {
          qrResult7.innerHTML = `<strong>QR Code Found:</strong><br>${text}`;
          qrResult7.style.display = 'block';
        }
        console.log('QR Code detected (Scene 7):', JSON.stringify(text), 'Length:', text.length);
        if (text === lastQRText7) {
          consecutiveDetections7++;
        } else {
          lastQRText7 = text;
          consecutiveDetections7 = 1;
        }
        const targetScene = resolveSceneFromText(text);
        console.log('Scene 7: Resolved target scene:', targetScene, 'detections7:', consecutiveDetections7, 'scenes.length:', scenes.length);
        if (targetScene !== null && consecutiveDetections7 >= 1 && targetScene >= 0 && targetScene < scenes.length) {
          console.log(`Scene 7: Navigating to scene ${targetScene}`);
          if (qrResult7) {
            qrResult7.innerHTML = `<strong>QR Detected:</strong> scene:${targetScene} (detections: ${consecutiveDetections7}/1)`;
            qrResult7.style.display = 'block';
          }
          scanningQR7 = false;
          setTimeout(() => {
            show(targetScene);
            if (stopCameraBtn7) stopCameraBtn7.click();
          }, 150);
        }
      }
    }
    
    if (scanningQR7) {
      requestAnimationFrame(scanQRCode7);
    }
  }

  if (cameraBtn7) {
    cameraBtn7.addEventListener('click', async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Camera not supported on this device/browser.');
        return;
      }
      if (!window.jsQR) {
        alert('QR scanner library not loaded. Please refresh the page.');
        return;
      }
      if (qrResult7) { qrResult7.style.display = 'none'; qrResult7.innerHTML = ''; }
      lastQRText7 = '';
      consecutiveDetections7 = 0;
      cameraBtn7.disabled = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        cameraStream7 = stream;
        if (cameraVideo7) {
          cameraVideo7.srcObject = stream;
          cameraVideo7.style.display = 'block';
          if (cameraCanvas7) cameraCanvas7.style.display = 'none';
          try { 
            await cameraVideo7.play();
            scanningQR7 = true;
            scanQRCode7();
          } catch(e) { 
            console.warn('Autoplay issue (Scene 7)', e);
          }
        }
        if (stopCameraBtn7) stopCameraBtn7.disabled = false;
      } catch (err) {
        console.error('Camera access error (Scene 7)', err);
        alert('Unable to access camera: ' + (err && err.message ? err.message : err));
        cameraBtn7.disabled = false;
      }
    });
  }

  if (stopCameraBtn7) {
    stopCameraBtn7.addEventListener('click', () => {
      scanningQR7 = false;
      if (cameraStream7) {
        cameraStream7.getTracks().forEach(t => t.stop());
        cameraStream7 = null;
      }
      if (cameraVideo7) {
        cameraVideo7.pause();
        cameraVideo7.srcObject = null;
        cameraVideo7.style.display = 'none';
      }
      if (qrResult7) {
        qrResult7.style.display = 'none';
        qrResult7.innerHTML = '';
      }
      lastQRText7 = '';
      consecutiveDetections7 = 0;
      if (cameraBtn7) cameraBtn7.disabled = false;
      stopCameraBtn7.disabled = true;
    });
  }

  // --- Camera handlers for Scene 9 (duplicate of Scene 7 logic) ---
  const cameraBtn9 = document.getElementById('cameraBtn9');
  const stopCameraBtn9 = document.getElementById('stopCameraBtn9');
  const cameraVideo9 = document.getElementById('cameraVideo9');
  const cameraCanvas9 = document.getElementById('cameraCanvas9');
  const qrResult9 = document.getElementById('qrResult9');
  let cameraStream9 = null;
  let scanningQR9 = false;
  let lastQRText9 = '';
  let consecutiveDetections9 = 0;

  if (cameraVideo9) {
    cameraVideo9.muted = true;
    cameraVideo9.playsInline = true;
  }

  function scanQRCode9() {
    if (!scanningQR9 || !cameraVideo9 || !cameraCanvas9) return;
    
    const canvas = cameraCanvas9;
    const video = cameraVideo9;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR ? window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" }) : null;
      
      if (code && code.data) {
        const text = String(code.data).trim();
        if (qrResult9) {
          qrResult9.innerHTML = `<strong>QR Code Found:</strong><br>${text}`;
          qrResult9.style.display = 'block';
        }
        console.log('QR Code detected (Scene 9):', JSON.stringify(text), 'Length:', text.length);
        if (text === lastQRText9) {
          consecutiveDetections9++;
        } else {
          lastQRText9 = text;
          consecutiveDetections9 = 1;
        }
        const targetScene = resolveSceneFromText(text);
        console.log('Scene 9: Resolved target scene:', targetScene, 'detections9:', consecutiveDetections9, 'scenes.length:', scenes.length);
        if (targetScene !== null && consecutiveDetections9 >= 1 && targetScene >= 0 && targetScene < scenes.length) {
          console.log(`Scene 9: Navigating to scene ${targetScene}`);
          if (qrResult9) {
            qrResult9.innerHTML = `<strong>QR Detected:</strong> scene:${targetScene} (detections: ${consecutiveDetections9}/1)`;
            qrResult9.style.display = 'block';
          }
          scanningQR9 = false;
          setTimeout(() => {
            show(targetScene);
            if (stopCameraBtn9) stopCameraBtn9.click();
          }, 150);
        }
      }
    }
    
    if (scanningQR9) {
      requestAnimationFrame(scanQRCode9);
    }
  }

  if (cameraBtn9) {
    cameraBtn9.addEventListener('click', async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Camera not supported on this device/browser.');
        return;
      }
      if (!window.jsQR) {
        alert('QR scanner library not loaded. Please refresh the page.');
        return;
      }
      if (qrResult9) { qrResult9.style.display = 'none'; qrResult9.innerHTML = ''; }
      lastQRText9 = '';
      consecutiveDetections9 = 0;
      cameraBtn9.disabled = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        cameraStream9 = stream;
        if (cameraVideo9) {
          cameraVideo9.srcObject = stream;
          cameraVideo9.style.display = 'block';
          if (cameraCanvas9) cameraCanvas9.style.display = 'none';
          try { 
            await cameraVideo9.play();
            scanningQR9 = true;
            scanQRCode9();
          } catch(e) { 
            console.warn('Autoplay issue (Scene 9)', e);
          }
        }
        if (stopCameraBtn9) stopCameraBtn9.disabled = false;
      } catch (err) {
        console.error('Camera access error (Scene 9)', err);
        alert('Unable to access camera: ' + (err && err.message ? err.message : err));
        cameraBtn9.disabled = false;
      }
    });
  }

  if (stopCameraBtn9) {
    stopCameraBtn9.addEventListener('click', () => {
      scanningQR9 = false;
      if (cameraStream9) {
        cameraStream9.getTracks().forEach(t => t.stop());
        cameraStream9 = null;
      }
      if (cameraVideo9) {
        cameraVideo9.pause();
        cameraVideo9.srcObject = null;
        cameraVideo9.style.display = 'none';
      }
      if (qrResult9) {
        qrResult9.style.display = 'none';
        qrResult9.innerHTML = '';
      }
      lastQRText9 = '';
      consecutiveDetections9 = 0;
      if (cameraBtn9) cameraBtn9.disabled = false;
      stopCameraBtn9.disabled = true;
    });
  }
});
