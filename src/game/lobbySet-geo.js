// Lobby set geometry: a bucketed builder (everything static merges into one geometry per material) + the prop kit.
// Units: metres, Y up; the alley runs along -Z. Surface geometry carries uv in METRES (texlib samples at layer scale),
// a tint colour, aSurf = (slot, grime, roughness multiplier, metalness) and aDec = (decal u, v, mode).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SLOT } from './lobbySet-mats.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export const mat4 = (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));

const COL = new THREE.Color();
export class SetBuilder {
  constructor() { this.buckets = new Map(); this.stack = [new THREE.Matrix4()]; this.tris = 0; }
  get M() { return this.stack[this.stack.length - 1]; }
  push(m) { this.stack.push(this.M.clone().multiply(m)); return this; }
  pop() { this.stack.pop(); return this; }
  at(m, fn) { this.push(m); fn(); this.pop(); }

  // Add a geometry to a bucket. o: { color, surf: [slot, grime, rough, metal], dec: [u, v, mode] | fn(pos) , lit: [r,g,b],
  // neon: [team, buzz, sign], emit: colour (HDR, scalar multiplier via o.k), m: extra matrix, uv: 'box' | 'keep' }
  add(key, g, o = {}) {
    g = g.index ? g.toNonIndexed() : g.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    const m = o.m ? this.M.clone().multiply(o.m) : this.M;
    // metre uvs from LOCAL coordinates (before the transform) so a rotated prop keeps its texture scale
    const n = g.attributes.position.count;
    const uv0 = g.attributes.uv ? g.attributes.uv.clone() : null;   // the geometry's own 0..1 uv (decal placement)
    if (key === 'surface' && o.uv !== 'keep') boxUV(g, o.uvScale || 1);
    if (o.swapUV) { const u = g.attributes.uv; for (let i = 0; i < n; i++) u.setXY(i, u.getY(i), u.getX(i)); }
    g.applyMatrix4(m);
    const kind = KIND[key] || 'surface';
    if (kind === 'surface') {
      const c = COL.set(o.color ?? '#808080'), cs = new Float32Array(n * 3), ss = new Float32Array(n * 4), ds = new Float32Array(n * 3);
      const sf = o.surf || [SLOT.plain, 0.3, 1, 0];
      for (let i = 0; i < n; i++) { cs.set([c.r, c.g, c.b], i * 3); ss.set(sf, i * 4); }
      if (o.dec) for (let i = 0; i < n; i++) ds.set(typeof o.dec === 'function' ? o.dec(uv0 ? uv0.getX(i) : 0, uv0 ? uv0.getY(i) : 0, i) : o.dec, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(cs, 3));
      g.setAttribute('aSurf', new THREE.BufferAttribute(ss, 4));
      g.setAttribute('aDec', new THREE.BufferAttribute(ds, 3));
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    } else if (kind === 'lit') {
      const l = new Float32Array(n * 3); for (let i = 0; i < n; i++) l.set(o.lit || [1, 1, 1], i * 3);
      g.setAttribute('aLit', new THREE.BufferAttribute(l, 3));
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    } else if (kind === 'neon') {
      const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(o.neon || [0, 0, 0], i * 3);
      g.setAttribute('aNeon', new THREE.BufferAttribute(a, 3));
      g.deleteAttribute('uv');
    } else if (kind === 'emit') {
      const c = COL.set(o.color ?? '#ffffff').multiplyScalar(o.k ?? 1), cs = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) cs.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(cs, 3));
      g.deleteAttribute('uv');
    }
    for (const k of Object.keys(g.attributes)) if (!KEEP[kind].includes(k)) g.deleteAttribute(k);
    let b = this.buckets.get(key); if (!b) this.buckets.set(key, (b = []));
    b.push(g); this.tris += n / 3;
    return g;
  }
  // axis-aligned box from corners (in the current frame); faces: string of faces to keep ('xXyYzZ', lower = negative)
  box(key, x0, y0, z0, x1, y1, z1, o = {}) {
    const g = boxGeo(x1 - x0, y1 - y0, z1 - z0, o.faces);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (key === 'surface' && o.uv !== 'keep') { boxUV(g, 1); o = { ...o, uv: 'keep' }; }
    return this.add(key, g, o);
  }
  rbox(key, w, h, d, r, o = {}) { return this.add(key, new RoundedBoxGeometry(w, h, d, 2, r), o); }
  cyl(key, r0, r1, h, seg, o = {}) { return this.add(key, new THREE.CylinderGeometry(r1, r0, h, seg, 1, !!o.open), o); }
  // tube along points (polyline, lightly smoothed through CatmullRom unless o.sharp)
  tube(key, pts, r, o = {}) {
    const v = pts.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p)));
    const curve = o.sharp ? polyCurve(v) : new THREE.CatmullRomCurve3(v, !!o.closed, 'centripetal', 0.5);
    const seg = o.seg || Math.max(4, Math.ceil(curve.getLength() / (o.step || 0.08)));
    return this.add(key, new THREE.TubeGeometry(curve, seg, r, o.radial || 6, !!o.closed), o);
  }
  build() {
    const out = {};
    for (const [k, list] of this.buckets) out[k] = list.length === 1 ? list[0] : mergeGeometries(list, false);
    return out;
  }
}
const KIND = { surface: 'surface', lit: 'lit', neonA: 'neon', neonB: 'neon', neon: 'neon', emit: 'emit' };
const KEEP = { surface: ['position', 'normal', 'uv', 'color', 'aSurf', 'aDec'], lit: ['position', 'normal', 'uv', 'aLit'], neon: ['position', 'normal', 'aNeon'], emit: ['position', 'normal', 'color'] };

