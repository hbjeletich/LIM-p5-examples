# LIM p5.js Examples

Examples for connecting to the LIM room equipment from p5.js. Covers pixel-mapped lighting, NDI webcam video, and Qualisys motion tracking.

**Make sure to join the LIM Wi-Fi network!** 

Your laptop must be on the same network as the room's hardware for any of these demos to work! The LIM network has no internet, so if you need connection for a demo, use ethernet connection.\

**Watch our YouTube or in-class demos!**

This covers the basics, but to understand how to use NDI or QTM, you'll need more information.

---

## Lights (Pixel Mapping)

`lights_demo/`

Your p5.js sketch becomes the lighting in the room. Resolume Arena picks up your screen via NDI and pixel-maps it onto the fixtures.

1. Open the demo sketch and run it (e.g. with Live Server).
2. On the LIM machine, open **Resolume Arena** and add your laptop as an NDI source (it will appear on the network automatically).
3. Resolume maps regions of your output to the physical lights — just make something visual and it handles the rest.

> Keep in mind that the lights are mapped to the edges of the screen!

---

## NDI Video (Webcam)

`NDI_demo/`

Receive a live video feed from the room's NDI webcam directly into your p5.js sketch.

1. Make sure you're on the LIM Wi-Fi.
2. Open the demo sketch — it connects to the room's webcam over NDI.
3. Use the incoming video as a texture, input for effects, or however you want.

Use this demo as a base for your project.

---

## Motion Tracking (Qualisys)

`qtm-bridge/` · `qtm-example-projects/`

Stream real-time 3D position data from the Qualisys motion capture system into p5.js via OSC.

**`qtm-bridge/`** — A bridge that receives OSC data from QTM and forwards it to your sketch. We will have this running in the LIM, or you can run it yourself (NOT RECOMMENDED IF YOU DON'T KNOW WHAT YOU'RE DOING!)

**`qtm-example-projects/`** — Starter sketches that read the tracked object positions and do something with them.

### Getting started

1. Make sure QTM is running and tracking your object(s) in the room.
2. Start the bridge (`qtm-bridge/`).
3. Open one of the example projects — your tracked object's position will be available in the sketch.

You just need to have an object being motion-tracked; the bridge handles the rest.

---

## Quick Reference

| Demo | Folder | What it connects to | Protocol |
|------|--------|---------------------|----------|
| Lights | `lights_demo/` | Resolume Arena → fixtures | NDI (screen capture) |
| Webcam | `NDI_demo/` | Room camera | NDI |
| Motion tracking | `qtm-bridge/` + `qtm-example-projects/` | Qualisys Track Manager | OSC |
