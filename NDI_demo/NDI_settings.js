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