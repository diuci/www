// Zone Control zones per stage (src/game/zones.js reads layout.zones). Drawn by hand on the stage top-downs, then
// snapped to the nearest walls / drops. Coordinates are world metres (x, z); y0…y1 = the floor heights that count.
//   center: [zone] or [zone, zone] (two-zone centre: both must be held)
//   side:   the zone on Alpha's half (closer to Alpha's spawn); Bravo's is its 180° mirror
//   zone:   { poly: [[x, z], …] } or { polys: [[[x, z], …], …] } (several parts, one shared coverage)
const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
// turned rectangle: centre, local x axis (unit, [ax, az]), half extents along local x / local z (= (-az, ax))
const orect = (cx, cz, [ax, az], hx, hz) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => [cx + ax * hx * i - az * hz * k, cz + az * hx * i + ax * hz * k].map((v) => +v.toFixed(3)));
const circle = (cx, cz, r, n = 24) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [+(cx + Math.cos(a) * r).toFixed(3), +(cz + Math.sin(a) * r).toFixed(3)]; });
const K35 = [0.819, -0.574];   // Kelpline berth: local x axis (the whole berth is turned 35°)
const X31 = [0.857, 0.514];    // Crossroads Market: the tram street / market hall axis (turned 31°)
const L45 = [-0.707, 0.707];   // Lockgate: the humpback bridge's run

export const ZONE_DEFS = {
  // the ferry's sun deck either side of the wheelhouse (two-zone centre); the tug up on blocks
  halyard: {
    center: [{ poly: rect(1.5, 6.5, -2.9, 2.9), y0: 3.5, y1: 4.1 }, { poly: rect(-6.5, -1.5, -2.9, 2.9), y0: 3.5, y1: 4.1 }],
    side: { poly: rect(14.5, 20.5, -24, -13), y0: 2.3, y1: 2.9 },
  },
  // the round Jubilee terrace (dais + ring) round the clock tower; a patch of the square against the colonnade stair
  tidewater: {
    center: [{ poly: circle(0, 0, 8.55), y0: 0.8, y1: 1.3 }],
    side: { poly: rect(10, 17.5, -20, -10), y0: -0.5, y1: 0.3 },
  },
  // the mid landing across the berth's full width (hatch-cover stack included); the Block 4A container plateau
  kelpline: {
    center: [{ poly: orect(0, 0, K35, 6.5, 7), y0: -0.3, y1: 2.6 }],
    side: { poly: orect(-2.1, -22.2, K35, 4, 6.5), y0: 2.3, y1: 2.9 },
  },
  // the Great Pan's two quarters beside the wind pump (two-zone centre); the packing-shed roof
  saltpan: {
    center: [{ poly: rect(3.6, 13, -0.8, 8), y0: -1.4, y1: -0.9 }, { poly: rect(-13, -3.6, -8, 0.8), y0: -1.4, y1: -0.9 }],
    side: { poly: rect(-26, -15, -25, -18), y0: 3.0, y1: 4.4 },
  },
  // the market hall floor the length of the tram; the tram pier out to its end over the harbour
  crossmarket: {
    center: [{ poly: orect(0, 0, X31, 5, 6), y0: -0.2, y1: 0.5 }],
    side: { poly: orect(-22.88, -13.72, X31, 6.2, 3.95), y0: -0.2, y1: 0.5 },
  },
  // the humpback bridge between its parapets (ramps included, not the towpath under it); two yard pockets per side
  lockgate: {
    center: [{ poly: orect(0, 0, L45, 15.5, 2.2), y0: 0.3, y1: 3.5 }],
    side: { polys: [rect(-1.5, 5.5, -28, -18), rect(-15.5, -8, -25.5, -18.7)], y0: -0.3, y1: 0.4 },
  },
  // San Vito's sagrato, the whole open platform round the tempietto (Zone Control build: 16 x 12, the chapel block is
  // gone — only the colonnade's columns stand on it); the promenade bulge on the sea wall
  terraces: {
    center: [{ poly: rect(-8, 8, -6, 6), y0: 1.0, y1: 1.4 }],
    side: { poly: [[14.4, -27.1], [20, -22.5], [20, -15.2], [14.4, -10.6]], y0: -0.3, y1: 0.4 },
  },
};
