import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getGraph } from '../api/oracle';
import styles from './Graph.module.css';

interface Node {
  id: string;
  type: string;
  label: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface Link {
  source: string;
  target: string;
}

const TYPE_COLORS: Record<string, string> = {
  principle: '#a78bfa',
  learning: '#4ade80',
  retro: '#60a5fa',
};

const STORAGE_KEY_VIEW = 'oracle-graph-view-mode';
const STORAGE_KEY_FULL = 'oracle-graph-show-full';
const DEFAULT_NODE_LIMIT = 200;

export function Graph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [allNodes, setAllNodes] = useState<Node[]>([]);
  const [allLinks, setAllLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showFull, setShowFull] = useState(() => localStorage.getItem(STORAGE_KEY_FULL) === 'true');
  const animationRef = useRef<number>(0);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const force2d = searchParams.get('force') === '2d';

  useEffect(() => {
    loadGraph();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  async function loadGraph() {
    try {
      const data = await getGraph();

      // Check saved view preference - redirect to 3D if preferred
      const savedView = localStorage.getItem(STORAGE_KEY_VIEW);
      if (savedView === '3d' && !force2d) {
        navigate('/graph3d', { replace: true });
        return;
      }

      // Auto-switch to 3D view for large graphs (>= 1000 nodes)
      // unless ?force=2d is set or user previously chose 2D
      if (!force2d && savedView !== '2d' && data.nodes && data.nodes.length >= 1000) {
        navigate('/graph3d', { replace: true });
        return;
      }

      // Save 2D preference
      localStorage.setItem(STORAGE_KEY_VIEW, '2d');

      // Initialize node positions around center
      const width = 800;
      const height = 600;
      const centerX = width / 2;
      const centerY = height / 2;
      const initializedNodes = data.nodes.map((n: any) => ({
        ...n,
        x: centerX + (Math.random() - 0.5) * 200,
        y: centerY + (Math.random() - 0.5) * 200,
        vx: 0,
        vy: 0,
      }));

      // Store all nodes/links
      setAllNodes(initializedNodes);
      setAllLinks(data.links || []);

      // Apply limit unless showing full
      const savedFull = localStorage.getItem(STORAGE_KEY_FULL) === 'true';
      applyNodeLimit(initializedNodes, data.links || [], savedFull);
    } catch (e) {
      console.error('Failed to load graph:', e);
    } finally {
      setLoading(false);
    }
  }

  function applyNodeLimit(nodeList: Node[], linkList: Link[], full: boolean) {
    if (full || nodeList.length <= DEFAULT_NODE_LIMIT) {
      setNodes(nodeList);
      setLinks(linkList);
    } else {
      // Take balanced mix of all node types
      const byType: Record<string, Node[]> = {};
      nodeList.forEach(n => {
        if (!byType[n.type]) byType[n.type] = [];
        byType[n.type].push(n);
      });

      const types = Object.keys(byType);
      const perType = Math.floor(DEFAULT_NODE_LIMIT / types.length);
      const limitedNodes: Node[] = [];

      // Take equal amount from each type
      types.forEach(type => {
        limitedNodes.push(...byType[type].slice(0, perType));
      });

      // Fill remaining slots with any leftover nodes
      const remaining = DEFAULT_NODE_LIMIT - limitedNodes.length;
      if (remaining > 0) {
        const usedIds = new Set(limitedNodes.map(n => n.id));
        const extras = nodeList.filter(n => !usedIds.has(n.id)).slice(0, remaining);
        limitedNodes.push(...extras);
      }

      const nodeIds = new Set(limitedNodes.map(n => n.id));
      const limitedLinks = linkList.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));
      setNodes(limitedNodes);
      setLinks(limitedLinks);
    }
  }

  function toggleFullGraph() {
    const newFull = !showFull;
    setShowFull(newFull);
    localStorage.setItem(STORAGE_KEY_FULL, String(newFull));
    applyNodeLimit(allNodes, allLinks, newFull);
  }

