// ===== CONFIGURATION =====
const BRIDGE_IP = '192.168.10.3';
const BRIDGE_PORT = 8080;
const OBJECT_NAME = 'wand';

// QTM tracking volume dimensions (in mm)
const VOLUME_WIDTH = 8200;  // 8.2 meters
const VOLUME_HEIGHT = 6000;  // 6 meters

// ===== CONNECTION =====
let bodies = {};
let socket;
let connected = false;

// ===== MOVEMENT TRACKING =====
let prevX = 0;
let prevZ = 0;
let velocity = 0;
let smoothVelocity = 0;

// ===== WEATHER STATE =====
let raindrops = [];
let lightning = 0;
let thunderTimer = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  
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
  let wand = bodies[OBJECT_NAME];
  
  if (wand && wand.isTracked) {
    let x = wand.position.x;
    let z = wand.position.z;
    
    // calculate velocity (distance moved since last frame)
    velocity = dist(x, z, prevX, prevZ);
    smoothVelocity = lerp(smoothVelocity, velocity, 0.2);
    
    // check for lightning strike (sudden fast movement)
    if (velocity > 150) {
      lightning = 255;
      thunderTimer = 10 + random(20);
    }
    
    prevX = x;
    prevZ = z;
  }
  
  // sky color based on storm intensity
  let stormLevel = map(smoothVelocity, 0, 100, 0, 1, true);
  let skyColor = lerpColor(color(70, 100, 140), color(30, 35, 45), stormLevel);
  background(skyColor);
  
  // lightning flash
  if (lightning > 0) {
    background(255, lightning);
    lightning *= 0.85;
  }
  
  // spawn rain based on velocity
  let rainAmount = map(smoothVelocity, 0, 100, 0, 20, true);
  for (let i = 0; i < rainAmount; i++) {
    raindrops.push({
      x: random(width),
      y: random(-20, -100),
      speed: random(8, 15),
      length: random(10, 25)
    });
  }
  
  // draw and update rain
  stroke(180, 200, 230, 150);
  strokeWeight(2);
  for (let i = raindrops.length - 1; i >= 0; i--) {
    let drop = raindrops[i];
    line(drop.x, drop.y, drop.x, drop.y + drop.length);
    drop.y += drop.speed;
    
    if (drop.y > height) {
      raindrops.splice(i, 1);
    }
  }
  
  drawInfo(wand);
}

function drawInfo(wand) {
  // acting as debug/console for our interactions
  // would be deleted in a final build
  fill(255);
  noStroke();
  textSize(16);
  textAlign(LEFT, TOP);
  
  if (wand && wand.isTracked) {
    text(`Velocity: ${smoothVelocity.toFixed(1)}`, 20, 20);
    text(`Raindrops: ${raindrops.length}`, 20, 45);
    text('Move slowly = light rain', 20, height - 70);
    text('Move fast = heavy rain', 20, height - 45);
    text('Quick strike = lightning!', 20, height - 20);
  } else {
    text('Waiting for wand...', 20, 20);
    text(`Connected: ${connected}`, 20, 45);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
