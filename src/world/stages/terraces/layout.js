// Terrace Heights — stage layout (src/world/stages/terraces/). The stage owns every file in this folder:
//   layout.js    level geometry (this file)        props.js    prop pack + placements (set dressing)
//   surfaces.js  stage surface materials (texlib)  murals.js   stage decals / signage (mural atlas)
import { PATTERN, B, R, O } from '../../mapkit.js';
import { SURF } from './surfaces.js';
import { MURAL } from './murals.js';

// ------------------------------------------------------------------------------------------------------------
// Terrace Heights — a whitewashed hill village on two headlands joined by a piazza. Each team's village climbs its own
// hill in curved terraces that follow the contour lines; the hills sit on opposite wings of the map (Alpha to the
// south-west, Bravo to the north-east), so the playable ground reads as a sweeping S of two round hills around the
// Piazzetta, with arrow bastions, a headland and coves along an irregular quay wall.
// Levels: H0 piazza / promenade 0 · H1 1.2 · H2 2.4 · H3 3.6 · H4 4.8 (spawn). Alpha at −Z (half list), Bravo is the
// 180° twin. How the ground is built (see the contour kit and the ground builder below): every level is a nested
// region (discs round the hilltop, the crescent ring round the piazza, straight clips at the incline and the back
// wall, a polygon for the quay wall); its contour line is chorded into straight terracotta coping bars, and the floor
// inside is laid as a few big turned slabs (with pebble gutters where slabs of different directions meet) — about 20
// deck slabs per half at the sea level, so the environment's sea footprint stays exact.
//   • spawn: the belvedere terrace of Villa Limoni on the hilltop (H4, a side wing of the map) — a 2.4 m drop and the
//     Scalinata straight down to the Largo in front, the forecourt to the funicular station on the right
//   • centre: Scalinata → Largo della Fontana (H2) → the Vicolo between the Caffè and the Ceramiche shop (two flights)
//     → the Piazzetta; the Caffè roof (H3) overlooks the Vicolo and the piazza
//   • right lane (−X for Alpha) "Funicolare": the funicular incline runs diagonally down the cliff edge from the upper
//     station to the piazza's west side, the car stopped halfway as cover; the curved Salita terraces beside it
//   • left lane (+X) "Limonaia": the lemon garden and pergola on the hill's east shoulder (H3), the Orto (H2), the
//     Case sul Mare over the east cove, down to the belvedere bastion by the piazza
//   • piazza: ringed by the house crescent, San Vito on its sagrato in the middle (the chapel itself, its dome and bell
//     gables are off-limits), arrow bastions with pebble compass roses projecting over the sea on both sides
// ------------------------------------------------------------------------------------------------------------
const H0 = 0, H1 = 1.2, H2 = 2.4, H3 = 3.6, H4 = 4.8, FL = -1.2;
const TH = {
  white: '#f3efe6', warm: '#f1e8d6', ochre: '#e9cf9c', pink: '#efcdbd', sky: '#dfe8ea', lemon: '#f0e2a8',
  wall: '#ddd3c1',          // retaining walls: limewash over rubble, warm grey
  step: '#ddd4c3',          // limestone steps
  cotto: '#d9d2c6', pebble: '#d8d2c6', spawn: '#eae6de', villa: '#f2e6cf', station: '#e8d9b8', rim: '#e2d6c4',
};
const T = (x0, x1, z0, z1, top, o) => B(x0, x1, FL, top, z0, z1, o);
const cotto = (o = {}) => ({ color: TH.wall, pattern: SURF.cotto ?? PATTERN.tiles, ...o });
const pebble = (o = {}) => ({ color: TH.wall, pattern: SURF.pebble ?? PATTERN.pavers, ...o });
const house = (c, o = {}) => ({ color: c, pattern: SURF.calce ?? PATTERN.render, ...o });
const stair = (o = {}) => ({ color: TH.step, pattern: PATTERN.stonestep, ...o });
// upper storeys, back walls, the chapel: scenery only — never inked, never climbed, and their tops are off-limits
// (`roof`: nobody can stand there, anyone who lands on one slides off; the pitched roofs / domes on top are props)
const NOPAINT = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
const upper = (c, o = {}) => house(c, { noPaint: NOPAINT, roof: true, ...o });
const DEG = 180 / Math.PI;

// ============================================================================================================
// Contour kit. A region is { iv(x) → sorted disjoint z-intervals, curves: boundary candidates [{ pts, nrm, norim }] }.
// Primitives: disc, rect, halfplane (line through a point, inside = left of its direction), poly; combinators union /
// inter / diff. A level = the nested region of everything at or above that height. Its contour line (curves marked
// norim are clip lines: the back wall, the half line z = 0, the incline which covers its own edge) becomes the rim — a
// chain of coping bars RIM_W wide — and the floor inside is laid by the ground builder further down.
// ============================================================================================================
const ZBACK = -45.4, ZMID = 0, RIM_W = 0.8;
const Iv = {
  norm(a) { a = a.filter(([l, h]) => h - l > 1e-6).sort((p, q) => p[0] - q[0]); const o = []; for (const s of a) { if (o.length && s[0] <= o[o.length - 1][1] + 1e-9) o[o.length - 1][1] = Math.max(o[o.length - 1][1], s[1]); else o.push([s[0], s[1]]); } return o; },
  union(a, b) { return Iv.norm([...a, ...b]); },
  inter(a, b) { const o = []; for (const [l1, h1] of a) for (const [l2, h2] of b) { const l = Math.max(l1, l2), h = Math.min(h1, h2); if (h > l + 1e-9) o.push([l, h]); } return Iv.norm(o); },
  diff(a, b) { let o = a.map((s) => [...s]); for (const [l2, h2] of b) { const n = []; for (const [l, h] of o) { if (h2 <= l || l2 >= h) { n.push([l, h]); continue; } if (l2 > l) n.push([l, l2]); if (h2 < h) n.push([h2, h]); } o = n; } return Iv.norm(o); },
};
const INF = 1e6;
function disc(cx, cz, r, o = {}) {
  const n = Math.max(24, Math.ceil((2 * Math.PI * r) / 0.08)), pts = [], nrm = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); nrm.push([Math.cos(a), Math.sin(a)]); }
  return { iv: (x) => { const d = r * r - (x - cx) * (x - cx); return d > 0 ? [[cz - Math.sqrt(d), cz + Math.sqrt(d)]] : []; }, curves: [{ pts, nrm, closed: true, norim: o.norim }] };
}
function rect(x0, x1, z0, z1, o = {}) {
  const e = (ax, az, bx, bz, nx, nz) => { const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / 0.08)), pts = [], nrm = []; for (let i = 0; i <= n; i++) { pts.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n]); nrm.push([nx, nz]); } return { pts, nrm, norim: o.norim }; };
  return { iv: (x) => (x >= x0 && x <= x1 ? [[z0, z1]] : []), xs: [x0, x1], curves: [e(x0, z0, x1, z0, 0, -1), e(x1, z0, x1, z1, 1, 0), e(x1, z1, x0, z1, 0, 1), e(x0, z1, x0, z0, -1, 0)] };
}
// half-plane on the left of the directed line (ax,az)→(bx,bz); the boundary is sampled between the two points only
function halfplane(ax, az, bx, bz, o = {}) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), nx = dz / L, nz = -dx / L;   // outward normal (right side)
  const n = Math.max(2, Math.ceil(L / 0.08)), pts = [], nrm = [];
  for (let i = 0; i <= n; i++) { pts.push([ax + (dx * i) / n, az + (dz * i) / n]); nrm.push([nx, nz]); }
  // inside: nx*(x-ax) + nz*(z-az) <= 0
  const iv = (x) => { if (Math.abs(nz) < 1e-9) return nx * (x - ax) <= 0 ? [[-INF, INF]] : []; const zc = az - (nx * (x - ax)) / nz; return nz > 0 ? [[-INF, zc]] : [[zc, INF]]; };
  return { iv, curves: [{ pts, nrm, norim: o.norim }] };
}
// simple polygon (vertices in order, either winding); every edge is a rim candidate
function poly(pts, o = {}) {
  const n = pts.length;
  const R = { xs: pts.map((p) => p[0]), curves: [] };
  R.iv = (x) => { const zs = []; for (let i = 0; i < n; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n]; if ((ax <= x && bx > x) || (bx <= x && ax > x)) zs.push(az + ((bz - az) * (x - ax)) / (bx - ax)); } zs.sort((a, b) => a - b); const out = []; for (let k = 0; k + 1 < zs.length; k += 2) out.push([zs[k], zs[k + 1]]); return out; };
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n], L = Math.hypot(bx - ax, bz - az), m = Math.max(2, Math.ceil(L / 0.08));
    let nx = (bz - az) / L, nz = -(bx - ax) / L;
    if (R.iv(ax + (bx - ax) / 2 + nx * 0.01).some(([l, h]) => az + (bz - az) / 2 + nz * 0.01 >= l && az + (bz - az) / 2 + nz * 0.01 <= h)) { nx = -nx; nz = -nz; }
    const p = [], nr = []; for (let k = 0; k <= m; k++) { p.push([ax + ((bx - ax) * k) / m, az + ((bz - az) * k) / m]); nr.push([nx, nz]); }
    R.curves.push({ pts: p, nrm: nr, norim: o.norim });
  }
  return R;
}
const union = (...rs) => ({ iv: (x) => rs.reduce((a, r) => Iv.union(a, r.iv(x)), []), curves: rs.flatMap((r) => r.curves), xs: rs.flatMap((r) => r.xs || []) });
const inter = (...rs) => ({ iv: (x) => rs.slice(1).reduce((a, r) => Iv.inter(a, r.iv(x)), rs[0].iv(x)), curves: rs.flatMap((r) => r.curves), xs: rs.flatMap((r) => r.xs || []) });
const diff = (a, b) => ({ iv: (x) => Iv.diff(a.iv(x), b.iv(x)), curves: [...a.curves, ...b.curves.map((c) => ({ ...c, nrm: c.nrm.map(([p, q]) => [-p, -q]) }))], xs: [...(a.xs || []), ...(b.xs || [])] });
const inside = (r, x, z) => r.iv(x).some(([l, h]) => z >= l - 1e-7 && z <= h + 1e-7);

