'use strict';

class MinHeap {
  constructor(key) {
    this._h = [];
    this._key = key || (x => x);
  }

  get size() { return this._h.length; }

  push(val) {
    this._h.push(val);
    this._up(this._h.length - 1);
  }

  pop() {
    if (!this._h.length) return undefined;
    const top = this._h[0];
    const last = this._h.pop();
    if (this._h.length) {
      this._h[0] = last;
      this._down(0);
    }
    return top;
  }

  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._key(this._h[p]) <= this._key(this._h[i])) break;
      [this._h[i], this._h[p]] = [this._h[p], this._h[i]];
      i = p;
    }
  }

  _down(i) {
    const n = this._h.length;
    while (true) {
      let s = i;
      const l = 2*i+1, r = 2*i+2;
      if (l < n && this._key(this._h[l]) < this._key(this._h[s])) s = l;
      if (r < n && this._key(this._h[r]) < this._key(this._h[s])) s = r;
      if (s === i) break;
      [this._h[i], this._h[s]] = [this._h[s], this._h[i]];
      i = s;
    }
  }
}

function heuristic(r1, c1, r2, c2, type) {
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  if (type === 'euclidean') return Math.sqrt(dr*dr + dc*dc);
  if (type === 'chebyshev') return Math.max(dr, dc);
  return dr + dc;
}

const DIRS = [[0,1],[1,0],[0,-1],[-1,0]];

function runBFS({ grid, rows, cols, startPos, endPos }) {
  const dist = new Int32Array(rows * cols).fill(-1);
  const prev = new Int32Array(rows * cols).fill(-1);
  const ndData = {};
  const order = [];

  const si = startPos.r * cols + startPos.c;
  dist[si] = 0;

  const queue = [si];
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head++];
    const cr = Math.floor(cur / cols);
    const cc = cur % cols;
    order.push(cur);

    if (cr === endPos.r && cc === endPos.c) break;

    for (const [dr, dc] of DIRS) {
      const nr = cr+dr, nc = cc+dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (grid[nr][nc] === CELL_TYPES.WALL) continue;
      const nk = nr*cols+nc;
      if (dist[nk] !== -1) continue;

      dist[nk] = dist[cur] + 1;
      prev[nk] = cur;
      ndData[nk] = {
        algo: 'BFS',
        g: dist[nk], h: null, f: null,
        parent: cur, w: 1,
        decision: `BFS reached this node at depth ${dist[nk]} via a FIFO queue. Every node at depth ${dist[nk] - 1} was already visited before any node at this depth. That ordering is exactly what guarantees the minimum hop count path when all edges have equal weight.`
      };
      queue.push(nk);
    }
  }

  return { order, prev, dist, ndData };
}

function runDijkstra({ grid, rows, cols, startPos, endPos, weights }) {
  const dist = new Float64Array(rows * cols).fill(Infinity);
  const prev = new Int32Array(rows * cols).fill(-1);
  const ndData = {};
  const order = [];

  const si = startPos.r * cols + startPos.c;
  dist[si] = 0;

  const pq = new MinHeap(x => x[0]);
  pq.push([0, si]);

  while (pq.size > 0) {
    const [d, cur] = pq.pop();
    if (d > dist[cur]) continue;

    order.push(cur);
    const cr = Math.floor(cur / cols);
    const cc = cur % cols;

    if (cr === endPos.r && cc === endPos.c) break;

    for (const [dr, dc] of DIRS) {
      const nr = cr+dr, nc = cc+dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (grid[nr][nc] === CELL_TYPES.WALL) continue;

      const nk = nr*cols+nc;
      const w = weights[grid[nr][nc]] || 1;
      const nd = dist[cur] + w;

      if (nd < dist[nk]) {
        dist[nk] = nd;
        prev[nk] = cur;
        ndData[nk] = {
          algo: 'Dijkstra',
          g: nd, h: null, f: null,
          parent: cur, w,
          decision: `Dijkstra relaxed this edge: cost of parent is ${d.toFixed(2)}, plus terrain weight ${w}, giving g(n) = ${nd.toFixed(2)}. This improves the previous best known cost so the node is re-inserted into the min heap with the updated value.`
        };
        pq.push([nd, nk]);
      }
    }
  }

  return { order, prev, dist, ndData };
}

