export default {
  name: "solar",
  mount({ scene, camera, THREE }) {
    camera.position.set(0, 4, 12);
    camera.lookAt(0, 0, 0);

    const sunGeo = new THREE.SphereGeometry(1.2, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    scene.add(sun);

    const sunLight = new THREE.PointLight(0xfacc15, 200, 50);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    const ambient = new THREE.AmbientLight(0x222233, 1);
    scene.add(ambient);

    const planetSpecs = [
      { radius: 2.2, size: 0.18, color: 0x94a3b8, speed: 0.018 },
      { radius: 3.1, size: 0.32, color: 0xf472b6, speed: 0.013 },
      { radius: 4.2, size: 0.38, color: 0x22d3ee, speed: 0.009 },
      { radius: 5.6, size: 0.28, color: 0xef4444, speed: 0.006 },
      { radius: 7.0, size: 0.55, color: 0x7c3aed, speed: 0.004 },
    ];

    const planets = planetSpecs.map((spec) => {
      const group = new THREE.Group();
      const geo = new THREE.SphereGeometry(spec.size, 24, 24);
      const mat = new THREE.MeshStandardMaterial({
        color: spec.color,
        roughness: 0.7,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.x = spec.radius;
      group.add(mesh);
      group.rotation.y = Math.random() * Math.PI * 2;
      scene.add(group);
      return { group, geo, mat, mesh, speed: spec.speed };
    });

    return {
      tick() {
        sun.rotation.y += 0.004;
        for (const p of planets) {
          p.group.rotation.y += p.speed;
          p.mesh.rotation.y += 0.02;
        }
      },
      dispose() {
        scene.remove(sun);
        scene.remove(sunLight);
        scene.remove(ambient);
        sunGeo.dispose();
        sunMat.dispose();
        for (const p of planets) {
          scene.remove(p.group);
          p.geo.dispose();
          p.mat.dispose();
        }
      },
    };
  },
};
