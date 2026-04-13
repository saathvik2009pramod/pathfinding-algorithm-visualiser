/* =====================================================
   algorithms.js — Graph search algorithms + MinHeap
   All algorithms return { order, prev, dist?, ndData }
   ===================================================== */

'use strict';

/* ── MinHeap ──────────────────────────────────────────
   Generic binary min-heap.
   key(element) → number used for ordering.
   Complexity: push O(log n), pop O(log n).
   Used by Dijkstra, A*, and Greedy (all need priority
   queue over (cost, node) pairs).
   ──────────────────────────────────────────────────── */
class MinHeap {
  constructor(key) {
    this._h   = [];
    this._key = key || (x => x);
  }

  get size() { return this._h.length; }

  push(val) {
    this._h.push(val);
    this._bubbleUp(this._h.length - 1);
  }

  pop() {
    if (this._h.length === 0) return undefined;
    const top    = this._h[0];
    const bottom = this._h.pop();
    if (this._h.length > 0) {
      this._h[0] = bottom;
      this._siftDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._key(this._h[parent]) <= this._key(this._h[i])) break;
      [this._h[i], this._h[parent]] = [this._h[parent], this._h[i]];
      i = parent;
    }
  }

  _siftDown(i) {
    const n = this._h.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this._key(this._h[l]) < this._key(this._h[smallest])) smallest = l;
      if (r < n && this._key(this._h[r]) < this._key(this._h[smallest])) smallest = r;
      if (smallest === i) break;
      [this._h[i], this._h[smallest]] = [this._h[smallest], this._h[i]];
      i = smallest;
    }
  }
}

/* ── Heuristics ───────────────────────────────────────
   All are admissible for 4-directional grids (they never
   overestimate the true cost when terrain weight ≥ 1).
   ──────────────────────────────────────────────────── */
function heuristic(r1, c1, r2, c2, type) {
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  switch (type) {
    case 'euclidean': return Math.sqrt(dr * dr + dc * dc);
    case 'chebyshev': return Math.max(dr, dc);
    default:          return dr + dc;          // manhattan
  }
}

/* Four-directional movement */
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

/* ── BFS ──────────────────────────────────────────────
   Breadth-First Search.
   Guarantee: shortest path (hop count), unweighted.
   Data structure: FIFO queue (plain array used as queue
   with a read pointer — O(1) amortised dequeue).
   Complexity: O(V + E)
   ──────────────────────────────────────────────────── */
function runBFS({ grid, rows, cols, startPos, endPos }) {
  const dist   = new Int32Array(rows * cols).fill(-1);
  const prev   = new Int32Array(rows * cols).fill(-1);
  const ndData = {};
  const order  = [];

  const si = startPos.r * cols + startPos.c;
  dist[si] = 0;

  const queue = [si];
  let head = 0;   // read pointer — avoids O(n) Array.shift

  while (head < queue.length) {
    const cur = queue[head++];
    const cr  = Math.floor(cur / cols);
    const cc  = cur % cols;
    order.push(cur);

    if (cr === endPos.r && cc === endPos.c) break;

    for (const [dr, dc] of DIRS) {
      const nr = cr + dr, nc = cc + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (grid[nr][nc] === CELL_TYPES.WALL) continue;
      const nk = nr * cols + nc;
      if (dist[nk] !== -1) continue;

      dist[nk] = dist[cur] + 1;
      prev[nk] = cur;
      ndData[nk] = {
        algo: 'BFS',
        g: dist[nk], h: null, f: null,
        parent: cur, w: 1,
        decision: `BFS chose this node as the next unvisited neighbour in the FIFO queue ` +
                  `(breadth-first expansion, depth ${dist[nk]}). ` +
                  `Every node at depth ${dist[nk] - 1} was visited before any at depth ${dist[nk]}, ` +
                  `which guarantees the shortest hop-count path.`
      };
      queue.push(nk);
    }
  }

  return { order, prev, dist, ndData };
}

