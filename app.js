'use strict';

// ============================================================
// Word engine
// ============================================================

const SUIT_KEYS = ['S', 'H', 'D', 'C'];
const VALUE_KEYS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_GLYPHS = { S: '♠', H: '♥', D: '♦', C: '♣' };

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomCard() {
  return pick(VALUE_KEYS) + pick(SUIT_KEYS);
}

function phraseFor(card) {
  const suit = card.slice(-1);
  const value = card.slice(0, -1);
  const suitWord = pick(WORDS.suits[suit]);
  if (value === '7') return [suitWord, ...WORDS.sevenOf];
  return [suitWord, pick(WORDS.of), pick(WORDS.values[value])];
}

// ============================================================
// Elements & state
// ============================================================

const $ = (id) => document.getElementById(id);

const preview = $('preview');
const playCanvas = $('playback');
const playCtx = playCanvas.getContext('2d');
const wordsEl = $('words');
const recIndicator = $('rec-indicator');
const recTimeEl = recIndicator.querySelector('span');
const hintEl = $('hint');
const statusEl = $('status');

const btnStart = $('btn-start');
const btnRecord = $('btn-record');
const btnFlip = $('btn-flip');
const btnShuffle = $('btn-shuffle');
const btnForward = $('btn-forward');
const btnReverse = $('btn-reverse');
const btnRetake = $('btn-retake');

const MAX_SECONDS = 12;
const CAPTURE_FPS = 15;
const CAPTURE_MAX_SIDE = 480;

let stream = null;
let facing = 'user';
let mirrored = true;

let audioCtx = null;
let recorder = null;
let chunks = [];
let recStart = 0;
let captureTimer = 0;
let recTickTimer = 0;

const capCanvas = document.createElement('canvas');
const capCtx = capCanvas.getContext('2d');

let frames = [];            // [{ t, blob, img }]
let recordedMirrored = false;
let forwardBuffer = null;   // AudioBuffer
let reverseBuffer = null;   // AudioBuffer
let playing = null;         // { src, raf }

let forcedCard = localStorage.getItem('reverse.card') || '';

// ============================================================
// UI state machine: gate -> live -> recording -> processing -> review
// ============================================================

function show(el, on) { el.hidden = !on; }

function setState(state) {
  const live = state === 'live';
  const rec = state === 'recording';
  const review = state === 'review';
  const processing = state === 'processing';

  show(preview, !review);
  show(playCanvas, review);
  show(wordsEl, live || rec);
  show(recIndicator, rec);
  show(hintEl, rec);
  show(statusEl, processing);

  show(btnRecord, live || rec);
  btnRecord.classList.toggle('recording', rec);
  show(btnFlip, live);
  show(btnShuffle, live);
  show(btnForward, review);
  show(btnReverse, review);
  show(btnRetake, review);
}

function setStatus(msg) {
  statusEl.textContent = msg;
  show(statusEl, !!msg);
}

// ============================================================
// Words
// ============================================================

function isValidCard(card) {
  return SUIT_KEYS.includes(card.slice(-1)) && VALUE_KEYS.includes(card.slice(0, -1));
}

function newPhrase() {
  const urlCard = (new URLSearchParams(location.search).get('card') || '').toUpperCase();
  let card = urlCard || forcedCard || '';
  if (!isValidCard(card)) card = randomCard();
  const words = phraseFor(card);
  const spans = wordsEl.querySelectorAll('span');
  spans.forEach((s, i) => { s.textContent = words[i] || ''; });
}

// ============================================================
// Camera
// ============================================================

async function startCamera() {
  stopStream();
  const base = { audio: true, video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } };
  try {
    stream = await navigator.mediaDevices.getUserMedia(base);
  } catch (err) {
    // Fall back to any camera (desktop without facingMode support, etc.)
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch (err2) {
      throw err2;
    }
  }
  preview.srcObject = stream;
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings ? track.getSettings() : {};
  mirrored = (settings.facingMode || facing) !== 'environment';
  preview.classList.toggle('mirror', mirrored);
  await preview.play().catch(() => {});
}

function stopStream() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

// ============================================================
// Recording
// ============================================================

function pickMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

function startRecording() {
  if (!stream || !preview.videoWidth) return;

  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  audioCtx.resume();

  releaseRecording();

  const scale = Math.min(1, CAPTURE_MAX_SIDE / Math.max(preview.videoWidth, preview.videoHeight));
  capCanvas.width = Math.round(preview.videoWidth * scale);
  capCanvas.height = Math.round(preview.videoHeight * scale);
  recordedMirrored = mirrored;

  chunks = [];
  const mime = pickMime();
  recorder = new MediaRecorder(new MediaStream(stream.getAudioTracks()), mime ? { mimeType: mime } : undefined);
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = finishRecording;

  recStart = performance.now();
  recorder.start();
  captureTimer = setInterval(captureFrame, 1000 / CAPTURE_FPS);
  recTickTimer = setInterval(updateRecTime, 200);
  setState('recording');
}

function captureFrame() {
  if (!preview.videoWidth) return;
  const t = (performance.now() - recStart) / 1000;
  if (t > MAX_SECONDS) { stopRecording(); return; }
  capCtx.drawImage(preview, 0, 0, capCanvas.width, capCanvas.height);
  const slot = { t, blob: null, img: null };
  frames.push(slot);
  capCanvas.toBlob((b) => { slot.blob = b; }, 'image/jpeg', 0.8);
}

function updateRecTime() {
  const s = Math.floor((performance.now() - recStart) / 1000);
  recTimeEl.textContent = `0:${String(s).padStart(2, '0')}`;
}

function stopRecording() {
  clearInterval(captureTimer);
  clearInterval(recTickTimer);
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  setState('processing');
  setStatus('Processing…');
}

