'use strict';

const CELL_SIZE = 18;
const COLS = 36;
const ROWS = 24;

const CELL_TYPES = { EMPTY: 0, WALL: 1, START: 2, END: 3, FOREST: 4, WATER: 5 };
const { EMPTY, WALL, START, END, FOREST, WATER } = CELL_TYPES;

const WEIGHTS = {
  [EMPTY]: 1,
  [FOREST]: 3,
  [WATER]: 5,
  [START]: 1,
  [END]: 1,
};

const VISITED_COLORS = {
  bfs:      'rgba(59,130,246,0.18)',
  dijkstra: 'rgba(139,92,246,0.18)',
  astar:    'rgba(245,158,11,0.18)',
  dfs:      'rgba(239,68,68,0.18)',
  greedy:   'rgba(16,185,129,0.18)',
};

const PATH_COLORS = {
  bfs:      '#3b82f6',
  dijkstra: '#8b5cf6',
  astar:    '#f59e0b',
  dfs:      '#ef4444',
  greedy:   '#10b981',
};

const ALGO_NAMES = {
  bfs: 'BFS',
  dijkstra: 'Dijkstra',
  astar: 'A*',
  dfs: 'DFS',
  greedy: 'Greedy',
};

const RENDER_ORDER = ['greedy', 'dfs', 'astar', 'dijkstra', 'bfs'];

const canvas = document.getElementById('grid-canvas');
const ctx = canvas.getContext('2d');

canvas.width  = COLS * CELL_SIZE + 1;
canvas.height = ROWS * CELL_SIZE + 1;
document.getElementById('grid-wrap').style.minWidth = canvas.width + 'px';

let grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(EMPTY));
let startPos = { r: 6, c: 6 };
let endPos   = { r: 17, c: 29 };
grid[startPos.r][startPos.c] = START;
grid[endPos.r][endPos.c] = END;

let visitedLayers = {};
let pathLayers = {};
let allNodeData = {};
let animTimers = [];
let running = false;
let currentTool = 'wall';
let mouseDown = false;

function setTool(name) {
  currentTool = name;
  document.querySelectorAll('.tool-btn[data-tool]').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === name);
  });
}

document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
});

const speedSlider = document.getElementById('speed');
speedSlider.addEventListener('input', () => {
  document.getElementById('speed-label').textContent = speedSlider.value;
});

function getCellAt(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  return {
    r: Math.floor((e.clientY - rect.top)  * sy / CELL_SIZE),
    c: Math.floor((e.clientX - rect.left) * sx / CELL_SIZE),
  };
}

function applyTool(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
  const occupied = grid[r][c] === START || grid[r][c] === END;

  if (currentTool === 'start') {
    grid[startPos.r][startPos.c] = EMPTY;
    startPos = { r, c };
    grid[r][c] = START;
  } else if (currentTool === 'end') {
    grid[endPos.r][endPos.c] = EMPTY;
    endPos = { r, c };
    grid[r][c] = END;
  } else if (!occupied) {
    if (currentTool === 'wall')   grid[r][c] = WALL;
    if (currentTool === 'forest') grid[r][c] = FOREST;
    if (currentTool === 'water')  grid[r][c] = WATER;
    if (currentTool === 'erase')  grid[r][c] = EMPTY;
  }
  drawGrid();
}

canvas.addEventListener('mousedown', e => {
  if (running) { showNodeExplanation(getCellAt(e)); return; }
  mouseDown = true;
  applyTool(getCellAt(e).r, getCellAt(e).c);
});
canvas.addEventListener('mousemove', e => {
  if (!mouseDown || running) return;
  const { r, c } = getCellAt(e);
  applyTool(r, c);
});
document.addEventListener('mouseup', () => { mouseDown = false; });

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const pos = getCellAt(e.touches[0]);
  if (running) { showNodeExplanation(pos); return; }
  mouseDown = true;
  applyTool(pos.r, pos.c);
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!mouseDown || running) return;
  applyTool(getCellAt(e.touches[0]).r, getCellAt(e.touches[0]).c);
}, { passive: false });

canvas.addEventListener('touchend', () => { mouseDown = false; });

