// 8-Bit Car Race — single-file game logic (canvas + vanilla JS, no build step)

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth || document.documentElement.clientWidth;
  canvas.height = window.innerHeight || document.documentElement.clientHeight;
}
window.addEventListener('resize', resize);
window.addEventListener('load', resize);
resize();

// real on-screen height of the touch control bar (0 if not present), so the
// game's own layout can leave room for it instead of drawing underneath it —
// this is what was breaking landscape, where the bar eats a big chunk of a
// short viewport
function touchControlsHeight() {
  const el = document.getElementById('touchControls');
  if (!el) return 0;
  const style = getComputedStyle(el);
  if (style.display === 'none') return 0;
  return el.getBoundingClientRect().height || 0;
}

// ---------- Constants ----------

const BASE_SPEED = 220;          // px/s auto-drive cruise speed
const RACE_SECONDS_AT_BASE = 110; // track length is defined by this: every stage is 1:50 at base (no-accel) speed
const TRACK_LENGTH = BASE_SPEED * RACE_SECONDS_AT_BASE;
const SIGNAL_TIME = 0.45;        // indicator-light warning before a traffic car actually starts steering
const STEER_SPEED = 520;         // px/s player's max lateral (steering) speed — free positioning, no lanes
const TRAFFIC_STEER_SPEED = 240; // traffic steers more gently than the player
const STEER_SMOOTH = 9;          // how quickly steering ramps up/down (higher = snappier, still smooth)
const BEST_TIME_KEY = 'carRace8bit_bestTime';
const GAME_TITLE = '8-BIT OVERDRIVE';
// Lotus Spyder gets deliberately denser traffic (fastest + one-touch-fatal car);
// tuned so a straight, no-input run spawns ~10 traffic cars in the first 10s.
let LOTUS_TRAFFIC_DIVISOR = 1.2;
let LOTUS_MIN_INTERVAL = 0.09;

// ---------- Car definitions ----------
// Assumption: Audi R8's color wasn't specified in the brief, so it defaults
// to a muted red (a common R8 color) — flagged here for Arnay to change if he wants.

const CARS = [
  {
    id: 'lotus',
    name: 'Lotus Spyder',
    color: '#c9b93a',
    accent: '#2a2a2a',
    maxSpeed: BASE_SPEED * 6.0,
    minSpeed: BASE_SPEED * 0.5,
    accel: 15840,
    brake: 300,
    lives: 1,          // any touch = instant game over
    shape: 'spyder',
    sound: { wave: 'sawtooth', freqMin: 220, freqMax: 900 } // bright, screamy small-engine rev
  },
  {
    id: 'cybertruck',
    name: 'Cyber Truck',
    color: '#9aa0a6',
    accent: '#1a1a1a',
    maxSpeed: BASE_SPEED * 3.9,
    minSpeed: BASE_SPEED * 0.5,
    accel: 6930,
    brake: 220,
    lives: 2,          // takes 2 touches to eliminate, everyone else takes 1
    shape: 'cybertruck',
    // electric whine: two sine waves slightly detuned so they beat against
    // each other, instead of one plain combustion-engine tone
    sound: { wave: 'sine', freqMin: 90, freqMax: 320, subWave: 'sine', subRatio: 1.015, subGain: 0.7 }
  },
  {
    id: 'audi',
    name: 'Audi R8',
    color: '#9c2a2f',
    accent: '#1a1a1a',
    maxSpeed: BASE_SPEED * 4.94,
    minSpeed: BASE_SPEED * 0.5,
    accel: 18480,        // quick but twitchy
    brake: 320,
    lives: 1,
    shape: 'coupe',
    // sawtooth snarl with a lower square-wave layer for a throatier growl
    sound: { wave: 'sawtooth', freqMin: 160, freqMax: 760, subWave: 'square', subRatio: 0.5, subGain: 0.4 }
  },
  {
    id: 'mercedes',
    name: 'Mercedes-Benz',
    color: '#2f6b46',
    accent: '#1a1a1a',
    maxSpeed: BASE_SPEED * 5.08,
    minSpeed: BASE_SPEED * 0.5,
    accel: 13860,        // balanced
    brake: 300,
    lives: 1,
    shape: 'sedan',
    sound: { wave: 'triangle', freqMin: 110, freqMax: 560 } // smooth, refined hum
  },
  {
    id: 'challenger',
    name: 'Dodge Challenger',
    color: '#33468f',
    accent: '#1a1a1a',
    maxSpeed: BASE_SPEED * 5.34,
    minSpeed: BASE_SPEED * 0.5,
    accel: 14850,        // powerful but heavy to steer
    brake: 260,
    lives: 1,
    shape: 'muscle',
    // deep square-wave growl plus a sub-octave sine for a muscle-car rumble
    sound: { wave: 'square', freqMin: 55, freqMax: 420, subWave: 'sine', subRatio: 0.5, subGain: 0.9 }
  }
];

const TRAFFIC_COLORS = ['#b4602b', '#6a4a95', '#c9c9c9', '#4a4a4a', '#3f8a90', '#a8456f'];
const TRAFFIC_SHAPES = ['coupe', 'sedan', 'muscle', 'spyder', 'van', 'suv'];

