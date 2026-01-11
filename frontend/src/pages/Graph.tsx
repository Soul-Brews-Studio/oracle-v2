import { useState, useEffect, useRef } from 'react';
import { getGraph, getFile } from '../api/oracle';
import styles from './Graph.module.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

interface Node {
  id: string;
  type: string;
  label?: string;
  source_file?: string;
  concepts?: string[];
}

interface Link {
  source: string;
  target: string;
}

const TYPE_COLORS: Record<string, number> = {
  principle: 0xa78bfa,
  learning: 0x4ade80,
  retro: 0x60a5fa,
};

// ========================================
// KlakMath Implementations
// ========================================

function xxhash(seed: number, data: number): number {
  let h = (seed + 374761393) >>> 0;
  h = (h + (data * 3266489917 >>> 0)) >>> 0;
  h = (((h << 17) | (h >>> 15)) * 668265263) >>> 0;
  h ^= h >>> 15;
  h = (h * 2246822519) >>> 0;
  h ^= h >>> 13;
  h = (h * 3266489917) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function hashOnSphere(seed: number, data: number): THREE.Vector3 {
  const phi = xxhash(seed, data) * Math.PI * 2;
  const cosTheta = xxhash(seed, data + 0x10000000) * 2 - 1;
  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
  return new THREE.Vector3(sinTheta * Math.cos(phi), sinTheta * Math.sin(phi), cosTheta);
}

function cdsTween(state: { x: number; v: number }, target: number, speed: number, dt: number) {
  const n1 = state.v - (state.x - target) * (speed * speed * dt);
  const n2 = 1 + speed * dt;
  const nv = n1 / (n2 * n2);
  return { x: state.x + nv * dt, v: nv };
}

function noise1D(p: number, seed: number): number {
  const i = Math.floor(p);
  const f = p - i;
  const u = f * f * (3 - 2 * f);
  const g0 = xxhash(seed, i) * 2 - 1;
  const g1 = xxhash(seed, i + 1) * 2 - 1;
  return g0 * (1 - u) + g1 * u;
}

function fractalNoise(p: number, octaves: number, seed: number): number {
  let f = 0, w = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    f += w * noise1D(p, seed + i);
    max += w;
    p *= 2;
    w *= 0.5;
  }
  return f / max;
}