function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * CELL_SIZE;
      const y = r * CELL_SIZE;
      const k = r * COLS + c;
      const type = grid[r][c];

      if (type === WALL) {
        ctx.fillStyle = '#374151';
        ctx.fillRect(x+1, y+1, CELL_SIZE-2, CELL_SIZE-2);
      } else if (type === FOREST) {
        ctx.fillStyle = 'rgba(74,222,128,0.3)';
        ctx.fillRect(x+1, y+1, CELL_SIZE-2, CELL_SIZE-2);
      } else if (type === WATER) {
        ctx.fillStyle = 'rgba(147,197,253,0.3)';
        ctx.fillRect(x+1, y+1, CELL_SIZE-2, CELL_SIZE-2);
      } else {
        ctx.fillStyle = (r+c) % 2 === 0 ? 'rgba(0,0,0,0.02)' : '#ffffff';
        ctx.fillRect(x+1, y+1, CELL_SIZE-2, CELL_SIZE-2);
      }

      for (const algo of RENDER_ORDER) {
        const layer = visitedLayers[algo];
        if (layer && layer[k]) {
          ctx.fillStyle = VISITED_COLORS[algo];
          ctx.fillRect(x+1, y+1, CELL_SIZE-2, CELL_SIZE-2);
          break;
        }
      }

      for (const algo of ['bfs','dijkstra','astar','dfs','greedy']) {
        const pl = pathLayers[algo];
        if (pl && pl.has(k)) {
          ctx.fillStyle = PATH_COLORS[algo];
          ctx.globalAlpha = 0.7;
          ctx.fillRect(x+2, y+2, CELL_SIZE-4, CELL_SIZE-4);
          ctx.globalAlpha = 1;
          break;
        }
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.07)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
    }
  }

  drawMarker(startPos.r, startPos.c, '#22c55e', 'S');
  drawMarker(endPos.r, endPos.c, '#ef4444', 'E');
}

function drawMarker(r, c, color, letter) {
  const x = c * CELL_SIZE, y = r * CELL_SIZE;
  ctx.fillStyle = color;
  ctx.fillRect(x+1, y+1, CELL_SIZE-2, CELL_SIZE-2);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px Verdana, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, x + CELL_SIZE/2, y + CELL_SIZE/2);
}

async function runAll() {
  if (running) return;
  running = true;
  killTimers();
  visitedLayers = {};
  pathLayers = {};
  allNodeData = {};
  drawGrid();
  clearAnalysis();

  const hType = document.getElementById('heuristic-sel').value;
  const speed = parseInt(speedSlider.value);
  const delay = Math.max(1, Math.round((101 - speed) * 0.4));

  setStatus('Computing paths...');

  const params = { grid, rows: ROWS, cols: COLS, startPos, endPos, weights: WEIGHTS, hType };

  const t0 = performance.now(); const bfsR    = runBFS(params);      const bfsT    = performance.now() - t0;
  const t1 = performance.now(); const dijkR   = runDijkstra(params); const dijkT   = performance.now() - t1;
  const t2 = performance.now(); const astarR  = runAStar(params);    const astarT  = performance.now() - t2;
  const t3 = performance.now(); const dfsR    = runDFS(params);      const dfsT    = performance.now() - t3;
  const t4 = performance.now(); const greedyR = runGreedy(params);   const greedyT = performance.now() - t4;

  const ei = endPos.r * COLS + endPos.c;

  const paths = {
    bfs:      bfsR.dist?.[ei]    >= 0        ? reconstructPath(bfsR.prev,    ei) : [],
    dijkstra: dijkR.dist?.[ei]   < Infinity  ? reconstructPath(dijkR.prev,   ei) : [],
    astar:    astarR.dist?.[ei]  < Infinity  ? reconstructPath(astarR.prev,  ei) : [],
    dfs:      dfsR.prev?.[ei]    !== -1      ? reconstructPath(dfsR.prev,    ei) : [],
    greedy:   greedyR.prev?.[ei] !== -1      ? reconstructPath(greedyR.prev, ei) : [],
  };

  const results = {
    bfs:      { order: bfsR.order,    pathLen: paths.bfs.length      ? paths.bfs.length      - 1 : -1, time: bfsT    },
    dijkstra: { order: dijkR.order,   pathLen: paths.dijkstra.length ? paths.dijkstra.length - 1 : -1, time: dijkT   },
    astar:    { order: astarR.order,  pathLen: paths.astar.length    ? paths.astar.length    - 1 : -1, time: astarT  },
    dfs:      { order: dfsR.order,    pathLen: paths.dfs.length      ? paths.dfs.length      - 1 : -1, time: dfsT    },
    greedy:   { order: greedyR.order, pathLen: paths.greedy.length   ? paths.greedy.length   - 1 : -1, time: greedyT },
  };

  const costs = {
    bfs:      bfsR.dist?.[ei]    >= 0       ? bfsR.dist[ei]    : null,
    dijkstra: dijkR.dist?.[ei]   < Infinity ? dijkR.dist[ei]   : null,
    astar:    astarR.dist?.[ei]  < Infinity ? astarR.dist[ei]  : null,
    dfs:      null,
    greedy:   null,
  };

  for (const r of [bfsR, dijkR, astarR, dfsR, greedyR]) {
    if (r.ndData) Object.assign(allNodeData, r.ndData);
  }

  for (const [algo, data] of Object.entries(results)) {
    const prefix = algo === 'dijkstra' ? 'dijk' : algo;
    document.getElementById(`${prefix}-nodes`).textContent = data.order.length;
    document.getElementById(`${prefix}-path`).textContent  = data.pathLen >= 0 ? data.pathLen : 'x';
    document.getElementById(`${prefix}-time`).textContent  = data.time.toFixed(1);
  }

  setStatus('Animating...');

  await Promise.all(
    Object.entries(paths).map(([algo, path]) =>
      animateAlgo(algo, results[algo].order, new Set(path), delay)
    )
  );

  running = false;
  canvas.style.cursor = 'pointer';
  setStatus('Done. Click any visited cell to inspect the decision made there.');

  buildAnalysis(results, costs, paths, hType);
}