// ---------- Input ----------

const keys = {};
window.addEventListener('keydown', (e) => {
  ensureAudio();
  keys[e.key] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  handleMenuKey(e.key);
});
window.addEventListener('keyup', (e) => { keys[e.key] = false; });

// on-screen touch buttons — drive the same `keys` object as the keyboard,
// so touch/phone/tablet play works with zero changes to the game logic
function bindTouchButton(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  const press = (e) => {
    e.preventDefault();
    ensureAudio();
    keys[key] = true;
    el.classList.add('touchActive');
    if (state !== 'playing') handleMenuKey(key);
  };
  const release = (e) => { e.preventDefault(); keys[key] = false; el.classList.remove('touchActive'); };
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release);
}
bindTouchButton('btnUp', 'ArrowUp');
bindTouchButton('btnDown', 'ArrowDown');
bindTouchButton('btnLeft', 'ArrowLeft');
bindTouchButton('btnRight', 'ArrowRight');

// dedicated OK button — selects a car on the select screen, and returns to
// car selection from the game-over/finished screens (same as pressing Enter)
const btnOk = document.getElementById('btnOk');
if (btnOk) {
  btnOk.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ensureAudio();
    btnOk.classList.add('touchActive');
    handleMenuKey('Enter');
  });
  const releaseOk = () => btnOk.classList.remove('touchActive');
  btnOk.addEventListener('pointerup', releaseOk);
  btnOk.addEventListener('pointercancel', releaseOk);
  btnOk.addEventListener('pointerleave', releaseOk);
}

// ---------- Sound ----------
// Everything is generated on the fly with the Web Audio API — no sound
// files to download, so nothing to fetch or trust from the internet.

let audioCtx = null;
let engineOsc = null;
let engineGain = null;
let engineSubOsc = null;
let engineSubGain = null;

function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (state === 'title' || state === 'select') startMenuMusic();
}

// each car has its own waveform/frequency profile (see CARS) so they sound
// distinct — and some layer a second detuned/octave oscillator on top for a
// richer, less "single beep" engine tone
function startEngineSound() {
  ensureAudio();
  if (!audioCtx || !player) return;
  stopEngineSound();
  const profile = player.def.sound;

  engineOsc = audioCtx.createOscillator();
  engineOsc.type = profile.wave;
  engineOsc.frequency.value = profile.freqMin;
  engineGain = audioCtx.createGain();
  engineGain.gain.value = 0.045;
  engineOsc.connect(engineGain).connect(audioCtx.destination);
  engineOsc.start();

  if (profile.subWave) {
    engineSubOsc = audioCtx.createOscillator();
    engineSubOsc.type = profile.subWave;
    engineSubOsc.frequency.value = profile.freqMin * profile.subRatio;
    engineSubGain = audioCtx.createGain();
    engineSubGain.gain.value = 0.045 * profile.subGain;
    engineSubOsc.connect(engineSubGain).connect(audioCtx.destination);
    engineSubOsc.start();
  }
}

function stopEngineSound() {
  if (engineOsc) {
    try { engineOsc.stop(); } catch (err) { /* already stopped */ }
    engineOsc.disconnect();
    engineGain.disconnect();
  }
  if (engineSubOsc) {
    try { engineSubOsc.stop(); } catch (err) { /* already stopped */ }
    engineSubOsc.disconnect();
    engineSubGain.disconnect();
  }
  engineOsc = null;
  engineGain = null;
  engineSubOsc = null;
  engineSubGain = null;
}

// pitch + volume track the player's current speed and whether they're
// actively accelerating — each car's own waveform makes this read as a
// different "engine" instead of the same tone for every car
function updateEngineSound() {
  if (!engineOsc || !player || !audioCtx) return;
  const profile = player.def.sound;
  const speedRatio = Math.max(0, Math.min(1, (player.speed - player.def.minSpeed) / (player.def.maxSpeed - player.def.minSpeed)));
  const freq = profile.freqMin + speedRatio * (profile.freqMax - profile.freqMin);
  engineOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.05);
  const targetGain = keys['ArrowUp'] ? 0.09 : 0.045;
  engineGain.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.08);

  if (engineSubOsc) {
    engineSubOsc.frequency.setTargetAtTime(freq * profile.subRatio, audioCtx.currentTime, 0.05);
    engineSubGain.gain.setTargetAtTime(targetGain * profile.subGain, audioCtx.currentTime, 0.08);
  }
}

// ---------- Menu music ----------
// A small procedural EDM-style loop (kick + arpeggiated bass) for the title
// and car-select screens — generated live, same as the engine/crash sounds,
// so there's no audio file to fetch or bundle.

const EDM_BPM = 128;
const EDM_BEAT = 60 / EDM_BPM;
const EDM_BASS_PATTERN = [110, 110, 146.83, 130.81]; // A2, A2, D3, C3
let musicTimer = null;
let musicStep = 0;

function startMenuMusic() {
  if (musicTimer !== null || !audioCtx) return;
  musicStep = 0;
  scheduleMusicStep();
}

function stopMenuMusic() {
  if (musicTimer !== null) {
    clearTimeout(musicTimer);
    musicTimer = null;
  }
}

