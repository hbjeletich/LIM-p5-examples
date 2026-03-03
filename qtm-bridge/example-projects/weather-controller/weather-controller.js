// ===== CONFIGURATION =====
const BRIDGE_IP = '192.168.10.3';
const BRIDGE_PORT = 8080;
const OBJECT_NAME = 'bolt';

// QTM tracking volume dimensions (in mm)
const VOLUME_WIDTH = 8200;
const VOLUME_HEIGHT = 2500; // height of the room

// ===== CONNECTION =====
let bodies = {};
let socket;
let connected = false;

// ===== MOVEMENT TRACKING =====
let prevX = 0;
let prevZ = 0;
let velocity = 0;
let smoothVelocity = 0;

// ===== WAND BUBBLE =====
let bubbleX = 0;
let bubbleY = 0;
let bubbleTargetX = 0;
let bubbleTargetY = 0;
const BUBBLE_RADIUS = 60;
let bubbleGlow = 0;
let bubblePulse = 0;

// ===== WEATHER STATE =====
let raindrops = [];
let splashes = [];
let lightning = 0;
let thunderTimer = 0;
let lightningBolts = [];
let lightningTargetX = 0;
let lightningTargetY = 0;

// ===== CLOUDS =====
let clouds = [];

// ===== COLOR PALETTE =====
// shifts with storm intensity
let hueShift = 0;

// ===== AUDIO =====
let audioCtx = null;
let audioInitialized = false;
let showAudioPrompt = true;

// rain layers
let rainNoiseSource = null;
let rainGain = null;
let rainFilter = null;
let stormNoiseSource = null;
let stormGain = null;
let stormFilter = null;

// raindrop patter
let patterGain = null;

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);

  bubbleX = width / 2;
  bubbleY = height / 2;
  bubbleTargetX = width / 2;
  bubbleTargetY = height / 2;

  // init clouds
  for (let i = 0; i < 8; i++) {
    clouds.push(createCloud(random(width)));
  }

  // connect to websocket sending QTM data
  // don't change this!
  socket = new WebSocket(`ws://${BRIDGE_IP}:${BRIDGE_PORT}`);
  socket.onopen = () => { connected = true; };
  socket.onmessage = (e) => {
    let data = JSON.parse(e.data);
    if (data.bodies) bodies = data.bodies;
  };
  socket.onclose = () => {
    connected = false;
    setTimeout(() => location.reload(), 2000);
  };
}

// ===== CLOUD FACTORY =====
function createCloud(startX) {
  // each cloud is a cluster of overlapping puffs
  let baseY = random(height * 0.03, height * 0.28);
  let baseW = random(200, 500);
  let numPuffs = floor(random(5, 12));
  let puffs = [];

  for (let j = 0; j < numPuffs; j++) {
    // puffs cluster around center, biased upward
    let px = random(-baseW * 0.4, baseW * 0.4);
    let py = random(-baseW * 0.08, baseW * 0.06);
    // larger puffs near center, smaller at edges
    let distFromCenter = abs(px) / (baseW * 0.4);
    let puffR = baseW * random(0.12, 0.28) * (1 - distFromCenter * 0.5);
    // noise seed unique to this puff for organic deformation
    let nSeed = random(1000);
    puffs.push({ ox: px, oy: py, r: puffR, nSeed: nSeed });
  }

  return {
    x: startX,
    y: baseY,
    w: baseW,
    speed: random(0.15, 0.7),
    opacity: random(35, 65),
    puffs: puffs,
    nOffset: random(1000), // per-cloud noise animation offset
  };
}

// ============================================================
// AUDIO SYSTEM - all procedural, no samples needed
// ============================================================

