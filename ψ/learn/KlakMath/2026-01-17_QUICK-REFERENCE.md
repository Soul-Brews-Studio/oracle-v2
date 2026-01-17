# KlakMath Quick Reference

**Date**: 2026-01-17
**Source**: https://github.com/keijiro/KlakMath

---

## Overview

**KlakMath** is an extension library for Unity's Mathematics package providing:
- Tweening (critically damped spring + exponential)
- Gradient noise generation
- Fast pseudo-random number generator (XXHash)
- Rotation helpers

**Version**: 2.1.1 | **Unity**: 2022.3+ | **License**: Unlicense

---

## Installation

1. Add Keijiro scoped registry to `manifest.json`:
   - https://gist.github.com/keijiro/f8c7e8ff29bfe63d86b888901b82644c

2. Install package: `jp.keijiro.klak.math`

---

## Quick Usage

### Import

```csharp
using Unity.Mathematics;
using Klak.Math;
```

### CdsTween (Critically Damped Spring)

```csharp
// State = (position, velocity)
var state = (x: 0f, v: 0f);
state = CdsTween.Step(state, target: 5f, speed: 2f);

// With quaternion
(rotation, velocity) = CdsTween.Step((rotation, velocity), target, speed);
```

### ExpTween (Exponential)

```csharp
float value = ExpTween.Step(current, target, speed);
quaternion rot = ExpTween.Step(currentRot, targetRot, speed);
```

### Noise

```csharp
float noise = Noise.Float(position, seed);
float fractal = Noise.Fractal(position, octave: 4, seed);
quaternion rot = Noise.Rotation(position, angles, seed);
```

### XXHash (Deterministic Random)

```csharp
var hash = new XXHash(seed);

// Basic
uint randomInt = hash.UInt(data);
float randomFloat = hash.Float(data);

// Geometric
float2 onCircle = hash.OnCircle(data);
float3 inSphere = hash.InSphere(data);
quaternion rotation = hash.Rotation(data);
```

### Rotation

```csharp
quaternion rot = Rotation.FromTo(fromVector, toVector);
```

### Random Extensions

```csharp
var rng = new Random(seed);
float2 onDisk = rng.NextFloat2OnDisk();
float3 inSphere = rng.NextFloat3InSphere();
```

---

## Common Patterns

### Smooth Camera Follow

```csharp
private (float3 x, float3 v) _state;

void Update()
{
    _state = CdsTween.Step(_state, target.position, speed: 5f);
    transform.position = _state.x;
}
```

### Procedural Terrain

```csharp
float GetHeight(float x, float z)
{
    return Noise.Fractal(x * 0.1f, octave: 4, seed) * 5f;
}
```

### Deterministic Spawning

```csharp
var hash = new XXHash(seed);
for (int i = 0; i < 100; i++)
{
    var pos = hash.InSphere((uint)i) * 10f;
    var rot = hash.Rotation((uint)i);
    Instantiate(prefab, pos, rot);
}
```

---

## Types Supported

| Type | CdsTween | ExpTween | Noise | XXHash |
|------|----------|----------|-------|--------|
| float | ✓ | ✓ | ✓ | ✓ |
| float2 | ✓ | ✓ | ✓ | ✓ |
| float3 | ✓ | ✓ | ✓ | ✓ |
| float4 | ✓ | ✓ | ✓ | ✓ |
| quaternion | ✓ | ✓ | ✓ | ✓ |

---

## Key Features

- **Burst-compatible**: SIMD-friendly
- **Deterministic**: Seed-based for reproducibility
- **Zero allocations**: Performance-focused
- **6 source files**: ~800 LOC total
