// Kelpline Terminal — stage layout (src/world/stages/kelpline/). The stage owns every file in this folder:
//   layout.js    level geometry (this file)        props.js    prop pack + placements (set dressing)
//   surfaces.js  stage surface materials (texlib)  murals.js   stage decals / signage (mural atlas)
import { PATTERN, B, R, O } from '../../mapkit.js';
import { SURF } from './surfaces.js';

// Kelpline Terminal — Berth 4 of a working container terminal at shift change. A finger pier runs diagonally out into
// the harbour (the whole berth is laid out in a local frame below, then turned ROT degrees about the origin): a laden
// box ship lies alongside each flank with its bow pointing at mid, and the ship-to-shore crane K7 stands idle between
// the two berths, boom raised, straddling the pier on rails set into both quay aprons.
//   • spawn: the roof deck of the Terminal Operations building (2.6 m), control tower behind; steel stair straight
//     down into the truck lane, open drops to the truck gate (left) and the reefer yard (right)
//   • outline: the pier head at each base is notched on the gate side (a water slot where the outer gate lane ends)
//     and carries a stepped side wing on the reefer side (the empties / reefer depot, out where no ship lies); at mid the
//     quay bulges out on both flanks around the crane's legs, with 45° chamfered shoulders — an S-shaped, skewed band
//   • centre "Truck lane": 12 m of tarmac between the stack blocks — long sightlines, a trailer + a reach stacker for
//     cover, into the Landing under the crane
//   • left block "4A": four packed rows of 40' / 20' boxes = a 2.6 m plateau with 2-high boxes as cover on top and a
//     2-high wall along the apron; stairs up from the base aisle (lane side) and from the mid end (inside the block)
//   • right block "Reefer rack": reefer rows either side of a steel plug-in rack whose grate catwalk (2.6 m) runs
//     over a covered alley (squids drop through, ink + shots pass the grate); stairs at the base + mid ends
//   • aprons (both flanks): the quay along the ships — long lanes down the crane rail, hatch covers, lashing cages, a
//     straddle carrier, bollards; the crane's bogies are low cover where the aprons open into the mid bulge
//   • mid "The Landing": a round crane working zone painted on the quay; hatch covers lifted off a ship set down askew
//     under the crane's portal (1.2 / 2.4 m) — they sit square to the harbour, i.e. at an angle to the pier
// Heights: 0 yard · 1.2 hatch covers / cages · 2.4 landing top · 2.6 stacks + spawn · 5.2 second tier (squid-only).
const K = {
  tarmac: '#6f7378', tarmacLane: '#76797c', quay: '#c9c4b8', base: '#bdb8ad', wall: '#d9d4c8', ops: '#dfe3e6', spawn: '#e9e6df',
  steel: '#56687d', hatch: '#4f6d8c', hatchTop: '#58779a', stair: '#8a96a0', kerb: '#cfc9bc', opsDk: '#3b556f',
  // container liveries (muted: team ink stays the loudest thing on screen)
  rust: '#a8583f', blue: '#3d5f8c', teal: '#3f8580', mustard: '#c99a3c', grey: '#858c93', green: '#56794f',
  navy: '#34435f', white: '#e4e2da', cream: '#d9cdb3', maroon: '#7d3f45', orange: '#c47440',
};