// SAT penetration of two turned rectangles { c:[x,z], ax:[[ux,uz],[vx,vz]], h:[hu,hv] }
const corners = (s) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => [s.c[0] + s.ax[0][0] * s.h[0] * i + s.ax[1][0] * s.h[1] * k, s.c[1] + s.ax[0][1] * s.h[0] * i + s.ax[1][1] * s.h[1] * k]);
function pen(A, Bs) {
  let min = Infinity; const ca = corners(A), cb = corners(Bs);
  for (const ax of [...A.ax, ...Bs.ax]) { const pa = ca.map((p) => p[0] * ax[0] + p[1] * ax[1]), pb = cb.map((p) => p[0] * ax[0] + p[1] * ax[1]); min = Math.min(min, Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb))); }
  return min;
}
// ============================================================================================================
// The ground (Alpha's half, z ≤ 0; the mirror builds Bravo's)
// ============================================================================================================
const C = [-12, -35];                                  // Alpha's hilltop (the spawn wing, south-west)
const toO = [12 / Math.hypot(12, 35), 35 / Math.hypot(12, 35)];
// the funicular incline down the west cliff edge: top at the upper station, foot by the piazza
const INC = { top: [-24.3, H4, -41.4], foot: [-17.6, H0, -10.4], w: 3.8 };
const incDir = (() => { const dx = INC.foot[0] - INC.top[0], dz = INC.foot[2] - INC.top[2], L = Math.hypot(dx, dz); return [dx / L, dz / L, L]; })();
const incN = [incDir[1], -incDir[0]];                  // unit normal pointing east of the incline (+x-ish)
// points along the incline: t 0 (top) … 1 (foot), off = metres to its east (right-hand side going down)
const incP = (t, off = 0) => [INC.top[0] + (INC.foot[0] - INC.top[0]) * t + incN[0] * off, INC.top[2] + (INC.foot[2] - INC.top[2]) * t + incN[1] * off];
// half-plane with outward normal n through P (the boundary sampled ±E along the line)
const hpN = (P, n, E = 40, o = {}) => { const d = [-n[1], n[0]]; return halfplane(P[0] - d[0] * E, P[1] - d[1] * E, P[0] + d[0] * E, P[1] + d[1] * E, o); };
// the hill levels stop 0.8 m in under the incline's east edge (the ramp hides their ends); the footprint stops at its
// west parapet. North of the foot there is no incline, so nothing is clipped there.
const NORTH = rect(-28, 28, INC.foot[2] - 0.01, ZMID, { norim: true });
const eastOfIncline = union(hpN(incP(0.5, INC.w / 2 - 0.8), [-incN[0], -incN[1]], 40, { norim: true }), NORTH);
const eastOfInclineW = union(hpN(incP(0.5, -INC.w / 2 - 0.3), [-incN[0], -incN[1]], 40, { norim: true }), NORTH);
// the Salita: a 4 m street beside the incline that steps down with it — level L stops there beyond t_L (so the ground
// never rises above the track), each cut a 1.2 m step with a flight of stairs
const SAL_W = 4.2, T_CUT = { 4: 0.02, 3: 0.245, 2: 0.495, 1: 0.745 };
const salitaCut = (L) => inter(hpN(incP(T_CUT[L]), [-incDir[0], -incDir[1]], 12), hpN(incP(0.5, INC.w / 2 + SAL_W), incN, 40));
const zone = (r, west = eastOfIncline, L = 0) => inter(L ? diff(r, salitaCut(L)) : r, west, rect(-28, 28, ZBACK, ZMID, { norim: true }));
// the north sector in front of the spawn where H3 is missing (the spawn terrace drops 2.4 m straight to the Largo)
const wedge = (() => { const a = Math.atan2(toO[1], toO[0]), h = (27 * Math.PI) / 180, L = 20; const p1 = [C[0] + Math.cos(a - h) * L, C[1] + Math.sin(a - h) * L], p2 = [C[0] + Math.cos(a + h) * L, C[1] + Math.sin(a + h) * L]; return inter(halfplane(C[0], C[1], p1[0], p1[1]), halfplane(p2[0], p2[1], C[0], C[1])); })();
const PIAZZA_R = 14.8, BELV = [18.9, -1.2], BELV_D = 5.0;   // belvedere bastion: flanks off the piazza, a 45° prow (half-diagonal BELV_D)
// hill levels: discs round the hilltop with a few lobes (the lemon-garden shoulder, the Largo), clipped at the incline
const R4 = zone(union(disc(C[0], C[1], 8.5), rect(-26.8, -4.4, ZBACK, -41.3)), eastOfIncline, 4);
const R3 = union(R4, zone(diff(union(disc(C[0], C[1], 13.5), disc(-1.5, -33.5, 6.5)), wedge), eastOfIncline, 3));
// sector of the ring round the piazza (ψ = compass angle round O from −Z, + toward +x; radii from O)
const uO = (psi) => [Math.sin((psi * Math.PI) / 180), -Math.cos((psi * Math.PI) / 180)];
const sectorO = (r0, r1, psi0, psi1) => { const a = (psi0 * Math.PI) / 180, b = (psi1 * Math.PI) / 180; return diff(inter(disc(0, 0, r1), hpN([0, 0], [-Math.cos(a), -Math.sin(a)]), hpN([0, 0], [Math.cos(b), Math.sin(b)])), disc(0, 0, r0)); };
// the piazza frame: a crescent of houses on the piazza's rim (fronts on the circle, 4.4 m deep), the H2 street behind
// them, H1 landings in the gaps between them (the Vicolo, the Passo)
const HOUSE_R0 = PIAZZA_R, HOUSE_R1 = PIAZZA_R + 4.4, STREET_R0 = PIAZZA_R + 3.9, STREET_R1 = PIAZZA_R + 8.0;
const GAPS = { vicolo: [-28, -10], passo: [11, 20] };
const R2 = union(R3, zone(union(disc(C[0], C[1], 19.0), disc(2.5, -27.5, 7.0), sectorO(STREET_R0, STREET_R1, -52, 34)), eastOfIncline, 2));
const R1 = union(R2, zone(union(diff(union(disc(C[0], C[1], 23.5), disc(6.5, -22, 7.5)), disc(0, 0, STREET_R0)),
  sectorO(PIAZZA_R, STREET_R0 + 0.3, ...GAPS.vicolo), sectorO(PIAZZA_R, STREET_R0 + 0.3, ...GAPS.passo)), eastOfIncline, 1));
// the footprint: an irregular sea wall (straight runs of quay wall) round the hill's promenade, the Case sul Mare
// headland and the piazza, and the belvedere bastions either side of the piazza — arrow bastions pointing out to sea
// (the west one is Bravo's twin, mirrored); a cove between the headland and the east bastion, an inlet by the funicular
const SHORE = poly([[-29.0, -45.4], [10.0, -45.4], [16.0, -36.0], [16.0, -26.4], [20.0, -22.0], [20.0, -15.0], [14.4, -9.4], [14.4, 0.0],
  [-14.4, 0.0], [-14.4, -6.8], [-17.4, -6.8], [-20.8, -8.6], [-21.6, -12.6], [-29.0, -12.6]]);
// a bastion: straight flanks out from the piazza's sea wall (x = 14.4) and a prow of two 45° faces
const bastion = (s) => poly([[14.4 * s, (BELV[1] - BELV_D) * s], [BELV[0] * s, (BELV[1] - BELV_D) * s], [(BELV[0] + BELV_D) * s, BELV[1] * s], [BELV[0] * s, (BELV[1] + BELV_D) * s], [14.4 * s, (BELV[1] + BELV_D) * s]]);
const R0 = union(R1, zone(union(SHORE, bastion(1), bastion(-1)), eastOfInclineW));

// ============================================================================================================
// Features on the hill: frames round the hilltop (φ in degrees from the direction to the piazza, + = east)
// ============================================================================================================
const F = toO, SD = [F[1], -F[0]];                     // forward (to the piazza), side (east)
const P = (r, phi) => { const a = (phi * Math.PI) / 180, dx = F[0] * Math.cos(a) + SD[0] * Math.sin(a), dz = F[1] * Math.cos(a) + SD[1] * Math.sin(a); return [C[0] + dx * r, C[1] + dz * r, dx, dz]; };
const rotOf = (dx, dz) => Math.atan2(dx, dz) * DEG;   // O() / prop rotY (deg) that turns local +Z to (dx, dz)
// where the piazza carve meets the ray φ (the H1 terrace's edge there)
const carveR = (phi) => { const [, , dx, dz] = P(1, phi), b = C[0] * dx + C[1] * dz, c = C[0] * C[0] + C[1] * C[1] - PIAZZA_R * PIAZZA_R; return -b - Math.sqrt(Math.max(0, b * b - c)); };
// a radial ramp from radius r0 (height y0) to r1 (height y1) along φ
const rRamp = (phi, r0, y0, r1, y1, w, o) => { const a = P(r0, phi), b = P(r1, phi); return y0 < y1 ? R([a[0], y0, a[1]], [b[0], y1, b[1]], w, o) : R([b[0], y1, b[1]], [a[0], y0, a[1]], w, o); };
// a house turned to the contour: its back (hill side) at rIn, its front (downhill) at rOut, w wide, centred on φ
function hut(phi, rIn, rOut, w) { const m = P((rIn + rOut) / 2, phi); return { cx: m[0], cz: m[1], w, d: rOut - rIn, rot: rotOf(m[2], m[3]) }; }
// a house on the piazza crescent between compass angles psi0..psi1 (front on the circle, facing the piazza centre)
function frame(psi0, psi1, r0 = HOUSE_R0, r1 = HOUSE_R1) { const pc = (psi0 + psi1) / 2, u = uO(pc), rm = (r0 + r1) / 2, w = 2 * r0 * Math.tan(((psi1 - psi0) * Math.PI) / 360); return { cx: u[0] * rm, cz: u[1] * rm, w, d: r1 - r0, rot: rotOf(-u[0], -u[1]), psi: pc }; }
// the houses of Alpha's village (props.js dresses them from this table: same centre / size / turn)
const HOUSES = {
  caffe: { ...frame(-52, -28), y0: FL, top: H3, color: TH.ochre, tag: 'caffe' },
  ceramiche: { ...frame(-10, 11), y0: FL, top: H3, color: TH.white, tag: 'ceramiche' },
  mare: { ...frame(20, 38), y0: FL, top: H2 + 0.2, color: TH.sky, tag: 'case-sul-mare' },
};
const houseBlock = (h, o = {}) => O(h.cx, h.cz, h.w, h.d, h.y0, h.top, h.rot, house(h.color, { tag: h.tag, ...o }));
// an upper storey on part of a house: offsets along the house's own axes (lx across the front, lz back → front)
function upperOf(h, lx, lz, w, d, top, color, o = {}) { const a = (h.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a); return { cx: h.cx + c * lx + sn * lz, cz: h.cz - sn * lx + c * lz, w, d, rot: h.rot, y0: h.top, top, color, ...o }; }
const UPPERS = {
  caffe: upperOf(HOUSES.caffe, -1.1, -1.0, 4.2, 2.4, 6.4, TH.ochre, { tag: 'caffe-upper' }),
  ceramiche: upperOf(HOUSES.ceramiche, 1.2, -1.0, 3.6, 2.4, 6.0, TH.white, { tag: 'ceramiche-upper' }),
  mare: upperOf(HOUSES.mare, 1.2, -0.7, 2.6, 3.0, 5.6, TH.sky, { tag: 'case-sul-mare-upper' }),
};
// world normal of a turned block's face: (sx, sz) = (±1, 0) side faces along local x, (0, ±1) front / back
const faceN = (h, sx, sz) => { const a = (h.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a); return [c * sx + sn * sz, 0, -sn * sx + c * sz]; };
const upperBlock = (u, o = {}) => O(u.cx, u.cz, u.w, u.d, u.y0, u.top, u.rot, upper(u.color, { tag: u.tag, ...o }));
// radial ramp round the piazza centre along ψ: from r0 (height y0) to r1 (y1)
const oRamp = (psi, r0, y0, r1, y1, w, o) => { const u = uO(psi), a = [u[0] * r0, u[1] * r0], b = [u[0] * r1, u[1] * r1]; return y0 < y1 ? R([a[0], y0, a[1]], [b[0], y1, b[1]], w, o) : R([b[0], y1, b[1]], [a[0], y0, a[1]], w, o); };
// Salita flights beside the incline: from the lower street up to each cut (t_L), 2.6 m wide in the middle of the band
const salitaFlight = (L, y0, y1) => { const run = 3.1 / incDir[2], off = INC.w / 2 + SAL_W / 2 + 0.2, a = incP(T_CUT[L] + run, off), b = incP(T_CUT[L] - 0.005, off); return R([a[0], y0, a[1]], [b[0], y1, b[1]], 2.6, stair({ tag: 'salita-flight' })); };

