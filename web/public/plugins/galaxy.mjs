export default {
  name: "galaxy",
  mount({ scene, camera, THREE }) {
    camera.position.z = 6;

    const COUNT = 4000;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const radii = new Float32Array(COUNT);
    const palette = [
      new THREE.Color(0x7c3aed),
      new THREE.Color(0x22d3ee),
      new THREE.Color(0xf472b6),
    ];

    for (let i = 0; i < COUNT; i++) {
      const r = Math.pow(Math.random(), 0.5) * 4;
      const branch = (i % 3) * ((2 * Math.PI) / 3);
      const spin = r * 1.2;
      const theta = branch + spin + (Math.random() - 0.5) * 0.4;
      const y = (Math.random() - 0.5) * 0.3 * (1 - r / 4);

      positions[i * 3 + 0] = Math.cos(theta) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(theta) * r;

      const c = palette[i % palette.length];
      colors[i * 3 + 0] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      radii[i] = r;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.04,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    return {
      tick() {
        points.rotation.y += 0.0025;
      },
      dispose() {
        scene.remove(points);
        geometry.dispose();
        material.dispose();
      },
    };
  },
};
