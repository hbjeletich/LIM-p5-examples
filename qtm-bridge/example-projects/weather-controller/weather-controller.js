// ===== CONFIGURATION =====
const BRIDGE_IP = '192.168.10.3';
const BRIDGE_PORT = 8080;
const OBJECT_NAME = 'wand';

// QTM tracking volume dimensions (in mm)
const VOLUME_WIDTH = 8200;
const VOLUME_HEIGHT = 6000;

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

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  
  bubbleX = width / 2;
  bubbleY = height / 2;
  bubbleTargetX = width / 2;
  bubbleTargetY = height / 2;

  // init clouds
  for (let i = 0; i < 8; i++) {
    clouds.push({
      x: random(width),
      y: random(height * 0.05, height * 0.3),
      w: random(200, 450),
      h: random(40, 80),
      speed: random(0.2, 0.8),
      opacity: random(30, 60)
    });
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

function draw() {
  let wand = bodies[OBJECT_NAME];

  if (wand && wand.isTracked) {
    let x = wand.position.x;
    let z = wand.position.z;
    velocity = dist(x, z, prevX, prevZ);
    smoothVelocity = lerp(smoothVelocity, velocity, 0.2);

    // lightning strike toward the bubble
    if (velocity > 150) {
      lightning = 100;
      thunderTimer = 10 + random(20);
      spawnLightningBolt(bubbleX, bubbleY);
      bubbleGlow = 100;
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
  drawBubble(stormLevel);

  // ===== DEBUG INFO =====
  drawInfo(wand, stormLevel);
}

// ===== SKY GRADIENT =====
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
  for (let c of clouds) {
    c.x += c.speed * (1 + stormLevel * 3);
    if (c.x > width + c.w) c.x = -c.w;

    let darkness = lerp(80, 25, stormLevel);
    let op = lerp(c.opacity, c.opacity * 1.5, stormLevel);

    fill(220, 15, darkness, min(op, 80));
    noStroke();
    // layered ellipses for cloud shape
    ellipse(c.x, c.y, c.w, c.h);
    ellipse(c.x - c.w * 0.25, c.y + c.h * 0.1, c.w * 0.6, c.h * 0.7);
    ellipse(c.x + c.w * 0.2, c.y - c.h * 0.1, c.w * 0.5, c.h * 0.8);
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
    raindrops.push({
      x: random(width),
      y: random(-30, -120),
      vx: random(-1, 1) * (1 + stormLevel * 2),
      vy: random(6, 14) * (1 + stormLevel * 0.5),
      length: random(10, 28),
      hue: baseHue,
      sat: random(30, 60),
      bright: random(60, 90),
      alpha: random(40, 80)
    });
  }
}

function updateAndDrawRain(stormLevel) {
  strokeWeight(2);
  for (let i = raindrops.length - 1; i >= 0; i--) {
    let drop = raindrops[i];

    // draw
    let c = color(drop.hue, drop.sat, drop.bright, drop.alpha);
    stroke(c);
    line(drop.x, drop.y, drop.x + drop.vx * 0.5, drop.y + drop.length);

    // move
    drop.x += drop.vx;
    drop.y += drop.vy;

    // check bubble collision
    let dx = drop.x - bubbleX;
    let dy = drop.y - bubbleY;
    let d = sqrt(dx * dx + dy * dy);
    let pulseR = BUBBLE_RADIUS + sin(bubblePulse) * 5;

    if (d < pulseR + 5) {
      // bounce off bubble
      let angle = atan2(dy, dx);
      let speed = sqrt(drop.vx * drop.vx + drop.vy * drop.vy);
      drop.vx = cos(angle) * speed * 0.7 + random(-1, 1);
      drop.vy = sin(angle) * speed * 0.6;
      drop.x = bubbleX + cos(angle) * (pulseR + 8);
      drop.y = bubbleY + sin(angle) * (pulseR + 8);

      // splash at collision point
      spawnSplash(drop.x, drop.y, drop.hue);
      bubbleGlow = min(bubbleGlow + 8, 100);
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
    s.vy += 0.15; // gravity
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

// ===== DEBUG INFO =====
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

    fill(0, 0, 100, 40);
    textSize(13);
    text('slow = light rain  ·  fast = storm  ·  strike = lightning', 20, height - 30);
  } else {
    text('waiting for wand...', 20, 20);
    text(`connected: ${connected}`, 20, 40);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}