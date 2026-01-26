import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { getGraph, getFile } from '../api/oracle';
import { useHandTracking } from '../hooks/useHandTracking';
import styles from './Graph.module.css';

interface Node {
  id: string;
  type: string;
  label: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  concepts?: string[];
  cluster?: number;
  position?: THREE.Vector3;
  source_file?: string;
}

interface Link {
  source: string;
  target: string;
}

const TYPE_COLORS_HEX: Record<string, string> = {
  principle: '#a78bfa',
  learning: '#4ade80',
  retro: '#60a5fa',
};

const TYPE_COLORS_NUM: Record<string, number> = {
  principle: 0xa78bfa,
  learning: 0x4ade80,
  retro: 0x38bdf8,
};

const STORAGE_KEY_VIEW = 'oracle-graph-view-mode';
const STORAGE_KEY_FULL = 'oracle-graph-show-full';
const DEFAULT_NODE_LIMIT = 200;

// KlakMath helpers for 3D
function xxhash(seed: number, data: number): number {
  let h = ((seed + 374761393) >>> 0);
  h = ((h + (data * 3266489917 >>> 0)) >>> 0);
  h = ((((h << 17) | (h >>> 15)) * 668265263) >>> 0);
  h ^= h >>> 15;
  h = ((h * 2246822519) >>> 0);
  h ^= h >>> 13;
  h = ((h * 3266489917) >>> 0);
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

function clusterNodes(nodes: Node[], links: Link[]): Map<string, number> {
  const clusters = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();
  nodes.forEach(n => adjacency.set(n.id, new Set()));
  links.forEach(link => {
    adjacency.get(link.source)?.add(link.target);
    adjacency.get(link.target)?.add(link.source);
  });
  let clusterCount = 0;
  const visited = new Set<string>();
  const sortedNodes = [...nodes].sort((a, b) => (adjacency.get(b.id)?.size || 0) - (adjacency.get(a.id)?.size || 0));
  sortedNodes.forEach(node => {
    if (visited.has(node.id)) return;
    const queue = [node.id];
    const clusterMembers: string[] = [];
    while (queue.length > 0 && clusterMembers.length < 50) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      clusterMembers.push(current);
      const neighbors = adjacency.get(current) || new Set();
      neighbors.forEach(n => { if (!visited.has(n)) queue.push(n); });
    }
    clusterMembers.forEach(id => clusters.set(id, clusterCount));
    clusterCount++;
  });
  return clusters;
}

