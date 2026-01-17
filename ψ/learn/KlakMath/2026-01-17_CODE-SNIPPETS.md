# KlakMath Code Snippets

**Date**: 2026-01-17
**Source**: https://github.com/keijiro/KlakMath

---

## 1. Exponential Tween

```csharp
// Core exponential interpolation formula
public static float Step(float x, float target, float speed, float dt)
  => math.lerp(target, x, math.exp(-speed * dt));

// Quaternion uses normalized linear interpolation
public static quaternion Step(quaternion x, quaternion target, float speed, float dt)
  => math.nlerp(target, x, math.exp(-speed * dt));
```

---

## 2. Critically Damped Spring

```csharp
// Returns tuple with new position and velocity
public static (float x, float v)
  Step((float x, float v) state, float target, float speed, float dt)
{
    var n1 = state.v - (state.x - target) * (speed * speed * dt);
    var n2 = 1 + speed * dt;
    var nv = n1 / (n2 * n2);
    return (state.x + nv * dt, nv);
}
```

---

## 3. Rotation FromTo

```csharp
// Efficient rotation without acos()
public static quaternion FromTo(float3 v1, float3 v2)
{
    var a = math.cross(v1, v2);
    var v1v2 = math.dot(v1, v1) * math.dot(v2, v2);
    var w = math.sqrt(v1v2) + math.dot(v1, v2);
    return math.normalizesafe(math.quaternion(math.float4(a, w)));
}
```

---

## 4. XXHash PRNG

```csharp
public readonly struct XXHash
{
    public uint Seed { get; }

    // Core hash calculation
    static uint CalculateHash(uint data, uint seed)
    {
        var h32 = seed + PRIME32_5;
        h32 += 4U;
        h32 += data * PRIME32_3;
        h32 = rotl32(h32, 17) * PRIME32_4;
        h32 ^= h32 >> 15;
        h32 *= PRIME32_2;
        h32 ^= h32 >> 13;
        h32 *= PRIME32_3;
        h32 ^= h32 >> 16;
        return h32;
    }
}
```

### Geometric Utilities

```csharp
// Point on unit sphere (uniform distribution)
public float3 OnSphere(uint data)
{
    var phi = Float(math.PI * 2, data);
    var z = Float(-1, 1, data + 0x10000000);
    var w = math.sqrt(1 - z * z);
    return math.float3(math.cos(phi) * w, math.sin(phi) * w, z);
}

// Point inside unit sphere
public float3 InSphere(uint data)
  => OnSphere(data) * math.pow(Float(data + 0x20000000), 1.0f / 3);

// Random quaternion (uniform on SO(3))
public quaternion Rotation(uint data)
{
    var u1 = Float(data);
    var r1 = Float(math.PI * 2, data + 0x10000000);
    var r2 = Float(math.PI * 2, data + 0x20000000);
    var s1 = math.sqrt(1 - u1);
    var s2 = math.sqrt(u1);
    var v = math.float4(s1 * math.sin(r1), s1 * math.cos(r1),
                        s2 * math.sin(r2), s2 * math.cos(r2));
    return math.quaternion(math.select(v, -v, v.w < 0));
}
```

---

## 5. Gradient Noise

```csharp
// 1D gradient noise
public static float Float(float p, uint seed)
{
    var hash = new XXHash(seed);
    var i = (uint)((int)p + 0x10000000);
    var x = math.frac(p);

    // Fade curve
    var k = math.float2(x, 1 - x);
    k = 1 - k * k;
    k = k * k * k;

    var g = math.float2(hash.Float(-1, 1, i),
                        hash.Float(-1, 1, i + 1));
    var n = math.dot(k * g, math.float2(x, x - 1));
    return n * 2 * 32 / 27;
}

// Fractal noise
public static float Fractal(float p, int octave, uint seed)
{
    var f = 0.0f;
    var w = 1.0f;
    for (var i = 0; i < octave; i++)
    {
        f += w * Float(p, seed);
        p *= 2.0f;   // Frequency doubles
        w *= 0.5f;   // Amplitude halves
    }
    return f;
}
```

---

## 6. Usage Examples

### Tween Animation

```csharp
sealed class TweenTest : MonoBehaviour
{
    (float3 p, quaternion r) _target;
    (float3 p, float4 r) _velocity;

    void Update()
    {
        var p = transform.localPosition;
        var r = transform.localRotation;

        // CdsTween with velocity tracking
        (p, _velocity.p) = CdsTween.Step((p, _velocity.p), _target.p, _speed);
        (r, _velocity.r) = CdsTween.Step((r, _velocity.r), _target.r, _speed);

        transform.localPosition = p;
        transform.localRotation = r;
    }
}
```

### XXHash Visualization

```csharp
void Start()
{
    var hash = new XXHash(_seed);
    var vertices = Enumerable.Range(0, 10000)
        .Select(i => (Vector3)(math.mul(hash.Rotation((uint)i), (float3)Vector3.right)))
        .ToArray();

    mesh.vertices = vertices;
    mesh.SetIndices(indices, MeshTopology.Points, 0);
}
```

---

## Algorithm Summary

| Algorithm | Formula |
|-----------|---------|
| **Exp Tween** | `lerp(target, x, e^(-speed*dt))` |
| **CDS Tween** | `nv = (v - Δx*speed²*dt)/(1+speed*dt)²` |
| **Rotation FromTo** | Quaternion from cross/dot products |
| **XXHash** | 32-bit mixing with PRIME constants |
| **Gradient Noise** | Interpolated random gradients |
| **Fractal Noise** | Sum with 2x freq, 0.5x amplitude |
