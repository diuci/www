// Crossroads Market — the town beyond the arena: the far quays across the harbour channels on either side, lined with
// tall old houses, so the market square sits inside a harbour town rather than on a raft. Scenery only (outside the
// bounds, unreachable): no colliders, no shadow casting, simplified facades.

export function registerScenery(D, H, KIT) {
  const { PI, TAU, HP, P3, NS, K, tpl, kf, pbox, rod, shade, mixc, hash, GB, cx3, extrudeGeo } = KIT;
  const WALLS = ['#e2c48e', '#efe6d3', '#d8b9a2', '#a9bcc4', '#c98e6e', '#e9dcc0', '#b8765c', '#cfd6c9', '#e6cf9a', '#d6a58a'];
  const ROOFS = ['#b0634a', '#5b646e', '#9c5a44', '#6b7079', '#b86e4e'];
  const SHUT = ['#4f7a5a', '#5d7f9c', '#8a948f', '#7a3a4c', '#3f5f86'];
  const AWNS = ['#b8483e', '#3f7a5a', '#3f5f86', '#cf9a3c', '#7a3a4c'];

  // simplified town house facing +Z at x (width w, eave h, depth d): body, window grid with sills + shutters, a shop
  // band with an awning strip, cornice, gable or hip roof, chimney
  function farHouse(B, x, w, h, d, i) {
    const M = NS('paint'), wall = WALLS[i % WALLS.length], roofC = ROOFS[(i * 3) % ROOFS.length], sh = SHUT[(i * 7) % SHUT.length];
    pbox(B, M, wall, w - 0.04, h, d, x, h / 2, -d / 2);
    pbox(B, M, shade(wall, 0.9), w, 0.18, 0.2, x, h - 0.1, 0.06);
    const nb = Math.max(1, Math.round(w / 2.2));
    for (let y = 3.1; y + 1.4 < h; y += 2.6) for (let b = 0; b < nb; b++) {
      const wx = x - w / 2 + ((b + 0.5) * w) / nb, lit = hash(i * 13 + b * 5 + y) < 0.3;
      pbox(B, lit ? NS('glow') : M, lit ? '#ffd9a0' : K.glass, 0.8, 1.35, 0.04, wx, y + 0.68, 0.02, lit ? { glow: 0.55 } : {});
      pbox(B, M, K.frame, 1.0, 0.08, 0.1, wx, y - 0.02, 0.05);
      if (hash(i + b) < 0.6) for (const sx of [-1, 1]) pbox(B, M, sh, 0.42, 1.4, 0.05, wx + sx * 0.64, y + 0.68, 0.03);
    }
    // ground floor: shopfront band + awning stripe or a door
    pbox(B, M, '#2a2d30', w - 0.6, 1.9, 0.06, x, 1.1, 0.03);
    pbox(B, NS('glow'), '#ffdca0', w - 0.9, 0.35, 0.02, x, 1.6, 0.07, { glow: 0.5 });
    if (hash(i * 3.3) < 0.7) { B.push(x, 2.35, 0.05, 0, 0.5); pbox(B, NS('foliage'), AWNS[i % AWNS.length], w - 0.5, 0.05, 1.1, 0, 0, 0.5); B.pop(); }
    // roof
    const gable = hash(i * 1.7) < 0.55, rise = Math.min(2.4, d * 0.45);
    if (gable) {
      B.add(M, tpl(['fhg', d, rise].map(kf).join('|'), () => extrudeGeo([[-d / 2, 0], [d / 2, 0], [0, rise]], 1, 0.001)), wall, x, h, -d / 2, { sx: w - 0.05 });
      for (const s of [-1, 1]) { B.push(x, h + rise / 2, -d / 2 + s * d / 4, 0, s * Math.atan2(rise, d / 2)); pbox(B, M, roofC, w + 0.3, 0.12, Math.hypot(rise, d / 2) + 0.35, 0, 0.06, 0); B.pop(); }
    } else {
      B.add(M, tpl(['fhh', w, d, rise].map(kf).join('|'), () => {
        const g = new GB(), c = cx3('#ffffff'), hw = w / 2 + 0.2, hd = d / 2 + 0.2, r = Math.min(hw, hd) * 0.6;
        const p = [[-hw, 0, hd], [hw, 0, hd], [hw, 0, -hd], [-hw, 0, -hd]], top = [[-hw + r, rise, 0], [hw - r, rise, 0]];
        const v = (q, n) => g.v(q[0], q[1], q[2], n[0], n[1], n[2], ...c);
        g.quad(v(p[0], [0, 0.7, 0.7]), v(p[1], [0, 0.7, 0.7]), v(top[1], [0, 0.7, 0.7]), v(top[0], [0, 0.7, 0.7]));
        g.quad(v(p[2], [0, 0.7, -0.7]), v(p[3], [0, 0.7, -0.7]), v(top[0], [0, 0.7, -0.7]), v(top[1], [0, 0.7, -0.7]));
        g.tri(v(p[1], [0.7, 0.7, 0]), v(p[2], [0.7, 0.7, 0]), v(top[1], [0.7, 0.7, 0]));
        g.tri(v(p[3], [-0.7, 0.7, 0]), v(p[0], [-0.7, 0.7, 0]), v(top[0], [-0.7, 0.7, 0]));
        return g.geo();
      }), roofC, x, h, -d / 2, {});
    }
    if (hash(i * 2.9) < 0.8) { pbox(B, M, K.chim, 0.6, 1.8, 0.6, x + w * 0.25, h + rise * 0.6, -d * 0.6); pbox(B, M, K.pot, 0.2, 0.3, 0.2, x + w * 0.25, h + rise * 0.6 + 1.0, -d * 0.6); }
  }

  D.crossmarket_farside = {
    desc: 'Far quay across the harbour channel (scenery, outside the bounds): a stone quay wall along local +X (length) facing +Z with its coping at y 0.5, a promenade with lamps + bollards, and a row of simplified tall town houses behind it. No colliders, no shadows.',
    params: { length: 'm (44)', seed: 'house mix' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 44, seed = o.seedN ?? 1, M = NS('paint');
      // quay wall + coping + promenade
      pbox(B, M, '#b9ae98', L, 2.6, 1.2, L / 2, -0.8, -0.6);
      pbox(B, M, '#d6ccb6', L, 0.14, 1.4, L / 2, 0.52, -0.5);
      pbox(B, M, '#a8a092', L, 0.1, 3.6, L / 2, 0.45, -2.6);
      for (let x = 2; x < L - 1; x += 6) { B.cyl(NS('metal'), K.black, 0.12, 0.5, x, 0.8, -0.3, { seg: 6 }); }
      for (let x = 4; x < L - 1; x += 9) {
        B.cyl(NS('metal'), K.iron, 0.07, 3.4, x, 2.2, -1.2, { seg: 6 });
        B.lathe(NS('glow'), K.lit, [[0.001, -0.1], [0.14, -0.06], [0.16, 0.16], [0.001, 0.16]], x, 4.0, -1.2, { seg: 4, glow: 1.8 });
        B.lathe(M, K.iron, [[0.22, 0], [0.1, 0.12], [0, 0.2]], x, 4.16, -1.2, { seg: 4 });
      }
      // the houses
      let x = 0, i = seed * 7;
      while (x < L - 2) {
        const w = 4 + Math.round(hash(i * 1.31) * 3), h = 7 + Math.round(hash(i * 2.17) * 4), d = 6 + hash(i) * 2;
        B.push(0, 0.5, -4.4, 0);
        farHouse(B, x + w / 2, w, h, d, i);
        B.pop();
        x += w; i++;
      }
    },
  };
}
