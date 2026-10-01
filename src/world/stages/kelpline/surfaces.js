// Kelpline Terminal — stage surface materials (texlib layers), on this stage's three reserved PATTERN slots.
//
// SURF maps our names to the slot ids (use them in layout.js as `pattern: SURF.<name>`). SURFACES lists what each slot
// holds: { slot, name, onWall?, onTop?, mat } — mat follows the MATERIALS contract in src/world/texlib.js (prep declares
// up to 4 fbm + 2 worley requests, surf writes s.alb / s.a / s.h / s.rough / s.metal / s.cav; heights in metres).
// All three are `mask` layers: albedo.a = where the block colour is applied (the painted / tinted part), albedo.rgb =
// the layer's own colours (bitumen sealant, rust, bare steel …), so layout.js picks the tone per block.
//
//   tarmac   terminal yard asphalt (stack blocks, truck lane): aggregate in binder, sealed crack network, oil drips,
//            traffic-polished patches — the painted bay / lane markings are murals on top of it (murals.js)
//   quay     apron concrete: 2.4 m cast slabs, sawn + sealed joints, broom finish per slab, rust bleeding from
//            lashing gear, exposed aggregate where worn, rubber scuffs
//   chequer  painted steel chequer (tread) plate: raised lugs alternating ±45°, paint worn off the lug tops, seam
//            weld + bolt rows on the repeat border, rust spots — catwalk landings, hatch-cover rims, the spawn stair
import { PATTERN } from '../../mapkit.js';

export const SURF = { tarmac: 31, quay: 32, chequer: 33 };

const GRID = 1, HEX = 2;

