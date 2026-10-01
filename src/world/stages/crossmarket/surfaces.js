// Crossroads Market — stage surface materials (texlib layers), on this stage's three reserved PATTERN slots.
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
//   setts    granite cobble setts in courses across u (the streets, the square, the forecourts)
//   ashlar   coursed sandstone blocks: the stone buildings, the spawn terrace, quay walls — and, on top faces, the
//            stone-flag pavements / hall floor (the same coursed stone reads as flags in running bond)
//   tramway  grooved tram rails (gauge 1.435 m, centred across a 2.5 m strip; u runs along the track) in setts
export const SURF = { setts: 37, ashlar: 38, tramway: 39 };

const GRID = 1, PLAIN = 0;

// shared GLSL: one sett course. a = along the course (m), b = across (m), CH = course height, SL = mean sett length,
// NS / NR = setts per course / courses per repeat (the jitter hash wraps on them), seed. Returns
// (edge distance e (m, > 0 inside the sett), local x / half-length, local y / half-height, sett id hash)
const COURSE = (fn, CH, SL, NS, NR, JIT, R) => /* glsl */`
  float rowf_${fn} = floor(b / ${CH});
  int rid_${fn} = wrp(ivec2(int(rowf_${fn}), 0), ivec2(${NR}, 1)).x;
  float ly_${fn} = b - rowf_${fn} * ${CH};
  float xs_${fn} = a - hf(ivec2(rid_${fn}, 3), 5u) * ${SL};
  float kf_${fn} = floor(xs_${fn} / ${SL});
  float b0_${fn} = kf_${fn} * ${SL} + (hf(wrp(ivec2(int(kf_${fn}), rid_${fn}), ivec2(${NS}, ${NR})), 7u) - 0.5) * ${JIT};
  float b1_${fn} = (kf_${fn} + 1.0) * ${SL} + (hf(wrp(ivec2(int(kf_${fn}) + 1, rid_${fn}), ivec2(${NS}, ${NR})), 7u) - 0.5) * ${JIT};
  if (xs_${fn} < b0_${fn}) { b1_${fn} = b0_${fn}; kf_${fn} -= 1.0; b0_${fn} = kf_${fn} * ${SL} + (hf(wrp(ivec2(int(kf_${fn}), rid_${fn}), ivec2(${NS}, ${NR})), 7u) - 0.5) * ${JIT}; }
  else if (xs_${fn} > b1_${fn}) { b0_${fn} = b1_${fn}; kf_${fn} += 1.0; b1_${fn} = (kf_${fn} + 1.0) * ${SL} + (hf(wrp(ivec2(int(kf_${fn}) + 1, rid_${fn}), ivec2(${NS}, ${NR})), 7u) - 0.5) * ${JIT}; }
  ivec2 sid_${fn} = wrp(ivec2(int(kf_${fn}), rid_${fn}), ivec2(${NS}, ${NR}));
  vec2 hb_${fn} = vec2((b1_${fn} - b0_${fn}) * 0.5, ${CH} * 0.5);
  vec2 lp_${fn} = vec2(xs_${fn} - (b0_${fn} + b1_${fn}) * 0.5, ly_${fn} - ${CH} * 0.5);
  float e_${fn} = -sdRB(lp_${fn}, hb_${fn}, ${R});
  vec4 ${fn} = vec4(e_${fn}, lp_${fn} / hb_${fn}, hf(sid_${fn}, 11u));
`;

// granite sett shading shared by the street setts and the tramway (q = COURSE result, d = dome 0..1)
const SETT_LOOK = /* glsl */`
  float t1 = q.w, t2 = fract(q.w * 7.31), t3 = fract(q.w * 13.7);
  vec3 hue = t2 < 0.34 ? vec3(1.05, 0.985, 0.94) : (t2 < 0.67 ? vec3(0.955, 0.99, 1.04) : vec3(1.0));
  float dome = clamp((1.0 - q.y * q.y) * (1.0 - q.z * q.z), 0.0, 1.0);
  float wear = smoothstep(0.15, 0.75, n[0] * 0.5 + 0.5 + 0.35 * (t3 - 0.5)) * dome;           // traffic-polished crowns
  vec4 g = c[0];
  float cell = g.x * GS;
  float fleck = step(0.86, g.z) * (1.0 - aa(0.0035 + 0.002 * fract(g.z * 5.3), cell));        // dark mica flecks
  float felds = step(0.9, fract(g.z * 7.1)) * (1.0 - aa(0.003, cell)) * (1.0 - step(0.86, g.z)); // pale feldspar
  float tone = 0.8 * (1.0 + 0.26 * (t1 - 0.5)) * (1.0 + 0.05 * n[1] + 0.03 * n[2]);
  vec3 stone = vec3(tone) * hue * (1.0 - 0.3 * fleck) * (1.0 + 0.18 * felds) * (1.0 + 0.07 * wear);
  stone *= 1.0 - 0.1 * clamp(1.0 - (q.x - 0.006) / 0.02, 0.0, 1.0);                          // darker toward the arris
  float moss = smoothstep(0.25, 0.8, n[1] * 0.5 + 0.5 + 0.25 * n[3]);
  vec3 joint = mix(vec3(0.33, 0.315, 0.29), vec3(0.25, 0.3, 0.2), moss * 0.7) * (1.0 + 0.18 * n[2]);
`;

