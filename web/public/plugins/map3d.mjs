const TYPE_COLOR = {
  principle: 0x7c3aed,
  learning: 0x22d3ee,
  retro: 0xf472b6,
};
const DEFAULT_COLOR = 0x64748b;
const SPREAD = 8;

async function fetchMap() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch("/api/map3d?limit=5000", { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.documents?.length) throw new Error("empty");
    return data.documents;
  } finally {
    clearTimeout(t);
  }
}

function randomSphere(n) {
  const docs = [];
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = Math.cbrt(Math.random()) * 3;
    docs.push({
      id: `fallback-${i}`,
      type: "fallback",
      x: (r * Math.sin(phi) * Math.cos(theta)) / SPREAD,
      y: (r * Math.sin(phi) * Math.sin(theta)) / SPREAD,
      z: (r * Math.cos(phi)) / SPREAD,
      concepts: [],
    });
  }
  return docs;
}

export default {
  name: "map3d",
  mount({ scene, camera, THREE }) {
    camera.position.z = 8;

    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const build = (docs) => {
      const positions = new Float32Array(docs.length * 3);
      const colors = new Float32Array(docs.length * 3);
      const tmpColor = new THREE.Color();
      for (let i = 0; i < docs.length; i++) {
        const d = docs[i];
        positions[i * 3 + 0] = (d.x ?? 0) * SPREAD;
        positions[i * 3 + 1] = (d.y ?? 0) * SPREAD;
        positions[i * 3 + 2] = (d.z ?? 0) * SPREAD;
        tmpColor.setHex(TYPE_COLOR[d.type] ?? DEFAULT_COLOR);
        colors[i * 3 + 0] = tmpColor.r;
        colors[i * 3 + 1] = tmpColor.g;
        colors[i * 3 + 2] = tmpColor.b;
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    };

    build(randomSphere(100));
    fetchMap()
      .then((docs) => build(docs))
      .catch(() => {});

    return {
      tick() {
        points.rotation.y += 0.0008;
      },
      dispose() {
        scene.remove(points);
        geometry.dispose();
        material.dispose();
      },
    };
  },
};
