// Top-down stage thumbnail (SVG markup) generated from the real layout data, for the setup-screen map cards.
// Pure data → string (no three.js): boxes and ramp footprints, mirrored like the level, drawn with a height-shaded
// drop shadow so structure reads at a glance. Long axis (z) runs left → right; team Alpha's base is on the left.

const W = 344, H = 160;

function expand(layout) {
  const mirror = (d) => d.kind === 'box'
    ? { ...d, min: [-d.max[0], d.min[1], -d.max[2]], max: [-d.min[0], d.max[1], -d.min[2]] }
    : d.kind === 'obox' ? { ...d, center: [-d.center[0], d.center[1], -d.center[2]], oct: d.oct && [-d.oct[0], -d.oct[1], d.oct[2]] }
    : { ...d, low: [-d.low[0], d.low[1], -d.low[2]], high: [-d.high[0], d.high[1], -d.high[2]] };
  // (rails are collision-only railings: nothing to draw)
  const all = [...layout.single, ...layout.half, ...layout.half.map((d) => (d.oct && d.kind === 'box' ? { ...mirror(d), oct: [-d.oct[0], -d.oct[1], d.oct[2]] } : mirror(d)))].filter((d) => !d.rail);
  // octagon platforms (maps.js OCT) are drawn as one octagon instead of their plus + corner-slab parts
  const out = [], seen = new Set();
  for (const d of all) {
    if (!d.oct) { out.push(d); continue; }
    const key = d.oct.map((v) => v.toFixed(2)).join(',') + ':' + (d.kind === 'box' ? d.max[1] : d.center[1] + d.size[1] / 2).toFixed(1);
    if (seen.has(key) || d.kind !== 'box') continue;
    seen.add(key);
    out.push({ ...d, kind: 'octagon', top: d.max[1] });
  }
  return out;
}