function initAudio() {
  if (audioInitialized) return;

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.warn('Web Audio API not supported');
    return;
  }

  // --- RAIN LAYER 1: light patter (higher freq white noise) ---
  rainNoiseSource = createNoiseNode(audioCtx);
  rainFilter = audioCtx.createBiquadFilter();
  rainFilter.type = 'bandpass';
  rainFilter.frequency.value = 3000;
  rainFilter.Q.value = 0.5;
  rainGain = audioCtx.createGain();
  rainGain.gain.value = 0;

  rainNoiseSource.connect(rainFilter);
  rainFilter.connect(rainGain);
  rainGain.connect(audioCtx.destination);

  // --- RAIN LAYER 2: storm roar (lower freq noise) ---
  stormNoiseSource = createNoiseNode(audioCtx);
  stormFilter = audioCtx.createBiquadFilter();
  stormFilter.type = 'lowpass';
  stormFilter.frequency.value = 400;
  stormFilter.Q.value = 0.3;
  stormGain = audioCtx.createGain();
  stormGain.gain.value = 0;

  // warmth resonance on the storm layer
  let stormWarmth = audioCtx.createBiquadFilter();
  stormWarmth.type = 'peaking';
  stormWarmth.frequency.value = 150;
  stormWarmth.gain.value = 6;
  stormWarmth.Q.value = 0.8;

  stormNoiseSource.connect(stormFilter);
  stormFilter.connect(stormWarmth);
  stormWarmth.connect(stormGain);
  stormGain.connect(audioCtx.destination);

  // --- PATTER: master gain for bubble-hit ticks ---
  patterGain = audioCtx.createGain();
  patterGain.gain.value = 0.3;
  patterGain.connect(audioCtx.destination);

  audioInitialized = true;
  showAudioPrompt = false;
  console.log('Audio initialized');
}

function createNoiseNode(ctx) {
  // 2-second looping white noise buffer
  let bufferSize = ctx.sampleRate * 2;
  let buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  let data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  let node = ctx.createBufferSource();
  node.buffer = buffer;
  node.loop = true;
  node.start();
  return node;
}

function updateAudio(stormLevel) {
  if (!audioInitialized || !audioCtx) return;

  let now = audioCtx.currentTime;

  // light rain layer - fades in with movement, brightens with speed
  let rainVol = map(stormLevel, 0, 0.5, 0, 0.12, true);
  let rainFreq = map(stormLevel, 0, 1, 4000, 2000, true);
  rainGain.gain.setTargetAtTime(rainVol, now, 0.3);
  rainFilter.frequency.setTargetAtTime(rainFreq, now, 0.3);
  rainFilter.Q.setTargetAtTime(map(stormLevel, 0, 1, 0.8, 0.2, true), now, 0.3);

  // storm roar layer - kicks in at higher intensities
  let stormVol = map(stormLevel, 0.3, 1, 0, 0.18, true);
  let stormFreq = map(stormLevel, 0.3, 1, 300, 800, true);
  stormGain.gain.setTargetAtTime(stormVol, now, 0.4);
  stormFilter.frequency.setTargetAtTime(stormFreq, now, 0.4);
}

function triggerThunder(intensity) {
  // intensity 0-1: controls volume, duration, and character
  if (!audioInitialized || !audioCtx) return;

  let now = audioCtx.currentTime;

  // === CRACK: sharp high-freq noise burst ===
  let crackLen = 0.15;
  let crackBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * crackLen, audioCtx.sampleRate);
  let crackData = crackBuffer.getChannelData(0);
  for (let i = 0; i < crackData.length; i++) {
    let t = i / crackData.length;
    let env = t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) * 12);
    crackData[i] = (Math.random() * 2 - 1) * env;
  }
  let crackSource = audioCtx.createBufferSource();
  crackSource.buffer = crackBuffer;

  let crackFilter = audioCtx.createBiquadFilter();
  crackFilter.type = 'highpass';
  crackFilter.frequency.value = 2000;
  crackFilter.Q.value = 0.5;

  let crackGain = audioCtx.createGain();
  crackGain.gain.value = 0.25 * intensity;

  crackSource.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(audioCtx.destination);
  crackSource.start(now);

  // === RUMBLE: long low-frequency rolling noise ===
  let rumbleDuration = 1.0 + intensity * 2.0;
  let rumbleBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * rumbleDuration, audioCtx.sampleRate);
  let rumbleData = rumbleBuffer.getChannelData(0);
  for (let i = 0; i < rumbleData.length; i++) {
    let t = i / rumbleData.length;
    let env = Math.sin(t * Math.PI * 0.5) * Math.exp(-t * 2.5);
    rumbleData[i] = (Math.random() * 2 - 1) * env;
  }
  let rumbleSource = audioCtx.createBufferSource();
  rumbleSource.buffer = rumbleBuffer;

  let rumbleFilter = audioCtx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 200 + intensity * 100;
  rumbleFilter.Q.value = 0.7;

  let rumbleResonance = audioCtx.createBiquadFilter();
  rumbleResonance.type = 'peaking';
  rumbleResonance.frequency.value = 80;
  rumbleResonance.gain.value = 8;
  rumbleResonance.Q.value = 1.5;

  let rumbleGain = audioCtx.createGain();
  rumbleGain.gain.value = 0.35 * intensity;

  rumbleSource.connect(rumbleFilter);
  rumbleFilter.connect(rumbleResonance);
  rumbleResonance.connect(rumbleGain);
  rumbleGain.connect(audioCtx.destination);
  rumbleSource.start(now + 0.04); // slight delay after crack

  // === TONE SWEEP: falling pitch for that "strike" impact ===
  let osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);

  let oscGain = audioCtx.createGain();
  oscGain.gain.setValueAtTime(0.12 * intensity, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  osc.connect(oscGain);
  oscGain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.7);
}