const VIC = (GAPS.vicolo[0] + GAPS.vicolo[1]) / 2, PAS = (GAPS.passo[0] + GAPS.passo[1]) / 2;
// a straight flight from (a, height ya) to (b, height yb) in plan
const flight = (a, ya, b, yb, w, tag) => (ya < yb ? R([a[0], ya, a[1]], [b[0], yb, b[1]], w, stair({ tag })) : R([b[0], yb, b[1]], [a[0], ya, a[1]], w, stair({ tag })));
const along = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const unit = (p, q) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); return [(q[0] - p[0]) / d, (q[1] - p[1]) / d]; };
// the east lane down the lemon shoulder: limonaia (H3) → Orto (H2) → the Case sul Mare lane (H1) → the headland (H0)
const EAST = (() => {
  const L3 = [-1.5, -33.5], L2 = [2.5, -27.5], L1 = [6.5, -22], HD = [11.5, -17.5];
  const e1 = unit(L3, L2), p1 = [L3[0] + e1[0] * 6.47, L3[1] + e1[1] * 6.47];
  const e2 = unit(L2, L1), p2 = [L2[0] + e2[0] * 6.97, L2[1] + e2[1] * 6.97];
  const e3 = unit(L1, HD), p3 = [L1[0] + e3[0] * 7.47, L1[1] + e3[1] * 7.47];
  return { p1, e1, p2, e2, p3, e3 };
})();
const LARGO = (() => { const m = P(16.0, 0); return { x: m[0], z: m[1], h: 2.0 }; })();
const FEATURES = [
  // the Scalinata: from the villa terrace (H4) straight down 2.4 m to the Largo
  rRamp(0, 8.45, H4, 14.65, H2, 5.2, stair({ tag: 'scalinata' })),
  // the Vicolo between the Caffè and the Ceramiche shop: the piazza → an H1 landing → the street (H2)
  oRamp(VIC, PIAZZA_R - 3.1, H0, PIAZZA_R + 0.02, H1, 4.0, stair({ tag: 'vicolo-flight-1' })),
  oRamp(VIC, STREET_R0 - 3.1, H1, STREET_R0 + 0.02, H2, 4.0, stair({ tag: 'vicolo-flight-2' })),
  // the Passo: a narrow stair between the Ceramiche and the Case sul Mare
  oRamp(PAS, PIAZZA_R - 3.1, H0, PIAZZA_R + 0.02, H1, 2.2, stair({ tag: 'passo-flight-1' })),
  oRamp(PAS, STREET_R0 - 3.1, H1, STREET_R0 + 0.02, H2, 2.2, stair({ tag: 'passo-flight-2' })),
  houseBlock(HOUSES.caffe), houseBlock(HOUSES.ceramiche), houseBlock(HOUSES.mare),
  upperBlock(UPPERS.caffe, { mural: [{ n: faceN(UPPERS.caffe, -1, 0), id: MURAL.sundial }] }), upperBlock(UPPERS.ceramiche), upperBlock(UPPERS.mare, { mural: [{ n: faceN(UPPERS.mare, 0, 1), id: MURAL.ghost }] }),
  // roof-terrace stairs from the street behind the crescent (H2) up onto the Caffè and Ceramiche roofs (H3)
  oRamp(-44, STREET_R1 - 0.4, H2, HOUSE_R1 + 0.02, H3, 1.8, stair({ tag: 'caffe-stair' })),
  oRamp(-4, STREET_R1 - 0.4, H2, HOUSE_R1 + 0.02, H3, 1.8, stair({ tag: 'ceramiche-stair' })),
  // the east lane
  flight([EAST.p1[0] + EAST.e1[0] * 3.1, EAST.p1[1] + EAST.e1[1] * 3.1], H2, [EAST.p1[0] - EAST.e1[0] * 0.02, EAST.p1[1] - EAST.e1[1] * 0.02], H3, 2.8, 'limonaia-stair'),
  flight([EAST.p2[0] + EAST.e2[0] * 3.1, EAST.p2[1] + EAST.e2[1] * 3.1], H1, [EAST.p2[0] - EAST.e2[0] * 0.02, EAST.p2[1] - EAST.e2[1] * 0.02], H2, 2.8, 'orto-stair'),
  flight([EAST.p3[0] + EAST.e3[0] * 3.1, EAST.p3[1] + EAST.e3[1] * 3.1], H0, [EAST.p3[0] - EAST.e3[0] * 0.02, EAST.p3[1] - EAST.e3[1] * 0.02], H1, 2.8, 'gradoni'),
  // the Largo's pebble sun (its own floor piece, so the mural fits one face)
  B(LARGO.x - LARGO.h, LARGO.x + LARGO.h, FL, H2, LARGO.z - LARGO.h, LARGO.z + LARGO.h, pebble({ tag: 'largo-sun', mural: [{ n: [0, 1, 0], id: MURAL.sun }] })),
  // the Salita beside the funicular
  salitaFlight(4, H3, H4), salitaFlight(3, H2, H3), salitaFlight(2, H1, H2), salitaFlight(1, H0, H1),
];

// ============================================================================================================
// Ground builder (bake time only — the result is baked into GROUND_DATA below). Levels are laid top-down (H4 first):
//   • rims: the contour line chorded into straight coping bars (sagitta ≤ SAG, ≤ SEG_MAX long), RIM_W deep inside it
//     and 10 cm above the floor (terracotta coping on a limewashed retaining wall); joints trimmed so bars only touch
//   • slabs: a few big rectangles picked greedily on a raster in every direction (5° steps) — each new slab is the
//     rectangle that covers the most still-bare floor while staying inside the level (or under its coping, never past
//     a coping's face) and clear of the level's other slabs — then grown exactly until it touches its neighbours
//   • gutters: the thin wedges left where slabs of different directions meet, pebble joints 10 cm lower (a second tier
//     18 cm lower where two would cross)
// Bare floor = the level's region minus its rims minus whatever stands on it (higher levels, houses, walls). The
// promenade level (H0) is laid solid under the whole hill too, so the stage's sea footprint has no holes.
// ============================================================================================================
const SAG = 0.3, SEG_MAX = 7.0, RS = 0.05, RR = 0.1, MIN_SLAB = 0.3, GUT = [0.1, 0.19];
const orect = (cx, cz, w, d, deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return { c: [cx, cz], ax: [[c, -s], [s, c]], h: [w / 2, d / 2], deg }; };
const inO = (s, x, z, g = 0) => { const dx = x - s.c[0], dz = z - s.c[1]; return Math.abs(dx * s.ax[0][0] + dz * s.ax[0][1]) <= s.h[0] + g && Math.abs(dx * s.ax[1][0] + dz * s.ax[1][1]) <= s.h[1] + g; };
const ptO = (s, u, v) => [s.c[0] + s.ax[0][0] * u + s.ax[1][0] * v, s.c[1] + s.ax[0][1] * u + s.ax[1][1] * v];
const rad0 = (s) => Math.hypot(s.h[0], s.h[1]);
// raster grids: { x0, z0, rs, nx, nz }
function paintO(G, m, s, g = 0, v = 1) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of corners(s)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const i0 = Math.max(0, Math.floor((x0 - g - G.x0) / G.rs)), i1 = Math.min(G.nx - 1, Math.ceil((x1 + g - G.x0) / G.rs));
  const j0 = Math.max(0, Math.floor((z0 - g - G.z0) / G.rs)), j1 = Math.min(G.nz - 1, Math.ceil((z1 + g - G.z0) / G.rs));
  for (let j = j0; j <= j1; j++) { const z = G.z0 + (j + 0.5) * G.rs; for (let i = i0; i <= i1; i++) if (inO(s, G.x0 + (i + 0.5) * G.rs, z, g)) m[j * G.nx + i] = v; }
}
function paintR(G, m, r) {
  for (let i = 0; i < G.nx; i++) {
    const x = G.x0 + (i + 0.5) * G.rs;
    for (const [l, h] of r.iv(x)) { const j0 = Math.max(0, Math.ceil((l - G.z0) / G.rs - 0.5)), j1 = Math.min(G.nz - 1, Math.floor((h - G.z0) / G.rs - 0.5)); for (let j = j0; j <= j1; j++) m[j * G.nx + i] = 1; }
  }
}
const cellAt = (G, m, x, z) => { const i = Math.floor((x - G.x0) / G.rs), j = Math.floor((z - G.z0) / G.rs); return i < 0 || j < 0 || i >= G.nx || j >= G.nz ? 0 : m[j * G.nx + i]; };
// footprint + vertical range of a layout piece (ramps: null)
const shapeOf = (d) => (d.kind === 'box' ? { ...orect((d.min[0] + d.max[0]) / 2, (d.min[2] + d.max[2]) / 2, d.max[0] - d.min[0], d.max[2] - d.min[2], 0), y0: d.min[1], y1: d.max[1] }
  : d.kind === 'obox' ? { ...orect(d.center[0], d.center[2], d.size[0], d.size[2], d.rotY), y0: d.center[1] - d.size[1] / 2, y1: d.center[1] + d.size[1] / 2 } : null);
const mirrorDef = (d) => (d.kind === 'box' ? { ...d, min: [-d.max[0], d.min[1], -d.max[2]], max: [-d.min[0], d.max[1], -d.min[2]] }
  : d.kind === 'obox' ? { ...d, center: [-d.center[0], d.center[1], -d.center[2]] } : d);