function scheduleMusicStep() {
  if (state !== 'title' && state !== 'select') {
    musicTimer = null;
    return;
  }
  if (!audioCtx) {
    musicTimer = setTimeout(scheduleMusicStep, 200);
    return;
  }
  const t = audioCtx.currentTime;

  // four-on-the-floor kick
  const kick = audioCtx.createOscillator();
  kick.type = 'sine';
  const kickGain = audioCtx.createGain();
  kick.frequency.setValueAtTime(150, t);
  kick.frequency.exponentialRampToValueAtTime(38, t + 0.15);
  kickGain.gain.setValueAtTime(0.4, t);
  kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  kick.connect(kickGain).connect(audioCtx.destination);
  kick.start(t);
  kick.stop(t + 0.2);

  // off-beat arpeggiated bass note
  const note = EDM_BASS_PATTERN[musicStep % EDM_BASS_PATTERN.length];
  const bass = audioCtx.createOscillator();
  bass.type = 'square';
  bass.frequency.value = note;
  const bassGain = audioCtx.createGain();
  const bassStart = t + EDM_BEAT * 0.5;
  bassGain.gain.setValueAtTime(0.001, bassStart);
  bassGain.gain.linearRampToValueAtTime(0.06, bassStart + 0.02);
  bassGain.gain.exponentialRampToValueAtTime(0.001, t + EDM_BEAT * 0.95);
  bass.connect(bassGain).connect(audioCtx.destination);
  bass.start(bassStart);
  bass.stop(t + EDM_BEAT);

  musicStep++;
  musicTimer = setTimeout(scheduleMusicStep, EDM_BEAT * 1000);
}

