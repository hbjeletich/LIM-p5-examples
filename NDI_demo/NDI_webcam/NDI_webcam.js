let capture;
let bodypix;
let segmentation = null;

let heatMap = [];
let cols, rows;
let resolution = 20;

let videoScale;
let videoOffsetX;
let videoOffsetY;
let scaledWidth;
let scaledHeight;

// const detector = await ml5.poseDetection('MoveNet', {
//     modelType: 'multipose-lightning',
//     modelUrl: 'model/model.json'
//   });

function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();
  pixelDensity(1);

  capture = createCapture(VIDEO, videoReady);
  capture.hide();
}

function videoReady() {
  calculateVideoScale();

  bodypix = ml5.bodySegmentation('BodyPix', {
  segmentationType: 'person',
  outputStride: 16,
  inputResolution: { width: 257, height: 257 },
  multiplier: 0.75,
  segmentationThreshold: 0.1
}, modelReady);

}

function modelReady() {
  bodypix.detectStart(capture, gotSegmentation);

  cols = floor(width / resolution);
  rows = floor(height / resolution);

  heatMap = Array(cols).fill().map(() =>
    Array(rows).fill(0)
  );
}

function calculateVideoScale() {
  // Scale to cover the screen
  let scaleX = width / capture.width;
  let scaleY = height / capture.height;
  videoScale = max(scaleX, scaleY);
  
  scaledWidth = capture.width * videoScale;
  scaledHeight = capture.height * videoScale;
  
  // Center it
  videoOffsetX = (width - scaledWidth) / 2;
  videoOffsetY = (height - scaledHeight) / 2;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  calculateVideoScale();
  
  // Recalculate heat map grid
  cols = floor(width / resolution);
  rows = floor(height / resolution);
  
  heatMap = [];
  for (let i = 0; i < cols; i++) {
    heatMap[i] = [];
    for (let j = 0; j < rows; j++) {
      heatMap[i][j] = 0;
    }
  }
}

function gotSegmentation(result) {
  // Handle both possible ml5 return shapes
  if (Array.isArray(result)) {
    segmentation = result[0].segmentation;
  } else if (result.segmentation) {
    segmentation = result.segmentation;
  } else {
    segmentation = result;
  }
}

function draw() {
  let hasPerson = false;
  for (let i = 0; i < segmentation.data.length; i++) {
    if (segmentation.data[i] === 1) {
      hasPerson = true;
      break;
    }
  }

  console.log(segmentation.width, segmentation.height, hasPerson);
  //console.log(frameRate());
  let bg = COLORS.background;
  background(bg[0], bg[1], bg[2]);
  
  if (!capture.width) return;
  
  // Decay heat map
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      heatMap[i][j] *= SETTINGS.decayRate;
      heatMap[i][j] = min(heatMap[i][j], SETTINGS.maxHeat);
    }
  }
  
  // Add heat from detected people
  if (segmentation && segmentation.data) {
    let d = segmentation.data;
    let w = segmentation.width;
    let h = segmentation.height;

    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {

        let index = x + y * w;

        if (d[index] === 1) {
          let scaleX = scaledWidth / segmentation.width;
          let scaleY = scaledHeight / segmentation.height;

          let screenX = x * scaleX + videoOffsetX;
          let screenY = y * scaleY + videoOffsetY;


          screenX = width - screenX;

          let gridX = floor(screenX / resolution);
          let gridY = floor(screenY / resolution);

          if (gridX >= 0 && gridX < cols && gridY >= 0 && gridY < rows) {
            heatMap[gridX][gridY] += SETTINGS.heatIntensity;
            heatMap[gridX][gridY] = min(heatMap[gridX][gridY], SETTINGS.maxHeat);
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
  
  drawMetaballs(blobs);
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

function getHeatColor(heat) {
  // Find which two gradient stops we're between
  let stops = COLORS.gradient;
  
  for (let i = 0; i < stops.length - 1; i++) {
    if (heat >= stops[i].heat && heat < stops[i + 1].heat) {
      // Interpolate between these two stops
      let t = map(heat, stops[i].heat, stops[i + 1].heat, 0, 1);
      return lerpColor(
        color(stops[i].color),
        color(stops[i + 1].color),
        t
      );
    }
  }
  
  // If we're beyond the last stop, return the hottest color
  return color(stops[stops.length - 1].color);
}