// Lockgate Canals — stage layout (src/world/stages/lockgate/). The stage owns every file in this folder:
//   layout.js    level geometry (this file)        props.js    prop pack + placements (set dressing)
//   surfaces.js  stage surface materials (texlib)  murals.js   stage decals / signage (mural atlas)
import { PATTERN, B, R, O } from '../../mapkit.js';
import { SURF } from './surfaces.js';

// Lockgate Canals — a flight of broad locks climbing out of the harbour through an old brick warehouse district. The
// CHOKEPOINT map, and a zig-zag one: the canal crosses the arena as a Z — lock W along x (z ≈ -12), a DIAGONAL pound
// through the middle (45°, under the humpback bridge), lock E along x (z ≈ +12) — so the frontline zig-zags and each
// team's territory is a stepped, angled band (Alpha: the south + the east flank up to lock E; Bravo: the mirror).
//   • water, honestly: the pound + its angled lock-tail basins are sea level (real, lethal, marina water). The locks
//     are DRAINED for a winter stoppage: chamber floors at -1.9 (below the sea, dry and safe; their blocks mask the
//     sea), leaks spraying through the upper gates. Above the upper gates the canal (visual water, 1.3 m higher) runs
//     off under ANCHOR MILLS behind iron railings.
//   • crossings: the humpback bridge over the diagonal pound (crest 3.3 m; the towpaths pass under it), the lower +
//     upper gate walkways of each lock (1.3 m, balance beams as waist-high cover) and the drained chambers (one broad
//     maintenance stair down each, split into three flights by handrails). Squids: the breasted narrowboats against your own towpath leave a
//     ~5.2 m jump to the enemy bank; ink-climb the chamber walls, lock sides, loading bank, office.
//   • each half: spawn on the loading stage of LOCKGATE WHARF (2.4; grand stair, west stair, east cart ramp) in a
//     back yard with a notched SW corner; lanes bend round the buildings — the west street past the lock-keeper's
//     cottage and up the horse ramp to lock W; the bridge street between the company office (roof terrace 2.6) and
//     the stables, turning 45° onto the bridge; the east lane along the transit shed's loading bank (1.3) onto the
//     lock-E wharf platform (1.3). The diagonal towpath (a raised stone quay, +0.15) runs from basin to basin.
//   • outline: the zig-zag frontline, 45° quays, a chamfered + notched SW corner, a stepped SE corner (both halves by
//     rotation) — framed by out-of-play architecture (mills, terraces, ANCHOR WAREHOUSE).
//   • off-limits (roof: true): building tops, wall tops, parapet tops, the mills. Railings are rail colliders (props).
const LG = {
  setts: '#a9a39a', lockside: '#6a6b74', brick: '#a4563f', stone: '#d8d0c0', quay: '#bcb4a6',
  timber: '#4a3a30', leads: '#7a7d82', spawn: '#eae6de', render: '#ece4d4', hull: '#2d3440',
};
const brick = (o = {}) => ({ color: LG.brick, pattern: SURF.engbrick, ...o });
const wall = (o = {}) => brick({ roof: true, ...o });

// ---- the diagonal frame: s along u = (c, c) (south-west → north-east), t along v = (-c, c) (toward Bravo's bank)
const c = Math.SQRT1_2;
const W = (s, t) => [c * (s - t), c * (s + t)];                          // frame → world (x, z)
// box in the frame: s0…s1 along u, t0…t1 along v → turned piece (local x along u)
const D = (s0, s1, t0, t1, y0, y1, o) => { const [x, z] = W((s0 + s1) / 2, (t0 + t1) / 2); return O(x, z, s1 - s0, t1 - t0, y0, y1, -45, o); };
// ramp in the frame: low / high points given as [s, y, t]
const DR = (lo, hi, width, o) => { const [lx, lz] = W(lo[0], lo[2]), [hx, hz] = W(hi[0], hi[2]); return R([lx, lo[1], lz], [hx, hi[1], hz], width, o); };
const nU = [c, 0, c], nV = [-c, 0, c];                                   // frame normals (for murals / noPaint)
const neg = (n) => n.map((k) => -k);

