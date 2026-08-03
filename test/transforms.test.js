import { describe, it, expect } from 'vitest'
import { mat3Identity, mat3Mul, mat3Inverse, makeLocalMatrix, decomposeAffineMatrix, computeWorldMatrices, computeEffectiveProps } from '../src/domain/transforms.js'

function expectClose(a, b, _eps = 1e-5) {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i++) {
    expect(a[i]).toBeCloseTo(b[i], 5)
  }
}

function identityArray() {
  return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
}

describe('mat3Identity', () => {
  it('returns a 3x3 identity matrix as Float32Array', () => {
    const m = mat3Identity()
    expect(m).toBeInstanceOf(Float32Array)
    expect(m.length).toBe(9)
    expectClose(m, identityArray())
  })

  it('each call returns a new instance', () => {
    const a = mat3Identity()
    const b = mat3Identity()
    expect(a).not.toBe(b)
    expectClose(a, b)
  })
})

describe('decomposeAffineMatrix', () => {
  it('round-trips a transform with a non-zero pivot', () => {
    const source = {
      x: 14, y: 25, rotation: 45, scaleX: 2, scaleY: 3, pivotX: 4, pivotY: 5,
    }
    const result = decomposeAffineMatrix(makeLocalMatrix(source), source)
    expectClose(makeLocalMatrix(result), makeLocalMatrix(source))
  })

  it('keeps the authored full-turn branch when decomposing', () => {
    const source = {
      x: 14, y: 25, rotation: -720, scaleX: 2, scaleY: 3, pivotX: 0, pivotY: 0,
    }
    const result = decomposeAffineMatrix(makeLocalMatrix(source), source)
    expect(result.rotation).toBeCloseTo(-720)
  })
})

describe('mat3Mul', () => {
  it('identity × M = M', () => {
    const m = makeLocalMatrix({ x: 5, y: 10, rotation: 30 })
    const result = mat3Mul(mat3Identity(), m)
    expectClose(result, m)
  })

  it('M × identity = M', () => {
    const m = makeLocalMatrix({ x: 5, y: 10, rotation: 30 })
    const result = mat3Mul(m, mat3Identity())
    expectClose(result, m)
  })

  it('rotation matrix multiplied with another rotation', () => {
    const rot45 = makeLocalMatrix({ rotation: 45 })
    const rot30 = makeLocalMatrix({ rotation: 30 })
    const combined = mat3Mul(rot45, rot30)
    const expected = makeLocalMatrix({ rotation: 75 })
    expectClose(combined, expected)
  })

  it('rotation matrices are not commutative', () => {
    const rotA = makeLocalMatrix({ rotation: 45, scaleX: 2 })
    const rotB = makeLocalMatrix({ rotation: 30, scaleY: 3 })
    const ab = mat3Mul(rotA, rotB)
    const ba = mat3Mul(rotB, rotA)
    let diff = false
    for (let i = 0; i < 9; i++) {
      if (Math.abs(ab[i] - ba[i]) > 1e-5) { diff = true; break }
    }
    expect(diff).toBe(true)
  })

  it('matrix multiplication is associative: (A×B)×C = A×(B×C)', () => {
    const a = makeLocalMatrix({ x: 1, y: 2, rotation: 10 })
    const b = makeLocalMatrix({ x: 3, y: 4, rotation: 20, scaleX: 1.5 })
    const c = makeLocalMatrix({ x: 5, y: 6, rotation: 30, scaleY: 0.75 })
    const ab_c = mat3Mul(mat3Mul(a, b), c)
    const a_bc = mat3Mul(a, mat3Mul(b, c))
    expectClose(ab_c, a_bc)
  })
})