export function Graph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [viewingFile, setViewingFile] = useState<{ path: string; content: string } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [animMode, setAnimMode] = useState<'calm' | 'pulse' | 'rush'>('pulse');
  const autoRotateRef = useRef(true);
  const animModeRef = useRef<'calm' | 'pulse' | 'rush'>('pulse');
  const selectedIdRef = useRef<string | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());

  // Keep refs in sync with state
  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    animModeRef.current = animMode;
  }, [animMode]);

  useEffect(() => {
    selectedIdRef.current = selectedNode?.id || null;
  }, [selectedNode]);

  async function openFile(path: string) {
    setLoadingFile(true);
    try {
      const result = await getFile(path);
      if (!result.error) {
        setViewingFile({ path, content: result.content });
      }
    } catch (e) {
      console.error('Failed to load file:', e);
    } finally {
      setLoadingFile(false);
    }
  }
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    meshes: THREE.Mesh[];
    lines: THREE.LineSegments | null;
    animationId: number;
    cameraSpring: { x: number; v: number };
    cameraSpringY: { x: number; v: number };
    mouseX: number;
    mouseY: number;
  } | null>(null);

  useEffect(() => {
    loadGraph();
  }, []);

  async function loadGraph() {
    try {
      const data = await getGraph();
      setNodes(data.nodes || []);
      setLinks(data.links || []);
    } catch (e) {
      console.error('Failed to load graph:', e);
    } finally {
      setLoading(false);
    }
  }

  // Three.js setup
  useEffect(() => {
    if (nodes.length === 0 || !containerRef.current) return;

    const container = containerRef.current;
    const width = 800;
    const height = 600;
    const SEED = 42;

    // Scene - slightly lighter than page bg for contrast
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12121a);

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(0, 0, 8);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0x404040, 0.6));
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 5, 5);
    scene.add(light);

    // OrbitControls for zoom/pan/rotate
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 3;
    controls.maxDistance = 20;

    // Create node meshes with XXHash positions
    const geometry = new THREE.SphereGeometry(0.06, 12, 12);
    const meshes: THREE.Mesh[] = [];
    const nodeMap = new Map<string, { mesh: THREE.Mesh; basePos: THREE.Vector3; noiseOffset: number }>();

    // Layer radii by type
    const RADII: Record<string, number> = { principle: 3.5, learning: 2.5, retro: 1.5 };

    nodes.forEach((node, i) => {
      const color = TYPE_COLORS[node.type] || 0x888888;
      const material = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.3 });
      const mesh = new THREE.Mesh(geometry, material);

      // XXHash deterministic position on sphere
      const radius = RADII[node.type] || 2.5;
      const pos = hashOnSphere(SEED, i).multiplyScalar(radius);
      mesh.position.copy(pos);

      mesh.userData = { node, index: i };
      scene.add(mesh);
      meshes.push(mesh);
      nodeMap.set(node.id, { mesh, basePos: pos.clone(), noiseOffset: xxhash(SEED, i + 1000) * 100 });
    });

    // Build link index for fast lookup
    const linkIndex = new Map<string, string[]>();
    links.forEach(link => {
      if (!linkIndex.has(link.source)) linkIndex.set(link.source, []);
      if (!linkIndex.has(link.target)) linkIndex.set(link.target, []);
      linkIndex.get(link.source)!.push(link.target);
      linkIndex.get(link.target)!.push(link.source);
    });

    // Dynamic lines for hover connections (max 100 lines)
    const maxHoverLines = 100;
    const lineGeometry = new THREE.BufferGeometry();
    const linePositions = new Float32Array(maxHoverLines * 6);
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    lineGeometry.setDrawRange(0, 0);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.8, transparent: true });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    // Track current hover for line updates
    let currentHoverId: string | null = null;

    // Ambient animation settings per mode
    const modeSettings = {
      calm: { interval: 3, connections: 5, breathe: 0.3, rotate: 0.03 },
      pulse: { interval: 0.8, connections: 10, breathe: 0.8, rotate: 0.08 },
      rush: { interval: 0.15, connections: 20, breathe: 2.0, rotate: 0.2 }
    };
    let ambientNodeIndex = 0;
    let ambientTimer = 0;
    let frozenTime = 0;

    // Store refs
    sceneRef.current = {
      scene, camera, renderer, meshes, lines,
      animationId: 0,
      cameraSpring: { x: 0, v: 0 },
      cameraSpringY: { x: 0, v: 0 },
      mouseX: 0, mouseY: 0
    };

    // Animation
    const clock = new THREE.Clock();
    function animate() {
      if (!sceneRef.current) return;
      const { scene, camera, renderer, meshes, cameraSpring, cameraSpringY, mouseX, mouseY } = sceneRef.current;
      const rawTime = clock.getElapsedTime();
      const dt = 1 / 60;

      // Freeze animation when hovering or selected
      const isFrozen = currentHoverId !== null || selectedIdRef.current !== null;
      if (isFrozen && frozenTime === 0) {
        frozenTime = rawTime;
      } else if (!isFrozen) {
        frozenTime = 0;
      }
      const time = isFrozen ? frozenTime : rawTime;

      // Get current mode settings
      const settings = modeSettings[animModeRef.current];
      const hasSelection = currentHoverId || selectedIdRef.current;

      // Noise breathing + update positions
      const breatheSpeed = hasSelection ? 0.5 : settings.breathe;
      meshes.forEach((mesh, i) => {
        const data = nodeMap.get(nodes[i]?.id);
        if (!data) return;
        const n = fractalNoise(time * breatheSpeed + data.noiseOffset, 3, SEED);
        const scale = 1 + n * 0.1;
        mesh.position.copy(data.basePos).multiplyScalar(scale);
        mesh.rotation.y = time * 0.3;
      });

      // Update lines - priority: hover > selected > ambient
      const activeId = currentHoverId || selectedIdRef.current || nodes[ambientNodeIndex]?.id;
      if (activeId && lines) {
        const connectedIds = linkIndex.get(activeId) || [];
        const sourceData = nodeMap.get(activeId);
        if (sourceData) {
          const positions = lines.geometry.attributes.position.array as Float32Array;
          let idx = 0;
          // Show connections based on mode
          const maxShow = hasSelection ? 50 : settings.connections;
          const count = Math.min(connectedIds.length, maxShow, maxHoverLines);
          for (let i = 0; i < count; i++) {
            const targetData = nodeMap.get(connectedIds[i]);
            if (targetData) {
              const sn = fractalNoise(time * 0.5 + sourceData.noiseOffset, 3, SEED);
              const tn = fractalNoise(time * 0.5 + targetData.noiseOffset, 3, SEED);
              const sp = sourceData.basePos.clone().multiplyScalar(1 + sn * 0.08);
              const tp = targetData.basePos.clone().multiplyScalar(1 + tn * 0.08);
              positions[idx++] = sp.x; positions[idx++] = sp.y; positions[idx++] = sp.z;
              positions[idx++] = tp.x; positions[idx++] = tp.y; positions[idx++] = tp.z;
            }
          }
          lines.geometry.attributes.position.needsUpdate = true;
          lines.geometry.setDrawRange(0, count * 2);
          // Adjust opacity - bright for hover/selected, visible for ambient
          (lines.material as THREE.LineBasicMaterial).opacity = hasSelection ? 0.9 : 0.6;
        }
      }

      // Ambient timer - cycle to next node (only when nothing is hovered or selected)
      if (!hasSelection) {
        ambientTimer += dt;
        if (ambientTimer > settings.interval) {
          ambientTimer = 0;
          ambientNodeIndex = (ambientNodeIndex + Math.floor(Math.random() * 10) + 1) % nodes.length;
        }
      }

      // CdsTween camera follow mouse
      const newSpringX = cdsTween(cameraSpring, mouseX * 3, 4, dt);
      const newSpringY = cdsTween(cameraSpringY, mouseY * 2, 4, dt);
      sceneRef.current.cameraSpring = newSpringX;
      sceneRef.current.cameraSpringY = newSpringY;
      camera.position.x = newSpringX.x;
      camera.position.y = newSpringY.x;
      camera.lookAt(0, 0, 0);

      // Rotation speed (controlled by autoRotate and mode)
      if (autoRotateRef.current) {
        const rotateSpeed = hasSelection ? 0 : settings.rotate;
        scene.rotation.y = time * rotateSpeed;
      }

      renderer.render(scene, camera);
      sceneRef.current.animationId = requestAnimationFrame(animate);
    }

    animate();

    // Mouse tracking + hover detection
    const handleMouseMove = (e: MouseEvent) => {
      if (!sceneRef.current) return;
      const rect = container.getBoundingClientRect();
      const normalizedX = ((e.clientX - rect.left) / width) * 2 - 1;
      const normalizedY = -((e.clientY - rect.top) / height) * 2 + 1;
      sceneRef.current.mouseX = normalizedX;
      sceneRef.current.mouseY = normalizedY;

      // Update mouse position for tooltip
      setMousePos({ x: e.clientX, y: e.clientY });

      // Raycasting for hover detection
      const mouse = new THREE.Vector2(normalizedX, normalizedY);
      raycasterRef.current.setFromCamera(mouse, camera);
      const intersects = raycasterRef.current.intersectObjects(meshes);

      if (intersects.length > 0) {
        const hovered = intersects[0].object.userData.node as Node;
        setHoveredNode(hovered);
        currentHoverId = hovered.id;
        container.style.cursor = 'pointer';
      } else {
        setHoveredNode(null);
        currentHoverId = null;
        // Lines will show ambient animation when not hovering
        container.style.cursor = 'grab';
      }
    };
    container.addEventListener('mousemove', handleMouseMove);

    // Click detection
    const clickRaycaster = new THREE.Raycaster();
    const handleClick = (e: MouseEvent) => {
      if (!sceneRef.current) return;
      const rect = container.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / width) * 2 - 1,
        -((e.clientY - rect.top) / height) * 2 + 1
      );
      clickRaycaster.setFromCamera(mouse, camera);
      const intersects = clickRaycaster.intersectObjects(meshes);
      if (intersects.length > 0) {
        const clicked = intersects[0].object.userData.node as Node;
        setSelectedNode(clicked);
        // selectedIdRef will be updated via useEffect
      } else {
        setSelectedNode(null);
      }
    };
    container.addEventListener('click', handleClick);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('click', handleClick);
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId);
        sceneRef.current.renderer.dispose();
      }
    };
  }, [nodes, links]);

  if (loading) {
    return <div className={styles.loading}>Loading graph...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Knowledge Graph</h1>
        <div className={styles.stats}>
          {nodes.length} nodes · {links.length} links
        </div>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.dot} style={{ background: '#a78bfa' }}></span>
          Principle
        </span>
        <span className={styles.legendItem}>
          <span className={styles.dot} style={{ background: '#4ade80' }}></span>
          Learning
        </span>
        <span className={styles.legendItem}>
          <span className={styles.dot} style={{ background: '#60a5fa' }}></span>
          Retro
        </span>
      </div>

      <div className={styles.graphContainer}>
        <div className={styles.canvasWrapper} ref={containerRef} />
        <div className={styles.hud}>
          <div className={styles.modeSelector}>
            <button
              className={`${styles.modeButton} ${animMode === 'calm' ? styles.active : ''}`}
              onClick={() => setAnimMode('calm')}
              title="Calm"
            >
              ~
            </button>
            <button
              className={`${styles.modeButton} ${animMode === 'pulse' ? styles.active : ''}`}
              onClick={() => setAnimMode('pulse')}
              title="Pulse"
            >
              ◎
            </button>
            <button
              className={`${styles.modeButton} ${animMode === 'rush' ? styles.active : ''}`}
              onClick={() => setAnimMode('rush')}
              title="Rush"
            >
              ⚡
            </button>
          </div>
          <button
            className={`${styles.hudButton} ${autoRotate ? styles.active : ''}`}
            onClick={() => setAutoRotate(!autoRotate)}
            title="Auto Rotate"
          >
            ↻
          </button>
          <button
            className={styles.hudButton}
            onClick={() => {
              if (sceneRef.current) {
                sceneRef.current.camera.position.set(0, 0, 8);
              }
            }}
            title="Reset View"
          >
            ⌂
          </button>
          <button
            className={styles.hudButton}
            onClick={() => {
              if (sceneRef.current) {
                sceneRef.current.camera.position.z *= 0.8;
              }
            }}
            title="Zoom In"
          >
            +
          </button>
          <button
            className={styles.hudButton}
            onClick={() => {
              if (sceneRef.current) {
                sceneRef.current.camera.position.z *= 1.2;
              }
            }}
            title="Zoom Out"
          >
            −
          </button>
        </div>
      </div>

      {selectedNode && (
        <div className={styles.nodeInfo}>
          <div className={styles.nodeInfoHeader}>
            <span className={styles.nodeType}>{selectedNode.type.toUpperCase()}</span>
            <button className={styles.closeButton} onClick={() => setSelectedNode(null)}>×</button>
          </div>
          <h3 className={styles.nodeTitle}>
            {selectedNode.source_file?.split('/').pop()?.replace('.md', '') || selectedNode.id}
          </h3>
          {selectedNode.concepts && selectedNode.concepts.length > 0 && (
            <p className={styles.nodeConcepts}>{selectedNode.concepts.join(' · ')}</p>
          )}
          {selectedNode.source_file && (
            <button
              className={styles.nodeSourceButton}
              onClick={() => openFile(selectedNode.source_file!)}
              disabled={loadingFile}
            >
              {loadingFile ? 'Loading...' : selectedNode.source_file}
            </button>
          )}
          <a
            href={`/search?q=${encodeURIComponent(selectedNode.source_file?.split('/').pop()?.replace('.md', '') || selectedNode.id)}`}
            className={styles.nodeLink}
          >
            Search related →
          </a>
        </div>
      )}

      {hoveredNode && !selectedNode && (
        <div
          className={styles.tooltip}
          style={{
            left: mousePos.x + 16,
            top: mousePos.y + 16,
          }}
        >
          <div className={styles.tooltipType} data-type={hoveredNode.type}>
            {hoveredNode.type}
          </div>
          <div className={styles.tooltipLabel}>
            {hoveredNode.source_file?.split('/').pop()?.replace('.md', '') || hoveredNode.id}
          </div>
          {hoveredNode.concepts && hoveredNode.concepts.length > 0 && (
            <div className={styles.tooltipConcepts}>
              {hoveredNode.concepts.slice(0, 5).join(' · ')}
            </div>
          )}
          <div className={styles.tooltipHint}>Click to pin details</div>
        </div>
      )}

      {viewingFile && (
        <div className={styles.fileModal} onClick={() => setViewingFile(null)}>
          <div className={styles.fileModalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.fileModalHeader}>
              <h3>{viewingFile.path.split('/').pop()}</h3>
              <button className={styles.closeButton} onClick={() => setViewingFile(null)}>×</button>
            </div>
            <div className={styles.fileModalPath}>{viewingFile.path}</div>
            <pre className={styles.fileModalBody}>{viewingFile.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