// ---- the berth's turn: everything below is authored in the local frame (x across the pier, z along it) and turned
// ROT degrees about the origin (boxes → turned boxes, ramp end points, prop placements' pos + rotY in props.js)
export const ROT = 35;
const RA = (ROT * Math.PI) / 180, RC = Math.cos(RA), RS = Math.sin(RA);
export const ROT_RAD = RA;
export const toWorld = (x, z) => [x * RC + z * RS, -x * RS + z * RC];
// face normals (murals, noPaint) are matched against WORLD face normals by the level: turn them with the berth too
const turnN = (n) => [+(n[0] * RC + n[2] * RS).toFixed(4), n[1], +(-n[0] * RS + n[2] * RC).toFixed(4)];
const turnFaces = (o) => ({ ...o, ...(o.mural ? { mural: o.mural.map((m) => ({ ...m, n: turnN(m.n) })) } : {}), ...(o.noPaint ? { noPaint: o.noPaint.map(turnN) } : {}) });
function turn(p) {
  if (p.keep) { const { keep, ...q } = p; return q; }   // square to the harbour (not turned with the berth)
  if (p.kind === 'box') {
    const { min, max, kind, ...o } = p;
    const [cx, cz] = toWorld((min[0] + max[0]) / 2, (min[2] + max[2]) / 2);
    return O(cx, cz, max[0] - min[0], max[2] - min[2], min[1], max[1], ROT, turnFaces(o));
  }
  if (p.kind === 'obox') { const [cx, cz] = toWorld(p.center[0], p.center[2]); return { ...turnFaces(p), center: [cx, p.center[1], cz], rotY: p.rotY + ROT }; }
  const [lx, lz] = toWorld(p.low[0], p.low[2]), [hx, hz] = toWorld(p.high[0], p.high[2]);
  return { ...turnFaces(p), low: [lx, p.low[1], lz], high: [hx, p.high[1], hz] };
}

// Container sides that look into a slot narrower than SLOT (boxes stowed 10 cm apart, a box against the back wall or its
// neighbour's end) are never seen — nobody gets in there — but ink splash still reaches them: turf nobody can see.
// Every such side of a stack box is made non-inkable (noPaint, local normal; turn() rotates it into the world).
const SLOT = 0.45;
function slotSides(pieces) {
  const mir = (d) => ({ ...d, min: [-d.max[0], d.min[1], -d.max[2]], max: [-d.min[0], d.max[1], -d.min[2]] });
  const solid = (d) => d.kind === 'box' && !d.keep && !d.rail && !d.grate;
  const all = [...pieces.single.filter(solid), ...pieces.half.filter(solid), ...pieces.half.filter(solid).map(mir)];
  const sides = [[0, 1], [0, -1], [2, 1], [2, -1]];   // [axis, sign]
  const cover = (p, ax, sg) => {
    const face = sg > 0 ? p.max[ax] : p.min[ax], ox = ax === 0 ? 2 : 0;   // the face's in-plane horizontal axis
    const n = 12, m = 6;
    let hit = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const u = p.min[ox] + ((i + 0.5) / n) * (p.max[ox] - p.min[ox]), y = p.min[1] + ((j + 0.5) / m) * (p.max[1] - p.min[1]);
      if (all.some((q) => q !== p && u > q.min[ox] && u < q.max[ox] && y > q.min[1] && y < q.max[1] &&
        (sg > 0 ? q.min[ax] >= face - 0.01 && q.min[ax] < face + SLOT : q.max[ax] <= face + 0.01 && q.max[ax] > face - SLOT))) hit++;
    }
    return hit / (n * m);
  };
  for (const p of pieces.half) {
    if (p.kind !== 'box' || !/^box/.test(p.tag || '')) continue;
    const np = sides.filter(([ax, sg]) => cover(p, ax, sg) >= 0.9).map(([ax, sg]) => (ax === 0 ? [sg, 0, 0] : [0, 0, sg]));
    if (np.length) p.noPaint = [...(p.noPaint || []), ...np];
  }
}

