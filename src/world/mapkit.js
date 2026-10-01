// Map-building kit (shared by every stage layout). Map layouts. A map is a list of oriented boxes. Everything in `half` is also mirrored by a 180° rotation about the
// Y axis ((x,z) -> (-x,-z)) so both teams get an identical arena. Team Alpha spawns at -Z, Bravo at +Z.
//
// box helpers:
//   B(x0,x1, y0,y1, z0,z1, opts)             axis-aligned box
//   R([x,y,z] low, [x,y,z] high, width, opts) ramp slab whose top surface runs from low edge-centre to high edge-centre
// opts: { color, pattern, paint (default true), solid (default true), tag }

export const PATTERN = { plain: 0, deck: 1, tiles: 2, concrete: 3, hazard: 4, container: 5, wood: 6, metal: 7, spawn: 8, planter: 9, asphalt: 10, metalpanel: 11, grate: 12, brick: 13, rubber: 14, glasstile: 15, pavers: 16,
  // marina set (texlib: planks = hardwood dock decking in its own colours; the rest take the block colour as paint)
  planks: 17, hullpaint: 18, nonslip: 19, gelcoat: 20, yard: 21, weatherboard: 22, render: 23,
  // stairs + ramps (ramp tops are textured in the ramp's own frame: treads / cleats always run across the slope)
  treads: 24, stonestep: 25, rampboard: 26, gangdeck: 27 };

export const C = {
  deck: '#d8d2c4', deckEdge: '#c9c1b0', tile: '#d9dfe0', cream: '#ece4d4', sand: '#e6d3b3', slate: '#a9b4bc',
  stone: '#c7c2b8', trim: '#8e98a0', teal: '#8fb3b1', rust: '#cf9c88', mustard: '#dcc48e', lav: '#b3abd0',
  spawn: '#eae6de', wood: '#c9a27c', planter: '#b9ad9a', white: '#f3f1ec',
};

export function B(x0, x1, y0, y1, z0, z1, o = {}) {
  return { kind: 'box', min: [x0, y0, z0], max: [x1, y1, z1], ...o };
}
export function R(low, high, width, o = {}) {
  return { kind: 'ramp', low, high, width, thickness: o.thickness ?? 0.6, ...o };
}
// box turned about the vertical axis by `deg` degrees: centre (cx, cz), w along its local x, d along its local z
export function O(cx, cz, w, d, y0, y1, deg, o = {}) {
  return { kind: 'obox', center: [cx, (y0 + y1) / 2, cz], size: [w, y1 - y0, d], rotY: deg, ...o };
}
// Regular octagon platform (circumradius R): a plus of three boxes + four 45° corner slabs 10 cm lower. The corner
// slabs tuck under the arms (that part is buried: no z-fighting, and paint under it is dead), leaving a shallow lip.
export function OCT(cx, cz, R, y0, y1, o0 = {}) {
  const A = R * Math.cos(Math.PI / 8), hs = R * Math.sin(Math.PI / 8); // apothem, half side
  const o = { ...o0, oct: [cx, cz, R] };                                // lets the stage thumbnail draw one octagon
  const out = [
    B(cx - A, cx + A, y0, y1, cz - hs, cz + hs, o),
    B(cx - hs, cx + hs, y0, y1, cz + hs, cz + A, o),
    B(cx - hs, cx + hs, y0, y1, cz - A, cz - hs, o),
  ];
  // corner slabs reach past the arm corners by a margin small enough that neighbouring slabs never meet (≤ 0.158·R)
  const depth = A - hs * Math.SQRT2 + Math.min(0.3, 0.12 * R), k = (A - depth / 2) / Math.SQRT2;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) out.push(O(cx + sx * k, cz + sz * k, 2 * hs, depth, y0, y1 - 0.1, sx * sz > 0 ? 45 : -45, o));
  return out;
}
// Curved wall: n straight segments following a circle (centre cx,cz; r = wall centre line) from a0° to a1°
// (0° = +x, 90° = +z). Segments meet at their inner corners, so they never overlap.
export function ARC(cx, cz, r, t, y0, y1, a0, a1, n, o = {}) {
  const out = [], da = (a1 - a0) / n, len = 2 * (r - t / 2) * Math.tan((Math.abs(da) * Math.PI) / 360);
  for (let i = 0; i < n; i++) {
    const a = ((a0 + da * (i + 0.5)) * Math.PI) / 180;
    out.push(O(cx + r * Math.cos(a), cz + r * Math.sin(a), t, len, y0, y1, (-a * 180) / Math.PI, o));
  }
  return out;
}
// ramp onto an octagon's diagonal face: q = quadrant sign (±1, ±1), run = horizontal length
export function OCTRAMP(cx, cz, R, yLow, yTop, sx, sz, run, width, o = {}) {
  const A = R * Math.cos(Math.PI / 8), ux = sx / Math.SQRT2, uz = sz / Math.SQRT2;
  const hx = cx + ux * A, hz = cz + uz * A;
  return R_(hx + ux * run, yLow, hz + uz * run, hx, yTop - 0.1, hz, width, o);
}
export function R_(lx, ly, lz, hx, hy, hz, width, o) { return R([lx, ly, lz], [hx, hy, hz], width, o); }