export const SURFACES = [
  {
    slot: 37, name: 'setts', onWall: 38,
    mat: {
      detail: 0.55, scale: 1.92, tint: true, alpha: false, mode: GRID, sym: 3, hr: [-0.02, 0.006], ao: 0.6,
      prep: `f[0] = FB(uv, ivec2(3), 4, 0.5, 3701u); f[1] = FB(uv, ivec2(12), 3, 0.5, 3703u); f[2] = FB(uv, ivec2(96), 2, 0.5, 3709u);
  f[3] = FB(uv, ivec2(40), 2, 0.5, 3713u); w[0] = WO(uv, ivec2(150), 1.0, 3711u);`,
      surf: /* glsl */`
  // granite setts: 0.16 m courses along u, setts 0.24 m ± 4 cm with a random bond per course, 11 mm sand joints (grit
  // and a little moss), domed and traffic-polished crowns, per-sett granite (grey / warm / blue-grey), mica + feldspar
  const float GS = 1.92 / 150.0;
  float a = P.x, b = P.y;
  ${COURSE('q', '0.16', '0.24', 8, 12, '0.08', '0.024')}
  ${SETT_LOOK}
  vec2 pr = edgeProf(q.x, 0.0055, 0.03, 0.009, 0.016);
  float inJ = pr.y;
  s.alb = mix(stone, joint, inJ);
  s.h = pr.x + 0.0045 * dome * (1.0 - inJ) + 0.00015 * n[1] - 0.0002 * fleck;
  s.rough = mix(0.74 - 0.26 * wear + 0.05 * n[2], 0.96, inJ);
  s.cav = mix(1.0, 0.42, inJ);`,
    },
  },
  {
    slot: 38, name: 'ashlar',
    mat: {
      detail: 0.8, scale: 2.88, tint: true, alpha: false, mode: GRID, sym: 1, hr: [-0.009, 0.0025], ao: 0.5,
      prep: `f[0] = FB(uv, ivec2(4), 4, 0.5, 3801u); f[1] = FB(uv, ivec2(12), 3, 0.5, 3803u); f[2] = FB(uv, ivec2(120), 2, 0.5, 3807u);
  f[3] = Req(vec2(uv.x * 6.0, uv.y * 90.0), ivec2(6, 90), 3, 0.5, 3809u); w[0] = WO(uv, ivec2(48), 0.9, 3811u);`,
      surf: /* glsl */`
  // coursed sandstone ashlar: 0.36 m courses, blocks 0.72 m ± 0.18 in a random bond, 7 mm lime joints, a drafted
  // margin (smooth 25 mm band) round a boasted face with diagonal tooling, per-block tone + bedding lines, a few
  // weathered / iron-stained blocks. On top faces it reads as flagstones in running bond.
  float a = P.x, b = P.y;
  ${COURSE('q', '0.36', '0.72', 4, 8, '0.36', '0.004')}
  vec2 pr = edgeProf(q.x, 0.0035, 0.006, 0.0022, 0.006);
  float inJ = pr.y;
  float face = smoothstep(0.018, 0.03, q.x);                       // 0 in the drafted margin, 1 on the tooled face
  float t1 = q.w, t2 = fract(q.w * 7.31), t3 = fract(q.w * 3.77);
  float tool = 0.5 + 0.5 * sin((a + b) * 190.0 + 3.0 * n[2] + t1 * 20.0);
  float bed = n[3];
  vec3 hue = mix(vec3(1.035, 0.99, 0.935), vec3(0.975, 0.99, 1.015), t2);
  float tone = 0.8 * (1.0 + 0.14 * (t1 - 0.5)) * (1.0 + 0.04 * n[1] + 0.03 * bed) * (1.0 - 0.035 * face * tool);
  float worn = step(0.86, t3) * smoothstep(-0.2, 0.5, n[0]);         // weathered block: darker, rougher, pitted
  vec4 g = c[0];
  float pit = worn * step(0.6, g.z) * (1.0 - aa(0.006, g.x * (2.88 / 48.0) * 0.4));
  float stain = step(0.95, fract(t1 * 17.3)) * smoothstep(0.2, -0.6, q.z) * 0.6;   // rust run from an old iron fixing
  vec3 col = vec3(tone) * hue * (1.0 - 0.1 * worn) * (1.0 - 0.25 * pit);
  col = mix(col, col * vec3(1.06, 0.86, 0.7), stain);
  col *= 1.0 + 0.03 * (1.0 - face);                                   // the smoother margin catches a little more light
  vec3 mort = vec3(0.9, 0.88, 0.83) * (1.0 + 0.05 * n[2]);
  s.alb = mix(col, mort, inJ);
  s.h = pr.x + (0.0012 * face * (0.55 + 0.45 * n[2]) + 0.00025 * face * tool - 0.0015 * pit + 0.0002 * bed) * (1.0 - inJ);
  s.rough = mix(0.78 + 0.06 * face + 0.08 * worn, 0.93, inJ);
  s.cav = mix(1.0, 0.7, inJ) * (1.0 - 0.3 * pit);`,
    },
  },
  {
    slot: 39, name: 'tramway', onWall: 38,
    mat: {
      detail: 0.5, scale: 2.5, tint: true, mask: true, alpha: false, mode: PLAIN, sym: 0, hr: [-0.028, 0.006], ao: 0.6,
      prep: `f[0] = FB(uv, ivec2(3), 4, 0.5, 3901u); f[1] = FB(uv, ivec2(12), 3, 0.5, 3903u); f[2] = FB(uv, ivec2(96), 2, 0.5, 3907u);
  f[3] = FB(uv, ivec2(40), 2, 0.5, 3913u); w[0] = WO(uv, ivec2(190), 1.0, 3911u);`,
      surf: /* glsl */`
  // tramway strip (2.5 m across v, the track along u): two grooved girder rails at 1.435 m gauge, a border course of
  // long setts along each rail, and elsewhere setts in courses ACROSS the track. albedo.a = sett (block colour),
  // rgb = the rails' own steel (bright polished head, dark groove, duller lip). Plain repeat (the rails sit at fixed v).
  const float GS = 2.5 / 190.0;
  float yc = P.y - 1.25;
  float d = abs(yc) - 0.7175;                      // signed distance from the rail's gauge line (< 0 = inside the gauge)
  float a, b;
  vec4 q;
  bool border = abs(d) < 0.17;
  if (border) {
    // one course of long setts (0.3125 m, 8 per repeat) running along the rail either side of it
    a = P.x; b = (d < 0.0 ? -d - 0.05 : d - 0.05) + (yc > 0.0 ? 0.0 : 0.37);
    ${COURSE('q1', '0.12', '0.3125', 8, 4, '0.05', '0.018')}
    q = q1;
  } else {
    // setts in courses across the track: courses stacked along u (16 per repeat), setts along v
    a = P.y; b = P.x;
    ${COURSE('q2', '0.15625', '0.25', 10, 16, '0.08', '0.024')}
    q = q2;
  }
  ${SETT_LOOK}
  vec2 pr = edgeProf(q.x, 0.0055, 0.03, 0.009, 0.016);
  float inJ = pr.y;
  // rail: head (outer side), groove (inner side), guard lip — 0.07 m across, set flush in a tarred joint
  float rz = 1.0 - smoothstep(0.052 - PX, 0.052 + PX, abs(d + 0.008));
  float head = (1.0 - smoothstep(0.03 - PX, 0.03 + PX, abs(d - 0.018))) * rz;
  float groove = (1.0 - smoothstep(0.016 - PX, 0.016 + PX, abs(d + 0.02))) * rz;
  float lip = rz * (1.0 - head) * (1.0 - groove);
  float tar = (1.0 - smoothstep(0.052, 0.062, abs(d + 0.008))) * (1.0 - rz);
  vec3 steelHi = lin(vec3(0.74, 0.74, 0.76)) * (1.0 + 0.05 * n[2]), steelLo = lin(vec3(0.36, 0.33, 0.3)) * (1.0 + 0.1 * n[1]);
  vec3 grooveC = lin(vec3(0.12, 0.1, 0.09));
  vec3 railC = head * steelHi + groove * grooveC + lip * steelLo;
  float sett = (1.0 - rz) * (1.0 - tar);
  vec3 own = railC * rz + lin(vec3(0.09)) * tar;
  float lumS = mix(dot(stone, vec3(0.3333)), dot(joint, vec3(0.3333)) * 0.85, inJ);
  s.alb = own * (1.0 - sett);
  s.a = sett * lumS;
  s.h = mix(pr.x + 0.0045 * dome * (1.0 - inJ), -0.022 * groove - 0.001 * tar, 1.0 - sett);
  s.rough = mix(mix(0.74 - 0.26 * wear, 0.96, inJ), mix(0.3, 0.8, groove + lip * 0.6), 1.0 - sett);
  s.metal = (1.0 - sett) * (head * 0.9 + lip * 0.5);
  s.cav = mix(mix(1.0, 0.42, inJ), mix(1.0, 0.35, groove), 1.0 - sett);`,
    },
  },
];
