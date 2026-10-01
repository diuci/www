// Sponge Mitts — icon + sounds (registered into the shared tables on import; kits/mitts.js imports this).
import { WEAPON_ICONS } from '../../ui/ui-icons.js';
import { SFX, texture } from '../../audio/audio.js';
import { pts } from '../../audio/music.js';

// ---------------------------------------------------------------------------------------------- icon
// A pair of sponge boxing gloves, fists up (two-tone like the rest: ink = currentColor with sponge pores, outline K,
// light cuffs with a dark strap, white gloss); the far one mirrored behind.
const K = '#15121c', DK = '#2b2735', LT = '#e4e8ef';
const O = `stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const glove = `<g ${O}>
      <path d="M9 37 L31 37 L32.5 50 Q32.5 53.5 29 53.5 L11 53.5 Q7.5 53.5 7.5 50 Z" fill="${LT}"/>
      <path d="M8.3 42 L31.7 42 L32.2 46.5 L7.8 46.5 Z" fill="${DK}"/>
      <path d="M8.5 38.5 C4 31 3.5 19 7 11.5 C10.5 4.5 17 2 23.5 2.5 C32 3.2 37.5 9.5 37.5 18.5 C37.5 27 35 33.5 31.5 38.5 Z" fill="currentColor"/>
      <path d="M9 33.5 C3.5 33 1.5 26.5 3.5 21.5 C5.5 17 11 16.5 13.5 20 C15.8 23.2 15.5 29.5 13.2 33.2 Z" fill="currentColor"/>
    </g>
    <path d="M12 9.5 Q16.5 5.8 23 6.2" fill="none" stroke="#fff" stroke-opacity=".65" stroke-width="3" stroke-linecap="round"/>
    <circle cx="30" cy="12" r="1.7" fill="#fff" fill-opacity=".55"/>
    <circle cx="26" cy="19" r="1.3" fill="${K}" fill-opacity=".28"/><circle cx="31" cy="24" r="1.2" fill="${K}" fill-opacity=".28"/>
    <circle cx="21" cy="14.5" r="1.1" fill="${K}" fill-opacity=".25"/><circle cx="24" cy="28" r="1.1" fill="${K}" fill-opacity=".25"/>`;
WEAPON_ICONS.mitts = `<svg class="iw-ico " viewBox="0 0 64 64" aria-hidden="true">
  <g transform="translate(62 6) scale(-0.78 0.78) rotate(-14 20 27)">${glove}</g>
  <g transform="translate(4 7) scale(0.92) rotate(-14 20 27)">${glove}</g></svg>`;

// ---------------------------------------------------------------------------------------------- sounds
// one-shots: build(v, pitch); loops: loop(v, pitch) → { pitch(q, now) }. See audio.js for the voice kit.
const def = (name, o) => { SFX[name] = o; };
function bloop(v, t, f, peak) { v.tone({ t, f, f1: f * 0.35, sw: 0.06, a: 0.0015, d: 0.08, peak }); }
// punch: a short rubbery whoosh with a soft thwup as the glove snaps out
def('mitts_punch', {
  gain: 0.5, max: 4, jitter: 0.06, reverb: 0.04, minGap: 0.03,
  build(v, p) {
    v.nz({ kind: 'pink', f: 700 * p, f1: 2300 * p, sw: 0.06, q: 1.6, a: 0.012, d: 0.07, peak: 0.55 });
    v.tone({ f: 180 * p, f1: 95 * p, sw: 0.05, a: 0.002, d: 0.06, peak: 0.45 });
    v.tone({ type: 'triangle', t: 0.004, f: 520 * p, f1: 900 * p, sw: 0.03, a: 0.001, d: 0.03, peak: 0.12 });   // rubber squeak
  },
});
// fist burst: a wet pomf, spray and a couple of bloops
def('mitts_pop', {
  gain: 0.55, max: 6, jitter: 0.07, reverb: 0.12, minGap: 0.025,
  build(v, p) {
    v.tone({ f: 150 * p, f1: 48 * p, sw: 0.1, a: 0.001, d: 0.16, peak: 0.9 });
    v.nz({ kind: 'pink', ft: 'lowpass', f: 2600, f1: 500, sw: 0.14, q: 1.2, a: 0.001, d: 0.15, peak: 0.7 });
    v.nz({ f: v.r(1500, 1900) * p, f1: v.r(500, 650) * p, sw: 0.16, q: v.r(3, 5), a: 0.002, d: 0.17, peak: 0.55 });
    bloop(v, 0.02, v.r(420, 560) * p, 0.3); bloop(v, 0.05, v.r(600, 800) * p, 0.2);
    for (let i = 0; i < 4; i++) v.bub(v.t + 0.05 + i * v.r(0.02, 0.04), v.r(800, 1700) * p, 0.1 * (1 - i / 5), v.r(0.014, 0.024), v.r(1.5, 2));
  },
});
// leap charge (loop): a sponge being wrung — a squelchy grain texture under a rising stretched-rubber tone; pitch = 0.8
// … 1.7 with the charge
def('mitts_charge', {
  gain: 0.3, max: 2, jitter: 0, reverb: 0.05, oneShot: 1.0,
  loop(v, p) {
    const T = v.t;
    const lp = v.filter('lowpass', 900 * p, 0.9, v.out);
    const tex = v.buffer(texture(v.ctx, 'squelch'), T, null, v.gain(0.9, lp), 0.8 * p);
    const amp = v.gain(0.22, v.out), bp = v.filter('bandpass', 420 * p, 3, amp);
    const o1 = v.osc('sawtooth', 210 * p, T, null, bp), o2 = v.osc('sine', 420 * p, T, null, v.gain(0.4, amp));
    const vib = v.lfo(9 * p, 6, o1.frequency, T, null);
    return {
      pitch(q, now) {
        const k = 0.04;
        tex.playbackRate.setTargetAtTime(0.8 * q, now, k); lp.frequency.setTargetAtTime(900 * q, now, k);
        o1.frequency.setTargetAtTime(210 * q, now, k); o2.frequency.setTargetAtTime(420 * q, now, k); bp.frequency.setTargetAtTime(420 * q * q, now, k);
        vib.osc.frequency.setTargetAtTime(9 * q * q, now, k);
      },
    };
  },
});
// full charge: a squeaky double ding + a drip
def('mitts_full', {
  gain: 0.24, max: 2, jitter: 0, reverb: 0.18,
  build(v, p) {
    for (const [t, f] of [[0, 1180], [0.07, 1570]]) {
      v.tone({ t, f: f * p, a: 0.001, d: 0.35, peak: 0.45 }); v.tone({ t, f: f * 2.01 * p, a: 0.001, d: 0.18, peak: 0.12 });
    }
    v.bub(v.t + 0.12, 900 * p, 0.2, 0.03, 1.9);
  },
});
// leap: a springy boing off the ground with a rush of air
def('mitts_leap', {
  gain: 0.55, max: 3, jitter: 0.04, reverb: 0.08,
  build(v, p) {
    const T = v.t, g = v.gain(0, v.out);
    pts(g.gain, T, [[0, 0], [0.01, 0.55], [0.18, 0.3], [0.32, 0]]);
    const o = v.osc('sine', 170 * p, T, T + 0.34, g);
    o.frequency.setValueAtTime(170 * p, T); o.frequency.exponentialRampToValueAtTime(560 * p, T + 0.16); o.frequency.exponentialRampToValueAtTime(430 * p, T + 0.32);
    v.lfo(26, 18, o.frequency, T, T + 0.34);
    v.nz({ kind: 'pink', f: 500 * p, f1: 2600 * p, sw: 0.3, q: 1.2, a: 0.05, d: 0.28, peak: 0.45 });
    v.tone({ f: 120 * p, f1: 55 * p, sw: 0.08, a: 0.001, d: 0.1, peak: 0.6 });
    v.nz({ kind: 'pink', ft: 'lowpass', f: 1800, f1: 400, sw: 0.1, a: 0.001, d: 0.1, peak: 0.4 });
  },
});
// landing: a heavy thud into a big wet splash with droplets raining back
def('mitts_land', {
  gain: 0.65, max: 3, jitter: 0.05, reverb: 0.22,
  build(v, p) {
    v.tone({ f: 105 * p, f1: 32 * p, sw: 0.25, a: 0.002, d: 0.4, peak: 1 });
    v.nz({ ft: 'highpass', f: 2600, a: 0.0005, d: 0.03, peak: 0.5 });
    v.nz({ kind: 'pink', ft: 'lowpass', f: 3200, f1: 260, sw: 0.32, q: 1, a: 0.002, d: 0.38, peak: 1 });
    v.nz({ t: 0.02, f: 1300 * p, f1: 380 * p, sw: 0.35, q: 3.5, a: 0.004, d: 0.4, peak: 0.65 });
    for (let i = 0; i < 3; i++) bloop(v, 0.03 + i * 0.04, v.r(380, 650) * p, 0.28);
    let t = 0.1;
    for (let i = 0; i < 10; i++) { t += v.r(0.022, 0.05); v.bub(v.t + t, v.r(700, 1800) * p, 0.15 * (1 - i / 12), v.r(0.012, 0.026), v.r(1.5, 2.1)); }
  },
});
// sticking to a wall: a sucking squelch and a soft slap
def('mitts_cling', {
  gain: 0.55, max: 3, jitter: 0.05, reverb: 0.06,
  build(v, p) {
    v.tone({ f: 140 * p, f1: 60 * p, sw: 0.08, a: 0.001, d: 0.12, peak: 0.7 });
    v.nz({ kind: 'pink', f: 380 * p, f1: 1500 * p, sw: 0.18, q: 4, a: 0.01, d: 0.2, peak: 0.7 });
    v.nz({ t: 0.08, f: 900 * p, f1: 300 * p, sw: 0.12, q: 5, a: 0.005, d: 0.14, peak: 0.4 });
    for (let i = 0; i < 3; i++) v.bub(v.t + 0.1 + i * 0.05, v.r(300, 520) * p, 0.18, 0.05, 1.4);
  },
});
// hanging on (loop): the sponge slurping ink out of the tank — slow gurgle
def('mitts_drain', {
  gain: 0.26, max: 2, jitter: 0, reverb: 0.04, oneShot: 1.5,
  loop(v, p) {
    const T = v.t;
    const lp = v.filter('lowpass', 1100 * p, 1.2, v.out);
    const g = v.gain(0.9, lp);
    const tex = v.buffer(texture(v.ctx, 'bubbles'), T, null, g, 0.6 * p);
    v.lfo(1.6, 0.35, g.gain, T, null);
    const sq = v.gain(0.05, v.out);
    v.noise('pink', T, null, v.filter('bandpass', 520 * p, 4, sq));
    v.lfo(3.1, 0.04, sq.gain, T, null);
    return { pitch(q, now) { tex.playbackRate.setTargetAtTime(0.6 * q, now, 0.05); lp.frequency.setTargetAtTime(1100 * q, now, 0.05); } };
  },
});
// letting go: a sticky pop-off
def('mitts_unstick', {
  gain: 0.5, max: 3, jitter: 0.06, reverb: 0.05,
  build(v, p) {
    v.tone({ f: 260 * p, f1: 720 * p, sw: 0.06, a: 0.001, d: 0.08, peak: 0.5 });
    v.nz({ f: 1400 * p, f1: 500 * p, sw: 0.1, q: 4, a: 0.001, d: 0.1, peak: 0.4 });
    v.bub(v.t + 0.03, 600 * p, 0.15, 0.03, 1.8);
  },
});