function animateAlgo(algo, order, pathSet, delay) {
  const vl = new Uint8Array(ROWS * COLS);
  visitedLayers[algo] = vl;

  return new Promise(resolve => {
    let i = 0;
    const batch = Math.max(1, Math.floor(order.length / 300));

    function step() {
      for (let b = 0; b < batch && i < order.length; b++, i++) vl[order[i]] = 1;
      const prefix = algo === 'dijkstra' ? 'dijk' : algo;
      document.getElementById(`${prefix}-prog`).style.width = Math.round((i / order.length) * 75) + '%';
      drawGrid();

      if (i < order.length) {
        animTimers.push(setTimeout(step, delay));
      } else {
        pathLayers[algo] = pathSet;
        drawGrid();
        document.getElementById(`${prefix}-prog`).style.width = '100%';
        resolve();
      }
    }
    step();
  });
}
 ## cyclical entropy --> highly 
function buildAnalysis(results, costs, paths, hType) {
  const body = document.getElementById('analysis-body');

  const hasWeighted = gridHasWeightedTerrain();
  const algosWithPath = Object.keys(paths).filter(a => paths[a].length > 0);

  if (!algosWithPath.length) {
    body.innerHTML = '<div class="analysis-placeholder">No algorithm found a path. The end node may be unreachable.</div>';
    return;
  }

  const validCosts = Object.values(costs).filter(v => v !== null);
  const optimalCost = Math.min(...validCosts);
  const optimalAlgos = Object.keys(costs).filter(a => costs[a] !== null && Math.abs(costs[a] - optimalCost) < 0.01);

  const shortestHops = Math.min(
    ...algosWithPath.filter(a => results[a].pathLen >= 0).map(a => results[a].pathLen)
  );

  const rankByNodes = algosWithPath
    .filter(a => results[a].order.length > 0)
    .sort((a, b) => results[a].order.length - results[b].order.length);

  const astarNodes = results.astar.order.length;
  const dijkNodes  = results.dijkstra.order.length;

  let html = '<div class="analysis-grid">';

  html += `
    <div class="analysis-card winner">
      <h3>Optimal path found by</h3>
      <div class="winner-name" style="color:${PATH_COLORS[optimalAlgos[0]] || '#1a1a1a'}">
        ${optimalAlgos.map(a => ALGO_NAMES[a]).join(' + ')}
      </div>
      <p>Weighted path cost: <strong>${optimalCost.toFixed(1)}</strong>${hasWeighted ? ', accounting for forest and water terrain costs' : ''}.</p>
    </div>
  `;

  html += `
    <div class="analysis-card">
      <h3>Nodes explored</h3>
      ${rankByNodes.map(a => `
        <div class="metric-row">
          <span class="label" style="color:${PATH_COLORS[a]}">${ALGO_NAMES[a]}</span>
          <span class="val">${results[a].order.length.toLocaleString()}</span>
        </div>
      `).join('')}
    </div>
  `;

  html += `
    <div class="analysis-card">
      <h3>Path lengths</h3>
      ${algosWithPath
        .filter(a => results[a].pathLen >= 0)
        .sort((a, b) => results[a].pathLen - results[b].pathLen)
        .map(a => `
          <div class="metric-row">
            <span class="label" style="color:${PATH_COLORS[a]}">${ALGO_NAMES[a]}</span>
            <span class="val">${results[a].pathLen} steps</span>
          </div>
        `).join('')}
    </div>
  `;

  html += `
    <div class="analysis-card">
      <h3>Execution time</h3>
      ${Object.entries(results)
        .sort((a, b) => a[1].time - b[1].time)
        .map(([a, d]) => `
          <div class="metric-row">
            <span class="label" style="color:${PATH_COLORS[a]}">${ALGO_NAMES[a]}</span>
            <span class="val">${d.time.toFixed(2)}ms</span>
          </div>
        `).join('')}
    </div>
  `;

  html += '</div>';

  html += '<div class="analysis-verdict"><h3>Verdict</h3>';

  if (hasWeighted) {
    html += `<p>This grid has weighted terrain (forest costs 3, water costs 5), which changes the picture significantly. 
    <span class="tag">BFS</span> finds the shortest hop count but ignores terrain cost entirely, 
    so its path may look short but could pass through expensive cells. 
    <span class="tag">Dijkstra</span> and <span class="tag">A*</span> both account for weights, 
    so their weighted cost of <strong>${optimalCost.toFixed(1)}</strong> is the true optimum on this grid.</p>`;
  } else {
    html += `<p>No weighted terrain on this grid, so all cells cost the same to traverse and path length equals path cost. 
    <span class="tag">BFS</span>, <span class="tag">Dijkstra</span>, and <span class="tag">A*</span> 
    all guarantee the shortest path in this case. The real differences between them only become visible once terrain weights are introduced.</p>`;
  }

  if (optimalAlgos.includes('astar') && dijkNodes > 0) {
    const savings = Math.round((1 - astarNodes / dijkNodes) * 100);
    if (savings > 5) {
      html += `<p>A* explored <strong>${astarNodes.toLocaleString()}</strong> nodes to find that path, 
      compared to Dijkstra's <strong>${dijkNodes.toLocaleString()}</strong>, roughly <strong>${savings}% fewer</strong>. 
      That advantage comes from the <strong>${hType} heuristic</strong>, which steers expansion toward the goal 
      rather than radiating outward uniformly. Because the heuristic is admissible and never overestimates the true remaining cost, 
      the optimal path is still guaranteed.</p>`;
    } else {
      html += `<p>On this particular grid A* and Dijkstra explored a similar number of nodes 
      (<strong>${astarNodes.toLocaleString()}</strong> vs <strong>${dijkNodes.toLocaleString()}</strong>). 
      The ${hType} heuristic has limited room to prune when the path is relatively direct. 
      A*'s advantage grows more dramatically on larger or more obstacle heavy grids.</p>`;
    }
  }

  const dfsLen = results.dfs.pathLen;
  if (dfsLen > 0 && dfsLen > shortestHops) {
    const overhead = Math.round(((dfsLen - shortestHops) / shortestHops) * 100);
    html += `<p>DFS found a path of length <strong>${dfsLen}</strong>, which is 
    <strong>${dfsLen - shortestHops} steps (${overhead}%) longer</strong> than optimal. 
    This is expected because DFS commits to one branch at a time with no cost awareness, 
    stumbling upon the goal rather than seeking it efficiently. 
    It explored <strong>${results.dfs.order.length.toLocaleString()}</strong> nodes in the process.</p>`;
  }

  const greedyLen = results.greedy.pathLen;
  if (greedyLen > 0 && !optimalAlgos.includes('greedy')) {
    html += `<p>Greedy Best-First explored only <strong>${results.greedy.order.length.toLocaleString()}</strong> nodes 
    but its path was suboptimal${hasWeighted ? ', partly because it ignored terrain weights entirely' : ''}. 
    Without tracking g(n) it rushes toward the goal by straight line estimate 
    and can be lured through unnecessarily expensive or roundabout routes.</p>`;
  } else if (greedyLen > 0 && optimalAlgos.includes('greedy')) {
    html += `<p>Greedy Best-First happened to find the optimal path on this grid too, 
    and did so while exploring only <strong>${results.greedy.order.length.toLocaleString()}</strong> nodes. 
    This does not mean it is reliable. Add a few walls or weighted cells and Greedy can diverge significantly from optimal.</p>`;
  }

  html += `<p style="margin-top:10px">For production pathfinding such as GPS routing, game AI, or robot navigation, 
  <strong>A* with an admissible heuristic</strong> is the standard choice. 
  It matches Dijkstra's correctness guarantee while exploring far fewer nodes, 
  and the heuristic can be tuned to the geometry of the specific problem.</p>`;

  html += '</div>';

  body.innerHTML = html;
}