function triggerPatter() {
  // tiny pitched tick for a raindrop hitting the bubble
  if (!audioInitialized || !audioCtx || !patterGain) return;

  let now = audioCtx.currentTime;

  let osc = audioCtx.createOscillator();
  osc.type = 'sine';
  let freq = 800 + Math.random() * 2000;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.3, now + 0.04);

  let tickGain = audioCtx.createGain();
  tickGain.gain.setValueAtTime(0.06 + Math.random() * 0.04, now);
  tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  osc.connect(tickGain);
  tickGain.connect(patterGain);
  osc.start(now);
  osc.stop(now + 0.06);
}


// ============================================================
// MAIN DRAW
// ============================================================

function draw() {
  let wand = bodies[OBJECT_NAME];

  if (wand && wand.isTracked) {
    let x = wand.position.x;
    let z = wand.position.z;

    // map QTM coords to screen
    bubbleTargetX = map(x, -VOLUME_WIDTH / 2, VOLUME_WIDTH / 2, 0, width);
    bubbleTargetY = map(z, VOLUME_HEIGHT, 0, 0, height);

    // velocity
    velocity = dist(x, z, prevX, prevZ);
    smoothVelocity = lerp(smoothVelocity, velocity, 0.2);

    // lightning strike toward the bubble
    if (velocity > 150) {
      lightning = 100;
      thunderTimer = 10 + random(20);
      spawnLightningBolt(bubbleX, bubbleY);
      bubbleGlow = 100;
      // thunder sound scales with how violent the gesture was
      triggerThunder(map(velocity, 150, 400, 0.5, 1.0, true));
    }

    prevX = x;
    prevZ = z;
  }

  // smooth bubble movement
  bubbleX = lerp(bubbleX, bubbleTargetX, 0.12);
  bubbleY = lerp(bubbleY, bubbleTargetY, 0.12);
  bubblePulse += 0.05;

  // storm intensity 0-1
  let stormLevel = map(smoothVelocity, 0, 100, 0, 1, true);
  hueShift = frameCount * 0.3;

  // update audio each frame
  updateAudio(stormLevel);

  // ===== SKY =====
  drawSky(stormLevel);

  // ===== CLOUDS =====
  drawClouds(stormLevel);

  // ===== LIGHTNING FLASH =====
  if (lightning > 0) {
    drawingContext.fillStyle = `hsla(220, 60%, 95%, ${lightning / 100 * 0.6})`;
    drawingContext.fillRect(0, 0, width, height);
    lightning *= 0.88;
    if (lightning < 1) lightning = 0;
  }

  // ===== LIGHTNING BOLTS =====
  drawLightningBolts();

  // ===== RAIN =====
  spawnRain(stormLevel);
  updateAndDrawRain(stormLevel);

  // ===== SPLASHES =====
  updateAndDrawSplashes();

  // ===== WAND BUBBLE =====
  //drawBubble(stormLevel);

  // ===== AUDIO PROMPT =====
  if (showAudioPrompt) drawAudioPrompt();

  // ===== DEBUG INFO =====
  drawInfo(wand, stormLevel);
}


// ============================================================
// AUDIO PROMPT
// ============================================================

function drawAudioPrompt() {
  fill(0, 0, 0, 40);
  rect(0, 0, width, height);

  let bw = 340;
  let bh = 70;
  let bx = width / 2 - bw / 2;
  let by = height / 2 + 140;

  fill(0, 0, 15, 85);
  stroke(0, 0, 60, 40);
  strokeWeight(1);
  rect(bx, by, bw, bh, 12);

  fill(0, 0, 100, 90);
  noStroke();
  textSize(16);
  textAlign(CENTER, CENTER);
  textFont('monospace');
  text('click anywhere to enable sound', width / 2, by + bh / 2);
}