// canal geometry (Alpha's side): pound half-width 4.77 (edges z = x ± 6.75), towpath 4 m, lock E chamber x 16.5…24.5
const HW = 4.77, TOW = 4;
const yard = (x0, x1, z0, z1) => B(x0, x1, -0.6, 0, z0, z1, { tag: 'yard', color: LG.setts, pattern: SURF.setts });
// setts columns under the diagonal towpath: each column's north-west corner stays 0.25 m inside the water edge (z =
// x - 6.75) and the towpath quay (0.15 higher) covers the stepped edge
const cols = [];
for (const [x0, x1] of [[-8, -4], [-4, 0], [0, 4], [4, 8], [8, 14]]) cols.push(yard(x0, x1, -36, x0 - 7));

const LOCKGATE = {
  id: 'lockgate',
  water: 'marina',
  bounds: { minX: -28, maxX: 28, minZ: -46, maxZ: 46 },
  spawnPads: [[4, 2.4, -41.9], [-4, 2.4, 41.9]],
  spawnBarrier: 4.2,
  // match intro: high over the humpback bridge looking down the diagonal pound, then back down to the loading stage
  intro: { from: [-9, 12, 9], lookFrom: [2, 3, -2], toBack: 3.0 },
  // stage-select picture: from over lock W's south side, across the humpback bridge + moored boats to ANCHOR MILLS
  art: { from: [-24, 14, -12], look: [8, 0, 4], fov: 66 },
  single: [],
  half: [
    // ================= canal: towpath quay, lock E (both sides; lock W is its twin), basins, drained chamber, boats
    D(-16.4, 17.85, -HW - TOW, -HW, -3, 0.15, { tag: 'towpath', color: LG.lockside, pattern: PATTERN.brick }),
    B(15.5, 28, -3, 1.3, -2, 9.25, { tag: 'wharf-e', color: LG.lockside, pattern: PATTERN.brick }),
    B(13, 15.5, -3, 1.3, -2, 6.25, { tag: 'wharf-e', color: LG.lockside, pattern: PATTERN.brick }),
    // stepped masonry filling the towpath's dead end under the lower gate's balance beam (no pocket to get stuck in)
    B(14, 15.5, -3, 1.3, 6.25, 7.25, { tag: 'wharf-e', color: LG.lockside, pattern: PATTERN.brick }),
    // (runs on flush with the wharf's edge at the lower gate: a 0.5 m notch of water was left at its corner, and the route
    // onto the wharf cut straight across it)
    B(15, 15.5, -3, 1.3, 7.25, 9.25, { tag: 'wharf-e', color: LG.lockside, pattern: PATTERN.brick }),
    B(15.5, 28, -3, 1.3, 14.75, 21, { tag: 'lockside-n', color: LG.lockside, pattern: PATTERN.brick }),
    B(8, 15.5, -3, 0, 14.75, 21, { tag: 'basin-quay', color: LG.setts, pattern: SURF.setts }),
    B(16.5, 24.5, -3, -1.9, 9.25, 14.75, { tag: 'chamber-floor', color: LG.setts, pattern: PATTERN.concrete }),
    D(3.6, 11.4, -4.72, -2.62, -2.6, -0.7, { tag: 'boat-a-hull', color: LG.hull, pattern: PATTERN.hullpaint }),
    D(3.3, 11.1, -2.57, -0.47, -2.6, -0.7, { tag: 'boat-b-hull', color: LG.hull, pattern: PATTERN.hullpaint }),
    D(4.6, 10.4, -4.62, -2.72, -0.7, 0.25, { tag: 'boat-a-hold', color: '#2c3a31', pattern: PATTERN.rubber }),
    D(4.3, 10.1, -2.47, -0.57, -0.7, 0.25, { tag: 'boat-b-cabin', color: '#2f4a3c', pattern: PATTERN.hullpaint, mural: [{ n: nV, id: 4 }] }),
    // gate walkways (lower gates x 16.5, upper gates x 24.5); one broad maintenance stair fills the drained chamber from the
    // lower gate up to the upper gates (two scaffold handrails split it into three flights). Solid: a narrow pit or the
    // wedge under a free-spanning flight is somewhere bots get pinned.
    B(15.9, 17.1, 1.05, 1.3, 9.25, 14.75, { tag: 'gate-walk-lower', color: LG.timber, pattern: PATTERN.planks }),
    B(23.9, 25.1, 1.05, 1.3, 9.25, 14.75, { tag: 'gate-walk-upper', color: LG.timber, pattern: PATTERN.planks }),
    R([16.65, -1.9, 12], [23.9, 1.3, 12], 5.5, { tag: 'chamber-stair', color: '#6d7780', pattern: PATTERN.treads }),
    // steps: basin quay → lock side N (Bravo), east yard → wharf platform (Alpha)
    R([12, 0, 17.6], [15.5, 1.3, 17.6], 2.4, { tag: 'lock-steps', color: LG.stone, pattern: PATTERN.stonestep }),

    // ================= humpback bridge (turned 45°: its axis runs along v, Alpha's approach from the south-east)
    D(-2.2, 2.2, -8.4, -7, 0, 3.0, { tag: 'bridge-abutment', color: LG.setts, pattern: SURF.setts, noPaint: [nV] }),
    DR([0, 0, -15.2], [0, 3.0, -8.4], 4.4, { tag: 'bridge-ramp', color: LG.setts, pattern: SURF.hoofsteps }),
    DR([0, 3.0, -7], [0, 3.3, 0], 4.4, { tag: 'bridge-crest', thin: true, thickness: 0.5, color: LG.setts, pattern: SURF.setts }),
    // parapets: the outer brick walls are inkable (swim up them from the street onto the bridge) and reach the ground
    // along the approaches; the tops are walkable, never-inked perches (+8 cm: feet in the stone coping, the level top
    // hidden inside it) that routes never run along — nobody slides off them any more
    DR([2.4, 0.93, -15.2], [2.4, 3.93, -8.4], 0.4, brick({ tag: 'bridge-parapet', thickness: 4.1, perch: true, noNav: true })),
    DR([-2.4, 0.93, -15.2], [-2.4, 3.93, -8.4], 0.4, brick({ tag: 'bridge-parapet', thickness: 4.1, perch: true, noNav: true })),
    D(2.2, 2.6, -8.4, -7, 0, 3.93, brick({ tag: 'bridge-parapet', perch: true, noNav: true, noPaint: [nV] })),
    D(-2.6, -2.2, -8.4, -7, 0, 3.93, brick({ tag: 'bridge-parapet', perch: true, noNav: true, noPaint: [nV] })),
    DR([2.4, 3.93, -7], [2.4, 4.23, 0], 0.4, brick({ tag: 'bridge-parapet', thin: true, thickness: 1.2, perch: true, noNav: true })),
    DR([-2.4, 3.93, -7], [-2.4, 4.23, 0], 0.4, brick({ tag: 'bridge-parapet', thin: true, thickness: 1.2, perch: true, noNav: true })),

    // ================= Alpha's ground: back yard (spawn), centre columns under the towpath, west land, east yards
    yard(-12, 22, -45.4, -36),
    ...cols,
    yard(-12, -8, -36, -21),
    yard(-27, -12, -29, -21), yard(-25, -12, -31, -29), yard(-23, -12, -33, -31), yard(-21, -12, -35, -33), yard(-20, -12, -36, -35),
    yard(14, 22, -36, -17),
    // raised flagged apron along the chamfered south-west corner (hides the stepped setts edge)
    D(-39.6, -38.1, -11.3, -1.41, -0.6, 0.15, { tag: 'apron', color: LG.quay, pattern: PATTERN.pavers }),

    // ================= spawn: the loading stage in front of LOCKGATE WHARF (x -5 … 13)
    B(-12, 22, 0, 4.6, -46, -45.4, wall({ tag: 'warehouse-front' })),
    B(-5, 13, 0, 2.2, -45.4, -38.4, brick({ tag: 'spawn-stage' })),
    B(-5, 13, 2.2, 2.4, -45.4, -38.4, { tag: 'spawn', color: LG.spawn, pattern: PATTERN.spawn }),
    B(-5, 0.8, 2.4, 3.15, -39.0, -38.4, wall({ tag: 'stage-parapet' })),
    B(7.2, 13, 2.4, 3.15, -39.0, -38.4, wall({ tag: 'stage-parapet' })),
    R([4, 0, -32.4], [4, 2.4, -38.4], 6, { tag: 'grand-stair', color: LG.stone, pattern: PATTERN.stonestep }),
    R([-11, 0, -43.55], [-5, 2.4, -43.55], 3.7, { tag: 'west-stair', color: LG.stone, pattern: PATTERN.stonestep }),
    R([21, 0, -42.05], [13, 2.4, -42.05], 6.7, { tag: 'cart-ramp', color: LG.setts, pattern: SURF.hoofsteps }),

    // ================= boundary: back-yard side walls, the SW notch + chamfer, the west wall, the SE step
    B(-12.6, -12, 0, 4.6, -45.4, -36, wall({ tag: 'boundary' })),
    B(-20, -12.6, 0, 4.6, -36.6, -36, wall({ tag: 'boundary', mural: [{ n: [0, 0, 1], id: 6 }] })),
    D(-40.2, -39.6, -11.6, -1.1, 0, 4.45, wall({ tag: 'boundary-chamfer' })),
    B(-28, -27, 0, 4.6, -29, -24, wall({ tag: 'boundary' })),
    B(22, 22.6, 0, 4.6, -45.4, -17, wall({ tag: 'boundary', mural: [{ n: [-1, 0, 0], id: 7 }] })),

    // ================= west: lock-keeper's cottage + wash-house outshut, horse ramp up to lock W's south side
    B(-21, -14.5, 0, 5.2, -32, -25.5, { tag: 'cottage', color: LG.render, pattern: PATTERN.render, roof: true }),
    B(-14.5, -12.5, 0, 2.45, -31.5, -27, brick({ tag: 'cottage-outshut' })),
    B(-14.5, -12.5, 2.45, 2.6, -31.5, -27, { tag: 'outshut-roof', color: LG.leads, pattern: PATTERN.asphalt }),
    R([-24.5, 0, -27.5], [-24.5, 1.3, -21], 3, { tag: 'horse-ramp', color: LG.setts, pattern: SURF.hoofsteps }),

    // ================= centre-west: canal company office, roof terrace (2.6) reached by an iron stair
    B(-8, -1.5, 0, 2.45, -26, -18, brick({ tag: 'office' })),
    B(-8, -1.5, 2.45, 2.6, -26, -18, { tag: 'office-roof', color: LG.leads, pattern: PATTERN.asphalt }),
    B(-8, -1.5, 2.6, 3.05, -18.3, -18, wall({ tag: 'office-parapet' })),
    B(-1.8, -1.5, 2.6, 3.05, -26, -18.3, wall({ tag: 'office-parapet' })),
    R([-7, 0, -32], [-7, 2.6, -26], 2, { tag: 'office-stair', color: LG.stone, pattern: PATTERN.stonestep }),

    // ================= centre-east: stables + hay loft (the bridge street bends round it)
    B(5.5, 12.5, 0, 3.6, -27, -19, brick({ tag: 'stables', roof: true })),

    // ================= east: loading bank (1.3) → lock-E wharf platform; transit shed (roof off-limits)
    B(14, 18, 0, 1.3, -17, -2, { tag: 'loading-bank', color: LG.setts, pattern: SURF.setts }),
    B(18, 28, 0, 4.8, -17, -2, brick({ tag: 'shed', roof: true, mural: [{ n: [0, 0, 1], id: 5 }] })),
    R([16, 0, -22], [16, 1.3, -17], 3, { tag: 'bank-steps', color: LG.stone, pattern: PATTERN.stonestep }),

    // ================= ANCHOR MILLS over the upper pound (east; the west mill is its twin): arena face x 27
    B(27, 28, 1.3, 9, -2, 9.25, wall({ tag: 'mill', noPaint: [[-1, 0, 0], [0, 0, -1]] })),
    B(27, 28, 4.2, 9, 9.25, 14.75, wall({ tag: 'mill-arch', noPaint: [[-1, 0, 0], [0, -1, 0]] })),
    B(27, 28, 1.3, 9, 14.75, 21, wall({ tag: 'mill', noPaint: [[-1, 0, 0]] })),
    B(27, 28, 0, 9, 21, 24, wall({ tag: 'mill', noPaint: [[-1, 0, 0], [0, 0, 1]] })),
  ],
  decor: { lamps: [], palms: [], flags: [[-4, 2.4, -44.8], [12, 2.4, -44.8]] },
};

export const LAYOUT = LOCKGATE;
