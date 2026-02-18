module.exports = {
  // QTM machine IP address - change this to match your setup
  qtmHost: '192.168.10.1',
  
  // OSC port to SEND commands to QTM
  // This is the port QTM listens on for OSC commands
  oscSendPort: 22225,
  
  // OSC port to RECEIVE data from QTM
  // This is the port we tell QTM to send data back to us on
  oscReceivePort: 45454,
  
  // WebSocket port for browser/p5.js clients
  wsPort: 8080,
  
  // Maximum frames per second to send to WebSocket clients
  // QTM can send 100+ fps, but 30-60 is usually enough for visuals
  maxFps: 60
};
