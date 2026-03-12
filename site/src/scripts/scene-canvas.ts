/**
 * Scene Canvas — Ambient background for the LP hero.
 *
 * Draws floating nodes connected by Bezier edges on a full-screen canvas.
 * Micro-interactions:
 *   - Mouse move: nodes repel from cursor, glow follows cursor
 *   - Hover node: node pulses + connected edges glow
 *   - Click: ripple wave emanates from click point
 *   - Idle: nodes drift autonomously, edges breathe (opacity pulse)
 */

// ---------- Types ----------

interface Node {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  color: string;
  pulsePhase: number;
  pulseSpeed: number;
  connections: number[];
  hovered: boolean;
  glowIntensity: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
}

interface CursorGlow {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  opacity: number;
}

// ---------- Constants ----------

const NODE_COUNT = 18;
const CONNECTION_DISTANCE = 280;
const MOUSE_REPEL_RADIUS = 200;
const MOUSE_REPEL_FORCE = 0.08;
const DRIFT_SPEED = 0.3;
const NODE_RETURN_SPEED = 0.02;
const EDGE_BASE_OPACITY = 0.15;
const EDGE_GLOW_OPACITY = 0.6;
const RIPPLE_SPEED = 4;
const RIPPLE_MAX = 300;

const ACCENT_COLORS = [
  '#5B8FD4', // brighter blue
  '#7BA4DD', // light steel
  '#4A9B9B', // teal
  '#9B6BA0', // violet
  '#E8A090', // salmon
  '#6BC5A0', // mint
];

// ---------- State ----------

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let W: number;
let H: number;
let nodes: Node[] = [];
let ripples: Ripple[] = [];
let cursor: CursorGlow = { x: -1000, y: -1000, targetX: -1000, targetY: -1000, opacity: 0 };
let animId: number;
let time = 0;
let hoveredNode: Node | null = null;
let dpr = 1;

// ---------- Init ----------

export function initSceneCanvas(el: HTMLCanvasElement) {
  canvas = el;
  ctx = canvas.getContext('2d')!;
  dpr = window.devicePixelRatio || 1;

  resize();
  createNodes();
  bindEvents();
  loop();
}

export function destroySceneCanvas() {
  cancelAnimationFrame(animId);
  window.removeEventListener('resize', resize);
  canvas.removeEventListener('mousemove', onMouseMove);
  canvas.removeEventListener('click', onClick);
  canvas.removeEventListener('mouseleave', onMouseLeave);
  canvas.removeEventListener('touchmove', onTouchMove);
  canvas.removeEventListener('touchstart', onTouchStart);
}

// ---------- Setup ----------

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function createNodes() {
  nodes = [];
  const margin = 80;
  for (let i = 0; i < NODE_COUNT; i++) {
    const x = margin + Math.random() * (W - margin * 2);
    const y = margin + Math.random() * (H - margin * 2);
    const radius = 3 + Math.random() * 5;
    nodes.push({
      x, y,
      baseX: x,
      baseY: y,
      vx: (Math.random() - 0.5) * DRIFT_SPEED,
      vy: (Math.random() - 0.5) * DRIFT_SPEED,
      radius,
      baseRadius: radius,
      color: ACCENT_COLORS[i % ACCENT_COLORS.length],
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.02 + Math.random() * 0.02,
      connections: [],
      hovered: false,
      glowIntensity: 0,
    });
  }

  // Pre-compute connections based on initial distances
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].baseX - nodes[j].baseX;
      const dy = nodes[i].baseY - nodes[j].baseY;
      if (Math.sqrt(dx * dx + dy * dy) < CONNECTION_DISTANCE) {
        nodes[i].connections.push(j);
        nodes[j].connections.push(i);
      }
    }
  }
}

// ---------- Events ----------

function bindEvents() {
  window.addEventListener('resize', resize);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('touchmove', onTouchMove, { passive: true });
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
}

function onMouseMove(e: MouseEvent) {
  cursor.targetX = e.clientX;
  cursor.targetY = e.clientY;
  cursor.opacity = 1;
  checkHover(e.clientX, e.clientY);
}

function onMouseLeave() {
  cursor.opacity = 0;
  if (hoveredNode) {
    hoveredNode.hovered = false;
    hoveredNode = null;
  }
}

function onClick(e: MouseEvent) {
  spawnRipple(e.clientX, e.clientY);
  // Nudge nearby nodes outward on click
  for (const node of nodes) {
    const dx = node.x - e.clientX;
    const dy = node.y - e.clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < RIPPLE_MAX && dist > 0) {
      const force = (1 - dist / RIPPLE_MAX) * 3;
      node.vx += (dx / dist) * force;
      node.vy += (dy / dist) * force;
    }
  }
}

function onTouchMove(e: TouchEvent) {
  const t = e.touches[0];
  cursor.targetX = t.clientX;
  cursor.targetY = t.clientY;
  cursor.opacity = 1;
  checkHover(t.clientX, t.clientY);
}

function onTouchStart(e: TouchEvent) {
  const t = e.touches[0];
  spawnRipple(t.clientX, t.clientY);
}