// short burst of filtered noise for a crash — no oscillator "beep" reads as
// an impact, so this uses white noise shaped with a decaying volume envelope
function playCrashSound() {
  ensureAudio();
  if (!audioCtx) return;
  const duration = 0.35;
  const bufferSize = Math.floor(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1100;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.4;
  noise.connect(filter).connect(gain).connect(audioCtx.destination);
  noise.start();
}

// ---------- Game state ----------

let state = 'title'; // 'title' | 'select' | 'playing' | 'gameover' | 'finished'
let selectedIndex = 0;
let player = null;
let traffic = [];
let spawnTimer = 0;
let elapsed = 0;
let bestTime = parseFloat(localStorage.getItem(BEST_TIME_KEY)) || null;
let lastFinishTime = null;
let deathReason = '';
let lastTs = null;

function handleMenuKey(key) {
  if (state === 'title') {
    if (key === 'Enter' || key === ' ') { state = 'select'; startMenuMusic(); }
  } else if (state === 'select') {
    if (key === 'ArrowLeft') selectedIndex = (selectedIndex - 1 + CARS.length) % CARS.length;
    if (key === 'ArrowRight') selectedIndex = (selectedIndex + 1) % CARS.length;
    if (key === 'Enter' || key === ' ') startRace(CARS[selectedIndex]);
  } else if (state === 'gameover' || state === 'finished') {
    if (key === 'Enter' || key === ' ') { state = 'select'; startMenuMusic(); }
  }
}

function startRace(carDef) {
  const { left, width } = roadBounds();
  player = {
    def: carDef,
    x: left + width / 2,
    vx: 0,
    speed: BASE_SPEED,
    s: 0,
    lives: carDef.lives,
    invuln: 0
  };
  traffic = [];
  spawnTimer = 0.6;
  elapsed = 0;
  deathReason = '';
  state = 'playing';
  stopMenuMusic();
  startEngineSound();
}

// ---------- Layout helpers ----------

function roadBounds() {
  const width = Math.min(canvas.width * 0.82, 900);
  const left = (canvas.width - width) / 2;
  return { left, width };
}

function carDimsFor() {
  const { width } = roadBounds();
  const w = width * 0.045;
  const h = w * 1.9;
  return { w, h };
}

// ---------- Traffic spawning & free-roam steering ----------

function difficultyProgress() {
  return Math.min(1, player.s / TRACK_LENGTH);
}

function xOccupied(targetX, sPos, excludeCar, checkPlayer = true) {
  const { w, h } = carDimsFor();
  const bufferS = h * 1.5;
  const bufferX = w * 1.4;
  for (const other of traffic) {
    if (other === excludeCar) continue;
    if (Math.abs(other.s - sPos) < bufferS && Math.abs(other.x - targetX) < bufferX) return true;
  }
  if (checkPlayer && player && Math.abs(player.s - sPos) < bufferS && Math.abs(player.x - targetX) < bufferX) return true;
  return false;
}

function spawnTraffic() {
  const { left, width } = roadBounds();
  const { w } = carDimsFor();
  const spawnS = player.s + canvas.height * 1.1 + Math.random() * 200;
  let x = left + w + Math.random() * (width - w * 2);
  for (let attempt = 0; attempt < 4 && xOccupied(x, spawnS, null); attempt++) {
    x = left + w + Math.random() * (width - w * 2);
  }
  const isFast = Math.random() < 0.5;
  const speed = isFast
    ? BASE_SPEED * (0.95 + Math.random() * 0.25)
    : BASE_SPEED * (0.45 + Math.random() * 0.25);
  const shape = TRAFFIC_SHAPES[Math.floor(Math.random() * TRAFFIC_SHAPES.length)];
  const color = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
  traffic.push({
    x, vx: 0, targetX: x, pendingTargetX: null, blinkTimer: 0, blinkDir: 0,
    speed, shape, color, s: spawnS
  });
}

function maybeSuddenMove(car, progress) {
  if (car.blinkTimer > 0) return;
  const chance = 0.07 + progress * 0.4;
  if (Math.random() < chance) {
    const { left, width } = roadBounds();
    const { w } = carDimsFor();

    // traffic increasingly tries to steer straight at the player, not just randomly
    const aggressiveChance = 0.3 + progress * 0.5;
    const engagementRange = canvas.height * 0.9;
    const canTargetPlayer = player && Math.abs(car.s - player.s) < engagementRange;

    let candidate, isAggressive = false;
    if (canTargetPlayer && Math.random() < aggressiveChance) {
      candidate = player.x;
      isAggressive = true;
    } else {
      const shift = (width * 0.25) * (Math.random() < 0.5 ? -1 : 1);
      candidate = car.x + shift;
    }
    candidate = Math.min(left + width - w, Math.max(left + w, candidate));

    // aggressive moves deliberately aim at the player, so don't let the
    // player's own position block the attack — only avoid other traffic
    if (!xOccupied(candidate, car.s, car, !isAggressive)) {
      car.pendingTargetX = candidate;
      car.blinkTimer = SIGNAL_TIME;
      car.blinkDir = candidate > car.x ? 1 : -1;
    }
  }
}

function steerToward(entity, targetX, maxSteerSpeed, dt) {
  const dx = targetX - entity.x;
  const desiredVX = Math.abs(dx) < 2 ? 0 : Math.sign(dx) * maxSteerSpeed;
  entity.vx += (desiredVX - entity.vx) * Math.min(1, STEER_SMOOTH * dt);
  entity.x += entity.vx * dt;
}

// ---------- Update ----------

function update(dt) {
  if (state !== 'playing') return;

  elapsed += dt;
  updateEngineSound();
  const progress = difficultyProgress();
  const { left, width } = roadBounds();
  const { w } = carDimsFor();

  // player longitudinal speed
  if (keys['ArrowUp']) {
    player.speed = Math.min(player.def.maxSpeed, player.speed + player.def.accel * dt);
  } else if (keys['ArrowDown']) {
    player.speed = Math.max(player.def.minSpeed, player.speed - player.def.brake * dt);
  } else {
    if (player.speed > BASE_SPEED) player.speed = Math.max(BASE_SPEED, player.speed - player.def.brake * 0.5 * dt);
    else if (player.speed < BASE_SPEED) player.speed = Math.min(BASE_SPEED, player.speed + player.def.accel * 0.5 * dt);
  }
  player.s += player.speed * dt;

  // free, smooth steering — player can sit anywhere on the road, including between lanes
  let desiredVX = 0;
  if (keys['ArrowLeft']) desiredVX -= STEER_SPEED;
  if (keys['ArrowRight']) desiredVX += STEER_SPEED;
  player.vx += (desiredVX - player.vx) * Math.min(1, STEER_SMOOTH * dt);
  player.x += player.vx * dt;
  player.x = Math.min(left + width - w / 2, Math.max(left + w / 2, player.x));

  if (player.invuln > 0) player.invuln -= dt;

  if (player.s >= TRACK_LENGTH) {
    finishRace();
    return;
  }

  spawnTimer -= dt;
  const baseInterval = 1.1 - progress * 0.85; // denser traffic for more of a challenge
  // Lotus Spyder is the fastest and most fragile car (one touch = game over),
  // so its run is made deliberately harder: traffic spawns more often.
  const isLotus = player.def.id === 'lotus';
  const interval = isLotus ? baseInterval / LOTUS_TRAFFIC_DIVISOR : baseInterval;
  const minInterval = isLotus ? LOTUS_MIN_INTERVAL : 0.28;
  if (spawnTimer <= 0) {
    spawnTraffic();
    spawnTimer = Math.max(minInterval, interval);
  }

  for (const car of traffic) {
    car.s += car.speed * dt;

    if (car.blinkTimer > 0) {
      car.blinkTimer -= dt;
      if (car.blinkTimer <= 0) {
        if (car.pendingTargetX !== null && !xOccupied(car.pendingTargetX, car.s, car)) {
          car.targetX = car.pendingTargetX;
        }
        car.pendingTargetX = null;
      }
    } else {
      maybeSuddenMove(car, progress);
    }

    steerToward(car, car.targetX, TRAFFIC_STEER_SPEED, dt);
    car.x = Math.min(left + width - w / 2, Math.max(left + w / 2, car.x));
  }
  traffic = traffic.filter(car => car.s > player.s - 400);

  checkCollisions();
}

function checkCollisions() {
  if (player.invuln > 0) return;
  const { w, h } = carDimsFor();

  for (const car of traffic) {
    const relY = car.s - player.s;
    if (Math.abs(relY) > h * 1.15) continue;
    if (Math.abs(car.x - player.x) > w * 1.05) continue;

    handleHit(); // touching from any side is a hit, no more side/rear distinction
    return; // one collision per frame is enough
  }
}

function handleHit() {
  const def = player.def;

  if (def.id === 'cybertruck') {
    // only the Cyber Truck can take a second hit
    player.lives -= 1;
    if (player.lives <= 0) {
      endRace('Two hits — that\'s all even a Cyber Truck can take!');
    } else {
      player.invuln = 1.2;
      player.speed = def.minSpeed;
      player.s = Math.max(0, player.s - 60);
    }
    return;
  }

  // everyone else: one touch, from any side, is game over
  endRace('One touch and you\'re out!');
}

function endRace(reason) {
  deathReason = reason;
  state = 'gameover';
  stopEngineSound();
  playCrashSound();
}

function finishRace() {
  lastFinishTime = elapsed;
  if (bestTime === null || elapsed < bestTime) {
    bestTime = elapsed;
    localStorage.setItem(BEST_TIME_KEY, String(bestTime));
  }
  state = 'finished';
  stopEngineSound();
}

// ---------- Drawing ----------

function drawRoad() {
  ctx.fillStyle = '#1a1a1a'; // near-black, slightly lighter grey background
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const { left, width } = roadBounds();
  ctx.fillStyle = '#242424';
  ctx.fillRect(left, 0, width, canvas.height);

  // visual lane guides only — movement itself is free/continuous, not locked to these
  ctx.fillStyle = '#d4c22a';
  const dashLen = 30, gap = 24;
  const scroll = player ? player.s % (dashLen + gap) : 0;
  for (let lane = 1; lane < 3; lane++) {
    const x = left + (width / 3) * lane - 2;
    for (let y = -dashLen + scroll; y < canvas.height; y += dashLen + gap) {
      ctx.fillRect(x, y, 4, dashLen);
    }
  }

  ctx.fillStyle = '#d4c22a';
  ctx.fillRect(left - 6, 0, 6, canvas.height);
  ctx.fillRect(left + width, 0, 6, canvas.height);
}

function drawFinishLine() {
  if (!player) return;
  const remaining = TRACK_LENGTH - player.s;
  if (remaining > canvas.height * 1.2) return;
  const { left, width } = roadBounds();
  const y = canvas.height - remaining;
  const checks = 14;
  const cw = width / checks;
  for (let i = 0; i < checks; i++) {
    ctx.fillStyle = (i % 2 === 0) ? '#ddd' : '#111';
    ctx.fillRect(left + i * cw, y, cw, 18);
  }
}

// blocky pixel-style car silhouettes — each brand distinct, everything kept within
// the car's own bounding box (no stray lines poking out past the body)
function drawCar(x, y, w, h, color, accent, shape, indicatorDir = 0) {
  ctx.save();
  ctx.translate(x, y);
  const hw = w / 2, hh = h / 2;

  function block(px, py, pw, ph, c) {
    ctx.fillStyle = c;
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, pw, ph);
  }

  if (shape === 'spyder') {
    // Lotus: narrow, low, pointed nose, open cockpit
    const bh = hw * 0.8;
    block(-bh * 0.6, -hh * 0.95, bh * 1.2, h * 0.16, color);
    block(-bh * 0.85, -hh * 0.7, bh * 1.7, h * 0.18, color);
    block(-bh, -hh * 0.45, bh * 2, h * 0.9, color);
    block(-bh * 0.75, hh * 0.45, bh * 1.5, h * 0.2, color);
    block(-bh * 0.4, -hh * 0.3, bh * 0.8, h * 0.35, accent);
    drawTires(bh, hh, w, h, ctx);
  } else if (shape === 'cybertruck') {
    // Cybertruck: flat angular panels, full-width blocky bed
    block(-hw * 0.85, -hh * 0.98, w * 0.85, h * 0.14, color);
    block(-hw, -hh * 0.84, w, h * 0.2, color);
    block(-hw, -hh * 0.64, w, h * 0.77, color);
    block(-hw * 0.9, -hh * 0.9, w * 0.6, h * 0.06, accent);
    block(-hw * 0.7, -hh * 0.5, w * 0.4, h * 0.22, accent);
    drawTires(hw, hh, w, h, ctx);
  } else if (shape === 'coupe') {
    // Audi: narrow nose, wide rear haunches, side blade accent
    block(-hw * 0.5, -hh * 0.95, w * 0.5, h * 0.16, color);
    block(-hw * 0.65, -hh * 0.75, w * 0.65, h * 0.2, color);
    block(-hw * 0.95, -hh * 0.5, w * 0.95, h * 0.85, color);
    block(-hw * 0.8, hh * 0.35, w * 0.8, h * 0.2, color);
    block(-hw * 0.4, -hh * 0.55, w * 0.4, h * 0.4, accent);
    block(-hw * 0.9, -hh * 0.1, w * 0.1, h * 0.5, accent);
    drawTires(hw, hh, w, h, ctx);
  } else if (shape === 'sedan') {
    // Mercedes: long elegant hood, smooth roofline, small badge dot
    block(-hw * 0.6, -hh * 0.95, w * 0.6, h * 0.2, color);
    block(-hw * 0.7, -hh * 0.75, w * 0.7, h * 0.18, color);
    block(-hw * 0.55, -hh * 0.55, w * 0.55, h * 0.35, accent);
    block(-hw * 0.85, -hh * 0.2, w * 0.85, h * 0.75, color);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(-w * 0.04, -hh * 0.97, w * 0.08, w * 0.08);
    drawTires(hw, hh, w, h, ctx);
  } else if (shape === 'muscle') {
    // Challenger: broad flat hood + scoop, center racing stripe, rear spoiler
    block(-hw * 0.95, -hh * 0.85, w * 0.95, h * 0.3, color);
    block(-hw * 0.18, -hh * 0.95, w * 0.18, h * 0.15, accent);
    block(-hw * 0.55, -hh * 0.55, w * 0.55, h * 0.28, color);
    block(-hw, -hh * 0.27, w, h * 0.95, color);
    block(-w * 0.06, -hh * 0.85, w * 0.12, h * 1.5, accent);
    block(-hw * 0.95, hh * 0.62, w * 0.95, h * 0.08, '#111');
    drawTires(hw, hh, w, h, ctx);
  } else if (shape === 'van') {
    // boxy delivery van: flat-fronted, tall full-width body
    block(-hw * 0.92, -hh * 0.9, w * 0.92, h * 0.9, color);
    block(-hw * 0.55, -hh * 0.75, w * 0.55, h * 0.1, accent);
    block(-hw * 0.5, hh * 0.6, w * 0.5, h * 0.075, '#111');
    drawTires(hw, hh, w, h, ctx);
  } else if (shape === 'suv') {
    // tall, bulky SUV: flat roof, upright stance
    block(-hw * 0.75, -hh * 0.95, w * 0.75, h * 0.1, color);
    block(-hw * 0.9, -hh * 0.75, w * 0.9, h * 0.775, color);
    block(-hw * 0.6, -hh * 0.55, w * 0.6, h * 0.2, accent);
    block(-hw * 0.75, hh * 0.8, w * 0.75, h * 0.06, '#111');
    drawTires(hw, hh, w, h, ctx);
  }

  ctx.restore();

  if (indicatorDir !== 0 && Math.floor(elapsed * 6) % 2 === 0) {
    const size = w * 0.16;
    const lx = indicatorDir < 0 ? x - hw - size * 0.2 : x + hw - size * 0.8;
    const ly = y - hh + h * 0.08;
    ctx.fillStyle = '#ffb300';
    ctx.fillRect(lx, ly, size, size);
  }
}

