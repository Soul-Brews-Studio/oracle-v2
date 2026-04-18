export default {
  name: "cube",
  mount({ scene, THREE }) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0x7c3aed,
      roughness: 0.4,
      metalness: 0.2,
    });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    return {
      tick() {
        cube.rotation.x += 0.01;
        cube.rotation.y += 0.012;
      },
      dispose() {
        scene.remove(cube);
        geometry.dispose();
        material.dispose();
      },
    };
  },
};
