/* =====================================================
   main.js — Grid state, rendering, UI, animation
   Depends on: algorithms.js (must load first)
   ===================================================== */

'use strict';

/* ── Grid constants ───────────────────────────────── */
const CELL_SIZE = 18;
const COLS      = 36;
const ROWS      = 24;

/* Cell type enum — also used by algorithms.js */
const CELL_TYPES = { EMPTY: 0, WALL: 1, START: 2, END: 3, FOREST: 4, WATER: 5 };
const { EMPTY, WALL, START, END, FOREST, WATER } = CELL_TYPES;

/* Traversal cost per cell type (used by weighted algos) */
const WEIGHTS = {
  [EMPTY]:  1,
  [FOREST]: 3,
  [WATER]:  5,
  [START]:  1,
  [END]:    1,
};

/* Colours used when drawing the grid */
const VISITED_COLORS = {
  bfs:      'rgba(59,130,246,0.30)',
  dijkstra: 'rgba(139,92,246,0.30)',
  astar:    'rgba(245,158,11,0.30)',
  dfs:      'rgba(239,68,68,0.30)',
  greedy:   'rgba(16,185,129,0.30)',
};
const PATH_COLORS = {
  bfs:      '#3b82f6',
  dijkstra: '#8b5cf6',
  astar:    '#f59e0b',
  dfs:      '#ef4444',
  greedy:   '#10b981',
};

/* Render order for visited overlays (back → front) */
const ALGO_ORDER = ['greedy', 'dfs', 'astar', 'dijkstra', 'bfs'];

/* ── Canvas setup ─────────────────────────────────── */
const canvas = document.getElementById('grid-canvas');
const ctx    = canvas.getContext('2d');

canvas.width  = COLS * CELL_SIZE + 1;
canvas.height = ROWS * CELL_SIZE + 1;
document.getElementById('grid-wrap').style.minWidth = canvas.width + 'px';

/* ── State ────────────────────────────────────────── */
let grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(EMPTY));
let startPos = { r: 6,  c: 6  };
let endPos   = { r: 17, c: 29 };
grid[startPos.r][startPos.c] = START;
grid[endPos.r][endPos.c]     = END;

let visitedLayers = {};   // algo → Uint8Array-like map of visited node indices
let pathLayers    = {};   // algo → Set of path node indices
let allNodeData   = {};   // nodeIndex → decision data (populated after run)
let animTimers    = [];
let running       = false;
let currentTool   = 'wall';
let mouseDown     = false;

/* ── Tool selection ───────────────────────────────── */
function setTool(toolName) {
  currentTool = toolName;
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === toolName);
  });
}

/* Wire up toolbar buttons */
document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
});

/* Speed slider label */
const speedSlider = document.getElementById('speed');
speedSlider.addEventListener('input', () => {
  document.getElementById('speed-label').textContent = speedSlider.value;
});

/* ── Grid interaction ─────────────────────────────── */
function getCellFromEvent(e) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const r = Math.floor((e.clientY - rect.top)  * scaleY / CELL_SIZE);
  const c = Math.floor((e.clientX - rect.left) * scaleX / CELL_SIZE);
  return { r, c };
}

function applyTool(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;

  if (currentTool === 'start') {
    if (grid[startPos.r][startPos.c] === START) grid[startPos.r][startPos.c] = EMPTY;
    startPos = { r, c };
    grid[r][c] = START;
  } else if (currentTool === 'end') {
    if (grid[endPos.r][endPos.c] === END) grid[endPos.r][endPos.c] = EMPTY;
    endPos = { r, c };
    grid[r][c] = END;
  } else if (currentTool === 'wall') {
    if (grid[r][c] !== START && grid[r][c] !== END) grid[r][c] = WALL;
  } else if (currentTool === 'forest') {
    if (grid[r][c] !== START && grid[r][c] !== END) grid[r][c] = FOREST;
  } else if (currentTool === 'water') {
    if (grid[r][c] !== START && grid[r][c] !== END) grid[r][c] = WATER;
  } else if (currentTool === 'erase') {
    if (grid[r][c] !== START && grid[r][c] !== END) grid[r][c] = EMPTY;
  }
  drawGrid();
}

