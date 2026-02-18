// ===== CONFIGURATION =====
const BRIDGE_IP = '192.168.10.3';
const BRIDGE_PORT = 8080;

// QTM tracking volume dimensions (in mm)
const VOLUME_WIDTH = 8200;  // 8.2 meters
const VOLUME_HEIGHT = 6000;  // 6 meters

// ===== TRACKING DATA =====
let bodies = {};
let socket;
let connected = false;

function setup() {
  createCanvas(windowWidth, windowHeight);
  
  // connect to the bridge
  socket = new WebSocket(`ws://${BRIDGE_IP}:${BRIDGE_PORT}`);
  
  socket.onopen = () => {
    connected = true;
    console.log('Connected to QTM Bridge!');
  };
  
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.bodies) {
      bodies = data.bodies;
    }
  };
  
  socket.onclose = () => {
    connected = false;
    console.log('Disconnected - will retry in 2s');
    setTimeout(setup, 2000);
  };
}

function draw() {
  background(20);
  
  // get the box rigid body
  // (you can change this if needed)
  let box = bodies['box'];
  
  if (box && box.isTracked) {
    // position in mm
    let x = box.position.x;
    let y = box.position.y;
    let z = box.position.z;
    
    // rotation in degrees
    let roll = box.rotation.x;
    let pitch = box.rotation.y;
    let yaw = box.rotation.z;
    
    // === do whatever you want with the data! ===
    
    // ex: map x,y to screen position
    let screenX = map(x, -VOLUME_WIDTH/2, VOLUME_WIDTH/2, 0, width);
    let screenY = map(y, -VOLUME_HEIGHT/2, VOLUME_HEIGHT/2, height, 0);
    
    // draw circle at screenX, screenY
    fill(100, 200, 255);
    noStroke();
    ellipse(screenX, screenY, 50, 50);
    
    // raw values
    fill(255);
    textSize(14);
    text(`x: ${x.toFixed(0)} mm`, 20, 30);
    text(`y: ${y.toFixed(0)} mm`, 20, 50);
    text(`z: ${z.toFixed(0)} mm`, 20, 70);
    
  } else {
    // waiting text
    fill(100);
    textAlign(CENTER, CENTER);
    textSize(24);
    text('Waiting for "box"...', width/2, height/2);
    textSize(14);
    text(`Connected: ${connected}`, width/2, height/2 + 40);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