function runAStar({ grid, rows, cols, startPos, endPos, weights, hType }) {
  const g = new Float64Array(rows * cols).fill(Infinity);
  const prev = new Int32Array(rows * cols).fill(-1);
  const ndData = {};
  const order = [];

  const si = startPos.r * cols + startPos.c;
  g[si] = 0;

  const pq = new MinHeap(x => x[0]);
  pq.push([heuristic(startPos.r, startPos.c, endPos.r, endPos.c, hType), si]);

  while (pq.size > 0) {
    const [f, cur] = pq.pop();
    const cr = Math.floor(cur / cols);
    const cc = cur % cols;

    const hCur = heuristic(cr, cc, endPos.r, endPos.c, hType);
    if (f > g[cur] + hCur + 1e-9) continue;

    order.push(cur);
    if (cr === endPos.r && cc === endPos.c) break;

    for (const [dr, dc] of DIRS) {
      const nr = cr+dr, nc = cc+dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (grid[nr][nc] === CELL_TYPES.WALL) continue;

      const nk = nr*cols+nc;
      const w = weights[grid[nr][nc]] || 1;
      const ng = g[cur] + w;

      if (ng < g[nk]) {
        g[nk] = ng;
        prev[nk] = cur;
        const h = heuristic(nr, nc, endPos.r, endPos.c, hType);
        const fv = ng + h;
        ndData[nk] = {
          algo: 'A*',
          g: ng, h, f: fv,
          parent: cur, w,
          decision: `A* chose this node because f(n) = g(n) + h(n) = ${ng.toFixed(2)} + ${h.toFixed(2)} = ${fv.toFixed(2)}. The heuristic is admissible meaning it never overestimates the true remaining cost, so A* is guaranteed to return the optimal path. Terrain weight entering this cell: x${w}.`
        };
        pq.push([fv, nk]);
      }
    }
  }

  return { order, prev, dist: g, ndData };
}

function runDFS({ grid, rows, cols, startPos, endPos }) {
  const visited = new Uint8Array(rows * cols);
  const prev = new Int32Array(rows * cols).fill(-1);
  const ndData = {};
  const order = [];

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
      const nr = cr+dr, nc = cc+dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (grid[nr][nc] === CELL_TYPES.WALL) continue;
      const nk = nr*cols+nc;
      if (visited[nk]) continue;

      visited[nk] = 1;
      prev[nk] = cur;
      ndData[nk] = {
        algo: 'DFS',
        g: null, h: null, f: null,
        parent: cur, w: null,
        decision: `DFS pushed this node onto the LIFO stack. It will explore this entire branch fully before ever backtracking. No cost is tracked at any point, which is why DFS paths are often much longer than necessary.`
      };
      stack.push(nk);
    }
  }

  return { order, prev, ndData };
}

function runGreedy({ grid, rows, cols, startPos, endPos, hType }) {
  const visited = new Uint8Array(rows * cols);
  const prev = new Int32Array(rows * cols).fill(-1);
  const ndData = {};
  const order = [];

  const si = startPos.r * cols + startPos.c;
  const pq = new MinHeap(x => x[0]);
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
      const nr = cr+dr, nc = cc+dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (grid[nr][nc] === CELL_TYPES.WALL) continue;
      const nk = nr*cols+nc;
      if (visited[nk]) continue;

      const h = heuristic(nr, nc, endPos.r, endPos.c, hType);
      prev[nk] = cur;
      ndData[nk] = {
        algo: 'Greedy',
        g: null, h, f: null,
        parent: cur, w: null,
        decision: `Greedy picked this node purely because h(n) = ${h.toFixed(2)} was the lowest straight line estimate to the goal among its neighbours. It ignores path cost g(n) entirely. This makes it fast but it can easily overshoot on complex or weighted grids.`
      };
      pq.push([h, nk]);
    }
  }

  return { order, prev, ndData };
}

function reconstructPath(prev, endIdx) {
  const path = [];
  let cur = endIdx;
  while (cur !== -1) {
    path.unshift(cur);
    cur = prev[cur];
  }
  return path;
}