canvas.addEventListener('mousedown', e => {
  if (running) {
    // After a run, clicking shows node explanations
    const { r, c } = getCellFromEvent(e);
    showNodeExplanation(r, c);
    return;
  }
  mouseDown = true;
  const { r, c } = getCellFromEvent(e);
  applyTool(r, c);
});
canvas.addEventListener('mousemove', e => {
  if (!mouseDown || running) return;
  const { r, c } = getCellFromEvent(e);
  applyTool(r, c);
});
document.addEventListener('mouseup', () => { mouseDown = false; });

/* Touch support */
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const touch = e.touches[0];
  const { r, c } = getCellFromEvent(touch);
  if (!running) { mouseDown = true; applyTool(r, c); }
  else showNodeExplanation(r, c);
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!mouseDown || running) return;
  const touch = e.touches[0];
  const { r, c } = getCellFromEvent(touch);
  applyTool(r, c);
}, { passive: false });
canvas.addEventListener('touchend', () => { mouseDown = false; });

/* ── Drawing ──────────────────────────────────────── */
function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * CELL_SIZE;
      const y = r * CELL_SIZE;
      const k = r * COLS + c;

      // 1. Base cell colour
      const cellType = grid[r][c];
      if (cellType === WALL) {
        ctx.fillStyle = '#2d3748';
        ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      } else if (cellType === FOREST) {
        ctx.fillStyle = 'rgba(74,222,128,0.22)';
        ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      } else if (cellType === WATER) {
        ctx.fillStyle = 'rgba(147,197,253,0.22)';
        ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      } else {
        // Subtle checkerboard
        ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
        ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      }

      // 2. Visited overlays (back → front)
      for (const algo of ALGO_ORDER) {
        const layer = visitedLayers[algo];
        if (layer && layer[k]) {
          ctx.fillStyle = VISITED_COLORS[algo];
          ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
          break;   // only show the topmost layer per cell
        }
      }

      // 3. Path overlays (front; multiple can stack with alpha)
      for (const algo of ['bfs', 'dijkstra', 'astar', 'dfs', 'greedy']) {
        const pl = pathLayers[algo];
        if (pl && pl.has(k)) {
          ctx.fillStyle = PATH_COLORS[algo];
          ctx.globalAlpha = 0.55;
          ctx.fillRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
          ctx.globalAlpha = 1;
          break;
        }
      }

      // 4. Grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
    }
  }

  // 5. Start and end markers on top
  drawMarker(startPos.r, startPos.c, '#22c55e', '▶');
  drawMarker(endPos.r,   endPos.c,   '#ef4444', '◉');
}

function drawMarker(r, c, color, symbol) {
  const x = c * CELL_SIZE, y = r * CELL_SIZE;
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, x + CELL_SIZE / 2, y + CELL_SIZE / 2);
}