// browser requires a user gesture to start AudioContext
function mousePressed() {
  if (!audioInitialized) {
    initAudio();
  }
}

function keyPressed() {
  if (!audioInitialized) {
    initAudio();
  }
}


// ============================================================
// VISUALS
// ============================================================

function drawSky(stormLevel) {
  // gradient from top to bottom, shifting with storm
  let calmTopH = 210, calmTopS = 35, calmTopB = 55;
  let calmBotH = 230, calmBotS = 20, calmBotB = 30;
  let stormTopH = 250, stormTopS = 50, stormTopB = 18;
  let stormBotH = 220, stormBotS = 40, stormBotB = 10;

  let topH = lerp(calmTopH, stormTopH, stormLevel);
  let topS = lerp(calmTopS, stormTopS, stormLevel);
  let topB = lerp(calmTopB, stormTopB, stormLevel);
  let botH = lerp(calmBotH, stormBotH, stormLevel);
  let botS = lerp(calmBotS, stormBotS, stormLevel);
  let botB = lerp(calmBotB, stormBotB, stormLevel);

  noStroke();
  let steps = 40;
  for (let i = 0; i < steps; i++) {
    let t = i / steps;
    let y = t * height;
    let h = height / steps + 1;
    fill(
      lerp(topH, botH, t),
      lerp(topS, botS, t),
      lerp(topB, botB, t)
    );
    rect(0, y, width, h);
  }
}

// ===== CLOUDS =====
function drawClouds(stormLevel) {
  let time = frameCount * 0.008;

  for (let c of clouds) {
    c.x += c.speed * (1 + stormLevel * 3);
    if (c.x > width + c.w) {
      // recycle cloud with new shape
      let recycled = createCloud(-c.w);
      c.puffs = recycled.puffs;
      c.x = -c.w;
      c.y = recycled.y;
      c.w = recycled.w;
      c.nOffset = recycled.nOffset;
    }

    let darkness = lerp(80, 25, stormLevel);
    let op = lerp(c.opacity, c.opacity * 1.5, stormLevel);

    noStroke();

    // draw each puff as a noise-deformed organic blob
    for (let p of c.puffs) {
      let cx = c.x + p.ox;
      let cy = c.y + p.oy;

      // multiple transparency layers for soft volumetric feel
      let layers = 3;
      for (let layer = 0; layer < layers; layer++) {
        let layerR = p.r * (0.7 + layer * 0.2);
        let layerAlpha = min(op, 80) * map(layer, 0, layers - 1, 0.5, 0.15);

        // slightly different brightness per layer for depth
        let layerBright = darkness + layer * 3;
        fill(220, 15, layerBright, layerAlpha);

        beginShape();
        let pts = 24;
        for (let i = 0; i <= pts; i++) {
          let angle = map(i, 0, pts, 0, TWO_PI);
          let nv = noise(
            p.nSeed + cos(angle) * 1.5,
            p.nSeed + sin(angle) * 1.5,
            time + c.nOffset + layer * 0.4
          );
          // organic deformation — more on the horizontal axis for cloud-like stretch
          let rx = layerR * (0.6 + nv * 0.7) * 1.3;
          let ry = layerR * (0.5 + nv * 0.6);
          curveVertex(cx + cos(angle) * rx, cy + sin(angle) * ry);
        }
        endShape(CLOSE);
      }
    }

    // soft underbelly glow during storms (lit from lightning)
    if (stormLevel > 0.3 && lightning > 5) {
      let glowAlpha = map(lightning, 5, 100, 0, 15) * stormLevel;
      fill(220, 20, 95, glowAlpha);
      noStroke();
      for (let p of c.puffs) {
        ellipse(c.x + p.ox, c.y + p.oy + p.r * 0.3, p.r * 1.6, p.r * 0.8);
      }
    }
  }
}