function polyCurve(v) { const c = new THREE.CurvePath(); for (let i = 1; i < v.length; i++) c.add(new THREE.LineCurve3(v[i - 1], v[i])); return c; }
// box with per-face metre uvs; faces filter (e.g. 'xXyzZ' drops the +Y top)
function boxGeo(w, h, d, faces) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (!faces) return g;
  // BoxGeometry groups: +x, -x, +y, -y, +z, -z
  const keep = ['X', 'x', 'Y', 'y', 'Z', 'z'].map((f) => faces.includes(f));
  const idx = g.index.array, out = [];
  g.groups.forEach((gr, i) => { if (keep[i]) for (let k = gr.start; k < gr.start + gr.count; k++) out.push(idx[k]); });
  g.setIndex(out); g.clearGroups();
  return g;
}
// planar metre uvs chosen per vertex by the dominant normal axis (x faces: z,y · y faces: x,z · z faces: x,y)
export function boxUV(g, s = 1) {
  const p = g.attributes.position, n = g.attributes.normal, N = p.count, uv = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i) * s, y = p.getY(i) * s, z = p.getZ(i) * s;
    if (ax >= ay && ax >= az) uv.set([n.getX(i) > 0 ? -z : z, y], i * 2);
    else if (ay >= az) uv.set([x, n.getY(i) > 0 ? -z : z], i * 2);
    else uv.set([n.getZ(i) > 0 ? x : -x, y], i * 2);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// ================================================================================================ props
const S = (slot, grime = 0.3, rough = 1, metal = 0) => [slot, grime, rough, metal];
export const PAINT = {
  steelBlack: { color: '#1b1d21', surf: S(SLOT.plain, 0.25, 0.75, 0.2) },
  steelGalv: { color: '#8a9096', surf: S(SLOT.metalpanel, 0.35, 0.8, 0.6) },
  steelRust: { color: '#5a4032', surf: S(SLOT.metalpanel, 0.5, 1.1, 0.2) },
  pipe: { color: '#4a4d52', surf: S(SLOT.plain, 0.35, 0.6, 0.5) },
  rubber: { color: '#151515', surf: S(SLOT.rubber, 0.2, 1, 0) },
  concrete: { color: '#8c8a86', surf: S(SLOT.concrete, 0.45, 1, 0) },
};