function checkHover(mx: number, my: number) {
  let closest: Node | null = null;
  let minDist = 30; // hover threshold
  for (const node of nodes) {
    const dx = node.x - mx;
    const dy = node.y - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDist) {
      minDist = dist;
      closest = node;
    }
  }
  if (hoveredNode && hoveredNode !== closest) {
    hoveredNode.hovered = false;
  }
  if (closest) {
    closest.hovered = true;
  }
  hoveredNode = closest;
}

function spawnRipple(x: number, y: number) {
  ripples.push({ x, y, radius: 0, maxRadius: RIPPLE_MAX, opacity: 0.6 });
}

// ---------- Update ----------

function update() {
  time++;

  // Cursor smooth follow
  cursor.x += (cursor.targetX - cursor.x) * 0.1;
  cursor.y += (cursor.targetY - cursor.y) * 0.1;

  for (const node of nodes) {
    // Idle drift
    node.x += node.vx;
    node.y += node.vy;

    // Soft return toward base position
    node.vx += (node.baseX - node.x) * NODE_RETURN_SPEED;
    node.vy += (node.baseY - node.y) * NODE_RETURN_SPEED;

    // Damping
    node.vx *= 0.97;
    node.vy *= 0.97;

    // Mouse repulsion
    if (cursor.opacity > 0) {
      const dx = node.x - cursor.x;
      const dy = node.y - cursor.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MOUSE_REPEL_RADIUS && dist > 0) {
        const force = (1 - dist / MOUSE_REPEL_RADIUS) * MOUSE_REPEL_FORCE;
        node.vx += (dx / dist) * force;
        node.vy += (dy / dist) * force;
      }
    }

    // Boundary wrap (soft)
    if (node.x < -20) node.baseX = W + 20;
    if (node.x > W + 20) node.baseX = -20;
    if (node.y < -20) node.baseY = H + 20;
    if (node.y > H + 20) node.baseY = -20;

    // Pulse
    node.pulsePhase += node.pulseSpeed;
    const pulse = Math.sin(node.pulsePhase);
    node.radius = node.baseRadius + pulse * 1.5;

    // Glow intensity (hover)
    const targetGlow = node.hovered ? 1 : 0;
    node.glowIntensity += (targetGlow - node.glowIntensity) * 0.1;
  }

  // Update ripples
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.radius += RIPPLE_SPEED;
    r.opacity *= 0.97;
    if (r.opacity < 0.01 || r.radius > r.maxRadius) {
      ripples.splice(i, 1);
    }
  }
}

// ---------- Draw ----------

function draw() {
  ctx.clearRect(0, 0, W, H);

  // Draw cursor glow
  if (cursor.opacity > 0.01) {
    const grad = ctx.createRadialGradient(cursor.x, cursor.y, 0, cursor.x, cursor.y, 150);
    grad.addColorStop(0, `rgba(91, 143, 212, ${0.08 * cursor.opacity})`);
    grad.addColorStop(1, 'rgba(91, 143, 212, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cursor.x - 150, cursor.y - 150, 300, 300);
  }

  // Draw edges (Bezier curves)
  const drawn = new Set<string>();
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (const j of a.connections) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (drawn.has(key)) continue;
      drawn.add(key);

      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Edge opacity based on distance + breathing
      const breathe = 0.5 + 0.5 * Math.sin(time * 0.015 + i * 0.5);
      const distFade = Math.max(0, 1 - dist / (CONNECTION_DISTANCE * 1.5));
      let opacity = EDGE_BASE_OPACITY * distFade * (0.7 + 0.3 * breathe);

      // Glow if either node is hovered
      const glow = Math.max(a.glowIntensity, b.glowIntensity);
      if (glow > 0) {
        opacity = opacity + (EDGE_GLOW_OPACITY - opacity) * glow;
      }

      if (opacity < 0.01) continue;

      // Bezier control point (perpendicular offset for curve)
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const perpX = -dy * 0.15;
      const perpY = dx * 0.15;
      const wave = Math.sin(time * 0.01 + i + j) * 0.5;
      const cpx = mx + perpX * wave;
      const cpy = my + perpY * wave;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(cpx, cpy, b.x, b.y);
      ctx.strokeStyle = `rgba(91, 143, 212, ${opacity})`;
      ctx.lineWidth = 1 + glow * 1.5;
      ctx.stroke();
    }
  }

  // Draw ripples
  for (const r of ripples) {
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(91, 143, 212, ${r.opacity})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Draw nodes
  for (const node of nodes) {
    // Outer glow
    if (node.glowIntensity > 0.01) {
      const glowRadius = node.radius * 4;
      const grad = ctx.createRadialGradient(
        node.x, node.y, node.radius,
        node.x, node.y, glowRadius,
      );
      grad.addColorStop(0, node.color + alphaHex(0.3 * node.glowIntensity));
      grad.addColorStop(1, node.color + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Node body
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

    // Subtle glow always
    const baseGlow = 0.4 + 0.2 * Math.sin(node.pulsePhase);
    const grad = ctx.createRadialGradient(
      node.x, node.y, 0,
      node.x, node.y, node.radius,
    );
    grad.addColorStop(0, node.color);
    grad.addColorStop(1, node.color + alphaHex(baseGlow));
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

function alphaHex(a: number): string {
  return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
}

// ---------- Loop ----------

function loop() {
  update();
  draw();
  animId = requestAnimationFrame(loop);
}