describe('mat3Inverse', () => {
  it('M × M⁻¹ ≈ identity', () => {
    const m = makeLocalMatrix({ x: 10, y: 20, rotation: 45, scaleX: 2, scaleY: 3 })
    const inv = mat3Inverse(m)
    const product = mat3Mul(m, inv)
    expectClose(product, identityArray())
  })

  it('inverse of identity is identity', () => {
    const inv = mat3Inverse(mat3Identity())
    expectClose(inv, identityArray())
  })

  it('near-singular matrix returns identity', () => {
    const singular = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 1])
    const inv = mat3Inverse(singular)
    expectClose(inv, identityArray())
  })

  it('inverse of inverse is the original matrix', () => {
    const m = makeLocalMatrix({ x: 7, y: -3, rotation: 60, scaleX: 1.2, scaleY: 0.8 })
    const doubleInv = mat3Inverse(mat3Inverse(m))
    expectClose(doubleInv, m)
  })
})

describe('makeLocalMatrix', () => {
  it('null returns identity', () => {
    const m = makeLocalMatrix(null)
    expectClose(m, identityArray())
  })

  it('undefined returns identity', () => {
    const m = makeLocalMatrix(undefined)
    expectClose(m, identityArray())
  })

  it('empty object returns identity', () => {
    const m = makeLocalMatrix({})
    expectClose(m, identityArray())
  })

  it('translation only: {x:10, y:20}', () => {
    const m = makeLocalMatrix({ x: 10, y: 20 })
    expect(m[0]).toBeCloseTo(1)
    expect(m[1]).toBeCloseTo(0)
    expect(m[3]).toBeCloseTo(0)
    expect(m[4]).toBeCloseTo(1)
    expect(m[6]).toBeCloseTo(10)
    expect(m[7]).toBeCloseTo(20)
  })

  it('rotation only: {rotation:90}', () => {
    const m = makeLocalMatrix({ rotation: 90 })
    expect(m[0]).toBeCloseTo(0)
    expect(m[1]).toBeCloseTo(1)
    expect(m[3]).toBeCloseTo(-1)
    expect(m[4]).toBeCloseTo(0)
    expect(m[6]).toBeCloseTo(0)
    expect(m[7]).toBeCloseTo(0)
  })

  it('scale only: {scaleX:2, scaleY:3}', () => {
    const m = makeLocalMatrix({ scaleX: 2, scaleY: 3 })
    expect(m[0]).toBeCloseTo(2)
    expect(m[1]).toBeCloseTo(0)
    expect(m[3]).toBeCloseTo(0)
    expect(m[4]).toBeCloseTo(3)
    expect(m[6]).toBeCloseTo(0)
    expect(m[7]).toBeCloseTo(0)
  })

  it('combined transform with pivot', () => {
    const m = makeLocalMatrix({ x: 10, y: 20, rotation: 45, scaleX: 2, scaleY: 2, pivotX: 5, pivotY: 5 })
    const θ = 45 * Math.PI / 180
    const c = Math.cos(θ)
    const s = Math.sin(θ)
    expect(m[0]).toBeCloseTo(2 * c)
    expect(m[1]).toBeCloseTo(2 * s)
    expect(m[3]).toBeCloseTo(-2 * s)
    expect(m[4]).toBeCloseTo(2 * c)
    expect(m[6]).toBeCloseTo((10 + 5) - 2 * c * 5 - (-2 * s) * 5)
    expect(m[7]).toBeCloseTo((20 + 5) - 2 * s * 5 - 2 * c * 5)
  })

  it('has correct column-major layout', () => {
    const m = makeLocalMatrix({ x: 1, y: 2 })
    expect(m).toBeInstanceOf(Float32Array)
    expect(m.length).toBe(9)
    expect(m[2]).toBe(0)
    expect(m[5]).toBe(0)
    expect(m[8]).toBe(1)
  })
})

