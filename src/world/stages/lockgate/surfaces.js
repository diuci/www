// Lockgate Canals — stage surface materials (texlib layers), on this stage's three reserved PATTERN slots.
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
//   setts      granite setts in courses (wharf, yard, streets, bridge crest): walls read as engineering brick
//   engbrick   English-bond engineering brick: vitrified blue headers, lime mortar, bloom + damp at the foot
//   hoofsteps  cobbled ramp with raised granite horse-step ribs across the slope (bridge approaches, horse ramps)
export const SURF = { setts: 40, engbrick: 41, hoofsteps: 42 };

const GRID = 1;

export const SURFACES = [
  {
    slot: 40, name: 'setts', onWall: 41,
    mat: {
      detail: 0.6, scale: 2.0, tint: true, mask: true, alpha: false, mode: GRID, sym: 1, hr: [-0.016, 0.006], ao: 0.55,
      prep: `f[0] = FB(uv, ivec2(5), 4, 0.5, 4001u); f[1] = FB(uv, ivec2(12), 3, 0.5, 4003u); f[2] = FB(uv, ivec2(48), 2, 0.5, 4007u);
  w[0] = WO(uv, ivec2(260), 1.0, 4011u); w[1] = WO(uv, ivec2(40), 0.9, 4013u);`,
      surf: /* glsl */`
  // granite setts laid in courses along u: 125 mm courses, each course its own sett length (2 m / 8…11) and phase,
  // 10-16 mm joints of dark grit (moss creeping in along damp patches), domed polished tops, arris wear, per-sett tone
  // (grey, pink and blue-grey granite), crystal speckle. albedo.a = the stone (block colour), rgb = joints + speckle.
  const float RH = 0.125;
  int row = int(floor(P.y / RH));
  int rw = int(mod(float(row), 16.0));
  float ly = P.y - float(row) * RH;
  float nr = 8.0 + floor(hf(ivec2(rw, 0), 41u) * 3.999);
  float SL = 2.0 / nr;
  float xs = P.x - hf(ivec2(rw, 1), 43u) * SL;
  float ci = floor(xs / SL);
  float lx = xs - ci * SL;
  ivec2 sid = ivec2(int(mod(ci, nr)), rw);
  vec2 jit = (hf2(sid, 47u) - 0.5) * vec2(0.012, 0.006);
  float jw = 0.0055 + 0.0025 * hf(sid, 53u);
  vec2 lp = vec2(lx - SL * 0.5, ly - RH * 0.5) - jit;
  vec2 hs = vec2(SL * 0.5 - jw - 0.002, RH * 0.5 - jw - 0.001);
  float e = jw - sdRB(lp, hs, 0.02);
  vec2 pr = edgeProf(e, jw, 0.016, 0.005, 0.013);
  float inJ = pr.y;
  float dome = max(0.0, 1.0 - pow(lp.x / hs.x, 2.0)) * max(0.0, 1.0 - pow(lp.y / hs.y, 2.0));
  vec2 tilt = hf2(sid, 59u) - 0.5;
  float h1 = hf(sid, 61u), h2 = hf(sid, 67u);
  float mott = n[0], cloud = n[1], fine = n[2];
  vec4 g = c[0];
  float crystal = smoothstep(0.05, 0.25, g.y - g.x);
  float spk = step(0.86, g.z) * crystal, dk = step(g.z, 0.12) * crystal;
  float tone = 0.8 * (0.84 + 0.3 * h1) * (1.0 + 0.05 * mott + 0.03 * fine);
  float polish = smoothstep(0.35, 0.9, dome) * smoothstep(-0.2, 0.5, cloud);
  tone *= 1.0 + 0.06 * polish;
  float arris = clamp(1.0 - (e - jw) / 0.02, 0.0, 1.0) * (1.0 - inJ);
  tone *= 1.0 - 0.1 * arris;
  // stone hue: most grey, some pink (warm), some blue-grey (cool): own-colour offsets are added on top of the tint
  vec3 hue = h2 < 0.22 ? lin(vec3(0.16, 0.09, 0.07)) : (h2 > 0.8 ? lin(vec3(0.05, 0.07, 0.1)) : vec3(0.0));
  float moss = smoothstep(0.25, 0.75, cloud * 0.6 + 0.4 * mott) * (0.4 + 0.6 * smoothstep(0.0, 0.02, 0.02 - (e - jw)));
  vec3 grit = mix(lin(vec3(0.2, 0.19, 0.17)) * (0.8 + 0.4 * fine), lin(vec3(0.2, 0.25, 0.12)), moss * 0.8);
  vec3 own = hue * (1.0 - inJ) * 0.6;
  own = mix(own, lin(vec3(0.9, 0.88, 0.84)), spk * 0.5 * (1.0 - inJ));
  own = mix(own, lin(vec3(0.08, 0.08, 0.09)), dk * 0.5 * (1.0 - inJ));
  own = mix(own, grit, inJ);
  float cov = (1.0 - inJ) * (1.0 - 0.5 * spk) * (1.0 - 0.5 * dk);
  // a thin film of moss on the sett edges in the damp patches
  float edgeMoss = moss * arris * 0.5;
  own = mix(own, lin(vec3(0.16, 0.22, 0.1)), edgeMoss); cov *= 1.0 - edgeMoss;
  s.alb = own; s.a = cov * tone;
  s.h = pr.x + (0.0045 * dome + dot(tilt, lp) * 0.02) * (1.0 - inJ) + 0.00012 * fine * (1.0 - inJ) + 0.0002 * crystal * (g.z - 0.5);
  s.rough = mix(0.78 - 0.22 * polish + 0.05 * mott - 0.1 * spk, 0.96, inJ);
  s.cav = mix(1.0, 0.45, inJ) * (1.0 - 0.15 * arris);`,
    },
  },
  {
    slot: 41, name: 'engbrick', onTop: 40,
    mat: {
      detail: 0.55, scale: 1.8, tint: true, mask: true, alpha: false, mode: GRID, sym: 1, hr: [-0.009, 0.001], ao: 0.5,
      prep: `f[0] = FB(uv, ivec2(72), 3, 0.5, 4101u); f[1] = FB(uv, ivec2(5), 4, 0.5, 4103u); f[2] = FB(uv, ivec2(144), 2, 0.5, 4107u);
  f[3] = FB(uv, ivec2(9, 3), 3, 0.5, 4109u); w[0] = WO(uv, ivec2(150), 1.0, 4111u);`,
      surf: /* glsl */`
  // English bond engineering brick (225 x 75 mm stretchers, 112 mm headers, 10 mm lime joints struck flush and a
  // little recessed): alternating stretcher / header courses, a share of the headers vitrified blue-black and glossy,
  // per-brick tone + firing variation, crisp arrises, lime bloom and damp darkening toward the foot of the repeat.
  // albedo.a = the brick body (block colour: red or blue), rgb = mortar, vitrified faces, bloom.
  const float CH = 0.075;
  int row = int(floor(P.y / CH));
  float ly = P.y - float(row) * CH;
  bool header = int(mod(float(row), 2.0)) == 1;
  float BL = header ? 0.1125 : 0.225;
  float bx = P.x - (header ? 0.0 : 0.05625);
  int ci = int(floor(bx / BL));
  float lx = bx - float(ci) * BL;
  ivec2 bid = wrp(ivec2(ci, row), ivec2(header ? 16 : 8, 24));
  vec2 lp = vec2(lx - BL * 0.5, ly - CH * 0.5);
  float e = 0.005 - sdRB(lp, vec2(BL * 0.5 - 0.005, CH * 0.5 - 0.005), 0.003);
  vec2 pr = edgeProf(e, 0.005, 0.004, 0.0015, 0.004);
  float inM = pr.y;
  float h1 = hf(bid, 3u), h2 = hf(bid, 5u), h3 = hf(bid, 7u);
  float sand = n[0], mott = n[1], fine = n[2];
  bool vit = header && h2 < 0.42;
  float tone = 0.8 * (0.8 + 0.34 * h1) * (1.0 + 0.03 * sand + 0.03 * mott);
  float face = max(0.0, 1.0 - pow(lp.x / (BL * 0.5), 6.0)) * max(0.0, 1.0 - pow(lp.y / (CH * 0.5), 6.0));
  // lime bloom: soft white runs under some joints + a chalky band near the foot; damp darkening at the foot
  float foot = 1.0 - smoothstep(0.0, 0.55, P.y);
  float bloom = smoothstep(0.35, 0.85, n[3] * 0.5 + 0.5) * (0.35 + 0.65 * foot) * smoothstep(0.1, 0.9, mott * 0.5 + 0.5);
  float damp = foot * smoothstep(-0.3, 0.4, mott) * 0.5;
  vec3 mortar = lin(vec3(0.66, 0.64, 0.6)) * (0.9 + 0.12 * fine + 0.05 * sand);
  vec3 vitC = lin(vec3(0.16, 0.17, 0.2)) * (0.8 + 0.5 * h3) * (1.0 + 0.1 * sand);
  vec3 own = vec3(0.0); float cov = 1.0;
  if (vit) { own = vitC; cov = 0.12; }
  own = mix(own, mortar, inM); cov *= 1.0 - inM;
  own = mix(own, lin(vec3(0.82, 0.8, 0.76)), bloom * 0.35); cov *= 1.0 - bloom * 0.35;
  own *= 1.0 - 0.3 * damp;
  s.alb = own; s.a = cov * tone * (1.0 - 0.3 * damp) * (1.0 - 0.06 * (1.0 - face) * (1.0 - inM));
  s.h = pr.x + (0.0004 * face * h3 + 0.00015 * sand) * (1.0 - inM) - 0.0006 * inM * fine;
  s.rough = mix(vit ? 0.34 + 0.1 * sand : 0.78 + 0.06 * sand - 0.05 * h1, 0.93, inM);
  s.rough = mix(s.rough, 0.9, bloom * 0.4);
  s.cav = mix(1.0, 0.62, inM) * (1.0 - 0.1 * damp);`,
    },
  },
  {
    slot: 42, name: 'hoofsteps', onWall: 41,
    mat: {
      detail: 0.5, scale: 1.8, stair: [0.45, 4, 0.55, 3], tint: true, mask: true, alpha: false, mode: GRID, sym: 1, hr: [-0.016, 0.03], ao: 0.4,
      prep: `f[0] = FB(uv, ivec2(5), 4, 0.5, 4201u); f[1] = FB(uv, ivec2(12), 3, 0.5, 4203u); f[2] = FB(uv, ivec2(48), 2, 0.5, 4207u);
  w[0] = WO(uv, ivec2(220), 1.0, 4211u);`,
      surf: /* glsl */`
  // horse steps: every 0.45 m down the slope a raised granite kerb rib (110 mm, 25 mm proud, rounded, darker and
  // polished by hooves and boots) across the ramp; between the ribs setts in courses across the slope, dished a little
  // toward the rib below. v runs downhill. albedo.a = stone (block colour).
  const float PD = 0.45, RH = 0.1125;
  float j = floor(P.y / PD);
  float a = P.y - j * PD;                                  // metres below this period's rib line
  float rb = 0.055 - abs(a - 0.055);                       // inside the rib when > 0 (rib spans a 0 … 0.11)
  float rib = smoothstep(-PX, PX, rb);
  float ribH = 0.025 * sqrt(clamp(rb / 0.02, 0.0, 1.0));
  // setts between the ribs: 4 courses of 112 mm, per-course length + phase
  float sy = a - 0.11;
  int crs = int(floor(max(sy, 0.0) / 0.085));
  int cw = int(mod(j * 4.0 + float(crs), 16.0));
  float ly = sy - float(crs) * 0.085;
  float nr = 7.0 + floor(hf(ivec2(cw, 0), 71u) * 2.999);
  float SL = 1.8 / nr;
  float xs = P.x - hf(ivec2(cw, 1), 73u) * SL;
  float ci = floor(xs / SL);
  float lx = xs - ci * SL;
  ivec2 sid = ivec2(int(mod(ci, nr)), cw);
  vec2 lp = vec2(lx - SL * 0.5, ly - 0.0425);
  vec2 hs = vec2(SL * 0.5 - 0.007, 0.0425 - 0.006);
  float e = 0.006 - sdRB(lp, hs, 0.016);
  vec2 pr = edgeProf(e, 0.006, 0.012, 0.004, 0.012);
  float inJ = pr.y * (1.0 - rib) * step(0.0, sy);
  float dome = max(0.0, 1.0 - pow(lp.x / hs.x, 2.0)) * max(0.0, 1.0 - pow(lp.y / hs.y, 2.0));
  float dish = -0.012 * (1.0 - smoothstep(0.11, PD, a));   // worn hollow just below each rib
  float h1 = hf(sid, 79u);
  float mott = n[0], cloud = n[1], fine = n[2];
  vec4 g = c[0];
  float crystal = smoothstep(0.05, 0.25, g.y - g.x);
  float spk = step(0.87, g.z) * crystal;
  float tone = 0.8 * (0.85 + 0.28 * h1) * (1.0 + 0.05 * mott + 0.03 * fine);
  float ribTone = 0.8 * (0.72 + 0.1 * hf(ivec2(int(mod(j, 4.0)), 0), 83u)) * (1.0 + 0.04 * fine);
  float ribPol = rib * smoothstep(0.004, 0.02, rb);
  vec3 grit = lin(vec3(0.2, 0.19, 0.17)) * (0.8 + 0.4 * fine);
  vec3 own = mix(vec3(0.0), lin(vec3(0.9, 0.88, 0.84)), spk * 0.4);
  own = mix(own, grit, inJ);
  float cov = (1.0 - inJ) * (1.0 - 0.4 * spk);
  // grit banked against the uphill face of each rib
  float bank = (1.0 - smoothstep(0.11, 0.16 + 0.03 * cloud, a)) * (1.0 - rib) * smoothstep(-0.2, 0.4, cloud);
  own = mix(own, grit * 1.2, bank * 0.6); cov *= 1.0 - bank * 0.6;
  s.alb = own;
  s.a = cov * mix(tone, ribTone * (1.0 + 0.12 * ribPol), rib);
  float hS = pr.x + 0.004 * dome * (1.0 - inJ) + dish;
  s.h = mix(hS, max(hS, ribH), rib) + 0.00012 * fine;
  s.rough = mix(mix(0.8 + 0.05 * mott - 0.1 * spk, 0.96, inJ), 0.5 - 0.15 * ribPol, rib);
  s.cav = mix(1.0, 0.45, inJ) * (1.0 - 0.45 * exp(-pow((a - 0.113) / 0.008, 2.0)) * (1.0 - rib));`,
    },
  },
];
