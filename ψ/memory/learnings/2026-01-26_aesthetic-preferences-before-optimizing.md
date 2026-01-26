# Ask About Aesthetic Preferences Before Optimizing

**Date**: 2026-01-26
**Context**: Graph visualization animation timing
**Confidence**: High

## Key Learning

When implementing or modifying visual elements like animations, transitions, or timing, always ask about the user's intended use case before assuming "faster is better."

In this session, I changed a 5-second animation reveal to 1.5 seconds, thinking faster would be an improvement. The user immediately pushed back: "it cool i think just come slow when i use for demo it have more liviness." We ended up at 10 seconds - even slower than the original.

The lesson: visual timing is often about experience, not efficiency. A slow reveal can be more engaging for demos, presentations, or aesthetic purposes. Speed optimization makes sense for functional interactions, but decorative or atmospheric elements may benefit from deliberate pacing.

## The Pattern

```
Before changing timing/animation:
1. Ask: "What's the primary use case?"
2. Consider: Is this functional (needs speed) or aesthetic (may benefit from deliberate pacing)?
3. If aesthetic: Ask about preference before changing
4. Test with user before committing
```

## Why This Matters

- User experience isn't always about speed
- Demo/presentation use cases often benefit from dramatic, slow reveals
- Reverting visual changes after user rejection wastes time
- Understanding use case prevents assumption-driven mistakes

## Tags

`ux`, `animation`, `user-preferences`, `visual-design`, `communication`