// ---- boundary runs of a region: samples [x, z, nx, nz] on its true contour (clip lines and norim curves excluded)
function boundaryRuns(r) {
  const eps = 0.03, runs = [];
  const clipOK = (x, z) => z <= ZMID - 0.02 && z >= ZBACK + 0.02;
  for (const c of r.curves) {
    if (c.norim) continue;
    const n = c.pts.length;
    const on = c.pts.map(([x, z], k) => clipOK(x, z) && inside(r, x - c.nrm[k][0] * eps, z - c.nrm[k][1] * eps) && !inside(r, x + c.nrm[k][0] * eps, z + c.nrm[k][1] * eps));
    let start = 0;
    if (c.closed) { start = on.indexOf(false); if (start < 0) { runs.push([...c.pts.map((p, k) => [p[0], p[1], ...c.nrm[k]]), [c.pts[0][0], c.pts[0][1], ...c.nrm[0]]]); continue; } }
    let run = [];
    const m = c.closed ? n + 1 : n;
    for (let j = 0; j < m; j++) {
      const k = (start + j) % n;
      if (on[k]) run.push([c.pts[k][0], c.pts[k][1], ...c.nrm[k]]);
      else { if (run.length > 1) runs.push(run); run = []; }
    }
    if (run.length > 1) runs.push(run);
  }
  return runs;
}
// ---- rims: coping bars on chords of the contour. A bar = outer face P→Q (on the contour), n = inward normal
function mkBar(r, P, Q) {
  const dx = Q[0] - P[0], dz = Q[1] - P[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  let ix = -uz, iz = ux; const mx = (P[0] + Q[0]) / 2, mz = (P[1] + Q[1]) / 2;
  if (!inside(r, mx + ix * 0.25, mz + iz * 0.25)) { ix = -ix; iz = -iz; }
  return { P: [P[0], P[1]], Q: [Q[0], Q[1]], u: [ux, uz], n: [ix, iz] };
}
const barLen = (b) => Math.hypot(b.Q[0] - b.P[0], b.Q[1] - b.P[1]);
// the bar's solid (inset = pulled in from the outer face), and the band just outside its face (no slab may reach there)
const barRect = (b, inset = 0) => { const mx = (b.P[0] + b.Q[0]) / 2, mz = (b.P[1] + b.Q[1]) / 2, d = RIM_W - inset, off = inset + d / 2; return { c: [mx + b.n[0] * off, mz + b.n[1] * off], ax: [b.u, b.n], h: [barLen(b) / 2, d / 2] }; };
const bandRect = (b) => { const mx = (b.P[0] + b.Q[0]) / 2, mz = (b.P[1] + b.Q[1]) / 2; return { c: [mx - b.n[0] * 0.49, mz - b.n[1] * 0.49], ax: [b.u, b.n], h: [barLen(b) / 2, 0.51] }; };
const trimmed = (b, end, t) => (end ? { ...b, Q: [b.Q[0] - b.u[0] * t, b.Q[1] - b.u[1] * t] } : { ...b, P: [b.P[0] + b.u[0] * t, b.P[1] + b.u[1] * t] });
// least trim of bar b at `end` that makes bad(bar) false (binary search); null if even a 0.3 m stub is bad
function trimUntil(b, end, bad) {
  if (!bad(b)) return b;
  const L = barLen(b); if (L < 0.35 || bad(trimmed(b, end, L - 0.3))) return null;
  let lo = 0, hi = L - 0.3;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (bad(trimmed(b, end, m))) lo = m; else hi = m; }
  return trimmed(b, end, hi + 1e-4);
}
function rimBars(r) {
  let bars = [];
  for (const rr of boundaryRuns(r)) {
    const cum = [0]; for (let i = 1; i < rr.length; i++) cum.push(cum[i - 1] + Math.hypot(rr[i][0] - rr[i - 1][0], rr[i][1] - rr[i - 1][1]));
    const len = cum[cum.length - 1];
    if (len < 0.4) continue;
    const dev = (a, b) => { const P = rr[a], Q = rr[b], dx = Q[0] - P[0], dz = Q[1] - P[1], L = Math.hypot(dx, dz) || 1; let m = 0; for (let i = a; i <= b; i++) m = Math.max(m, Math.abs((rr[i][0] - P[0]) * dz - (rr[i][1] - P[1]) * dx) / L); return m; };
    for (let n = Math.max(1, Math.ceil(len / SEG_MAX)); ; n++) {
      const idx = [0];
      for (let k = 1; k < n; k++) { let i = idx[k - 1]; while (i < rr.length - 1 && cum[i] < (len * k) / n) i++; idx.push(i); }
      idx.push(rr.length - 1);
      let ok = true;
      for (let k = 0; k < n && ok; k++) if (idx[k + 1] <= idx[k] || dev(idx[k], idx[k + 1]) > SAG) ok = false;
      if (!ok && n < 400) continue;
      for (let k = 0; k < n; k++) if (idx[k + 1] > idx[k]) bars.push(mkBar(r, rr[idx[k]], rr[idx[k + 1]]));
      break;
    }
  }
  // keep inside the half (z ≤ 0: the mirror's bars are the twins), the back wall and the side bounds
  const out = (b) => corners(barRect(b)).some(([x, z]) => z > ZMID - 1e-4 || z < ZBACK - 1e-4 || x < -28 + 1e-4 || x > 28 - 1e-4);
  bars = bars.map((b) => { if (!out(b)) return b; const a = trimUntil(b, 0, out), c = trimUntil(b, 1, out); return a && c ? (barLen(a) >= barLen(c) ? a : c) : a || c; }).filter(Boolean);
  return bars;
}
// coping tops: bars that overlap at a convex joint alternate between 10 and 18 cm proud (so they may overlap instead of
// leaving a notch); where neither height is free the later bar gives way at the joint
const RIM_UP = [0.1, 0.19];
function seatRims(bars, obst, y) {
  const near = (a, b) => Math.hypot((a.P[0] + a.Q[0]) / 2 - (b.P[0] + b.Q[0]) / 2, (a.P[1] + a.Q[1]) / 2 - (b.P[1] + b.Q[1]) / 2) < (barLen(a) + barLen(b)) / 2 + 1.2;
  const hit = (a, b) => near(a, b) && pen(barRect(a), barRect(b)) > 3e-4;
  const OB = RIM_UP.map((u) => obst(y + u));
  const blocked = (b, k) => OB[k].some((t) => Math.hypot(t.c[0] - barRect(b).c[0], t.c[1] - barRect(b).c[1]) < rad0(t) + barLen(b) / 2 + 1 && pen(barRect(b), t) > 3e-4);
  const out = [];
  for (let b of bars) {
    for (let tries = 0; tries < 4 && b; tries++) {
      const k = [0, 1].find((k) => !blocked(b, k) && !out.some((o) => o.k === k && hit(o, b)));
      if (k !== undefined) { out.push({ ...b, k }); b = null; break; }
      // trim against the nearest same-height neighbour it hits
      const o = out.filter((o) => hit(o, b)).sort((p, q) => pen(barRect(q), barRect(b)) - pen(barRect(p), barRect(b)))[0];
      if (!o) { b = null; break; }
      let best = null;
      for (const ea of [0, 1]) for (const eb of [0, 1]) { const pa = ea ? o.Q : o.P, pb = eb ? b.Q : b.P, d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]); if (!best || d < best.d) best = { d, eb }; }
      b = trimUntil(b, best.eb, (x) => hit(o, x));
    }
  }
  return out;
}

