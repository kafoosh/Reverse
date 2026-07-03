'use strict';

// ============================================================
// Word engine
// ============================================================

const SUIT_KEYS = ['S', 'H', 'D', 'C'];
const VALUE_KEYS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

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
  if (value === '4') return [suitWord, ...WORDS.fourOf];
  return [suitWord, pick(WORDS.of), pick(WORDS.values[value])];
}

function decoyPhrase() {
  const words = [];
  while (words.length < 3) {
    const w = pick(WORDS.decoys);
    if (!words.includes(w)) words.push(w);
  }
  return words;
}

function isValidCard(card) {
  return SUIT_KEYS.includes(card.slice(-1)) && VALUE_KEYS.includes(card.slice(0, -1));
}

// The card revealed by the SECOND recording. Set once per visit:
// forced via ?card=QH (any domain), otherwise random.
const urlCard = (new URLSearchParams(location.search).get('card') || '').toUpperCase();
const trickCard = isValidCard(urlCard) ? urlCard : randomCard();

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
const btnRedo = $('btn-redo');
const btnRetake = $('btn-retake');
const btnSave = $('btn-save');

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

// Recordings completed this visit. Take 0: decoy words.
// Take 1: the trick words. Take 2+: decoy words again.
let takeCount = 0;

let savedBlob = null;       // rendered combined video, ready to share
let rendering = false;

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
  show(btnRedo, review);
  show(btnRetake, review);
  show(btnSave, review);
}

function setStatus(msg) {
  statusEl.textContent = msg;
  show(statusEl, !!msg);
}

// ============================================================
// Words
// ============================================================

function newPhrase() {
  const words = takeCount === 1 ? phraseFor(trickCard) : decoyPhrase();
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
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
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

function pickAudioMime() {
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
  const mime = pickAudioMime();
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

    takeCount++;
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
  savedBlob = null;
  btnSave.textContent = '⤓';
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
  if (!forwardBuffer || rendering) return;
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
// Save video (forward + reverse in one clip)
// ============================================================

function pickVideoMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  // Prefer WebM: Chrome's MP4 recorder writes broken duration metadata
  // for canvas streams (players cut the video short). Safari doesn't
  // record WebM, so it falls through to its native — and correct — MP4.
  return [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
  ].find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

function randomId(len, alphabet) {
  const chars = alphabet || 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function renderCombinedVideo() {
  return new Promise((resolve, reject) => {
    const w = playCanvas.width;
    const h = playCanvas.height;
    const rc = document.createElement('canvas');
    rc.width = w;
    rc.height = h;
    const rctx = rc.getContext('2d');

    const drawAt = (t) => {
      const img = frames[frameIndexAt(t)].img;
      if (!img) return;
      if (recordedMirrored) {
        rctx.save();
        rctx.translate(w, 0);
        rctx.scale(-1, 1);
        rctx.drawImage(img, 0, 0, w, h);
        rctx.restore();
      } else {
        rctx.drawImage(img, 0, 0, w, h);
      }
    };
    drawAt(0);

    const dest = audioCtx.createMediaStreamDestination();
    const fwd = audioCtx.createBufferSource();
    fwd.buffer = forwardBuffer;
    fwd.connect(dest);
    const rev = audioCtx.createBufferSource();
    rev.buffer = reverseBuffer;
    rev.connect(dest);

    const mixed = new MediaStream([
      ...rc.captureStream(30).getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    const mime = pickVideoMime();
    let rec;
    try {
      rec = new MediaRecorder(mixed, mime ? { mimeType: mime, videoBitsPerSecond: 2500000 } : undefined);
    } catch (err) {
      reject(err);
      return;
    }
    const parts = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    rec.onstop = () => resolve(new Blob(parts, { type: rec.mimeType || mime || 'video/webm' }));
    rec.onerror = (e) => reject(e.error || new Error('Video render failed'));

    const dur = forwardBuffer.duration;
    // No timeslice: chunked ("fragmented") MP4 output reports only the
    // first fragment's duration in some players, cutting the saved
    // video short. A single final chunk muxes one consistent file.
    rec.start();
    const t0 = audioCtx.currentTime + 0.15;
    fwd.start(t0);
    rev.start(t0 + dur);

    // Interval (not rAF) so rendering keeps going even if the tab
    // is momentarily backgrounded.
    const tick = setInterval(() => {
      const el = audioCtx.currentTime - t0;
      if (el >= 0) drawAt(el < dur ? Math.min(dur, el) : Math.max(0, dur - (el - dur)));
    }, 1000 / 30);

    // Stop only once the reverse pass has actually finished playing
    // (plus a tail margin), so the file always contains the full
    // forward + reverse audio. Guard timeout in case onended never fires.
    let guard = 0;
    let stopped = false;
    const finish = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(guard);
      setTimeout(() => {
        clearInterval(tick);
        if (rec.state !== 'inactive') rec.stop();
      }, 350);
    };
    rev.onended = finish;
    guard = setTimeout(finish, (dur * 2 + 2) * 1000);
  });
}

async function saveVideo() {
  if (!forwardBuffer || rendering) return;

  const name = randomId(12) + (pickVideoMime().includes('mp4') ? '.mp4' : '.webm');

  // Second tap: the rendered video is ready and this tap is a fresh
  // user gesture, which the share sheet requires.
  if (savedBlob) {
    const file = new File([savedBlob], name, { type: savedBlob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch (_) { /* user cancelled */ }
    } else {
      downloadBlob(savedBlob, name);
    }
    return;
  }

  rendering = true;
  stopPlayback();
  btnForward.disabled = true;
  btnReverse.disabled = true;
  btnSave.disabled = true;
  audioCtx.resume();
  const secs = Math.ceil(forwardBuffer.duration * 2);
  setStatus(`Creating video… about ${secs}s`);

  try {
    savedBlob = await renderCombinedVideo();
    const file = new File([savedBlob], name, { type: savedBlob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      setStatus('Video ready — tap ⤓ to save');
      btnSave.textContent = '⤓';
    } else {
      downloadBlob(savedBlob, name);
      setStatus('');
    }
  } catch (err) {
    console.error(err);
    setStatus('Could not create video');
    setTimeout(() => setStatus(''), 2500);
  } finally {
    rendering = false;
    btnForward.disabled = false;
    btnReverse.disabled = false;
    btnSave.disabled = false;
  }
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ============================================================
// Footer id (gate screen): random chars + "o" + the trick card
// ============================================================

function setFooter() {
  // 15 chars (no "o"), then "o" as the marker, then the card code.
  const noise = randomId(15, 'abcdefghijklmnpqrstuvwxyz0123456789');
  $('gate-footer').textContent = `id:${noise}o${trickCard}`;
}

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
btnSave.addEventListener('click', saveVideo);

btnRetake.addEventListener('click', () => {
  if (rendering) return;
  releaseRecording();
  newPhrase();
  setState('live');
});

// Redo: discard the recording but keep the exact same words, and rewind
// the take counter so the decoy/trick/decoy sequence isn't advanced.
btnRedo.addEventListener('click', () => {
  if (rendering) return;
  takeCount--;
  releaseRecording();
  setState('live');
});

setFooter();
setState('gate');
