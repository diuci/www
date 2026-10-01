// Crossroads Market — the tramway: the No. 3 tram standing under the Market Hall crossing (dressing around the level's
// tram blocks), catenary poles with bracket arms + street lamps, and the tram stop shelter on each flank platform.

export function registerTram(D, H, KIT) {
  const { PI, TAU, HP, P3, NS, K, tpl, kf, pbox, colBox, rod, letters, textW, arcPts, shade, mixc, GB, cx3, latheGeo } = KIT;
  const GREEN = '#3f6b55', GREENDK = '#2c4d3d', CREAM = '#ece2c8', GOLD = K.gold, RED = '#9c3a32';
  const WIRE = 5.3;

  // one side of the saloon (x along the body, z = 0 the body face, +Z out): windows, pillars, lining, fleet lettering
  function saloonSide(B, L) {
    const n = 8, pw = 0.16, ww = (L - 0.4 - pw * (n - 1)) / n, y0 = 1.5, y1 = 2.56;
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.2 + ww / 2 + i * (ww + pw);
      pbox(B, NS('gloss'), K.glass, ww, y1 - y0, 0.02, x, (y0 + y1) / 2, 0.006);
      pbox(B, NS('glow'), '#ffe0a8', ww - 0.04, 0.16, 0.004, x, y1 - 0.14, 0.018, { glow: 0.7 });                  // lit ceiling strip inside
      pbox(B, 'paint', CREAM, ww + 0.02, 0.05, 0.03, x, y0 + (y1 - y0) * 0.66, 0.02);                            // drop-light rail
      pbox(B, NS('paint'), shade(CREAM, 0.9), ww, 0.04, 0.05, x, y0 - 0.02, 0.025);                                // sill
      pbox(B, NS('paint'), GREENDK, ww - 0.1, 0.12, 0.012, x, y1 + 0.13, 0.008);                                  // ventilator light over each window
    }
    // belt rail between the rocker panel and the saloon, cant rail under the roof
    B.box('paint', GREENDK, L + 0.02, 0.1, 0.05, 0, 1.2, 0.02, { r: 0.015 });
    B.box('paint', GREENDK, L + 0.02, 0.08, 0.05, 0, 2.86, 0.02, { r: 0.015 });
    pbox(B, NS('paint'), GOLD, L - 0.1, 0.02, 0.005, 0, 1.12, 0.005);
    // rocker panel lining: gilt pinstripe panels + the fleet name / number
    for (const [x0, x1] of [[-L / 2 + 0.15, -0.9], [-0.7, 0.7], [0.9, L / 2 - 0.15]]) {
      const w = x1 - x0, c = (x0 + x1) / 2;
      for (const [yy, hh, ww2] of [[0.34, 0.02, w - 0.1], [1.02, 0.02, w - 0.1]]) pbox(B, NS('paint'), GOLD, ww2, hh, 0.004, c, yy, 0.004);
      for (const sx of [-1, 1]) pbox(B, NS('paint'), GOLD, 0.02, 0.7, 0.004, c + sx * (w / 2 - 0.05), 0.68, 0.004);
    }
    letters(B, 'CROSSROADS', { h: 0.2, x: (-L / 2 - 0.9) / 2 + 0.1, y: 0.58, z: 0.006, c: GOLD, flat: true, wt: 0.2, track: 0.14 });
    letters(B, 'TRAMWAYS', { h: 0.2, x: (L / 2 + 0.9) / 2 - 0.1, y: 0.58, z: 0.006, c: GOLD, flat: true, wt: 0.2, track: 0.14 });
    B.cyl('paint', GOLD, 0.3, 0.012, 0, 0.68, 0.006, { rx: HP, seg: 18 });
    B.cyl(NS('paint'), RED, 0.25, 0.006, 0, 0.68, 0.012, { rx: HP, seg: 18 });
    letters(B, '3', { h: 0.28, x: 0, y: 0.54, z: 0.016, c: CREAM, flat: true, wt: 0.24 });
    // truck frames + wheels showing under the rocker (flush on the face)
    for (const bx of [-L / 2 + 1.6, L / 2 - 1.6]) {
      B.box('paint', '#23262b', 2.2, 0.26, 0.04, bx, 0.22, 0.02, { r: 0.02 });
      for (const wx of [-0.62, 0.62]) { B.cyl('metal', '#3a3d42', 0.3, 0.06, bx + wx, 0.3, 0.02, { rx: HP, seg: 14 }); B.cyl(NS('metal'), '#8d939a', 0.1, 0.03, bx + wx, 0.3, 0.055, { rx: HP, seg: 10 }); }
      pbox(B, NS('metal'), '#5a5f66', 0.5, 0.12, 0.04, bx, 0.44, 0.045);                                          // leaf spring
    }
  }
  // a cab end (the platform + vestibule) at local x = 0 facing +X, depth dx: rounded dash, three-light windscreen,
  // destination box, headlamp, lifeguard tray, controller + handbrake silhouettes inside
  function cabEnd(B, dx, hw) {
    const prof = (y0, y1, r) => tpl(['cab', dx, hw, y0, y1, r].map(kf).join('|'), () => {
      // plan: a rounded dash (quarter ellipses) from z = -hw to hw, depth dx
      const pts = []; for (let i = 0; i <= 10; i++) { const a = -HP + (i / 10) * PI; pts.push([Math.cos(a) * dx * r, Math.sin(a) * hw]); }
      const g = new GB(), n = pts.length;
      for (let i = 0; i < n - 1; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], nx = (z1 - z0), nz = -(x1 - x0), l = Math.hypot(nx, nz) || 1;
        const a = g.v(x0, y0, z0, nx / l, 0, nz / l), b = g.v(x1, y0, z1, nx / l, 0, nz / l), c = g.v(x1, y1, z1, nx / l, 0, nz / l), d = g.v(x0, y1, z0, nx / l, 0, nz / l);
        g.quad(a, b, c, d);
      }
      const cT = g.v(0, y1, 0, 0, 1, 0), top = pts.map(([x, z]) => g.v(x, y1, z, 0, 1, 0));
      for (let i = 0; i < n - 1; i++) g.tri(cT, top[i], top[i + 1]);
      return g.geo();
    });
    B.add('paint', prof(0.22, 1.15, 1), GREEN, 0, 0, 0, {});                                                       // dash
    B.add('paint', prof(1.15, 1.45, 0.98), CREAM, 0, 0, 0, {});
    B.add(NS('gloss'), prof(1.45, 2.5, 0.94), K.glass, 0, 0, 0, {});                                                 // windscreen band
    B.add('paint', prof(2.5, 3.0, 0.98), CREAM, 0, 0, 0, {});
    for (const a of [-0.55, 0, 0.55]) { const x = Math.cos(a) * dx * 0.95, z = Math.sin(a) * hw * 0.98; pbox(B, NS('paint'), CREAM, 0.08, 1.05, 0.08, x - 0.02, 1.98, z); }   // screen pillars
    pbox(B, NS('paint'), GOLD, 0.01, 0.02, hw * 1.6, dx + 0.005, 1.1, 0);
    // destination box on the canopy + route number
    B.box('paint', K.black, 0.1, 0.34, 1.5, dx * 0.9, 2.74, 0, { r: 0.02 });
    B.push(dx * 0.9 + 0.055, 2.74, 0, HP);
    pbox(B, NS('glow'), '#fff2d8', 1.38, 0.26, 0.004, 0, 0, 0, { glow: 1.3 });
    letters(B, 'MARKET HALL', { h: 0.12, x: 0.16, y: -0.06, z: 0.004, c: '#1d1f22', flat: true, wt: 0.2, track: 0.06 });
    B.cyl(NS('paint'), RED, 0.11, 0.01, -0.58, 0, 0.004, { rx: HP, seg: 12 }); letters(B, '3', { h: 0.14, x: -0.58, y: -0.07, z: 0.012, c: '#fff2d8', flat: true, wt: 0.24 });
    B.pop();
    // headlamp, lifeguard, coupler, step
    B.cyl('metal', K.black, 0.13, 0.14, dx + 0.03, 0.85, 0, { rz: HP, seg: 12 });
    B.cyl(NS('glow'), '#fff4d8', 0.1, 0.02, dx + 0.11, 0.85, 0, { rz: HP, seg: 12, glow: 1.8 });
    B.box('metal', '#2b2e33', 0.5, 0.05, hw * 1.7, dx - 0.1, 0.16, 0, { r: 0.01 });
    for (let i = -3; i <= 3; i++) pbox(B, NS('metal'), '#2b2e33', 0.45, 0.03, 0.03, dx - 0.12, 0.2, i * hw * 0.24);
    B.box('metal', '#5a5f66', 0.28, 0.12, 0.16, dx + 0.1, 0.42, 0, { r: 0.02 });
    // trolley-standard handrail + grab poles either side of the platform opening
    for (const s of [-1, 1]) B.cyl(NS('metal'), K.gold, 0.02, 1.1, dx * 0.25, 1.9, s * (hw - 0.05), { seg: 6 });
  }

  D.crossmarket_tram = {
    desc: 'The No. 3 tram (double-ended, place once at the origin, mirror: false) dressing the level tram blocks (x ±5, z ±1.2, 3.0 tall): saloon windows with lit ceilings, gilt lining + CROSSROADS TRAMWAYS on the rocker panels, trucks + wheels, cab ends (colliders) with windscreens, lit destination boxes (MARKET HALL · 3), headlamps, lifeguard trays; the roof: boards, trolley standard + pole up to the overhead wire.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = 10, hw = 1.2;
      for (const s of [-1, 1]) { B.push(0, 0, s * hw, s > 0 ? 0 : PI); saloonSide(B, L); B.pop(); }
      for (const s of [-1, 1]) {
        B.push(s * L / 2, 0, 0, s > 0 ? 0 : PI);
        cabEnd(B, 0.95, hw);
        B.pop();
      }
      // roof: canvas-covered roof sheet with a raised centre walkway of boards, rain strips, the trolley standard
      B.box('paint', '#8a8f86', L + 1.6, 0.04, 2.3, 0, 3.02, 0, { r: 0.015 });
      for (const s of [-1, 1]) B.box('paint', GREENDK, L + 1.7, 0.05, 0.06, 0, 3.02, s * 1.16, { r: 0.01 });
      for (let x = -3.6; x <= 3.61; x += 0.3) pbox(B, 'wood', x % 0.6 ? K.woodDk : K.wood, 0.26, 0.03, 0.8, x, 3.055, 0);
      // trolley standard at the centre, the pole trailing toward -X up to the wire
      B.box('metal', '#2b2e33', 0.6, 0.12, 0.6, 0, 3.1, 0, { r: 0.02 });
      B.cyl('metal', '#2b2e33', 0.08, 0.3, 0, 3.3, 0, { seg: 10 });
      const tip = P3(-3.6, WIRE - 0.04, 0);
      B.tube('metal', '#2b2e33', [P3(0, 3.42, 0), P3(-1.8, 4.36, 0), tip], 0.03, { radial: 5 });
      B.cyl(NS('metal'), '#8d939a', 0.05, 0.08, tip[0], tip[1] + 0.02, 0, { rx: HP, seg: 8 });
      B.tube(NS('paint'), '#cdb894', [P3(-3.4, WIRE - 0.1, 0.03), P3(-4.4, 3.8, 0.9), P3(-5.4, 2.2, 1.18)], 0.008, { radial: 3 });   // retriever rope
      // headroom beam: nothing above 3.0 collides except the standard (a step, not a wall)
      B.col(-0.3, 3.0, -0.3, 0.3, 3.3, 0.3);
    },
  };

  // ---- catenary pole (base at pos, bracket arm reaching toward +Z over the track, wire at WIRE), with a gas-style lamp
  D.crossmarket_catenary = {
    desc: 'Tramway traction pole: fluted cast-iron base, tapered pole with collars, scrolled bracket arm reaching `reach` m toward local +Z to the overhead wire (y 5.3), finial, a street lantern hung off the back. Collider: the pole.',
    params: { reach: 'm (2.1)', lamp: 'bool (true)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const reach = o.reach ?? 2.1, top = 6.1, c = K.iron;
      B.lathe('metal', c, [[0, 0], [0.24, 0], [0.25, 0.05], [0.2, 0.12], [0.2, 0.9], [0.16, 1.0], [0.13, 1.2], [0.12, top], [0.08, top + 0.05], [0, top + 0.08]], 0, 0, 0, { seg: 12 });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; pbox(B, NS('metal'), shade(c, 0.8), 0.03, 0.7, 0.03, Math.cos(a) * 0.2, 0.5, Math.sin(a) * 0.2); }
      for (const y of [1.2, 3.4, 5.0]) B.tor(NS('metal'), K.gold, 0.13, 0.02, 0, y, 0, { rs: 4, ts: 12, rx: HP });
      B.sph('metal', K.gold, 0.1, 0, top + 0.15, 0, { ws: 8, hs: 6 });
      // bracket arm + scroll brace + insulator + the wire hanger
      B.tube('metal', c, [P3(0, WIRE + 0.35, 0), P3(0, WIRE + 0.35, reach + 0.2)], 0.035, { radial: 6 });
      B.tube(NS('metal'), c, [P3(0, WIRE - 0.35, 0.05), P3(0, WIRE + 0.05, reach * 0.4), P3(0, WIRE + 0.32, reach * 0.8)], 0.02, { radial: 4 });
      for (let i = 0; i < 3; i++) B.tor(NS('metal'), c, 0.1, 0.012, 0, WIRE + 0.12, 0.35 + i * 0.35, { rs: 4, ts: 10, ry: HP });
      B.cyl(NS('paint'), '#6b4a3a', 0.04, 0.14, 0, WIRE + 0.18, reach, { seg: 8 });
      rod(B, NS('metal'), '#2b2e33', P3(0, WIRE + 0.1, reach), P3(0, WIRE, reach), 0.01, 3);
      // lantern on a swan-neck off the back of the pole
      if (o.lamp !== false) {
        B.tube('metal', c, [P3(0, 4.3, -0.05), P3(0, 4.55, -0.4), P3(0, 4.45, -0.75)], 0.028, { radial: 5 });
        B.lathe('metal', c, [[0, 0.34], [0.07, 0.33], [0.22, 0.18], [0.24, 0.16], [0.15, 0.14]], 0, 4.05, -0.8, { seg: 6 });
        B.lathe(NS('glow'), K.lit, [[0.001, -0.14], [0.13, -0.1], [0.16, 0.14], [0.001, 0.14]], 0, 4.05, -0.8, { seg: 6, glow: 2.0 });
        B.lathe('metal', c, [[0, -0.24], [0.06, -0.22], [0.12, -0.13], [0, -0.13]], 0, 4.05, -0.8, { seg: 6 });
      }
      B.blob(0.55, 0.55, 0, 0);
      colBox(B, 0, 0, 0, 0.4, top, 0.4, true);
    },
  };

  // ---- tram stop shelter (on the platform): back screen toward local -Z (glazed, iron frame), a curved glass canopy
  // over the platform, a bench, the stop flag, timetable case; collider = the back screen (cover) + the bench
  D.crossmarket_tramstop = {
    desc: 'Tram stop shelter: cast-iron frame, glazed back screen along local X at z = 0 facing +Z (the track side), a curved canopy, bench, MARKET HALL stop flag on a post, timetable case, poster. Colliders: back screen (rail: see-through), bench, flag post.',
    params: { length: 'm (4)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 4, Hh = 2.45, c = K.iron;
      // posts + back screen
      for (const x of [-L / 2, 0, L / 2]) { B.box('metal', c, 0.1, Hh, 0.1, x, Hh / 2, 0, { r: 0.02 }); B.sph(NS('metal'), K.gold, 0.06, x, Hh + 0.3, 0, { ws: 8, hs: 5 }); }
      pbox(B, 'metal', c, L, 0.08, 0.08, 0, 0.35, 0); pbox(B, 'metal', c, L, 0.08, 0.08, 0, Hh - 0.05, 0);
      pbox(B, NS('gloss'), K.glassLt, L - 0.1, Hh - 0.5, 0.02, 0, (Hh + 0.35) / 2, 0);
      pbox(B, 'paint', shade(c, 0.9), L, 0.34, 0.05, 0, 0.17, 0);
      // canopy: curved glass on ribs, cantilevered toward +Z, fretwork valance
      const cp = []; for (let i = 0; i <= 8; i++) { const t = i / 8; cp.push([1.35 * t, Hh + 0.42 * Math.sin(PI * t * 0.8) - 0.12 * t]); }
      for (const x of [-L / 2, 0, L / 2]) B.tube('metal', c, cp.map(([z, y]) => P3(x, y, z)), 0.035, { radial: 5 });
      B.add(NS('gloss'), tpl(['stopcan', L].map(kf).join('|'), () => {
        const g = new GB(), col = cx3(K.glassLt);
        for (let i = 0; i < cp.length - 1; i++) {
          const [z0, y0] = cp[i], [z1, y1] = cp[i + 1], nz = -(y1 - y0), ny = (z1 - z0), l = Math.hypot(ny, nz);
          const a2 = g.v(-L / 2, y0 + 0.03, z0, 0, ny / l, nz / l, ...col), b2 = g.v(L / 2, y0 + 0.03, z0, 0, ny / l, nz / l, ...col), cc = g.v(L / 2, y1 + 0.03, z1, 0, ny / l, nz / l, ...col), d = g.v(-L / 2, y1 + 0.03, z1, 0, ny / l, nz / l, ...col);
          g.quad(a2, b2, cc, d);
        }
        return g.geo();
      }), 'white', 0, 0, 0, {});
      B.box('metal', c, L + 0.1, 0.1, 0.1, 0, cp[8][1], 1.35, { r: 0.02 });
      // bench
      B.box('wood', K.wood, L - 0.6, 0.06, 0.4, 0, 0.46, 0.3, { r: 0.015 });
      for (const x of [-L / 2 + 0.5, L / 2 - 0.5]) pbox(B, 'metal', c, 0.06, 0.44, 0.34, x, 0.22, 0.3);
      // timetable case + poster on the screen
      B.box('gloss', c, 0.7, 0.9, 0.05, -L / 4, 1.45, 0.05, { r: 0.02 });
      pbox(B, NS('paint'), '#f2eee6', 0.6, 0.78, 0.01, -L / 4, 1.45, 0.08);
      for (let i = 0; i < 8; i++) pbox(B, NS('paint'), '#4a4f58', 0.46, 0.02, 0.004, -L / 4, 1.72 - i * 0.07, 0.086);
      KIT.bill(B, L / 4, 1.45, 0.03, 0.6, 0.9, o.poster ?? 'regatta');
      // stop flag on its own post at the platform end
      const fx = L / 2 + 0.6;
      B.cyl('metal', c, 0.05, 2.9, fx, 1.45, 0.3, { seg: 8 });
      B.box('gloss', RED, 0.62, 0.62, 0.04, fx, 2.6, 0.3, { r: 0.02, ry: HP });
      for (const f of [1, -1]) { B.push(fx + f * 0.022, 2.6, 0.3, f > 0 ? HP : -HP); B.cyl(NS('paint'), '#f2eee6', 0.24, 0.004, 0, 0, 0.001, { rx: HP, seg: 16 }); letters(B, '3', { h: 0.26, x: 0, y: -0.13, z: 0.004, c: RED, flat: true, wt: 0.22 }); letters(B, 'TRAM STOP', { h: 0.06, x: 0, y: 0.18, z: 0.004, c: '#1d1f22', flat: true, wt: 0.24 }); B.pop(); }
      B.box('paint', '#f2eee6', 0.05, 0.2, 0.8, fx, 2.12, 0.3, { r: 0.01 });
      for (const f of [1, -1]) { B.push(fx + f * 0.028, 2.12, 0.3, f > 0 ? HP : -HP); letters(B, 'MARKET HALL', { h: 0.08, x: 0, y: -0.04, z: 0.002, c: '#23304a', flat: true, wt: 0.22, track: 0.08 }); B.pop(); }
      B.col(-L / 2 - 0.06, 0, -0.06, L / 2 + 0.06, Hh, 0.06, { rail: true });   // glazed iron screen: see-through → rail
      B.col(-L / 2 + 0.3, 0, 0.1, L / 2 - 0.3, 0.49, 0.5);
      colBox(B, fx, 0, 0.3, 0.14, 2.9, 0.14, true);
    },
  };

  // ---- the overhead trolley wire: a taut contact wire along local +X at WIRE with droppers to a catenary messenger
  D.crossmarket_wire = {
    desc: 'Tram overhead: contact wire along local +X (length) at 5.3 m with a messenger wire above and droppers. No collider.',
    params: { length: 'm (10)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 10;
      rod(B, NS('metal'), '#2b2e33', P3(0, WIRE, 0), P3(L, WIRE, 0), 0.009, 3);
      const pts = []; for (let i = 0; i <= 10; i++) { const x = (i / 10) * L; pts.push(P3(x, WIRE + 0.42 - 0.3 * Math.sin((i / 10) * PI), 0)); }
      B.tube(NS('metal'), '#2b2e33', pts, 0.006, { radial: 3 });
      for (let i = 1; i < 10; i++) { const x = (i / 10) * L; rod(B, NS('metal'), '#2b2e33', P3(x, WIRE, 0), P3(x, WIRE + 0.42 - 0.3 * Math.sin((i / 10) * PI), 0), 0.004, 3); }
    },
  };

  // ---- buffer stop at the end of the line (track along local X, stop facing -X): timber beam on an iron trestle,
  // a red lamp, sand drag. Collider.
  D.crossmarket_buffer = {
    desc: 'Tramway buffer stop (facing local -X, the track runs toward -X): a timber buffer beam with sprung heads on a cast-iron trestle, a red lamp, painted hazard boards. Collider.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      for (const sz of [-1, 1]) {
        B.tube('metal', K.ironDk, [P3(0.9, 0, sz * 0.72), P3(0.1, 0.62, sz * 0.72), P3(-0.1, 0.62, sz * 0.72)], 0.05, { radial: 5 });
        B.box('metal', K.ironDk, 0.14, 0.7, 0.14, 0, 0.35, sz * 0.72, { r: 0.02 });
        B.cyl('metal', '#5a5f66', 0.1, 0.3, -0.25, 0.62, sz * 0.5, { rz: HP, seg: 10 });
        B.cyl('metal', K.black, 0.16, 0.05, -0.42, 0.62, sz * 0.5, { rz: HP, seg: 12 });
      }
      B.box('wood', '#8a4a32', 0.3, 0.36, 1.9, -0.05, 0.62, 0, { r: 0.03 });
      for (let k = 0; k < 5; k++) pbox(B, NS('paint'), k % 2 ? '#f2eee6' : '#b8483e', 0.012, 0.3, 0.36, -0.205, 0.62, -0.72 + k * 0.36);
      B.cyl('metal', K.ironDk, 0.03, 0.6, 0.05, 1.1, 0, { seg: 6 });
      B.box('metal', K.black, 0.2, 0.24, 0.2, 0.05, 1.5, 0, { r: 0.03 });
      B.cyl(NS('glow'), '#ff4a3a', 0.07, 0.03, -0.06, 1.5, 0, { rz: HP, seg: 10, glow: 2.2 });
      B.blob(1.4, 2.0);
      B.col(-0.25, 0, -0.95, 0.95, 0.85, 0.95);
    },
  };

  // ---- tram ticket booth: a little timber-and-glass kiosk with a hipped roof, a ticket window, the timetable (cover)
  D.crossmarket_booth = {
    desc: 'Tramways ticket booth (1.6 × 1.3 m, window toward local +Z): panelled timber lower half, glazed upper, hipped zinc roof with a finial, TICKETS board, a lamp. Collider.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const W = 1.6, Dd = 1.3, Hh = 2.3, c = GREEN;
      B.box('paint', c, W, 1.0, Dd, 0, 0.5, 0, { r: 0.03 });
      for (const [fw, fz, ry] of [[W, Dd / 2, 0], [W, -Dd / 2, PI], [Dd, W / 2, HP], [Dd, -W / 2, -HP]]) {
        B.push(Math.sin(ry) * (ry === 0 || ry === PI ? 0 : Math.abs(fz)), 0, ry === 0 || ry === PI ? fz : 0, ry);
        for (let k = 0; k < 2; k++) pbox(B, NS('paint'), GREENDK, fw / 2 - 0.16, 0.6, 0.012, -fw / 4 + k * fw / 2, 0.5, 0.006);
        pbox(B, NS('gloss'), K.glassWarm, fw - 0.16, 0.9, 0.02, 0, 1.52, -0.02);
        pbox(B, NS('glow'), K.lit, fw - 0.24, 0.3, 0.004, 0, 1.78, -0.005, { glow: 0.6 });
        for (let k = 1; k < 3; k++) pbox(B, NS('paint'), CREAM, 0.035, 0.9, 0.03, -fw / 2 + (k * fw) / 3, 1.52, 0.0);
        pbox(B, 'paint', CREAM, fw + 0.02, 0.06, 0.05, 0, 1.05, 0.0);
        pbox(B, 'paint', CREAM, fw + 0.02, 0.06, 0.05, 0, 2.0, 0.0);
        B.pop();
      }
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.box('paint', CREAM, 0.08, Hh - 0.3, 0.08, sx * W / 2, (Hh - 0.3) / 2, sz * Dd / 2, { r: 0.015 });
      B.box('paint', c, W + 0.2, 0.2, Dd + 0.2, 0, Hh - 0.2, 0, { r: 0.03 });
      B.lathe('paint', K.zinc, [[1.25, 0], [0.9, 0.28], [0.12, 0.62], [0, 0.64]], 0, Hh - 0.1, 0, { seg: 4, ry: PI / 4, sz: Dd / W });
      B.sph('metal', GOLD, 0.06, 0, Hh + 0.6, 0, { ws: 8, hs: 5 });
      // ticket window ledge + board
      B.box('wood', K.woodDk, 0.8, 0.05, 0.25, 0, 1.08, Dd / 2 + 0.12, { r: 0.01 });
      B.box('gloss', GREENDK, 1.2, 0.26, 0.04, 0, Hh - 0.2, Dd / 2 + 0.12, { r: 0.015 });
      letters(B, 'TICKETS', { h: 0.13, x: 0, y: Hh - 0.265, z: Dd / 2 + 0.142, c: GOLD, flat: true, wt: 0.2, track: 0.14 });
      KIT.bill(B, 0, 1.4, -Dd / 2 - 0.012, 0.5, 0.7, 'tram');
      B.blob(2.2, 1.9);
      B.col(-W / 2 - 0.05, 0, -Dd / 2 - 0.05, W / 2 + 0.05, Hh, Dd / 2 + 0.05, { roof: true });
    },
  };
}
