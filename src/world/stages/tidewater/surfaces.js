// Tidewater Plaza — stage surface materials (texlib layers), on this stage's three reserved PATTERN slots.
//
// SURF maps your names to the slot ids; use them in layout.js as `pattern: SURF.<name>`. SURFACES lists what each
// slot holds: { slot, name, onWall?, onTop?, mat }.
//   mat      a texlib material, same fields as the entries of MATERIALS in src/world/texlib.js (detail, scale, tint,
//            mask, alpha, mode: 0 plain / 1 grid / 2 hex, sym, hr, ao, stair?, prep, surf — GLSL bodies that can use
//            every GEN_COMMON helper texlib's own materials use). Generated once at boot into its own layer.
//   onWall   PATTERN id drawn on this slot's vertical faces instead (default: the slot itself)
//   onTop    PATTERN id drawn on this slot's top faces instead (default: the slot itself)
// Unused slots fall back to concrete.
//
//   herringbone  clay brick pavers (240 x 120 mm) laid 90° herringbone, sanded joints: the civic squares
//   terrazzo     poured-and-polished promenade terrazzo: 1.2 m panels framed by brass strips, a darker border band,
//                marble / granite chips (white, grey, black, a little coral + seafoam): the promenade, the colonnade
//                walk, the Town Hall loggia
//   stucco       painted Regency stucco lined out as ashlar (400 mm courses, 1.2 m blocks, V-grooved bed joints),
//                trowel undulation, rain streaks, a few flakes of paint lost to the grey render: every building
// All three are paint masks (albedo.a = the block colour's coverage), so one surface serves every pastel.
export const SURF = { herringbone: 28, terrazzo: 29, stucco: 30 };

const herringbone = {
  detail: 0.6, scale: 2.4, tint: true, mask: true, alpha: false, mode: 0, sym: 0, hr: [-0.012, 0.0014], ao: 0.5,
  prep: `f[0] = FB(uv, ivec2(4), 4, 0.5, 2801u); f[1] = FB(uv, ivec2(40), 3, 0.5, 2803u); f[2] = FB(uv, ivec2(160), 2, 0.5, 2807u);
  w[0] = WO(uv, ivec2(120), 1.0, 2809u);`,
  surf: /* glsl */`
  // 90° herringbone of 2:1 bricks on a 120 mm cell grid: along each diagonal strand a stretcher (2 x 1 cells) and a
  // soldier (1 x 2) alternate; strands repeat every 4 cells, so the pattern tiles on 20 cells = 2.4 m exactly
  const float W = 0.12;
  vec2 p = P / W;
  ivec2 cc = ivec2(floor(p));
  float dd = float(cc.x - cc.y); dd -= 4.0 * floor(dd / 4.0);
  vec2 org = vec2(cc), ext = vec2(1.0, 2.0);
  if (dd < 1.5) { org.x -= dd; ext = vec2(2.0, 1.0); }
  else if (dd < 2.5) { org.y -= 1.0; }
  vec2 hb = ext * (0.5 * W);
  vec2 q = (p - org) * W - hb;
  float e = -sdRB(q, hb, 0.008);
  vec2 pr = edgeProf(e, 0.0028, 0.01, 0.0026, 0.009);
  float inJ = pr.y;
  ivec2 bid = wrp(ivec2(org), ivec2(20));
  float b1 = hf(bid, 3u), b2 = hf(bid, 5u), b3 = hf(bid, 7u), b4 = hf(bid, 11u);
  float mott = n[0], tex = n[1], sand = n[2];
  vec4 wc = c[0];
  float pit = step(0.9, wc.z) * (1.0 - aa(0.0025 + 0.002 * fract(wc.z * 7.3), wc.x * (2.4 / 120.0))) * (1.0 - inJ);
  vec2 qn = q / hb;
  float crown = 1.0 - 0.6 * dot(qn * qn, vec2(1.0));
  float tone = 0.8 * (1.0 + 0.24 * (b1 - 0.5)) * (1.0 + 0.06 * mott + 0.045 * tex + 0.03 * sand) * (1.0 - 0.14 * pit);
  tone *= b2 > 0.91 ? 0.74 : (b2 < 0.06 ? 1.12 : 1.0);                       // a few over-fired / pale bricks
  float arris = clamp(1.0 - (e - 0.0028) / 0.012, 0.0, 1.0) * (1.0 - inJ);
  float grime = (1.0 - smoothstep(0.0, 0.03, e - 0.0028)) * (1.0 - inJ) * (0.6 + 0.4 * smoothstep(-0.3, 0.6, mott));
  tone *= (1.0 - 0.1 * arris) * (1.0 - 0.14 * grime);
  float worn = smoothstep(0.1, 0.8, mott * 0.5 + 0.5 + 0.3 * (b4 - 0.5)) * max(crown, 0.0);   // foot-polished crowns
  vec3 joint = lin(vec3(0.63, 0.59, 0.51)) * (0.72 + 0.2 * sand + 0.16 * mott);
  s.alb = joint * inJ;
  s.a = (1.0 - inJ) * tone * (1.0 + 0.05 * worn);
  s.h = pr.x + (0.0006 * max(crown, 0.0) * (0.4 + 0.6 * b3) + 0.00015 * tex + 0.00008 * sand - 0.0012 * pit) * (1.0 - inJ);
  s.rough = mix(0.8 + 0.06 * tex - 0.14 * worn, 0.95, inJ);
  s.cav = mix(1.0, 0.55, inJ) * (1.0 - 0.3 * pit);`,
};

