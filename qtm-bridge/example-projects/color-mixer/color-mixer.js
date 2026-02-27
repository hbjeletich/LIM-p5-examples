// ===== CONFIGURATION =====
const BRIDGE_IP = '192.168.10.3';
const BRIDGE_PORT = 8080;
const OBJECT_NAME = 'box';

// QTM tracking volume dimensions (in mm)
const VOLUME_WIDTH = 8200;
const VOLUME_HEIGHT = 6000;

// ===== CONNECTION =====
let bodies = {};
let socket;
let connected = false;

// ===== TILT STATE =====
// "flat" reference pose: roll ~90, pitch 0, yaw 0
const REST_ROLL = 90;
const REST_PITCH = 0;
const REST_YAW = 0;

let gravityX = 0;
let gravityY = 0;
let smoothGravX = 0;
let smoothGravY = 0;
const GRAVITY_SMOOTH = 0.15;

// static tilt contribution (gentle background pull from angle)
const TILT_STRENGTH = 0.06;
// angular velocity contribution (reactive flick force)
const VELOCITY_STRENGTH = 0.035;
// dead zone: tilt angles below this (degrees) produce no force
const TILT_DEAD_ZONE = 4.0;
// dead zone: angular velocities below this (deg/frame) are ignored
const VEL_DEAD_ZONE = 0.3;

// previous frame rotation for computing angular velocity
let prevRoll = null;
let prevYaw = null;
let angVelRoll = 0;
let angVelYaw = 0;
let smoothAngVelRoll = 0;
let smoothAngVelYaw = 0;
const ANG_VEL_SMOOTH = 0.25;

// ===== PAINT DROPS =====
let drops = [];
const MAX_DROPS = 300;
const FRICTION = 0.975;
const MIN_SPEED = 0.08;

// ===== RENDERING =====
let paperTexture;
let pigmentLayer;
let noiseOffset = 0;

// ===== COLOR PALETTE =====
// predefined paint colors users can cycle through
const PAINT_COLORS = [
  [355, 70, 60],  // deep red
  [25, 80, 75],   // burnt orange
  [48, 75, 85],   // golden yellow
  [160, 60, 50],  // teal green
  [220, 65, 65],  // cobalt blue
  [280, 55, 55],  // purple
  [15, 30, 25],   // raw umber
  [200, 10, 90],  // payne's grey
];
let currentPaletteIndex = 0;
let currentPaintColor;

// ===== SPAWN SETTINGS =====
let isPouring = false;
let pourX, pourY;

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);

  currentPaintColor = PAINT_COLORS[currentPaletteIndex];

  // offscreen buffer for persistent paint trails
  pigmentLayer = createGraphics(width, height);
  pigmentLayer.colorMode(HSB, 360, 100, 100, 100);
  pigmentLayer.clear();

  // paper texture
  paperTexture = createGraphics(width, height);
  generatePaperTexture(paperTexture);

  // default pour point
  pourX = width / 2;
  pourY = height / 2;

  // connect to QTM websocket bridge
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

// ===== PAPER TEXTURE =====
function generatePaperTexture(pg) {
  pg.loadPixels();
  for (let i = 0; i < pg.pixels.length; i += 4) {
    let grain = random(-12, 12);
    pg.pixels[i]     = 245 + grain;
    pg.pixels[i + 1] = 240 + grain;
    pg.pixels[i + 2] = 230 + grain;
    pg.pixels[i + 3] = 255;
  }
  pg.updatePixels();

  pg.stroke(220, 215, 200, 25);
  pg.strokeWeight(0.5);
  for (let i = 0; i < 300; i++) {
    let x1 = random(pg.width);
    let y1 = random(pg.height);
    let angle = random(TWO_PI);
    let len = random(10, 60);
    pg.line(x1, y1, x1 + cos(angle) * len, y1 + sin(angle) * len);
  }
}

// ===== PAINT DROP CLASS =====
function createDrop(x, y, col, sizeBase) {
  let spread = sizeBase * 0.6;
  return {
    x: x + random(-spread, spread),
    y: y + random(-spread, spread),
    vx: random(-0.5, 0.5),
    vy: random(-0.5, 0.5),
    radius: random(sizeBase * 0.4, sizeBase * 1.2),
    h: col[0] + random(-8, 8),
    s: col[1] + random(-5, 5),
    b: col[2] + random(-5, 5),
    life: 1.0,
    decay: random(0.0005, 0.002), // how fast the drop dries out
    wet: 1.0,        // wetness affects how much it responds to tilt
    dryRate: random(0.0008, 0.003),
    trail: [],       // recent positions for trail rendering
    maxTrail: 12,
    settled: false,
  };
}