// ISO box: 2.44 wide, 2.6 high (high cube ≈ 2.9, we use 2.6 so tiers stay jump-sized), 6.06 / 12.19 long
const CW = 2.44, CH = 2.6, LEN = { 20: 6.06, 40: 12.19 };
// a container along z: x0 = its −X side, z0 = its −Z end, tier 0 = on the ground. o.door: 1 = doors at the +Z end
// (0 = −Z), o.logo: 1–3 = 40' line logo (murals 9/10 on both long sides), o.reefer: machinery end.
// The tag carries the dressing spec for props.js (container castings, doors, reefer units).
const LOGO_ID = { 1: 9, 2: 10, 3: 9 };   // 1 KRAKEN, 2 TIDEBANK, 3 KRAKEN (40')
const LOGO = (o, n) => (LOGO_ID[o.logo] ? [{ n: n[0], id: LOGO_ID[o.logo] }, { n: n[1], id: LOGO_ID[o.logo] }] : undefined);
const NOCLIMB = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
function box(x0, z0, len, tier, color, o = {}) {
  return B(x0, x0 + CW, tier * CH, (tier + 1) * CH, z0, z0 + LEN[len], { color, pattern: PATTERN.container, tag: `box:${len}:${o.door ?? 1}:${o.reefer ? 1 : 0}`, mural: LOGO(o, [[1, 0, 0], [-1, 0, 0]]), ...(o.roof ? { roof: true, noPaint: NOCLIMB } : {}) });
}
function boxX(x0, z0, len, tier, color, o = {}) {   // along x (o.door: 1 = doors at the +X end; o.noPaint: dressed faces)
  return B(x0, x0 + LEN[len], tier * CH, (tier + 1) * CH, z0, z0 + CW, { color, pattern: PATTERN.container, tag: `boxx:${len}:${o.door ?? 1}:${o.reefer ? 1 : 0}`, mural: LOGO(o, [[0, 0, 1], [0, 0, -1]]), ...(o.noPaint ? { noPaint: o.noPaint } : {}) });
}
// steel stair (ramp with the treads surface) + its two handrails as rail colliders (collision-only: kids can't step off
// the side, shots / ink / squids pass; the handrails you see are drawn by props.js kelpline_stair)
const HR = 0.95;
function stairZ(x, zLow, zHigh, y0, y1, w, o = {}) {
  const out = [R([x, y0, zLow], [x, y1, zHigh], w, { tag: 'stair', color: K.stair, pattern: PATTERN.treads, ...o })];
  const run = zHigh - zLow, rise = y1 - y0;
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    const za = zLow + (run * k) / 3, zb = zLow + (run * (k + 1)) / 3, top = y0 + (rise * (k + 1)) / 3 + HR + 0.05;
    const xr = x + sx * (w / 2 - 0.05);
    out.push(B(xr - 0.06, xr + 0.06, 0, top, Math.min(za, zb), Math.max(za, zb), { tag: 'stair-rail', rail: true, paint: false, color: K.stair }));
  }
  return out;
}

// ---- grid (local frame)
export const GRID = {
  lane: 6.0,                                   // truck lane x −6 … 6
  zs: -31.6,                                   // stacks start (base side)
  ze: -7.0,                                    // stacks / lane slab end (the Landing slab spans z −7 … 7)
  apron: 16.16,                                // apron (quay) from |x| = 16.16 to the edge at 24
  notch: [20.6, -41],                          // gate-side water slot at the pier head: x 20.6 … 24, z −47.4 … −41
  A: [6.0, 8.54, 11.08, 13.62],                // block 4A rows (x0), +X for Alpha
  RF: { row0: -8.44, alley: [-10.44, -8.44], row1: -12.88, row2: -15.42 },   // reefer rack rows (x0), −X for Alpha
};
const G = GRID, A = G.A, RF = G.RF;
const quay = (o = {}) => ({ color: K.quay, pattern: SURF.quay, ...o });
// the pier's outer walls down to the water: nobody can reach them and the quay-edge steel + fenders dress their top →
// not inkable (sea: the local normals of the sides that face the harbour)
const sea = (...n) => ({ noPaint: n });
const X_ = [1, 0, 0], _X = [-1, 0, 0], Z_ = [0, 0, 1], _Z = [0, 0, -1];

