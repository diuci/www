// Crossroads Market — the goods landing on each tram pier (ZONE CONTROL ONLY: every placement of these types is tagged
// `onlyIn: 'zones'`, see props.js + src/world/variants.js). The market lighter lies in the dock basin, laden to the
// gunwales with a stepped stack of market stock that climbs to the timber hoist stage beside the tram pier; the stage
// overhangs the pier (the side zone) 3 m up. Attackers board the lighter from the far quay, climb the crates, and drop
// into the zone; nobody climbs back up (the stage stands on piles in the water: no wall to ink-climb).
//   crossmarket_lighter  the lighter's hull (the deck itself is a layout piece: inkable planks)
//   crossmarket_cargo    the stepped crate stack; one walkable collider per tier
//   crossmarket_hoist    the stage's structure: piles, bracing, joists, fascias, railings, the iron hand crane
// (the stage's deck is a layout piece too: an inkable, real position). All three use world heights (place at y = 0).

export function registerLanding(D, H, KIT) {
  const { PI, TAU, HP, P3, NS, K, tpl, kf, pbox, colT, rod, letters, textW, shade, GB, cx3, hash, sub } = KIT;

  // ------------------------------------------------------------------------------------------ market stock
  const TIMBER = ['#c9a06a', '#bf9460', '#d3ad78', '#b88a58'];
  const PAINTED = ['#6f8794', '#5f7f68', '#a3584a', '#8a7a52'];
  const STENCIL = ['MARKET', 'LOT 3', 'APPLES', 'PEARS', 'ORANGES', 'CEYLON', 'FRAGILE', 'CROSSROADS', 'LEMONS', 'SPICE'];
  const INK = '#2c2b29';
  // one closed crate, base at (x, y, z) in the current frame, w (x) × h × d (z); kind 0 slatted, 1 tea chest,
  // 2 painted box. `face` = +1 / -1: the ±X face carries a stencil. Lids are closed and flat: people stand on them.
  function crate(B, x, y, z, w, h, d, kind, seed, face = 1) {
    const t = TIMBER[Math.floor(hash(seed) * TIMBER.length)], dk = shade(t, 0.72);
    if (kind === 1) {
      // tea chest: plywood body, tin-strip edges, a stencilled mark
      const ply = shade('#c8a878', 0.92 + hash(seed + 1) * 0.12);
      B.box('wood', ply, w - 0.01, h - 0.01, d - 0.01, x, y + h / 2, z, { r: 0.012 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pbox(B, NS('metal'), '#6d6258', 0.05, h - 0.02, 0.05, x + sx * (w / 2 - 0.02), y + h / 2, z + sz * (d / 2 - 0.02));
      for (const sz of [-1, 1]) pbox(B, NS('metal'), '#6d6258', w - 0.02, 0.04, 0.05, x, y + h - 0.025, z + sz * (d / 2 - 0.02));
      for (const sx of [-1, 1]) pbox(B, NS('metal'), '#6d6258', 0.05, 0.04, d - 0.02, x + sx * (w / 2 - 0.02), y + h - 0.025, z);
    } else {
      const body = kind === 2 ? shade(PAINTED[Math.floor(hash(seed + 3) * PAINTED.length)], 0.95 + hash(seed) * 0.1) : shade(t, 0.95 + hash(seed + 2) * 0.1);
      B.box('wood', body, w - 0.01, h - 0.01, d - 0.01, x, y + h / 2, z, { r: 0.015 });
      // slat gaps (dark lines) on the four sides + the lid boards' joints
      const gap = shade(body, 0.45);
      for (const f of [0.34, 0.67]) {
        for (const sz of [-1, 1]) pbox(B, NS('wood'), gap, w - 0.08, 0.018, 0.012, x, y + h * f, z + sz * (d / 2 - 0.001));
        for (const sx of [-1, 1]) pbox(B, NS('wood'), gap, 0.012, 0.018, d - 0.08, x + sx * (w / 2 - 0.001), y + h * f, z);
      }
      for (const f of [-0.17, 0.17]) pbox(B, NS('wood'), gap, w - 0.06, 0.012, 0.016, x, y + h - 0.001, z + f * d);
      // corner battens
      const bat = kind === 2 ? shade(body, 0.8) : dk;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pbox(B, NS('wood'), bat, 0.07, h - 0.02, 0.07, x + sx * (w / 2 - 0.03), y + h / 2, z + sz * (d / 2 - 0.03));
    }
    // stencil on the ±X face (the riser you climb) — flat paint, dark
    if (face) {
      const word = STENCIL[Math.floor(hash(seed + 5) * STENCIL.length)], hh = Math.min(0.13, (w - 0.3) / Math.max(0.5, textW(word, 0.2, 0.1)));
      B.push(x + face * (w / 2 + 0.006), y + h * 0.45, z, face > 0 ? HP : -HP);
      letters(B, word, { h: hh, x: 0, y: 0, z: 0, c: INK, flat: true, wt: 0.2, track: 0.1, ds: 4 });
      B.pop();
    }
  }
  // rope lashing across a stack along z (over its top at y, down both sides to y0), at x
  function lashing(B, x, y, y0, hw) {
    const c = '#b89c6a', r = 0.018;
    B.tube(NS('rubber'), c, [P3(x, y0 + 0.1, -hw - 0.012), P3(x, y - 0.06, -hw - 0.014), P3(x, y + 0.008, -hw + 0.08), P3(x, y + 0.01, hw - 0.08), P3(x, y - 0.06, hw + 0.014), P3(x, y0 + 0.1, hw + 0.012)], r, { radial: 4 });
  }

  D.crossmarket_cargo = {
    desc: 'The lighter\'s cargo stacked as steps (local +X = toward the bow): tiers [[x0, x1, top]] of slatted crates, tea chests and painted boxes from the deck (deckY) up to each tier\'s flat top, across the width W (local z), lashed with rope. One collider per tier (walkable, not inkable).',
    params: { tiers: '[[x0, x1, top]]', W: 'm (3.1)', deckY: 'm (-0.3)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const W = o.W ?? 3.1, y0 = o.deckY ?? -0.3, tiers = o.tiers ?? [], seed0 = Math.round(Math.abs(o.pos[0]) * 7 + Math.abs(o.pos[2]) * 3);
      B.aoBase = y0;
      tiers.forEach(([x0, x1, top], ti) => {
        const Hh = top - y0, n = Math.max(1, Math.round(Hh / 0.9)), lh = Hh / n, len = x1 - x0, cx = (x0 + x1) / 2;
        // the next tier up (toward -X) hides this tier's -X face below its own top; the tier below hides the +X face
        for (let k = 0; k < n; k++) {
          const yb = y0 + k * lh, sd = seed0 + ti * 31 + k * 7;
          // widths across z: alternate 3-wide / 2+2 half bond so the stack reads as stacked crates, not a block
          const cols = (k + ti) % 2 === 0 ? [0.34, 0.32, 0.34] : [0.26, 0.24, 0.24, 0.26];
          let z = -W / 2;
          cols.forEach((f, ci) => {
            const d = f * W, kind = Math.floor(hash(sd + ci * 3.7) * 3);
            // deep tiers are two crates deep along x
            if (len > 1.52 && ci % 2 === 1) {
              crate(B, cx - len / 4, yb, z + d / 2, len / 2, lh, d, kind, sd + ci, 0);
              crate(B, cx + len / 4, yb, z + d / 2, len / 2, lh, d, (kind + 1) % 3, sd + ci + 11, k === n - 1 ? 1 : 0);
            } else crate(B, cx, yb, z + d / 2, len, lh, d, kind, sd + ci, k === n - 1 ? 1 : 0);
            z += d;
          });
        }
        lashing(B, x1 - 0.22, top, y0, W / 2);
        if (len > 1.2) lashing(B, x0 + 0.25, top, y0, W / 2);
        B.col(x0, y0, -W / 2, x1, top, W / 2);
      });
    },
  };

  // ------------------------------------------------------------------------------------------ the lighter
  D.crossmarket_lighter = {
    desc: 'Market lighter (dumb barge), local +X = bow: flat-sided hull with raked swim ends, tarred below an oxblood sheer strake and a cream line, timber gunwale capping round the deck (the deck itself is a layout piece), rubbing strakes, tyre fenders, a long sweep, her name. `lines`: mooring ropes [[x0, y0, z0, x1, y1, z1]] (local). No collider (the deck is the level).',
    params: { L: 'deck length (5.9)', W: 'deck width (3.1)', deckY: '(-0.3)', lines: '[[x0,y0,z0,x1,y1,z1]]' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.L ?? 5.9, W = o.W ?? 3.1, dy = o.deckY ?? -0.3;
      const hw = W / 2 + 0.14, hl = L / 2 + 0.14, gy = dy + 0.1, by = -2.2, hb = hl - 0.9;
      const TAR = '#26272a', OX = '#6e3328', CREAM = '#e9dfc6', CAP = '#7a5a3c';
      const xe = (y) => hb + ((hl - hb) * (y - by)) / (gy - by);
      const BANDS = [[by, -1.35, TAR], [-1.35, -0.62, OX], [-0.62, -0.5, CREAM], [-0.5, gy, OX]];
      B.add('paint', tpl(['cmlighter', L, W, dy].map(kf).join('|'), () => {
        const g = new GB();
        for (const [ya, yb2, c] of BANDS) {
          const cc = cx3(c), xa = xe(ya), xb = xe(yb2);
          for (const s of [-1, 1]) {   // sides
            const q = [g.v(-xa, ya, s * hw, 0, 0, s, ...cc), g.v(xa, ya, s * hw, 0, 0, s, ...cc), g.v(xb, yb2, s * hw, 0, 0, s, ...cc), g.v(-xb, yb2, s * hw, 0, 0, s, ...cc)];
            g.quad(q[0], q[1], q[2], q[3]);
          }
          const nl = Math.hypot(gy - by, hl - hb), nx = (gy - by) / nl, ny = -(hl - hb) / nl;
          for (const e of [-1, 1]) {   // raked swims
            const q = [g.v(e * xa, ya, -hw, e * nx, ny, 0, ...cc), g.v(e * xa, ya, hw, e * nx, ny, 0, ...cc), g.v(e * xb, yb2, hw, e * nx, ny, 0, ...cc), g.v(e * xb, yb2, -hw, e * nx, ny, 0, ...cc)];
            g.quad(q[0], q[1], q[2], q[3]);
          }
        }
        return g.geo();
      }), 'white', 0, 0, 0, {});
      // gunwale capping round the deck (covers the bulwark between the deck block and the planking)
      for (const s of [-1, 1]) {
        B.box('wood', CAP, 2 * hl, 0.14, hw - W / 2 + 0.04, 0, gy - 0.05, s * (W / 2 + (hw - W / 2) / 2), { r: 0.02 });
        B.box('wood', CAP, 0.18, 0.14, 2 * hw, s * (hl - 0.07), gy - 0.05, 0, { r: 0.02 });
        // rubbing strakes + a low wale
        for (const y of [-0.56, -1.05]) B.box('wood', shade(CAP, 0.8), 2 * xe(y) - 0.2, 0.1, 0.08, 0, y, s * (hw + 0.035), { r: 0.03 });
        // tyre fenders on short ropes (outer side only: the inner side lies against the hoist stage's piles)
        if (s > 0) for (const fx of [-2.2, 0.55, 2.45]) {
          const x = fx * (L / 5.9);
          B.tor('rubber', '#1f2022', 0.26, 0.09, x, -0.95, s * (hw + 0.1), { rs: 6, ts: 14 });
          rod(B, NS('rubber'), '#b89c6a', P3(x, gy, s * (hw - 0.02)), P3(x, -0.72, s * (hw + 0.1)), 0.015, 3);
        }
        // her name + number, cream on the oxblood strake near the bow
        B.push(hl - 1.55, -0.95, s * (hw + 0.004), s > 0 ? 0 : PI);
        letters(B, 'NO 2', { h: 0.28, x: 0, y: 0.02, z: 0, c: CREAM, flat: true, wt: 0.2, track: 0.1 });
        B.pop();
        B.push(-0.8, -0.95, s * (hw + 0.004), s > 0 ? 0 : PI);
        letters(B, 'CROSSROADS MARKET', { h: 0.13, x: 0, y: 0.08, z: 0, c: CREAM, flat: true, wt: 0.2, track: 0.12 });
        B.pop();
      }
      // stem + sternpost heads, a long sweep laid along the gunwale
      for (const e of [-1, 1]) B.box('wood', shade(CAP, 0.9), 0.22, 0.32, 0.26, e * (hl + 0.02), gy + 0.05, 0, { r: 0.04 });
      B.cyl('wood', '#9a7a52', 0.045, 2 * hl + 0.4, 0.2, gy + 0.06, hw - 0.06, { rz: HP, seg: 6 });
      B.box('wood', '#9a7a52', 0.9, 0.04, 0.2, hl + 0.55, gy + 0.06, hw - 0.06, { r: 0.015 });
      // mooring lines (sagging)
      for (const [x0, y0, z0, x1, y1, z1] of o.lines ?? []) {
        const pts = [];
        for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(P3(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(t * PI) * 0.35, z0 + (z1 - z0) * t)); }
        B.tube(NS('rubber'), '#b89c6a', pts, 0.028, { radial: 5 });
      }
    },
  };

  // ------------------------------------------------------------------------------------------ the hoist stage
  // cast-iron hand crane (dockside, c. 1880): bolted base, tapered pillar, crab frame with two gear trains and crank
  // handles, a curved jib with a tie, sheave, chain + hook with a net of sacks. Local: pillar at the origin, the jib
  // reaching toward +Z. Collider: the pillar + gearing (roof: nobody stands on it).
  function crane(B, jibL = 3.0) {
    const IR = K.iron, DK = K.ironDk, RED = '#8e3a2e';
    B.box('metal', DK, 0.8, 0.08, 0.8, 0, 0.04, 0, { r: 0.02 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.cyl(NS('metal'), K.black, 0.035, 0.05, sx * 0.3, 0.1, sz * 0.3, { seg: 6 });
    B.lathe('metal', IR, [[0, 0.08], [0.3, 0.08], [0.3, 0.16], [0.22, 0.26], [0.19, 0.5], [0.16, 2.0], [0.2, 2.06], [0.2, 2.14], [0, 2.14]], 0, 0, 0, { seg: 12 });
    B.tor(NS('metal'), K.gold, 0.18, 0.02, 0, 0.62, 0, { rs: 4, ts: 14, rx: HP });
    // crab frame: an open cast-iron A-frame either side of the pillar carrying the chain barrel, the gear train and
    // the crank handles
    for (const sx of [-1, 1]) {
      const x = sx * 0.3;
      rod(B, 'metal', IR, P3(x, 0.5, 0.36), P3(x, 1.72, 0.02), 0.035, 5);
      rod(B, 'metal', IR, P3(x, 0.5, -0.46), P3(x, 1.72, -0.12), 0.035, 5);
      rod(B, NS('metal'), IR, P3(x, 1.0, 0.24), P3(x, 1.0, -0.34), 0.025, 4);
      B.box('metal', DK, 0.07, 0.1, 0.3, x, 1.74, -0.05, { r: 0.015 });
      B.box('metal', DK, 0.08, 0.1, 0.9, x, 0.5, -0.05, { r: 0.015 });
      for (const [y, z] of [[1.05, 0.12], [1.35, -0.2]]) B.cyl(NS('metal'), K.gold, 0.055, 0.04, x + sx * 0.02, y, z, { rz: HP, seg: 8 });
    }
    B.cyl('metal', DK, 0.17, 0.56, 0, 1.05, 0.12, { rz: HP, seg: 12 });                     // chain barrel
    for (let k = 0; k < 3; k++) B.tor(NS('metal'), '#3a3b3d', 0.175, 0.012, -0.15 + k * 0.15, 1.05, 0.12, { rs: 3, ts: 12, ry: HP });
    // the big spur wheel (rim + six spokes + hub) and its pinion, red-oxide
    B.tor('metal', RED, 0.33, 0.03, 0.37, 1.35, -0.2, { rs: 5, ts: 22, ry: HP });
    B.cyl('metal', RED, 0.07, 0.07, 0.37, 1.35, -0.2, { rz: HP, seg: 8 });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; rod(B, NS('metal'), RED, P3(0.37, 1.35, -0.2), P3(0.37, 1.35 + Math.sin(a) * 0.31, -0.2 + Math.cos(a) * 0.31), 0.018, 4); }
    B.cyl('metal', RED, 0.12, 0.05, 0.37, 1.1, 0.14, { rz: HP, seg: 10 });                   // pinion
    for (const sx of [-1, 1]) {                                                              // crank handles
      B.cyl('metal', DK, 0.025, 0.2, sx * 0.44, 1.35, -0.2, { rz: HP, seg: 6 });
      B.box('metal', DK, 0.03, 0.34, 0.05, sx * 0.55, 1.22, -0.2, { r: 0.01 });
      B.cyl('wood', K.woodDk, 0.035, 0.22, sx * 0.64, 1.08, -0.2, { rz: HP, seg: 6 });
    }
    B.box('paint', K.gold, 0.2, 0.1, 0.01, 0, 0.8, -0.2, { r: 0.01 });                      // maker's plate on the pillar
    // jib: a curved iron girder from the pillar head out and up to the sheave, tie rod back to the crab
    const tip = [0, 3.55, jibL], pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(P3(0, 2.1 + (tip[1] - 2.1) * Math.sin(t * HP), tip[2] * t)); }
    for (const sx of [-1, 1]) B.tube('metal', IR, pts.map((p) => P3(sx * 0.1, p[1], p[2])), 0.05, { radial: 5 });
    for (let i = 1; i < 8; i++) pbox(B, NS('metal'), IR, 0.2, 0.04, 0.04, 0, pts[i][1], pts[i][2]);
    for (const sx of [-1, 1]) rod(B, NS('metal'), DK, P3(sx * 0.1, 1.65, -0.35), P3(sx * 0.1, tip[1] - 0.05, tip[2] - 0.2), 0.02, 4);
    B.cyl('metal', DK, 0.16, 0.08, 0, tip[1] - 0.05, tip[2], { rz: HP, seg: 12 });           // sheave
    // chain down from the sheave, the hook, a net of sacks
    const hookY = tip[1] - 1.45;
    rod(B, NS('metal'), '#3a3b3d', P3(0, tip[1] - 0.2, tip[2] + 0.12), P3(0, hookY + 0.12, tip[2] + 0.12), 0.018, 4);
    B.tor(NS('metal'), '#3a3b3d', 0.08, 0.02, 0, hookY, tip[2] + 0.12, { rs: 3, ts: 10, arc: PI * 1.5 });
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; rod(B, NS('rubber'), '#b89c6a', P3(0, hookY - 0.05, tip[2] + 0.12), P3(Math.cos(a) * 0.32, hookY - 0.45, tip[2] + 0.12 + Math.sin(a) * 0.32), 0.012, 3); }
    for (let k = 0; k < 3; k++) B.add('paint', KIT.blob(1, 3 + k), ['#c8a577', '#b9956a', '#d1b184'][k], (k - 1) * 0.18, hookY - 0.62 + (k % 2) * 0.06, tip[2] + 0.12 + (k - 1) * 0.05, { sx: 0.24, sy: 0.2, sz: 0.2, ry: k });
    // a lantern on a bracket off the pillar (lit at dusk)
    B.tube(NS('metal'), K.black, [P3(0, 1.9, -0.18), P3(0, 2.05, -0.4), P3(0, 1.98, -0.55)], 0.016, { radial: 4 });
    B.lathe('metal', K.black, [[0, 0.26], [0.06, 0.25], [0.13, 0.15], [0.14, 0.13], [0.1, 0.13]], 0, 1.62, -0.55, { seg: 6 });
    B.lathe(NS('glow'), K.lit, [[0.001, -0.02], [0.09, 0.0], [0.11, 0.13], [0.001, 0.13]], 0, 1.62, -0.55, { seg: 6, glow: 1.6 });
    colT(B, -0.35, 0, -0.45, 0.35, 2.2, 0.35, { roof: true });
  }

  D.crossmarket_hoist = {
    desc: 'The market\'s goods hoist stage beside the tram pier (the deck is a layout piece: w × d at deckY, local -Z = the pier edge side, overhanging it by `over`): timber piles with weed-line bands in the water, headstocks, joists, X-bracing and walings, fascias (the drop edge painted white), iron railings on the water sides (rail colliders) with a gap in the outer (+Z) one where the lighter\'s cargo comes up, an iron hand crane on the outer +X corner swinging a net of sacks over the lighter, a MARKET HOIST board, a lantern under the overhang.',
    params: { w: 'm along X (3.8)', d: 'm along Z (6.9)', deckY: 'deck top (3.1)', over: 'm the deck reaches past the pier edge (0.9)', open: '[x0, x1] gap in the outer railing for the crates', craneYaw: 'rad (0.64)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const w = o.w ?? 3.8, d = o.d ?? 5.2, top = o.deckY ?? 3.1, bot = top - 0.3, over = o.over ?? 0.9, open = o.open ?? [-1.2, 0.8];
      const hx = w / 2, hz = d / 2, edgeZ = -hz + over;              // edgeZ: the pier's edge line under the stage
      const PILE = '#6b5a47', PILEDK = '#2f2a25', WEED = '#39432f', BEAM = '#5e4a36', FAS = '#7a5a3c';
      // piles (none on the pier: the first row stands just off the pier's edge, in the water)
      const px = [-hx + 0.25, 0, hx - 0.25], pz = [edgeZ + 0.25, (edgeZ + hz) / 2 + 0.2, hz - 0.45];   // (outer row set in: the lighter lies alongside)
      for (const x of px) for (const z of pz) {
        B.cyl(NS('wood'), PILEDK, 0.16, 1.0, x, -2.4, z, { seg: 8 });
        B.cyl('wood', WEED, 0.165, 0.62, x, -1.6, z, { seg: 8 });
        B.cyl('wood', shade(PILE, 0.92 + hash(x * 3 + z) * 0.14), 0.15, bot - 0.3 + 1.29, x, (bot - 0.3 - 1.29) / 2, z, { seg: 8 });
        B.cyl(NS('metal'), K.ironDk, 0.17, 0.08, x, bot - 0.42, z, { seg: 8 });
      }
      // headstocks along X on each pile row, joists along Z under the deck (cantilevered over the pier)
      for (const z of pz) B.box('wood', BEAM, w - 0.1, 0.3, 0.3, 0, bot - 0.35, z, { r: 0.03 });
      for (const x of [-hx + 0.12, -hx / 2, 0, hx / 2, hx - 0.12]) B.box('wood', shade(BEAM, 1.08), 0.16, 0.2, d - 0.06, x, bot - 0.1, 0, { r: 0.02 });
      // walings + X-bracing on the outer rows (along X inside the +Z row, along Z on both ends)
      const brace = (ax, ay, az, bx, by2, bz) => {
        const L = Math.hypot(bx - ax, by2 - ay, bz - az), ry = Math.atan2(-(bz - az), bx - ax), rz = Math.atan2(by2 - ay, Math.hypot(bx - ax, bz - az));
        B.push((ax + bx) / 2, (ay + by2) / 2, (az + bz) / 2, ry, 0, rz);
        B.box('wood', shade(BEAM, 0.95), L, 0.18, 0.08, 0, 0, 0, { r: 0.02 });
        B.pop();
      };
      const yl = -1.1, yh = bot - 0.55;
      for (let i = 0; i < 2; i++) {
        const za = pz[2] - 0.18;
        brace(px[i], yl, za, px[i + 1], yh, za); brace(px[i], yh, za, px[i + 1], yl, za);
      }
      for (const x of [px[0] - 0.18, px[2] + 0.18]) for (let i = 0; i < 2; i++) { brace(x, yl, pz[i], x, yh, pz[i + 1]); brace(x, yh, pz[i], x, yl, pz[i + 1]); }
      for (const y of [0.4, yl + 0.1]) {
        B.box('wood', BEAM, w - 0.2, 0.22, 0.1, 0, y, pz[2] - 0.2, { r: 0.02 });
        for (const x of [px[0] - 0.2, px[2] + 0.2]) B.box('wood', BEAM, 0.1, 0.22, pz[2] - pz[0], x, y, (pz[0] + pz[2]) / 2, { r: 0.02 });
      }
      // fascias round the deck edge; the drop edge (over the pier) painted white so it reads from below and above
      B.box('wood', FAS, w + 0.04, 0.32, 0.05, 0, top - 0.165, -hz - 0.028, { r: 0.01 });
      B.box('paint', '#ecebe4', w + 0.06, 0.07, 0.07, 0, top - 0.035, -hz - 0.04, { r: 0.01 });
      B.box('wood', FAS, w + 0.04, 0.32, 0.05, 0, top - 0.165, hz + 0.028, { r: 0.01 });
      // soffit: dark boarding just under the deck (seen from the pier below)
      pbox(B, 'wood', '#4e3f30', w - 0.02, 0.02, d - 0.02, 0, bot - 0.012, 0);
      for (const s of [-1, 1]) B.box('wood', FAS, 0.05, 0.32, d, s * (hx + 0.028), top - 0.165, 0, { r: 0.01 });
      // lantern under the overhang, lighting the pier where you land
      B.push(0, bot - 0.3, -hz + 0.08, 0);
      B.lathe('metal', K.black, [[0, 0.3], [0.05, 0.28], [0.13, 0.17], [0.14, 0.15], [0.1, 0.15]], 0, -0.26, 0, { seg: 6 });
      B.lathe(NS('glow'), K.lit, [[0.001, -0.03], [0.09, -0.01], [0.11, 0.15], [0.001, 0.15]], 0, -0.26, 0, { seg: 6, glow: 1.8 });
      rod(B, NS('metal'), K.black, P3(0, 0.04, 0), P3(0, -0.02, 0), 0.02, 4);
      B.pop();
      // railings (rail colliders) on the water sides: both ends and the outer +Z edge, open where the lighter's top
      // step meets it; the pier side and the overhang's ends stay open (that is the drop)
      sub(B, 'crossmarket_railing', -hx, top, hz - 0.07, 0, { length: open[0] + hx });
      sub(B, 'crossmarket_railing', open[1], top, hz - 0.07, 0, { length: hx - open[1] });
      sub(B, 'crossmarket_railing', -hx + 0.07, top, edgeZ, -HP, { length: hz - 0.07 - edgeZ });
      sub(B, 'crossmarket_railing', hx - 0.07, top, hz - 0.07, HP, { length: hz - 0.07 - edgeZ });
      // MARKET HOIST board on the +X end railing, facing up the pier toward the hall
      B.push(hx + 0.02, top + 0.62, (edgeZ + hz) / 2, HP);
      B.box('paint', '#23304a', 1.9, 0.36, 0.04, 0, 0, 0, { r: 0.02 });
      B.box('paint', K.gold, 1.82, 0.02, 0.006, 0, 0.14, 0.022, { r: 0.003 });
      B.box('paint', K.gold, 1.82, 0.02, 0.006, 0, -0.14, 0.022, { r: 0.003 });
      letters(B, 'MARKET HOIST', { h: 0.15, x: 0, y: -0.075, z: 0.022, c: '#efe6d2', flat: true, wt: 0.2, track: 0.12 });
      B.pop();
      // the crane on the outer +X corner, jib swung out over the lighter
      B.push(hx - 0.55, top, hz - 0.62, o.craneYaw ?? 0.64);
      crane(B, 3.0);
      B.pop();
    },
  };
}