// tires flush inside the given half-width, kept fully inside the body silhouette
function drawTires(halfWidth, hh, w, h, c) {
  const tireW = Math.min(w, halfWidth * 2) * 0.22;
  const tireH = h * 0.16;
  const hub = tireW * 0.4;
  const frontY = -hh * 0.42, rearY = hh * 0.26;
  c.fillStyle = '#111';
  [frontY, rearY].forEach(ty => {
    c.fillRect(-halfWidth, ty, tireW, tireH);
    c.fillRect(halfWidth - tireW, ty, tireW, tireH);
  });
  c.fillStyle = '#888';
  [frontY, rearY].forEach(ty => {
    c.fillRect(-halfWidth + tireW * 0.3, ty + tireH * 0.3, hub, hub);
    c.fillRect(halfWidth - tireW + tireW * 0.3, ty + tireH * 0.3, hub, hub);
  });
}

// big head-on "front profile" hero car for the title screen — a sleek red
// sports-car silhouette, distinct from the top-down gameplay sprites
function drawFrontCar(cx, cy, w, h) {
  ctx.save();
  ctx.translate(cx, cy);
  const hw = w / 2, hh = h / 2;

  function block(px, py, pw, ph, c) {
    ctx.fillStyle = c;
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, pw, ph);
  }

  // draws a block on the left, plus its exact mirror on the right — the only
  // way to guarantee left/right symmetry instead of hand-matching two sets
  // of coordinates (which is how the grille/headlights drifted off-center)
  function blockPair(px, py, pw, ph, c) {
    block(px, py, pw, ph, c);
    block(-(px + pw), py, pw, ph, c);
  }

  const red = '#c81d25';
  const darkRed = '#7e1015';

  // low wide front splitter / bumper
  block(-hw, hh * 0.55, w, h * 0.18, darkRed);
  // main wide fascia
  block(-hw * 0.95, hh * 0.1, w * 0.95, h * 0.5, red);
  // sloped hood, narrowing toward the windshield
  block(-hw * 0.75, -hh * 0.25, w * 0.75, h * 0.4, red);
  // windshield, dark and narrower still — the "far away" part of the car
  block(-hw * 0.5, -hh * 0.55, w * 0.5, h * 0.35, '#1a232b');
  // roofline cap
  block(-hw * 0.32, -hh * 0.68, w * 0.32, h * 0.16, red);

  // headlights, angled toward the outer edges — mirrored so they match exactly
  blockPair(-hw * 0.95, hh * 0.02, w * 0.22, h * 0.16, '#f2e9c9');

  // grille / air intake, centered low (centered = -halfWidth to +halfWidth)
  block(-w * 0.28, hh * 0.32, w * 0.56, h * 0.22, '#111');

  // side mirrors, mirrored so they sit at equal distance from center
  blockPair(-hw * 1.05, -hh * 0.1, w * 0.1, h * 0.12, darkRed);

  // tires peeking out from under the wide body on both sides
  const tireW = w * 0.14, tireH = h * 0.22;
  ctx.fillStyle = '#111';
  ctx.fillRect(-hw - tireW * 0.5, hh * 0.68, tireW, tireH);
  ctx.fillRect(hw - tireW * 0.5, hh * 0.68, tireW, tireH);

  ctx.restore();
}