export const SURFACES = [
  {
    slot: 31, name: 'tarmac', onWall: PATTERN.concrete,
    mat: {
      detail: 0.6, scale: 4.0, tint: true, mask: true, alpha: false, mode: HEX, sym: 7, hr: [-0.004, 0.0012], ao: 0.45,
      prep: `f[0] = FB(uv, ivec2(3), 4, 0.5, 3101u); f[1] = FB(uv, ivec2(8), 3, 0.5, 3107u); f[2] = FB(uv, ivec2(48), 2, 0.5, 3109u);
  f[3] = FB(uv, ivec2(4), 3, 0.55, 3113u); w[0] = WO(uv, ivec2(190), 1.0, 3119u); w[1] = WO(uv, ivec2(7), 0.9, 3121u);`,
      surf: /* glsl */`
  // dense-graded wearing course: aggregate set in binder (the tinted part), a sealed crack network (glossy black
  // bitumen bands, own colour), oil drips, rubber scuffs, lighter traffic-polished patches
  vec4 wc = c[0];
  float stone = smoothstep(0.08, 0.3, wc.y - wc.x);
  float light = step(0.9, wc.z);
  float big = n[0], mid = n[1], fine = n[2];
  float tone = mix(0.6 + 0.05 * fine, 0.74 + 0.16 * fract(wc.z * 7.13), stone);
  tone = mix(tone, 0.98, light * stone * 0.55);
  float worn = smoothstep(-0.05, 0.6, big);
  tone *= 1.0 + 0.07 * big + 0.04 * mid + 0.06 * worn;
  // crack network: coarse worley cell borders where the low-frequency noise allows it; sealant band ~4 cm
  vec4 cr = c[1];
  float edgeM = (cr.y - cr.x) * (4.0 / 7.0);
  float edgeSel = fract((cr.z + cr.w) * 13.7 + abs(cr.z - cr.w) * 5.3);     // per cell border: sealed / open / none
  float crackOn = smoothstep(0.3, 0.62, n[3]) * step(0.55, edgeSel);
  float seal = (1.0 - aa(0.016 + 0.006 * mid, edgeM)) * crackOn;
  float crack = (1.0 - aa(0.0018, edgeM)) * step(edgeSel, 0.3) * smoothstep(0.1, 0.4, n[3]) * 0.7;
  // oil drips + rubber scuffs (own dark colours)
  float oil = smoothstep(0.66, 0.84, 0.5 + 0.5 * mid) * smoothstep(0.1, 0.5, 0.5 + 0.5 * fine) * (1.0 - seal);
  float scuff = smoothstep(0.7, 0.9, 0.5 + 0.5 * n[3]) * smoothstep(0.3, 0.7, 0.5 + 0.5 * big) * 0.5;
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, vec3(0.035, 0.035, 0.038) * (1.0 + 0.3 * fine), seal * 0.85); cov *= 1.0 - seal * 0.85;
  own = mix(own, vec3(0.03, 0.028, 0.026), oil * 0.55); cov *= 1.0 - oil * 0.55;
  own = mix(own, vec3(0.05), crack * 0.6); cov *= 1.0 - crack * 0.6;
  s.alb = own;
  s.a = cov * clamp(tone * 1.18 * (1.0 - 0.22 * scuff), 0.0, 1.0);
  s.h = (-0.0011 * (1.0 - stone) + 0.0005 * stone * (1.0 - wc.x * wc.x) + 0.0001 * big) * (1.0 - seal) + 0.0006 * seal - 0.002 * crack;
  s.rough = mix(mix(mix(0.93, 0.8, stone) - 0.1 * worn, 0.38, seal * 0.9), 0.5, oil * 0.6);
  s.cav = (1.0 - 0.25 * (1.0 - stone)) * (1.0 - 0.4 * crack);`,
    },
  },
  {
    slot: 32, name: 'quay', onWall: PATTERN.concrete,
    mat: {
      detail: 0.9, scale: 4.8, tint: true, mask: true, alpha: false, mode: GRID, sym: 7, hr: [-0.008, 0.001], ao: 0.5,
      prep: `f[0] = FB(uv, ivec2(4), 5, 0.55, 3201u); f[1] = FB(uv, ivec2(12), 3, 0.5, 3203u);
  f[2] = FB(uv, ivec2(4, 150), 1, 0.5, 3209u); f[3] = FB(uv, ivec2(150, 4), 1, 0.5, 3211u);
  w[0] = WO(uv, ivec2(160), 1.0, 3217u); w[1] = WO(uv, ivec2(6), 0.85, 3221u);`,
      surf: /* glsl */`
  // 2.4 m cast apron slabs (2 x 2 per repeat): sawn joints filled with dark sealant, rounded arrises, a broom finish
  // whose direction alternates slab to slab, per-slab tone, exposed aggregate where traffic wore the laitance off,
  // rust bleeding from dropped lashing gear, hairline cracks, rubber scuffs
  ivec2 cell = ivec2(floor(P / 2.4));
  ivec2 cw = wrp(cell, ivec2(2));
  vec2 lp = P - (vec2(cell) * 2.4 + 1.2);
  float e = -sdRB(lp, vec2(1.2), 0.004);
  vec2 pr = edgeProf(e, 0.005, 0.007, 0.0025, 0.008);
  float inJ = pr.y;
  float hid = hf(cw, 3u), hid2 = hf(cw, 5u);
  bool du = ((cw.x + cw.y) & 1) == 0;
  float broom = du ? n[2] : n[3];
  float mott = n[0], cloud = n[1];
  vec4 ag = c[0];
  float agg = smoothstep(0.1, 0.3, ag.y - ag.x);
  float worn = smoothstep(0.15, 0.7, mott + 0.3 * cloud);
  float tone = 0.8 * (1.0 + 0.09 * (hid - 0.5) + 0.07 * mott + 0.04 * cloud + 0.035 * broom);
  tone *= mix(1.0, 0.86 + 0.28 * fract(ag.z * 9.1), agg * worn * 0.7);
  float grime = (1.0 - smoothstep(0.0, 0.07, e - 0.005)) * (1.0 - inJ);
  tone *= 1.0 - 0.1 * grime;
  // rust stains: a few blotches per repeat (coarse worley cells), fading out from a darker core
  vec4 rs = c[1];
  float rsel = step(0.72, rs.z) * step(0.03, e);
  float rust = rsel * (1.0 - smoothstep(0.05, 0.28 + 0.1 * cloud, rs.x * 0.8)) * smoothstep(-0.3, 0.4, cloud);
  float crack = (1.0 - aa(0.0022, (rs.y - rs.x) * 0.8)) * step(0.5, fract(rs.z * 5.7 + rs.w * 3.1)) * smoothstep(0.2, 0.5, mott) * step(0.05, e);
  float scuff = smoothstep(0.72, 0.92, 0.5 + 0.5 * cloud) * smoothstep(0.35, 0.8, 0.5 + 0.5 * mott) * 0.6;
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, vec3(0.03, 0.03, 0.032), inJ); cov *= 1.0 - inJ;
  own = mix(own, vec3(0.34, 0.16, 0.07) * (0.85 + 0.3 * cloud), rust * 0.55); cov *= 1.0 - rust * 0.55;
  own = mix(own, vec3(0.08), crack * 0.55); cov *= 1.0 - crack * 0.55;
  s.alb = own;
  s.a = cov * tone * (1.0 - 0.2 * scuff);
  s.h = pr.x + (0.00012 * broom + 0.0002 * mott + 0.0003 * agg * worn) * (1.0 - inJ) - 0.0015 * crack;
  s.rough = mix(mix(0.86 + 0.05 * broom - 0.08 * worn + 0.04 * hid2, 0.45, inJ), 0.8, rust * 0.5);
  s.cav = mix(1.0, 0.5, inJ) * (1.0 - 0.35 * crack) * (1.0 - 0.1 * grime);`,
    },
  },
  {
    slot: 33, name: 'chequer', onWall: PATTERN.hullpaint,
    mat: {
      detail: 0.3, scale: 1.2, tint: true, mask: true, alpha: false, mode: GRID, sym: 3, hr: [-0.004, 0.003], ao: 0.3,
      prep: `f[0] = FB(uv, ivec2(3), 4, 0.5, 3301u); f[1] = FB(uv, ivec2(24), 2, 0.5, 3303u); f[2] = FB(uv, ivec2(6), 3, 0.5, 3307u);
  f[3] = FB(uv, ivec2(10), 3, 0.5, 3309u); w[0] = WO(uv, ivec2(8), 0.9, 3311u);`,
      surf: /* glsl */`
  // painted steel chequer plate: raised lugs on a 40 mm grid alternating ±45°, a butt-welded seam with a bolt row on
  // the repeat border, paint worn off the lug tops along the walking lines (bare steel, own colour), rust spots
  const float CS = 0.04;
  vec2 cp = P / CS;
  ivec2 ci = ivec2(floor(cp));
  vec2 cf = cp - vec2(ci) - 0.5;
  bool odd = ((ci.x + ci.y) & 1) == 1;
  vec2 q = (odd ? vec2(cf.x + cf.y, cf.y - cf.x) : vec2(cf.x - cf.y, cf.x + cf.y)) * 0.70710678;
  float ld = length(vec2(max(abs(q.x) - 0.26, 0.0), q.y)) - 0.1;
  float lw = PX / CS;
  float lug = 1.0 - smoothstep(-lw, lw, ld);
  float dome = sqrt(clamp(-ld / 0.1, 0.0, 1.0));
  float dS = min(jd(P.x, 1.2), jd(P.y, 1.2));
  float bead = exp(-dS * dS / 0.00004);
  float nearS = 1.0 - smoothstep(0.004, 0.012, dS);
  lug *= 1.0 - nearS;
  float bu = abs(fract(P.x / 0.15) - 0.5) * 0.15, bv = abs(fract(P.y / 0.15) - 0.5) * 0.15;
  float bd = min(length(vec2(bu, jd(P.y, 1.2) - 0.03)), length(vec2(bv, jd(P.x, 1.2) - 0.03)));
  float bolt = 1.0 - aa(0.009, bd);
  float mott = n[0], fineN = n[1], wearN = n[2], rustN = n[3];
  float wear = lug * dome * smoothstep(0.45, 0.8, 0.5 + 0.5 * wearN);
  float edgeWear = bead * smoothstep(0.5, 0.8, 0.5 + 0.5 * wearN) * 0.7;
  vec4 rc = c[0];
  float rust = step(0.86, rc.z) * (1.0 - smoothstep(0.04, 0.2 + 0.08 * rustN, rc.x * 0.15)) * smoothstep(-0.2, 0.4, rustN);
  vec3 steel = vec3(0.42, 0.43, 0.44) * (1.0 + 0.08 * fineN);
  vec3 rustC = vec3(0.3, 0.13, 0.05) * (0.8 + 0.4 * fineN);
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, steel, wear * 0.85); cov *= 1.0 - wear * 0.85;
  own = mix(own, steel * 0.9, edgeWear); cov *= 1.0 - edgeWear;
  own = mix(own, rustC, rust * 0.7); cov *= 1.0 - rust * 0.7;
  s.alb = own;
  s.a = cov * 0.8 * (1.0 + 0.05 * mott + 0.03 * fineN) * (1.0 - 0.12 * (1.0 - lug) * (1.0 - bolt) * 0.0) * (1.0 + 0.06 * lug * dome);
  s.h = 0.0018 * lug * dome + 0.0008 * bead - 0.0012 * nearS * (1.0 - bead) + 0.0014 * bolt;
  s.rough = mix(mix(0.5 + 0.06 * mott, 0.32, wear), 0.82, rust * 0.7);
  s.metal = wear * 0.8 + edgeWear * 0.6;
  s.cav = (1.0 - 0.2 * (1.0 - lug) * smoothstep(-0.05, 0.02, ld) * 0.0) * (1.0 - 0.3 * nearS * (1.0 - bead));`,
    },
  },
];