// Fire escape against a wall (x = wallX, facing dir = +1 into +x / -1 into -x): landings at `levels`, railings,
// stair flights between landings, a drop ladder at the bottom.
export function fireEscape(B, wallX, dir, z0, z1, levels, o = {}) {
  const P = PAINT.steelBlack, D = 1.15, x0 = wallX, x1 = wallX + dir * D, xa = Math.min(x0, x1), xb = Math.max(x0, x1);
  const bar = (ax, ay, az, bx, by, bz, r = 0.018) => B.tube('surface', [[ax, ay, az], [bx, by, bz]], r, { sharp: true, seg: 1, radial: 5, ...P });
  levels.forEach((y, li) => {
    // grate floor + channel frame
    B.box('surface', xa, y - 0.03, z0, xb, y, z1, { color: '#26282c', surf: S(SLOT.grate, 0.3, 0.9, 0.3), uv: 'box' });
    B.box('surface', xa, y - 0.12, z0, xb, y - 0.03, z0 + 0.05, P); B.box('surface', xa, y - 0.12, z1 - 0.05, xb, y - 0.03, z1, P);
    B.box('surface', dir > 0 ? xb - 0.05 : xa, y - 0.12, z0, dir > 0 ? xb : xa + 0.05, y - 0.03, z1, P);
    // railing: top rail, mid rail, balusters
    const rx = x1 - dir * 0.03;
    bar(rx, y + 0.98, z0, rx, y + 0.98, z1, 0.022); bar(rx, y + 0.5, z0, rx, y + 0.5, z1, 0.014);
    bar(x0, y + 0.98, z0, rx, y + 0.98, z0, 0.022); bar(x0, y + 0.98, z1, rx, y + 0.98, z1, 0.022);
    for (let z = z0; z <= z1 + 1e-3; z += 0.5) bar(rx, y, z, rx, y + 0.98, z, 0.011);
    // brackets under the landing
    for (const z of [z0 + 0.1, z1 - 0.1]) bar(x0, y - 0.8, z, x1 - dir * 0.05, y - 0.08, z, 0.02);
    // stair flight up to the next landing (inside the railing)
    const ny = levels[li + 1];
    if (ny != null) {
      const sx0 = x0 + dir * 0.15, sx1 = x0 + dir * 0.85, n = Math.round((ny - y) / 0.2), za = z1 - 0.35, zb = z0 + 0.55;
      for (let k = 1; k < n; k++) { const t = k / n, zz = za + (zb - za) * t, yy = y + (ny - y) * t; B.box('surface', Math.min(sx0, sx1), yy - 0.03, zz - 0.11, Math.max(sx0, sx1), yy, zz + 0.11, { color: '#26282c', surf: S(SLOT.grate, 0.3, 0.9, 0.3) }); }
      for (const sx of [sx0, sx1]) bar(sx, y, za + 0.1, sx, ny, zb - 0.1, 0.03);
      bar(sx1, y + 0.9, za + 0.1, sx1, ny + 0.9, zb - 0.1, 0.018);
    }
  });
  if (o.ladder) {
    const y0 = o.ladder[0], y1 = levels[0], lz = o.ladder[1], lx = x1 - dir * 0.18;
    for (const dz of [-0.2, 0.2]) bar(lx, y0, lz + dz, lx, y1 + 0.9, lz + dz, 0.02);
    for (let y = y0 + 0.15; y < y1; y += 0.3) bar(lx, y, lz - 0.2, lx, y, lz + 0.2, 0.012);
  }
}

// Drain pipe down a wall with brackets, an offset near the top and a shoe at the bottom.
export function drainPipe(B, wallX, dir, z, y0, y1, r = 0.055) {
  const x = wallX + dir * (r + 0.05);
  B.tube('surface', [[x, y1 + 0.2, z - 0.3], [x, y1, z - 0.3], [x, y1 - 0.35, z], [x, y0 + 0.25, z], [x + dir * 0.12, y0 + 0.02, z]], r, { radial: 10, step: 0.1, ...PAINT.pipe });
  for (let y = y0 + 0.9; y < y1 - 0.4; y += 1.8) B.box('surface', Math.min(wallX, x + dir * r), y - 0.03, z - r - 0.02, Math.max(wallX, x + dir * r), y + 0.03, z + r + 0.02, PAINT.steelBlack);
}