// ===== LIGHTNING BOLT GENERATION =====
function spawnLightningBolt(targetX, targetY) {
  // bolt starts from a random point at the top, strikes toward the bubble
  let startX = targetX + random(-150, 150);
  let startY = random(0, height * 0.1);

  let segments = [];
  let steps = floor(random(8, 16));
  let cx = startX;
  let cy = startY;

  for (let i = 0; i <= steps; i++) {
    let t = i / steps;
    let goalX = lerp(startX, targetX, t);
    let goalY = lerp(startY, targetY, t);
    cx = goalX + random(-60, 60) * (1 - t);
    cy = goalY;
    segments.push({ x: cx, y: cy });

    // branch occasionally
    if (random() > 0.65 && i < steps - 2) {
      let branchLen = floor(random(2, 5));
      let bx = cx;
      let by = cy;
      let branch = [{ x: bx, y: by }];
      for (let j = 0; j < branchLen; j++) {
        bx += random(-40, 40);
        by += random(20, 50);
        branch.push({ x: bx, y: by });
      }
      segments.push({ branch: branch });
    }
  }

  lightningBolts.push({
    segments: segments,
    life: 1.0,
    decay: random(0.03, 0.06),
    hue: random(180, 280)
  });
}

function drawLightningBolts() {
  for (let i = lightningBolts.length - 1; i >= 0; i--) {
    let bolt = lightningBolts[i];
    bolt.life -= bolt.decay;
    if (bolt.life <= 0) {
      lightningBolts.splice(i, 1);
      continue;
    }

    let alpha = bolt.life * 100;
    
    // glow layer
    strokeWeight(8);
    stroke(bolt.hue, 60, 100, alpha * 0.3);
    noFill();
    drawBoltPath(bolt.segments);

    // bright core
    strokeWeight(3);
    stroke(bolt.hue, 20, 100, alpha);
    drawBoltPath(bolt.segments);

    // white hot center
    strokeWeight(1.5);
    stroke(0, 0, 100, alpha * 0.8);
    drawBoltPath(bolt.segments);
  }
}

function drawBoltPath(segments) {
  beginShape();
  for (let s of segments) {
    if (s.branch) {
      endShape();
      // draw branch
      beginShape();
      for (let b of s.branch) {
        vertex(b.x, b.y);
      }
      endShape();
      beginShape();
    } else {
      vertex(s.x, s.y);
    }
  }
  endShape();
}

// ===== RAIN =====
function spawnRain(stormLevel) {
  let rainAmount = map(smoothVelocity, 0, 100, 0, 25, true);
  for (let i = 0; i < rainAmount; i++) {
    let baseHue = (200 + hueShift * 0.1 + random(-20, 20)) % 360;

    // base wind pushes drops sideways, stronger in storms
    let windVx = random(-0.5, 0.5) + stormLevel * random(1, 3);
    let baseVy = random(6, 14) * (1 + stormLevel * 0.5);

    raindrops.push({
      x: random(-50, width + 50),
      y: random(-30, -120),
      vx: windVx,
      vy: baseVy,
      // per-drop noise wander so they don't all fall in parallel
      noiseSeed: random(1000),
      wobbleAmp: random(0.3, 1.2),
      length: random(10, 28),
      thickness: random(1.2, 2.5),
      hue: baseHue,
      sat: random(30, 60),
      bright: random(60, 90),
      alpha: random(40, 80)
    });
  }
}

function updateAndDrawRain(stormLevel) {
  let time = frameCount * 0.02;

  for (let i = raindrops.length - 1; i >= 0; i--) {
    let drop = raindrops[i];

    // noise-based wobble — each drop sways independently
    let wobble = (noise(drop.noiseSeed, drop.y * 0.01, time) - 0.5) * drop.wobbleAmp;
    drop.vx += wobble * 0.1;

    // move
    drop.x += drop.vx;
    drop.y += drop.vy;

    // draw — line angled along actual velocity vector, not just straight down
    let angle = atan2(drop.vy, drop.vx);
    let endX = drop.x + cos(angle) * drop.length;
    let endY = drop.y + sin(angle) * drop.length;

    strokeWeight(drop.thickness);
    stroke(drop.hue, drop.sat, drop.bright, drop.alpha);
    line(drop.x, drop.y, endX, endY);

    // bubble collision
    let dx = drop.x - bubbleX;
    let dy = drop.y - bubbleY;
    let d = sqrt(dx * dx + dy * dy);
    let pulseR = BUBBLE_RADIUS + sin(bubblePulse) * 5;

    if (d < pulseR + 5) {
      // bounce off bubble
      let bAngle = atan2(dy, dx);
      let speed = sqrt(drop.vx * drop.vx + drop.vy * drop.vy);
      drop.vx = cos(bAngle) * speed * 0.3 + random(-1, 1);
      drop.vy = sin(bAngle) * speed * -3;
      drop.x = bubbleX + cos(bAngle) * (pulseR + 8);
      drop.y = bubbleY + sin(bAngle) * (pulseR + 8);

      // splash at collision point
      spawnSplash(drop.x, drop.y, drop.hue);
      bubbleGlow = min(bubbleGlow + 8, 100);

      // patter tick on bubble hit
      triggerPatter();
    }

    // remove if off screen
    if (drop.y > height + 30 || drop.x < -30 || drop.x > width + 30) {
      // ground splash
      if (drop.y > height - 5) {
        spawnSplash(drop.x, height, drop.hue);
      }
      raindrops.splice(i, 1);
    }
  }

  // cap raindrops
  if (raindrops.length > 800) {
    raindrops.splice(0, raindrops.length - 800);
  }
}