describe('computeWorldMatrices', () => {
  it('single root node: world = local', () => {
    const nodes = [{ id: 'a', transform: { x: 5, y: 10 } }]
    const worldMap = computeWorldMatrices(nodes)
    const local = makeLocalMatrix({ x: 5, y: 10 })
    expectClose(worldMap.get('a'), local)
  })

  it('parent-child: child world = parent world × child local', () => {
    const nodes = [
      { id: 'parent', transform: { x: 10, y: 20 } },
      { id: 'child', transform: { x: 5, y: 5 }, parent: 'parent' },
    ]
    const worldMap = computeWorldMatrices(nodes)
    const parentWorld = worldMap.get('parent')
    const childLocal = makeLocalMatrix({ x: 5, y: 5 })
    const expected = mat3Mul(parentWorld, childLocal)
    expectClose(worldMap.get('child'), expected)
  })

  it('three-level hierarchy', () => {
    const nodes = [
      { id: 'grandparent', transform: { x: 10, y: 0, rotation: 45 } },
      { id: 'parent', transform: { x: 0, y: 20, rotation: 30 }, parent: 'grandparent' },
      { id: 'child', transform: { x: 5, y: 5 }, parent: 'parent' },
    ]
    const worldMap = computeWorldMatrices(nodes)
    const gpWorld = worldMap.get('grandparent')
    const pLocal = makeLocalMatrix({ x: 0, y: 20, rotation: 30 })
    const pWorld = mat3Mul(gpWorld, pLocal)
    expectClose(worldMap.get('parent'), pWorld)
    const cLocal = makeLocalMatrix({ x: 5, y: 5 })
    const cWorld = mat3Mul(pWorld, cLocal)
    expectClose(worldMap.get('child'), cWorld)
  })

  it('sibling nodes with same parent', () => {
    const nodes = [
      { id: 'root', transform: { x: 0, y: 0 } },
      { id: 'sibling1', transform: { x: 10, y: 0 }, parent: 'root' },
      { id: 'sibling2', transform: { x: 0, y: 10 }, parent: 'root' },
    ]
    const worldMap = computeWorldMatrices(nodes)
    const rootWorld = worldMap.get('root')
    const s1Local = makeLocalMatrix({ x: 10, y: 0 })
    const s2Local = makeLocalMatrix({ x: 0, y: 10 })
    expectClose(worldMap.get('sibling1'), mat3Mul(rootWorld, s1Local))
    expectClose(worldMap.get('sibling2'), mat3Mul(rootWorld, s2Local))
  })

  it('returns a Map', () => {
    const nodes = [{ id: 'a', transform: {} }]
    const worldMap = computeWorldMatrices(nodes)
    expect(worldMap).toBeInstanceOf(Map)
    expect(worldMap.size).toBe(1)
  })
})

describe('gl-matrix integration', () => {
  it('mat3Mul produces correct result for known values', () => {
    const a = new Float32Array([
      1, 2, 0,
      3, 4, 0,
      5, 6, 1,
    ]);
    const b = new Float32Array([
      7, 8, 0,
      9, 10, 0,
      11, 12, 1,
    ]);
    const c = mat3Mul(a, b);
    expect(c[0]).toBeCloseTo(1 * 7 + 3 * 8);
    expect(c[1]).toBeCloseTo(2 * 7 + 4 * 8);
    expect(c[3]).toBeCloseTo(1 * 9 + 3 * 10);
    expect(c[4]).toBeCloseTo(2 * 9 + 4 * 10);
  })

  it('mat3Inverse for degenerate matrix returns identity', () => {
    const m = new Float32Array([
      0, 0, 0,
      0, 0, 0,
      0, 0, 1,
    ]);
    const inv = mat3Inverse(m);
    expectClose(inv, identityArray())
  })

  it('mat3Inverse handles negative determinant', () => {
    const m = new Float32Array([
      -1, 0, 0,
      0, 1, 0,
      0, 0, 1,
    ]);
    const inv = mat3Inverse(m);
    const product = mat3Mul(m, inv);
    expectClose(product, identityArray())
  })

  it('parent-child hierarchy preserves exact translation', () => {
    const nodes = [
      { id: 'p', transform: { x: 100, y: 200 } },
      { id: 'c', transform: { x: 50, y: 75 }, parent: 'p' },
    ];
    const worldMap = computeWorldMatrices(nodes);
    const cw = worldMap.get('c');
    expect(cw[6]).toBeCloseTo(150, 5);
    expect(cw[7]).toBeCloseTo(275, 5);
  })

  it('rotated parent applies correct transform to child', () => {
    const nodes = [
      { id: 'p', transform: { x: 0, y: 0, rotation: 90 } },
      { id: 'c', transform: { x: 10, y: 0 }, parent: 'p' },
    ];
    const worldMap = computeWorldMatrices(nodes);
    const cw = worldMap.get('c');
    expect(cw[6]).toBeCloseTo(0, 4);
    expect(cw[7]).toBeCloseTo(10, 4);
  })

  it('makeLocalMatrix pivot transform produces exact expected values', () => {
    const m = makeLocalMatrix({
      x: 0, y: 0,
      rotation: 90,
      scaleX: 1, scaleY: 1,
      pivotX: 50, pivotY: 0,
    });
    expect(m[0]).toBeCloseTo(0, 5);
    expect(m[1]).toBeCloseTo(1, 5);
    expect(m[3]).toBeCloseTo(-1, 5);
    expect(m[4]).toBeCloseTo(0, 5);
    expect(m[6]).toBeCloseTo(50, 5);
    expect(m[7]).toBeCloseTo(-50, 5);
  })
})

