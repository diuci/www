// Crossroads Market — street furniture + market kit: stalls, barrows, the fountain, gas lamps, bollards, benches,
// iron railings, stone balustrades, the news kiosk, the advertising column, produce crates.

export function registerStreet(D, H, KIT) {
  const { PI, TAU, HP, P3, NS, K, tpl, kf, pbox, colBox, rod, letters, textW, arcPts, shade, mixc, GB, cx3, hash } = KIT;
  const blobGeo = (r, det, seed) => KIT.blob(det, seed);

  // ---- produce: fills a crate / tray top (w × d at height y) with goods of a kind (small parts: no shadow)
  const FRUIT = { apples: ['#b83a2e', '#c9502f', '#9c2f28'], greens: ['#7aa04a', '#8cb35a'], oranges: ['#e39a2e', '#eaa73a'], lemons: ['#e8cf52', '#f0da6a'],
    tomatoes: ['#c8382c', '#d8452f'], plums: ['#5b2a4a', '#6d3656'], pears: ['#b9c25a', '#a8b04c'] };
  function produce(B, kind, x, y, z, w, d, seed = 1) {
    const rnd = (k) => hash(seed * 7.1 + k * 3.3);
    if (FRUIT[kind]) {
      const r = kind === 'lemons' || kind === 'plums' ? 0.052 : 0.064, nx = Math.max(2, Math.floor(w / (r * 2.1))), nz = Math.max(2, Math.floor(d / (r * 2.1)));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const c = FRUIT[kind][(i + j * 3) % FRUIT[kind].length], k = rnd(i * 13 + j);
        B.sph(NS('gloss'), c, r, x - w / 2 + (i + 0.5) * (w / nx), y + r * 0.8 + (k - 0.5) * 0.02 + ((i + j) % 2) * r * 0.25, z - d / 2 + (j + 0.5) * (d / nz), { ws: 5, hs: 3 });
      }
    } else if (kind === 'cabbage') {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) B.add(NS('foliage'), blobGeo(1, 1, (i + j * 3) % 8), i % 2 ? '#7fa65a' : '#6b9a4a', x - w / 3 + i * w / 3, y + 0.07, z - d / 4 + j * d / 2, { s: 0.1 });
    } else if (kind === 'carrots') {
      for (let i = 0; i < 9; i++) { const a = rnd(i) * 0.6 - 0.3; B.cyl(NS('paint'), '#e0782e', 0.022, 0.2, x - w / 2 + 0.05 + (i / 8) * (w - 0.1), y + 0.04, z + (rnd(i + 3) - 0.5) * d * 0.6, { r2: 0.004, rz: HP + a, seg: 5 }); }
      B.add(NS('foliage'), blobGeo(1, 0, 3), '#5f8f3a', x, y + 0.06, z - d * 0.3, { sx: w * 0.45, sy: 0.05, sz: 0.08 });
    } else if (kind === 'fish') {
      pbox(B, NS('paint'), '#e8f0f2', w, 0.05, d, x, y + 0.025, z);                                // crushed ice
      for (let i = 0; i < 5; i++) B.sph(NS('gloss'), i % 2 ? '#8fa0a8' : '#b7c2c7', 0.045, x - w / 2 + 0.1 + (i / 4) * (w - 0.2), y + 0.075, z + (rnd(i) - 0.5) * d * 0.4, { ws: 7, hs: 4, sx: 1.2, sz: 3.6, ry: (rnd(i + 9) - 0.5) * 0.6 });
      for (let i = 0; i < 3; i++) B.sph(NS('gloss'), '#d86a4a', 0.05, x - w / 3 + i * w / 3, y + 0.08, z + d * 0.3, { ws: 6, hs: 4, sx: 1.6 });   // prawns / crab
    } else if (kind === 'flowers') {
      for (let i = 0; i < 3; i++) {
        const bx = x - w / 3 + i * w / 3;
        B.cyl(NS('metal'), '#8d939a', 0.09, 0.22, bx, y + 0.11, z, { r2: 0.07, seg: 8, open: true });
        B.add(NS('foliage'), blobGeo(1, 1, i + 2), '#4f8a45', bx, y + 0.3, z, { s: 0.13, sy: 0.1 });
        for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + i; B.sph(NS('foliage'), ['#d9443c', '#f2d15a', '#e87a8c', '#f2ece0', '#9b6cc6'][(k + i) % 5], 0.04, bx + Math.cos(a) * 0.08, y + 0.36 + (k % 2) * 0.04, z + Math.sin(a) * 0.08, { ws: 5, hs: 3 }); }
      }
    } else if (kind === 'bread') {
      for (let i = 0; i < 4; i++) B.sph(NS('paint'), i % 2 ? K.bread : K.breadDk, 0.07, x - w / 2 + 0.1 + (i / 3) * (w - 0.2), y + 0.05, z, { ws: 7, hs: 4, sx: 1.8, sy: 0.7 });
      for (let i = 0; i < 3; i++) B.sph(NS('paint'), '#e3c090', 0.05, x - w / 3 + i * w / 3, y + 0.04, z + d * 0.3, { ws: 6, hs: 4, sy: 0.7 });
    } else if (kind === 'cheese') {
      for (let i = 0; i < 3; i++) { B.cyl(NS('paint'), i % 2 ? '#e8c35a' : '#d9a441', 0.12, 0.09, x - w / 3 + i * w / 3, y + 0.045, z, { seg: 12, bevel: 0.015 }); }
      B.cyl(NS('paint'), '#f0d27a', 0.1, 0.08, x, y + 0.13, z, { seg: 12, bevel: 0.015 });
    } else if (kind === 'spice') {
      for (let i = 0; i < 4; i++) { const cc = ['#c2572f', '#d9a441', '#8a4a2a', '#b83a2e'][i]; B.cyl(NS('wood'), K.woodDk, 0.08, 0.1, x - w / 2 + 0.1 + (i / 3) * (w - 0.2), y + 0.05, z, { seg: 10 }); B.sph(NS('paint'), cc, 0.075, x - w / 2 + 0.1 + (i / 3) * (w - 0.2), y + 0.1, z, { ws: 8, hs: 4, half: true }); }
    }
  }
  // slatted produce crate (open top) at x, y, z, filled with `kind`, optionally tilted toward +Z
  function crate(B, x, y, z, w, d, h, kind, seed, tilt = 0) {
    B.push(x, y, z, 0, tilt);
    for (const sz of [-1, 1]) for (let k = 0; k < 2; k++) pbox(B, 'wood', shade(K.woodLt, 0.92 + k * 0.06), w, h * 0.38, 0.02, 0, h * (0.22 + k * 0.5), sz * (d / 2 - 0.01));
    for (const sx of [-1, 1]) pbox(B, 'wood', K.wood, 0.02, h, d, sx * (w / 2 - 0.01), h / 2, 0);
    pbox(B, NS('wood'), K.woodDk, w - 0.04, 0.02, d - 0.04, 0, 0.02, 0);
    produce(B, kind, 0, h * 0.62, 0, w - 0.06, d - 0.06, seed);
    B.pop();
  }

  // ---- pitched striped stall canopy (ridge along X), valance front + back, cached per size + colours
  function stallCanopy(W, Dd, rise, cA, cB) {
    return tpl(['stallcan', W, Dd, rise, cA, cB].map(kf).join('|'), () => {
      const g = new GB(), n = Math.max(4, Math.round(W / 0.25)), sw = W / n, ca = cx3(cA), cb = cx3(cB);
      for (const side of [1, -1]) {
        const off = side > 0 ? 0 : -0.006, kk = side > 0 ? 1 : 0.74;
        for (const zs of [-1, 1]) {
          const l = Math.hypot(Dd / 2, rise), ny = (Dd / 2) / l * side, nz = zs * rise / l * side;
          for (let j = 0; j < n; j++) {
            const x0 = -W / 2 + j * sw, x1 = x0 + sw, c = (j % 2 ? cb : ca).map((v) => v * kk);
            const a = g.v(x0, rise + off, 0, 0, ny, nz, ...c), b = g.v(x1, rise + off, 0, 0, ny, nz, ...c), d2 = g.v(x1, off, zs * Dd / 2, 0, ny, nz, ...c), e = g.v(x0, off, zs * Dd / 2, 0, ny, nz, ...c);
            g.quad(a, b, d2, e);
            const vh = 0.14, zf = zs * (Dd / 2 + 0.002 * side);
            const q = [g.v(x0, off, zf, 0, 0, zs * side, ...c), g.v(x1, off, zf, 0, 0, zs * side, ...c), g.v(x1, off - vh, zf, 0, 0, zs * side, ...c), g.v(x0, off - vh, zf, 0, 0, zs * side, ...c)];
            g.quad(q[0], q[1], q[2], q[3]);
            const cen = g.v((x0 + x1) / 2, off - vh, zf, 0, 0, zs * side, ...c), arc = [];
            for (let k = 0; k <= 5; k++) { const t = PI + (k / 5) * PI; arc.push(g.v((x0 + x1) / 2 - Math.cos(t) * sw / 2, off - vh + Math.sin(t) * sw * 0.42, zf, 0, 0, zs * side, ...c)); }
            for (let k = 0; k < 5; k++) g.tri(cen, arc[k], arc[k + 1]);
          }
        }
        // gable triangles in colour A
        for (const sx of [-1, 1]) { const c = ca.map((v) => v * kk * 0.9); const x = sx * (W / 2 + 0.002 * side); const t = [g.v(x, off, -Dd / 2, sx * side, 0, 0, ...c), g.v(x, off, Dd / 2, sx * side, 0, 0, ...c), g.v(x, rise + off, 0, sx * side, 0, 0, ...c)]; g.tri(t[0], t[1], t[2]); }
      }
      return g.geo();
    });
  }
  const STALLS = {
    veg: { name: 'FRUIT & VEG', goods: ['apples', 'oranges', 'greens', 'cabbage', 'tomatoes', 'lemons', 'carrots', 'pears'], c: ['#3f7a5a', '#efe6d2'] },
    fish: { name: 'FRESH FISH', goods: ['fish', 'fish', 'fish', 'fish'], c: ['#3f5f86', '#efe6d2'] },
    flowers: { name: 'FLOWERS', goods: ['flowers', 'flowers', 'flowers', 'flowers'], c: ['#b8566e', '#efe6d2'] },
    bread: { name: 'BREAD', goods: ['bread', 'bread', 'bread', 'bread'], c: ['#cf9a3c', '#efe6d2'] },
    cheese: { name: 'CHEESE', goods: ['cheese', 'cheese', 'cheese', 'cheese'], c: ['#d9ae3c', '#f4ecd8'] },
    spice: { name: 'SPICES', goods: ['spice', 'spice', 'spice', 'spice'], c: ['#b8483e', '#efe6d2'] },
    fruit: { name: 'FRUIT', goods: ['plums', 'apples', 'pears', 'oranges', 'lemons', 'apples'], c: ['#7a3a4c', '#efe6d2'] },
  };
  D.crossmarket_stall = {
    desc: 'Market stall (front +Z; `double`: goods on both long sides, an island stall): timber counter w × d (collider, 1.0 m), sloped display of slatted crates filled with produce / fish on ice / flowers / bread / cheese / spices, four posts, a pitched striped canopy with a scalloped valance, a lettered header board, a hanging scale and a lamp.',
    params: { w: 'm (2.4)', d: 'm (1.2)', kind: 'veg | fruit | fish | flowers | bread | cheese | spice', double: 'bool', canopy: 'bool (true)', name: 'header text' }, variants: 1, mount: 'ground',
    build(B, o) {
      const W = o.w ?? 2.4, Dd = o.d ?? 1.2, S = STALLS[o.kind ?? 'veg'] ?? STALLS.veg, dbl = !!o.double, seed = Math.round(o.pos[0] * 13 + o.pos[2] * 7);
      const ch = 0.82;
      // counter: framed timber body with vertical boards, a skirt board, the worktop
      B.box('wood', K.woodDk, W, ch - 0.05, Dd, 0, (ch - 0.05) / 2, 0, { r: 0.03 });
      for (const sz of dbl ? [-1, 1] : [1]) for (let x = -W / 2 + 0.1; x < W / 2 - 0.05; x += 0.16) pbox(B, NS('wood'), shade(K.wood, 0.9 + hash(x * 9 + sz) * 0.16), 0.14, ch - 0.16, 0.02, x + 0.07, (ch - 0.05) / 2, sz * (Dd / 2 + 0.005));
      B.box('wood', K.woodLt, W + 0.08, 0.05, Dd + 0.08, 0, ch - 0.025, 0, { r: 0.015 });
      // display: two tiers of tilted crates toward each selling side
      const goods = S.goods, nC = Math.max(2, Math.round(W / 0.62));
      for (const sz of dbl ? [-1, 1] : [1]) {
        B.push(0, 0, 0, sz > 0 ? 0 : PI);
        const cw = (W - 0.1) / nC;
        for (let i = 0; i < nC; i++) {
          crate(B, -W / 2 + 0.05 + cw * (i + 0.5), ch, Dd / 2 - (dbl ? 0.2 : 0.26), cw - 0.03, 0.36, 0.16, goods[(i + (sz > 0 ? 0 : 3)) % goods.length], seed + i, 0.28);
          if (!dbl || i % 2 === 0) crate(B, -W / 2 + 0.05 + cw * (i + 0.5), ch + 0.16, Dd / 2 - (dbl ? 0.52 : 0.62), cw - 0.03, 0.34, 0.14, goods[(i + 2) % goods.length], seed + i + 5, 0.4);
        }
        // price tags: little chalkboards on sticks
        for (let i = 0; i < nC; i++) { const tx = -W / 2 + 0.05 + cw * (i + 0.5) + 0.12; rod(B, NS('wood'), K.woodDk, P3(tx, ch + 0.05, Dd / 2 - 0.06), P3(tx, ch + 0.22, Dd / 2 - 0.06), 0.006, 3); pbox(B, NS('paint'), '#2a2d2b', 0.12, 0.08, 0.01, tx, ch + 0.26, Dd / 2 - 0.06); pbox(B, NS('paint'), '#f2eee6', 0.07, 0.012, 0.004, tx, ch + 0.265, Dd / 2 - 0.054); }
        B.pop();
      }
      // storage under / behind: a couple of stacked crates and a sack at the back (single-sided stalls)
      if (!dbl) { crate(B, -W / 4, 0, -Dd / 2 - 0.3, 0.5, 0.36, 0.3, goods[1], seed + 21); crate(B, W / 4, 0, -Dd / 2 - 0.28, 0.5, 0.36, 0.3, goods[2], seed + 22); B.add('paint', blobGeo(1, 1, 4), '#c8a577', W / 2 - 0.2, 0.28, -Dd / 2 - 0.3, { sx: 0.22, sy: 0.3, sz: 0.2 }); }
      if (o.canopy !== false) {
        const ph = 2.15, rise = 0.42;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl('wood', K.woodDk, 0.035, ph, sx * (W / 2 - 0.03), ph / 2, sz * (Dd / 2 - 0.03), { seg: 6 });
        for (const sz of [-1, 1]) pbox(B, 'wood', K.woodDk, W, 0.05, 0.05, 0, ph, sz * (Dd / 2 - 0.03));
        B.add('foliage', stallCanopy(W + 0.3, Dd + 0.5, rise, S.c[0], S.c[1]), 'white', 0, ph + 0.02, 0, {});
        // header board on the front valance (both sides on island stalls)
        for (const sz of dbl ? [-1, 1] : [1]) {
          B.push(0, ph - 0.28, sz * (Dd / 2 + 0.02), sz > 0 ? 0 : PI);
          const name = o.name ?? S.name, hw = Math.min(W - 0.2, textW(name, 0.2, 0.1) * 0.16 + 0.3);
          B.box('paint', K.frame, hw, 0.26, 0.03, 0, 0, 0.0, { r: 0.02 });
          letters(B, name, { h: Math.min(0.16, (hw - 0.2) / textW(name, 0.2, 0.1)), x: 0, y: -0.075, z: 0.017, c: shade(S.c[0], 0.75), flat: true, wt: 0.2, track: 0.1 });
          B.pop();
        }
        // festoon bulb + hanging brass scale
        B.cyl(NS('rubber'), K.black, 0.02, 0.1, W / 2 - 0.4, ph - 0.05, 0, { seg: 6 });
        B.sph(NS('glow'), K.lit, 0.05, W / 2 - 0.4, ph - 0.14, 0, { ws: 8, hs: 6, glow: 2.4 });
        rod(B, NS('metal'), K.goldDk, P3(-W / 2 + 0.5, ph, 0.1), P3(-W / 2 + 0.5, ph - 0.45, 0.1), 0.006, 3);
        B.cyl(NS('metal'), K.gold, 0.12, 0.02, -W / 2 + 0.5, ph - 0.62, 0.1, { seg: 10, r2: 0.1 });
        for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; rod(B, NS('metal'), K.goldDk, P3(-W / 2 + 0.5, ph - 0.45, 0.1), P3(-W / 2 + 0.5 + Math.cos(a) * 0.11, ph - 0.61, 0.1 + Math.sin(a) * 0.11), 0.003, 3); }
      }
      B.col(-W / 2 - 0.04, 0, -Dd / 2 - 0.04, W / 2 + 0.04, 1.0, Dd / 2 + 0.04);
      B.blob(W + 0.5, Dd + 0.5);
    },
  };

  // ---- costermonger's barrow: two big spoked wheels, a tray of crates, shafts / handles, a small sunshade
  D.crossmarket_barrow = {
    desc: 'Costermonger barrow (handles toward local -X): timber tray on two big spoked wheels + a prop leg, crates of produce / flowers, a little striped parasol. Collider: the barrow body.',
    params: { kind: 'veg | flowers | fruit | fish', color: 'parasol stripe' }, variants: 2, mount: 'ground',
    build(B, o) {
      const S = STALLS[o.kind ?? 'fruit'] ?? STALLS.fruit, seed = Math.round(o.pos[0] * 11 + o.pos[2] * 5), L = 1.9, W = 0.95, ty = 0.72;
      B.box('wood', K.woodDk, L, 0.08, W, 0, ty, 0, { r: 0.02 });
      for (const sz of [-1, 1]) B.box('wood', K.wood, L, 0.18, 0.04, 0, ty + 0.12, sz * (W / 2 - 0.02), { r: 0.01 });
      for (const sx of [-1, 1]) B.box('wood', K.wood, 0.04, 0.18, W, sx * (L / 2 - 0.02), ty + 0.12, 0, { r: 0.01 });
      pbox(B, NS('paint'), o.color ?? S.c[0], L + 0.01, 0.05, W + 0.01, 0, ty + 0.1, 0);
      // wheels (spoked) at the middle, shafts to the handles at -X, a prop leg at +X
      for (const sz of [-1, 1]) {
        const z = sz * (W / 2 + 0.07);
        B.tor('wood', K.woodDk, 0.42, 0.03, 0.15, 0.45, z, { rs: 5, ts: 22 });
        B.tor(NS('metal'), K.black, 0.45, 0.012, 0.15, 0.45, z, { rs: 3, ts: 22 });
        for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; rod(B, NS('wood'), K.wood, P3(0.15, 0.45, z), P3(0.15 + Math.cos(a) * 0.41, 0.45 + Math.sin(a) * 0.41, z), 0.012, 3); }
        B.cyl('wood', K.woodDk, 0.06, 0.1, 0.15, 0.45, z, { rx: HP, seg: 8 });
        B.tube('wood', K.woodDk, [P3(-L / 2 + 0.2, ty - 0.04, sz * (W / 2 - 0.06)), P3(-L / 2 - 0.5, ty - 0.05, sz * (W / 2 - 0.1))], 0.03, { radial: 5 });
      }
      B.cyl('wood', K.woodDk, 0.035, ty, L / 2 - 0.15, ty / 2, 0, { seg: 6 });
      rod(B, 'metal', K.ironDk, P3(0.15, 0.45, -W / 2 - 0.1), P3(0.15, 0.45, W / 2 + 0.1), 0.02, 5);
      // goods: a grid of crates on the tray
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) crate(B, -L / 2 + 0.33 + i * 0.62, ty + 0.04, -W / 4 + j * W / 2, 0.58, 0.42, 0.14, S.goods[(i * 2 + j) % S.goods.length], seed + i * 2 + j, j ? 0.12 : -0.12);
      // parasol
      if ((o.variant ?? 0) % 2 === 0) {
        const px = L / 2 - 0.12, pz = -W / 2 + 0.1;
        B.cyl('metal', K.ironDk, 0.018, 1.7, px, ty + 0.85, pz, { seg: 6 });
        B.add('foliage', stallCanopy(1.2, 1.2, 0.3, S.c[0], S.c[1]), 'white', px, ty + 1.65, pz, {});
      }
      B.col(-L / 2 - 0.05, 0, -W / 2 - 0.12, L / 2 + 0.05, ty + 0.3, W / 2 + 0.12);
      B.blob(L + 0.6, W + 0.6);
    },
  };

  // ---- the fountain: round stone basin with a moulded lip, water, a baluster pedestal with two bowls, a bronze
  // dolphin finial, lion-mask spouts into the basin; colliders: a cross of boxes approximating the round basin
  D.crossmarket_fountain = {
    desc: 'Market fountain (round, R 1.7): moulded sandstone basin with water, a pedestal carrying two scalloped bowls (water sheets) and a bronze dolphin, four lion-mask spouts, a cast-iron drinking cup post. Colliders: basin (cross of boxes, 0.72 m) + pedestal.',
    params: { r: 'basin radius (1.7)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const R = o.r ?? 1.7, st = K.stone, stD = K.stoneDk;
      B.lathe('paint', st, [[R + 0.08, 0], [R + 0.1, 0.08], [R, 0.14], [R - 0.02, 0.5], [R + 0.08, 0.56], [R + 0.1, 0.66], [R + 0.02, 0.72], [R - 0.26, 0.72], [R - 0.28, 0.62], [R - 0.3, 0.3], [0, 0.3]], 0, 0, 0, { seg: 32 });
      B.cyl(NS('gloss'), '#35646a', R - 0.29, 0.02, 0, 0.56, 0, { seg: 28 });                                  // water
      B.tor(NS('glow'), '#cfe8e6', R - 0.34, 0.01, 0, 0.575, 0, { rs: 3, ts: 28, rx: HP, glow: 0.55 });      // foam ring
      // pedestal: moulded baluster, a scalloped lower bowl, a stem, an upper bowl, a bronze pineapple finial
      B.lathe('paint', st, [[0.44, 0.3], [0.46, 0.42], [0.32, 0.52], [0.24, 0.8], [0.3, 1.0], [0.34, 1.12], [0.22, 1.3], [0.16, 1.45], [0, 1.45]], 0, 0, 0, { seg: 16 });
      B.lathe('paint', st, [[0.14, 1.36], [0.4, 1.42], [0.82, 1.52], [0.95, 1.6], [0.96, 1.66], [0.86, 1.66], [0.4, 1.6], [0, 1.6]], 0, 0, 0, { seg: 16 });
      for (let i = 0; i < 16; i++) { const a2 = (i / 16) * TAU; B.sph(NS('paint'), st, 0.07, Math.cos(a2) * 0.93, 1.6, Math.sin(a2) * 0.93, { ws: 6, hs: 4, sy: 0.6 }); }
      B.cyl(NS('gloss'), '#4a7f84', 0.84, 0.02, 0, 1.62, 0, { seg: 16 });
      B.lathe('paint', st, [[0.1, 1.6], [0.13, 1.8], [0.09, 2.0], [0.14, 2.1], [0.36, 2.16], [0.5, 2.24], [0.5, 2.3], [0.42, 2.3], [0, 2.26]], 0, 0, 0, { seg: 14 });
      B.cyl(NS('gloss'), '#4a7f84', 0.42, 0.02, 0, 2.27, 0, { seg: 14 });
      B.lathe('metal', '#7b6a44', [[0, 2.26], [0.1, 2.28], [0.14, 2.38], [0.12, 2.5], [0.07, 2.58], [0.02, 2.64], [0, 2.64]], 0, 0, 0, { seg: 10 });
      for (let i = 0; i < 6; i++) { const a2 = (i / 6) * TAU; B.box(NS('metal'), '#5f6a44', 0.05, 0.16, 0.02, Math.cos(a2) * 0.05, 2.7, Math.sin(a2) * 0.05, { ry: -a2 + HP, rx: 0.4, r: 0.01 }); }
      // water: trickles off both bowls' lips, a jet from the finial (thin glassy strands, no shading slabs)
      const strand = (x0, y0, z0, out, y1) => { const r0 = Math.hypot(x0, z0) || 1, ux = x0 / r0, uz = z0 / r0; B.tube(NS('gloss'), '#cde9ea', [P3(x0, y0, z0), P3(x0 + ux * out * 0.5, y0 - 0.04, z0 + uz * out * 0.5), P3(x0 + ux * out * 0.9, (y0 + y1) / 2, z0 + uz * out * 0.9), P3(x0 + ux * out, y1, z0 + uz * out)], 0.018, { radial: 4 }); };
      for (let i = 0; i < 12; i++) { const a2 = (i / 12) * TAU + 0.13; strand(Math.cos(a2) * 0.97, 1.63, Math.sin(a2) * 0.97, 0.16, 0.58); }
      for (let i = 0; i < 8; i++) { const a2 = (i / 8) * TAU; strand(Math.cos(a2) * 0.5, 2.28, Math.sin(a2) * 0.5, 0.12, 1.63); }
      B.cyl(NS('gloss'), '#e2f3f3', 0.02, 0.35, 0, 2.82, 0, { seg: 5 });
      for (let i = 0; i < 4; i++) { const a2 = (i / 4) * TAU + 0.4; B.tube(NS('gloss'), '#e2f3f3', [P3(0, 2.98, 0), P3(Math.cos(a2) * 0.18, 3.05, Math.sin(a2) * 0.18), P3(Math.cos(a2) * 0.34, 2.7, Math.sin(a2) * 0.34), P3(Math.cos(a2) * 0.42, 2.3, Math.sin(a2) * 0.42)], 0.012, { radial: 3 }); }
      // lion masks on the basin wall with spouts
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + PI / 4, cx = Math.cos(a) * (R - 0.02), cz = Math.sin(a) * (R - 0.02);
        B.push(cx, 0.4, cz, -a + HP);
        B.cyl('metal', '#6f7a5a', 0.13, 0.06, 0, 0, 0.02, { rx: HP, seg: 12 });
        B.sph(NS('metal'), '#6f7a5a', 0.07, 0, -0.02, 0.06, { ws: 8, hs: 5 });
        B.pop();
      }
      // a drinking-cup post by the basin
      B.lathe('metal', K.iron, [[0, 0], [0.14, 0], [0.12, 0.1], [0.08, 0.2], [0.07, 0.9], [0.1, 0.95], [0.09, 1.0], [0, 1.02]], R + 0.45, 0, 0, { seg: 10 });
      B.cyl(NS('metal'), K.gold, 0.05, 0.08, R + 0.45, 0.85, 0.12, { rx: HP, seg: 8 });
      B.blob(2 * R + 1.2, 2 * R + 1.2);
      const q = R * 0.95, n = R * 0.62;
      B.col(-q, 0, -n, q, 0.72, n); B.col(-n, 0, -q, n, 0.72, q);
      colBox(B, 0, 0, 0, 0.9, 1.6, 0.9);
      colBox(B, R + 0.45, 0, 0, 0.26, 1.0, 0.26, true);
    },
  };

  // ---- gas street lamp: fluted post, ladder bar, a four-sided lantern with a crown (variant 1: twin swan-neck arms)
  function lantern(B, x, y, z, s = 1) {
    B.push(x, y, z, PI / 4, 0, 0, s);
    B.lathe('metal', K.iron, [[0.06, 0], [0.13, 0.02], [0.14, 0.06], [0.09, 0.1]], 0, 0, 0, { seg: 4 });
    B.lathe(NS('glow'), K.lit, [[0.001, 0.1], [0.13, 0.1], [0.2, 0.52], [0.001, 0.52]], 0, 0, 0, { seg: 4, glow: 1.9 });
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; rod(B, NS('metal'), K.iron, P3(Math.cos(a) * 0.14, 0.1, Math.sin(a) * 0.14), P3(Math.cos(a) * 0.215, 0.53, Math.sin(a) * 0.215), 0.013, 3); }
    B.lathe('metal', K.iron, [[0.24, 0.52], [0.26, 0.56], [0.18, 0.64], [0.07, 0.72], [0.05, 0.78], [0.08, 0.82], [0, 0.9]], 0, 0, 0, { seg: 4 });
    B.sph(NS('metal'), K.gold, 0.035, 0, 0.92, 0, { ws: 6, hs: 4 });
    B.pop();
  }
  D.crossmarket_lamp = {
    desc: 'Gas-style street lamp: fluted cast-iron post on a moulded base, gilt collars, ladder bar, square lantern with a crown (glows at dusk). variant 1 = twin swan-neck arms with two lanterns (arms along local X). Collider: the post.',
    params: { height: 'm post (3.4)' }, variants: 2, mount: 'ground',
    build(B, o) {
      const Hh = o.height ?? 3.4, v = (o.variant ?? 0) % 2, c = K.iron;
      B.lathe('metal', c, [[0, 0], [0.22, 0], [0.23, 0.05], [0.18, 0.12], [0.17, 0.5], [0.12, 0.62], [0.09, 0.75], [0.075, Hh - 0.2], [0.1, Hh - 0.12], [0.1, Hh - 0.04], [0, Hh]], 0, 0, 0, { seg: 10 });
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; pbox(B, NS('metal'), shade(c, 0.8), 0.025, 0.36, 0.025, Math.cos(a) * 0.175, 0.3, Math.sin(a) * 0.175); }
      B.tor(NS('metal'), K.gold, 0.085, 0.016, 0, 0.9, 0, { rs: 4, ts: 10, rx: HP });
      B.tor(NS('metal'), K.gold, 0.08, 0.014, 0, Hh - 0.25, 0, { rs: 4, ts: 10, rx: HP });
      pbox(B, 'metal', c, 0.7, 0.04, 0.04, 0, Hh - 0.35, 0);
      for (const sx of [-1, 1]) B.sph(NS('metal'), K.gold, 0.03, sx * 0.35, Hh - 0.35, 0, { ws: 6, hs: 4 });
      if (v === 0) lantern(B, 0, Hh - 0.02, 0);
      else {
        for (const sx of [-1, 1]) {
          B.tube('metal', c, [P3(0, Hh - 0.3, 0), P3(sx * 0.25, Hh + 0.05, 0), P3(sx * 0.55, Hh + 0.1, 0), P3(sx * 0.7, Hh - 0.05, 0)], 0.028, { radial: 5 });
          lantern(B, sx * 0.7, Hh - 0.62, 0, 0.9);
        }
        lantern(B, 0, Hh - 0.02, 0, 0.8);
      }
      B.blob(0.6, 0.6);
      colBox(B, 0, 0, 0, 0.36, Hh, 0.36, true);
    },
  };

  // ---- cast-iron bollards: a row along local +X (count, spacing); cannon-style with a crown ring
  D.crossmarket_bollard = {
    desc: 'Row of cast-iron cannon bollards along local +X (count, spacing), painted bistro green with a gilt band (variant 1: black + white band). Colliders per bollard.',
    params: { count: '(1)', spacing: 'm (1.4)' }, variants: 2, mount: 'ground',
    build(B, o) {
      const n = o.count ?? 1, sp = o.spacing ?? 1.4, v = (o.variant ?? 0) % 2, c = v ? K.black : K.iron, band = v ? '#e9e4d8' : K.gold;
      for (let i = 0; i < n; i++) {
        const x = i * sp;
        B.lathe('metal', c, [[0, 0], [0.17, 0], [0.16, 0.06], [0.13, 0.12], [0.12, 0.62], [0.14, 0.66], [0.14, 0.72], [0.11, 0.75], [0.11, 0.8], [0.08, 0.86], [0, 0.88]], x, 0, 0, { seg: 10 });
        B.tor(NS('metal'), band, 0.126, 0.018, x, 0.55, 0, { rs: 3, ts: 10, rx: HP });
        B.blob(0.5, 0.5, x, 0);
        colBox(B, x, 0, 0, 0.3, 0.88, 0.3);
      }
    },
  };

  // ---- park bench: cast-iron scroll ends, timber slats (seat faces +Z)
  D.crossmarket_bench = {
    desc: 'Victorian park bench (seat faces +Z): cast-iron scrolled ends in bistro green, timber slats, a plaque. Collider: seat + back.',
    params: { length: 'm (1.8)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 1.8, c = K.iron;
      for (const sx of [-1, 1]) {
        const x = sx * (L / 2 - 0.12);
        B.tube('metal', c, [P3(x, 0, 0.22), P3(x, 0.2, 0.2), P3(x, 0.42, 0.22), P3(x, 0.46, 0.05), P3(x, 0.42, -0.2), P3(x, 0.7, -0.26), P3(x, 0.92, -0.3)], 0.03, { radial: 5 });
        B.tube('metal', c, [P3(x, 0, -0.2), P3(x, 0.2, -0.18), P3(x, 0.42, -0.2)], 0.03, { radial: 5 });
        B.tube(NS('metal'), c, [P3(x, 0.42, 0.22), P3(x, 0.6, 0.26), P3(x, 0.66, 0.16), P3(x, 0.6, 0.08)], 0.022, { radial: 4 });
      }
      for (const z of [-0.14, -0.04, 0.06, 0.16]) B.box('wood', shade(K.wood, 0.92 + hash(z * 31 + L) * 0.14), L, 0.035, 0.085, 0, 0.45, z, { r: 0.012 });
      B.push(0, 0.45, -0.22, 0, -0.25);
      for (const y of [0.14, 0.26, 0.38]) B.box('wood', shade(K.wood, 0.92 + hash(y * 31 + L) * 0.14), L, 0.085, 0.035, 0, y, 0, { r: 0.012 });
      pbox(B, NS('metal'), K.gold, 0.2, 0.06, 0.01, 0, 0.26, 0.02);
      B.pop();
      B.col(-L / 2, 0, -0.32, L / 2, 0.9, 0.26);
      B.blob(L + 0.3, 0.8);
    },
  };

  // ---- iron railing run along local +X (optional collider): posts with finials, top + bottom rails, bars, dog bars
  D.crossmarket_railing = {
    desc: 'Wrought-iron railing along local +X (length): square posts with urn finials every ~1.8 m, top rail, bottom rail, bars with alternating spear tips, a scroll band. Rail collider over its full length + height.',
    params: { length: 'm (4)', height: 'm (0.95)', depth: 'collider depth toward -Z (0.1)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 4, Hh = o.height ?? 0.95, c = o.color ?? K.iron;
      const np = Math.max(1, Math.round(L / 1.8));
      for (let i = 0; i <= np; i++) { const x = (i * L) / np; B.box('metal', c, 0.07, Hh + 0.08, 0.07, x, (Hh + 0.08) / 2, 0, { r: 0.012 }); B.sph(NS('metal'), K.gold, 0.045, x, Hh + 0.13, 0, { ws: 6, hs: 4 }); }
      pbox(B, 'metal', c, L, 0.05, 0.05, L / 2, Hh, 0);
      pbox(B, 'metal', c, L, 0.04, 0.04, L / 2, 0.12, 0);
      pbox(B, NS('metal'), c, L, 0.025, 0.03, L / 2, Hh - 0.2, 0);
      const nb = Math.round(L / 0.12);
      for (let i = 1; i < nb; i++) { const x = (i * L) / nb; pbox(B, NS('metal'), c, 0.016, Hh - 0.12, 0.016, x, (Hh + 0.12) / 2, 0); }
      for (let i = 0; i < Math.round(L / 0.48); i++) B.tor(NS('metal'), c, 0.06, 0.009, (i + 0.5) * (L / Math.round(L / 0.48)), Hh - 0.1, 0, { rs: 3, ts: 8 });
      // see-through iron: always a rail collider over its full length + height (kids blocked; shots, ink, squids pass)
      B.col(0, 0, -(o.depth ?? 0.1), L, Hh + 0.1, 0.05, { rail: true });
    },
  };

  // ---- stone balustrade along local +X: plinth, turned balusters, coping, dies (piers) at the ends + every ~2.4 m
  D.crossmarket_balustrade = {
    desc: 'Sandstone balustrade along local +X (length): plinth, turned balusters, moulded coping, square dies at the ends (with ball finials) and every ~2.4 m. Rail collider (see-through between the balusters).',
    params: { length: 'm (4)', height: 'm (0.9)', balls: 'bool (true)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 4, Hh = o.height ?? 0.9, st = o.color ?? K.stone;
      B.box('paint', shade(st, 0.94), L, 0.14, 0.34, L / 2, 0.07, 0, { r: 0.02 });
      B.box('paint', st, L + 0.06, 0.12, 0.4, L / 2, Hh - 0.06, 0, { r: 0.03 });
      const nd = Math.max(1, Math.round(L / 2.4));
      for (let i = 0; i <= nd; i++) {
        const x = Math.min(L - 0.18, Math.max(0.18, (i * L) / nd));
        B.box('paint', st, 0.36, Hh + 0.06, 0.4, x, (Hh + 0.06) / 2, 0, { r: 0.02 });
        if (o.balls !== false && (i === 0 || i === nd)) { B.box('paint', shade(st, 1.03), 0.3, 0.08, 0.3, x, Hh + 0.1, 0, { r: 0.015 }); B.sph('paint', st, 0.15, x, Hh + 0.28, 0, { ws: 10, hs: 7 }); }
      }
      const prof = [[0.065, 0], [0.05, 0.08], [0.095, 0.34], [0.05, 0.55], [0.065, 0.6], [0.06, Hh - 0.26], [0, Hh - 0.26]];
      const n = Math.round(L / 0.2);
      for (let i = 0; i < n; i++) { const x = (i + 0.5) * (L / n); if (Math.abs(((x / (L / nd)) % 1) - 0) < 0.08 || Math.abs(((x / (L / nd)) % 1) - 1) < 0.08) continue; B.lathe(NS('paint'), st, prof, x, 0.14, 0, { seg: 5 }); }
      // balusters with gaps between: a rail (the dies + coping don't make it a wall)
      B.col(0, 0, -0.2, L, Hh + 0.05, 0.2, { rail: true });
    },
  };

  // ---- newspaper kiosk: octagonal green iron kiosk with a domed roof, a serving hatch, posters, headline boards
  D.crossmarket_kiosk = {
    desc: 'Newspaper kiosk (R 1.0): eight-sided bistro-green iron kiosk, glazed upper band, serving hatch toward +Z with a counter of papers, headline bill boards, a scalloped zinc dome with a finial + NEWS lettering in the frieze. Collider: the body.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const R = 1.0, Hh = 2.3, c = K.iron;
      B.lathe('paint', c, [[0, 0], [R + 0.05, 0], [R + 0.05, 0.12], [R, 0.14], [R, 1.0], [R + 0.04, 1.04], [R + 0.04, 1.08], [R, 1.1], [R, Hh], [R + 0.18, Hh + 0.05], [R + 0.18, Hh + 0.28], [0, Hh + 0.28]], 0, 0, 0, { seg: 8, ry: PI / 8 });
      // panels + posters on seven faces, the hatch on +Z
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU, ap = R * Math.cos(PI / 8);
        B.push(Math.sin(a) * ap, 0, Math.cos(a) * ap, a);
        if (i === 0) {
          pbox(B, NS('gloss'), K.glassWarm, 0.66, 0.9, 0.02, 0, 1.5, 0.01);
          pbox(B, NS('glow'), K.lit, 0.6, 0.2, 0.004, 0, 1.82, 0.022, { glow: 0.7 });
          B.box('wood', K.woodDk, 0.84, 0.05, 0.36, 0, 1.02, 0.16, { r: 0.01 });
          for (let k = 0; k < 4; k++) pbox(B, NS('paint'), k % 2 ? '#e9e2d0' : '#f2ede2', 0.28, 0.03, 0.22, -0.26 + k * 0.17, 1.07 + (k % 2) * 0.01, 0.16, { ry: (k - 1.5) * 0.1 });
        } else {
          pbox(B, NS('paint'), shade(c, 0.85), 0.62, 0.78, 0.012, 0, 0.58, 0.006);
          KIT.bill(B, 0, 1.56, 0.008, 0.5, 0.74, Object.keys(KIT.BILLS)[i % 8]);
        }
        B.pop();
      }
      // frieze letters + dome
      for (const a of [0, PI]) { B.push(Math.sin(a) * (R + 0.19), 0, Math.cos(a) * (R + 0.19), a); letters(B, 'NEWS', { h: 0.15, x: 0, y: Hh + 0.09, z: 0.002, c: K.gold, flat: true, wt: 0.22, track: 0.2 }); B.pop(); }
      B.lathe('paint', K.zinc, [[R + 0.2, Hh + 0.28], [R * 0.9, Hh + 0.55], [R * 0.55, Hh + 0.85], [0.18, Hh + 1.02], [0.08, Hh + 1.1], [0, Hh + 1.12]], 0, 0, 0, { seg: 8, ry: PI / 8 });
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; B.tube(NS('metal'), c, [P3(Math.cos(a) * (R + 0.2), Hh + 0.3, Math.sin(a) * (R + 0.2)), P3(Math.cos(a) * R * 0.56, Hh + 0.86, Math.sin(a) * R * 0.56), P3(0, Hh + 1.1, 0)], 0.02, { radial: 3 }); }
      B.lathe('metal', K.gold, [[0, 0], [0.07, 0.05], [0.05, 0.2], [0.09, 0.3], [0, 0.42]], 0, Hh + 1.1, 0, { seg: 8 });
      // headline boards on easels in front
      for (const sx of [-1, 1]) {
        B.push(sx * 0.95, 0, 0.9, sx * -0.4);
        B.box('wood', K.woodDk, 0.5, 0.72, 0.03, 0, 0.5, 0, { rx: -0.12, r: 0.01 });
        pbox(B, NS('paint'), '#f4efe2', 0.42, 0.6, 0.004, 0, 0.52, 0.02, { rx: -0.12 });
        letters(B, sx > 0 ? 'TRAMS' : 'MARKET', { h: 0.06, x: 0, y: 0.7, z: 0.03, c: '#1d1f22', flat: true, wt: 0.24 });
        for (let k = 0; k < 3; k++) pbox(B, NS('paint'), '#4a4f58', 0.32, 0.03, 0.004, 0, 0.56 - k * 0.1, 0.03);
        B.pop();
      }
      B.blob(2.8, 2.8);
      colBox(B, 0, 0, 0, 2.0, Hh + 0.3, 2.0, true);
    },
  };

  // ---- advertising (Morris) column: round pillar pasted with posters, a crown frieze and a scalloped cap
  D.crossmarket_column = {
    desc: 'Advertising column (R 0.55): a round iron pillar pasted with posters on 6 sides, moulded base, a lettered crown frieze (THEATRE · CIRCUS), a scalloped zinc cap with a finial. Collider.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const R = 0.55, Hh = 2.6, c = K.iron;
      B.lathe('metal', c, [[0, 0], [R + 0.12, 0], [R + 0.12, 0.1], [R + 0.05, 0.16], [R, 0.3], [R, Hh], [R + 0.08, Hh + 0.04], [R + 0.08, Hh + 0.36], [R + 0.16, Hh + 0.42], [0, Hh + 0.42]], 0, 0, 0, { seg: 18 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        B.push(Math.sin(a) * (R + 0.012), 0, Math.cos(a) * (R + 0.012), a);
        KIT.bill(B, 0, 1.0 + (i % 2) * 0.15, 0.0, 0.5, 0.78, Object.keys(KIT.BILLS)[(i * 3) % 8]);
        KIT.bill(B, 0, 1.95 - (i % 2) * 0.1, 0.0, 0.46, 0.66, Object.keys(KIT.BILLS)[(i * 5 + 1) % 8]);
        B.pop();
      }
      for (const a of [0, PI]) { B.push(Math.sin(a) * (R + 0.09), 0, Math.cos(a) * (R + 0.09), a); letters(B, a ? 'CIRCUS' : 'THEATRE', { h: 0.14, x: 0, y: Hh + 0.13, z: 0.002, c: K.gold, flat: true, wt: 0.22, track: 0.12 }); B.pop(); }
      B.lathe('paint', K.zinc, [[R + 0.18, Hh + 0.42], [R * 0.9, Hh + 0.62], [R * 0.4, Hh + 0.82], [0.08, Hh + 0.92], [0, Hh + 0.94]], 0, 0, 0, { seg: 12 });
      B.lathe('metal', K.gold, [[0, 0], [0.06, 0.04], [0.04, 0.16], [0.07, 0.22], [0, 0.34]], 0, Hh + 0.92, 0, { seg: 8 });
      B.blob(1.6, 1.6);
      colBox(B, 0, 0, 0, 1.1, Hh + 0.4, 1.1, true);
    },
  };

  // ---- produce stack: crates of produce stacked on a pallet / cobbles (cover), sacks
  D.crossmarket_crates = {
    desc: 'Market crate stack: 3–5 slatted crates of produce on a pallet, a sack or two (variant: kind mix). Collider.',
    params: { kind: 'veg | fruit | fish | flowers' }, variants: 3, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 3, S = STALLS[o.kind ?? 'veg'] ?? STALLS.veg, seed = Math.round(o.pos[0] * 17 + o.pos[2] * 3);
      const g = S.goods;
      pbox(B, 'wood', K.woodDk, 1.3, 0.12, 0.9, 0, 0.06, 0);
      crate(B, -0.32, 0.12, -0.2, 0.6, 0.42, 0.3, g[0], seed); crate(B, 0.32, 0.12, -0.2, 0.6, 0.42, 0.3, g[1 % g.length], seed + 1);
      crate(B, -0.32, 0.12, 0.23, 0.6, 0.42, 0.3, g[2 % g.length], seed + 2); crate(B, 0.32, 0.12, 0.23, 0.6, 0.42, 0.3, g[3 % g.length], seed + 3);
      if (v !== 1) { crate(B, -0.1, 0.42, 0.0, 0.6, 0.42, 0.3, g[4 % g.length], seed + 4); }
      if (v === 2) crate(B, 0.25, 0.72, 0.0, 0.6, 0.42, 0.3, g[5 % g.length], seed + 5);
      for (let i = 0; i < (v === 1 ? 2 : 1); i++) B.add('paint', blobGeo(1, 1, 3 + i), '#c8a577', 0.85, 0.3, -0.25 + i * 0.45, { sx: 0.24, sy: 0.32, sz: 0.2 });
      B.col(-0.66, 0, -0.46, 0.66, v === 2 ? 1.02 : v === 0 ? 0.72 : 0.44, 0.46);
      if (v !== 1) B.col(-0.4, 0.72, -0.25, 0.55, v === 2 ? 1.02 : 0.72, 0.25);
      B.blob(1.8, 1.4);
    },
  };

  // ---- small street clutter ----------------------------------------------------------------------------------
  // pillar post box: red cast-iron column with a domed cap, the slot, a collection plate, the royal-ish cypher
  D.crossmarket_postbox = {
    desc: 'Cast-iron pillar post box (red, domed cap, slot, collection plate). Collider.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const R = '#b8322a';
      B.lathe('gloss', R, [[0, 0], [0.27, 0], [0.27, 0.08], [0.24, 0.12], [0.23, 1.2], [0.26, 1.24], [0.27, 1.32], [0.22, 1.36], [0.18, 1.46], [0.08, 1.54], [0, 1.56]], 0, 0, 0, { seg: 14 });
      pbox(B, NS('paint'), K.black, 0.26, 0.035, 0.05, 0, 1.12, 0.225);
      pbox(B, NS('paint'), '#f2eee6', 0.2, 0.14, 0.01, 0, 0.86, 0.232);
      for (let i = 0; i < 3; i++) pbox(B, NS('paint'), K.black, 0.14, 0.012, 0.004, 0, 0.9 - i * 0.03, 0.238);
      B.tor(NS('gloss'), K.gold, 0.08, 0.01, 0, 1.33, 0.2, { rs: 3, ts: 12 });
      B.blob(0.7, 0.7);
      colBox(B, 0, 0, 0, 0.5, 1.5, 0.5, true);
    },
  };
  // fingerpost: a cast-iron post with pointing arms (text on both faces), a finial
  D.crossmarket_fingerpost = {
    desc: 'Fingerpost signpost: fluted iron post, finial, 2–4 pointing arms (local angles `arms`: [[deg, text], …]) lettered on both faces. Collider: the post.',
    params: { arms: '[[deg, text]]' }, variants: 1, mount: 'ground',
    build(B, o) {
      const arms = o.arms ?? [[0, 'MARKET HALL'], [180, 'HARBOUR']], c = K.iron;
      B.lathe('metal', c, [[0, 0], [0.16, 0], [0.16, 0.08], [0.1, 0.16], [0.06, 0.3], [0.05, 3.0], [0.07, 3.05], [0, 3.1]], 0, 0, 0, { seg: 8 });
      B.sph('metal', K.gold, 0.07, 0, 3.15, 0, { ws: 8, hs: 5 });
      arms.forEach(([deg, text], i) => {
        const y = 2.75 - i * 0.26, L = textW(text, 0.2, 0.08) * 0.11 + 0.4;
        B.push(0, y, 0, (deg * PI) / 180);
        B.add('paint', tpl(['finger', L].map(kf).join('|'), () => KIT.extrudeGeo([[0, -0.1], [L - 0.12, -0.1], [L, 0], [L - 0.12, 0.1], [0, 0.1]], 0.04, 0.006)), '#f2eee6', 0, 0, 0, { ry: -HP });
        for (const f of [1, -1]) { B.push(0, 0, f * 0.022, f > 0 ? 0 : PI); letters(B, text, { h: 0.11, x: f > 0 ? -0.1 : 0.1, y: -0.055, z: 0.002, c: K.ironDk, flat: true, wt: 0.2, track: 0.08, align: f > 0 ? 'right' : 'left' }); B.pop(); }
        B.pop();
      });
      B.blob(0.5, 0.5);
      colBox(B, 0, 0, 0, 0.3, 3.0, 0.3, true);
    },
  };
  // hessian sacks + a sack truck (collider)
  D.crossmarket_sacks = {
    desc: 'Pile of hessian sacks (flour / potatoes / coffee) with a sack truck leaning on it. Collider.',
    params: {}, variants: 2, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 2, cc = ['#c8a577', '#b9956a', '#d1b184'];
      const sack = (x, y, z, ry, s = 1, k = 0) => { B.add('paint', blobGeo(1, 1, 2 + k), cc[k % 3], x, y + 0.2 * s, z, { sx: 0.3 * s, sy: 0.22 * s, sz: 0.24 * s, ry }); B.cyl(NS('paint'), shade(cc[k % 3], 0.85), 0.07 * s, 0.1 * s, x + 0.26 * s * Math.cos(ry), y + 0.22 * s, z - 0.26 * s * Math.sin(ry), { rz: HP, ry, seg: 6 }); };
      sack(-0.3, 0, 0, 0.1, 1, 0); sack(0.32, 0, 0.05, -0.2, 1, 1); sack(0, 0.36, 0.02, 0.4, 0.95, 2);
      if (v === 0) sack(0.1, 0, -0.5, 1.4, 0.9, 1);
      // sack truck
      B.push(0.75, 0, 0.1, 0, -0.3);
      for (const sx of [-1, 1]) B.cyl('metal', K.iron, 0.02, 1.3, sx * 0.2, 0.65, 0, { seg: 6 });
      for (let k = 0; k < 4; k++) pbox(B, NS('metal'), K.iron, 0.4, 0.02, 0.02, 0, 0.3 + k * 0.3, 0);
      pbox(B, 'metal', K.iron, 0.44, 0.02, 0.2, 0, 0.02, 0.1);
      for (const sx of [-1, 1]) B.cyl('rubber', K.black, 0.12, 0.06, sx * 0.26, 0.12, -0.06, { rz: HP, seg: 12 });
      B.pop();
      B.col(-0.62, 0, -0.35, 0.95, 0.62, 0.35);
      B.blob(1.8, 1.1);
    },
  };
  // oak casks (wine / herring): a rack of two + one standing (collider)
  D.crossmarket_casks = {
    desc: 'Oak casks: two on a timber cradle + one standing, iron hoops, bung. Collider.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const prof = [[0, -0.42], [0.26, -0.42], [0.31, -0.3], [0.33, 0], [0.31, 0.3], [0.26, 0.42], [0, 0.42]];
      const cask = (x, y, z, rx, rz) => {
        B.lathe('wood', K.wood, prof, x, y, z, { seg: 14, rx, rz });
        for (const t of [-0.36, -0.14, 0.14, 0.36]) { const r = 0.26 + 0.07 * (1 - Math.abs(t) / 0.42) ** 0.5; B.push(x, y, z, 0, rx, rz); B.tor(NS('metal'), K.ironDk, r, 0.012, 0, t, 0, { rs: 3, ts: 16, rx: HP }); B.pop(); }
      };
      for (const sx of [-1, 1]) pbox(B, 'wood', K.woodDk, 0.12, 0.14, 1.0, sx * 0.4, 0.07, 0);
      cask(-0.36, 0.45, 0, 0, HP); cask(0.36, 0.45, 0, 0, HP);
      cask(0.95, 0.42, 0.1, 0, 0);
      B.col(-0.75, 0, -0.45, 1.3, 0.8, 0.45);
      B.blob(2.2, 1.2);
    },
  };
  // lobster pots + a coil of rope + fish boxes on the quay (collider)
  D.crossmarket_pots = {
    desc: 'Harbour clutter: stacked lobster pots (netted half-barrels), a rope coil, stacked fish boxes, a float. Collider.',
    params: {}, variants: 2, mount: 'ground',
    build(B, o) {
      const pot = (x, y, z, ry) => {
        B.push(x, y, z, ry);
        pbox(B, 'wood', K.woodDk, 0.7, 0.05, 0.5, 0, 0.025, 0);
        for (let k = 0; k < 3; k++) B.tor('wood', K.wood, 0.25, 0.018, -0.25 + k * 0.25, 0.05, 0, { rs: 3, ts: 12, arc: PI, ry: HP });
        B.add(NS('fence'), tpl('potnet', () => { const g = new H.THREE.CylinderGeometry(0.245, 0.245, 0.6, 12, 1, true, 0, PI); g.rotateZ(HP); g.rotateX(-HP); return g; }), '#d9ccb0', 0, 0.05, 0, { uvs: [9, 7] });
        B.pop();
      };
      pot(-0.4, 0, 0, 0.1); pot(0.38, 0, 0.05, -0.1); pot(0, 0.3, 0.02, 0.3);
      if ((o.variant ?? 0) % 2 === 0) { B.tor('rubber', '#cdb894', 0.28, 0.06, 1.05, 0.06, 0.1, { rs: 5, ts: 16, rx: HP }); B.tor('rubber', '#cdb894', 0.2, 0.06, 1.05, 0.16, 0.1, { rs: 5, ts: 14, rx: HP }); }
      B.sph('gloss', '#e0782e', 0.14, -0.9, 0.14, 0.2, { ws: 10, hs: 7 });
      B.col(-1.05, 0, -0.35, 1.35, 0.62, 0.4);
      B.blob(2.6, 1.2);
    },
  };
  // wooden flower tubs by a door (small, collider)
  D.crossmarket_tubs = {
    desc: 'A pair of painted wooden flower tubs with geraniums / a bay tree (count along local X). Collider per tub.',
    params: { count: '(2)', spacing: 'm (1.2)', color: 'tub paint' }, variants: 2, mount: 'ground',
    build(B, o) {
      const n = o.count ?? 2, sp = o.spacing ?? 1.2, c = o.color ?? K.iron, v = (o.variant ?? 0) % 2;
      for (let i = 0; i < n; i++) {
        const x = i * sp;
        B.box('wood', c, 0.5, 0.46, 0.5, x, 0.23, 0, { r: 0.02 });
        for (const y of [0.08, 0.38]) pbox(B, NS('metal'), K.black, 0.52, 0.03, 0.52, x, y, 0);
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.sph(NS('metal'), K.gold, 0.03, x + sx * 0.25, 0.48, sz * 0.25, { ws: 5, hs: 4 });
        if (v === 0) {
          B.add('foliage', blobGeo(1, 1, 2 + i), '#4f8a45', x, 0.62, 0, { s: 0.3, sy: 0.22 });
          for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + i; B.sph(NS('foliage'), ['#d9443c', '#e87a8c', '#d9443c'][k % 3], 0.05, x + Math.cos(a) * 0.2, 0.74 + (k % 2) * 0.06, Math.sin(a) * 0.2, { ws: 5, hs: 3 }); }
        } else {
          B.cyl('wood', '#6b4a32', 0.03, 0.8, x, 0.85, 0, { seg: 5 });
          B.add('foliage', blobGeo(1, 1, 5 + i), '#3f7a45', x, 1.35, 0, { s: 0.34 });
        }
        colBox(B, x, 0, 0, 0.52, 0.5, 0.52);
      }
    },
  };
  // chalk A-board (menu)
  D.crossmarket_aboard = {
    desc: 'Chalk A-board with a timber frame, chalk menu lines and a heading. Non-colliding.',
    params: { text: 'heading (MENU)' }, variants: 1, mount: 'ground',
    build(B, o) {
      for (const f of [1, -1]) {
        B.push(0, 0, f * 0.16, f > 0 ? 0 : PI);
        B.push(0, 0, 0, 0, -0.18);
        B.box('wood', K.woodDk, 0.62, 0.9, 0.03, 0, 0.47, 0, { r: 0.01 });
        pbox(B, NS('paint'), '#2a2d2b', 0.52, 0.78, 0.01, 0, 0.47, 0.016);
        letters(B, o.text ?? 'MENU', { h: 0.07, x: 0, y: 0.74, z: 0.023, c: '#f2eee6', flat: true, wt: 0.22 });
        for (let k = 0; k < 5; k++) pbox(B, NS('paint'), k % 2 ? '#f2d15a' : '#f2eee6', 0.34 - (k % 3) * 0.06, 0.018, 0.004, -0.02, 0.62 - k * 0.09, 0.023);
        B.pop(); B.pop();
      }
    },
  };
  // iron litter bin
  D.crossmarket_bin = {
    desc: 'Cast-iron litter bin (bistro green, pierced band, domed lid). Collider.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.lathe('metal', K.iron, [[0, 0], [0.24, 0], [0.24, 0.05], [0.2, 0.08], [0.22, 0.8], [0.25, 0.84], [0.25, 0.9], [0.18, 0.96], [0.06, 1.0], [0, 1.02]], 0, 0, 0, { seg: 12 });
      B.tor(NS('metal'), K.gold, 0.225, 0.012, 0, 0.62, 0, { rs: 3, ts: 12, rx: HP });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; B.cyl(NS('metal'), K.ironDk, 0.035, 0.02, Math.cos(a) * 0.215, 0.45, Math.sin(a) * 0.215, { rx: HP, rz: -a, seg: 6 }); }
      B.blob(0.6, 0.6);
      colBox(B, 0, 0, 0, 0.46, 1.0, 0.46, true);
    },
  };

  // cast-iron manhole cover / gully grate set in the setts (flat, non-colliding)
  D.crossmarket_manhole = {
    desc: 'Cast-iron manhole cover (variant 0, round, with a lettered rim) or a gully grate (variant 1), flush in the paving. Non-colliding.',
    params: {}, variants: 2, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      if ((o.variant ?? 0) % 2 === 0) {
        B.cyl(NS('metal'), '#3a3b3d', 0.36, 0.02, 0, 0.01, 0, { seg: 18 });
        B.tor(NS('metal'), '#56585b', 0.33, 0.012, 0, 0.02, 0, { rs: 3, ts: 18, rx: HP });
        for (let k = -3; k <= 3; k++) pbox(B, NS('metal'), '#4a4c4f', 0.5 - Math.abs(k) * 0.05, 0.008, 0.025, 0, 0.022, k * 0.07);
      } else {
        pbox(B, NS('metal'), '#3a3b3d', 0.5, 0.02, 0.32, 0, 0.01, 0);
        for (let k = -4; k <= 4; k++) pbox(B, NS('metal'), '#1c1d1f', 0.03, 0.006, 0.24, k * 0.05, 0.022, 0);
      }
    },
  };

  // fly-posted bills on a wall (wall at z = 0, facing +Z): a cluster of overlapping vintage posters, torn edges
  D.crossmarket_bills = {
    desc: 'Fly-posted bills on a wall (local z = 0 = wall face, facing +Z): 3–5 overlapping vintage posters. Non-colliding.',
    params: { count: '(4)', seedN: 'mix' }, variants: 1, mount: 'wall',
    build(B, o) {
      const n = o.count ?? 4, kinds = Object.keys(KIT.BILLS), sd = o.seedN ?? 1;
      for (let i = 0; i < n; i++) {
        const w = 0.5 + hash(sd * 3 + i) * 0.15, h2 = w * 1.45, x = (i - (n - 1) / 2) * 0.52 + (hash(sd + i * 7) - 0.5) * 0.1, y = 1.35 + (hash(sd * 5 + i) - 0.5) * 0.3;
        KIT.bill(B, x, y, 0.004 + i * 0.003, w, h2, kinds[(sd + i * 3) % kinds.length], { rz: (hash(sd * 9 + i) - 0.5) * 0.08 });
      }
    },
  };

  return { produce, crate, stallCanopy, lantern, STALLS };
}
