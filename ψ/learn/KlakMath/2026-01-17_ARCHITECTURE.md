# KlakMath Architecture Analysis

**Date**: 2026-01-17
**Source**: https://github.com/keijiro/KlakMath

---

## Project Overview

**KlakMath** is a lightweight extension library for the Unity Mathematics package that provides utilities for game development and animation workflows. It's structured as a Unity Package Manager (UPM) package with the namespace `Klak.Math`.

- **Current Version**: 2.1.1
- **Minimum Unity Version**: 2022.3
- **License**: Unlicense
- **Author**: Keijiro Takahashi
- **Primary Dependency**: `com.unity.mathematics@1.2.6`

---

## Directory Structure

```
KlakMath/
├── README.md
├── CHANGELOG.md
├── AGENTS.md                           # Workflow instructions for release
├── LICENSE
├── Packages/
│   ├── manifest.json
│   ├── packages-lock.json
│   └── jp.keijiro.klak.math/           # Main package
│       ├── package.json
│       └── Runtime/
│           ├── Klak.Math.asmdef
│           ├── CdsTween.cs             # Critically damped spring
│           ├── ExpTween.cs             # Exponential tweening
│           ├── Noise.cs                # 1D gradient noise
│           ├── XXHash.cs               # Fast PRNG
│           ├── Rotation.cs             # Rotation helpers
│           └── RandomExtensions.cs     # Random struct extensions
├── Assets/                             # Example scenes
│   ├── Tween/
│   ├── Noise/
│   ├── XXHash/
│   ├── Random/
│   └── Misc/
└── ProjectSettings/
```

---

## Core Components

### 1. Tweening System

**CdsTween** - Critically Damped Spring Tween
- State Model: Tuple `(position, velocity)`
- Supported Types: `float`, `float2`, `float3`, `float4`, `quaternion`
- Use: Smooth animation with physics-like spring behavior

**ExpTween** - Exponential Interpolation
- Algorithm: `math.lerp(target, x, exp(-speed * dt))`
- Use: Simpler alternative, exponential decay

### 2. Noise Generation

**Noise** - 1D Gradient Noise
- Multi-Vector: Float, Float2, Float3, Float4
- Fractal: Multi-octave versions
- Special: Rotation and FractalRotation generators

### 3. Pseudo-Random Number Generator

**XXHash** - Fast Hash-Based PRNG
- Algorithm: XXHash32 with prime constants
- Methods: UInt, Int, Float (with ranges)
- Geometric: OnCircle, InCircle, OnSphere, InSphere, Rotation

### 4. Rotation Helpers

**Rotation.FromTo()** - Quaternion from vector to vector
- Uses cross/dot products (no expensive acos)

### 5. Random Extensions

Extension methods for `Unity.Mathematics.Random`:
- `NextFloat2OnDisk()` - Point on unit disk
- `NextFloat3InSphere()` - Point inside unit sphere

---

## Design Patterns

1. **Static Classes**: Stateless, functional-style API
2. **Explicit Overloads**: Not generics, but overloads for each type
3. **Tuple State**: CdsTween uses tuples for position + velocity
4. **Deterministic Randomness**: XXHash for reproducible results
5. **Performance-Focused**: Readonly structs, no allocations

---

## Dependencies

- `com.unity.mathematics@1.2.6` only
- Self-contained, minimal footprint

---

## Key Characteristics

- **6 source files** (~800 LOC total)
- **Zero overhead**: Static API
- **Burst-compatible**: SIMD-friendly
- **Production-ready**: Used in real projects
