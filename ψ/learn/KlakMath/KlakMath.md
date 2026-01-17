# KlakMath Learning Index

## Overview

Unity Mathematics extension library by Keijiro Takahashi providing:
- Tweening (CdsTween, ExpTween)
- Gradient Noise
- XXHash PRNG
- Rotation helpers

**Repo**: https://github.com/keijiro/KlakMath
**Version**: 2.1.1
**Unity**: 2022.3+

---

## Latest Exploration

**Date**: 2026-01-17

**Files**:
- [[2026-01-17_ARCHITECTURE|Architecture]] - Structure & components
- [[2026-01-17_CODE-SNIPPETS|Code Snippets]] - Key implementations
- [[2026-01-17_QUICK-REFERENCE|Quick Reference]] - Usage guide

---

## Key Insights

1. **Critically Damped Spring** - Physics-based tween with zero overshoot, perfect for camera smoothing
2. **XXHash for Determinism** - Same seed = same results, great for procedural generation
3. **Minimal Footprint** - 6 files, ~800 LOC, no external dependencies except Unity.Mathematics

---

## Core Components

| Component | Purpose |
|-----------|---------|
| CdsTween | Critically damped spring interpolation |
| ExpTween | Exponential decay interpolation |
| Noise | Gradient noise with fractal support |
| XXHash | Fast deterministic PRNG |
| Rotation | Vector-to-vector quaternion |
| RandomExtensions | Disk/sphere distribution |

---

## Timeline

### 2026-01-17 (First exploration)
- Initial discovery
- Core: Unity math extensions for gamedev
- Patterns: Static API, tuple state, deterministic random

---

## Quick Start

```csharp
using Klak.Math;

// Smooth follow
(pos, vel) = CdsTween.Step((pos, vel), target, speed);

// Deterministic random
var hash = new XXHash(seed);
float3 point = hash.InSphere(i);

// Noise
float height = Noise.Fractal(x, octave: 4, seed);
```

---

## Tags

`unity` `mathematics` `tween` `noise` `prng` `xxhash` `gamedev` `keijiro`