export function layoutThumbSVG(layout, theme = 'day', teams = ['#18c7e8', '#ff4a5a']) {
  const B = layout.bounds;
  const pad = 10;
  const s = Math.min((W - pad * 2) / (B.maxZ - B.minZ), (H - pad * 2) / (B.maxX - B.minX));
  const ox = (W - (B.maxZ - B.minZ) * s) / 2, oy = (H - (B.maxX - B.minX) * s) / 2;
  const X = (z) => ox + (z - B.minZ) * s;          // world z → svg x
  const Y = (x) => oy + (B.maxX - x) * s;          // world x → svg y (Alpha's right = up)
  const sunset = theme === 'sunset', golden = theme === 'golden';
  const sea = sunset ? ['#ffb36b', '#e0607e', '#5b3b9a'] : golden ? ['#ffd49a', '#3aa9b6', '#185f86'] : ['#7fe3f5', '#2fb1e6', '#1e76cf'];
  const defs = `<defs><linearGradient id="tsea${layout.id}${theme}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sea[0]}"/><stop offset=".55" stop-color="${sea[1]}"/><stop offset="1" stop-color="${sea[2]}"/></linearGradient>
    <pattern id="tgr${layout.id}" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><rect width="2.4" height="2.4" fill="#8fa0b3"/><rect width="1.2" height="1.2" fill="#dfe6ee"/></pattern>
    <pattern id="tst${layout.id}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#f4ecdc"/><rect width="2" height="4" fill="#ffd66b"/></pattern></defs>`;
  const parts = [`<rect width="${W}" height="${H}" fill="url(#tsea${layout.id}${theme})"/>`];
  // soft wave marks
  for (let i = 0; i < 6; i++) { const y = 14 + i * 26, x = (i * 53) % 300; parts.push(`<path d="M${x} ${y} q8 -5 16 0 t16 0" stroke="#fff" stroke-opacity=".35" stroke-width="2.4" fill="none" stroke-linecap="round"/>`); }
  const blocks = expand(layout).map((d) => {
    if (d.kind === 'box') return { x0: d.min[0], x1: d.max[0], z0: d.min[2], z1: d.max[2], top: d.max[1], d };
    if (d.kind === 'octagon') {
      const [cx, cz, R] = d.oct;
      const poly = Array.from({ length: 8 }, (_, i) => { const a = Math.PI / 8 + (i * Math.PI) / 4; return [cx + R * Math.cos(a), cz + R * Math.sin(a)]; });
      return { poly, top: d.top, d };
    }
    if (d.kind === 'obox') {
      // rotated footprint → polygon (x, z corners)
      const a = (d.rotY * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), hx = d.size[0] / 2, hz = d.size[2] / 2;
      const poly = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => [d.center[0] + c * hx * i + sn * hz * k, d.center[2] - sn * hx * i + c * hz * k]);
      return { poly, top: d.center[1] + d.size[1] / 2, d };
    }
    const dx = d.high[0] - d.low[0], dz = d.high[2] - d.low[2];
    if (Math.abs(dx) > 1e-3 && Math.abs(dz) > 1e-3) {
      // a ramp running at an angle: its own quad (the along/across box below only fits axis-aligned ramps)
      const l = Math.hypot(dx, dz), px = (-dz / l) * (d.width / 2), pz = (dx / l) * (d.width / 2);
      const poly = [[d.low[0] + px, d.low[2] + pz], [d.high[0] + px, d.high[2] + pz], [d.high[0] - px, d.high[2] - pz], [d.low[0] - px, d.low[2] - pz]];
      return { poly, top: d.high[1], ramp: true, d };
    }
    const along = Math.abs(dz) > Math.abs(dx);
    const hw = d.width / 2;
    return along
      ? { x0: d.low[0] - hw, x1: d.low[0] + hw, z0: Math.min(d.low[2], d.high[2]), z1: Math.max(d.low[2], d.high[2]), top: d.high[1], ramp: true, d }
      : { x0: Math.min(d.low[0], d.high[0]), x1: Math.max(d.low[0], d.high[0]), z0: d.low[2] - hw, z1: d.low[2] + hw, top: d.high[1], ramp: true, d };
  }).sort((a, b) => a.top - b.top);
  for (const b of blocks) {
    const top = b.top;
    if (b.poly) {
      const pts = (dx, dy) => b.poly.map(([px, pz]) => `${(X(pz) + dx).toFixed(1)},${(Y(px) + dy).toFixed(1)}`).join(' ');
      if (top > 0.2 && !b.ramp && !b.d.grate) parts.push(`<polygon points="${pts(1.2 + top * 0.35, 1.2 + top * 0.45)}" fill="#1b2a44" opacity=".28"/>`);
      const k = Math.min(1, Math.max(0, top) / 5);
      const tint = b.d.pattern === 5 && b.d.color ? b.d.color : null;   // containers keep their colour
      const fill = tint || (b.d.grate ? `url(#tgr${layout.id})` : b.ramp ? `url(#tst${layout.id})` : top <= 0.05 ? (sunset ? '#f1cfae' : golden ? '#f4e6cf' : '#f3ecdd') : mix(sunset ? '#e8bf99' : golden ? '#ead6b6' : '#e7dcc6', sunset ? '#fbe6d0' : golden ? '#fff8ec' : '#ffffff', k));
      parts.push(`<polygon points="${pts(0, 0)}" fill="${fill}" stroke="#2a3552" stroke-opacity="${top > 0.05 ? 0.35 : 0.15}" stroke-width="1" stroke-linejoin="round"/>`);
      continue;
    }
    const x = X(b.z0), y = Y(b.x1), w = (b.z1 - b.z0) * s, h = (b.x1 - b.x0) * s;
    if (top > 0.2 && !b.ramp && !b.d.grate) parts.push(`<rect x="${(x + 1.2 + top * 0.35).toFixed(1)}" y="${(y + 1.2 + top * 0.45).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.2" fill="#1b2a44" opacity=".28"/>`);
    let fill;
    if (b.d.grate) fill = `url(#tgr${layout.id})`;
    else if (b.ramp) fill = `url(#tst${layout.id})`;
    else if (top <= 0.05) fill = sunset ? '#f1cfae' : golden ? '#f4e6cf' : '#f3ecdd';
    else { const k = Math.min(1, top / 5); fill = mix(sunset ? '#e8bf99' : golden ? '#ead6b6' : '#e7dcc6', sunset ? '#fbe6d0' : golden ? '#fff8ec' : '#ffffff', k); }
    const tint = b.d.pattern === 5 && b.d.color ? b.d.color : null; // containers keep their colour
    parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${top > 0.05 ? 1.4 : 2.5}" fill="${tint || fill}" stroke="#2a3552" stroke-opacity="${top > 0.05 ? 0.35 : 0.15}" stroke-width="1"/>`);
  }
  // team splats + spawn rings
  layout.spawnPads.forEach(([px, , pz], t) => {
    const cx = X(pz), cy = Y(px), c = teams[t];
    for (let i = 0; i < 5; i++) {
      const a = i * 1.7 + t * 2, r = 9 + (i % 3) * 6;
      const sx = cx + Math.cos(a) * r * (t ? -1.4 : 1.4) + (t ? -14 : 14), sy = cy + Math.sin(a) * r;
      parts.push(blob(sx, sy, 5 + (i % 2) * 3.5, c, i + t * 7));
    }
    parts.push(`<circle cx="${cx}" cy="${cy}" r="7.5" fill="none" stroke="#fff" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="7.5" fill="none" stroke="${c}" stroke-width="1.6"/>`);
  });
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${defs}${parts.join('')}</svg>`;
}

function blob(x, y, r, c, seed) {
  let d = '';
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + 0.18 * Math.sin(a * 3 + seed) + 0.1 * Math.sin(a * 5 + seed * 2));
    d += `${i ? 'L' : 'M'}${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)}`;
  }
  return `<path d="${d}Z" fill="${c}" opacity=".92"/>`;
}

function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
