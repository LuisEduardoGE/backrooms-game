import { Cell, DIR_STEP, DIRS, type Grid, getCell, inBounds, type Point } from '../world/grid';

/** Minimal binary min-heap of cell indices keyed by f-score. */
class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, key: number): void {
    this.items.push(item);
    this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.items.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}

/**
 * 4-neighbour A* (Manhattan heuristic). Returns the path from → to inclusive, or null when the goal
 * is off-limits, unreachable, or the expansion cap is hit (so a bad goal never stalls a frame).
 */
export function findPath(
  grid: Grid,
  from: Point,
  to: Point,
  canEnter: (x: number, y: number) => boolean = (x, y) => getCell(grid, x, y) === Cell.Floor,
  maxExpansions = 3000,
): Point[] | null {
  if (!canEnter(from.x, from.y) || !canEnter(to.x, to.y)) return null;
  const w = grid.width;
  const start = from.y * w + from.x;
  const goal = to.y * w + to.x;
  if (start === goal) return [{ ...from }];
  const h = (i: number) => {
    const x = i % w;
    return Math.abs(x - to.x) + Math.abs((i - x) / w - to.y);
  };

  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  open.push(start, h(start));
  let expansions = 0;

  while (open.size > 0) {
    const cur = open.pop()!;
    if (cur === goal) {
      const path: Point[] = [];
      for (let c: number | undefined = cur; c !== undefined; c = came.get(c)) {
        const x = c % w;
        path.push({ x, y: (c - x) / w });
      }
      return path.reverse();
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++expansions > maxExpansions) return null;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const d of DIRS) {
      const nx = cx + DIR_STEP[d].x;
      const ny = cy + DIR_STEP[d].y;
      if (!inBounds(grid, nx, ny) || !canEnter(nx, ny)) continue;
      const n = ny * w + nx;
      if (closed.has(n)) continue;
      const ng = g.get(cur)! + 1;
      if (ng < (g.get(n) ?? Infinity)) {
        g.set(n, ng);
        came.set(n, cur);
        open.push(n, ng + h(n));
      }
    }
  }
  return null;
}