// scales HUD text/bar sizing up a bit on small phone screens, down a bit on
// huge desktop monitors, so it reads reasonably at any device size
function uiScale() {
  return Math.max(0.85, Math.min(1.35, canvas.width / 480));
}

function drawHUD() {
  const s = uiScale();
  ctx.fillStyle = '#ddd';
  ctx.font = `${Math.round(16 * s)}px monospace`;
  ctx.textAlign = 'left';

  const t = elapsed.toFixed(2);
  ctx.fillText(`TIME: ${t}s`, 16 * s, 26 * s);
  ctx.fillText(`BEST: ${bestTime !== null ? bestTime.toFixed(2) + 's' : '--'}`, 16 * s, 48 * s);

  if (player) {
    const barX = 16 * s, barY = 70 * s, barW = 160 * s, barH = 14 * s;
    ctx.strokeStyle = '#ccc';
    ctx.strokeRect(barX, barY, barW, barH);
    const pct = Math.max(0, Math.min(1, (player.speed - player.def.minSpeed) / (player.def.maxSpeed - player.def.minSpeed)));
    let barColor = '#4a8f52';
    if (keys['ArrowUp']) barColor = '#c9a324';
    if (keys['ArrowDown']) barColor = '#a13c34';
    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, barW * pct, barH);
    ctx.fillStyle = '#ddd';
    ctx.fillText(`SPEED ${Math.round(player.speed)}`, barX, barY + barH + 16 * s);

    if (player.def.lives > 1) {
      ctx.fillText(`LIVES: ${player.lives}`, barX, barY + barH + 38 * s);
    }

    ctx.textAlign = 'right';
    ctx.fillText(`${player.def.name}`, canvas.width - 16 * s, 26 * s);
    ctx.textAlign = 'left';
  }
}

