// Saltpan Basin — stage layout (src/world/stages/saltpan/). The stage owns every file in this folder:
//   layout.js    level geometry (this file)        props.js    prop pack + placements (set dressing)
//   surfaces.js  stage surface materials (texlib)  murals.js   stage decals / signage (mural atlas)
import { PATTERN, B, R, O } from '../../mapkit.js';
import { SURF } from './surfaces.js';

// Saltpan Basin — a working salt works on a sun-baked tidal flat. The OPEN map: low, bright, long sightlines, few tall
// walls, low cover (salt rows and cones, tipper wagons, sluice headstocks, sack stacks). Everything is built from
// crystallising pans: sunken pans (salt crust over pink brine, 0.6 / 0.9 / 1.2 m below the dykes), cracked-mud dykes
// lined with timber revetments, bleached timber boardwalks on posts across the pans (squids slip underneath).
//   • spawn: the loading gallery of the Salt Store (2.4 m) — the barn facade is the back wall; a timber stair straight
//     at the pans, a side ramp to the conveyor yard, open drops to the rail yard
//   • rail yard: a narrow-gauge line with tipper wagons along the front of the store, a spur to the shed dock
//   • right lane (per team, −X for Alpha) "Packing Shed": the timber shed with its corrugated roof across the flank —
//     loading dock (1.1 m) facing mid, stacked sacks as steps up to the roof, a boarded loft stair at the back; the
//     roof (3.2–4.2 m) is the flank's real high ground
//   • centre "The Pans": the shallow back pan (−0.6) with its boardwalk, the sluice dyke (Decauville track, sluices),
//     the front pan (−0.9) crossed by a diagonal boardwalk
//   • left lane "Salt Heap": the long heap (2.4 m ridge, walkable 23° slopes; fresh salt at the mid end, the back half
//     under a tyre-weighted tarp) and the conveyor gantry feeding it: an incline from the yard up to the 3.6 m catwalk and
//     the head platform over the heap's mid end (kids jump up to it from the ridge). The strip under the catwalk is
//     braced off (prop colliders), so nobody — bot or kid — ends up underneath the deck
//   • mid: the Great Pan (−1.2) with the wind pump on its timber staging, boardwalks in from each side
//   • outline: a jagged tidal-flat edge, not a box — a creek cuts in between the office quay and the shed quay (crossed
//     by a diagonal railed causeway), the shed quay juts out past the shed with a 45° cut, the conveyor stage steps out
//     at the base, a sea notch runs beside the heap, the mid dyke ends in a pointed jetty with an inlet beside it, and the
//     pans are staggered (back pan ends 2 m short of the front pan, the Great Pan runs 2 m past both)
// Out-of-play tops (office, store gable, hopper, drive house, vents, lamps, sluices …) are roof colliders in props.js.
const SP = {
  mud: '#cbbb9f', mudDk: '#b9a88b', salt: '#f3ebe8', saltMid: '#f1e3e2', heap: '#e3ded5', tarp: '#5f6a66', timber: '#d6cfc3', timberDk: '#a89c8a',
  store: '#9c6a5b', storeTrim: '#efe9dd', shed: '#b8bdb1', roof: '#9a6b58', office: '#e2cf9f', steel: '#8d969c', spawn: '#d9d2c6',
};
const mud = (o = {}) => ({ color: SP.mud, pattern: SURF.mud, ...o });
const pan = (o = {}) => ({ color: SP.salt, pattern: SURF.salt, ...o });
const wood = (o = {}) => ({ color: SP.timber, pattern: SURF.timber, ...o });

// heights
const P1 = -0.6, P2 = -0.9, P3 = -1.2;
// ramp helper: low point placed so the slab's 0.6 m low-end extension ends exactly on `edge` (roofs, heap slopes)
const rise = (x0, z0, y0, x1, z1, y1) => { const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), a = Math.atan2(y1 - y0, L); return [x0 + (dx / L) * 0.6 * Math.cos(a), y0 + 0.6 * Math.sin(a), z0 + (dz / L) * 0.6 * Math.cos(a)]; };