function gridHasWeightedTerrain() {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c] === FOREST || grid[r][c] === WATER) return true;
  return false;
}

function showNodeExplanation({ r, c }) {
  const k = r * COLS + c;
  const data = allNodeData[k];
  const ep = document.getElementById('explain-panel');
  const et = document.getElementById('explain-title');
  const eb = document.getElementById('explain-body');

  if (!data) { ep.classList.remove('show'); return; }

  et.textContent = `Node (row ${r}, col ${c}) — ${data.algo}`;

  let html = `<p>${data.decision}</p>`;

  if (data.g !== null || data.h !== null || data.f !== null) {
    html += '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">';
    if (data.g !== null) html += `<span class="cost-badge">g(n) = ${(+data.g).toFixed(2)}</span>`;
    if (data.h !== null) html += `<span class="cost-badge">h(n) = ${(+data.h).toFixed(2)}</span>`;
    if (data.f !== null) html += `<span class="cost-badge f-val">f(n) = ${(+data.f).toFixed(2)}</span>`;
    html += '</div>';
  }
  if (data.w != null) {
    html += `<p style="margin-top:5px;color:#aaa">Terrain weight entering this cell: x${data.w}</p>`;
  }

  eb.innerHTML = html;
  ep.classList.add('show');
}

function genMaze() {
  if (running) return;
  killTimers();

  const g = Array.from({ length: ROWS }, () => new Array(COLS).fill(WALL));

  const sr = startPos.r % 2 === 0 ? startPos.r : Math.max(0, startPos.r - 1);
  const sc = startPos.c % 2 === 0 ? startPos.c : Math.max(0, startPos.c - 1);

  function carve(r, c) {
    g[r][c] = EMPTY;
    const dirs = [[0,2],[2,0],[0,-2],[-2,0]].sort(() => Math.random() - 0.5);
    for (const [dr, dc] of dirs) {
      const nr = r+dr, nc = c+dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && g[nr][nc] === WALL) {
        g[r + dr/2][c + dc/2] = EMPTY;
        carve(nr, nc);
      }
    }
  }

  carve(sr, sc);

  g[startPos.r][startPos.c] = START;
  g[endPos.r][endPos.c] = END;

  for (const [dr, dc] of [[0,1],[1,0],[0,-1],[-1,0]]) {
    const nr = endPos.r+dr, nc = endPos.c+dc;
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && g[nr][nc] === WALL) {
      g[nr][nc] = EMPTY;
      break;
    }
  }

  grid = g;
  visitedLayers = {};
  pathLayers = {};
  allNodeData = {};
  resetStats();
  clearAnalysis();
  drawGrid();
  setStatus('Maze generated via recursive backtracking. Hit Visualise All!');
}

