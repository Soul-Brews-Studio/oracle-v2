export default {
  name: "wave",
  mount({ scene, camera, THREE }) {
    camera.position.set(0, 3, 5);
    camera.lookAt(0, 0, 0);

    const geometry = new THREE.PlaneGeometry(10, 10, 64, 64);
    const material = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      wireframe: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2.4;
    scene.add(mesh);

    const position = geometry.attributes.position;
    const original = new Float32Array(position.array.length);
    original.set(position.array);

    let time = 0;

    return {
      tick() {
        time += 0.03;
        const arr = position.array;
        for (let i = 0; i < position.count; i++) {
          const ix = i * 3;
          const x = original[ix];
          const y = original[ix + 1];
          arr[ix + 2] = Math.sin(x + time) * Math.cos(y + time) * 0.5;
        }
        position.needsUpdate = true;
        geometry.computeVertexNormals();
        mesh.rotation.z += 0.002;
      },
      dispose() {
        scene.remove(mesh);
        geometry.dispose();
        material.dispose();
      },
    };
  },
};