// Local-frame pieces (exported for props.js: the container / stair dressing is generated from them)
export const LOCAL = {
  single: [
    // ---- mid "The Landing": the round crane working zone (painted, mural 11) and the hatch covers set down askew
    B(-G.apron, G.apron, -1.2, 0, -7, 7, quay({ tag: 'landing', color: '#c3beb2', mural: [{ n: [0, 1, 0], id: 11 }] })),
    B(-5.4, 5.4, 0, 1.2, -3.0, 3.0, { tag: 'hatch-lower', color: K.hatch, pattern: PATTERN.nonslip, keep: true }),
    B(-2.2, 2.2, 1.2, 2.4, -1.6, 1.6, { tag: 'hatch-upper', color: K.hatchTop, pattern: SURF.chequer, keep: true }),
  ],
  half: [
    // ================= ground slabs (each carries its own painted markings — murals.js)
    B(-G.apron, G.apron, -1.2, 0, -47.4, G.zs, { tag: 'base-apron', color: K.base, pattern: SURF.quay, mural: [{ n: [0, 1, 0], id: 7 }] }),
    B(-G.lane, G.lane, -1.2, 0, G.zs, G.ze, { tag: 'lane', color: K.tarmacLane, pattern: SURF.tarmac, mural: [{ n: [0, 1, 0], id: 5 }] }),
    B(G.lane, G.apron, -1.2, 0, G.zs, G.ze, { tag: 'block-4a', color: K.tarmac, pattern: SURF.tarmac, mural: [{ n: [0, 1, 0], id: 4 }] }),
    B(-G.apron, -G.lane, -1.2, 0, G.zs, G.ze, { tag: 'block-reefer', color: K.tarmac, pattern: SURF.tarmac, mural: [{ n: [0, 1, 0], id: 8 }] }),
    B(G.apron, 24, -1.2, 0, G.notch[1], 0, quay({ tag: 'apron', mural: [{ n: [0, 1, 0], id: 6 }], ...sea(X_, _Z) })),
    B(-24, -G.apron, -1.2, 0, G.notch[1], 0, quay({ tag: 'apron', mural: [{ n: [0, 1, 0], id: 6 }], ...sea(_X) })),
    // pier-head corners: gate side stops at the water slot (x ≤ 20.6), reefer side runs out into the side wing
    B(G.apron, G.notch[0], -1.2, 0, -47.4, G.notch[1], quay({ tag: 'gate-corner', color: K.base, ...sea(X_, _Z) })),
    B(-24, -G.apron, -1.2, 0, -47.4, G.notch[1], quay({ tag: 'reefer-corner', color: K.base, ...sea(_X, _Z) })),
    // reefer-side wing (stepped): the empties / reefer depot out on the free flank (no ship lies here)
    B(-29.5, -24, -1.2, 0, -46.4, -22, quay({ tag: 'wing', ...sea(_X, Z_, _Z) })),
    B(-32, -29.5, -1.2, 0, -42, -27, quay({ tag: 'wing', ...sea(_X, Z_, _Z) })),
    // mid bulge on the flanks around the crane's legs (the ships' bows point at it), 45° shoulders 10 cm lower (lip)
    B(24, 30, -1.2, 0, -8, 8, quay({ tag: 'bulge', ...sea(X_, Z_, _Z) })),
    O(25.5, -9.5, 8.485, 4.243, -1.2, -0.1, -45, quay({ tag: 'bulge-shoulder', ...sea([0.7071, 0, -0.7071], [0.7071, 0, 0.7071], [-0.7071, 0, -0.7071]) })),
    O(25.5, 9.5, 8.485, 4.243, -1.2, -0.1, 45, quay({ tag: 'bulge-shoulder', ...sea([0.7071, 0, 0.7071], [0.7071, 0, -0.7071], [-0.7071, 0, 0.7071]) })),
    // perimeter wall behind the base (the terminal fence line; the ops building + tower stand behind it)
    B(-24, 24, 0, 4.8, -48, -47.4, { tag: 'backwall', color: K.wall, pattern: PATTERN.concrete, roof: true }),

    // ================= Terminal Operations building: spawn on its roof deck
    // (its ground-floor facade — ribbon windows, doors, fascia, plant — and the deck's 20 cm edge band under its trim are
    //  dressing that would hide ink: not inkable, like the other stages' glazed facades)
    B(-9, 9, 0, 2.4, -47.4, -39.4, { tag: 'ops-body', color: K.ops, pattern: PATTERN.metalpanel, noPaint: [X_, _X, Z_] }),
    B(-9, 9, 2.4, 2.6, -47.4, -39.4, { tag: 'spawn-deck', color: K.spawn, pattern: PATTERN.spawn, noPaint: [X_, _X, Z_] }),
    B(-9, -3.4, 2.6, 3.4, -40.0, -39.4, { tag: 'parapet', color: K.ops, pattern: PATTERN.metalpanel }),
    B(3.4, 9, 2.6, 3.4, -40.0, -39.4, { tag: 'parapet', color: K.ops, pattern: PATTERN.metalpanel }),
    ...stairZ(0, -32.8, -39.4, 0, 2.6, 6.8, { tag: 'ops-stair' }),

    // ================= truck gate (left corner of the base): two booth islands between the lanes (the outer one's
    // far side is the quay edge of the water slot)
    B(12.4, 14.4, 0, 0.18, -45.6, -39.2, { tag: 'gate-island', color: K.kerb, pattern: PATTERN.concrete }),
    B(18.6, 20.6, 0, 0.18, -45.6, -39.2, { tag: 'gate-island', color: K.kerb, pattern: PATTERN.concrete }),

    // ================= reefer yard (right corner of the base): reefers against the back wall; the depot on the wing
    boxX(-23.6, -47.3, 20, 0, K.white, { door: 0, reefer: 1 }),
    boxX(-17.44, -47.3, 20, 0, K.white, { door: 0, reefer: 1, noPaint: [[0, 0, 1]] }),   // (its front is the REEFER TECH cabin: door, windows, AC)
    boxX(-23.6, -47.3, 20, 1, K.cream, { door: 0, reefer: 1 }),
    box(-28.9, -45.8, 20, 0, K.white, { door: 1, reefer: 1 }), box(-28.9, -45.8, 20, 1, K.cream, { door: 1, reefer: 1 }),
    box(-28.9, -39.6, 20, 0, K.white, { door: 1, reefer: 1 }),

    // ================= Block 4A (+X): 2.6 m plateau
    // row 0 (lane side): stair up from the base aisle, then a 40' and a 20'
    ...stairZ(A[0] + CW / 2, G.zs, -25.3, 0, 2.6, 2.3),
    box(A[0], -25.3, 40, 0, K.rust, { logo: 1 }), box(A[0], -13.01, 20, 0, K.mustard),
    // row 1: 40' (+ a 20' on top near the base end), 20', then the stair up from the mid end
    box(A[1], G.zs, 40, 0, K.blue), box(A[1], G.zs, 20, 1, K.maroon, { door: 0 }), box(A[1], -19.31, 20, 0, K.navy, { door: 0 }),
    ...stairZ(A[1] + CW / 2, -6.95, -13.25, 0, 2.6, 2.3),
    // row 2: 40', 20', 20' (2-high at the mid end)
    box(A[2], G.zs, 40, 0, K.teal, { logo: 3 }), box(A[2], -19.31, 20, 0, K.green), box(A[2], -13.15, 20, 0, K.grey), box(A[2], -13.15, 20, 1, K.blue, { door: 0 }),
    // row 3 (apron side): 2-high wall along the apron, 1-high 20' at the mid end
    box(A[3], G.zs, 40, 0, K.grey, { door: 0 }), box(A[3], G.zs, 40, 1, K.green, { logo: 2, door: 0 }), box(A[3], G.zs, 20, 2, K.mustard, { door: 0, roof: true }),
    box(A[3], -19.31, 20, 0, K.orange), box(A[3], -19.31, 20, 1, K.navy), box(A[3], -13.15, 20, 0, K.rust),

    // ================= Reefer rack (−X): reefers either side of the plug-in rack; grate catwalk over the alley
    ...stairZ(RF.row0 + CW / 2, G.zs, -25.3, 0, 2.6, 2.3),
    box(RF.row0, -25.3, 40, 0, K.white, { reefer: 1 }), box(RF.row0, -13.01, 20, 0, K.white, { reefer: 1, door: 0 }),
    B(RF.alley[0], RF.alley[1], 2.45, 2.6, -25.3, -6.95, { tag: 'reefer-catwalk', color: K.steel, pattern: PATTERN.grate, grate: true }),
    box(RF.row1, G.zs, 20, 0, K.white, { reefer: 1, door: 0 }), box(RF.row1, -25.44, 40, 0, K.cream, { reefer: 1 }),
    ...stairZ(RF.row1 + CW / 2, -6.95, -13.25, 0, 2.6, 2.3),
    box(RF.row2, G.zs, 20, 0, K.white, { reefer: 1, door: 0 }), box(RF.row2, G.zs, 20, 1, K.white, { reefer: 1, door: 0 }), box(RF.row2, -25.44, 40, 0, K.white, { reefer: 1 }),
    box(RF.row2, -13.15, 20, 0, K.white, { reefer: 1 }), box(RF.row2, -13.15, 20, 1, K.cream, { reefer: 1 }),

    // ================= truck lane cover: a 20' on a skeletal chassis behind its tractor (box deck at 1.35: squids slip
    // under the chassis, its top at 3.95 is squid-only), a box the reach stacker just set down
    B(1.6, 1.6 + CW, 1.35, 1.35 + CH, -28.6, -28.6 + LEN[20], { color: K.maroon, pattern: PATTERN.container, tag: 'trailer' }),
    box(2.6, -15.2, 20, 0, K.orange),
    // a 20' just landed by the crane beside the hatch covers (its twin flanks the other side of mid)
    boxX(10.0, -3.4, 20, 0, K.blue, { door: 0 }),

    // ================= apron cover: a hatch cover set down behind the crane (left), the straddle carrier's box (right)
    B(17.2, 20.0, 0, 1.2, -27, -20, { tag: 'apron-hatch', color: K.hatch, pattern: SURF.chequer }),
    box(-21.42, -29.0, 20, 0, K.teal, { door: 1 }),
  ],
};