function clearGrid() {
  killTimers();
  grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(EMPTY));
  startPos = { r: 6, c: 6 };
  endPos   = { r: 17, c: 29 };
  grid[startPos.r][startPos.c] = START;
  grid[endPos.r][endPos.c] = END;
  visitedLayers = {};
  pathLayers = {};
  allNodeData = {};
  running = false;
  canvas.style.cursor = 'crosshair';
  document.getElementById('explain-panel').classList.remove('show');
  resetStats();
  clearAnalysis();
  drawGrid();
  setStatus('Grid cleared.');
}

function resetPaths() {
  killTimers();
  visitedLayers = {};
  pathLayers = {};
  allNodeData = {};
  running = false;
  canvas.style.cursor = 'crosshair';
  document.getElementById('explain-panel').classList.remove('show');
  resetStats();
  clearAnalysis();
  drawGrid();
  setStatus('Paths cleared. Adjust the grid and run again.');
}

function clearAnalysis() {
  document.getElementById('analysis-body').innerHTML =
    '<div class="analysis-placeholder">Run the visualiser to see a full breakdown of which algorithm found the optimal path, why, and what the tradeoffs were on this specific grid.</div>';
}

function setStatus(msg) {
  document.getElementById('status-bar').innerHTML = msg;
}

function resetStats() {
  const ids = [
    'bfs-nodes','bfs-path','bfs-time','bfs-prog',
    'dijk-nodes','dijk-path','dijk-time','dijk-prog',
    'astar-nodes','astar-path','astar-time','astar-prog',
    'dfs-nodes','dfs-path','dfs-time','dfs-prog',
    'greedy-nodes','greedy-path','greedy-time','greedy-prog',
  ];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (id.endsWith('-prog')) el.style.width = '0%';
    else el.textContent = '—';
  }
}

function killTimers() {
  animTimers.forEach(clearTimeout);
  animTimers = [];
  running = false;
}

drawGrid();
setStatus('Draw walls by clicking or dragging, then hit <strong>Visualise All</strong>.');
