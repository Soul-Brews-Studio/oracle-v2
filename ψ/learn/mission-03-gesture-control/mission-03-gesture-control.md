# Mission-03 Gesture Control Learning Index

## Overview

Real-time hand gesture recognition system for Three.js visualization control.

**Repo**: https://github.com/Soul-Brews-Studio/mission-03-gesture-control
**Stack**: MediaPipe Hands, Python/JavaScript, MQTT, Three.js

---

## Latest Exploration

**Date**: 2026-01-17

**Files**:
- [[2026-01-17_ARCHITECTURE|Architecture]] - System design
- [[2026-01-17_CODE-SNIPPETS|Code Snippets]] - Key implementations
- [[2026-01-17_QUICK-REFERENCE|Quick Reference]] - Usage guide

---

## Key Insights

1. **21 Landmarks** - MediaPipe provides complete hand skeleton
2. **Rule-Based Detection** - Simple distance/position checks for gestures
3. **Browser Compatible** - MediaPipe Hands JS works without server

---

## Core Components

| Component | Purpose |
|-----------|---------|
| MediaPipe Hands | 21-landmark hand tracking |
| Gesture Detector | Rule-based classification |
| MQTT | Real-time communication |
| Three.js | 3D visualization |

---

## Gestures

| Gesture | Detection | Use Case |
|---------|-----------|----------|
| Fist | All fingers curled | Stop/Pause |
| Open Palm | All fingers extended | Zoom |
| Pinch | Thumb+Index close | Scale |
| Point | Index only | Trigger |
| Peace | Index+Middle | Toggle |

---

## Timeline

### 2026-01-17 (First exploration)
- Initial discovery
- Core: MediaPipe + MQTT + Three.js pipeline
- Patterns: Landmark-based detection, gesture debouncing

---

## Quick Start (Browser)

```html
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>
```

```javascript
const hands = new Hands({ locateFile: f => `.../${f}` });
hands.setOptions({ maxNumHands: 2, minDetectionConfidence: 0.7 });
hands.onResults(results => {
  const landmarks = results.multiHandLandmarks[0];
  const gesture = detectGesture(landmarks);
  handleGesture(gesture, landmarks);
});
```

---

## Tags

`mediapipe` `gesture` `hand-tracking` `three.js` `mqtt` `real-time` `computer-vision`
