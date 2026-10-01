// Terrace Heights — stage surface materials (texlib layers), on this stage's three reserved PATTERN slots.
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
// The village is built from three surfaces that share walls:
//   calce   lime whitewash laid thick over rubble masonry (the stones read through as soft bumps, the wash runs in
//           vertical streaks, a few flakes show the grey stone and mortar beneath). Paint mask: the block colour tints
//           the limewash (white houses, ochre / pink / blue-grey houses, warm-grey retaining walls). Its top faces are
//           drawn as cotto, so every house gets a tiled roof terrace.
//   cotto   terracotta floor tiles: 30 cm octagons with glazed majolica "tozzetti" (cobalt, white, lemon) in the
//           corners, lime joints. Own colours, multiplied by the block colour (keep it a warm off-white); walls → calce.
//   pebble  ciottolato: rounded river pebbles set on edge in sandy mortar, framed every 2.4 m by limestone strips.
//           Own colours × block colour; walls → calce. (The piazza's black-and-white pebble rose is a mural.)
export const SURF = { calce: 43, cotto: 44, pebble: 45 };

const calce = {
  detail: 0.7, scale: 3.6, tint: true, mask: true, alpha: false, mode: 0, sym: 0, hr: [-0.004, 0.002], ao: 0.3,
  prep: `f[0] = FB(uv, ivec2(3), 4, 0.55, 4301u); f[1] = FB(uv, ivec2(14), 3, 0.5, 4303u); f[2] = FB(uv, ivec2(64), 2, 0.5, 4307u);
  f[3] = FB(uv, ivec2(36, 3), 3, 0.5, 4309u);
  vec2 wq = uv + 0.01 * vec2(sin(TAU * (5.0 * uv.y + 2.0 * uv.x)), sin(TAU * (4.0 * uv.x - 3.0 * uv.y) + 1.3));
  w[0] = WO(wq, ivec2(7, 11), 0.75, 4311u); w[1] = WO(uv + 0.012 * vec2(sin(TAU * 7.0 * uv.y), sin(TAU * 5.0 * uv.x)), ivec2(24), 0.9, 4313u);`,
  surf: /* glsl */`
  // rubble courses under a thick wash: stones ~0.5 x 0.33 m only read as soft bulges and faint joint shadows
  vec4 st = c[0];
  float sEdge = st.y - st.x;
  float joint = 1.0 - smoothstep(0.0, 0.22, sEdge);
  float dome = smoothstep(0.0, 0.6, sEdge);
  float blot = n[0], brush = n[1], grain = n[2];
  float runs = smoothstep(0.15, 0.75, n[3]);                                   // vertical runs of wash
  float wash = 0.87 * (1.0 + 0.035 * blot + 0.025 * brush + 0.02 * grain) * (1.0 - 0.035 * runs) * (1.0 - 0.012 * joint);
  wash *= 1.0 + 0.02 * (fract(st.z * 5.31) - 0.5);                              // each stone takes the wash a bit differently
  // flakes: wash lost to the stone and mortar beneath, in a few clusters
  vec4 fk = c[1];
  float cluster = smoothstep(0.25, 0.6, blot) * step(0.84, fract(fk.z * 7.3 + fk.w * 1.7));
  float flake = cluster * (1.0 - aa(0.0, (fk.x - 0.34 - 0.14 * grain) * 0.15));
  vec3 stoneC = mix(lin(vec3(0.66, 0.62, 0.55)), lin(vec3(0.56, 0.55, 0.52)), fract(st.z * 3.7)) * (0.9 + 0.18 * fract(st.z * 11.3));
  vec3 bare = mix(stoneC, lin(vec3(0.72, 0.69, 0.62)) * (0.95 + 0.1 * grain), smoothstep(0.4, 0.9, joint));
  // a hairline crack along a few joints
  float crack = (1.0 - aa(0.0005, sEdge * 0.35)) * step(0.88, fract(st.z * 13.1 + st.w * 5.7)) * smoothstep(0.1, 0.5, blot);
  s.alb = bare * flake;
  s.a = (1.0 - flake) * wash * (1.0 - 0.3 * crack);
  s.h = 0.0007 * dome - 0.0003 * joint * joint + 0.0004 * brush + 0.0001 * grain - 0.0012 * flake - 0.0005 * crack;
  s.rough = 0.9 - 0.05 * blot + 0.03 * flake;
  s.cav = 1.0 - 0.02 * joint - 0.2 * flake * joint - 0.25 * crack;`,
};