// Window (walls are solid, so the depth is built outward): a proud casing, the glass set back inside it, a mullion
// + transom, a projecting stone sill and lintel, optional security bars. Glass uses the lit bucket (atlas rect).
export function windowUnit(B, wallX, dir, zc, yb, w, h, rect, lit, o = {}) {
  const f = 0.075, cd = 0.11, X = (a, b) => [Math.min(wallX + dir * a, wallX + dir * b), Math.max(wallX + dir * a, wallX + dir * b)];
  const z0 = zc - w / 2, z1 = zc + w / 2;
  const fr = { color: o.frame || '#cfc8b8', surf: S(SLOT.plain, 0.7, 0.85, 0) };
  const [c0, c1] = X(0, cd);
  B.box('surface', c0, yb, z0, c1, yb + h, z0 + f, fr); B.box('surface', c0, yb, z1 - f, c1, yb + h, z1, fr);
  B.box('surface', c0, yb + h - f, z0, c1, yb + h, z1, fr);
  const [m0, m1] = X(0, cd * 0.6);
  B.box('surface', m0, yb + h * 0.55, z0 + f, m1, yb + h * 0.55 + 0.045, z1 - f, fr);
  B.box('surface', m0, yb + f, zc - 0.022, m1, yb + h * 0.55, zc + 0.022, fr);
  const [s0, s1] = X(-0.01, 0.16);
  B.box('surface', s0, yb - 0.08, z0 - 0.07, s1, yb, z1 + 0.07, PAINT.concrete);
  const [l0, l1] = X(0, 0.06);
  B.box('surface', l0, yb + h, z0 - 0.1, l1, yb + h + 0.16, z1 + 0.1, { color: '#77736d', surf: S(SLOT.concrete, 0.6, 1, 0) });
  const gl = new THREE.PlaneGeometry(w - 2 * f, h - f);
  const uv = gl.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + (rect[2] - rect[0]) * uv.getX(i), rect[1] + (rect[3] - rect[1]) * uv.getY(i));
  B.add('lit', gl, { m: mat4(wallX + dir * 0.035, yb + (h - f) / 2, zc, dir > 0 ? Math.PI / 2 : -Math.PI / 2), lit });
  if (o.bars) for (let z = z0 + 0.12; z < z1 - 0.05; z += 0.13) B.tube('surface', [[wallX + dir * 0.15, yb + 0.02, z], [wallX + dir * 0.15, yb + h, z]], 0.012, { sharp: true, seg: 1, radial: 5, ...PAINT.steelBlack });
}

// AC unit hung under a window: casing, grille, fan disc, drip tray + brackets.
export function acUnit(B, wallX, dir, zc, y, o = {}) {
  const w = 0.72, h = 0.46, d = 0.55;
  B.at(mat4(wallX + dir * d / 2, y + h / 2, zc, dir > 0 ? Math.PI / 2 : -Math.PI / 2), () => {
    B.rbox('surface', w, h, d, 0.025, { color: o.color || '#bfbcb4', surf: S(SLOT.metalpanel, 0.7, 0.9, 0.1) });
    // grille slats on the face
    for (let i = 0; i < 9; i++) B.box('surface', -w / 2 + 0.05, -h / 2 + 0.06 + i * 0.04, d / 2, w / 2 - 0.05, -h / 2 + 0.075 + i * 0.04, d / 2 + 0.012, { color: '#8d8a84', surf: S(SLOT.plain, 0.8, 0.9, 0.2) });
    B.box('surface', -w / 2, -h / 2 - 0.05, -d / 2, w / 2, -h / 2, d / 2 + 0.04, PAINT.steelRust);
    for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) B.box('surface', x - 0.02, -h / 2 - 0.35, -d / 2, x + 0.02, -h / 2 - 0.05, -d / 2 + 0.04, PAINT.steelBlack);
  });
}