/* ── Dijkstra ─────────────────────────────────────────
   Shortest-path with non-negative weighted edges.
   Data structure: binary min-heap over (cost, node).
   Complexity: O((V + E) log V)
   Weighted terrain: forest=3, water=5, empty/start/end=1
   ──────────────────────────────────────────────────── */
function runDijkstra({ grid, rows, cols, startPos, endPos, weights }) {
  const dist   = new Float64Array(rows * cols).fill(Infinity);
  const prev   = new Int32Array(rows * cols).fill(-1);
  const ndData = {};
  const order  = [];

  const si = startPos.r * cols + startPos.c;
  dist[si] = 0;

  const pq = new MinHeap(item => item[0]);   // [cost, nodeIndex]
  pq.push([0, si]);

  while (pq.size > 0) {
    const [d, cur] = pq.pop();
    if (d > dist[cur]) continue;    // stale entry

    order.push(cur);
    const cr = Math.floor(cur / cols);
    const cc = cur % cols;

    if (cr === endPos.r && cc === endPos.c) break;

    for (const [dr, dc] of DIRS) {
      const nr = cr + dr, nc = cc + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (grid[nr][nc] === CELL_TYPES.WALL) continue;

      const nk  = nr * cols + nc;
      const w   = weights[grid[nr][nc]] || 1;
      const nd  = dist[cur] + w;

      if (nd < dist[nk]) {
        dist[nk] = nd;
        prev[nk] = cur;
        ndData[nk] = {
          algo: 'Dijkstra',
          g: nd, h: null, f: null,
          parent: cur, w,
          decision: `Dijkstra relaxed this edge: ` +
                    `g(parent)=${d.toFixed(2)} + terrain_weight=${w} = g(n)=${nd.toFixed(2)}. ` +
                    `This beats the previous best cost, so the node was re-queued in the min-heap.`
        };
        pq.push([nd, nk]);
      }
    }
  }

  return { order, prev, dist, ndData };
}

/* ── A* ───────────────────────────────────────────────
   Best-first search using f(n) = g(n) + h(n).
   Optimal when h(n) is admissible (never overestimates).
   Data structure: binary min-heap over f(n).
   Complexity: O((V + E) log V) — better in practice due
   to heuristic pruning.
   ──────────────────────────────────────────────────── */
function runAStar({ grid, rows, cols, startPos, endPos, weights, hType }) {
  const g      = new Float64Array(rows * cols).fill(Infinity);
  const prev   = new Int32Array(rows * cols).fill(-1);
  const ndData = {};
  const order  = [];

  const si = startPos.r * cols + startPos.c;
  g[si] = 0;

  const pq = new MinHeap(item => item[0]);   // [f, nodeIndex]
  pq.push([heuristic(startPos.r, startPos.c, endPos.r, endPos.c, hType), si]);

  while (pq.size > 0) {
    const [f, cur] = pq.pop();
    const cr = Math.floor(cur / cols);
    const cc = cur % cols;

    // Skip if we've found a better path to this node already
    const h_cur = heuristic(cr, cc, endPos.r, endPos.c, hType);
    if (f > g[cur] + h_cur + 1e-9) continue;

    order.push(cur);
    if (cr === endPos.r && cc === endPos.c) break;

    for (const [dr, dc] of DIRS) {
      const nr = cr + dr, nc = cc + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (grid[nr][nc] === CELL_TYPES.WALL) continue;

      const nk  = nr * cols + nc;
      const w   = weights[grid[nr][nc]] || 1;
      const ng  = g[cur] + w;

      if (ng < g[nk]) {
        g[nk]   = ng;
        prev[nk] = cur;
        const h  = heuristic(nr, nc, endPos.r, endPos.c, hType);
        const fv = ng + h;
        ndData[nk] = {
          algo: 'A*',
          g: ng, h, f: fv,
          parent: cur, w,
          decision: `A* chose this node because f(n) = g(n) + h(n) = ${ng.toFixed(2)} + ${h.toFixed(2)} = ${fv.toFixed(2)}. ` +
                    `The heuristic h(n) is admissible (never overestimates true cost), so A* is guaranteed ` +
                    `to find the optimal path when it terminates. ` +
                    `Terrain weight entering this cell: ×${w}.`
        };
        pq.push([fv, nk]);
      }
    }
  }

  return { order, prev, dist: g, ndData };
}