const cotto = {
  detail: 0.35, scale: 1.2, tint: true, alpha: false, mode: 1, sym: 7, hr: [-0.004, 0.0012], ao: 0.45,
  prep: `ivec2 tc = wrp(ivec2(floor(P / 0.3)), ivec2(4));
  f[0] = FB(uv, ivec2(4), 3, 0.5, 4401u); f[1] = FB(uv, ivec2(16), 3, 0.5, 4403u + uint(tc.x * 4 + tc.y) * 97u);
  f[2] = FB(uv, ivec2(96), 2, 0.5, 4407u); w[0] = WO(uv, ivec2(140), 1.0, 4411u);`,
  surf: /* glsl */`
  // 0.3 m octagonal terracotta tiles; 9 cm glazed majolica squares (tozzetti) where four octagons meet; 6 mm lime joints
  const float TS = 0.3, TH = 0.15, TC = 0.2511;          // tile size, half size, corner cut (|x| + |y| <= TC)
  ivec2 cell = ivec2(floor(P / TS));
  ivec2 cw = wrp(cell, ivec2(4));
  vec2 lp = P - (vec2(cell) + 0.5) * TS;
  vec2 ap = abs(lp);
  float d1 = TH - max(ap.x, ap.y);                       // to the straight joints (cell border)
  float d2 = (TC - (ap.x + ap.y)) * 0.70710678;          // to the corner cut (< 0 = inside the insert)
  bool ins = d2 < 0.0;
  float e = ins ? -d2 : min(d1, d2);
  vec2 pr = edgeProf(e, 0.003, ins ? 0.004 : 0.009, ins ? 0.0008 : 0.0022, 0.004);
  float inJ = pr.y;
  // tile tone: fired terracotta, per-tile value / hue, soft mottling, a few dark "flashed" tiles, worn paler centres
  float hid = hf(cw, 3u), hid2 = hf(cw, 7u), hid3 = hf(cw, 13u);
  vec3 terra = mix(lin(vec3(0.74, 0.47, 0.35)), lin(vec3(0.76, 0.55, 0.43)), hid2);
  terra = mix(terra, lin(vec3(0.6, 0.36, 0.27)), step(0.88, hid3) * 0.55);
  terra *= (0.9 + 0.18 * hid) * (1.0 + 0.08 * n[0] + 0.07 * n[1] + 0.03 * n[2]);
  float wear = smoothstep(0.03, 0.12, e) * smoothstep(-0.2, 0.6, n[0]);
  terra = mix(terra, terra * vec3(1.08, 1.1, 1.14), 0.35 * wear);
  float grain = smoothstep(0.05, 0.25, c[0].y - c[0].x) * (c[0].z - 0.5);
  terra *= 1.0 + 0.08 * grain;
  // tozzetti: glazed squares, mostly cobalt, some white and lemon, one per tile corner (id from the corner point)
  ivec2 corner = wrp(cell + ivec2(lp.x > 0.0 ? 1 : 0, lp.y > 0.0 ? 1 : 0), ivec2(4));
  float kid = hf(corner, 17u);
  vec3 glaze = kid < 0.3 ? lin(vec3(0.2, 0.36, 0.6)) : (kid < 0.95 ? lin(vec3(0.88, 0.86, 0.79)) : lin(vec3(0.88, 0.74, 0.34)));
  float ring = 1.0 - smoothstep(0.004, 0.012, e);          // a darker glaze line round each insert
  glaze *= (1.0 + 0.05 * n[1]) * (1.0 - 0.25 * ring);
  vec3 grout = lin(vec3(0.7, 0.66, 0.58)) * (1.0 + 0.06 * n[2]);
  vec3 col = ins ? glaze : terra;
  s.alb = mix(col, grout, inJ);
  s.h = pr.x + (ins ? 0.0002 * n[1] : 0.00025 * n[0] + 0.0001 * grain) * (1.0 - inJ);
  s.rough = mix(ins ? 0.22 + 0.05 * n[1] : 0.72 - 0.12 * wear + 0.06 * hid2, 0.93, inJ);
  s.cav = mix(1.0, 0.55, inJ);`,
};