// ===== SPLASHES =====
function spawnSplash(x, y, hue) {
  let count = floor(random(2, 5));
  for (let j = 0; j < count; j++) {
    splashes.push({
      x: x,
      y: y,
      vx: random(-3, 3),
      vy: random(-4, -1),
      life: 1.0,
      decay: random(0.04, 0.08),
      size: random(2, 5),
      hue: hue
    });
  }
}

function updateAndDrawSplashes() {
  noStroke();
  for (let i = splashes.length - 1; i >= 0; i--) {
    let s = splashes[i];
    s.x += s.vx;
    s.y += s.vy;
    s.vy += 0.98;
    s.life -= s.decay;

    if (s.life <= 0) {
      splashes.splice(i, 1);
      continue;
    }

    fill(s.hue, 50, 90, s.life * 80);
    ellipse(s.x, s.y, s.size * s.life, s.size * s.life);
  }

  if (splashes.length > 300) {
    splashes.splice(0, splashes.length - 300);
  }
}

// ===== WAND BUBBLE =====
function drawBubble(stormLevel) {
  let pulseR = BUBBLE_RADIUS + sin(bubblePulse) * 5;
  bubbleGlow = lerp(bubbleGlow, 10 + stormLevel * 30, 0.05);

  let bubbleHue = (200 + smoothVelocity * 1.5 + hueShift * 0.2) % 360;

  // outer glow rings
  noStroke();
  for (let r = 3; r >= 0; r--) {
    let size = pulseR + r * 20;
    let a = bubbleGlow * 0.15 / (r + 1);
    fill(bubbleHue, 60, 80, a);
    ellipse(bubbleX, bubbleY, size * 2, size * 2);
  }

  // main bubble - layered for glass effect
  // outer ring
  noFill();
  strokeWeight(2.5);
  stroke(bubbleHue, 40, 90, 60);
  ellipse(bubbleX, bubbleY, pulseR * 2, pulseR * 2);

  // inner fill
  fill(bubbleHue, 50, 70, 12);
  noStroke();
  ellipse(bubbleX, bubbleY, pulseR * 2, pulseR * 2);

  // highlight arc
  noFill();
  strokeWeight(2);
  stroke(0, 0, 100, 35);
  arc(bubbleX - 5, bubbleY - 5, pulseR * 1.4, pulseR * 1.4, PI + 0.5, TWO_PI - 0.3);

  // small specular
  fill(0, 0, 100, 50);
  noStroke();
  ellipse(bubbleX - pulseR * 0.25, bubbleY - pulseR * 0.3, 8, 6);
}

function drawInfo(wand, stormLevel) {
  fill(0, 0, 100, 80);
  noStroke();
  textSize(14);
  textAlign(LEFT, TOP);
  textFont('monospace');

  if (wand && wand.isTracked) {
    text(`velocity  ${smoothVelocity.toFixed(1)}`, 20, 20);
    text(`rain      ${raindrops.length}`, 20, 40);
    text(`storm     ${(stormLevel * 100).toFixed(0)}%`, 20, 60);
    text(`audio     ${audioInitialized ? 'on' : 'off'}`, 20, 80);

    fill(0, 0, 100, 40);
    textSize(13);
    text('slow = light rain  ·  fast = storm  ·  strike = lightning', 20, height - 30);
  } else {
    text('waiting for wand...', 20, 20);
    text(`connected: ${connected}`, 20, 40);
    text(`audio     ${audioInitialized ? 'on' : 'click to enable'}`, 20, 60);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}