// Roll-up shutter: corrugated curtain, guide rails, the coil housing above, a bottom bar. (The graffiti is a separate
// decal quad over it, see decalQuad.)
export function shutter(B, wallX, dir, z0, z1, y0, y1) {
  const x = wallX + dir * 0.06, xl = Math.min(wallX, x), xh = Math.max(wallX, x);
  const g = new THREE.PlaneGeometry(z1 - z0, y1 - y0, 1, 1);
  B.add('surface', g, { m: mat4(x, (y0 + y1) / 2, (z0 + z1) / 2, dir > 0 ? Math.PI / 2 : -Math.PI / 2), color: '#6f7479', surf: S(SLOT.corrugated, 0.45, 1, 0.35), swapUV: true });
  B.box('surface', Math.min(wallX, wallX + dir * 0.32), y1, z0 - 0.08, Math.max(wallX, wallX + dir * 0.32), y1 + 0.42, z1 + 0.08, { color: '#4b5055', surf: S(SLOT.metalpanel, 0.5, 0.9, 0.4) });
  for (const z of [z0 - 0.06, z1]) B.box('surface', xl, y0, z, xh + 0.02, y1, z + 0.06, PAINT.steelGalv);
  B.box('surface', xl, y0, z0, xh + 0.03, y0 + 0.08, z1, PAINT.steelBlack);
}

// Dumpster (roll-off bin): tapered body, two lids (one propped open), side pockets, casters.
export function dumpster(B, x, z, ry, color = '#2f5a45') {
  const W = 1.9, D = 1.1, H = 1.12;
  B.at(mat4(x, 0, z, ry), () => {
    const body = new THREE.BoxGeometry(W, H, D, 1, 1, 1); const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setZ(i, p.getZ(i) * 0.82);   // tapered toward the bottom
    body.computeVertexNormals();
    B.add('surface', body, { m: mat4(0, 0.16 + H / 2, 0), color, surf: S(SLOT.metalpanel, 0.85, 1, 0.3) });
    B.box('surface', -W / 2 - 0.04, 0.16 + H - 0.08, -D / 2 - 0.04, W / 2 + 0.04, 0.16 + H, D / 2 + 0.04, { color, surf: S(SLOT.metalpanel, 0.8, 1, 0.3) });
    for (const sx of [-1, 1]) B.box('surface', sx * W / 2 - (sx > 0 ? 0.08 : -0.08) - 0.04 * sx, 0.5, -0.3, sx * W / 2 + 0.04 * sx - (sx > 0 ? 0 : 0), 0.95, 0.3, { color, surf: S(SLOT.metalpanel, 0.9, 1, 0.3) });
    // lids: back one closed, front one propped open against the wall
    B.box('surface', -W / 2, 0.16 + H, -D / 2 - 0.02, 0, 0.16 + H + 0.05, D / 2 + 0.02, { color: '#1c1f22', surf: S(SLOT.plain, 0.6, 1.25, 0) });
    B.at(mat4(W / 4, 0.16 + H, -D / 2, 0, -1.9), () => B.box('surface', -W / 4, 0, 0, W / 4, 0.05, D + 0.04, { color: '#1c1f22', surf: S(SLOT.plain, 0.6, 1.25, 0) }));
    for (const [cx, cz] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]]) { B.cyl('surface', 0.08, 0.08, 0.06, 12, { m: mat4(cx, 0.08, cz, 0, 0, Math.PI / 2), ...PAINT.rubber }); B.box('surface', cx - 0.05, 0.1, cz - 0.05, cx + 0.05, 0.17, cz + 0.05, PAINT.steelBlack); }
  });
}

