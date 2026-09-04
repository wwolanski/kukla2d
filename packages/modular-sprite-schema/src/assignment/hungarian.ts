export function hungarian(cost: readonly (readonly number[])[]): number[] {
  const rows = cost.length; const cols = Math.max(rows, ...cost.map(row => row.length)); const n = Math.max(rows, cols);
  const matrix = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => cost[i]?.[j] ?? 1));
  const u = new Array<number>(n + 1).fill(0); const v = new Array<number>(n + 1).fill(0); const p = new Array<number>(n + 1).fill(0); const way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i += 1) { p[0] = i; let j0 = 0; const minv = new Array<number>(n + 1).fill(Infinity); const used = new Array<boolean>(n + 1).fill(false); do { used[j0] = true; const i0 = p[j0]!; let delta = Infinity; let j1 = 0; for (let j = 1; j <= n; j += 1) if (!used[j]) { const cur = matrix[i0 - 1]![j - 1]! - u[i0]! - v[j]!; if (cur < minv[j]!) { minv[j] = cur; way[j] = j0; } if (minv[j]! < delta) { delta = minv[j]!; j1 = j; } } for (let j = 0; j <= n; j += 1) if (used[j]) { u[p[j]!]! += delta; v[j]! -= delta; } else minv[j]! -= delta; j0 = j1; } while (p[j0] !== 0); do { const j1 = way[j0]!; p[j0] = p[j1]!; j0 = j1; } while (j0 !== 0); }
  const result = new Array<number>(rows).fill(-1); for (let j = 1; j <= n; j += 1) if (p[j]! > 0 && p[j]! <= rows && j <= cols) result[p[j]! - 1] = j - 1; return result;
}
