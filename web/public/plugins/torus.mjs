export default {
  name: "torus",
  mount({ scene, THREE }) {
    const geometry = new THREE.TorusKnotGeometry(1, 0.3, 128, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      roughness: 0.2,
      metalness: 0.6,
      emissive: 0x164e63,
      emissiveIntensity: 0.3,
    });
    const knot = new THREE.Mesh(geometry, material);
    scene.add(knot);

    return {
      tick() {
        knot.rotation.x += 0.006;
        knot.rotation.y += 0.008;
      },
      dispose() {
        scene.remove(knot);
        geometry.dispose();
        material.dispose();
      },
    };
  },
};