function drawTitle() {
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // diagonal speed-line stripes behind everything, for a bit of motion energy
  ctx.strokeStyle = 'rgba(201, 179, 58, 0.12)';
  ctx.lineWidth = 18;
  for (let x = -canvas.height; x < canvas.width + canvas.height; x += 70) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - canvas.height, canvas.height);
    ctx.stroke();
  }

  // reserve real room for the touch control bar so the prompt/footer never
  // sit underneath it — this is what was breaking landscape
  const reserveBottom = Math.max(50, touchControlsHeight() + 14);
  const availableH = canvas.height - reserveBottom;

  // sized off the SMALLER of width/height so a short landscape screen
  // doesn't get a hero car too big to fit, or text pushed off-screen
  const carW = Math.min(220, canvas.width * 0.32, availableH * 0.42);
  const carH = carW * 0.9;
  const carCenterY = Math.min(canvas.height * 0.42, availableH * 0.48);
  drawFrontCar(canvas.width / 2, carCenterY, carW, carH);

  ctx.textAlign = 'center';
  const titleY = Math.max(carH * 0.5 + 10, carCenterY - carH * 0.75);
  const titleSize = Math.min(52, canvas.width * 0.085, availableH * 0.13);
  ctx.font = `bold ${titleSize}px monospace`;
  ctx.fillStyle = '#7e1015'; // drop shadow for a bit of arcade-marquee punch
  ctx.fillText(GAME_TITLE, canvas.width / 2 + 3, titleY + 3);
  ctx.fillStyle = '#f5d90a';
  ctx.fillText(GAME_TITLE, canvas.width / 2, titleY);

  ctx.fillStyle = '#999';
  ctx.font = '15px monospace';
  ctx.fillText('a retro dodge-the-traffic racer', canvas.width / 2, titleY + 28);

  const blinkOn = lastTs !== null ? Math.floor(lastTs / 500) % 2 === 0 : true;
  if (blinkOn) {
    ctx.fillStyle = '#ddd';
    ctx.font = '16px monospace';
    ctx.fillText('PRESS ENTER OR OK TO START', canvas.width / 2, canvas.height - reserveBottom + 20);
  }

  ctx.fillStyle = '#666';
  ctx.font = '12px monospace';
  ctx.fillText('made for Arnay', canvas.width / 2, canvas.height - reserveBottom + 38);
}