// Vending machine: body, lit front (lit bucket), coin panel, delivery flap.
export function vending(B, x, z, ry, rectFront, body = '#d9dde0') {
  const W = 0.95, D = 0.78, H = 1.9;
  B.at(mat4(x, 0, z, ry), () => {
    B.rbox('surface', W, H, D, 0.04, { m: mat4(0, H / 2 + 0.04, 0), color: body, surf: S(SLOT.plain, 0.5, 0.45, 0.1) });
    B.box('surface', -W / 2 + 0.02, 0, -D / 2 + 0.05, W / 2 - 0.02, 0.06, D / 2 - 0.05, PAINT.steelBlack);
    const g = new THREE.PlaneGeometry(0.62, 1.52); const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, rectFront[0] + (rectFront[2] - rectFront[0]) * uv.getX(i), rectFront[1] + (rectFront[3] - rectFront[1]) * uv.getY(i));
    B.add('lit', g, { m: mat4(-0.1, 1.12, D / 2 + 0.005), lit: [1.7, 1.7, 1.7] });
    B.box('surface', 0.25, 0.9, D / 2, 0.42, 1.5, D / 2 + 0.03, { color: '#2a2d31', surf: S(SLOT.plain, 0.3, 0.5, 0.3) });
    B.box('surface', -0.38, 0.14, D / 2, 0.2, 0.34, D / 2 + 0.03, { color: '#1a1c1f', surf: S(SLOT.plain, 0.4, 0.6, 0.2) });
  });
}

// Stacked crates: wooden produce crates (plank slot) and plastic milk crates (bars) in a colour.
export function woodCrate(B, x, y, z, ry, w = 0.6, h = 0.45, d = 0.42) {
  B.at(mat4(x, y, z, ry), () => {
    const P = { color: '#9c7b55', surf: S(SLOT.planks, 0.6, 1, 0) };
    for (let i = 0; i < 3; i++) { const yy = 0.02 + i * (h / 3); B.box('surface', -w / 2, yy, -d / 2, w / 2, yy + h / 3 - 0.03, -d / 2 + 0.018, P); B.box('surface', -w / 2, yy, d / 2 - 0.018, w / 2, yy + h / 3 - 0.03, d / 2, P); B.box('surface', -w / 2, yy, -d / 2, -w / 2 + 0.018, yy + h / 3 - 0.03, d / 2, P); B.box('surface', w / 2 - 0.018, yy, -d / 2, w / 2, yy + h / 3 - 0.03, d / 2, P); }
    B.box('surface', -w / 2, 0, -d / 2, w / 2, 0.02, d / 2, P);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('surface', sx * w / 2 - (sx > 0 ? 0.045 : 0), 0, sz * d / 2 - (sz > 0 ? 0.045 : 0), sx * w / 2 + (sx < 0 ? 0.045 : 0), h, sz * d / 2 + (sz < 0 ? 0.045 : 0), { color: '#7d5f3f', surf: S(SLOT.planks, 0.7, 1, 0) });
  });
}
export function milkCrate(B, x, y, z, ry, color) {
  const w = 0.46, h = 0.3, d = 0.34, C = { color, surf: S(SLOT.plain, 0.35, 0.55, 0) };
  B.at(mat4(x, y, z, ry), () => {
    B.box('surface', -w / 2, 0, -d / 2, w / 2, 0.025, d / 2, C);
    for (const yy of [0.12, h - 0.03]) { B.box('surface', -w / 2, yy, -d / 2, w / 2, yy + 0.03, -d / 2 + 0.02, C); B.box('surface', -w / 2, yy, d / 2 - 0.02, w / 2, yy + 0.03, d / 2, C); B.box('surface', -w / 2, yy, -d / 2, -w / 2 + 0.02, yy + 0.03, d / 2, C); B.box('surface', w / 2 - 0.02, yy, -d / 2, w / 2, yy + 0.03, d / 2, C); }
    for (let i = 0; i <= 5; i++) { const xx = -w / 2 + (i / 5) * (w - 0.02); B.box('surface', xx, 0, -d / 2, xx + 0.02, h, -d / 2 + 0.02, C); B.box('surface', xx, 0, d / 2 - 0.02, xx + 0.02, h, d / 2, C); }
    for (let i = 0; i <= 3; i++) { const zz = -d / 2 + (i / 3) * (d - 0.02); B.box('surface', -w / 2, 0, zz, -w / 2 + 0.02, h, zz + 0.02, C); B.box('surface', w / 2 - 0.02, 0, zz, w / 2, h, zz + 0.02, C); }
  });
}