// ===== WATERCOLOR BLOB (for trail stamps) =====
function stampBlob(pg, cx, cy, baseRadius, h, s, b, alpha) {
  let layers = 4;
  for (let layer = 0; layer < layers; layer++) {
    let lr = baseRadius * (0.5 + layer * 0.2);
    let la = alpha * map(layer, 0, layers - 1, 0.7, 0.2);

    pg.fill(h, constrain(s, 0, 100), constrain(b, 0, 100), la);
    pg.noStroke();
    pg.beginShape();

    let nSeed = cx * 0.01 + cy * 0.01 + layer * 7;
    let pts = 20;

    for (let i = 0; i <= pts; i++) {
      let angle = map(i, 0, pts, 0, TWO_PI);
      let nv = noise(nSeed + cos(angle) * 1.8, nSeed + sin(angle) * 1.8, noiseOffset * 0.001 + layer * 0.3);
      let r = lr * (0.55 + nv * 0.7);
      pg.curveVertex(cx + cos(angle) * r, cy + sin(angle) * r);
    }
    pg.endShape(CLOSE);
  }
}

// ===== DEAD ZONE HELPER =====
// values within the dead zone return 0; outside, ramp smoothly from 0
function applyDeadZone(value, zone) {
  if (abs(value) < zone) return 0;
  return (value - zone * Math.sign(value));
}