async function finishRecording() {
  try {
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    const arrayBuf = await blob.arrayBuffer();
    forwardBuffer = await decodeAudio(arrayBuf);
    reverseBuffer = makeReversed(forwardBuffer);

    frames = frames.filter((f) => f.blob);
    await Promise.all(frames.map(async (f) => { f.img = await blobToDrawable(f.blob); }));
    if (!frames.length || forwardBuffer.duration < 0.3) throw new Error('Recording too short');

    playCanvas.width = capCanvas.width;
    playCanvas.height = capCanvas.height;
    playCanvas.classList.toggle('mirror', recordedMirrored);
    drawFrameAt(0);

    setStatus('');
    setState('review');
  } catch (err) {
    console.error(err);
    setStatus('');
    releaseRecording();
    setState('live');
  }
}

function decodeAudio(arrayBuf) {
  return new Promise((resolve, reject) => {
    const p = audioCtx.decodeAudioData(arrayBuf, resolve, reject);
    if (p && p.then) p.then(resolve, reject);
  });
}

function makeReversed(buf) {
  const rev = audioCtx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch);
    const dst = rev.getChannelData(ch);
    for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
  }
  return rev;
}

async function blobToDrawable(blob) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(blob); } catch (_) { /* fall through */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function releaseRecording() {
  stopPlayback();
  frames.forEach((f) => { if (f.img && f.img.close) f.img.close(); });
  frames = [];
  forwardBuffer = null;
  reverseBuffer = null;
}

// ============================================================
// Playback
// ============================================================

function frameIndexAt(t) {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function drawFrameAt(t) {
  if (!frames.length) return;
  const img = frames[frameIndexAt(t)].img;
  if (img) playCtx.drawImage(img, 0, 0, playCanvas.width, playCanvas.height);
}

function playRecording(reverse) {
  if (!forwardBuffer) return;
  stopPlayback();
  audioCtx.resume();

  const src = audioCtx.createBufferSource();
  src.buffer = reverse ? reverseBuffer : forwardBuffer;
  src.connect(audioCtx.destination);

  const dur = forwardBuffer.duration;
  const t0 = audioCtx.currentTime;
  src.start();

  playing = { src, raf: 0 };
  btnForward.disabled = !reverse;
  btnReverse.disabled = reverse;

  const tick = () => {
    if (!playing || playing.src !== src) return;
    const elapsed = audioCtx.currentTime - t0;
    drawFrameAt(reverse ? Math.max(0, dur - elapsed) : Math.min(dur, elapsed));
    if (elapsed >= dur) { stopPlayback(); return; }
    playing.raf = requestAnimationFrame(tick);
  };
  tick();
  src.onended = () => { if (playing && playing.src === src) stopPlayback(); };
}

function stopPlayback() {
  if (!playing) return;
  cancelAnimationFrame(playing.raf);
  playing.src.onended = null;
  try { playing.src.stop(); } catch (_) { /* already stopped */ }
  playing = null;
  btnForward.disabled = false;
  btnReverse.disabled = false;
}

// ============================================================
// Hidden card picker (long-press the words to open)
// ============================================================

const picker = $('picker');
const pickerGrid = $('picker-grid');
const pickerRandom = $('picker-random');

function buildPicker() {
  for (const v of VALUE_KEYS) {
    for (const s of SUIT_KEYS) {
      const b = document.createElement('button');
      b.textContent = v + SUIT_GLYPHS[s];
      b.dataset.card = v + s;
      if (s === 'H' || s === 'D') b.classList.add('red');
      b.addEventListener('click', () => {
        forcedCard = v + s;
        localStorage.setItem('reverse.card', forcedCard);
        closePicker();
        newPhrase();
      });
      pickerGrid.appendChild(b);
    }
  }
  pickerRandom.addEventListener('click', () => {
    forcedCard = '';
    localStorage.removeItem('reverse.card');
    closePicker();
    newPhrase();
  });
  $('picker-close').addEventListener('click', closePicker);
  picker.addEventListener('click', (e) => { if (e.target === picker) closePicker(); });
}

function openPicker() {
  pickerGrid.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('selected', b.dataset.card === forcedCard);
  });
  pickerRandom.classList.toggle('selected', !forcedCard);
  show(picker, true);
}

function closePicker() {
  show(picker, false);
}

let lpTimer = 0;
wordsEl.addEventListener('pointerdown', () => {
  lpTimer = setTimeout(openPicker, 700);
});
['pointerup', 'pointerleave', 'pointercancel', 'pointermove'].forEach((ev) => {
  wordsEl.addEventListener(ev, () => clearTimeout(lpTimer));
});

// ============================================================
// Wire-up
// ============================================================

btnStart.addEventListener('click', async () => {
  btnStart.disabled = true;
  try {
    await startCamera();
    show($('gate'), false);
    newPhrase();
    setState('live');
  } catch (err) {
    console.error(err);
    btnStart.disabled = false;
    btnStart.textContent = 'Camera blocked — allow access & retry';
  }
});

btnRecord.addEventListener('click', () => {
  if (recorder && recorder.state === 'recording') stopRecording();
  else startRecording();
});

btnFlip.addEventListener('click', async () => {
  facing = facing === 'user' ? 'environment' : 'user';
  btnFlip.disabled = true;
  try { await startCamera(); } catch (err) { console.error(err); }
  btnFlip.disabled = false;
});

btnShuffle.addEventListener('click', newPhrase);

btnForward.addEventListener('click', () => playRecording(false));
btnReverse.addEventListener('click', () => playRecording(true));

btnRetake.addEventListener('click', () => {
  releaseRecording();
  setState('live');
});

buildPicker();
setState('gate');