describe('computeEffectiveProps', () => {
  it('single visible node: visible=true, opacity=1', () => {
    const nodes = [{ id: 'a', visible: true, opacity: 1 }]
    const { visMap, opMap } = computeEffectiveProps(nodes)
    expect(visMap.get('a')).toBe(true)
    expect(opMap.get('a')).toBe(1)
  })

  it('single node with default values: visible=true, opacity=1', () => {
    const nodes = [{ id: 'a' }]
    const { visMap, opMap } = computeEffectiveProps(nodes)
    expect(visMap.get('a')).toBe(true)
    expect(opMap.get('a')).toBe(1)
  })

  it('hidden node without parent is hidden', () => {
    const nodes = [{ id: 'a', visible: false }]
    const { visMap } = computeEffectiveProps(nodes)
    expect(visMap.get('a')).toBe(false)
  })

  it('hidden parent → all children hidden', () => {
    const nodes = [
      { id: 'parent', visible: false },
      { id: 'child', visible: true, parent: 'parent' },
    ]
    const { visMap } = computeEffectiveProps(nodes)
    expect(visMap.get('parent')).toBe(false)
    expect(visMap.get('child')).toBe(false)
  })

  it('visible parent with visible child: both visible', () => {
    const nodes = [
      { id: 'parent', visible: true },
      { id: 'child', visible: true, parent: 'parent' },
    ]
    const { visMap } = computeEffectiveProps(nodes)
    expect(visMap.get('parent')).toBe(true)
    expect(visMap.get('child')).toBe(true)
  })

  it('opacity multiplication through hierarchy', () => {
    const nodes = [
      { id: 'root', opacity: 0.5 },
      { id: 'mid', opacity: 0.5, parent: 'root' },
      { id: 'leaf', opacity: 0.5, parent: 'mid' },
    ]
    const { opMap } = computeEffectiveProps(nodes)
    expect(opMap.get('root')).toBe(0.5)
    expect(opMap.get('mid')).toBeCloseTo(0.25)
    expect(opMap.get('leaf')).toBeCloseTo(0.125)
  })

  it('missing opacity defaults to 1', () => {
    const nodes = [
      { id: 'parent', opacity: 0.3 },
      { id: 'child', parent: 'parent' },
    ]
    const { opMap } = computeEffectiveProps(nodes)
    expect(opMap.get('child')).toBeCloseTo(0.3)
  })

  it('three-level hierarchy: opacity and visibility combined', () => {
    const nodes = [
      { id: 'root', visible: true, opacity: 0.8 },
      { id: 'mid', visible: false, opacity: 0.5, parent: 'root' },
      { id: 'leaf', visible: true, opacity: 1.0, parent: 'mid' },
    ]
    const { visMap, opMap } = computeEffectiveProps(nodes)
    expect(visMap.get('root')).toBe(true)
    expect(visMap.get('mid')).toBe(false)
    expect(visMap.get('leaf')).toBe(false)
    expect(opMap.get('leaf')).toBeCloseTo(0.4)
  })
})