// 45° chamfer on a convex ground corner (cx, cz): the corner square of size s is left out of the ground boxes and this
// turned slab (9 cm lower, so it tucks under its neighbours) fills the square's inner triangle — the deck edge then runs
// diagonally across the corner. (sx, sz) points from the corner out to sea (±1, ±1).
const chamfer = (cx, cz, s, sx, sz) => O(cx - 0.75 * sx * s, cz - 0.75 * sz * s, s * Math.SQRT2, s / Math.SQRT2, -3, -0.09, (Math.atan2(sz, sx) * 180) / Math.PI, mud({ tag: 'chamfer' }));

const SALTPAN = {
  id: 'saltpan',
  bounds: { minX: -30, maxX: 30, minZ: -46, maxZ: 46 },
  spawnPads: [[-2, 2.4, -42], [2, 2.4, 42]],
  spawnBarrier: 4.2,
  // match intro: opens on the wind pump over the Great Pan, then pulls back along the centre pans to the spawn gallery
  intro: { from: [10, 10.5, 9], lookFrom: [0, 4.5, -3], toBack: 3.0 },
  // stage-select picture: high three-quarter view from off Alpha's conveyor stage — the jagged quays, creeks and pans
  art: { from: [36, 22, -50], look: [-5, -1, 0], fov: 58 },
  single: [
    // ---- the Great Pan (mid) + the wind pump's timber staging in its middle
    B(-13, 13, -3, P3, -8, 8, pan({ tag: 'great-pan', color: SP.saltMid })),
    B(-3.6, 3.6, P3, 0.08, -3.6, 3.6, wood({ tag: 'pump-staging', mural: [{ n: [0, 1, 0], id: 7 }] })),
  ],
  half: [
    // ================= ground: a jagged tidal-flat outline (no longer a box). Timber-revetted quays step in and out:
    //   base   the store yard, the conveyor tail stage stepping out east, the office quay beyond a tidal creek (west)
    //   west   the packing-shed quay juts out to x −30 (a path round the shed's far side), a 45° cut at its mid end
    //   east   the heap wharf with a sea notch beside the heap, the mid dyke ending in a pointed jetty (x 29) with an
    //          inlet north of it (so each side of mid reads: jetty on one flank, inlet on the other)
    //   the creek is crossed by a diagonal timber causeway; 45° chamfers on the convex corners (chamfer() below)
    B(-18, 14, -3, 0, -46, -30, mud({ tag: 'yard' })),
    B(14, 23.5, -3, 0, -41, -30, mud({ tag: 'conveyor-stage' })),
    B(23.5, 26, -3, 0, -38.5, -30, mud({ tag: 'conveyor-stage' })),
    chamfer(26, -41, 2.5, 1, -1),
    B(-26, -18, -3, 0, -46, -38, mud({ tag: 'office-quay' })),
    B(-18, -12, -3, 0, -30, -26, mud({ tag: 'creek-neck' })),
    B(-30, -12, -3, 0, -26, -15, mud({ tag: 'shed-quay' })),
    chamfer(-30, -11, 4, -1, 1),
    B(-26, -12, -3, 0, -15, -8, mud({ tag: 'dock-yard' })),
    B(9, 26, -3, 0, -30, -24, mud({ tag: 'heap-wharf' })),
    B(9, 24.2, -3, 0, -24, -20, mud({ tag: 'heap-wharf' })),
    B(11, 24.2, -3, 0, -20, -12.2, mud({ tag: 'heap-wharf' })),
    B(11, 26, -3, 0, -12.2, -8, mud({ tag: 'heap-wharf' })),
    chamfer(26, -14, 1.8, 1, -1),
    B(13, 27, -3, 0, -8, -2, mud({ tag: 'mid-jetty' })),
    B(27, 29, -3, 0, -6, -4, mud({ tag: 'mid-jetty' })),
    chamfer(29, -8, 2, 1, -1),
    chamfer(29, -2, 2, 1, 1),
    B(13, 23, -3, 0, -2, 8, mud({ tag: 'mid-dyke' })),
    // diagonal causeway boardwalk over the creek: office quay → shed quay (railed both sides, see props.js)
    O(-23.7, -32, 1.8, 14.6, -0.08, 0.08, -28.7, wood({ tag: 'causeway' })),

    // ================= centre: the pans
    B(-12, 9, -3, P1, -30, -20, pan({ tag: 'back-pan' })),
    B(-12, 11, -3, 0, -20, -17, mud({ tag: 'sluice-dyke' })),
    B(-12, 11, -3, P2, -17, -10, pan({ tag: 'front-pan' })),
    B(-12, 11, -3, 0, -10, -8, mud({ tag: 'front-dyke' })),
    // boardwalks on posts, 8 cm proud of the dykes they land on (squids slip underneath)
    B(-3.6, -1.8, -0.08, 0.08, -30.4, -19.6, wood({ tag: 'boardwalk' })),
    O(0.9, -13.5, 1.8, 10.6, -0.08, 0.08, -38, wood({ tag: 'boardwalk-diag' })),
    B(1.4, 3.2, -0.08, 0.08, -8.4, -3.6, wood({ tag: 'boardwalk-mid' })),
    B(3.6, 13.4, -0.08, 0.08, -2.6, -0.8, wood({ tag: 'boardwalk-east' })),
    // plank ramps down into the pans
    R([7.5, P1, -28.4], [7.5, 0, -30], 1.4, wood({ tag: 'pan-ramp', thin: true, thickness: 0.14 })),
    R([-9.5, P2, -12.3], [-9.5, 0, -10], 1.4, wood({ tag: 'pan-ramp', thin: true, thickness: 0.14 })),
    R([-6.5, P3, -4.8], [-6.5, 0, -8], 1.6, wood({ tag: 'pan-ramp', thin: true, thickness: 0.14 })),
    R([9.8, P3, -5.2], [13, P3 + 1.2, -5.2], 1.6, { tag: 'pan-ramp', color: SP.timber, pattern: PATTERN.rampboard, thin: true, thickness: 0.14 }),

    // ================= spawn: loading gallery of the Salt Store (the barn facade is the back wall)
    B(-12, 8, 0, 5.4, -46, -45.4, { tag: 'store-facade', color: SP.store, pattern: PATTERN.weatherboard, noPaint: [[0, 0, 1]] }),
    B(-26, -12, 0, 0.9, -46, -45.5, wood({ tag: 'sea-wall', color: SP.timberDk })),
    B(8, 14, 0, 0.9, -46, -45.5, wood({ tag: 'sea-wall', color: SP.timberDk })),
    B(-9, 5, 0, 2.2, -45.4, -38.5, wood({ tag: 'gallery-body', color: SP.timberDk })),
    B(-9, 5, 2.2, 2.4, -45.4, -38.5, wood({ tag: 'gallery-deck', color: SP.spawn, mural: [{ n: [0, 1, 0], id: 6 }] })),
    R([-2, 0, -32.4], [-2, 2.4, -38.5], 5, wood({ tag: 'gallery-stair' })),
    R([11.4, 0, -43.6], [5, 2.4, -43.6], 3, { tag: 'gallery-ramp', color: SP.timber, pattern: PATTERN.rampboard }),
    // works office in the corner (out of play: walls take no ink, its roof slides you off — see props.js)
    B(-25.5, -19, 0, 2.8, -45.5, -40.5, { tag: 'office', color: SP.office, pattern: PATTERN.weatherboard, noPaint: [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] }),
    // conveyor tail hopper
    B(19.2, 23.2, 0, 1.4, -39.8, -36.8, { tag: 'hopper', color: SP.steel, pattern: PATTERN.metalpanel, noPaint: [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] }),

    // ================= right lane: the Packing Shed (−X for Alpha)
    B(-26, -15, 0, 3.2, -25, -18, { tag: 'shed', color: SP.shed, pattern: PATTERN.weatherboard }),
    R(rise(-20.5, -25, 3.2, -20.5, -21.5, 4.2), [-20.5, 4.2, -21.5], 11, { tag: 'shed-roof', color: SP.roof, pattern: PATTERN.container, mural: [{ n: [0, 0.962, -0.275], id: 5 }] }),
    R(rise(-20.5, -18, 3.2, -20.5, -21.5, 4.2), [-20.5, 4.2, -21.5], 11, { tag: 'shed-roof', color: SP.roof, pattern: PATTERN.container, mural: [{ n: [0, 0.962, 0.275], id: 4 }] }),
    B(-26, -16, 0, 1.1, -18, -15.4, wood({ tag: 'dock', color: SP.timberDk })),
    R([-24, 0, -12.6], [-24, 1.1, -15.4], 1.8, wood({ tag: 'dock-steps' })),
    // loft stair up the back of the shed onto the roof
    R([-17, 0, -33], [-17, 3.2, -25], 1.8, wood({ tag: 'loft-stair', notIn: 'zones' })),
    // (Zone Control: the same flight, its two sides uninkable — they carry the handrail's rail colliders, and a squid
    // swimming up a side surfaced under the rail: bots got stuck there for seconds while the roof was the objective)
    R([-17, 0, -33], [-17, 3.2, -25], 1.8, wood({ tag: 'loft-stair', noPaint: [[1, 0, 0], [-1, 0, 0]], onlyIn: 'zones' })),
    // Zone Control (src/world/variants.js): the roof is the home side zone, so attackers from mid get ways up on the
    // dock side too — a timber stair up the facade from the dock (1.1) to a landing flush with the eave (3.2) beside
    // the sack pallets (props.js: handrail on the open side, the facade's second door moved out of its way). Routes up
    // from the dock: the stair; hopping the sack pallets stacked against the landing (2.0 / 2.6) onto it or the eave;
    // swimming up the inkable shed front past the pallets or the gables. The defenders keep the loft stair and the rest.
    // (the flight's open side and the landing's front carry the handrail — rail colliders — so those two faces take no
    // ink: a squid swimming up them would surface under the rail; the treads, the landing top and the shed front do)
    R([-16.7, 1.1, -17.24], [-21.5, 3.2, -17.24], 1.5, wood({ tag: 'shed-stair', noPaint: [[0, 0, 1]], onlyIn: 'zones' })),
    B(-23, -21.5, 1.1, 3.2, -18, -16.5, wood({ tag: 'shed-landing', noPaint: [[0, 0, 1]], onlyIn: 'zones' })),
    // … and a second flight of dock steps at the east end, straight up from the yard to the stair's foot (the dock spur
    // stops short at the turntable in this build, props.js)
    R([-16.9, 0, -12.6], [-16.9, 1.1, -15.4], 1.8, wood({ tag: 'dock-steps', onlyIn: 'zones' })),

    // ================= left lane: the Salt Heap + conveyor gantry (+X for Alpha)
    // the heap: fresh salt at the mid end (fed by the conveyor), the older back half under a tarp weighted with tyres
    R(rise(11.8, -16, 0, 17.5, -16, 2.4), [17.5, 2.4, -16], 6, { tag: 'heap', color: SP.heap, pattern: PATTERN.rubber }),
    R(rise(23.2, -16, 0, 17.5, -16, 2.4), [17.5, 2.4, -16], 6, { tag: 'heap', color: SP.heap, pattern: PATTERN.rubber }),
    R(rise(11.8, -22, 0, 17.5, -22, 2.4), [17.5, 2.4, -22], 6, { tag: 'heap-tarp', color: SP.tarp, pattern: PATTERN.rubber }),
    R(rise(23.2, -22, 0, 17.5, -22, 2.4), [17.5, 2.4, -22], 6, { tag: 'heap-tarp', color: SP.tarp, pattern: PATTERN.rubber }),
    B(16, 22.45, 3.35, 3.6, -13, -9.5, { tag: 'gantry-head', color: SP.steel, pattern: PATTERN.metalpanel }),
    B(20, 22.45, 3.35, 3.6, -26, -13, wood({ tag: 'gantry-catwalk' })),
    R([21.225, 0, -35.6], [21.225, 3.6, -26], 2.45, wood({ tag: 'gantry-incline', thin: true, thickness: 0.25 })),
  ],
  decor: {
    lamps: [],
    palms: [],
    flags: [[-8.2, 2.4, -44.8], [4.2, 2.4, -44.8]],
  },
};

export const LAYOUT = SALTPAN;
