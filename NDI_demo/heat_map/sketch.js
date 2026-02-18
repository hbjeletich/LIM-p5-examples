// ============================================================
// Motion Heatmap — p5.js sketch
//
// How it works:
//   1. Grab a frame from the camera
//   2. Convert each pixel to brightness (grayscale)
//   3. Compare to the previous frame — any change = motion
//   4. Add that motion energy into a "heatmap" buffer
//   5. Each frame, the heatmap slowly decays (fades)
//   6. Blur the heatmap so it looks blobby, not pixelated
//   7. Color-map the values and draw to the canvas
//
// The processing happens at a low resolution on purpose —
// it keeps things fast and makes the blobs chunky.
// We scale up with interpolation when drawing to the canvas.
// ============================================================


// ── SETTINGS — tweak these! ─────────────────────────────────

const SETTINGS = {

  // Processing resolution. Lower = blobbier & faster.
  // The camera image gets downsampled to this before processing.
  procWidth:  160,
  procHeight: 120,

  // How much brightness change counts as "motion".
  // Lower = more sensitive to subtle movement.
  // Range: ~5 (picks up everything) to ~80 (only big changes).
  sensitivity: 30,

  // How fast motion energy builds up in the heatmap.
  // Higher = hot spots appear faster.
  accumulation: 0.8,

  // How quickly the heatmap fades each frame.
  // 1.0 = never fades, 0.9 = fades fast, 0.99 = slow fade.
  decay: 0.985,

  // Number of blur passes per frame. More = bigger, softer blobs.
  blurPasses: 6,

  // Multiplier on the final brightness. Crank up if the image
  // looks too dark, turn down if it's blowing out.
  brightness: 1.0,

  // "heatmap" — color-mapped heat only
  // "overlay" — dim camera feed with heat blended on top
  // "diff"    — raw motion difference (white on black)
  viewMode: "heatmap",

  // "thermal" — black → blue → red → yellow → white
  // "plasma"  — purple → pink → orange → yellow
  // "cool"    — dark blue → cyan → mint
  palette: "thermal",
};


// ── STATE (don't need to touch these) ───────────────────────

let capture;     // p5 camera capture
let prevFrame;   // previous frame brightness values
let heatmap;     // accumulated motion energy per pixel
let started = false;


// ============================================================
//  p5.js setup & draw
// ============================================================

const sketch = (p) => {

  p.setup = function () {
    const wrap = document.getElementById("canvas-wrap");
    const cnv = p.createCanvas(wrap.clientWidth, wrap.clientHeight);
    cnv.parent("canvas-wrap");
    p.pixelDensity(1);

    // Initialize buffers with zeros
    const numPixels = SETTINGS.procWidth * SETTINGS.procHeight;
    heatmap   = new Float32Array(numPixels);
    prevFrame = new Float32Array(numPixels);
  };


  p.draw = function () {
    p.background(0);
    if (!capture || !started) return;

    const W = SETTINGS.procWidth;
    const H = SETTINGS.procHeight;

    // ── Step 1: Grab camera frame at low resolution ──
    const frame = p.createGraphics(W, H);
    frame.image(capture, 0, 0, W, H);
    frame.loadPixels();

    // ── Step 2–3: Compute brightness & detect motion ──
    const currBrightness = new Float32Array(W * H);
    const threshold = SETTINGS.sensitivity / 255;

    for (let i = 0; i < W * H; i++) {
      const pi = i * 4; // each pixel = 4 values: R, G, B, A

      // Perceived brightness (human-weighted RGB)
      currBrightness[i] =
        (frame.pixels[pi]     * 0.299 +
         frame.pixels[pi + 1] * 0.587 +
         frame.pixels[pi + 2] * 0.114) / 255;

      // How much did this pixel change since last frame?
      const diff = Math.abs(currBrightness[i] - prevFrame[i]);

      if (diff > threshold) {
        heatmap[i] += (diff - threshold) * SETTINGS.accumulation;
      }
    }

    // Save this frame for next comparison
    prevFrame.set(currBrightness);

    // ── Step 4: Decay the heatmap ──
    let peakHeat = 0;
    for (let i = 0; i < heatmap.length; i++) {
      heatmap[i] *= SETTINGS.decay;
      if (heatmap[i] > peakHeat) peakHeat = heatmap[i];
    }

    // ── Step 5: Blur for blobby look ──
    blurHeatmap(SETTINGS.blurPasses, W, H);

    // ── Step 6: Render to the canvas ──
    renderToCanvas(p, frame, Math.max(peakHeat, 0.01));

    frame.remove();
  };


  p.windowResized = function () {
    const wrap = document.getElementById("canvas-wrap");
    p.resizeCanvas(wrap.clientWidth, wrap.clientHeight);
  };
};


// ============================================================
//  Blur — simple box blur applied multiple times
// ============================================================
// Each pass averages a pixel with its 4 neighbors.
// More passes = bigger, softer blobs.

function blurHeatmap(passes, w, h) {
  const temp = new Float32Array(heatmap.length);

  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;

        // Weighted average: center heavy, neighbors lighter
        let sum = heatmap[i] * 0.4;
        sum += (x > 0     ? heatmap[i - 1] : heatmap[i]) * 0.15;
        sum += (x < w - 1 ? heatmap[i + 1] : heatmap[i]) * 0.15;
        sum += (y > 0     ? heatmap[i - w] : heatmap[i]) * 0.15;
        sum += (y < h - 1 ? heatmap[i + w] : heatmap[i]) * 0.15;

        temp[i] = sum;
      }
    }
    heatmap.set(temp);
  }
}