// ---- slabs: greedy raster cover (see above). stand: shapes standing on this floor; obst(y): shapes topped at y.
// Slabs come in tiers (floor, 10 cm and 18 cm below it): a tier's slabs never overlap each other, slabs of different
// tiers may (the higher one hides the lower). The lower tiers are dearer, so they only fill in where the floor tier
// would need many small pieces.
const TIER_DN = [0, 0.1, 0.19], TIER_PREF = [1, 0.8, 0.72], LOWER_MAX = 5;   // m² of visible floor a lower slab may take
function laySlabs(L, r, bars, stand, obst, y, tiers = 1, designed = []) {
  const G = { x0: -28, z0: -46, rs: RS, nx: Math.round(56 / RS), nz: Math.round(46 / RS) }, N = G.nx * G.nz;
  const inR = new Uint8Array(N), rimIn = new Uint8Array(N), band = new Uint8Array(N), above = new Uint8Array(N);
  paintR(G, inR, r);
  const rIn = bars.map((b) => barRect(b, 0.02)), rBand = bars.map(bandRect);
  const T = TIER_DN.slice(0, tiers).map((dn) => ({ dn, OB: [...obst(y - dn), ...designed], occ: new Uint8Array(N), slabs: [] }));
  for (const s of rIn) paintO(G, rimIn, s);
  for (const s of rBand) paintO(G, band, s);
  for (const t of T) for (const s of t.OB) paintO(G, t.occ, s, 0.03);
  for (const s of stand) paintO(G, above, s);
  for (const b of bars) paintO(G, above, barRect(b));
  const req = new Uint8Array(N), geo = new Uint8Array(N), sure = new Uint8Array(N);
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (let k = 0; k < N; k++) geo[k] = rimIn[k] || (inR[k] && !band[k]) ? 1 : 0;
  // cells whose 5×5 neighbourhood is all inside (1) / all outside (2): no exact test needed there
  for (let j = 2; j < G.nz - 2; j++) for (let i = 2; i < G.nx - 2; i++) {
    let a = 0; for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) a += geo[(j + dj) * G.nx + i + di];
    sure[j * G.nx + i] = a === 25 ? 1 : a === 0 ? 2 : 0;
  }
  const ri0 = rIn, rb0 = rBand;
  const okAt = (x, z, ri = ri0, rb = rb0) => { const c = cellAt(G, sure, x, z); if (c === 1) return true; if (c === 2) return false; for (const t of ri) if (inO(t, x, z, 1e-6)) return true; if (!inside(r, x, z)) return false; for (const t of rb) if (inO(t, x, z, -1e-6)) return false; return true; };
  for (let k = 0; k < N; k++) {
    // the floor to lay: 3 where it shows; on the promenade level also 1 under whatever stands on it (the sea footprint)
    req[k] = geo[k] && !T[0].occ[k] && inR[k] ? (!above[k] ? 3 : L === 0 ? 1 : 0) : 0;
    if (geo[k]) { const i = k % G.nx, j = (k / G.nx) | 0; bx0 = Math.min(bx0, i); bx1 = Math.max(bx1, i); bz0 = Math.min(bz0, j); bz1 = Math.max(bz1, j); }
  }
  const box = [G.x0 + bx0 * RS - 0.2, G.x0 + (bx1 + 1) * RS + 0.2, G.z0 + bz0 * RS - 0.2, G.z0 + (bz1 + 1) * RS + 0.2];
  // exact tests
  const near = (s, list, pad) => list.filter((t) => Math.hypot(t.c[0] - s.c[0], t.c[1] - s.c[1]) < rad0(s) + rad0(t) + pad);
  const valid = (s, t) => {
    if (s.h[0] < 0.1 || s.h[1] < 0.1) return false;
    for (const o of near(s, [...t.slabs, ...t.OB], 0.01)) if (pen(s, o) > 3e-4) return false;
    const ri = near(s, rIn, 0.05), rb = near(s, rBand, 0.05), ok = (x, z) => okAt(x, z, ri, rb);
    const n0 = Math.max(1, Math.ceil((s.h[0] * 2) / 0.05)), n1 = Math.max(1, Math.ceil((s.h[1] * 2) / 0.05));
    for (let a = 0; a <= n0; a++) for (const b of [0, n1]) { const [x, z] = ptO(s, -s.h[0] + (2 * s.h[0] * a) / n0, -s.h[1] + (2 * s.h[1] * b) / n1); if (!ok(x, z)) return false; }
    for (let b = 1; b < n1; b++) for (const a of [0, n0]) { const [x, z] = ptO(s, -s.h[0] + (2 * s.h[0] * a) / n0, -s.h[1] + (2 * s.h[1] * b) / n1); if (!ok(x, z)) return false; }
    const m0 = Math.ceil((s.h[0] * 2) / 0.4), m1 = Math.ceil((s.h[1] * 2) / 0.4);
    for (let a = 1; a < m0; a++) for (let b = 1; b < m1; b++) { const [x, z] = ptO(s, -s.h[0] + (2 * s.h[0] * a) / m0, -s.h[1] + (2 * s.h[1] * b) / m1); if (!ok(x, z)) return false; }
    return true;
  };
  // move one side of s outward by e (side 0: +u, 1: −u, 2: +v, 3: −v)
  const grown = (s, side, e) => { const k = side >> 1, sg = side & 1 ? -1 : 1, h = [...s.h]; h[k] += e / 2; const c = [s.c[0] + s.ax[k][0] * sg * e / 2, s.c[1] + s.ax[k][1] * sg * e / 2]; return { ...s, c, h }; };
  const refine = (s, t) => {
    for (let i = 0; i < 12 && !valid(s, t); i++) s = { ...s, h: [s.h[0] - 0.01, s.h[1] - 0.01] };
    if (!valid(s, t)) return null;
    for (let round = 0; round < 2; round++) for (let side = 0; side < 4; side++) {
      if (!valid(grown(s, side, 0.002), t)) continue;
      let lo = 0.002, hi = 1.5;
      if (valid(grown(s, side, hi), t)) { s = grown(s, side, hi); continue; }
      for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (valid(grown(s, side, m), t)) lo = m; else hi = m; }
      s = grown(s, side, lo);
    }
    return s;
  };
  // directions: the level's coping chords, the axes, the incline (a rectangle at a and a + 90° is the same shape)
  const oris = [];
  for (const d of [0, 45, Math.atan2(incDir[0], incDir[1]) * DEG, ...bars.map((b) => Math.atan2(-b.u[1], b.u[0]) * DEG)]) { const m = ((d % 90) + 90) % 90; if (!oris.some((o) => Math.min(Math.abs(o - m), 90 - Math.abs(o - m)) < 1.5)) oris.push(m); }
  const F = [];
  for (const deg of oris) {
    const a = (deg * Math.PI) / 180, ex = [Math.cos(a), -Math.sin(a)], ez = [Math.sin(a), Math.cos(a)];
    const cs = [[box[0], box[2]], [box[1], box[2]], [box[1], box[3]], [box[0], box[3]]];
    const ps = cs.map(([x, z]) => x * ex[0] + z * ex[1]), qs = cs.map(([x, z]) => x * ez[0] + z * ez[1]);
    const p0 = Math.min(...ps), q0 = Math.min(...qs), NP = Math.ceil((Math.max(...ps) - p0) / RR), NQ = Math.ceil((Math.max(...qs) - q0) / RR);
    const free = T.map(() => new Uint8Array(NP * NQ)), unc = new Uint8Array(NP * NQ);
    const W = (p, q) => [p * ex[0] + q * ez[0], p * ex[1] + q * ez[1]];
    for (let j = 0; j < NQ; j++) for (let i = 0; i < NP; i++) {
      const p = p0 + (i + 0.5) * RR, q = q0 + (j + 0.5) * RR, [x, z] = W(p, q);
      if (!cellAt(G, geo, x, z)) continue;
      const pts = [[x, z]]; for (const [dp, dq] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) pts.push(W(p + dp * RR * 0.98, q + dq * RR * 0.98));
      if (pts.every(([xx, zz]) => cellAt(G, geo, xx, zz))) T.forEach((t, ti) => { free[ti][j * NP + i] = pts.every(([xx, zz]) => !cellAt(G, t.occ, xx, zz)) ? 1 : 0; });
      unc[j * NP + i] = cellAt(G, req, x, z);
    }
    F.push({ deg, ex, ez, p0, q0, NP, NQ, free, unc, W, pref: deg === 0 ? 1.12 : 1, S: new Int32Array((NP + 1) * (NQ + 1)), V: new Int32Array((NP + 1) * (NQ + 1)), hgt: new Int32Array(NP + 1), stk: new Int32Array(NP + 2) });
  }
  const mark = (s, ti, g) => {
    for (const f of F) {
      const cs = corners(s), ps = cs.map(([x, z]) => x * f.ex[0] + z * f.ex[1]), qs = cs.map(([x, z]) => x * f.ez[0] + z * f.ez[1]);
      const i0 = Math.max(0, Math.floor((Math.min(...ps) - g - f.p0) / RR)), i1 = Math.min(f.NP - 1, Math.ceil((Math.max(...ps) + g - f.p0) / RR));
      const j0 = Math.max(0, Math.floor((Math.min(...qs) - g - f.q0) / RR)), j1 = Math.min(f.NQ - 1, Math.ceil((Math.max(...qs) + g - f.q0) / RR));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const [x, z] = f.W(f.p0 + (i + 0.5) * RR, f.q0 + (j + 0.5) * RR);
        if (inO(s, x, z, g)) f.free[ti][j * f.NP + i] = 0;
        if (inO(s, x, z, 0)) f.unc[j * f.NP + i] = 0;
      }
    }
  };
  for (let step = 0; step < 400; step++) {
    let best = null;
    for (const f of F) {
      const { NP, NQ, unc, S, V, hgt, stk } = f, W1 = NP + 1;
      for (let j = 0; j < NQ; j++) { let row = 0, rv = 0; for (let i = 0; i < NP; i++) { const u = unc[j * NP + i]; row += u; rv += u === 3 ? 1 : 0; S[(j + 1) * W1 + i + 1] = S[j * W1 + i + 1] + row; V[(j + 1) * W1 + i + 1] = V[j * W1 + i + 1] + rv; } }
      for (let ti = 0; ti < T.length; ti++) {
        const free = f.free[ti], pref = f.pref * TIER_PREF[ti];
        hgt.fill(0);
        for (let j = 0; j < NQ; j++) {
          for (let i = 0; i < NP; i++) hgt[i] = free[j * NP + i] ? hgt[i] + 1 : 0;
          let sp = 0;
          for (let i = 0; i <= NP; i++) {
            const h = i < NP ? hgt[i] : 0;
            while (sp > 0 && hgt[stk[sp - 1]] >= h) {
              const H = hgt[stk[--sp]], l = sp > 0 ? stk[sp - 1] + 1 : 0, rr = i - 1;
              if (H >= 3 && rr - l + 1 >= 3) {
                const j0 = j - H + 1, w = S[(j + 1) * W1 + rr + 1] - S[j0 * W1 + rr + 1] - S[(j + 1) * W1 + l] + S[j0 * W1 + l];
                const sc = w * pref + H * (rr - l + 1) * 1e-4;
                if ((!best || sc > best.sc) && (ti === 0 || (V[(j + 1) * W1 + rr + 1] - V[j0 * W1 + rr + 1] - V[(j + 1) * W1 + l] + V[j0 * W1 + l]) * RR * RR <= LOWER_MAX)) best = { sc, w, f, ti, l, rr, j, H };
              }
            }
            stk[sp++] = i;
          }
        }
      }
    }
    if (!best || (best.w / 3) * RR * RR < MIN_SLAB) break;
    const { f, ti, l, rr, j, H } = best;
    const pc = f.p0 + ((l + rr + 1) / 2) * RR, qc = f.q0 + ((2 * j - H + 2) / 2) * RR, [cx, cz] = f.W(pc, qc);
    const s = refine({ ...orect(cx, cz, (rr - l + 1) * RR, H * RR, f.deg) }, T[ti]);
    if (!s) { for (let jj = j - H + 1; jj <= j; jj++) for (let i = l; i <= rr; i++) f.free[ti][jj * f.NP + i] = 0; continue; }
    T[ti].slabs.push(s);
    mark(s, ti, 0.071);
  }
  const slabs = T.flatMap((t, ti) => t.slabs.map((s) => ({ ...s, tier: ti })));
  return { slabs, rIn, rBand, okAt, dirs: oris };
}

