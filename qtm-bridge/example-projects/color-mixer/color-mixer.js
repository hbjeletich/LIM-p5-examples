// ===== CONFIGURATION =====
const BRIDGE_IP = '192.168.10.3';
const BRIDGE_PORT = 8080;
const OBJECT_NAME = 'box';

// QTM tracking volume dimensions (in mm)
const VOLUME_WIDTH = 8200;  // 8.2 meters
const VOLUME_HEIGHT = 6000; // 6 meters

// ===== CONNECTION =====
let bodies = {};
let socket;
let connected = false;

// ===== COLOR STATE =====
let currentColor;
let colorHistory = [];
const MAX_HISTORY = 60;

// ===== WATERCOLOR STATE =====
let paperTexture;
let blobs = [];
const MAX_BLOBS = 40;
let noiseOffset = 0;
let pigmentLayer; // offscreen buffer for persistent paint

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  currentColor = color(0, 50, 80);

  // offscreen graphics buffer — paint accumulates here
  pigmentLayer = createGraphics(width, height);
  pigmentLayer.colorMode(HSB, 360, 100, 100, 100);
  pigmentLayer.clear();

  // generate a paper texture once
  paperTexture = createGraphics(width, height);
  generatePaperTexture(paperTexture);

  // connect to a websocket that's sending QTM data
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