// ---- world layout
slotSides(LOCAL);
const single = LOCAL.single.map(turn), half = LOCAL.half.map(turn);
// bounds: the AABB of every turned piece (and its 180° twin), 1 m margin
const bounds = (() => {
  let mx = 0, mz = 0;
  const pt = (x, z) => { mx = Math.max(mx, Math.abs(x)); mz = Math.max(mz, Math.abs(z)); };
  for (const p of [...LOCAL.single, ...LOCAL.half]) {
    if (p.kind === 'ramp') { for (const e of [p.low, p.high]) pt(...toWorld(e[0], e[2])); continue; }
    if (p.kind === 'box') { for (const x of [p.min[0], p.max[0]]) for (const z of [p.min[2], p.max[2]]) pt(...(p.keep ? [x, z] : toWorld(x, z))); continue; }
    const a = ((p.rotY + ROT) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), [cx, cz] = toWorld(p.center[0], p.center[2]);
    for (const i of [-1, 1]) for (const k of [-1, 1]) pt(cx + (c * i * p.size[0]) / 2 + (s * k * p.size[2]) / 2, cz - (s * i * p.size[0]) / 2 + (c * k * p.size[2]) / 2);
  }
  const X = Math.ceil(mx + 1), Z = Math.ceil(mz + 1);
  return { minX: -X, maxX: X, minZ: -Z, maxZ: Z };
})();
const W = (x, y, z) => { const [a, b] = toWorld(x, z); return [+a.toFixed(3), y, +b.toFixed(3)]; };
const pad = W(0, 2.6, -43.6);

const KELPLINE = {
  id: 'kelpline',
  envBoats: false,   // no generic moored boats: the flanks are the moored ships
  bounds,
  spawnPads: [pad, [-pad[0], pad[1], -pad[2]]],
  spawnBarrier: 4.2,
  // fly in low over the TIDEBANK's bow and the mid bulge, across Block 4A, down onto the ops roof
  intro: { from: W(40, 22, -8), lookFrom: W(0, 4, -12), toBack: 3.0 },
  art: { from: W(46, 26, -46), look: W(-4, 4, 4), fov: 55 },   // over the gate-side shoulder: K7's portal, the Landing, CORAL MAXIMA's bow
  single,
  half,
  decor: {
    lamps: [],
    palms: [],
    flags: [W(-7.6, 2.6, -46.7), W(7.6, 2.6, -46.7)],
  },
};

export const LAYOUT = KELPLINE;