function drawSelect() {
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#ddd';
  ctx.textAlign = 'center';
  const headerSize = Math.max(16, Math.min(28, canvas.width * 0.055));
  ctx.font = `${Math.round(headerSize)}px monospace`;
  ctx.fillText('SELECT YOUR CAR', canvas.width / 2, headerSize + 16);
  const subSize = Math.max(10, Math.min(14, canvas.width * 0.03));
  ctx.font = `${Math.round(subSize)}px monospace`;
  ctx.fillText('<- -> to choose   ENTER to race', canvas.width / 2, headerSize + subSize + 24);
  const headerBottom = headerSize + subSize + 34;

  // leave real room for the touch control bar (and a little breathing room
  // for the two footer text lines) — this is what keeps landscape sane
  const footerH = 46;
  const reserveBottom = Math.max(footerH, touchControlsHeight() + 12);
  const availableH = Math.max(70, canvas.height - headerBottom - reserveBottom);
  const availableW = Math.max(120, canvas.width - 24);

  // fall back to 2 rows once a single row would squeeze each car below a
  // sane minimum width — this is what fixes "can't see the 5 cars" on phones
  const minCarW = 30;
  const fitsOneRow = availableW / CARS.length >= minCarW + 36;
  const columns = fitsOneRow ? CARS.length : Math.ceil(CARS.length / 2);
  const rows = Math.ceil(CARS.length / columns);

  const spacingX = availableW / columns;
  const rowH = availableH / rows;
  const carW = Math.max(minCarW, Math.min(56, spacingX * 0.5, rowH * 0.33));
  const carH = carW * 1.857;
  const rowSpacingY = Math.min(rowH, carH + 54);
  const gridStartY = headerBottom + (availableH - rowSpacingY * rows) / 2 + rowSpacingY / 2;

  CARS.forEach((car, i) => {
    const row = Math.floor(i / columns);
    const itemsInRow = Math.min(columns, CARS.length - row * columns);
    const rowStartX = canvas.width / 2 - spacingX * (itemsInRow - 1) / 2;
    const x = rowStartX + (i % columns) * spacingX;
    const y = gridStartY + row * rowSpacingY;

    const isSelected = i === selectedIndex;
    // every car gets its own visible box so none of them disappear into the
    // background — the selected one just gets a brighter, thicker outline
    ctx.strokeStyle = isSelected ? '#c9b93a' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = isSelected ? 3 : 1.5;
    ctx.strokeRect(x - carW / 2 - 8, y - carH / 2 - 10, carW + 16, carH + 20);
    drawCar(x, y, carW, carH, car.color, car.accent, car.shape);
    ctx.fillStyle = isSelected ? '#c9b93a' : '#888';
    ctx.font = `${Math.max(9, Math.round(carW * 0.2))}px monospace`;
    ctx.fillText(car.name, x, y + carH / 2 + Math.max(13, carW * 0.28));
  });

  const car = CARS[selectedIndex];
  const footerY = canvas.height - reserveBottom;
  ctx.fillStyle = '#ccc';
  ctx.font = `${Math.round(subSize)}px monospace`;
  const info = car.id === 'cybertruck'
    ? `Top speed: ${Math.round(car.maxSpeed)}   Survives 2 hits`
    : `Top speed: ${Math.round(car.maxSpeed)}   One touch = game over`;
  ctx.fillText(info, canvas.width / 2, footerY + 20);
  ctx.fillText(bestTime !== null ? `Best time ever: ${bestTime.toFixed(2)}s` : 'No best time yet', canvas.width / 2, footerY + 36);
}

function drawOverlayMessage(lines) {
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ddd';
  ctx.textAlign = 'center';
  ctx.font = '26px monospace';
  lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, canvas.height / 2 - 20 + i * 34));
  ctx.font = '14px monospace';
  ctx.fillText('ENTER for car select', canvas.width / 2, canvas.height / 2 + 20 + lines.length * 34);
}

function drawRetroWash() {
  // muted/desaturated wash for a less-vibrant retro feel while racing
  ctx.fillStyle = 'rgba(20,18,16,0.3)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function draw() {
  if (state === 'title') {
    drawTitle();
    return;
  }
  if (state === 'select') {
    drawSelect();
    return;
  }

  drawRoad();
  drawFinishLine();

  if (player) {
    const { w, h } = carDimsFor();
    // keep the player above the touch control bar instead of drawing
    // underneath it — matters most in landscape, where the bar eats a much
    // bigger share of a short viewport
    const playerY = Math.min(canvas.height * 0.8, canvas.height - touchControlsHeight() - h * 0.7);
    for (const car of traffic) {
      const y = playerY - (car.s - player.s);
      if (y < -h || y > canvas.height + h) continue;
      const indicatorDir = car.blinkTimer > 0 ? car.blinkDir : (Math.abs(car.vx) > 15 ? Math.sign(car.vx) : 0);
      drawCar(car.x, y, w, h, car.color, '#222', car.shape, indicatorDir);
    }
    const flashHidden = player.invuln > 0 && Math.floor(elapsed * 10) % 2 === 0;
    if (!flashHidden) {
      const playerIndicatorDir = Math.abs(player.vx) > 15 ? Math.sign(player.vx) : 0;
      drawCar(player.x, playerY, w, h, player.def.color, player.def.accent, player.def.shape, playerIndicatorDir);
    }
  }

  drawRetroWash();
  drawHUD();

  if (state === 'gameover') drawOverlayMessage(['GAME OVER', deathReason]);
  if (state === 'finished') drawOverlayMessage(['FINISHED!', `Time: ${lastFinishTime.toFixed(2)}s`]);
}

// ---------- Main loop ----------

function loop(ts) {
  if (canvas.width === 0 || canvas.height === 0) resize();
  if (lastTs === null) lastTs = ts;
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