/* ── Run all algorithms ───────────────────────────── */
async function runAll() {
  if (running) return;
  running = true;
  cancelAnimations();
  visitedLayers = {};
  pathLayers    = {};
  allNodeData   = {};
  drawGrid();

  const hType  = document.getElementById('heuristic-sel').value;
  const speed  = parseInt(speedSlider.value);
  const delay  = Math.max(1, Math.round((101 - speed) * 0.4));

  setStatus('Computing…');

  const params = { grid, rows: ROWS, cols: COLS, startPos, endPos, weights: WEIGHTS, hType };

  // Run all algorithms synchronously to get full results first
  const t0 = performance.now();
  const bfsR     = runBFS(params);       const bfsT     = performance.now() - t0;
  const t1 = performance.now();
  const dijkR    = runDijkstra(params);  const dijkT    = performance.now() - t1;
  const t2 = performance.now();
  const astarR   = runAStar(params);     const astarT   = performance.now() - t2;
  const t3 = performance.now();
  const dfsR     = runDFS(params);       const dfsT     = performance.now() - t3;
  const t4 = performance.now();
  const greedyR  = runGreedy(params);    const greedyT  = performance.now() - t4;

  // Reconstruct paths
  const ei = endPos.r * COLS + endPos.c;

  const bfsPath     = (bfsR.dist   && bfsR.dist[ei]   >= 0)         ? reconstructPath(bfsR.prev,    ei) : [];
  const dijkPath    = (dijkR.dist  && dijkR.dist[ei]  < Infinity)   ? reconstructPath(dijkR.prev,   ei) : [];
  const astarPath   = (astarR.dist && astarR.dist[ei] < Infinity)   ? reconstructPath(astarR.prev,  ei) : [];
  const dfsPath     = (dfsR.prev   && dfsR.prev[ei]   !== -1)       ? reconstructPath(dfsR.prev,    ei) : [];
  const greedyPath  = (greedyR.prev && greedyR.prev[ei] !== -1)     ? reconstructPath(greedyR.prev, ei) : [];

  // Merge node decision data (A* and Dijkstra overwrite earlier entries — that's fine,
  // we expose the most informative explanation per node)
  for (const r of [bfsR, dijkR, astarR, dfsR, greedyR]) {
    if (r.ndData) Object.assign(allNodeData, r.ndData);
  }

  // Update stat cards
  setStats('bfs',     bfsR.order.length,    bfsPath.length    ? bfsPath.length    - 1 : -1, bfsT);
  setStats('dijkstra', dijkR.order.length,  dijkPath.length   ? dijkPath.length   - 1 : -1, dijkT);
  setStats('astar',   astarR.order.length,  astarPath.length  ? astarPath.length  - 1 : -1, astarT);
  setStats('dfs',     dfsR.order.length,    dfsPath.length    ? dfsPath.length    - 1 : -1, dfsT);
  setStats('greedy',  greedyR.order.length, greedyPath.length ? greedyPath.length - 1 : -1, greedyT);

  setStatus('Animating…');

  // Animate all algorithms simultaneously
  await Promise.all([
    animateAlgo('bfs',      bfsR.order,    new Set(bfsPath),     delay),
    animateAlgo('dijkstra', dijkR.order,   new Set(dijkPath),    delay),
    animateAlgo('astar',    astarR.order,  new Set(astarPath),   delay),
    animateAlgo('dfs',      dfsR.order,    new Set(dfsPath),     delay),
    animateAlgo('greedy',   greedyR.order, new Set(greedyPath),  delay),
  ]);

  running = false;
  setStatus('Done! Click any visited or path cell to see the decision made at that step.');
  canvas.style.cursor = 'pointer';
}

/* Animate a single algorithm's exploration then reveal its path */
function animateAlgo(algo, order, pathSet, delay) {
  const vl = new Uint8Array(ROWS * COLS);
  visitedLayers[algo] = vl;

  return new Promise(resolve => {
    let i = 0;
    // Batch multiple cells per frame at higher speeds
    const batchSize = Math.max(1, Math.floor(order.length / 300));

    function step() {
      for (let b = 0; b < batchSize && i < order.length; b++, i++) {
        vl[order[i]] = 1;
      }
      setProgress(algo, Math.round((i / order.length) * 75));
      drawGrid();

      if (i < order.length) {
        animTimers.push(setTimeout(step, delay));
      } else {
        // Reveal path
        pathLayers[algo] = pathSet;
        drawGrid();
        setProgress(algo, 100);
        resolve();
      }
    }
    step();
  });
}

/* ── Maze generation (recursive backtracking) ─────── */
function genMaze() {
  if (running) return;
  cancelAnimations();

  const g = Array.from({ length: ROWS }, () => new Array(COLS).fill(WALL));

  // Carve starting from nearest even-coordinate cell to startPos
  const sr = startPos.r % 2 === 0 ? startPos.r : Math.max(0, startPos.r - 1);
  const sc = startPos.c % 2 === 0 ? startPos.c : Math.max(0, startPos.c - 1);

  function carve(r, c) {
    g[r][c] = EMPTY;
    // Shuffle directions for randomness
    const dirs = [[0,2],[2,0],[0,-2],[-2,0]].sort(() => Math.random() - 0.5);
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && g[nr][nc] === WALL) {
        g[r + dr / 2][c + dc / 2] = EMPTY;   // carve the wall between
        carve(nr, nc);
      }
    }
  }

  carve(sr, sc);

  // Ensure start and end are accessible
  g[startPos.r][startPos.c] = START;
  g[endPos.r][endPos.c]     = END;
  // Open a path around end if it's surrounded
  for (const [dr, dc] of [[0,1],[1,0],[0,-1],[-1,0]]) {
    const nr = endPos.r + dr, nc = endPos.c + dc;
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && g[nr][nc] === WALL) {
      g[nr][nc] = EMPTY;
      break;
    }
  }

  grid = g;
  visitedLayers = {};
  pathLayers    = {};
  allNodeData   = {};
  resetStatCards();
  drawGrid();
  setStatus('Maze generated via recursive backtracking. Hit Visualise All!');
}