const terrazzo = {
  detail: 0.3, scale: 2.4, tint: true, mask: true, alpha: false, mode: 1, sym: 4, hr: [-0.0016, 0.0006], ao: 0.3,
  prep: `f[0] = FB(uv, ivec2(4), 4, 0.5, 2901u); f[1] = FB(uv, ivec2(64), 2, 0.5, 2903u); f[2] = FB(uv, ivec2(12), 3, 0.5, 2907u);
  w[0] = WO(uv, ivec2(72), 1.0, 2909u); w[1] = WO(uv, ivec2(180), 1.0, 2911u);`,
  surf: /* glsl */`
  // 1.2 m panels in a two-tone chequer, each framed by an 11 cm darker border band; brass divider strips on the panel
  // joints and a finer one at the band's inner edge; the matrix takes the block colour, the chips keep their own
  // (mostly pale marble, a little grey, rare black / coral / seafoam) — calm at distance, crisp close up
  ivec2 pc = wrp(ivec2(floor(P / 1.2)), ivec2(2));
  float chk = float((pc.x + pc.y) & 1);
  float dS = min(jd(P.x, 1.2), jd(P.y, 1.2));
  float strip = 1.0 - aa(0.0024, dS);
  float line2 = 1.0 - aa(0.0016, abs(dS - 0.11));
  float band = 1.0 - aa(0.11, dS);
  vec4 A = c[0], Bc = c[1];
  float rA = 0.16 + 0.2 * fract(A.z * 5.3), rB = 0.2 + 0.18 * fract(Bc.z * 3.7);
  float chipA = (1.0 - smoothstep(rA - 0.05, rA + 0.05, A.x)) * step(0.3, A.z);
  float chipB = (1.0 - smoothstep(rB - 0.08, rB + 0.08, Bc.x)) * step(0.35, Bc.z) * (1.0 - chipA);
  vec3 cw = lin(vec3(0.95, 0.94, 0.91)), cc2 = lin(vec3(0.86, 0.83, 0.77)), cg = lin(vec3(0.6, 0.6, 0.59)), ck = lin(vec3(0.2, 0.2, 0.21));
  vec3 cp = lin(vec3(0.86, 0.62, 0.54)), cs = lin(vec3(0.55, 0.72, 0.66));
  float ia = fract(A.z * 13.37), ib = fract(Bc.z * 7.77);
  vec3 colA = ia < 0.4 ? cw : (ia < 0.66 ? cc2 : (ia < 0.82 ? cg : (ia < 0.89 ? ck : (ia < 0.95 ? cp : cs))));
  vec3 colB = ib < 0.55 ? cw : (ib < 0.85 ? cc2 : cg);
  float mott = n[0], fine = n[1], cloud = n[2];
  float tone = 0.8 * mix(1.0, 0.86, chk) * mix(1.0, 0.7, band) * (1.0 + 0.05 * mott + 0.035 * cloud + 0.02 * fine);
  float dirt = (1.0 - smoothstep(0.0, 0.05, dS)) * (1.0 - strip) * smoothstep(-0.2, 0.6, mott);
  tone *= 1.0 - 0.1 * dirt;
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, colA * (0.9 + 0.18 * fract(A.z * 3.1)), chipA); cov *= 1.0 - chipA;
  own = mix(own, colB * (0.92 + 0.12 * fine), chipB); cov *= 1.0 - chipB;
  float br = max(strip, line2 * 0.85);
  vec3 brass = lin(vec3(0.74, 0.58, 0.32)) * (0.8 + 0.25 * fine + 0.1 * mott);
  own = mix(own, brass, br); cov *= 1.0 - br;
  s.alb = own; s.a = cov * tone;
  float worn = smoothstep(-0.1, 0.7, cloud);
  s.h = 0.00018 * mott + 0.00004 * fine + 0.00005 * (chipA + chipB) - 0.0005 * dirt - 0.0002 * br;
  s.rough = mix(0.44 + 0.06 * fine + 0.12 * worn, 0.3, chipA + chipB);
  s.rough = mix(s.rough, 0.38, br);
  s.metal = br * 0.8;
  s.cav = 1.0 - 0.2 * dirt;`,
};