// ---- gutters: cover the bare floor the slabs left (0.025 m raster), each patch with its tightest turned rectangle
function layGutters(L, r, bars, stand, obst, y, slabs, rIn, rBand, okAt, dirs, designed = []) {
  const out = [];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const s of [...slabs, ...rIn]) for (const [x, z] of corners(s)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const rs = 0.025, G = { x0: x0 - 0.3, z0: z0 - 0.3, rs, nx: Math.ceil((x1 - x0 + 0.6) / rs), nz: Math.ceil((z1 - z0 + 0.6) / rs) }, N = G.nx * G.nz;
  const inR = new Uint8Array(N), cov = new Uint8Array(N), band = new Uint8Array(N), occ = new Uint8Array(N), rimIn = new Uint8Array(N);
  paintR(G, inR, r);
  for (const s of rBand) paintO(G, band, s);
  for (const s of rIn) paintO(G, rimIn, s);
  for (const s of slabs) paintO(G, cov, s);
  const OB = [...obst(y), ...designed];
  for (const s of OB) paintO(G, occ, s);
  for (const s of stand) paintO(G, cov, s);
  for (const b of bars) paintO(G, cov, barRect(b));
  const bare = new Uint8Array(N);
  // (the hills end under the incline's service stair: slivers along that clip line are hidden by it)
  const underStair = (x, z) => { const o = (x - INC.top[0]) * incN[0] + (z - INC.top[2]) * incN[1]; return o > INC.w / 2 - 0.8 - 0.05 && o < INC.w / 2 + 0.1; };
  // (the promenade under the incline itself is hidden by it)
  const underIncline = (x, z) => { const o = (x - INC.top[0]) * incN[0] + (z - INC.top[2]) * incN[1], t = ((x - INC.top[0]) * incDir[0] + (z - INC.top[2]) * incDir[1]) / incDir[2]; return o > -INC.w / 2 - 0.35 && o < INC.w / 2 + 0.1 && t < 0.97; };
  for (let k = 0; k < N; k++) bare[k] = inR[k] && !band[k] && !cov[k] && !occ[k] && !(L > 0 ? underStair : underIncline)(G.x0 + ((k % G.nx) + 0.5) * rs, G.z0 + (((k / G.nx) | 0) + 0.5) * rs) ? 1 : 0;
  // patches (8-connected)
  const seen = new Uint8Array(N), q = new Int32Array(N);
  const ok = (x, z) => okAt(x, z);
  // tightest turned rectangle round a patch: try every hull edge direction (the optimum has a side on one) + the level's
  const hull = (P) => { const p = [...P].sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p; const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = []; for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (const q of p.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); } return lo.slice(0, -1).concat(up.slice(0, -1)); };
  const fitRect = (pts) => {
    const hp = hull(pts), degs = [...dirs];
    for (let i = 0; i < hp.length; i++) { const a = hp[i], b = hp[(i + 1) % hp.length]; degs.push(Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * DEG); }
    let best = null;
    for (const deg of degs) {
      const a = (deg * Math.PI) / 180, ex = [Math.cos(a), -Math.sin(a)], ez = [Math.sin(a), Math.cos(a)];
      let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
      for (const [x, z] of hp) { const p = x * ex[0] + z * ex[1], qq = x * ez[0] + z * ez[1]; p0 = Math.min(p0, p); p1 = Math.max(p1, p); q0 = Math.min(q0, qq); q1 = Math.max(q1, qq); }
      const g = rs / 2 + 0.03, A = (p1 - p0 + 2 * g) * (q1 - q0 + 2 * g);
      if (!best || A < best.A - 1e-9) { const pc = (p0 + p1) / 2, qc = (q0 + q1) / 2; best = { A, s: orect(pc * ex[0] + qc * ez[0], pc * ex[1] + qc * ez[1], p1 - p0 + 2 * g, q1 - q0 + 2 * g, deg) }; }
    }
    return best.s;
  };
  const inside2 = (s) => {
    const n0 = Math.max(1, Math.ceil((s.h[0] * 2) / 0.04)), n1 = Math.max(1, Math.ceil((s.h[1] * 2) / 0.04));
    for (let a = 0; a <= n0; a++) for (let b = 0; b <= n1; b += a === 0 || a === n0 ? 1 : n1) { const [x, z] = ptO(s, -s.h[0] + (2 * s.h[0] * a) / n0, -s.h[1] + (2 * s.h[1] * b) / n1); if (!ok(x, z)) return false; }
    return true;
  };
  // pull in only the sides that poke out (a patch along a clip line keeps its length)
  const firstOut = (s) => {
    const n0 = Math.max(1, Math.ceil((s.h[0] * 2) / 0.04)), n1 = Math.max(1, Math.ceil((s.h[1] * 2) / 0.04));
    for (let a = 0; a <= n0; a++) for (let b = 0; b <= n1; b += a === 0 || a === n0 ? 1 : n1) { const u = -s.h[0] + (2 * s.h[0] * a) / n0, v = -s.h[1] + (2 * s.h[1] * b) / n1, [x, z] = ptO(s, u, v); if (!ok(x, z)) return [u, v]; }
    return null;
  };
  const fits = (s) => {
    for (let i = 0; i < 16; i++) {
      const o = firstOut(s); if (!o) return s;
      const k = Math.abs(o[0]) / s.h[0] >= Math.abs(o[1]) / s.h[1] ? 0 : 1, side = k * 2 + (o[k] < 0 ? 1 : 0);
      s = grown(s, side, -0.01);
      if (s.h[0] < 0.015 || s.h[1] < 0.015) return null;
    }
    return null;
  };
  const grown = (s, side, e) => { const k = side >> 1, sg = side & 1 ? -1 : 1, h = [...s.h]; h[k] += e / 2; const c = [s.c[0] + s.ax[k][0] * sg * e / 2, s.c[1] + s.ax[k][1] * sg * e / 2]; return { ...s, c, h }; };
  const tierFor = (s) => [0, 1].find((tier) => ![...out.filter((o) => o.tier === tier), ...slabs.filter((o) => o.tier === tier + 1), ...obst(y - GUT[tier]), ...designed.filter((o) => Math.abs(o.y1 - (y - GUT[tier])) < 0.085)].some((t) => Math.hypot(t.c[0] - s.c[0], t.c[1] - s.c[1]) < rad0(s) + rad0(t) + 0.01 && pen(s, t) > 3e-4));
  const place = (pts, depth = 0) => {
    const s = fits(fitRect(pts)), tier = s ? tierFor(s) : undefined;
    if (s && tier !== undefined) { out.push({ ...s, tier }); return true; }
    if (pts.length < 6 || depth > 6) { if (pts.length > 12) console.warn('terraces ground: unfilled patch', L, pts.length, pts[0]); return false; }
    // split along the long axis
    const t = fitRect(pts), ax = t.h[0] >= t.h[1] ? t.ax[0] : t.ax[1], ps = pts.map(([x, z]) => x * ax[0] + z * ax[1]), mid = [...ps].sort((a, b) => a - b)[ps.length >> 1];
    place(pts.filter((_, i) => ps[i] < mid), depth + 1); place(pts.filter((_, i) => ps[i] >= mid), depth + 1);
    return true;
  };
  const patches = [];
  for (let k = 0; k < N; k++) {
    if (!bare[k] || seen[k]) continue;
    let h = 0, t = 0; q[t++] = k; seen[k] = 1; const pts = [];
    while (h < t) {
      const c = q[h++], i = c % G.nx, j = (c / G.nx) | 0; pts.push([G.x0 + (i + 0.5) * rs, G.z0 + (j + 0.5) * rs]);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= G.nx || jj >= G.nz) continue; const kk = jj * G.nx + ii; if (bare[kk] && !seen[kk]) { seen[kk] = 1; q[t++] = kk; } }
    }
    if (pts.length >= 3) { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } patches.push({ pts, bb: [x0, x1, z0, z1] }); }
  }
  // cluster neighbouring patches under one gutter while its rectangle still fits (the slabs hide the parts between)
  patches.sort((a, b) => b.pts.length - a.pts.length);
  const used = new Array(patches.length).fill(false);
  for (let i = 0; i < patches.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let pts = patches[i].pts, bb = [...patches[i].bb], s = fits(fitRect(pts)), tier = s ? tierFor(s) : undefined;
    if (!s || tier === undefined) { place(pts); continue; }
    for (;;) {
      let bestJ = -1, bestD = 2.5;
      for (let j = 0; j < patches.length; j++) { if (used[j]) continue; const b = patches[j].bb, d = Math.max(0, b[0] - bb[1], bb[0] - b[1]) + Math.max(0, b[2] - bb[3], bb[2] - b[3]); if (d < bestD) { bestD = d; bestJ = j; } }
      if (bestJ < 0) break;
      const P2 = pts.concat(patches[bestJ].pts), s2 = fits(fitRect(P2)), t2 = s2 ? tierFor(s2) : undefined;
      if (!s2 || t2 === undefined || s2.h[0] * s2.h[1] * 4 > (s.h[0] * s.h[1] * 4 + patches[bestJ].pts.length * rs * rs) * 3 + 2) { used[bestJ] = 'skip'; continue; }
      used[bestJ] = true; pts = P2; s = s2; tier = t2; const b = patches[bestJ].bb; bb = [Math.min(bb[0], b[0]), Math.max(bb[1], b[1]), Math.min(bb[2], b[2]), Math.max(bb[3], b[3])];
    }
    for (let j = 0; j < used.length; j++) if (used[j] === 'skip') used[j] = false;
    out.push({ ...s, tier });
  }
  return out;
}

