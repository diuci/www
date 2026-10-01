// Tideline Bow sounds (kits/bow.js plays them). Same format as audio.js's def() calls: build(v, pitch) for one-shots,
// loop(v, pitch) → { pitch(q, now) } for loops. All synthesized.
//   bow_draw   loop   limbs creaking under load + a rising string hum; pitch 0.6 (slack) … 1.5 (full draw)
//   bow_ring1  1-shot first ring: a woody tok under a single marimba note
//   bow_full   1-shot full draw: two bright bell notes + a string shimmer (distinct from the charger's ting)
//   bow_loose  1-shot release: string twang, the arrows' whoosh, a wet flick of ink; pitch < 1 = a heavier draw
//   bow_thunk  1-shot an arrow driving into a surface: thwack + the shaft's buzz
//   bow_tick   1-shot a lodged arrow counting down (played a few times, faster toward the burst)
//   bow_burst  1-shot a lodged arrow bursting: a tight ink pop, smaller than a blaster boom
import { SFX } from '../../audio/audio.js';
import { mtof, pts, sweep } from '../../audio/music.js';

const def = (name, o) => { SFX[name] = o; };

def('bow_draw', {
  gain: 0.3, max: 3, jitter: 0, reverb: 0.04, oneShot: 1.1,
  loop(v, p) {
    const T = v.t;
    // stick-slip creak: band-passed noise chopped by a square LFO (rate rises with the load)
    const cr = v.gain(0.3, v.out), crBp = v.filter('bandpass', 700 * p, 4, cr);
    v.noise('pink', T, null, crBp);
    const lf = v.lfo(14 * p, 0.3, cr.gain, T, null, 'square');   // gain chops 0 … 0.6
    // the string: a quiet hum that climbs with the draw
    const hum = v.gain(0.18, v.out), hlp = v.filter('lowpass', 900, 0.8, hum);
    const o1 = v.osc('triangle', 110 * p, T, null, hlp);
    const o2 = v.osc('sine', 221 * p, T, null, v.gain(0.35, hlp));
    // fibre rustle
    const air = v.gain(0.05, v.out);
    v.noise('white', T, null, v.filter('highpass', 5200, 0.7, air));
    return {
      pitch(q, now) {
        const k = 0.04;
        lf.osc.frequency.setTargetAtTime(9 + 16 * q, now, k); crBp.frequency.setTargetAtTime(420 + 520 * q, now, k);
        o1.frequency.setTargetAtTime(95 * q, now, k); o2.frequency.setTargetAtTime(190 * q, now, k);
        hum.gain.setTargetAtTime(0.1 + 0.14 * q, now, k); air.gain.setTargetAtTime(0.03 + 0.03 * q, now, k);
      },
    };
  },
});

def('bow_ring1', {
  gain: 0.3, max: 2, jitter: 0, reverb: 0.14,
  build(v, p) {
    v.tone({ f: 420 * p, f1: 260 * p, sw: 0.03, a: 0.0008, d: 0.05, peak: 0.55 });                       // woody tok
    v.nz({ f: 1900 * p, q: 3, a: 0.0004, d: 0.014, peak: 0.4 });
    const f = mtof(86) * p;                                                                                // marimba-ish note
    v.tone({ t: 0.012, f, a: 0.001, d: 0.32, peak: 0.42 });
    v.tone({ t: 0.012, f: f * 3.93, a: 0.001, d: 0.06, peak: 0.08 });
    v.tone({ t: 0.012, f: f * 2, a: 0.001, d: 0.12, peak: 0.1 });
  },
});

def('bow_full', {
  gain: 0.28, max: 2, jitter: 0, reverb: 0.22,
  build(v, p) {
    for (const [t, m, pk] of [[0, 93, 0.4], [0.07, 98, 0.44]]) {
      const f = mtof(m) * p;
      v.tone({ t, f, a: 0.001, d: 0.55, peak: pk }); v.tone({ t, f: f * 2.01, a: 0.001, d: 0.25, peak: pk * 0.25 });
      v.tone({ t, f: f * 3.2, a: 0.001, d: 0.1, peak: pk * 0.1 });
    }
    v.nz({ t: 0.02, ft: 'highpass', f: 6500, a: 0.01, d: 0.3, peak: 0.1 });                              // shimmer
    v.tone({ f: 160 * p, f1: 120 * p, sw: 0.05, a: 0.001, d: 0.06, peak: 0.35 });                          // the limbs settle
  },
});