const stucco = {
  detail: 0.6, scale: 2.4, tint: true, mask: true, alpha: false, mode: 1, sym: 1, hr: [-0.008, 0.0012], ao: 0.5,
  prep: `f[0] = FB(uv, ivec2(4), 4, 0.55, 3001u); f[1] = FB(uv, ivec2(24), 3, 0.5, 3003u); f[2] = FB(uv, ivec2(28, 3), 3, 0.5, 3007u);
  f[3] = FB(uv, ivec2(96), 2, 0.5, 3011u); w[0] = WO(uv, ivec2(10), 0.85, 3013u); w[1] = WO(uv, ivec2(200), 1.0, 3017u);`,
  surf: /* glsl */`
  // ashlar lining: 400 mm courses, 1.2 m blocks in half bond, V-grooved bed joints (8 mm half-width) and finer
  // perpends; float-finished paint with trowel undulation, soot/rain streaks under each bed joint, hairline cracks,
  // a few flakes of paint lost to the grey render beneath (untinted)
  const float CH = 0.4, BL = 1.2;
  float row = floor(P.y / CH);
  float ly = P.y - row * CH;
  float bx = P.x - mod(row, 2.0) * 0.6;
  float col = floor(bx / BL);
  float lx = bx - col * BL;
  ivec2 bid = wrp(ivec2(int(col), int(row)), ivec2(2, 6));
  float eH = min(ly, CH - ly), eV = min(lx, BL - lx);
  float gH = max(0.0, 1.0 - eH / 0.007), gV = max(0.0, 1.0 - eV / 0.0035);
  float groove = max(gH, gV * 0.8);
  float hJ = -max(0.0045 * gH, 0.002 * gV);
  float b1 = hf(bid, 3u), b2 = hf(bid, 5u);
  float mott = n[0], und = n[1], streak = n[2], fine = n[3];
  vec4 k = c[0];
  float crack = (1.0 - aa(0.0014, (k.y - k.x) * 0.24)) * step(0.7, fract(k.z * 9.1 + k.w * 3.3)) * smoothstep(0.1, 0.5, mott);
  vec4 g = c[1];
  float grain = smoothstep(0.03, 0.25, g.y - g.x) * (1.0 - g.x * g.x);
  float flake = step(0.9, fract(k.w * 13.7 + k.z)) * (1.0 - aa(0.0, (k.x - 0.1 - 0.06 * fine) * 0.24)) * step(0.25, mott);
  float soot = (1.0 - smoothstep(0.0, 0.16, CH - ly)) * smoothstep(0.1, 0.8, streak * 0.5 + 0.5);   // under each bed joint
  float rain = smoothstep(0.35, 0.95, streak * 0.5 + 0.5) * (0.5 + 0.5 * smoothstep(-0.2, 0.6, mott));
  float paint = 0.8 * (1.0 + 0.035 * (b1 - 0.5) + 0.03 * und + 0.025 * fine + 0.04 * mott) * (1.0 - 0.07 * soot - 0.06 * rain) * (1.0 - 0.12 * crack);
  paint *= 1.0 - 0.12 * groove;
  vec3 bare = lin(vec3(0.56, 0.55, 0.52)) * (1.0 + 0.08 * grain);
  s.alb = bare * flake; s.a = (1.0 - flake) * paint;
  s.h = hJ + (0.0005 * und + 0.00025 * grain + 0.00008 * fine) * (1.0 - groove) - 0.0006 * crack - 0.0004 * flake;
  s.rough = 0.74 + 0.06 * mott - 0.04 * und + 0.06 * flake + 0.05 * rain;
  s.cav = (1.0 - 0.32 * groove) * (1.0 - 0.15 * crack);`,
};

export const SURFACES = [
  { slot: 28, name: 'herringbone', mat: herringbone, onWall: 30 },   // slab edges / sea wall: ashlar
  { slot: 29, name: 'terrazzo', mat: terrazzo, onWall: 30 },
  { slot: 30, name: 'stucco', mat: stucco, onTop: 29 },            // terraces, stages, sills: terrazzo on top
];
