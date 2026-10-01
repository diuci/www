// Crossroads Market — the Market Hall (centre landmark): a cast-iron-and-glass hall with open sides straddling the
// crossroads. Nave along Z (Market Street runs in through the gable ends), lean-to aisles on ±X, the tramway along X
// through the transept (the No. 3 tram stands under the crossing). A square clock lantern crowns the crossing.
// Self-symmetric under the 180° mirror: placed once (mirror: false) at the origin.

export function registerHall(D, H, KIT) {
  const { PI, TAU, HP, P3, NS, K, tpl, kf, pbox, colBox, rod, letters, textW, arcPts, shade, mixc, extrudeGeo, GB, cx3 } = KIT;

  // hall frame
  const X0 = 9, Z0 = 7, NX = 4.5, ZC = 2.6;       // outer half-width (x) / half-depth (z), nave half-width, crossing half-depth
  const EA = 5.0, EN = 5.6, EC = 7.0, RIDGE = 9.1; // aisle eave, nave arcade top, clerestory top (nave eave), nave ridge
  const IRON = K.iron, IRDK = K.ironDk, GOLD = K.gold;

  // ---- cast-iron column: stone plinth, moulded base, slender shaft with bands, flared capital with an abacus
  function column(B, x, z, top, o = {}) {
    B.box('paint', K.stone, 0.62, 0.46, 0.62, x, 0.23, z, { r: 0.03 });
    B.box('paint', K.stoneLt, 0.68, 0.06, 0.68, x, 0.49, z, { r: 0.015 });
    B.lathe('metal', IRON, [[0.22, 0.52], [0.24, 0.56], [0.22, 0.62], [0.17, 0.68], [0.16, 0.8], [0.13, 0.86], [0.125, top - 0.62], [0.14, top - 0.58],
      [0.15, top - 0.5], [0.2, top - 0.3], [0.27, top - 0.14], [0.3, top - 0.1], [0.3, top - 0.02], [0, top - 0.02]], x, 0, z, { seg: 12 });
    for (const y of [1.6, top - 0.9]) B.tor(NS('metal'), GOLD, 0.132, 0.022, x, y, z, { rs: 4, ts: 14, rx: HP });
    // acanthus leaves on the capital (four little tabs)
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + PI / 4; B.box(NS('metal'), IRDK, 0.08, 0.2, 0.03, x + Math.cos(a) * 0.19, top - 0.26, z + Math.sin(a) * 0.19, { ry: -a + HP, rx: -0.4, r: 0.01 }); }
    B.box('metal', IRDK, 0.66, 0.08, 0.66, x, top + 0.02, z, { r: 0.015 });
    if (o.col !== false) { colBox(B, x, 0, z, 0.62, 0.5, 0.62); colBox(B, x, 0.5, z, 0.36, top - 0.5, 0.36, true); }
  }
  // ---- lattice girder between two points at height y (depth dh), with a decorative arched spandrel under it
  function girder(B, ax, az, bx, bz, y, dh, o = {}) {
    const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax);
    B.push((ax + bx) / 2, y, (az + bz) / 2, ry);
    B.box('metal', IRON, L, 0.1, 0.16, 0, 0, 0, { r: 0.02 });                       // top chord
    B.box('metal', IRON, L, 0.08, 0.14, 0, -dh, 0, { r: 0.02 });                    // bottom chord
    const n = Math.max(2, Math.round(L / (dh * 1.1)));
    for (let i = 0; i < n; i++) {
      const x0 = -L / 2 + (i * L) / n, x1 = x0 + L / n, s = i % 2 ? 1 : -1;
      B.push((x0 + x1) / 2, -dh / 2, 0, 0, 0, s * Math.atan2(dh, L / n));
      pbox(B, NS('metal'), IRON, Math.hypot(dh, L / n), 0.05, 0.05, 0, 0, 0);
      B.pop();
    }
    if (o.arch !== false) {
      // spandrel: a shallow arch from column to column under the girder, rings in the corners
      const rise = o.rise ?? Math.min(0.9, L * 0.12), span = L - 0.5, R = (span * span / 4 + rise * rise) / (2 * rise), a = Math.asin(span / 2 / R);
      B.tube('metal', IRON, arcPts(0, -dh - R, 0, R, HP - a, HP + a, 14), 0.045, { radial: 5 });
      for (const s of [-1, 1]) {
        B.tor(NS('metal'), IRON, Math.min(0.28, rise * 0.45), 0.02, s * (span / 2 - Math.min(0.5, rise * 0.8)), -dh - Math.min(0.28, rise * 0.45) - 0.04, 0, { rs: 4, ts: 14 });
      }
      if (o.boss) B.sph(NS('metal'), GOLD, 0.09, 0, -dh - 0.1, 0.02, { ws: 8, hs: 6 });
    }
    B.pop();
  }
  // ---- glazed roof slope: iron rafters + purlins (open glazing lattice), a zinc apron at the eave, lead ridge flashing.
  // Local frame: slope rises from the eave (z = 0, y = 0) toward -Z; w along X, L up the slope, pitch a.
  function glazedSlope(B, x, y, z, ry, w, L, a, o = {}) {
    B.push(x, y, z, ry);
    B.push(0, 0, 0, 0, a);                                  // tilt: local -Z climbs
    const apron = o.apron ?? 0.7;
    B.box('paint', K.zinc, w, 0.05, apron, 0, 0.02, -apron / 2, { r: 0.012 });      // zinc apron at the eave
    for (let x2 = -w / 2; x2 <= w / 2 + 1e-3; x2 += w / Math.max(1, Math.round(w / 0.62))) pbox(B, 'metal', IRDK, 0.05, 0.08, L, x2, 0.04, -L / 2);  // rafters
    for (let u = apron + 0.5; u < L - 0.1; u += 0.62) pbox(B, NS('metal'), IRON, w, 0.04, 0.035, 0, 0.07, -u);              // purlins / glazing bars
    // glass: a faint sheen band on alternate bays reads as glazing from above without shading the floor
    if (o.glass !== false) for (let x2 = -w / 2 + w / Math.max(1, Math.round(w / 0.62)) / 2, i = 0; x2 < w / 2; x2 += w / Math.max(1, Math.round(w / 0.62)), i++) if (i % 3 === 1) pbox(B, NS('gloss'), '#a9bcc6', 0.5, 0.008, L - apron - 0.2, x2, 0.085, -(apron + L) / 2 - 0.05);
    B.pop(); B.pop();
  }
  // ---- clock face (faces +Z) with a gilt bezel, chapter ring, hands (glow face: lit from inside at dusk)
  function clock(B, x, y, z, R, hh = 10, mm = 10) {
    B.cyl('metal', GOLD, R + 0.08, 0.08, x, y, z + 0.04, { rx: HP, seg: 28 });
    B.cyl(NS('glow'), '#f6eed8', R, 0.02, x, y, z + 0.09, { rx: HP, seg: 28, glow: 1.5 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; B.box(NS('paint'), K.black, i % 3 ? 0.035 : 0.06, R * 0.16, 0.012, x + Math.sin(a) * R * 0.8, y + Math.cos(a) * R * 0.8, z + 0.105, { rz: -a, r: 0.004 }); }
    const ah = ((hh % 12) + mm / 60) / 12 * TAU, am = (mm / 60) * TAU;
    B.box(NS('paint'), K.black, 0.06, R * 0.55, 0.014, x + Math.sin(ah) * R * 0.25, y + Math.cos(ah) * R * 0.25, z + 0.115, { rz: -ah, r: 0.005 });
    B.box(NS('paint'), K.black, 0.04, R * 0.8, 0.014, x + Math.sin(am) * R * 0.37, y + Math.cos(am) * R * 0.37, z + 0.125, { rz: -am, r: 0.005 });
    B.cyl(NS('metal'), GOLD, 0.05, 0.03, x, y, z + 0.13, { rx: HP, seg: 10 });
  }
  // pendant lamp hanging from y0 (glow globe)
  function pendant(B, x, y0, z, drop) {
    rod(B, NS('metal'), IRDK, P3(x, y0, z), P3(x, y0 - drop, z), 0.012, 4);
    B.lathe('metal', IRON, [[0, 0.02], [0.08, 0.0], [0.26, -0.14], [0.27, -0.17], [0.0, -0.17]], x, y0 - drop, z, { seg: 10 });
    B.sph(NS('glow'), K.lit, 0.12, x, y0 - drop - 0.22, z, { ws: 10, hs: 6, glow: 2.2 });
  }

  D.crossmarket_hall = {
    desc: 'The Market Hall (place once at the origin, mirror: false): 16 cast-iron columns (colliders), lattice girders with arched spandrels, lean-to glazed aisle roofs, a clerestoried glazed nave roof along Z, glazed gable ends with MARKET HALL signs over the Market Street entrances, the crossing lantern with four clock faces, an ogee copper cap + weathervane, pendant lamps, the overhead tram wire through the transept.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      // ---------------- columns
      const outer = [[-X0, -Z0], [X0, -Z0], [-X0, Z0], [X0, Z0], [-X0, -ZC], [X0, -ZC], [-X0, ZC], [X0, ZC]];
      const nave = [[-NX, -Z0], [NX, -Z0], [-NX, Z0], [NX, Z0], [-NX, -ZC], [NX, -ZC], [-NX, ZC], [NX, ZC]];
      for (const [x, z] of outer) column(B, x, z, EA);
      for (const [x, z] of nave) column(B, x, z, EN);
      // ---------------- girders: aisle eaves (outer ring), cross girders aisle → nave, nave arcades (along Z), gable beams
      const GD = 0.5;
      for (const s of [-1, 1]) {
        // outer long sides (x = ±X0) and the aisle ends (z = ±Z0)
        girder(B, s * X0, -Z0, s * X0, -ZC, EA, GD); girder(B, s * X0, -ZC, s * X0, ZC, EA, GD, { rise: 0.55, boss: true }); girder(B, s * X0, ZC, s * X0, Z0, EA, GD);
        for (const t of [-1, 1]) girder(B, s * X0, t * Z0, s * NX, t * Z0, EA, GD);
        for (const t of [-1, 1]) girder(B, s * X0, t * ZC, s * NX, t * ZC, EA, GD, { arch: false });
        // nave arcades along Z at x = ±NX (carry the clerestory)
        girder(B, s * NX, -Z0, s * NX, -ZC, EN, 0.55); girder(B, s * NX, -ZC, s * NX, ZC, EN, 0.55, { boss: true }); girder(B, s * NX, ZC, s * NX, Z0, EN, 0.55);
        // gable-end beams over the Market Street entrances + the crossing beams
        girder(B, -NX, s * Z0, NX, s * Z0, EN, 0.6, { rise: 0.95, boss: true });
        girder(B, -NX, s * ZC, NX, s * ZC, EN, 0.55, { rise: 0.8 });
      }
      // ---------------- aisle lean-to roofs (glazed), valance frieze along the eaves
      const aisleW = X0 - NX + 0.35, aislePitch = Math.atan2(EN + 0.25 - EA, X0 - NX);
      for (const s of [-1, 1]) {
        glazedSlope(B, s * (X0 + 0.3), EA + 0.02, 0, s > 0 ? HP : -HP, 2 * Z0 + 0.6, Math.hypot(X0 - NX + 0.3, EN + 0.25 - EA), aislePitch);
        // cast-iron valance (pierced frieze of pointed pendants) under the eave all round the aisles
        for (const [ax, az, bx, bz] of [[s * (X0 + 0.32), -Z0 - 0.3, s * (X0 + 0.32), Z0 + 0.3], [s * X0 + 0.3 * s, -Z0 - 0.32, s * NX, -Z0 - 0.32], [s * X0 + 0.3 * s, Z0 + 0.32, s * NX, Z0 + 0.32]]) {
          const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax);
          B.push((ax + bx) / 2, EA - 0.02, (az + bz) / 2, ry);
          B.box('paint', IRON, L, 0.14, 0.05, 0, 0, 0, { r: 0.012 });
          B.add('paint', tpl('valance|' + kf(L), () => {
            const g = new GB(), n = Math.round(L / 0.2), c = cx3(IRON);
            for (let i = 0; i < n; i++) { const x0 = -L / 2 + (i * L) / n, x1 = x0 + L / n; const a = g.v(x0 + 0.015, 0, 0, 0, 0, 1, ...c), b = g.v(x1 - 0.015, 0, 0, 0, 0, 1, ...c), m = g.v((x0 + x1) / 2, -0.26, 0, 0, 0, 1, ...c); g.tri(a, b, m); const a2 = g.v(x0 + 0.015, 0, -0.01, 0, 0, -1, ...c), b2 = g.v(x1 - 0.015, 0, -0.01, 0, 0, -1, ...c), m2 = g.v((x0 + x1) / 2, -0.26, -0.01, 0, 0, -1, ...c); g.tri(a2, b2, m2); }
            return g.geo();
          }), 'white', 0, -0.07, 0.02, {});
          B.pop();
        }
      }
      // ---------------- nave: clerestory (glazed band on the arcades), glazed pitched roof along Z, ridge ventilator
      for (const s of [-1, 1]) {
        B.push(s * NX, 0, 0, s > 0 ? HP : -HP);
        B.box('metal', IRON, 2 * Z0 + 0.2, 0.12, 0.2, 0, EN + 0.3, 0, { r: 0.02 });
        for (let z = -Z0; z <= Z0 + 1e-3; z += (2 * Z0) / 10) pbox(B, 'metal', IRON, 0.08, EC - EN - 0.3, 0.1, z, (EN + EC + 0.3) / 2, 0);
        pbox(B, NS('gloss'), K.glassLt, 2 * Z0, EC - EN - 0.4, 0.02, 0, (EN + EC + 0.3) / 2, 0.0);
        for (let z = -Z0 + 0.7; z < Z0; z += 1.4) pbox(B, NS('metal'), IRON, 0.03, EC - EN - 0.4, 0.04, z, (EN + EC + 0.3) / 2, 0.02);
        B.box('metal', IRON, 2 * Z0 + 0.4, 0.16, 0.26, 0, EC, 0.02, { r: 0.02 });
        B.pop();
      }
      const navePitch = Math.atan2(RIDGE - EC, NX + 0.3), naveL = Math.hypot(NX + 0.3, RIDGE - EC);
      for (const s of [-1, 1]) glazedSlope(B, s * (NX + 0.3), EC + 0.06, 0, s > 0 ? HP : -HP, 2 * Z0 + 0.8, naveL, navePitch, { apron: 0.5 });
      // ridge ventilator (louvred zinc box along the ridge) broken by the lantern
      for (const s of [-1, 1]) {
        const z0 = s * 2.2, z1 = s * (Z0 + 0.4), zc = (z0 + z1) / 2, L = Math.abs(z1 - z0);
        B.box('paint', K.zinc, 0.9, 0.42, L, 0, RIDGE + 0.2, zc, { r: 0.03 });
        B.box('paint', shade(K.zinc, 0.85), 1.2, 0.08, L + 0.1, 0, RIDGE + 0.45, zc, { r: 0.02 });
        for (let z = Math.min(z0, z1) + 0.2; z < Math.max(z0, z1) - 0.1; z += 0.18) for (const sx of [-1, 1]) pbox(B, NS('paint'), shade(K.zinc, 0.7), 0.02, 0.26, 0.06, sx * 0.455, RIDGE + 0.2, z);
      }
      // ---------------- gable ends (z = ±Z0): glazed tympanum with a fan window, the MARKET HALL sign board, date
      for (const s of [-1, 1]) {
        B.push(0, 0, s * (Z0 + 0.05), s > 0 ? 0 : PI);
        // raked iron verges
        for (const sx of [-1, 1]) { B.push(sx * (NX + 0.3) / 2, (EC + RIDGE) / 2 + 0.06, 0, 0, 0, sx * navePitch); B.box('metal', IRON, naveL + 0.3, 0.18, 0.2, 0, 0, 0, { r: 0.02 }); B.pop(); }
        // tympanum: glass + tracery (fan window over a transom)
        B.add(NS('gloss'), tpl('tymp', () => { const g = new GB(), c = cx3('#8aa3b0'); const p = [g.v(-NX, EN + 0.2, 0, 0, 0, 1, ...c), g.v(NX, EN + 0.2, 0, 0, 0, 1, ...c), g.v(NX, EC, 0, 0, 0, 1, ...c), g.v(0, RIDGE, 0, 0, 0, 1, ...c), g.v(-NX, EC, 0, 0, 0, 1, ...c)]; g.quad(p[0], p[1], p[2], p[4]); g.tri(p[4], p[2], p[3]); return g.geo(); }), 'white', 0, 0, -0.04, {});
        const fr = 2.4, fy = EN + 0.95;
        B.tube('metal', IRON, arcPts(0, fy, 0.02, fr, 0, PI, 16), 0.06, { radial: 5 });
        B.tube(NS('metal'), IRON, arcPts(0, fy, 0.02, fr * 0.45, 0, PI, 10), 0.04, { radial: 4 });
        for (let i = 1; i < 8; i++) { const a = (i / 8) * PI; rod(B, NS('metal'), IRON, P3(Math.cos(a) * fr * 0.45, fy + Math.sin(a) * fr * 0.45, 0.02), P3(Math.cos(a) * fr, fy + Math.sin(a) * fr, 0.02), 0.025, 4); }
        pbox(B, 'metal', IRON, 2 * NX, 0.1, 0.08, 0, fy, 0.02);
        for (const x of [-3.6, -2.4, 2.4, 3.6]) pbox(B, NS('metal'), IRON, 0.05, fy - EN - 0.2, 0.05, x, (fy + EN + 0.2) / 2, 0.02);
        // the sign: an arched iron board hung on the entrance girder, gilded letters, lit at dusk
        B.box('gloss', IRDK, 6.0, 0.72, 0.1, 0, EN - 1.05, 0.1, { round: true, r: 0.04 });
        B.box('paint', GOLD, 5.84, 0.03, 0.006, 0, EN - 0.74, 0.153, { r: 0.004 });
        B.box('paint', GOLD, 5.84, 0.03, 0.006, 0, EN - 1.36, 0.153, { r: 0.004 });
        letters(B, 'MARKET HALL', { h: 0.4, x: 0, y: EN - 1.25, z: 0.152, c: GOLD, dep: 0.03, wt: 0.17, track: 0.14, lit: 1.3, litC: '#ffe2a8' });
        for (const sx of [-1, 1]) { B.cyl('metal', GOLD, 0.16, 0.04, sx * 2.72, EN - 1.05, 0.16, { rx: HP, seg: 14 }); B.cyl(NS('metal'), IRDK, 0.1, 0.02, sx * 2.72, EN - 1.05, 0.19, { rx: HP, seg: 12 }); }
        // date cartouche in the tympanum + the town crest
        B.box('paint', K.stoneLt, 1.5, 0.5, 0.08, 0, EC + 0.4, 0.06, { round: true, r: 0.05 });
        letters(B, '1887', { h: 0.3, x: 0, y: EC + 0.25, z: 0.105, c: IRDK, flat: true, wt: 0.2, track: 0.12 });
        B.pop();
      }
      // ---------------- crossing lantern: square clock tower on the ridge, ogee copper cap, finial, weathervane
      const LY = RIDGE - 0.9, LW = 3.2, LH = 3.2;
      B.box('paint', K.stoneLt, LW + 0.3, 0.3, LW + 0.3, 0, LY + 0.15, 0, { r: 0.04 });
      B.box('paint', K.frame, LW, LH, LW, 0, LY + 0.3 + LH / 2, 0, { r: 0.05 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.box('metal', IRON, 0.26, LH + 0.1, 0.26, sx * LW / 2, LY + 0.3 + LH / 2, sz * LW / 2, { r: 0.03 });
      for (let side = 0; side < 4; side++) {
        const a = (side * PI) / 2;
        B.push(Math.sin(a) * LW / 2, 0, Math.cos(a) * LW / 2, a);
        clock(B, 0, LY + 0.3 + LH * 0.56, 0.0, 0.95, 10, 10);
        // louvred belfry slots under the clock + a cornice band
        for (const x of [-0.85, 0.85]) { pbox(B, 'paint', IRDK, 0.34, 0.7, 0.03, x, LY + 0.95, 0.015); for (let k = 0; k < 5; k++) pbox(B, NS('paint'), K.frameDk, 0.3, 0.03, 0.05, x, LY + 0.68 + k * 0.13, 0.035); }
        B.pop();
      }
      B.box('paint', K.stoneLt, LW + 0.5, 0.2, LW + 0.5, 0, LY + 0.3 + LH + 0.1, 0, { r: 0.04 });
      B.box('metal', GOLD, LW + 0.56, 0.05, LW + 0.56, 0, LY + 0.3 + LH + 0.21, 0, { r: 0.01 });
      const CY = LY + 0.3 + LH + 0.2;
      B.lathe('gloss', K.verdigris, [[(LW + 0.3) * 0.72, 0], [(LW + 0.1) * 0.7, 0.35], [1.35, 0.8], [0.72, 1.35], [0.34, 1.9], [0.2, 2.25], [0.12, 2.5], [0, 2.52]], 0, CY, 0, { seg: 4, ry: PI / 4 });
      B.sph('metal', GOLD, 0.16, 0, CY + 2.62, 0, { ws: 10, hs: 6 });
      B.cyl('metal', IRDK, 0.03, 1.4, 0, CY + 3.3, 0, { seg: 6 });
      for (const a of [0, HP]) pbox(B, 'metal', IRDK, 0.7, 0.02, 0.02, 0, CY + 3.05, 0, { ry: a });
      for (const [lx, lz, ch] of [[0.42, 0, 'E'], [-0.42, 0, 'W'], [0, 0.42, 'N'], [0, -0.42, 'S']]) { B.push(lx, CY + 3.0, lz, Math.atan2(lx, lz)); letters(B, ch, { h: 0.14, x: 0, y: 0, z: 0, c: GOLD, flat: true, wt: 0.24 }); B.pop(); }
      B.push(0, CY + 3.75, 0, 0.5);
      B.add('metal', tpl('cmvane', () => extrudeGeo([[-0.55, 0], [0.3, 0], [0.45, 0.1], [0.3, 0.2], [-0.35, 0.2], [-0.55, 0.36], [-0.45, 0.1]], 0.012, 0.002)), GOLD, 0, 0, 0, { ry: HP });
      B.pop();
      // ---------------- pendant lamps along the nave + aisles, the overhead tram wire through the transept
      for (const z of [-5.2, 5.2]) for (const x of [-2.2, 2.2]) pendant(B, x, EN - 0.55, z, 0.6);
      for (const s of [-1, 1]) for (const z of [-4.8, 4.8]) pendant(B, s * 6.8, EA - 0.5, z, 0.45);
      for (const s of [-1, 1]) { rod(B, NS('metal'), IRDK, P3(-X0 - 0.4, 5.3, s * 0.02), P3(X0 + 0.4, 5.3, s * 0.02), 0.008, 3); }
      for (const x of [-X0, -NX, NX, X0]) rod(B, NS('metal'), IRDK, P3(x, 5.3, -ZC + 0.2), P3(x, 5.3, ZC - 0.2), 0.008, 3);
      // the roof is off limits (special weapons can reach it, nobody can camp there): roof-flagged colliders that
      // follow the glazing — aisle lean-tos, the nave in two steps, the ridge vent, the clock lantern
      const RF = { roof: true };
      for (const s of [-1, 1]) B.col(Math.min(s * NX, s * (X0 + 0.35)), EA + 0.05, -Z0 - 0.3, Math.max(s * NX, s * (X0 + 0.35)), EA + 0.7, Z0 + 0.3, RF);
      B.col(-NX - 0.3, EC, -Z0 - 0.4, NX + 0.3, EC + 1.0, Z0 + 0.4, RF);
      B.col(-2.5, EC + 1.0, -Z0 - 0.4, 2.5, RIDGE, Z0 + 0.4, RF);
      B.col(-0.6, RIDGE, -Z0 - 0.4, 0.6, RIDGE + 0.5, Z0 + 0.4, RF);
      B.col(-LW / 2 - 0.25, LY, -LW / 2 - 0.25, LW / 2 + 0.25, CY + 1.3, LW / 2 + 0.25, RF);
    },
  };
}