function generateGround(features) {
  const REG = [R0, R1, R2, R3, R4], LY = [H0, H1, H2, H3, H4];
  const FEAT = features.map(shapeOf).filter(Boolean);
  const laid = [];                    // ground shapes so far (with y0/y1)
  const out = [];
  for (let L = 4; L >= 0; L--) {
    const r = REG[L], y = LY[L];
    const all = () => [...FEAT, ...laid];
    const stand = all().filter((s) => s.y0 <= y + 0.01 && s.y1 >= y + 0.08);
    const obst = (yy) => all().filter((s) => Math.abs(s.y1 - yy) < 0.085 && s.y0 < yy - 1e-3);
    const bars = seatRims(rimBars(r), obst, y);
    const t0 = Date.now();
    // designed floor pieces set a little below this level (the bastion prow, the Largo sun): nothing is laid over them
    const designed = FEAT.filter((s) => s.y1 >= y - 0.19 && s.y1 <= y + 0.01 && s.y0 < y - 1e-3);
    const { slabs, rIn, rBand, okAt, dirs } = laySlabs(L, r, bars, stand, obst, y, 3, designed);
    const t1 = Date.now();
    const guts = layGutters(L, r, bars, stand, obst, y, slabs, rIn, rBand, okAt, dirs, designed);
    if (globalThis.__TERRACES_LOG) console.log(`level ${L}: ${bars.length} rims, ${slabs.length} slabs (${t1 - t0} ms), ${guts.length} gutters (${Date.now() - t1} ms)`);
    for (const b of bars) {
      const s = barRect(b), deg = Math.atan2(-b.u[1], b.u[0]) * DEG;
      laid.push({ ...s, y0: FL, y1: y + RIM_UP[b.k] });
      const np = L === 4 && inside(wedge, s.c[0], s.c[1]);
      out.push(O(s.c[0], s.c[1], barLen(b), RIM_W, FL, y + RIM_UP[b.k], deg, { ...RIM_MAT, tag: 'rim-' + L + '-' + b.k, ...(np ? { noPaint: NO_SIDES } : {}) }));
    }
    for (const s of slabs) { const yt = y - TIER_DN[s.tier]; laid.push({ ...s, y0: FL, y1: yt }); out.push(O(s.c[0], s.c[1], s.h[0] * 2, s.h[1] * 2, FL, yt, s.deg, { ...STRIP_MAT[L], tag: 'ground-' + L + '-' + s.tier })); }
    for (const s of guts) { laid.push({ ...s, y0: FL, y1: y - GUT[s.tier] }); out.push(O(s.c[0], s.c[1], s.h[0] * 2, s.h[1] * 2, FL, y - GUT[s.tier], s.deg, { ...GUT_MAT, tag: 'gutter-' + L + '-' + s.tier })); }
  }
  return out;
}
// The ground is generated once by the builder above and baked into GROUND_DATA below (the builder takes a while,
// which would otherwise run at every game boot). Regenerate after editing the regions or the features with
//   node $S/maps/terraces/tools/bake-ground.mjs   (sets globalThis.__TERRACES_REGEN and rewrites the table)
// Rows: [0, level, cx, cz, w, d, rotY°, tier] = a slab (FL → level height − TIER_DN[tier]) · [1, level, cx, cz, length, rotY°, noPaint, k] = a
// rim (RIM_W deep, RIM_UP[k] proud) · [2, level, cx, cz, w, d, rotY°, tier] = a pebble gutter (10 / 18 cm below the floor)
const LEVEL_Y = [H0, H1, H2, H3, H4];
const STRIP_MAT = [pebble({ color: TH.pebble }), pebble(), pebble(), cotto(), cotto()], RIM_MAT = cotto({ color: TH.rim }), GUT_MAT = pebble({ color: TH.pebble });
const NO_SIDES = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
function unbake(rows) {
  return rows.map((r) => (r[0] === 0 ? O(r[2], r[3], r[4], r[5], FL, LEVEL_Y[r[1]] - TIER_DN[r[7]], r[6], { ...STRIP_MAT[r[1]], tag: 'ground-' + r[1] + '-' + r[7] })
    : r[0] === 1 ? O(r[2], r[3], r[4], RIM_W, FL, LEVEL_Y[r[1]] + RIM_UP[r[7]], r[5], { ...RIM_MAT, tag: 'rim-' + r[1] + '-' + r[7], ...(r[6] ? { noPaint: NO_SIDES } : {}) })
    : O(r[2], r[3], r[4], r[5], FL, LEVEL_Y[r[1]] - GUT[r[7]], r[6], { ...GUT_MAT, tag: 'gutter-' + r[1] + '-' + r[7] })));
}
export function bakeGround(list) {
  const q = (v) => +v.toFixed(4);
  return list.map((d) => {
    const t = d.tag.split('-'), lv = +t[1];
    if (t[0] === 'rim') return [1, lv, q(d.center[0]), q(d.center[2]), q(d.size[0]), q(d.rotY), d.noPaint ? 1 : 0, +t[2]];
    if (t[0] === 'ground') return [0, lv, q(d.center[0]), q(d.center[2]), q(d.size[0]), q(d.size[2]), q(d.rotY), +t[2]];
    return [2, lv, q(d.center[0]), q(d.center[2]), q(d.size[0]), q(d.size[2]), q(d.rotY), +t[2]];
  });
}
/*GROUND_DATA*/const GROUND_DATA = [
  [1,4,-5.4882,-39.429,3.883,-55.7784,0,0], [1,4,-4.1978,-36.0708,3.883,-82.1856,0,1], [1,4,-4.5357,-32.489,3.883,-108.5928,0,0], [1,4,-6.3988,-29.4512,3.8051,-134.7305,1,1], [1,4,-9.4189,-27.5597,3.883,-160.8683,1,0], [1,4,-12.9617,-27.1745,3.8051,172.994,1,1],
  [1,4,-4.8,-43.3106,4.0212,-90,0,0], [1,4,-5.32,-41.7,1.84,-180,0,1], [1,4,-22.4,-41.7,1.44,-180,0,0], [1,4,-20.1062,-42.0667,3.68,12.1957,0,1], [1,4,-17.7317,-41.7782,0.72,-77.8043,0,0], [1,4,-17.081,-38.7677,4.8,-77.8043,0,0],
  [1,4,-16.067,-34.0761,4.8,-77.8043,0,0], [1,4,-15.0614,-29.4235,4.72,-77.8043,0,0], [0,4,-10.8252,-37.25,9.123,16.24,0,0], [0,4,-19.3582,-43.76,7.9436,3.2799,0,0], [0,4,-5.4634,-34.9055,1.6013,7.9711,0,0], [0,4,-11.693,-28.3301,6.6958,1.6002,0,0],
  [0,4,-16.0566,-38.7251,1.3403,6.7902,0,0], [0,4,-11.2376,-42.1685,13.077,3.7858,12.1957,1], [0,4,-10.5517,-35.279,12.0498,7.0163,12.1957,1], [0,4,-23.2185,-43.3548,0.74,4.0249,12.1957,1], [0,4,-8.5699,-29.6584,6.4459,2.58,34.2216,1], [2,4,-6.2053,-45.325,0.16,0.11,0,0],
  [2,4,-6.2053,-45.2375,0.16,0.185,0,1], [2,4,-5.9803,-45.275,0.21,0.16,0,1], [2,4,-5.8678,-45.3375,0.135,0.085,0,0], [2,4,-5.7803,-45.3125,0.16,0.135,0,1], [2,4,-11.7053,-27.45,1.51,0.21,0,1], [2,4,-5.1928,-45.3125,0.135,0.135,0,1],
  [2,4,-17.8087,-41.0927,0.139,0.1474,-56.3099,0], [2,4,-17.8571,-41.0649,0.1021,0.1085,-63.4349,1], [2,4,-17.7295,-41.1884,0.0941,0.1066,-71.5651,1], [2,4,-17.9178,-41.3625,0.135,0.085,0,0], [2,4,-17.8553,-41.3625,0.11,0.085,0,1], [2,4,-22.0928,-42.1125,0.685,0.085,0,0],
  [2,4,-18.0228,-42.0875,0.295,0.135,0,1], [2,4,-7.8851,-28.5385,0.3207,0.1197,33.6901,1], [1,3,-7.7926,-28.3537,3.9608,-147.6647,0,0], [1,3,-11.2235,-27.1631,3.883,-174.3413,0,1], [1,3,-15.5938,-31.8866,6.72,-77.8043,0,0], [1,3,-14.1826,-25.3574,6.64,-77.8043,0,0],
  [1,3,-1.9923,-26.5913,1.7576,-130.0377,0,0], [1,3,-2.4425,-43.7832,3.5869,-47.4175,0,0], [1,3,-0.4799,-40.9928,3.5077,-62.5165,0,1], [1,3,1.8905,-38.2707,3.5508,-35.4012,0,0], [1,3,3.8917,-35.7771,3.5508,-67.1037,0,1], [1,3,4.2999,-32.638,3.4739,-98.454,0,0],
  [1,3,2.9964,-29.7532,3.5508,-129.8043,0,1], [1,3,0.394,-27.9507,3.4739,-161.1546,0,0], [1,3,-3.8191,-27.6357,4.88,-44.0754,0,1], [1,3,-13.9127,-24.3664,4.5418,81.9246,0,1], [1,3,-19.2242,-34.9565,4.96,12.1957,0,0], [1,3,-15.5938,-31.8866,6.72,-77.8043,0,1],
  [0,3,-3.6911,-36.2045,9.8825,15.5101,32.3353,0], [0,3,-17.4644,-39.7285,10.4564,9.345,12.1957,0], [0,3,0.3603,-28.8809,8.3175,1.2002,32.3353,0], [0,3,2.8894,-36.0757,1.1002,5.707,32.3353,0], [0,3,-9.3773,-37.25,12.0146,16.26,0,1], [2,3,-13.6855,-26.7239,0.902,0.4371,-178.2643,0],
  [2,3,1.5744,-28.8434,1.1741,0.2461,32.4712,0], [2,3,0.7219,-38.8739,0.5998,1.4417,28.6105,0], [2,3,-1.552,-42.1264,1.0974,0.1506,122.2756,0], [2,3,3.7752,-32.3987,2.1074,0.2481,-98.455,0], [2,3,-1.2091,-27.145,0.1633,0.1297,-153.4349,0], [2,3,-1.1866,-27.1,0.11,0.11,0,1],
  [2,3,-5.7741,-29.0875,0.035,0.135,0,1], [1,2,-13.9038,-24.0672,6.72,-77.8043,0,0], [1,2,-12.4926,-17.5379,6.64,-77.8043,0,0], [1,2,-13.9038,-24.0672,6.72,-77.8043,0,1], [1,2,-12.4926,-17.5379,6.64,-77.8043,0,1], [1,2,-4.386,-18.1316,3.752,-155.7066,0,0],
  [1,2,-7.7716,-16.9744,3.5928,-166.7984,0,1], [1,2,4.8431,-42.2009,6.5242,-66.852,0,0], [1,2,6.2949,-36.1564,6.3666,-86.3831,0,1], [1,2,7.56,-31.4482,3.171,-52.0364,0,0], [1,2,8.7813,-28.7727,3.2488,-78.5455,0,1], [1,2,8.7159,-25.8661,3.093,-104.7273,0,0],
  [1,2,7.3744,-23.3248,3.171,-130.5818,0,1], [1,2,9.5292,-19.9987,6.6946,-25.4774,0,0], [1,2,11.0189,-17.0515,3.1562,-124,0,0], [1,2,-10.5135,-15.8657,2.2273,35.228,0,0], [1,2,-0.2636,-18.9594,4.5478,0.7965,0,1], [1,2,4.3209,-18.4624,4.5478,-13.1722,0,0],
  [1,2,8.2806,-17.0671,3.7157,-27.0184,0,0], [1,2,-17.5492,-27.2065,4.96,12.1957,0,0], [0,2,-3.8957,-31.15,19.8697,18.44,0,0], [0,2,0.8973,-20.2655,11.4169,3.3103,0,0], [0,2,-18.7923,-35.8896,6.2386,18.1116,12.1957,0], [0,2,-6.3376,-42.9,20.477,5,0,0],
  [0,2,-10.7252,-19.1751,3.8292,5.5103,0,0], [0,2,7.1879,-27.4673,2.2982,7.2055,0,0], [0,2,9.0566,-18.4776,3.0742,4.7852,75.2727,0], [0,2,-7.3835,-17.4376,2.8548,0.8551,0,0], [0,2,-4.58,-32.4786,22.5406,18.9612,12.1957,1], [0,2,6.2188,-19.9405,3.5858,11.6,62.9816,1],
  [0,2,-11.8239,-18.2779,2.3799,5.739,12.1957,1], [0,2,-5.7076,-29.0692,10.9793,28.08,64.5226,2], [2,2,-6.7542,-21.9,3.96,0.11,0,1], [2,2,-4.5792,-18.4875,0.51,0.285,0,0], [2,2,12.0792,-18.3069,0.1959,0.3894,-123.6901,1], [2,2,8.3958,-28.625,0.16,0.51,0,0],
  [2,2,7.2604,-31.1317,0.2451,0.1436,-51.3402,1], [2,2,6.5858,-21.85,0.04,0.16,0,1], [2,2,6.8508,-32.935,0.07,0.13,0,1], [2,2,6.5008,-21.9475,0.1409,0.1521,63.4349,0], [2,2,-11.5667,-15.3625,0.135,0.135,0,1], [2,2,-9.5042,-16.3875,0.11,0.135,0,0],
  [1,1,-12.3659,-16.9515,5.44,-77.8043,0,0], [1,1,-12.3659,-16.9515,5.44,-77.8043,0,1], [1,1,-3.0198,-18.7154,0.7196,-151.1253,0,0], [1,1,-9.1353,-16.6254,0.7196,-171.1386,0,0], [1,1,-10.5135,-15.8657,2.2273,35.228,0,1], [1,1,0.5039,-18.8468,6.052,-1.5317,0,1],
  [1,1,8.6158,-16.8961,4.4684,-27.0184,0,0], [1,1,9.6684,-42.467,5.824,-70.9859,0,0], [1,1,10.8392,-36.909,5.824,-85.2221,0,1], [1,1,10.6185,-31.2714,5.7446,-99.3608,0,0], [1,1,11.5203,-26.6843,3.7149,-46.9831,0,0], [1,1,13.1525,-23.7005,3.7149,-75.661,0,1],
  [1,1,13.1525,-20.2995,3.7149,-104.339,0,0], [1,1,11.5524,-17.3358,3.6374,-132.7119,0,1], [1,1,-7.451,-14.8654,3.5964,118,0,0], [1,1,-3.2765,-16.2783,3.6,-80,0,0], [1,1,-4.92,-14.1965,4.5396,19.1144,0,1], [1,1,4.0252,-14.6135,2.2367,-15.3998,0,0],
  [1,1,3.583,-16.3365,3.84,79,0,1], [1,1,5.3427,-15.8485,3.84,-110,0,1], [1,1,-15.8742,-19.4565,4.96,12.1957,0,0], [0,1,-4.6475,-32.2865,29.542,23.8,4.7779,0], [0,1,12.0566,-21.999,1.9868,7.2021,0,0], [0,1,-5.5091,-17.2048,4.1539,5.7896,0,0],
  [0,1,10.2317,-36.8504,0.8737,10.1974,4.7779,0], [0,1,4.5065,-18,1.878,5.96,0,0], [0,1,7.4402,-22.5331,7.7334,9.8738,0,1], [0,1,-9.7222,-32.0776,22.3588,22.4275,12.1957,1], [0,1,5.8889,-36.45,6.369,17.9,0,1], [0,1,5.4038,-22.4929,15.048,4.88,12.1957,2],
  [2,1,-6.2807,-14.175,0.885,0.31,0,0], [2,1,-7.7432,-16.3,0.36,0.66,0,0], [2,1,4.3443,-14.95,0.585,0.21,0,0], [2,1,-3.3083,-18.1802,0.3869,0.0733,26.5651,0], [2,1,-8.4806,-16.3594,0.3045,0.1517,14.0362,0], [2,1,5.5068,-17.4875,0.16,0.285,0,1],
  [2,1,10.2568,-31.5875,0.11,0.335,0,0], [2,1,9.3943,-42,0.135,0.26,0,0], [2,1,6.278,-17.5985,0.2368,0.0745,-18.4349,1], [2,1,10.4993,-28.3175,0.045,0.095,0,0], [1,0,11.2057,-42.7676,5.5758,-57.45,0,0], [1,0,14.1843,-38.1012,5.4962,-57.45,0,0],
  [1,0,15.6,-33.5802,4.8397,-90,0,1], [1,0,15.6,-28.7802,4.7603,-90,0,0], [1,0,17.704,-23.9309,5.9464,-47.7263,0,0], [1,0,19.6,-18.5,7,-90,0,1], [1,0,18.303,-13.8687,3.9998,-135,0,0], [1,0,15.503,-11.0687,3.9198,-135,0,0],
  [1,0,14,-7.8068,3.1864,-90,0,0], [1,0,-14,-5.28,2.88,90,0,0], [1,0,-15.9395,-7.2,2.9211,-180,0,0], [1,0,-18.9128,-8.0535,3.8471,152.1027,0,1], [1,0,-20.5882,-9.5804,1.8396,101.3099,0,0], [1,0,16.65,-5.8,4.5,0,0,0],
  [1,0,19.8812,-4.6531,3.5753,-45,0,1], [1,0,22.3812,-2.1531,3.4958,-45,0,0], [1,0,23.0273,-0.893,1.6685,-135,0,1], [1,0,-20.2342,-1.9001,4.5738,45,0,0], [1,0,-16.6895,-3.4,4.4211,0,0,1], [0,0,-20.7809,-26.7968,5.1094,36.9612,12.1957,0],
  [0,0,-5.3485,-41.95,30.6969,6.9,0,0], [0,0,16.6855,-18.55,4.6114,9.06,0,0], [0,0,15.1799,-29.5398,1.6002,12.9202,0,0], [0,0,11.1433,-40.0899,2.2871,3.3802,0,0], [0,0,15.5357,-12.8701,2.3119,2.3002,0,0], [0,0,-15.8899,-7.7202,3.0201,1.8005,0,0],
  [0,0,13.1452,-38.7449,1.7173,0.6903,0,0], [0,0,-17.7863,-31.005,6.8132,28.79,0,1], [0,0,-16.2463,-11.9051,3.7331,9.4103,0,1], [0,0,17.1799,-18.5,5.6002,6.9998,0,1], [0,0,11.1968,-41.8999,1.7087,7.2141,32.55,1], [0,0,-24.1863,-44.8556,5.9874,1.0886,0,1],
  [0,0,16.5159,-24.1968,2.1605,3.9748,42.2737,1], [0,0,16.6895,-12.6906,5.1572,1.3757,45,1], [0,0,-19.4509,-9.5135,2.6769,1.7929,0,1], [0,0,14.7357,-23.7529,0.7119,27.2658,0,2], [0,0,-7.8741,-41.8,36.1083,6.56,0,2], [0,0,-17.5851,-10.6348,6.5648,3.7783,62.1027,2],
  [2,0,16.868,-13.85,0.41,0.41,0,1], [2,0,16.018,-23.125,0.16,0.16,0,1],
];/*END_GROUND_DATA*/
// San Vito on its sagrato (a 1.2 m limestone platform: cover walls on the long sides, church steps at both ends).
// Zone Control (src/world/variants.js) builds the centre zone differently: the chapel block is gone — San Vito is opened
// up into a tempietto (eight columns under the majolica dome, props.js terraces_tempietto: only its slender columns
// stand on the platform, the dome above is off-limits) — and the sagrato is 2 m deeper (16 x 12), so the whole platform
// is one open, inkable zone instead of a thin ring round an un-inkable box.
const SAGRATO = { tag: 'sagrato', color: '#e6dccb', pattern: PATTERN.pavers };
const SINGLE = [
  B(-8, 8, H0, H1, -5, 5, { ...SAGRATO, mural: [{ n: [0, 1, 0], id: MURAL.sagrato }, { n: [0, 0, 1], id: MURAL.frieze }, { n: [0, 0, -1], id: MURAL.frieze }], notIn: 'zones' }),
  B(-8, 8, H0, H1, -6, 6, { ...SAGRATO, mural: [{ n: [0, 1, 0], id: MURAL.sagratoZ }, { n: [0, 0, 1], id: MURAL.frieze }, { n: [0, 0, -1], id: MURAL.frieze }], onlyIn: 'zones' }),
  R([11.1, H0, 0], [8, H1, 0], 6, stair({ tag: 'sagrato-steps' })),
  R([-11.1, H0, 0], [-8, H1, 0], 6, stair({ tag: 'sagrato-steps' })),
  B(-5.5, 5.5, H1, 5.8, -3, 3, upper(TH.white, { tag: 'chapel', notIn: 'zones' })),
];
const EXTRA = [
  // belvedere bastion floors (pebble, compass rose) — one each side of the piazza, mirrored as a pair
  // the piazza's floor, running on under the crescent and the hill (the rest of the promenade level — the east
  // promenade, the headland, the funicular landing, the back — is laid by the ground builder round it)
  B(-14.38, 14.38, FL, H0, -38.4, 0, pebble({ tag: 'piazza', color: TH.pebble })),
  // (flanks level with the piazza; the prow a step down, the pebble compass rose on it)
  B(14.38, BELV[0], FL, H0, BELV[1] - BELV_D, BELV[1] + BELV_D, pebble({ tag: 'belvedere', color: TH.pebble })),   // (flush with the piazza slab, which stops 2 cm short of the sea wall)
  O(BELV[0], BELV[1], BELV_D * Math.SQRT2, BELV_D * Math.SQRT2, FL, H0 - 0.1, 45, pebble({ tag: 'belvedere-prow', color: TH.pebble, mural: [{ n: [0, 1, 0], id: MURAL.rose }] })),
  // back walls
  B(-26.8, -19.6, FL, 7.6, -46, -45.4, upper(TH.station, { tag: 'station-back' })),
  B(-19.6, -4.4, FL, 8.4, -46, -45.4, upper(TH.villa, { tag: 'villa-facade' })),
  B(-4.4, 8.5, FL, 5.0, -46, -45.4, upper(TH.wall, { tag: 'garden-wall' })),
  // the funicular incline: track bed + service stair + west parapet
  R([INC.foot[0] - incN[0] * 0.9, H0, INC.foot[2] - incN[1] * 0.9], [INC.top[0] - incN[0] * 0.9, H4, INC.top[2] - incN[1] * 0.9], 2.0, { tag: 'incline-track', color: '#d3cbbd', pattern: PATTERN.concrete }),
  R([INC.foot[0] + incN[0] * 1.0, H0, INC.foot[2] + incN[1] * 1.0], [INC.top[0] + incN[0] * 1.0, H4, INC.top[2] + incN[1] * 1.0], 1.8, stair({ tag: 'incline-stair' })),
  R([INC.foot[0] - incN[0] * 2.03, H0 + 1.0, INC.foot[2] - incN[1] * 2.03], [INC.top[0] - incN[0] * 2.03, H4 + 1.0, INC.top[2] - incN[1] * 2.03], 0.26, { tag: 'incline-parapet', color: TH.wall, pattern: SURF.calce ?? PATTERN.render }),
];
// (the ground is shared by every mode: it is laid round the Turf War pieces)
export const GROUND_FRESH = globalThis.__TERRACES_REGEN || !GROUND_DATA ? generateGround([...SINGLE.filter((d) => !d.onlyIn), ...FEATURES, ...EXTRA, ...[...FEATURES, ...EXTRA].map(mirrorDef)]) : null;
const GROUND = GROUND_FRESH || unbake(GROUND_DATA);

const TERRACES = {
  id: 'terraces',
  bounds: { minX: -28, maxX: 28, minZ: -46, maxZ: 46 },
  spawnPads: [[-12, H4, -38.4], [12, H4, 38.4]],
  spawnBarrier: 4.0,
  single: SINGLE,
  half: [...GROUND, ...FEATURES, ...EXTRA],
  decor: { lamps: [], palms: [], flags: [[-18.6, H4, -44.6], [-5.4, H4, -44.6]] },
  intro: { from: [26, 11, 10], lookFrom: [2, 3, -6], toBack: 3.2 },
  art: { from: [34, 26, -36], look: [-2, 1, 2], fov: 58 },
};

export const LAYOUT = TERRACES;
export const TERRAIN = { C, R0, R1, R2, R3, R4, inside, INC, incDir, incN, incP, T_CUT, SAL_W, PIAZZA_R, BELV, BELV_D, P, rotOf, uO, HOUSES, UPPERS, GAPS, STREET_R0, STREET_R1, EAST, LARGO, HOUSE_R0, HOUSE_R1, wedge, FL, H0, H1, H2, H3, H4 };