// ============================================================
//  Render — scale up the low-res heatmap to fill the canvas
// ============================================================
// Uses bilinear interpolation so the upscale looks smooth
// and organic, not blocky.

function renderToCanvas(p, frame, maxHeat) {
  const W = SETTINGS.procWidth;
  const H = SETTINGS.procHeight;
  const cw = p.width;
  const ch = p.height;

  p.loadPixels();

  for (let py = 0; py < ch; py++) {
    for (let px = 0; px < cw; px++) {

      // Map this canvas pixel back to the low-res grid
      const sx = (px / cw) * (W - 1);
      const sy = (py / ch) * (H - 1);

      // Bilinear interpolation: blend the 4 nearest grid cells
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, W - 1);
      const y1 = Math.min(y0 + 1, H - 1);
      const fx = sx - x0;
      const fy = sy - y0;

      let val =
        heatmap[y0 * W + x0] * (1 - fx) * (1 - fy) +
        heatmap[y0 * W + x1] * fx       * (1 - fy) +
        heatmap[y1 * W + x0] * (1 - fx) * fy +
        heatmap[y1 * W + x1] * fx       * fy;

      // Normalize to 0–1
      val = clamp((val / maxHeat) * SETTINGS.brightness);

      // Write pixel
      const oi = (py * cw + px) * 4;
      const color = getColor(val);

      if (SETTINGS.viewMode === "diff") {
        // Raw motion: white on black
        const b = val * 255;
        p.pixels[oi]     = b;
        p.pixels[oi + 1] = b;
        p.pixels[oi + 2] = b;

      } else if (SETTINGS.viewMode === "overlay") {
        // Dim camera + heatmap blended on top
        const gi = (y0 * W + x0) * 4;
        const alpha = clamp(val * 1.8);
        p.pixels[oi]     = lerp(frame.pixels[gi]     * 0.4, color[0], alpha);
        p.pixels[oi + 1] = lerp(frame.pixels[gi + 1] * 0.4, color[1], alpha);
        p.pixels[oi + 2] = lerp(frame.pixels[gi + 2] * 0.4, color[2], alpha);

      } else {
        // Pure heatmap
        p.pixels[oi]     = color[0];
        p.pixels[oi + 1] = color[1];
        p.pixels[oi + 2] = color[2];
      }

      p.pixels[oi + 3] = 255;
    }
  }

  p.updatePixels();
}


// ============================================================
//  Color Palettes
// ============================================================
// Each maps a 0–1 value to [R, G, B].
// Low = cool/dark, high = hot/bright.

function getColor(t) {
  if (SETTINGS.palette === "plasma") return plasmaColor(t);
  if (SETTINGS.palette === "cool")   return coolColor(t);
  return thermalColor(t);
}

// Black → Blue → Red → Yellow → White
function thermalColor(t) {
  if (t < 0.2)  return [0, 0, (t / 0.2) * 100];
  if (t < 0.45) return [((t - 0.2) / 0.25) * 255, 0, 100 - ((t - 0.2) / 0.25) * 100];
  if (t < 0.7)  return [255, ((t - 0.45) / 0.25) * 200, 0];
  return [255, 200 + ((t - 0.7) / 0.3) * 55, ((t - 0.7) / 0.3) * 255];
}

// Purple → Pink → Orange → Yellow
function plasmaColor(t) {
  return [
    255 * clamp(Math.abs(t * 3 - 1.5) - 0.2),
    255 * clamp(Math.sin(t * Math.PI)),
    255 * clamp(1 - Math.abs(t * 2 - 0.8)),
  ];
}

// Dark blue → Cyan → Mint
function coolColor(t) {
  if (t < 0.3) return [0, (t / 0.3) * 60, (t / 0.3) * 120];
  if (t < 0.6) return [0, 60 + ((t - 0.3) / 0.3) * 195, 120 + ((t - 0.3) / 0.3) * 80];
  return [((t - 0.6) / 0.4) * 180, 255, 200 + ((t - 0.6) / 0.4) * 55];
}


// ============================================================
//  Utilities
// ============================================================

function clamp(v) {
  return Math.max(0, Math.min(1, v));
}

function lerp(a, b, t) {
  return Math.floor(a * (1 - t) + b * t);
}


// ============================================================
//  Start — request camera and launch the sketch
// ============================================================
// Uses getUserMedia which grabs a webcam.
// For NDI: route through OBS Virtual Camera or NDI Virtual Input
// so the NDI feed appears as a regular webcam device.

document.getElementById("start-btn").addEventListener("click", async () => {
  try {
    const p5Instance = new p5(sketch);
    await new Promise((r) => setTimeout(r, 200));

    capture = p5Instance.createCapture(p5Instance.VIDEO);
    capture.size(SETTINGS.procWidth, SETTINGS.procHeight);
    capture.hide();

    document.getElementById("start-overlay").classList.add("hidden");
    started = true;

  } catch (e) {
    console.error("Camera error:", e);
    document.getElementById("start-btn").textContent = "Camera denied — retry";
  }
});