// ===== PAPER TEXTURE =====
function generatePaperTexture(pg) {
  pg.loadPixels();
  for (let i = 0; i < pg.pixels.length; i += 4) {
    // warm off-white with subtle noise
    let grain = random(-12, 12);
    pg.pixels[i]     = 245 + grain; // R
    pg.pixels[i + 1] = 240 + grain; // G
    pg.pixels[i + 2] = 230 + grain; // B
    pg.pixels[i + 3] = 255;         // A
  }
  pg.updatePixels();

  // add some fiber-like streaks
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

// ===== ORGANIC BLOB SHAPE =====
// draws an irregular watercolor-like blob using noise-deformed vertices
function drawWatercolorBlob(pg, cx, cy, baseRadius, col, layers) {
  layers = layers || 5;

  for (let layer = 0; layer < layers; layer++) {
    // each successive layer is slightly larger and more transparent
    let layerRadius = baseRadius * (0.6 + layer * 0.15);
    let layerAlpha = map(layer, 0, layers - 1, 12, 3);

    let h = hue(col);
    let s = saturation(col);
    let b = brightness(col);

    pg.fill(h, s, b, layerAlpha);
    pg.noStroke();
    pg.beginShape();

    let noiseSeed = cx * 0.01 + cy * 0.01 + layer * 10;
    let points = 36;

    for (let i = 0; i <= points; i++) {
      let angle = map(i, 0, points, 0, TWO_PI);
      // noise gives organic deformation; different per layer for raggedness
      let noiseVal = noise(
        noiseSeed + cos(angle) * 2,
        noiseSeed + sin(angle) * 2,
        noiseOffset * 0.002 + layer * 0.5
      );
      let r = layerRadius * (0.5 + noiseVal * 0.8);
      // slight jitter per layer
      let jitterX = random(-baseRadius * 0.05, baseRadius * 0.05);
      let jitterY = random(-baseRadius * 0.05, baseRadius * 0.05);
      pg.curveVertex(cx + cos(angle) * r + jitterX, cy + sin(angle) * r + jitterY);
    }

    pg.endShape(CLOSE);
  }
}

// ===== DRIP / BLEED EFFECT =====
// small secondary bleeds that spread from a blob
function drawBleeds(pg, cx, cy, baseRadius, col) {
  let numBleeds = floor(random(2, 5));
  for (let i = 0; i < numBleeds; i++) {
    let angle = random(TWO_PI);
    let dist = baseRadius * random(0.6, 1.4);
    let bx = cx + cos(angle) * dist;
    let by = cy + sin(angle) * dist;
    let bSize = baseRadius * random(0.15, 0.4);

    let h = hue(col);
    let s = saturation(col) * random(0.7, 1.0);
    let b = brightness(col) * random(0.9, 1.1);

    drawWatercolorBlob(pg, bx, by, bSize, color(h, constrain(s, 0, 100), constrain(b, 0, 100)), 3);
  }
}

// ===== MAIN DRAW =====
function draw() {
  noiseOffset++;
  let box = bodies[OBJECT_NAME];

  if (box && box.isTracked) {
    // map rotation to color
    let hue = map(box.rotation.x, -180, 180, 0, 360);
    let sat = map(box.rotation.y, -180, 180, 20, 100);
    let bri = map(box.rotation.z, -180, 180, 30, 100);

    currentColor = color(hue, sat, bri);

    // every few frames, drop a new watercolor blob onto the pigment layer
    if (frameCount % 3 === 0) {
      let blobX = width / 2 + random(-200, 200);
      let blobY = height / 2 + random(-150, 150);
      let blobSize = random(60, 200);

      drawWatercolorBlob(pigmentLayer, blobX, blobY, blobSize, currentColor, 6);
      drawBleeds(pigmentLayer, blobX, blobY, blobSize, currentColor);
    }

    // also track blobs for the slow "spreading" animation
    if (frameCount % 8 === 0) {
      blobs.push({
        x: width / 2 + random(-180, 180),
        y: height / 2 + random(-130, 130),
        size: random(40, 120),
        maxSize: random(120, 280),
        growRate: random(0.3, 1.2),
        col: color(hue, sat, bri),
        age: 0,
        maxAge: random(80, 200),
      });
      if (blobs.length > MAX_BLOBS) blobs.shift();
    }
  }

  // === RENDER ===

  // 1. paper background
  image(paperTexture, 0, 0);

  // 2. accumulated pigment layer (persistent paint)
  // apply slight fade so old paint slowly dries / lightens
  pigmentLayer.fill(45, 5, 95, 1.5); // very faint warm wash to age old strokes
  pigmentLayer.noStroke();
  pigmentLayer.rect(0, 0, width, height);
  image(pigmentLayer, 0, 0);

  // 3. animate growing blobs (wet paint spreading)
  for (let i = blobs.length - 1; i >= 0; i--) {
    let blob = blobs[i];
    blob.age++;
    blob.size = min(blob.size + blob.growRate, blob.maxSize);

    // fade out as they age
    let lifeRatio = blob.age / blob.maxAge;
    let alpha = map(lifeRatio, 0, 1, 10, 0);

    if (alpha <= 0.5) {
      blobs.splice(i, 1);
      continue;
    }

    let h = hue(blob.col);
    let s = saturation(blob.col);
    let b = brightness(blob.col);
    let fadedCol = color(h, s, b, alpha);

    drawWatercolorBlob(this, blob.x, blob.y, blob.size, fadedCol, 3);
  }

  // 4. central swatch — a large soft watercolor blob showing the current mix
  push();
  drawWatercolorBlob(this, width / 2, height / 2, 130, currentColor, 8);
  pop();

  // 5. subtle paper grain overlay (multiply-ish darkening)
  drawGrainOverlay();

  // 6. debug info
  drawInfo(box);
}

// ===== GRAIN OVERLAY =====
function drawGrainOverlay() {
  // scattered tiny specks to mimic pigment granulation
  noStroke();
  for (let i = 0; i < 120; i++) {
    let gx = random(width);
    let gy = random(height);
    fill(30, 10, 20, random(1, 4));
    ellipse(gx, gy, random(1, 3));
  }
}

// ===== DEBUG INFO =====
function drawInfo(box) {
  fill(0, 0, 30);
  noStroke();
  textSize(14);
  textFont('monospace');
  textAlign(LEFT, TOP);

  if (box && box.isTracked) {
    text(`Roll  → Hue:        ${box.rotation.x.toFixed(1)}°`, 20, 20);
    text(`Pitch → Saturation:  ${box.rotation.y.toFixed(1)}°`, 20, 42);
    text(`Yaw   → Brightness:  ${box.rotation.z.toFixed(1)}°`, 20, 64);
  } else {
    text('Waiting for box...', 20, 20);
    text(`Connected: ${connected}`, 20, 42);
  }
}

// ===== CLEAR ON CLICK =====
function mousePressed() {
  // click to clear the canvas — fresh paper
  pigmentLayer.clear();
  blobs = [];
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  pigmentLayer = createGraphics(width, height);
  pigmentLayer.colorMode(HSB, 360, 100, 100, 100);
  pigmentLayer.clear();
  paperTexture = createGraphics(width, height);
  generatePaperTexture(paperTexture);
  blobs = [];
}