const pebble = {
  detail: 0.5, scale: 2.4, tint: true, alpha: false, mode: 1, sym: 7, hr: [-0.007, 0.003], ao: 0.4,
  prep: `f[0] = FB(uv, ivec2(4), 4, 0.5, 4501u); f[1] = FB(uv, ivec2(24), 3, 0.5, 4503u); f[2] = FB(uv, ivec2(120), 2, 0.5, 4507u);
  w[0] = WO(uv, ivec2(40), 0.92, 4511u);`,
  surf: /* glsl */`
  // limestone strips (14 cm) along the repeat borders, jointed every 0.6 m; rounded pebbles (~6 cm) set in mortar
  float db = min(jd(P.x, 2.4), jd(P.y, 2.4));
  bool alongX = jd(P.y, 2.4) < jd(P.x, 2.4);
  float band = 1.0 - aa(0.07, db);
  float bj = jd(alongX ? P.x : P.y, 0.6);
  vec2 pb = edgeProf(min(0.07 - db, bj), 0.0025, 0.008, 0.002, 0.005);
  vec4 pc = c[0];
  float pe = pc.y - pc.x;                                  // pebble edge distance (cell units)
  float peb = smoothstep(0.04, 0.15, pe);
  float dome = sqrt(clamp(pe / 0.45, 0.0, 1.0));
  float id = pc.z, id2 = fract(id * 7.13);
  vec3 pcol = id < 0.4 ? lin(vec3(0.7, 0.69, 0.66)) : id < 0.7 ? lin(vec3(0.72, 0.68, 0.61)) : id < 0.84 ? lin(vec3(0.8, 0.79, 0.75))
            : id < 0.93 ? lin(vec3(0.55, 0.55, 0.54)) : lin(vec3(0.7, 0.63, 0.52));
  pcol *= (0.92 + 0.14 * id2) * (1.0 + 0.06 * n[2]) * (0.94 + 0.08 * dome);
  vec3 mortar = lin(vec3(0.66, 0.62, 0.55)) * (1.0 + 0.08 * n[1] + 0.04 * n[0]);
  vec3 lime = lin(vec3(0.8, 0.77, 0.7)) * (1.0 + 0.05 * n[0] + 0.04 * n[1] + 0.03 * n[2]) * (0.95 + 0.1 * hf(ivec2(floor((alongX ? P.x : P.y) / 0.6), 0), 5u));
  vec3 fill = mix(mortar, pcol, peb);
  float grime = smoothstep(0.1, 0.7, n[0]) * 0.08;
  s.alb = mix(fill, mix(lime, lime * 0.7, pb.y), band) * (1.0 - grime);
  s.h = mix(-0.004 + 0.0065 * dome * peb + 0.0002 * n[2], pb.x + 0.0002 * n[1], band);
  s.rough = mix(mix(0.93, 0.6 + 0.1 * id2, peb), mix(0.74, 0.92, pb.y), band);
  s.cav = mix(mix(0.7, 1.0, peb), mix(1.0, 0.65, pb.y), band);`,
};

export const SURFACES = [
  { slot: 43, name: 'calce', onTop: 44, mat: calce },
  { slot: 44, name: 'cotto', onWall: 43, mat: cotto },
  { slot: 45, name: 'pebble', onWall: 43, mat: pebble },
];
