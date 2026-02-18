// ===== CONFIGURATION =====
const BRIDGE_IP = '192.168.10.3';
const BRIDGE_PORT = 8080;
const OBJECT_NAME = 'box';

// QTM tracking volume dimensions (in mm)
const VOLUME_WIDTH = 8200;  // 8.2 meters
const VOLUME_HEIGHT = 6000;  // 6 meters

// ===== CONNECTION =====
let bodies = {};
let socket;
let connected = false;

// ===== COLOR STATE =====
let currentColor;
let colorHistory = [];
const MAX_HISTORY = 100;

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  currentColor = color(0, 50, 80);
  
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

function draw() {
  let box = bodies[OBJECT_NAME];
  
  if (box && box.isTracked) {
    // map rotation to color
    // roll (-180 to 180) -> hue (0 to 360)
    // pitch (-180 to 180) -> saturation (20 to 100)
    // yaw (-180 to 180) -> brightness (30 to 100)
    let hue = map(box.rotation.x, -180, 180, 0, 360);
    let sat = map(box.rotation.y, -180, 180, 20, 100);
    let bri = map(box.rotation.z, -180, 180, 30, 100);
    
    currentColor = color(hue, sat, bri);
    
    // add to history for the watercolor effect
    colorHistory.push({
      x: width / 2 + random(-100, 100),
      y: height / 2 + random(-100, 100),
      c: color(hue, sat, bri, 30),
      size: random(100, 300)
    });
    
    if (colorHistory.length > MAX_HISTORY) {
      colorHistory.shift();
    }
  }
  
  // draw soft background
  background(30, 10, 95);
  
  // draw color history (watercolor blobs)
  noStroke();
  for (let blob of colorHistory) {
    fill(blob.c);
    ellipse(blob.x, blob.y, blob.size, blob.size);
  }
  
  // draw main color swatch
  fill(currentColor);
  ellipse(width / 2, height / 2, 250, 250);
  
  // draw rotation values
  drawInfo(box);
}

function drawInfo(box) {
  // acting as debug/console for our interactions
  // would be deleted in a final build
  fill(0, 0, 30);
  noStroke();
  textSize(16);
  textAlign(LEFT, TOP);
  
  if (box && box.isTracked) {
    text(`Roll (Hue): ${box.rotation.x.toFixed(1)}°`, 20, 20);
    text(`Pitch (Saturation): ${box.rotation.y.toFixed(1)}°`, 20, 45);
    text(`Yaw (Brightness): ${box.rotation.z.toFixed(1)}°`, 20, 70);
  } else {
    text('Waiting for box...', 20, 20);
    text(`Connected: ${connected}`, 20, 45);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  colorHistory = [];
}