/* ── DFS ──────────────────────────────────────────────
   Depth-First Search.
   Not optimal — finds A path, not necessarily shortest.
   Data structure: explicit LIFO stack.
   Complexity: O(V + E), but explores deeply before wide.
   Useful for demonstrating WHY heuristics matter.
   ──────────────────────────────────────────────────── */
function runDFS({ grid, rows, cols, startPos, endPos }) {
  const visited = new Uint8Array(rows * cols);
  const prev    = new Int32Array(rows * cols).fill(-1);
  const ndData  = {};
  const order   = [];

  const si = startPos.r * cols + startPos.c;
  visited[si] = 1;

  const stack = [si];

  while (stack.length > 0) {
    const cur = stack.pop();
    order.push(cur);

    const cr = Math.floor(cur / cols);
    const cc = cur % cols;

    if (cr === endPos.r && cc === endPos.c) break;

    for (const [dr, dc] of DIRS) {
      const nr = cr + dr, nc = cc + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (grid[nr][nc] === CELL_TYPES.WALL) continue;
      const nk = nr * cols + nc;
      if (visited[nk]) continue;

      visited[nk] = 1;
      prev[nk] = cur;
      ndData[nk] = {
        algo: 'DFS',
        g: null, h: null, f: null,
        parent: cur, w: null,
        decision: `DFS pushed this node onto the LIFO stack and will explore its subtree fully ` +
                  `before backtracking. No cost is tracked — DFS does not guarantee the shortest path. ` +
                  `Stack depth at this point: ${stack.length + 1}.`
      };
      stack.push(nk);
    }
  }

  return { order, prev, ndData };
}

/* ── Greedy Best-First ────────────────────────────────
   Like A* but ignores g(n) — only uses h(n).
   Fast to reach goal-like areas, but not optimal.
   Can be dramatically wrong on weighted/maze grids.
   Complexity: O(b^m) where b=branching factor, m=depth.
   ──────────────────────────────────────────────────── */
function runGreedy({ grid, rows, cols, startPos, endPos, hType }) {
  const visited = new Uint8Array(rows * cols);
  const prev    = new Int32Array(rows * cols).fill(-1);
  const ndData  = {};
  const order   = [];

  const si = startPos.r * cols + startPos.c;
  const pq = new MinHeap(item => item[0]);   // [h, nodeIndex]
  pq.push([0, si]);

  while (pq.size > 0) {
    const [, cur] = pq.pop();
    if (visited[cur]) continue;

    visited[cur] = 1;
    order.push(cur);

    const cr = Math.floor(cur / cols);
    const cc = cur % cols;

    if (cr === endPos.r && cc === endPos.c) break;

    for (const [dr, dc] of DIRS) {
      const nr = cr + dr, nc = cc + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (grid[nr][nc] === CELL_TYPES.WALL) continue;
      const nk = nr * cols + nc;
      if (visited[nk]) continue;

      const h = heuristic(nr, nc, endPos.r, endPos.c, hType);
      prev[nk] = cur;
      ndData[nk] = {
        algo: 'Greedy',
        g: null, h, f: null,
        parent: cur, w: null,
        decision: `Greedy Best-First chose this node solely because h(n)=${h.toFixed(2)} — ` +
                  `the smallest heuristic estimate to the goal among open neighbours. ` +
                  `It completely ignores path cost g(n), so it can be much faster than A* ` +
                  `but may return a suboptimal path on weighted or obstacle-heavy grids.`
      };
      pq.push([h, nk]);
    }
  }

  return { order, prev, ndData };
}

/* ── Path reconstruction ──────────────────────────────
   Walk back through prev[] array from end to start.
   Returns array of node indices from start → end.
   ──────────────────────────────────────────────────── */
function reconstructPath(prev, endIdx) {
  const path = [];
  let cur = endIdx;
  while (cur !== -1) {
    path.unshift(cur);
    cur = prev[cur];
  }
  return path;
}
