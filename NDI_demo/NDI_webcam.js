let capture;
let bodyPose;
let poses = [];
let heatMap = [];
let cols, rows;
let resolution = 20;

// ============== CONFIGURATION ==============

const COLORS = {
  background: [10, 5, 30],
  
  gradient: [
    { heat: 0,    color: [10, 5, 30] },
    { heat: 0.15, color: [30, 5, 60] },
    { heat: 0.3,  color: [60, 10, 100] },
    { heat: 0.45, color: [140, 0, 120] },
    { heat: 0.6,  color: [200, 30, 80] },
    { heat: 0.75, color: [255, 80, 0] },
    { heat: 0.9,  color: [255, 180, 50] },
    { heat: 1,    color: [255, 255, 200] },
  ],
  
  counter: {
    glow: [180, 0, 255],
    border: [180, 100, 255],
    text: [255, 255, 255],
    label: [200, 150, 255]
  }
};

const SETTINGS = {
  decayRate: 0.5,          // Heat fade speed. 0=instant, 1=never. Try 0.3-0.95
  maxHeat: 50,             // Heat cap per cell. Try 20-200
  heatIntensity: 5,        // Heat added per keypoint. Try 2-30
  spreadRadius: 4,         // Grid cells heat spreads. Try 2-8
  blobRadius: 45,          // Metaball size in px. Try 20-100
  blobThreshold: 0.8,      // Min field to render. Lower=bigger blobs. Try 0.1-2.0
  metaballResolution: 12,  // Render step. Lower=smooth+slow. Try 4-16
  heatSensitivity: 10,     // Field strength for hot colors. Higher=more cool tones. Try 4-20
  maxFieldHeat: 0.4,       // Max heat from field (0-1). Lower=cooler palette. Try 0.2-0.7
  intensityMult: 0.2       // Blob intensity boost. Higher=brighter centers. Try 0.1-0.5
};

// ================================================

function preload() {
  bodyPose = ml5.bodyPose('MoveNet', {flipped: false});
}

function setup() {
  createCanvas(1280, 720);
  noStroke();
  pixelDensity(1);
  
  capture = createCapture(VIDEO);
  capture.hide();
  
  bodyPose.detectStart(capture, gotPoses);
   
  cols = floor(width / resolution);
  rows = floor(height / resolution);
  
  for (let i = 0; i < cols; i++) {
    heatMap[i] = [];
    for (let j = 0; j < rows; j++) {
      heatMap[i][j] = 0;
    }
  }
}

function gotPoses(results) {
  poses = results;
}

function getHeatColor(heat) {
  heat = constrain(heat, 0, 1);
  let stops = COLORS.gradient;
  
  for (let i = 0; i < stops.length - 1; i++) {
    if (heat >= stops[i].heat && heat < stops[i + 1].heat) {
      let t = map(heat, stops[i].heat, stops[i + 1].heat, 0, 1);
      return lerpColor(
        color(stops[i].color),
        color(stops[i + 1].color),
        t
      );
    }
  }
  
  return color(stops[stops.length - 1].color);
}

function draw() {
  let bg = COLORS.background;
  background(bg[0], bg[1], bg[2]);
  
  // Decay and cap heat map
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      heatMap[i][j] *= SETTINGS.decayRate;
      heatMap[i][j] = min(heatMap[i][j], SETTINGS.maxHeat);
    }
  }
  
  // Add heat from detected people
  for (let pose of poses) {
    for (let keypoint of pose.keypoints) {
      if (keypoint.confidence > 0.1) {
        let scaledX = keypoint.x * (width / capture.width);
        let scaledY = keypoint.y * (height / capture.height);
        
        let gridX = floor((width - scaledX) / resolution);
        let gridY = floor(scaledY / resolution);
        
        let spreadRadius = SETTINGS.spreadRadius;
        for (let i = -spreadRadius; i <= spreadRadius; i++) {
          for (let j = -spreadRadius; j <= spreadRadius; j++) {
            let x = gridX + i;
            let y = gridY + j;
            
            if (x >= 0 && x < cols && y >= 0 && y < rows) {
              let distance = sqrt(i*i + j*j);
              let heat = map(distance, 0, spreadRadius, SETTINGS.heatIntensity, 0);
              heat = max(0, heat);
              heatMap[x][y] = min(heatMap[x][y] + heat, SETTINGS.maxHeat);
            }
          }
        }
      }
    }
  }
  
  // Build blob list from heat map
  let blobs = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (heatMap[i][j] > 2) {
        blobs.push({
          x: i * resolution,
          y: j * resolution,
          intensity: heatMap[i][j] / SETTINGS.maxHeat
        });
      }
    }
  }
  
  // Draw metaballs
  drawMetaballs(blobs);
  
  drawPeopleCounter();
}

function drawMetaballs(blobs) {
  if (blobs.length === 0) return;
  
  let step = SETTINGS.metaballResolution;
  
  noStroke();
  
  for (let x = 0; x < width; x += step) {
    for (let y = 0; y < height; y += step) {
      
      let sum = 0;
      let maxIntensity = 0;
      
      for (let blob of blobs) {
        let dx = x - blob.x;
        let dy = y - blob.y;
        let distSq = dx * dx + dy * dy;
        
        let radius = SETTINGS.blobRadius * (0.5 + blob.intensity * 0.5);
        let influence = (radius * radius) / (distSq + 100);
        
        sum += influence;
        
        // Track the highest intensity blob affecting this point
        if (influence > 0.1) {
          maxIntensity = max(maxIntensity, blob.intensity * influence);
        }
      }
      
      if (sum > SETTINGS.blobThreshold) {
        // Map the field strength to color
        let fieldStrength = map(sum, SETTINGS.blobThreshold, SETTINGS.heatSensitivity, 0, SETTINGS.maxFieldHeat);
        let intensityBoost = maxIntensity * SETTINGS.intensityMult;
        let normalizedHeat = constrain(fieldStrength + intensityBoost, 0, 1);
        
        let c = getHeatColor(normalizedHeat);
        fill(c);
        rect(x, y, step, step);
      }
    }
  }
}

function drawPeopleCounter() {
  push();
  
  let centerX = width / 2;
  let centerY = height / 2;
  
  let pulseSize = sin(frameCount * 0.08) * 15;
  let counterSize = 180 + pulseSize + (poses.length * 10);
  
  let glow = COLORS.counter.glow;
  for (let i = 8; i > 0; i--) {
    fill(glow[0], glow[1], glow[2], 15);
    circle(centerX, centerY, counterSize + i * 25);
  }
  
  fill(0, 0, 0, 180);
  let border = COLORS.counter.border;
  stroke(border[0], border[1], border[2], 150);
  strokeWeight(3);
  circle(centerX, centerY, counterSize);
  
  let textCol = COLORS.counter.text;
  fill(textCol[0], textCol[1], textCol[2]);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(90);
  textStyle(BOLD);
  text(poses.length, centerX, centerY - 15);
  
  textSize(22);
  let labelCol = COLORS.counter.label;
  fill(labelCol[0], labelCol[1], labelCol[2]);
  text("PEOPLE DETECTED", centerX, centerY + 45);
  
  pop();
}