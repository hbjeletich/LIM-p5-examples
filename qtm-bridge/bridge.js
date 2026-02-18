const osc = require('osc');
const WebSocket = require('ws');
const config = require('./config');
const RTObject = require('./rt-object');

// Frame rate limiting
const minFrameInterval = 1000 / config.maxFps;
let lastBroadcastTime = 0;

// Store connected WebSocket clients
const clients = new Set();

// Store current state of all rigid bodies
const rigidBodies = {};

// Track connection state
let isConnected = false;

console.log('=================================');
console.log('  QTM Bridge (OSC)');
console.log('=================================');
console.log('');

// Create WebSocket server for browser clients
const wss = new WebSocket.Server({ port: config.wsPort });

wss.on('listening', () => {
  console.log(`[WebSocket] Server running on ws://localhost:${config.wsPort}`);
});

wss.on('connection', (ws) => {
  console.log('[WebSocket] Client connected');
  clients.add(ws);

  // Send current state immediately to new client
  const initialState = {
    connected: isConnected,
    bodies: {}
  };
  for (const name in rigidBodies) {
    initialState.bodies[name] = rigidBodies[name].toJSON();
  }
  ws.send(JSON.stringify(initialState));

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (err) => {
    console.log('[WebSocket] Client error:', err.message);
    clients.delete(ws);
  });
});

// Broadcast data to all connected WebSocket clients
function broadcast(data) {
  const now = Date.now();
  
  // Frame rate limiting for broadcasts
  if (now - lastBroadcastTime < minFrameInterval) {
    return;
  }
  lastBroadcastTime = now;

  const json = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

// Create UDP port for OSC communication with QTM
const udpPort = new osc.UDPPort({
  localAddress: '0.0.0.0',
  localPort: config.oscReceivePort,
  remoteAddress: config.qtmHost,
  remotePort: config.oscSendPort,
  metadata: true
});

// Send an OSC command to QTM
function sendToQTM(args) {
  const message = {
    address: '/qtm',
    args: args.map(arg => ({ type: 's', value: String(arg) }))
  };
  
  console.log(`[OSC] Sending: /qtm ${args.join(' ')}`);
  udpPort.send(message, config.qtmHost, config.oscSendPort);
}

// Connect to QTM
function connectToQTM() {
  console.log(`[QTM] Connecting to ${config.qtmHost}...`);
  // Send Connect command with our receive port
  sendToQTM(['Connect', config.oscReceivePort]);
}

// Start streaming 6DOF Euler data
function startStreaming() {
  console.log('[QTM] Requesting 6D Euler stream...');
  sendToQTM(['StreamFrames', 'AllFrames', '6DEuler']);
  // console.log('[QTM] Requesting 3D stream...');
  // sendToQTM(['StreamFrames', 'AllFrames', '3D']);
}

// Stop streaming
function stopStreaming() {
  console.log('[QTM] Stopping stream...');
  sendToQTM(['StreamFrames', 'Stop']);
}

// Disconnect from QTM
function disconnectFromQTM() {
  console.log('[QTM] Disconnecting...');
  sendToQTM(['Disconnect']);
  isConnected = false;
}

udpPort.on('ready', () => {
  console.log(`[OSC] Listening on UDP port ${config.oscReceivePort}`);
  console.log(`[OSC] Sending to ${config.qtmHost}:${config.oscSendPort}`);
  console.log('');
  
  // Connect to QTM after a short delay
  setTimeout(() => {
    connectToQTM();
  }, 500);
});

udpPort.on('message', (oscMsg) => {
  const address = oscMsg.address;
  const args = oscMsg.args ? oscMsg.args.map(a => a.value) : [];

  // Command responses
  if (address === '/qtm/cmd_res') {
    const response = args[0];
    console.log(`[QTM] Response: ${response}`);
    
    if (response && response.includes('connected')) {
      isConnected = true;
      console.log('[QTM] Connected successfully!');
      setTimeout(() => {
        startStreaming();
      }, 500);
    }
  }
  
  // Error messages
  else if (address === '/qtm/error') {
    if (args[0]) {
      console.error(`[QTM] Error: ${args[0]}`);
    }
  }
  
  // Event notifications
  else if (address === '/qtm/event') {
    if (args[0]) {
      console.log(`[QTM] Event: ${args[0]}`);
      if (args[0].includes('Shutting Down')) {
        isConnected = false;
      }
    }
  }
  
  // 6DOF Euler data: /qtm/6d_euler/<body_name> x y z roll pitch yaw
  else if (address.startsWith('/qtm/6d_euler/')) {
    const bodyName = address.replace('/qtm/6d_euler/', '');
    
    // QTM sends: x, y, z, roll, pitch, yaw (6 values)
    if (args.length >= 6) {
      const x = args[0];
      const y = args[1];
      const z = args[2];
      const roll = args[3];
      const pitch = args[4];
      const yaw = args[5];
      
      // Check if data is valid (QTM sends very large numbers for untracked)
      const isTracked = isFinite(x) && isFinite(y) && isFinite(z) &&
                        Math.abs(x) < 100000 && Math.abs(y) < 100000 && Math.abs(z) < 100000;
      
      if (isTracked) {
        rigidBodies[bodyName] = new RTObject(
          bodyName,
          { x, y, z },
          { x: roll, y: pitch, z: yaw }
        );
        
        // Log occasionally to show it's working
        if (Math.random() < 0.01) {
          console.log(`[${bodyName}] pos(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) rot(${roll.toFixed(1)}, ${pitch.toFixed(1)}, ${yaw.toFixed(1)})`);
        }
      } else {
        rigidBodies[bodyName] = new RTObject(bodyName, null, null);
      }
      
      // Broadcast to WebSocket clients
      const output = { bodies: {} };
      for (const name in rigidBodies) {
        output.bodies[name] = rigidBodies[name].toJSON();
      }
      broadcast(output);
    }
  }
  
  // Ignore /qtm/data messages (frame metadata)
  else if (address === '/qtm/data') {
    // Frame timing data, not needed
  }
});

udpPort.on('error', (err) => {
  console.error('[OSC] Error:', err.message);
});

// Open the UDP port
udpPort.open();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('');
  console.log('[Bridge] Shutting down...');
  
  if (isConnected) {
    stopStreaming();
    setTimeout(() => {
      disconnectFromQTM();
      setTimeout(() => {
        udpPort.close();
        wss.close();
        process.exit(0);
      }, 500);
    }, 500);
  } else {
    udpPort.close();
    wss.close();
    process.exit(0);
  }
});

console.log('[Bridge] Starting up...');
console.log('');
