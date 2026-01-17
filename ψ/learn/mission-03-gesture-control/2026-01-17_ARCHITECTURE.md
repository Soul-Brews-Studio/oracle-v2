# Mission-03 Gesture Control Architecture

**Date**: 2026-01-17
**Source**: https://github.com/Soul-Brews-Studio/mission-03-gesture-control

---

## Overview

Real-time hand gesture recognition system using MediaPipe for hand tracking, custom gesture detection, and MQTT for communication with visualizers.

---

## System Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Camera    │────▶│ Hand Tracker │────▶│  Gesture    │
│   Input     │     │  (MediaPipe) │     │  Detector   │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                 │
                                                 ▼
                    ┌──────────────┐     ┌──────────────┐
                    │   Three.js   │◀────│    MQTT      │
                    │  Visualizer  │     │   Broker     │
                    └──────────────┘     └──────────────┘
```

---

## Directory Structure

```
mission-03-gesture-control/
├── hand_tracker.py          # MediaPipe landmark detection
├── gesture_detector.py      # Rule-based gesture classification
├── main.py                  # Entry point, MQTT publisher
├── visualizer/
│   ├── index.html           # Three.js globe
│   ├── app.js               # Globe controls
│   └── mqtt-handler.js      # MQTT subscriber
└── requirements.txt
```

---

## Core Components

### 1. Hand Tracker (hand_tracker.py)

Uses MediaPipe Hands to detect 21 landmarks per hand:

```
Landmarks:
0  - WRIST
1-4   - THUMB (CMC, MCP, IP, TIP)
5-8   - INDEX (MCP, PIP, DIP, TIP)
9-12  - MIDDLE (MCP, PIP, DIP, TIP)
13-16 - RING (MCP, PIP, DIP, TIP)
17-20 - PINKY (MCP, PIP, DIP, TIP)
```

### 2. Gesture Detector (gesture_detector.py)

Rule-based detection using finger states:

| Gesture | Detection Logic |
|---------|-----------------|
| **fist** | All fingers curled |
| **open_palm** | All fingers extended |
| **pinch** | Thumb tip near index tip |
| **point** | Index extended, others curled |
| **peace** | Index + middle extended |

### 3. MQTT Communication

- **Topic**: `gesture/hand`
- **Payload**: `{ gesture, landmarks, confidence }`
- **Broker**: localhost:1883

### 4. Three.js Visualizer

- Globe rotation controlled by hand position
- Gesture-triggered effects (zoom, particles)
- Real-time feedback

---

## Data Flow

1. **Capture**: Webcam frame at 30fps
2. **Track**: MediaPipe extracts 21 landmarks (x, y, z)
3. **Detect**: Gesture classified from landmark positions
4. **Publish**: MQTT message with gesture + landmarks
5. **Visualize**: Three.js responds to gestures

---

## Key Algorithms

### Finger Extended Check

```python
def is_finger_extended(landmarks, finger_tip_id, finger_pip_id):
    tip = landmarks[finger_tip_id]
    pip = landmarks[finger_pip_id]
    return tip.y < pip.y  # In screen coords, y increases downward
```

### Pinch Distance

```python
def get_pinch_distance(landmarks):
    thumb_tip = landmarks[4]
    index_tip = landmarks[8]
    return math.sqrt(
        (thumb_tip.x - index_tip.x)**2 +
        (thumb_tip.y - index_tip.y)**2
    )
```

---

## Integration Points

- **Browser**: Use MediaPipe Hands JS for web-based tracking
- **WebSocket**: Alternative to MQTT for browser communication
- **Three.js**: Direct integration possible without server