def('bow_loose', {
  gain: 0.58, max: 4, jitter: 0.03, reverb: 0.14,
  build(v, p) {
    const T = v.t;
    // twang: a plucked string, pitch sags as it rings out
    const tw = v.gain(0, v.out), lp = v.filter('lowpass', 2600 * p, 1.2, tw);
    pts(tw.gain, T, [[0, 0], [0.003, 0.7], [0.05, 0.32], [0.24, 0]]);
    for (const [r, g] of [[1, 1], [2.01, 0.45], [3.02, 0.22], [4.1, 0.1]]) {
      const o = v.osc('triangle', 150 * r * p, T, T + 0.26, v.gain(g, lp));
      sweep(o.frequency, T, 158 * r * p, 132 * r * p, 0.24);
    }
    v.nz({ f: 3200 * p, q: 2, a: 0.0003, d: 0.012, peak: 0.7 });                                           // release snap
    v.tone({ f: 120 * p, f1: 55 * p, sw: 0.08, a: 0.001, d: 0.1, peak: 0.6 });                             // the bow kicks
    // three shafts leaving: a quick rising whoosh
    const wg = v.gain(0, v.out), wbp = v.filter('bandpass', 900, 1.4, wg);
    sweep(wbp.frequency, T, 700 * p, 3600 * p, 0.14); pts(wg.gain, T, [[0, 0], [0.02, 0.5], [0.08, 0.3], [0.2, 0]]);
    v.noise('pink', T, T + 0.22, wbp);
    v.nz({ t: 0.01, f: 1500 * p, f1: 600 * p, sw: 0.1, q: 5, a: 0.004, d: 0.1, peak: 0.35 });              // wet flick of ink
  },
});

def('bow_thunk', {
  gain: 0.5, max: 6, jitter: 0.06, reverb: 0.08, minGap: 0.03,
  build(v, p) {
    const T = v.t;
    v.nz({ ft: 'highpass', f: 2400, a: 0.0003, d: 0.016, peak: 0.8 });                                   // thwack
    v.tone({ f: 260 * p, f1: 110 * p, sw: 0.04, a: 0.0008, d: 0.07, peak: 0.75 });                         // thud
    v.nz({ f: 900 * p, q: 3.5, a: 0.001, d: 0.05, peak: 0.45 });
    // the shaft quivering in the surface: a buzzy tone, amplitude-wobbled
    const bz = v.gain(0, v.out), bf = v.filter('bandpass', 520 * p, 3, bz);
    pts(bz.gain, T, [[0, 0], [0.01, 0.35], [0.28, 0]]);
    v.osc('sawtooth', 68 * p, T, T + 0.3, bf);
    v.lfo(31, 0.25, bz.gain, T, T + 0.3, 'sine');
    v.bub(T + 0.02, v.r(900, 1300) * p, 0.1, 0.02, 1.8);
  },
});

def('bow_tick', {
  gain: 0.32, max: 8, jitter: 0.02, reverb: 0.06,
  build(v, p) {
    v.tone({ f: 2350 * p, a: 0.0006, d: 0.045, peak: 0.55 });
    v.tone({ f: 4700 * p, a: 0.0004, d: 0.018, peak: 0.12 });
    v.nz({ f: 3800 * p, q: 3, a: 0.0003, d: 0.008, peak: 0.3 });
  },
});

def('bow_burst', {
  gain: 0.5, max: 6, jitter: 0.05, reverb: 0.2, minGap: 0.02,
  build(v, p) {
    v.nz({ ft: 'highpass', f: 2800, a: 0.0004, d: 0.02, peak: 0.7 });                                   // crack
    v.tone({ f: 170 * p, f1: 48 * p, sw: 0.16, a: 0.0015, d: 0.24, peak: 0.95 });                          // pop body
    v.tone({ t: 0.003, f: 1100 * p, f1: 260 * p, sw: 0.03, a: 0.0005, d: 0.03, peak: 0.25 });
    v.nz({ kind: 'pink', ft: 'lowpass', f: 3000, f1: 300, sw: 0.24, q: 1, a: 0.002, d: 0.26, peak: 0.8 });
    v.nz({ t: 0.02, f: 1500 * p, f1: 480 * p, sw: 0.28, q: 3.2, a: 0.004, d: 0.3, peak: 0.5 });            // wet splash
    let t = 0.06;
    for (let i = 0; i < 5; i++) { t += v.r(0.02, 0.045); v.bub(v.t + t, v.r(800, 1800) * p, 0.13 * (1 - i / 7), v.r(0.012, 0.024), v.r(1.5, 2)); }
  },
});