// ===== SYMMETRY HELPERS =====
// wrap-safe angle difference (handles -180/180 crossover)
function angleDiff(a, b) {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

// fold angle deviation into -90..90 range for a symmetrical object
// 0° and 180° are identical orientations, so deviation folds back at 90°
function foldDeviation(dev) {
  // normalize to -180..180 first
  while (dev > 180) dev -= 360;
  while (dev < -180) dev += 360;
  // fold: beyond ±90° mirrors back
  if (dev > 90) dev = 180 - dev;
  if (dev < -90) dev = -180 - dev;
  return dev;
}

// ===== MAIN DRAW =====
function draw() {
  noiseOffset++;
  let box = bodies[OBJECT_NAME];

  // ---- compute gravity from tilt + angular velocity ----
  if (box && box.isTracked) {
    let currentRoll = box.rotation.x;
    let currentYaw = box.rotation.z;

    // compute angular velocity with wrap-safe diff
    if (prevRoll !== null) {
      angVelRoll = angleDiff(currentRoll, prevRoll);
      angVelYaw = angleDiff(currentYaw, prevYaw);
    }
    prevRoll = currentRoll;
    prevYaw = currentYaw;

    // smooth angular velocity
    smoothAngVelRoll = lerp(smoothAngVelRoll, angVelRoll, ANG_VEL_SMOOTH);
    smoothAngVelYaw = lerp(smoothAngVelYaw, angVelYaw, ANG_VEL_SMOOTH);

    // deviations from rest pose, folded for symmetry (box has no up/down)
    let rollDev = foldDeviation(currentRoll - REST_ROLL);
    let yawDev = foldDeviation(currentYaw - REST_YAW);

    // apply dead zone to tilt angle
    let tiltForceY = applyDeadZone(rollDev, TILT_DEAD_ZONE) * TILT_STRENGTH;
    let tiltForceX = applyDeadZone(yawDev, TILT_DEAD_ZONE) * TILT_STRENGTH;

    // apply dead zone to angular velocity
    let velForceY = applyDeadZone(smoothAngVelRoll, VEL_DEAD_ZONE) * VELOCITY_STRENGTH;
    let velForceX = applyDeadZone(smoothAngVelYaw, VEL_DEAD_ZONE) * VELOCITY_STRENGTH;

    // combine: gentle tilt pull + reactive velocity kick
    gravityX = -(sin(radians(tiltForceX)) + velForceX);
    gravityY = sin(radians(tiltForceY)) + velForceY;
  }

  // smooth the final gravity so it doesn't jitter
  smoothGravX = lerp(smoothGravX, gravityX, GRAVITY_SMOOTH);
  smoothGravY = lerp(smoothGravY, gravityY, GRAVITY_SMOOTH);

  let tiltMag = sqrt(smoothGravX * smoothGravX + smoothGravY * smoothGravY);

  // ---- spawn drops when pouring ----
  if (isPouring && frameCount % 2 === 0) {
    let numDrops = floor(random(2, 5));
    for (let i = 0; i < numDrops; i++) {
      if (drops.length < MAX_DROPS) {
        drops.push(createDrop(pourX, pourY, currentPaintColor, random(22, 100)));
      }
    }
  }

  // ---- update drops ----
  for (let i = drops.length - 1; i >= 0; i--) {
    let d = drops[i];

    // apply gravity based on tilt (scaled by wetness)
    d.vx += smoothGravX * d.wet;
    d.vy += smoothGravY * d.wet;

    // friction
    d.vx *= FRICTION;
    d.vy *= FRICTION;

    // add a tiny bit of noise wander for organic feel
    d.vx += (noise(d.x * 0.01, d.y * 0.01, noiseOffset * 0.005) - 0.5) * 0.15 * d.wet;
    d.vy += (noise(d.y * 0.01, d.x * 0.01, noiseOffset * 0.005 + 100) - 0.5) * 0.15 * d.wet;

    let speed = sqrt(d.vx * d.vx + d.vy * d.vy);

    // move
    d.x += d.vx;
    d.y += d.vy;

    // dry out over time
    d.wet = max(0, d.wet - d.dryRate);
    d.life -= d.decay;

    // track trail
    d.trail.push({ x: d.x, y: d.y });
    if (d.trail.length > d.maxTrail) d.trail.shift();

    // stamp paint onto pigment layer as it moves
    if (speed > MIN_SPEED && d.wet > 0.05) {
      // faster = thinner, more streaky trail; slower = fatter, pooling
      let stampRadius = d.radius * map(speed, 0, 4, 1.3, 0.4, true);
      let stampAlpha = map(speed, 0, 3, 6, 2, true) * d.wet;

      stampBlob(pigmentLayer, d.x, d.y, stampRadius, d.h, d.s, d.b, stampAlpha);
    } else if (d.wet > 0.1) {
      // pooling — slow/stationary drops spread out
      let poolRadius = d.radius * 1.1;
      stampBlob(pigmentLayer, d.x, d.y, poolRadius, d.h, d.s, d.b, 2.5 * d.wet);
      d.radius += 0.05 * d.wet; // slowly grows as it pools
    }

    // settled = nearly dry and slow
    if (d.wet < 0.05 && speed < MIN_SPEED) {
      d.settled = true;
    }

    // remove dead drops
    if (d.life <= 0 || d.settled) {
      // final stamp — the "dried" mark
      stampBlob(pigmentLayer, d.x, d.y, d.radius * 0.9, d.h, d.s, d.b, 5);
      drops.splice(i, 1);
    }

    // keep in bounds (bounce softly)
    if (d.x < 0) { d.x = 0; d.vx *= -0.3; }
    if (d.x > width) { d.x = width; d.vx *= -0.3; }
    if (d.y < 0) { d.y = 0; d.vy *= -0.3; }
    if (d.y > height) { d.y = height; d.vy *= -0.3; }
  }

  // ===== RENDER =====

  // 1. paper background
  image(paperTexture, 0, 0);

  // 2. paint fades over time — warm wash slowly erases old paint
  pigmentLayer.fill(45, 5, 95, 2.5);
  pigmentLayer.noStroke();
  pigmentLayer.rect(0, 0, width, height);

  // 3. persistent pigment
  image(pigmentLayer, 0, 0);

  // 4. live wet drops (rendered on top with a glistening look)
  for (let d of drops) {
    if (d.wet > 0.05) {
      let alpha = map(d.wet, 0, 1, 3, 18);
      // wet highlight — slightly brighter, slightly transparent blob
      drawWetDrop(d, alpha);
    }
  }

  // 5. grain overlay
  drawGrainOverlay();

  // 6. tilt indicator
  drawTiltIndicator();

  // 7. UI
  drawInfo(box);
  drawPalette();
}

// ===== WET DROP RENDERING =====
function drawWetDrop(d, alpha) {
  // main body
  fill(d.h, constrain(d.s, 0, 100), constrain(d.b, 0, 100), alpha);
  noStroke();

  let pts = 14;
  beginShape();
  for (let i = 0; i <= pts; i++) {
    let angle = map(i, 0, pts, 0, TWO_PI);
    let nv = noise(d.x * 0.02 + cos(angle), d.y * 0.02 + sin(angle), noiseOffset * 0.003);
    let r = d.radius * (0.6 + nv * 0.5);
    curveVertex(d.x + cos(angle) * r, d.y + sin(angle) * r);
  }
  endShape(CLOSE);

  // wet sheen — a lighter highlight
  fill(d.h, constrain(d.s - 20, 0, 100), constrain(d.b + 20, 0, 100), alpha * 0.3);
  ellipse(d.x - d.radius * 0.15, d.y - d.radius * 0.15, d.radius * 0.5, d.radius * 0.4);
}

// ===== TILT INDICATOR =====
function drawTiltIndicator() {
  let cx = 60;
  let cy = height - 60;
  let indicatorSize = 40;

  // outer ring
  noFill();
  stroke(0, 0, 50, 30);
  strokeWeight(1.5);
  ellipse(cx, cy, indicatorSize * 2);

  // crosshair
  stroke(0, 0, 50, 15);
  line(cx - indicatorSize, cy, cx + indicatorSize, cy);
  line(cx, cy - indicatorSize, cx, cy + indicatorSize);

  // tilt dot
  let dotX = cx + smoothGravX * indicatorSize * 3;
  let dotY = cy + smoothGravY * indicatorSize * 3;
  fill(0, 0, 30, 50);
  noStroke();
  ellipse(dotX, dotY, 8);

  // tilt line
  stroke(0, 0, 30, 30);
  strokeWeight(1);
  line(cx, cy, dotX, dotY);
}

// ===== GRAIN OVERLAY =====
function drawGrainOverlay() {
  noStroke();
  for (let i = 0; i < 80; i++) {
    let gx = random(width);
    let gy = random(height);
    fill(30, 10, 20, random(1, 3));
    ellipse(gx, gy, random(1, 3));
  }
}

// ===== COLOR PALETTE UI =====
function drawPalette() {
  let startX = width - 30;
  let startY = height / 2 - (PAINT_COLORS.length * 36) / 2;

  for (let i = 0; i < PAINT_COLORS.length; i++) {
    let c = PAINT_COLORS[i];
    let y = startY + i * 36;

    // swatch
    if (i === currentPaletteIndex) {
      stroke(0, 0, 100, 60);
      strokeWeight(2.5);
    } else {
      stroke(0, 0, 40, 30);
      strokeWeight(1);
    }
    fill(c[0], c[1], c[2], 80);
    ellipse(startX, y, 22);
  }

  // label
  fill(0, 0, 40);
  noStroke();
  textSize(10);
  textFont('monospace');
  textAlign(CENTER);
  text('1-8', startX, startY + PAINT_COLORS.length * 36 + 12);
}

// ===== DEBUG INFO =====
function drawInfo(box) {
  fill(0, 0, 30);
  noStroke();
  textSize(13);
  textFont('monospace');
  textAlign(LEFT, TOP);

  if (box && box.isTracked) {
    let rollDev = foldDeviation(box.rotation.x - REST_ROLL).toFixed(1);
    let yawDev = foldDeviation(box.rotation.z - REST_YAW).toFixed(1);
    text(`roll tilt:  ${rollDev}° (folded)  →  gravity Y`, 20, 20);
    text(`yaw tilt:   ${yawDev}° (folded)  →  gravity X`, 20, 40);
    text(`ang vel:    roll ${smoothAngVelRoll.toFixed(2)}  yaw ${smoothAngVelYaw.toFixed(2)}`, 20, 60);
    text(`drops: ${drops.length}`, 20, 80);
  } else {
    text('Waiting for box...', 20, 20);
    text(`Connected: ${connected}`, 20, 40);
  }

  // instructions
  fill(0, 0, 45);
  textSize(11);
  textAlign(LEFT, BOTTOM);
  text('click+hold: pour paint  |  1-8: pick color  |  space: clear', 20, height - 20);
}

// ===== INPUT =====
function mousePressed() {
  // check if clicking a palette swatch
  let startX = width - 30;
  let startY = height / 2 - (PAINT_COLORS.length * 36) / 2;
  for (let i = 0; i < PAINT_COLORS.length; i++) {
    let y = startY + i * 36;
    if (dist(mouseX, mouseY, startX, y) < 14) {
      currentPaletteIndex = i;
      currentPaintColor = PAINT_COLORS[i];
      return;
    }
  }

  // start pouring
  isPouring = true;
  pourX = mouseX;
  pourY = mouseY;
}

function mouseDragged() {
  pourX = mouseX;
  pourY = mouseY;
}

function mouseReleased() {
  isPouring = false;
}

function keyPressed() {
  // number keys 1-8 to select paint color
  let num = int(key);
  if (num >= 1 && num <= PAINT_COLORS.length) {
    currentPaletteIndex = num - 1;
    currentPaintColor = PAINT_COLORS[currentPaletteIndex];
  }

  // space to clear
  if (key === ' ') {
    pigmentLayer.clear();
    drops = [];
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  pigmentLayer = createGraphics(width, height);
  pigmentLayer.colorMode(HSB, 360, 100, 100, 100);
  pigmentLayer.clear();
  paperTexture = createGraphics(width, height);
  generatePaperTexture(paperTexture);
  drops = [];
}