// Speaker stack: two cabinets with woofers + a horn, an amp head on top (with a glowing power LED in the emit bucket).
export function speakerStack(B, x, z, ry) {
  B.at(mat4(x, 0, z, ry), () => {
    const cab = (y, w, h, d, cones) => {
      B.rbox('surface', w, h, d, 0.02, { m: mat4(0, y + h / 2, 0), color: '#161719', surf: S(SLOT.rubber, 0.25, 1, 0) });
      B.box('surface', -w / 2 + 0.03, y + 0.03, d / 2 - 0.005, w / 2 - 0.03, y + h - 0.03, d / 2 + 0.005, { color: '#0c0c0d', surf: S(SLOT.grate, 0.1, 1, 0.2) });
      for (const [cx, cy, r] of cones) {
        B.cyl('surface', r, r * 0.4, 0.08, 20, { m: mat4(cx, y + cy, d / 2 - 0.03, 0, Math.PI / 2), color: '#202123', surf: S(SLOT.plain, 0.1, 0.9, 0) });
        B.add('surface', new THREE.TorusGeometry(r, 0.018, 6, 24), { m: mat4(cx, y + cy, d / 2 + 0.01), color: '#2c2d30', surf: S(SLOT.plain, 0.1, 0.6, 0.3) });
        B.cyl('surface', r * 0.25, r * 0.25, 0.02, 14, { m: mat4(cx, y + cy, d / 2 - 0.02, 0, Math.PI / 2), color: '#3a3b3e', surf: S(SLOT.plain, 0.1, 0.4, 0.5) });
      }
    };
    cab(0, 0.62, 0.72, 0.5, [[0, 0.36, 0.22]]);
    cab(0.72, 0.62, 0.62, 0.48, [[-0.14, 0.4, 0.1], [0.14, 0.4, 0.1], [0, 0.15, 0.07]]);
    B.rbox('surface', 0.56, 0.22, 0.4, 0.015, { m: mat4(0, 1.45, -0.02), color: '#1c1d20', surf: S(SLOT.plain, 0.2, 0.55, 0.3) });
    for (let i = 0; i < 5; i++) B.cyl('surface', 0.018, 0.018, 0.02, 10, { m: mat4(-0.18 + i * 0.07, 1.44, 0.185, 0, Math.PI / 2), color: '#bfbfbf', surf: S(SLOT.plain, 0, 0.35, 0.8) });
    B.add('emit', new THREE.SphereGeometry(0.012, 8, 6), { m: mat4(0.22, 1.47, 0.185), color: '#ff2a2a', k: 6 });
    // cable snaking off to the door
    B.tube('surface', [[0.2, 1.4, -0.2], [0.35, 0.6, -0.3], [0.5, 0.02, -0.1], [1.2, 0.015, 0.2], [2.0, 0.015, 0.1]], 0.012, { radial: 5, ...PAINT.rubber });
  });
}

// Traffic cone with two retro-reflective bands.
export function cone(B, x, z, ry, tipped = false) {
  B.at(mat4(x, 0, z, ry, tipped ? 0 : 0, tipped ? Math.PI / 2 - 0.35 : 0), () => {
    B.box('surface', -0.19, 0, -0.19, 0.19, 0.035, 0.19, { color: '#1a1a1a', surf: S(SLOT.rubber, 0.4, 1, 0) });
    const prof = [[0.15, 0.035], [0.14, 0.12], [0.1, 0.36], [0.06, 0.58], [0.03, 0.7], [0.0, 0.705]].map(([r, y]) => new THREE.Vector2(r, y));
    B.add('surface', new THREE.LatheGeometry(prof, 20), { color: '#ff5a14', surf: S(SLOT.plain, 0.35, 0.55, 0) });
    for (const [y, r] of [[0.3, 0.113], [0.47, 0.085]]) B.cyl('surface', r + 0.01, r - 0.01 + 0.005, 0.08, 20, { m: mat4(0, y, 0), open: true, color: '#e8e8e8', surf: S(SLOT.plain, 0.3, 0.3, 0.5) });
  });
}

