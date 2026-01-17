# Gesture Control Code Snippets

**Date**: 2026-01-17
**Source**: https://github.com/Soul-Brews-Studio/mission-03-gesture-control

---

## 1. MediaPipe Hand Detection (Python)

```python
import mediapipe as mp

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.5
)

def process_frame(frame):
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = hands.process(rgb)

    if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
            landmarks = [(lm.x, lm.y, lm.z) for lm in hand_landmarks.landmark]
            return landmarks
    return None
```

---

## 2. Gesture Detection Functions

```python
# Landmark IDs
THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP = 4, 8, 12, 16, 20
THUMB_IP, INDEX_PIP, MIDDLE_PIP, RING_PIP, PINKY_PIP = 3, 6, 10, 14, 18

def is_fist(landmarks):
    """All fingers curled into palm"""
    tips = [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP]
    pips = [INDEX_PIP, MIDDLE_PIP, RING_PIP, PINKY_PIP]
    return all(landmarks[tip].y > landmarks[pip].y for tip, pip in zip(tips, pips))

def is_open_palm(landmarks):
    """All fingers extended"""
    tips = [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP]
    pips = [INDEX_PIP, MIDDLE_PIP, RING_PIP, PINKY_PIP]
    return all(landmarks[tip].y < landmarks[pip].y for tip, pip in zip(tips, pips))

def is_pinch(landmarks, threshold=0.05):
    """Thumb and index tips close together"""
    thumb = landmarks[THUMB_TIP]
    index = landmarks[INDEX_TIP]
    distance = ((thumb.x - index.x)**2 + (thumb.y - index.y)**2)**0.5
    return distance < threshold

def is_point(landmarks):
    """Index extended, others curled"""
    index_extended = landmarks[INDEX_TIP].y < landmarks[INDEX_PIP].y
    others_curled = all(
        landmarks[tip].y > landmarks[pip].y
        for tip, pip in [(MIDDLE_TIP, MIDDLE_PIP), (RING_TIP, RING_PIP), (PINKY_TIP, PINKY_PIP)]
    )
    return index_extended and others_curled

def is_peace(landmarks):
    """Index and middle extended, others curled"""
    index_up = landmarks[INDEX_TIP].y < landmarks[INDEX_PIP].y
    middle_up = landmarks[MIDDLE_TIP].y < landmarks[MIDDLE_PIP].y
    ring_down = landmarks[RING_TIP].y > landmarks[RING_PIP].y
    pinky_down = landmarks[PINKY_TIP].y > landmarks[PINKY_PIP].y
    return index_up and middle_up and ring_down and pinky_down
```

---

## 3. MediaPipe Hands JavaScript (Browser)

```javascript
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.5
});

hands.onResults((results) => {
  if (results.multiHandLandmarks) {
    for (const landmarks of results.multiHandLandmarks) {
      // landmarks[0] = wrist
      // landmarks[4] = thumb tip
      // landmarks[8] = index tip
      // etc.
      handleGesture(landmarks);
    }
  }
});

const camera = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({ image: videoElement });
  },
  width: 640,
  height: 480
});
camera.start();
```

---

## 4. Gesture-to-Three.js Mapping

```javascript
function handleGesture(landmarks) {
  const gesture = detectGesture(landmarks);
  const handCenter = getHandCenter(landmarks);

  switch (gesture) {
    case 'fist':
      stopAnimation();
      break;
    case 'open_palm':
      setZoom(getPalmSize(landmarks));
      break;
    case 'pinch':
      const pinchDist = getPinchDistance(landmarks);
      setScale(pinchDist * 5);
      break;
    case 'point':
      triggerExplosion(handCenter);
      break;
    case 'peace':
      toggleRainbowMode();
      break;
  }

  // Hand position controls rotation
  globe.rotation.y = (handCenter.x - 0.5) * Math.PI * 2;
  globe.rotation.x = (handCenter.y - 0.5) * Math.PI;
}

function getHandCenter(landmarks) {
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  return {
    x: (wrist.x + middleMcp.x) / 2,
    y: (wrist.y + middleMcp.y) / 2
  };
}
```

---

## 5. Distance Calculations

```javascript
function getPinchDistance(landmarks) {
  const thumb = landmarks[4];  // Thumb tip
  const index = landmarks[8];  // Index tip
  return Math.sqrt(
    Math.pow(thumb.x - index.x, 2) +
    Math.pow(thumb.y - index.y, 2) +
    Math.pow(thumb.z - index.z, 2)
  );
}

function getPalmSize(landmarks) {
  const wrist = landmarks[0];
  const middleTip = landmarks[12];
  return Math.sqrt(
    Math.pow(wrist.x - middleTip.x, 2) +
    Math.pow(wrist.y - middleTip.y, 2)
  );
}
```

---

## 6. Smooth Gesture Transitions

```javascript
class GestureState {
  constructor() {
    this.current = null;
    this.buffer = [];
    this.bufferSize = 5;  // Debounce frames
  }

  update(gesture) {
    this.buffer.push(gesture);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift();
    }

    // Only change if majority agree
    const counts = {};
    for (const g of this.buffer) {
      counts[g] = (counts[g] || 0) + 1;
    }

    const majority = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])[0];

    if (majority[1] >= 3 && majority[0] !== this.current) {
      this.current = majority[0];
      return true;  // Gesture changed
    }
    return false;
  }
}
```
