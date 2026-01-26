# Screen-Space Hover Detection for 3D Interactions

**Date**: 2026-01-26
**Context**: Oracle 3D Knowledge Graph - hand tracking laser pointer
**Confidence**: High

## Key Learning

When implementing hover/selection for 3D objects with user input (mouse or hand tracking), **raycasting from screen coordinates can fail at close zoom levels**. The 3D geometry doesn't change size when you zoom - only its visual representation does. This means a ray that "misses" the geometry might visually appear to be directly on the object.

The solution is **screen-space distance checking**: project all 3D positions to 2D screen coordinates, then find the closest object within a pixel threshold. This approach:

1. Matches exactly what the user sees on screen
2. Works consistently at any zoom level
3. Allows configurable "hit area" in pixels

## The Pattern

```typescript
// Project 3D nodes to 2D screen and find closest to pointer
function findClosestNode(pointerX: number, pointerY: number, meshes: THREE.Mesh[], camera: THREE.Camera, containerRect: DOMRect) {
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  let closestNode = null;
  let closestDist = Infinity;
  const threshold = 40; // pixels

  meshes.forEach(mesh => {
    // Project 3D position to 2D screen
    const pos = mesh.position.clone();
    pos.project(camera);

    // Convert from NDC (-1 to 1) to screen pixels
    const screenX = (pos.x + 1) / 2 * containerRect.width;
    const screenY = (-pos.y + 1) / 2 * containerRect.height;

    // Calculate distance to pointer
    const dist = Math.sqrt((screenX - pointerX) ** 2 + (screenY - pointerY) ** 2);

    if (dist < threshold && dist < closestDist) {
      closestDist = dist;
      closestNode = mesh.userData.node;
    }
  });

  return closestNode;
}
```

## Why This Matters

- **User expectation**: If the pointer visually overlaps an object, the user expects interaction to work
- **Zoom independence**: Raycasting accuracy depends on geometry size; screen-space works at any zoom
- **Configurable precision**: Pixel threshold can be adjusted for different input methods (mouse = smaller, hand = larger)
- **Performance**: Simple distance calculations, no need for complex intersection tests

## Tags

`three.js`, `raycasting`, `hover-detection`, `screen-space`, `hand-tracking`, `ux`