export function Graph() {
  // Shared state
  const [allNodes, setAllNodes] = useState<Node[]>([]);
  const [allLinks, setAllLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_VIEW);
    return saved === '3d' ? '3d' : '2d';
  });

  // Load graph data once
  useEffect(() => {
    loadGraph();
  }, []);

  async function loadGraph() {
    try {
      const data = await getGraph();
      const clusters = clusterNodes(data.nodes, data.links || []);
      const width = 800, height = 600;
      const centerX = width / 2, centerY = height / 2;

      const processedNodes = data.nodes.map((n: Node) => ({
        ...n,
        cluster: clusters.get(n.id) || 0,
        x: centerX + (Math.random() - 0.5) * 200,
        y: centerY + (Math.random() - 0.5) * 200,
        vx: 0,
        vy: 0,
      }));

      setAllNodes(processedNodes);
      setAllLinks(data.links || []);
    } catch (e) {
      console.error('Failed to load graph:', e);
    } finally {
      setLoading(false);
    }
  }

  function toggleView() {
    const newView = viewMode === '2d' ? '3d' : '2d';
    setViewMode(newView);
    localStorage.setItem(STORAGE_KEY_VIEW, newView);
  }

  if (loading) {
    return <div className={styles.loading}>Loading graph...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Knowledge Graph</h1>
        <div className={styles.stats}>
          {allNodes.length} nodes · {allLinks.length} links
          <button
            onClick={toggleView}
            style={{
              marginLeft: '10px',
              background: viewMode === '3d' ? 'rgba(167, 139, 250, 0.3)' : 'rgba(96, 165, 250, 0.2)',
              border: `1px solid ${viewMode === '3d' ? '#a78bfa' : '#60a5fa'}`,
              borderRadius: '4px',
              color: viewMode === '3d' ? '#a78bfa' : '#60a5fa',
              padding: '2px 8px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            {viewMode === '2d' ? '→ 3D' : '→ 2D'}
          </button>
        </div>
      </div>

      {viewMode === '2d' ? (
        <Canvas2D nodes={allNodes} links={allLinks} />
      ) : (
        <Canvas3D nodes={allNodes} links={allLinks} />
      )}
    </div>
  );
}

// 2D Canvas Component
function Canvas2D({ nodes: allNodes, links: allLinks }: { nodes: Node[]; links: Link[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showFull, setShowFull] = useState(() => localStorage.getItem(STORAGE_KEY_FULL) === 'true');
  const animationRef = useRef<number>(0);

  useEffect(() => {
    applyNodeLimit(allNodes, allLinks, showFull);
  }, [allNodes, allLinks, showFull]);

  function applyNodeLimit(nodeList: Node[], linkList: Link[], full: boolean) {
    if (full || nodeList.length <= DEFAULT_NODE_LIMIT) {
      setNodes(nodeList);
      setLinks(linkList);
    } else {
      const byType: Record<string, Node[]> = {};
      nodeList.forEach(n => {
        if (!byType[n.type]) byType[n.type] = [];
        byType[n.type].push(n);
      });
      const types = Object.keys(byType);
      const perType = Math.floor(DEFAULT_NODE_LIMIT / types.length);
      const limitedNodes: Node[] = [];
      types.forEach(type => limitedNodes.push(...byType[type].slice(0, perType)));
      const remaining = DEFAULT_NODE_LIMIT - limitedNodes.length;
      if (remaining > 0) {
        const usedIds = new Set(limitedNodes.map(n => n.id));
        limitedNodes.push(...nodeList.filter(n => !usedIds.has(n.id)).slice(0, remaining));
      }
      const nodeIds = new Set(limitedNodes.map(n => n.id));
      setNodes(limitedNodes);
      setLinks(linkList.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target)));
    }
  }

  function toggleFullGraph() {
    const newFull = !showFull;
    setShowFull(newFull);
    localStorage.setItem(STORAGE_KEY_FULL, String(newFull));
  }

  useEffect(() => {
    if (nodes.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width, height = canvas.height;
    let localNodes = [...nodes];
    let time = 0;
    let revealProgress = 0;
    const revealDuration = 10;

    function simulate() {
      time += 0.02;
      if (revealProgress < 1) revealProgress = Math.min(1, revealProgress + (0.02 / revealDuration));
      const alpha = 0.3;

      localNodes.forEach(node => {
        node.vx! += (Math.random() - 0.5) * 0.5;
        node.vy! += (Math.random() - 0.5) * 0.5;
      });

      for (let i = 0; i < localNodes.length; i++) {
        for (let j = i + 1; j < localNodes.length; j++) {
          const dx = localNodes[j].x! - localNodes[i].x!;
          const dy = localNodes[j].y! - localNodes[i].y!;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (100 / dist) * alpha;
          localNodes[i].vx! -= (dx / dist) * force;
          localNodes[i].vy! -= (dy / dist) * force;
          localNodes[j].vx! += (dx / dist) * force;
          localNodes[j].vy! += (dy / dist) * force;
        }
      }

      links.forEach(link => {
        const source = localNodes.find(n => n.id === link.source);
        const target = localNodes.find(n => n.id === link.target);
        if (!source || !target) return;
        const dx = target.x! - source.x!;
        const dy = target.y! - source.y!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 50) * 0.01 * alpha;
        source.vx! += (dx / dist) * force;
        source.vy! += (dy / dist) * force;
        target.vx! -= (dx / dist) * force;
        target.vy! -= (dy / dist) * force;
      });

      localNodes.forEach(node => {
        node.vx! += (width / 2 - node.x!) * 0.01 * alpha;
        node.vy! += (height / 2 - node.y!) * 0.01 * alpha;
        node.vx! *= 0.9;
        node.vy! *= 0.9;
        node.x! += node.vx!;
        node.y! += node.vy!;
      });

      let cx = 0, cy = 0;
      localNodes.forEach(node => { cx += node.x!; cy += node.y!; });
      cx /= localNodes.length; cy /= localNodes.length;
      localNodes.forEach(node => { node.x! += width / 2 - cx; node.y! += height / 2 - cy; });

      const padding = 30;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      localNodes.forEach(node => {
        minX = Math.min(minX, node.x!); maxX = Math.max(maxX, node.x!);
        minY = Math.min(minY, node.y!); maxY = Math.max(maxY, node.y!);
      });
      const graphWidth = maxX - minX, graphHeight = maxY - minY;
      if (graphWidth > width - padding * 2 || graphHeight > height - padding * 2) {
        const scale = Math.min((width - padding * 2) / graphWidth, (height - padding * 2) / graphHeight) * 0.95;
        localNodes.forEach(node => {
          node.x! = width / 2 + (node.x! - width / 2) * scale;
          node.y! = height / 2 + (node.y! - height / 2) * scale;
        });
      }

      draw();
      animationRef.current = requestAnimationFrame(simulate);
    }

    function draw() {
      if (!ctx) return;
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, width, height);

      const visibleLinks = Math.floor(links.length * revealProgress);
      ctx.lineWidth = 0.5;
      links.slice(0, visibleLinks).forEach((link, i) => {
        const source = localNodes.find(n => n.id === link.source);
        const target = localNodes.find(n => n.id === link.target);
        if (!source || !target) return;
        const fadeIn = Math.min(1, (revealProgress - i / links.length) * 10);
        ctx.strokeStyle = `rgba(255,255,255,${0.08 * fadeIn})`;
        ctx.beginPath();
        ctx.moveTo(source.x!, source.y!);
        ctx.lineTo(target.x!, target.y!);
        ctx.stroke();

        const speed = 0.3 + (i % 5) * 0.1;
        const offset = (i * 0.1) % 1;
        const t = ((time * speed + offset) % 1);
        ctx.fillStyle = `rgba(167, 139, 250, ${0.6 * fadeIn})`;
        ctx.beginPath();
        ctx.arc(source.x! + (target.x! - source.x!) * t, source.y! + (target.y! - source.y!) * t, 1.5, 0, Math.PI * 2);
        ctx.fill();
      });

      const nodeAlpha = Math.min(1, revealProgress * 3);
      localNodes.forEach(node => {
        const color = TYPE_COLORS_HEX[node.type] || '#888';
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r},${g},${b},${nodeAlpha})`;
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    simulate();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [nodes, links]);

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const clicked = nodes.find(n => Math.sqrt((n.x! - x) ** 2 + (n.y! - y) ** 2) < 10);
    setSelectedNode(clicked || null);
  }

  return (
    <>
      <div className={styles.legend}>
        <span className={styles.legendItem}><span className={styles.dot} style={{ background: TYPE_COLORS_HEX.principle }}></span>Principle</span>
        <span className={styles.legendItem}><span className={styles.dot} style={{ background: TYPE_COLORS_HEX.learning }}></span>Learning</span>
        <span className={styles.legendItem}><span className={styles.dot} style={{ background: TYPE_COLORS_HEX.retro }}></span>Retro</span>
        {allNodes.length > DEFAULT_NODE_LIMIT && (
          <button onClick={toggleFullGraph} style={{
            marginLeft: 'auto', background: showFull ? 'rgba(239, 68, 68, 0.2)' : 'rgba(74, 222, 128, 0.2)',
            border: `1px solid ${showFull ? '#ef4444' : '#4ade80'}`, borderRadius: '4px',
            color: showFull ? '#ef4444' : '#4ade80', padding: '2px 8px', fontSize: '11px', cursor: 'pointer',
          }}>
            {showFull ? '⚡ Trim' : `📊 All ${allNodes.length}`}
          </button>
        )}
      </div>
      <div className={styles.canvasWrapper}>
        <canvas ref={canvasRef} width={800} height={600} onClick={handleCanvasClick} className={styles.canvas} />
      </div>
      {selectedNode && (
        <div className={styles.nodeInfo}>
          <span className={styles.nodeType}>{selectedNode.type}</span>
          <p className={styles.nodeLabel}>{selectedNode.label}</p>
        </div>
      )}
    </>
  );
}

// 3D Canvas Component
function Canvas3D({ nodes, links }: { nodes: Node[]; links: Link[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showHud, setShowHud] = useState(true);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [showFilePanel, setShowFilePanel] = useState(false);
  const [typeFilter, setTypeFilter] = useState<Record<string, boolean>>({ principle: true, learning: true, retro: true });

  const [camDistance, setCamDistance] = useState(15);
  const [nodeSize, setNodeSize] = useState(0.08);
  const [rotationSpeed, setRotationSpeed] = useState(0.02);
  const [linkOpacity, setLinkOpacity] = useState(0.15);
  const [breathingIntensity, setBreathingIntensity] = useState(0.05);
  const [showAllLinks, setShowAllLinks] = useState(false);
  const [sphereMode, setSphereMode] = useState(false);
  const [handMode, setHandMode] = useState(false);

  const handleHandMove = useCallback((pos: { x: number; y: number }) => {
    targetAngleRef.current = { x: (pos.x - 0.5) * Math.PI * 2, y: (pos.y - 0.5) * -1 };
  }, []);

  const { isReady: handReady, isTracking: handTracking, error: handError, handPosition, debug: handDebug, startTracking, stopTracking } = useHandTracking({ enabled: handMode, onHandMove: handleHandMove });

  const toggleHandMode = useCallback(() => {
    if (handMode) { stopTracking(); setHandMode(false); } else { setHandMode(true); }
  }, [handMode, stopTracking]);

  useEffect(() => {
    if (handMode && handReady && !handTracking) startTracking();
  }, [handMode, handReady, handTracking, startTracking]);

  const hudRef = useRef({ camDistance: 15, nodeSize: 0.08, rotationSpeed: 0.02, linkOpacity: 0.15, breathingIntensity: 0.05, showAllLinks: false, sphereMode: false });
  const typeFilterRef = useRef<Record<string, boolean>>({ principle: true, learning: true, retro: true });
  const activeNodeRef = useRef<string | null>(null);
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map());
  const camXRef = useRef({ x: 0, v: 0 });
  const camYRef = useRef({ x: 0, v: 0 });
  const targetAngleRef = useRef({ x: 0, y: 0 });
  const animationRef = useRef<number>(0);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const hudHoveredRef = useRef(false);

  const resetCamera = () => { setCamDistance(15); camXRef.current = { x: 0, v: 0 }; camYRef.current = { x: 0, v: 0 }; targetAngleRef.current = { x: 0, y: 0 }; };

  const loadFileContent = async (node: Node) => {
    if (!node.source_file) return;
    setFileLoading(true); setShowFilePanel(true);
    try {
      const data = await getFile(node.source_file);
      setFileContent(data.content || data.error || 'No content');
    } catch { setFileContent('Error loading file'); }
    finally { setFileLoading(false); }
  };

  useEffect(() => { hudRef.current = { camDistance, nodeSize, rotationSpeed, linkOpacity, breathingIntensity, showAllLinks, sphereMode }; }, [camDistance, nodeSize, rotationSpeed, linkOpacity, breathingIntensity, showAllLinks, sphereMode]);
  useEffect(() => { typeFilterRef.current = typeFilter; meshesRef.current.forEach(mesh => { mesh.visible = typeFilter[(mesh.userData.node as Node).type] ?? true; }); }, [typeFilter]);
  useEffect(() => { activeNodeRef.current = selectedNode?.id || hoveredNode?.id || null; }, [hoveredNode, selectedNode]);

  useEffect(() => {
    if (nodes.length === 0 || !containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth, height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 15;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x606080, 0.8);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 1.2);
    directional.position.set(5, 5, 5);
    scene.add(directional);
    const rimLight = new THREE.PointLight(0xa78bfa, 0.5, 30);
    scene.add(rimLight);

    const clusterCenters = new Map<number, THREE.Vector3>();
    const maxCluster = Math.max(...nodes.map(n => n.cluster || 0));
    for (let i = 0; i <= maxCluster; i++) clusterCenters.set(i, hashOnSphere(42, i * 1000).multiplyScalar(6));

    const geometry = new THREE.SphereGeometry(0.08, 16, 16);
    const meshes: THREE.Mesh[] = [];
    const nodeMap = new Map<string, number>();

    nodes.forEach((node, i) => {
      nodeMap.set(node.id, i);
      const color = TYPE_COLORS_NUM[node.type] || 0x888888;
      const material = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.4, emissive: color, emissiveIntensity: 0.1 });
      const mesh = new THREE.Mesh(geometry, material);
      const cluster = node.cluster || 0;
      const clusterCenter = clusterCenters.get(cluster) || new THREE.Vector3();
      const localPos = hashOnSphere(cluster + 100, i).multiplyScalar(1.5 + xxhash(42, i));
      const clusterPos = clusterCenter.clone().add(localPos);
      const spherePos = hashOnSphere(42, i).multiplyScalar(6);
      mesh.position.copy(clusterPos);
      mesh.userData = { node, index: i, clusterPos: clusterPos.clone(), spherePos: spherePos.clone(), currentPos: clusterPos.clone() };
      scene.add(mesh);
      meshes.push(mesh);
    });
    meshesRef.current = meshes;

    const adjacency = new Map<string, Set<string>>();
    nodes.forEach(n => adjacency.set(n.id, new Set()));
    links.forEach(link => { adjacency.get(link.source)?.add(link.target); adjacency.get(link.target)?.add(link.source); });
    adjacencyRef.current = adjacency;

    const maxLinks = Math.min(links.length, 3000);
    const linkLines: THREE.Line[] = [];
    interface LinkData { sourceIdx: number; targetIdx: number; sourceId: string; targetId: string; offset: number; speed: number; line: THREE.Line; }
    const linkDataArray: LinkData[] = [];
    const linkMaterial = new THREE.LineBasicMaterial({ color: 0xa78bfa, opacity: 0, transparent: true });

    for (let i = 0; i < maxLinks; i++) {
      const link = links[i];
      const srcIdx = nodeMap.get(link.source), tgtIdx = nodeMap.get(link.target);
      if (srcIdx === undefined || tgtIdx === undefined) continue;
      const lineGeom = new THREE.BufferGeometry().setFromPoints([meshes[srcIdx].position.clone(), meshes[tgtIdx].position.clone()]);
      const line = new THREE.Line(lineGeom, linkMaterial.clone());
      scene.add(line);
      linkLines.push(line);
      linkDataArray.push({ sourceIdx: srcIdx, targetIdx: tgtIdx, sourceId: link.source, targetId: link.target, offset: xxhash(42, i + 5000), speed: 0.2 + xxhash(42, i + 6000) * 0.3, line });
    }

    const particleCount = Math.min(maxLinks, 1500);
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({ size: 0.06, color: 0xa78bfa, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    const travelingParticles = new THREE.Points(particleGeometry, particleMaterial);
    travelingParticles.visible = false;
    scene.add(travelingParticles);

    let time = 0;
    const dt = 1 / 60;

    function animate() {
      time += 0.016;
      camXRef.current = cdsTween(camXRef.current, targetAngleRef.current.x, 3, dt);
      camYRef.current = cdsTween(camYRef.current, targetAngleRef.current.y, 3, dt);
      const camDist = hudRef.current.camDistance;
      camera.position.x = Math.sin(camXRef.current.x) * camDist;
      camera.position.z = Math.cos(camXRef.current.x) * camDist;
      camera.position.y = camYRef.current.x * 5;
      camera.lookAt(0, 0, 0);

      const isSphere = hudRef.current.sphereMode;
      meshes.forEach((mesh, i) => {
        const clusterPos = mesh.userData.clusterPos as THREE.Vector3;
        const spherePos = mesh.userData.spherePos as THREE.Vector3;
        const currentPos = mesh.userData.currentPos as THREE.Vector3;
        currentPos.lerp(isSphere ? spherePos : clusterPos, 0.05);
        const n = fractalNoise(time * 0.5 + i * 0.1, 2, 42);
        mesh.position.copy(currentPos).multiplyScalar(1 + n * hudRef.current.breathingIntensity);
        mesh.scale.setScalar(hudRef.current.nodeSize / 0.08);
        mesh.rotation.y = time * 0.2 + i * 0.01;
      });

      scene.rotation.y = time * hudRef.current.rotationSpeed;

      const activeId = activeNodeRef.current;
      const showAll = hudRef.current.showAllLinks;
      const currentTypeFilter = typeFilterRef.current;
      let particleIndex = 0;
      const positions = travelingParticles.geometry.attributes.position.array as Float32Array;

      linkDataArray.forEach((linkData) => {
        const mat = linkData.line.material as THREE.LineBasicMaterial;
        const isConnected = activeId && (linkData.sourceId === activeId || linkData.targetId === activeId);
        const sourceNode = meshes[linkData.sourceIdx]?.userData?.node as Node | undefined;
        const targetNode = meshes[linkData.targetIdx]?.userData?.node as Node | undefined;
        const linkVisible = (sourceNode ? currentTypeFilter[sourceNode.type] ?? true : true) && (targetNode ? currentTypeFilter[targetNode.type] ?? true : true);
        const srcPos = meshes[linkData.sourceIdx].position, tgtPos = meshes[linkData.targetIdx].position;
        const linePositions = linkData.line.geometry.attributes.position.array as Float32Array;
        linePositions[0] = srcPos.x; linePositions[1] = srcPos.y; linePositions[2] = srcPos.z;
        linePositions[3] = tgtPos.x; linePositions[4] = tgtPos.y; linePositions[5] = tgtPos.z;
        linkData.line.geometry.attributes.position.needsUpdate = true;

        if (!linkVisible) mat.opacity = 0;
        else if (showAll) mat.opacity = 0.04;
        else if (isConnected) mat.opacity = hudRef.current.linkOpacity;
        else mat.opacity = 0;

        if (isConnected && linkVisible && particleIndex < 1500) {
          const t = ((time * linkData.speed * 0.3 + linkData.offset) % 1);
          positions[particleIndex * 3] = srcPos.x + (tgtPos.x - srcPos.x) * t;
          positions[particleIndex * 3 + 1] = srcPos.y + (tgtPos.y - srcPos.y) * t;
          positions[particleIndex * 3 + 2] = srcPos.z + (tgtPos.z - srcPos.z) * t;
          particleIndex++;
        }
      });

      for (let i = particleIndex; i < 1500; i++) { positions[i * 3] = 0; positions[i * 3 + 1] = -1000; positions[i * 3 + 2] = 0; }
      travelingParticles.visible = !!activeId;
      travelingParticles.geometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
      animationRef.current = requestAnimationFrame(animate);
    }

    animate();

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false, dragStart = { x: 0, y: 0 };

    function onMouseDown(e: MouseEvent) { if (hudHoveredRef.current) return; isDragging = true; dragStart = { x: e.clientX, y: e.clientY }; container.style.cursor = 'grabbing'; }
    function onMouseUp() { isDragging = false; container.style.cursor = 'default'; }
    function onMouseMove(e: MouseEvent) {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / height) * 2 + 1;
      if (isDragging) {
        targetAngleRef.current.x += (e.clientX - dragStart.x) * 0.005;
        targetAngleRef.current.y = Math.max(-0.5, Math.min(0.5, targetAngleRef.current.y - (e.clientY - dragStart.y) * 0.003));
        dragStart = { x: e.clientX, y: e.clientY };
      }
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(meshes);
      if (intersects.length > 0) {
        setHoveredNode(intersects[0].object.userData.node as Node);
        if (!isDragging) container.style.cursor = 'pointer';
        meshes.forEach(m => { (m.material as THREE.MeshStandardMaterial).emissiveIntensity = m === intersects[0].object ? 0.5 : 0.1; });
      } else {
        setHoveredNode(null);
        if (!isDragging) container.style.cursor = 'default';
        meshes.forEach(m => { (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.1; });
      }
    }
    function onClick(e: MouseEvent) {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(meshes);
      if (intersects.length > 0) {
        const clicked = intersects[0].object.userData.node as Node;
        setSelectedNode(prev => prev?.id === clicked.id ? null : clicked);
      }
    }
    function onDblClick() { setSelectedNode(null); }
    function onWheel(e: WheelEvent) { e.preventDefault(); setCamDistance(prev => Math.max(5, Math.min(50, prev + (e.deltaY > 0 ? 1.5 : -1.5)))); }
    function onResize() { const w = container.clientWidth, h = container.clientHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); }

    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('mouseleave', onMouseUp);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('click', onClick);
    container.addEventListener('dblclick', onDblClick);
    container.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('mouseleave', onMouseUp);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('click', onClick);
      container.removeEventListener('dblclick', onDblClick);
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      meshes.forEach(mesh => { (mesh.material as THREE.Material).dispose(); scene.remove(mesh); });
      geometry.dispose();
      linkLines.forEach(line => { line.geometry.dispose(); (line.material as THREE.Material).dispose(); scene.remove(line); });
      particleGeometry.dispose();
      particleMaterial.dispose();
      scene.remove(travelingParticles);
      container.removeChild(renderer.domElement);
      renderer.dispose();
      meshesRef.current = [];
    };
  }, [nodes, links]);

  const counts: Record<string, number> = {};
  nodes.forEach(n => { counts[n.type] = (counts[n.type] || 0) + 1; });

  return (
    <>
      <div className={styles.legend}>
        {[{ key: 'principle', label: 'Principle', color: '#a78bfa' }, { key: 'learning', label: 'Learning', color: '#4ade80' }, { key: 'retro', label: 'Retro', color: '#60a5fa' }].map(({ key, label, color }) => {
          const count = counts[key] || 0;
          if (count === 0) return null;
          return (
            <button key={key} onClick={() => setTypeFilter(prev => ({ ...prev, [key]: !prev[key] }))} style={{ opacity: typeFilter[key] ? 1 : 0.4, cursor: 'pointer', background: 'transparent', border: 'none', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', color: '#e0e0e0', fontSize: '13px' }}>
              <span className={styles.dot} style={{ background: color }}></span>
              {label} ({count})
            </button>
          );
        })}
      </div>

      <div className={styles.controls}>
        <span className={styles.hint}>Drag to rotate • Scroll to zoom • Click to select</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={toggleHandMode} className={styles.hudToggle} style={{ background: handTracking ? '#4ade80' : undefined, color: handTracking ? '#000' : undefined }}>{handTracking ? '✋ ON' : '✋'}</button>
          <button onClick={resetCamera} className={styles.hudToggle}>Reset</button>
          <button onClick={() => setShowHud(!showHud)} className={styles.hudToggle}>{showHud ? 'Hide' : 'Show'}</button>
        </div>
      </div>

      <div ref={containerRef} className={styles.canvas3d}>
        {showHud && (
          <div className={styles.hud} onMouseEnter={() => { hudHoveredRef.current = true; }} onMouseLeave={() => { hudHoveredRef.current = false; }}>
            <div className={styles.hudTitle}>Controls</div>
            <label className={styles.hudLabel} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <input type="checkbox" checked={sphereMode} onChange={(e) => setSphereMode(e.target.checked)} style={{ width: '16px', height: '16px' }} />
              <span style={{ color: '#a78bfa' }}>Sphere Mode</span>
            </label>
            <label className={styles.hudLabel}>Distance: {camDistance}<input type="range" min="5" max="40" step="1" value={camDistance} onChange={(e) => setCamDistance(Number(e.target.value))} className={styles.hudSlider} /></label>
            <label className={styles.hudLabel}>Node Size: {nodeSize.toFixed(2)}<input type="range" min="0.02" max="0.2" step="0.01" value={nodeSize} onChange={(e) => setNodeSize(Number(e.target.value))} className={styles.hudSlider} /></label>
            <label className={styles.hudLabel}>Rotation: {rotationSpeed.toFixed(3)}<input type="range" min="0" max="0.1" step="0.005" value={rotationSpeed} onChange={(e) => setRotationSpeed(Number(e.target.value))} className={styles.hudSlider} /></label>
            <label className={styles.hudLabel}>Breathing: {breathingIntensity.toFixed(2)}<input type="range" min="0" max="0.2" step="0.01" value={breathingIntensity} onChange={(e) => setBreathingIntensity(Number(e.target.value))} className={styles.hudSlider} /></label>
            <div className={styles.hudDivider}>Links</div>
            <label className={styles.hudLabel} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input type="checkbox" checked={showAllLinks} onChange={(e) => setShowAllLinks(e.target.checked)} style={{ width: '16px', height: '16px' }} />Show All Links</label>
            <label className={styles.hudLabel}>Opacity: {linkOpacity.toFixed(2)}<input type="range" min="0.05" max="0.5" step="0.05" value={linkOpacity} onChange={(e) => setLinkOpacity(Number(e.target.value))} className={styles.hudSlider} /></label>
          </div>
        )}
      </div>

      {(hoveredNode || selectedNode) && !showFilePanel && (
        <div className={styles.tooltip}>
          <span className={styles.nodeType}>{selectedNode ? `🔒 ${selectedNode.type}` : hoveredNode?.type}</span>
          <p className={styles.nodeLabel}>{(selectedNode || hoveredNode)?.label || (selectedNode || hoveredNode)?.source_file?.split('/').pop()?.replace(/\.md$/, '').replace(/-/g, ' ') || 'Untitled'}</p>
          {(selectedNode || hoveredNode)?.source_file && selectedNode && (
            <p style={{ fontSize: '11px', margin: '4px 0' }}>
              <a href="#" onClick={(e) => { e.preventDefault(); loadFileContent(selectedNode); }} style={{ color: '#a78bfa', textDecoration: 'underline' }}>View file</a>
            </p>
          )}
        </div>
      )}

      {showFilePanel && (
        <div style={{ position: 'absolute', top: '80px', left: '20px', right: '300px', bottom: '20px', background: 'rgba(15, 15, 25, 0.95)', borderRadius: '12px', padding: '20px', overflow: 'auto', border: '1px solid rgba(167, 139, 250, 0.3)', zIndex: 100 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
            <h3 style={{ color: '#a78bfa', margin: 0, fontSize: '14px' }}>{selectedNode?.source_file?.split('/').pop()}</h3>
            <button onClick={() => { setShowFilePanel(false); setFileContent(null); }} style={{ background: 'transparent', border: '1px solid #666', borderRadius: '4px', color: '#888', padding: '4px 12px', cursor: 'pointer', fontSize: '12px' }}>Close</button>
          </div>
          {fileLoading ? <p style={{ color: '#888' }}>Loading...</p> : <pre style={{ color: '#e0e0e0', fontSize: '12px', lineHeight: '1.6', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'monospace' }}>{fileContent}</pre>}
        </div>
      )}

      {handMode && (
        <div style={{ position: 'absolute', bottom: '20px', left: '20px', background: 'rgba(15, 15, 25, 0.9)', borderRadius: '8px', padding: '12px', border: '1px solid rgba(74, 222, 128, 0.3)', zIndex: 100 }}>
          <div style={{ color: '#4ade80', fontSize: '12px', marginBottom: '8px' }}>✋ Hand Tracking</div>
          <div style={{ color: '#888', fontSize: '10px' }}>{handDebug}</div>
          {handError ? <div style={{ color: '#f87171', fontSize: '11px' }}>{handError}</div> : handPosition ? <div style={{ color: '#e0e0e0', fontSize: '11px' }}>X: {(handPosition.x * 100).toFixed(0)}% | Y: {(handPosition.y * 100).toFixed(0)}%</div> : <div style={{ color: '#888', fontSize: '11px' }}>Show hand to camera</div>}
        </div>
      )}
    </>
  );
}
