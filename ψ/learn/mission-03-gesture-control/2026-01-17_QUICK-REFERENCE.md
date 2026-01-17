# Gesture Control Quick Reference

**Date**: 2026-01-17
**Source**: https://github.com/Soul-Brews-Studio/mission-03-gesture-control

---

## Overview

Real-time hand gesture control system using MediaPipe for Three.js visualization.

---

## Gestures

| Gesture | Action | Detection |
|---------|--------|-----------|
| **Fist** | Stop/Pause | All fingers curled |
| **Open Palm** | Zoom control | All fingers extended |
| **Pinch** | Scale/Rotate | Thumb + Index close |
| **Point** | Trigger effect | Index only extended |
| **Peace** | Toggle mode | Index + Middle extended |

---

## Hand Landmarks

```
        8   12  16  20    <- Tips
        |   |   |   |
    4   7   11  15  19    <- DIP
    |   |   |   |   |
    3   6   10  14  18    <- PIP
    |   |   |   |   |
    2   5   9   13  17    <- MCP
     \   \  |  /   /
      1    \|/
       \    0              <- Wrist
        Thumb
```

| ID | Landmark |
|----|----------|
| 0 | Wrist |
| 4 | Thumb tip |
| 8 | Index tip |
| 12 | Middle tip |
| 16 | Ring tip |
| 20 | Pinky tip |

---

## Browser Setup (MediaPipe Hands JS)

```html
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>
```

```javascript
const hands = new Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.5
});
```

---

## Quick Gesture Detection

```javascript
// Finger tip IDs
const TIPS = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
const PIPS = { index: 6, middle: 10, ring: 14, pinky: 18 };

function detectGesture(lm) {
  // Check pinch first (most specific)
  if (dist(lm[4], lm[8]) < 0.05) return 'pinch';

  const extended = {
    index: lm[8].y < lm[6].y,
    middle: lm[12].y < lm[10].y,
    ring: lm[16].y < lm[14].y,
    pinky: lm[20].y < lm[18].y
  };

  if (!extended.index && !extended.middle && !extended.ring && !extended.pinky)
    return 'fist';

  if (extended.index && extended.middle && extended.ring && extended.pinky)
    return 'open_palm';

  if (extended.index && !extended.middle && !extended.ring && !extended.pinky)
    return 'point';

  if (extended.index && extended.middle && !extended.ring && !extended.pinky)
    return 'peace';

  return 'unknown';
}

function dist(a, b) {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);
}
```

---

## Integration with Three.js

```javascript
// Hand position -> rotation
scene.rotation.y = (handX - 0.5) * Math.PI * 2;
scene.rotation.x = (handY - 0.5) * Math.PI;

// Pinch distance -> scale
const scale = 1 + pinchDist * 3;
mesh.scale.setScalar(scale);

// Gesture -> effects
if (gesture === 'point') explode();
if (gesture === 'peace') rainbow();
if (gesture === 'fist') freeze();
```

---

## Performance Tips

1. Use `modelComplexity: 0` for faster detection
2. Debounce gesture changes (3-5 frames)
3. Skip frames if needed: process every 2nd frame
4. Use requestAnimationFrame for smooth updates