/* ── Clear grid ───────────────────────────────────── */
function clearGrid() {
  cancelAnimations();
  grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(EMPTY));
  startPos = { r: 6,  c: 6  };
  endPos   = { r: 17, c: 29 };
  grid[startPos.r][startPos.c] = START;
  grid[endPos.r][endPos.c]     = END;
  visitedLayers = {};
  pathLayers    = {};
  allNodeData   = {};
  running       = false;
  canvas.style.cursor = 'crosshair';
  document.getElementById('explain-panel').classList.remove('show');
  resetStatCards();
  drawGrid();
  setStatus('Grid cleared.');
}

/* ── Reset paths only ─────────────────────────────── */
function resetPaths() {
  cancelAnimations();
  visitedLayers = {};
  pathLayers    = {};
  allNodeData   = {};
  running       = false;
  canvas.style.cursor = 'crosshair';
  document.getElementById('explain-panel').classList.remove('show');
  resetStatCards();
  drawGrid();
  setStatus('Paths cleared. Adjust the grid and run again.');
}

/* ── Node explanation panel ───────────────────────── */
function showNodeExplanation(r, c) {
  const k    = r * COLS + c;
  const data = allNodeData[k];
  const ep   = document.getElementById('explain-panel');
  const et   = document.getElementById('explain-title');
  const eb   = document.getElementById('explain-body');

  if (!data) { ep.classList.remove('show'); return; }

  et.textContent = `Node (row ${r}, col ${c}) — ${data.algo}`;

  let html = `<p>${data.decision}</p>`;

  // Cost badges
  const hasCosts = data.g !== null || data.h !== null || data.f !== null;
  if (hasCosts) {
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">';
    if (data.g !== null) html += `<span class="cost-badge">g(n) = ${(+data.g).toFixed(2)}</span>`;
    if (data.h !== null) html += `<span class="cost-badge">h(n) = ${(+data.h).toFixed(2)}</span>`;
    if (data.f !== null) html += `<span class="cost-badge f-val">f(n) = ${(+data.f).toFixed(2)}</span>`;
    html += '</div>';
  }
  if (data.w !== null && data.w !== undefined) {
    html += `<p style="margin-top:6px;opacity:0.7">Terrain weight entering this cell: ×${data.w}</p>`;
  }

  eb.innerHTML = html;
  ep.classList.add('show');
}

/* ── UI helpers ───────────────────────────────────── */
function setStatus(msg) {
  document.getElementById('status-bar').innerHTML = msg;
}

function setStats(algo, nodes, pathLen, ms) {
  const prefix = algo === 'dijkstra' ? 'dijk' : algo;
  document.getElementById(`${prefix}-nodes`).textContent = nodes >= 0 ? nodes : '✕';
  document.getElementById(`${prefix}-path`).textContent  = pathLen >= 0 ? pathLen : '✕';
  document.getElementById(`${prefix}-time`).textContent  = ms >= 0 ? ms.toFixed(1) : '—';
}

function setProgress(algo, pct) {
  const prefix = algo === 'dijkstra' ? 'dijk' : algo;
  document.getElementById(`${prefix}-prog`).style.width = pct + '%';
}

function resetStatCards() {
  for (const algo of ['bfs', 'dijkstra', 'astar', 'dfs', 'greedy']) {
    setStats(algo, -2, -2, -1);
    setProgress(algo, 0);
  }
  // Show dashes for unrun state
  for (const id of ['bfs-nodes','bfs-path','bfs-time',
                     'dijk-nodes','dijk-path','dijk-time',
                     'astar-nodes','astar-path','astar-time',
                     'dfs-nodes','dfs-path','dfs-time',
                     'greedy-nodes','greedy-path','greedy-time']) {
    document.getElementById(id).textContent = '—';
  }
}

function cancelAnimations() {
  animTimers.forEach(clearTimeout);
  animTimers = [];
  running = false;
}

/* ── Init ─────────────────────────────────────────── */
drawGrid();
setStatus('Draw walls by clicking or dragging, then hit <strong>Visualise All</strong>. Click visited cells after a run to inspect decisions.');
