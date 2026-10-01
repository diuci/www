// INKWAVE — HULLBREAKER set-piece FX owned by the model: glossy ink blobs (one InstancedMesh) and soft
// steam puffs (one Points). World-space (the group keeps an identity world matrix), fixed pools, no per-frame
// allocation. Gameplay FX (dust, rings, splats, shakes) stay with the game via the model's hooks.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const STEAM_VS = /* glsl */`
attribute float aSize; attribute float aAlpha; attribute float aSeed; varying float vA; varying float vSeed;
uniform float uScale;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(0.1, -mv.z); vA = aAlpha; vSeed = aSeed; }`;
const STEAM_FS = /* glsl */`
varying float vA; varying float vSeed; uniform vec3 uTint;
void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard;
  float a = smoothstep(1.0, 0.2, r); float n = 0.75 + 0.25 * sin(c.x * 9.0 + vSeed * 7.0) * sin(c.y * 8.0 + vSeed * 3.0);
  gl_FragColor = vec4(uTint, a * vA * n); }`;

export class BossFX {
  constructor({ quality = 'high', ink }) {
    const k = { low: 0.4, medium: 0.7, high: 1, ultra: 1.2 }[quality] ?? 1;
    this.k = k;
    this.group = new THREE.Group(); this.group.name = 'hullbreaker-fx';
    this.group.matrixAutoUpdate = false; this.group.matrixWorldAutoUpdate = false; this.group.matrixWorld.identity();
    // ink blobs
    this.NI = Math.round(320 * k);
    this.inkMat = new THREE.MeshPhysicalMaterial({ color: ink.clone(), roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 });
    const g = new THREE.IcosahedronGeometry(1, quality === 'low' ? 0 : 1);
    this.inkMesh = new THREE.InstancedMesh(g, this.inkMat, this.NI); this.inkMesh.count = 0; this.inkMesh.frustumCulled = false; this.inkMesh.castShadow = false;
    this.inkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.inkMesh);
    this.I = { p: new Float32Array(this.NI * 3), v: new Float32Array(this.NI * 3), life: new Float32Array(this.NI), max: new Float32Array(this.NI), size: new Float32Array(this.NI), gy: new Float32Array(this.NI), splat: new Uint8Array(this.NI) };
    this.ni = 0;
    // steam
    this.NS = Math.round(140 * k);
    const sg = new THREE.BufferGeometry();
    this.sp = new Float32Array(this.NS * 3); this.ssz = new Float32Array(this.NS); this.sal = new Float32Array(this.NS); this.sseed = new Float32Array(this.NS);
    sg.setAttribute('position', new THREE.BufferAttribute(this.sp, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('aSize', new THREE.BufferAttribute(this.ssz, 1).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('aAlpha', new THREE.BufferAttribute(this.sal, 1).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(this.sseed, 1));
    sg.setDrawRange(0, 0);
    this.steamMat = new THREE.ShaderMaterial({ vertexShader: STEAM_VS, fragmentShader: STEAM_FS, transparent: true, depthWrite: false, uniforms: { uScale: { value: 600 }, uTint: { value: new THREE.Color(0.92, 0.94, 0.96) } } });
    this.steam = new THREE.Points(sg, this.steamMat); this.steam.frustumCulled = false; this.steam.renderOrder = 2;
    this.group.add(this.steam);
    this.S = { v: new Float32Array(this.NS * 3), life: new Float32Array(this.NS), max: new Float32Array(this.NS), s0: new Float32Array(this.NS) };
    this.ns = 0;
    this.rnd = rng(9001);
    this.geyserT = -1; this.geyserPos = new THREE.Vector3(); this.accS = 0; this.accG = 0;
  }
  setInk(c) { this.inkMat.color.copy(c); }
  setViewportHeight(h, fov = 50) { this.steamMat.uniforms.uScale.value = h / (2 * Math.tan((fov * Math.PI) / 360)); }

  /** n glossy ink blobs from pos: dir (unit) * speed ± spread, sizes in metres */
  ink(pos, n, dir, speed, spread = 0.6, size = 0.18, groundY = 0, life = 2.2) {
    const I = this.I, r = this.rnd;
    n = Math.max(1, Math.round(n * this.k));
    for (let c = 0; c < n; c++) {
      let i = -1;
      if (this.ni < this.NI) i = this.ni++;
      else { let best = 1e9; for (let j = 0; j < this.NI; j++) { const rem = I.max[j] - I.life[j]; if (rem < best) { best = rem; i = j; } } }
      const j = i * 3;
      I.p[j] = pos.x + (r() - 0.5) * 0.2; I.p[j + 1] = pos.y + (r() - 0.5) * 0.2; I.p[j + 2] = pos.z + (r() - 0.5) * 0.2;
      _d.set(dir.x + (r() - 0.5) * 2 * spread, dir.y + (r() - 0.5) * 2 * spread, dir.z + (r() - 0.5) * 2 * spread).normalize();
      const sp = speed * (0.55 + r() * 0.6);
      I.v[j] = _d.x * sp; I.v[j + 1] = _d.y * sp; I.v[j + 2] = _d.z * sp;
      I.life[i] = 0; I.max[i] = life * (0.7 + r() * 0.5); const rs = r(); I.size[i] = size * (0.3 + rs * rs * 1.3); I.gy[i] = groundY; I.splat[i] = 0;
    }
  }
  steamPuff(pos, n, dir, speed, size = 1.2, life = 1.6) {
    const S = this.S, r = this.rnd;
    n = Math.max(1, Math.round(n * this.k));
    for (let c = 0; c < n; c++) {
      let i;
      if (this.ns < this.NS) i = this.ns++;
      else { let best = 1e9; i = 0; for (let j = 0; j < this.NS; j++) { const rem = S.max[j] - S.life[j]; if (rem < best) { best = rem; i = j; } } }
      const j = i * 3;
      this.sp[j] = pos.x + (r() - 0.5) * 0.3; this.sp[j + 1] = pos.y + (r() - 0.5) * 0.3; this.sp[j + 2] = pos.z + (r() - 0.5) * 0.3;
      const sp = speed * (0.6 + r() * 0.6);
      S.v[j] = (dir.x + (r() - 0.5) * 0.5) * sp; S.v[j + 1] = (dir.y + (r() - 0.5) * 0.3) * sp + 0.6; S.v[j + 2] = (dir.z + (r() - 0.5) * 0.5) * sp;
      S.life[i] = 0; S.max[i] = life * (0.7 + r() * 0.6); S.s0[i] = size * (0.6 + r() * 0.8); this.sseed[i] = r() * 10;
    }
    this.steam.geometry.attributes.aSeed.needsUpdate = true;
  }
  geyser(pos, dur = 3.6) { this.geyserT = dur; this.geyserDur = dur; this.geyserPos.copy(pos); }

  update(dt) {
    // continuous geyser (death)
    if (this.geyserT > 0) {
      this.geyserT -= dt;
      const k = Math.min(1, this.geyserT / 0.8) * Math.min(1, (this.geyserDur - this.geyserT) / 0.2);
      this.accG += dt * 130 * k;
      while (this.accG >= 1) { this.accG -= 1; this.ink(this.geyserPos, 1, _d.set(0, 1, 0), 16 * (0.6 + 0.4 * k), 0.2, 0.15, this.geyserPos.y - 4.2, 3.0); }
      this.accS += dt * 10 * k; while (this.accS >= 1) { this.accS -= 1; this.steamPuff(this.geyserPos, 1, _p.set(0, 1, 0), 3, 2.4, 2.0); }
    }
    // ink blobs
    const I = this.I; let live = 0;
    for (let i = 0; i < this.ni; i++) {
      I.life[i] += dt;
      if (I.life[i] >= I.max[i]) continue;
      const j = i * 3;
      if (!I.splat[i]) {
        I.v[j + 1] -= 16 * dt; const dr = 1 - 0.4 * dt; I.v[j] *= dr; I.v[j + 2] *= dr;
        I.p[j] += I.v[j] * dt; I.p[j + 1] += I.v[j + 1] * dt; I.p[j + 2] += I.v[j + 2] * dt;
        if (I.p[j + 1] < I.gy[i] + 0.02 && I.v[j + 1] < 0) { I.splat[i] = 1; I.p[j + 1] = I.gy[i] + 0.02; I.max[i] = Math.min(I.max[i], I.life[i] + 0.7); }
      }
      const age = I.life[i] / I.max[i];
      const sz = I.size[i] * (age > 0.8 ? 1 - (age - 0.8) / 0.2 : 1);
      _p.set(I.p[j], I.p[j + 1], I.p[j + 2]);
      if (I.splat[i]) { _q.identity(); _s.set(sz * 1.9, sz * 0.18, sz * 1.9); }
      else {
        const vl = Math.hypot(I.v[j], I.v[j + 1], I.v[j + 2]);
        _d.set(I.v[j], I.v[j + 1], I.v[j + 2]).divideScalar(vl || 1); _q.setFromUnitVectors(Z, _d);
        const st = 1 + Math.min(2.6, vl * 0.16); _s.set(sz / Math.sqrt(st), sz / Math.sqrt(st), sz * st);
      }
      _m.compose(_p, _q, _s);
      this.inkMesh.setMatrixAt(live++, _m);
    }
    this.inkMesh.count = live; this.inkMesh.visible = live > 0;
    if (live) this.inkMesh.instanceMatrix.needsUpdate = true;
    if (live === 0) this.ni = 0;
    // steam
    const S = this.S; let ls = 0;
    for (let i = 0; i < this.ns; i++) {
      S.life[i] += dt;
      const j = i * 3;
      if (S.life[i] >= S.max[i]) { this.sal[i] = 0; continue; }
      const u = S.life[i] / S.max[i];
      const dr = 1 - 1.4 * dt; S.v[j] *= dr; S.v[j + 1] = S.v[j + 1] * dr + 0.9 * dt; S.v[j + 2] *= dr;
      this.sp[j] += S.v[j] * dt; this.sp[j + 1] += S.v[j + 1] * dt; this.sp[j + 2] += S.v[j + 2] * dt;
      this.ssz[i] = S.s0[i] * (0.5 + 1.6 * Math.sqrt(u));
      this.sal[i] = 0.42 * Math.min(1, u * 6) * (1 - u) * (1 - u);
      ls++;
    }
    if (ls === 0) this.ns = 0;
    const sg = this.steam.geometry;
    sg.setDrawRange(0, this.ns); this.steam.visible = this.ns > 0;
    if (this.ns) { sg.attributes.position.needsUpdate = true; sg.attributes.aSize.needsUpdate = true; sg.attributes.aAlpha.needsUpdate = true; }
  }
  dispose() { this.inkMesh.geometry.dispose(); this.inkMat.dispose(); this.steam.geometry.dispose(); this.steamMat.dispose(); this.group.removeFromParent(); }
}