  // Force-directed simulation
  useEffect(() => {
    if (nodes.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Create node lookup
    const nodeMap = new Map<string, Node>();
    nodes.forEach(n => nodeMap.set(n.id, n));

    let localNodes = [...nodes];

    let time = 0;
    let revealProgress = 0; // 0 to 1, controls how many links are visible
    const revealDuration = 5; // seconds to fully reveal all links

    function simulate() {
      time += 0.02;

      // Gradually reveal links over time
      if (revealProgress < 1) {
        revealProgress = Math.min(1, revealProgress + (0.02 / revealDuration));
      }
      // Continuous simulation with gentle cooling
      const alpha = 0.3; // Constant gentle force

      // Add subtle random jitter to keep animation alive
      localNodes.forEach(node => {
        node.vx! += (Math.random() - 0.5) * 0.5;
        node.vy! += (Math.random() - 0.5) * 0.5;
      });

      // Repulsion between nodes
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

      // Attraction along links
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

      // Strong center gravity
      localNodes.forEach(node => {
        node.vx! += (width / 2 - node.x!) * 0.01 * alpha;
        node.vy! += (height / 2 - node.y!) * 0.01 * alpha;
      });

      // Update positions
      localNodes.forEach(node => {
        node.vx! *= 0.9;
        node.vy! *= 0.9;
        node.x! += node.vx!;
        node.y! += node.vy!;
      });

      // Recenter graph: calculate centroid and shift all nodes
      let cx = 0, cy = 0;
      localNodes.forEach(node => {
        cx += node.x!;
        cy += node.y!;
      });
      cx /= localNodes.length;
      cy /= localNodes.length;
      const offsetX = width / 2 - cx;
      const offsetY = height / 2 - cy;
      localNodes.forEach(node => {
        node.x! += offsetX;
        node.y! += offsetY;
      });

      // Scale to fit if nodes are outside bounds
      const padding = 30;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      localNodes.forEach(node => {
        minX = Math.min(minX, node.x!);
        maxX = Math.max(maxX, node.x!);
        minY = Math.min(minY, node.y!);
        maxY = Math.max(maxY, node.y!);
      });

      const graphWidth = maxX - minX;
      const graphHeight = maxY - minY;
      const availWidth = width - padding * 2;
      const availHeight = height - padding * 2;

      if (graphWidth > availWidth || graphHeight > availHeight) {
        const scale = Math.min(availWidth / graphWidth, availHeight / graphHeight) * 0.95;
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

      // Draw links - reveal gradually
      const visibleLinks = Math.floor(links.length * revealProgress);
      ctx.lineWidth = 0.5;
      links.slice(0, visibleLinks).forEach((link, i) => {
        const source = localNodes.find(n => n.id === link.source);
        const target = localNodes.find(n => n.id === link.target);
        if (!source || !target || !ctx) return;

        // Fade in effect for recently revealed links
        const linkRevealPoint = i / links.length;
        const fadeIn = Math.min(1, (revealProgress - linkRevealPoint) * 10);
        ctx.strokeStyle = `rgba(255,255,255,${0.08 * fadeIn})`;

        ctx.beginPath();
        ctx.moveTo(source.x!, source.y!);
        ctx.lineTo(target.x!, target.y!);
        ctx.stroke();

        // Animated dot traveling along the link
        const speed = 0.3 + (i % 5) * 0.1; // Varying speeds
        const offset = (i * 0.1) % 1; // Stagger start positions
        const t = ((time * speed + offset) % 1);
        const dotX = source.x! + (target.x! - source.x!) * t;
        const dotY = source.y! + (target.y! - source.y!) * t;

        ctx.fillStyle = `rgba(167, 139, 250, ${0.6 * fadeIn})`; // Purple glow with fade
        ctx.beginPath();
        ctx.arc(dotX, dotY, 1.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw nodes - fade in with reveal
      const nodeAlpha = Math.min(1, revealProgress * 3); // Nodes appear faster
      localNodes.forEach(node => {
        if (!ctx) return;
        const color = TYPE_COLORS[node.type] || '#888';
        // Convert hex to rgba
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

    // Cleanup: cancel animation frame when effect re-runs or unmounts
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [nodes, links]);

  // Handle canvas click
  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find clicked node
    const clicked = nodes.find(n => {
      const dx = n.x! - x;
      const dy = n.y! - y;
      return Math.sqrt(dx * dx + dy * dy) < 10;
    });

    setSelectedNode(clicked || null);
  }

  if (loading) {
    return <div className={styles.loading}>Loading graph...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Knowledge Graph</h1>
        <div className={styles.stats}>
          {nodes.length}{allNodes.length > nodes.length ? `/${allNodes.length}` : ''} nodes · {links.length} links
          {allNodes.length > DEFAULT_NODE_LIMIT && (
            <button
              onClick={toggleFullGraph}
              style={{
                marginLeft: '10px',
                background: showFull ? 'rgba(239, 68, 68, 0.2)' : 'rgba(74, 222, 128, 0.2)',
                border: `1px solid ${showFull ? '#ef4444' : '#4ade80'}`,
                borderRadius: '4px',
                color: showFull ? '#ef4444' : '#4ade80',
                padding: '2px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              {showFull ? '⚡ Trim' : '📊 Show All'}
            </button>
          )}
          <button
            onClick={() => {
              localStorage.setItem(STORAGE_KEY_VIEW, '3d');
              navigate('/graph3d');
            }}
            style={{
              marginLeft: '10px',
              background: 'rgba(167, 139, 250, 0.2)',
              border: '1px solid #a78bfa',
              borderRadius: '4px',
              color: '#a78bfa',
              padding: '2px 8px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            → 3D View
          </button>
        </div>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.dot} style={{ background: TYPE_COLORS.principle }}></span>
          Principle
        </span>
        <span className={styles.legendItem}>
          <span className={styles.dot} style={{ background: TYPE_COLORS.learning }}></span>
          Learning
        </span>
        <span className={styles.legendItem}>
          <span className={styles.dot} style={{ background: TYPE_COLORS.retro }}></span>
          Retro
        </span>
      </div>

      <div className={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          onClick={handleCanvasClick}
          className={styles.canvas}
        />
      </div>

      {selectedNode && (
        <div className={styles.nodeInfo}>
          <span className={styles.nodeType}>{selectedNode.type}</span>
          <p className={styles.nodeLabel}>{selectedNode.label}</p>
        </div>
      )}
    </div>
  );
}