// Bike leaning on a wall: wheels (tyre torus + rim + spokes), diamond frame, bars, saddle.
export function bike(B, x, z, ry, lean = 0.18, color = '#c2372f') {
  B.at(mat4(x, 0, z, ry, 0, lean), () => {
    const R = 0.33, wb = 1.02, F = { color, surf: S(SLOT.plain, 0.35, 0.4, 0.3) }, K = PAINT.steelBlack;
    for (const wx of [-wb / 2, wb / 2]) {
      B.add('surface', new THREE.TorusGeometry(R, 0.024, 8, 36), { m: mat4(wx, R + 0.024, 0), ...PAINT.rubber });
      B.add('surface', new THREE.TorusGeometry(R - 0.035, 0.008, 5, 36), { m: mat4(wx, R + 0.024, 0), color: '#9aa0a6', surf: S(SLOT.plain, 0.2, 0.3, 0.9) });
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; B.tube('surface', [[wx, R + 0.024, 0], [wx + Math.cos(a) * (R - 0.04), R + 0.024 + Math.sin(a) * (R - 0.04), 0]], 0.0025, { sharp: true, seg: 1, radial: 3, color: '#9aa0a6', surf: S(SLOT.plain, 0, 0.3, 0.9) }); }
    }
    const bb = [-0.05, 0.3, 0], st = [-0.16, 0.84, 0], hd = [0.36, 0.86, 0], rw = [-wb / 2, R + 0.024, 0], fw = [wb / 2, R + 0.024, 0];
    const t = (a, b, r = 0.018, P = F) => B.tube('surface', [a, b], r, { sharp: true, seg: 1, radial: 6, ...P });
    t(bb, st); t(bb, hd, 0.022); t(st, hd); t(bb, rw, 0.013); t(st, rw, 0.012); t(hd, fw, 0.015);
    t(hd, [0.34, 0.98, 0], 0.016, K); t([0.3, 0.98, -0.24], [0.38, 0.98, 0.24], 0.013, K);
    B.rbox('surface', 0.24, 0.05, 0.12, 0.02, { m: mat4(-0.18, 0.9, 0), color: '#111', surf: S(SLOT.rubber, 0.2, 0.8, 0) });
    t(st, [-0.18, 0.88, 0], 0.012, K);
    B.cyl('surface', 0.06, 0.06, 0.02, 14, { m: mat4(-0.05, 0.3, 0.02, 0, Math.PI / 2), ...K });
  });
}

// Trash bags: lumpy glossy black blobs.
export function trashBag(B, x, y, z, s = 1, seed = 1) {
  let g = new THREE.IcosahedronGeometry(0.3 * s, 3); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g); const p = g.attributes.position;
  let a = seed * 9.1;
  for (let i = 0; i < p.count; i++) { const v = _p.fromBufferAttribute(p, i); const n = 1 + 0.18 * Math.sin(v.x * 11 + a) * Math.sin(v.z * 9 + a * 0.7) + 0.1 * Math.sin(v.y * 15 + a); v.multiplyScalar(n); v.y = Math.max(v.y * 0.82, -0.3 * s * 0.8); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  B.add('surface', g, { m: mat4(x, y + 0.23 * s, z, seed), color: '#0d0e10', surf: S(SLOT.plain, 0.1, 0.35, 0) });
  B.cyl('surface', 0.035 * s, 0.02 * s, 0.12 * s, 8, { m: mat4(x, y + 0.5 * s, z, 0, 0.2), color: '#0d0e10', surf: S(SLOT.plain, 0.1, 0.35, 0) });
}

// Catenary between two points (sag in metres), n samples.
export function catenary(a, b, sag, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0))); }
  return out;
}

// Decal-only quad (mode 3 / 4 = discard outside the paint) on a wall plane or the dock top; rect = atlas [u0, v0, u1, v1].
export function decalQuad(B, m, w, h, rect, swap = false, slot = SLOT.plain, color = '#777') {
  const g = new THREE.PlaneGeometry(w, h);
  B.add('surface', g, { m, color, surf: [slot, 0.4, 1, 0], dec: (u, v) => [rect[0] + (rect[2] - rect[0]) * u, rect[1] + (rect[3] - rect[1]) * v, swap ? 4 : 3] });
}
