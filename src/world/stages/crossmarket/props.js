// Crossroads Market — stage prop pack + placements (owner: the crossmarket stage; see layout.js for the folder contract).
//
// register(D, H): add this stage's own prop builders to the PropKit definition table D (same contract as
// props-marina-dock.js / props-marina-vessels.js: H carries THREE + the kit helpers; types must be prefixed 'crossmarket_' so
// stages never collide). PLACEMENTS: this stage's set dressing (half list: every entry is mirrored (x,z) → (-x,-z)
// with rotY + π unless it says `mirror: false`). Solid props hand the level collision boxes (paintable, nav, physics).
//
// The town: the level blocks (layout.js) are the buildings' masses (sandstone ashlar / painted render / brick); the
// `crossmarket_house` prop dresses them (shopfronts with fascia signs + awnings, sash windows with surrounds, shutters,
// iron balconettes, string courses, cornices, quoins, pitched / hipped / mansard roofs with chimneys + dormers). The
// rest is street furniture: the cast-iron-and-glass market hall, trams, stalls, lamps, kiosks, bollards, fountains …
import { makeKit, FL } from './kit.js';
import { T, TH } from './layout.js';
import { registerBuildings, registerCivic } from './buildings.js';
import { registerHall } from './hall.js';
import { registerTram } from './tram.js';
import { registerStreet } from './street.js';
import { registerScenery } from './scenery.js';
import { registerLanding } from './landing.js';

const P = Math.PI;

export function register(D, H) {
  const KIT = makeKit(D, H);
  registerBuildings(D, H, KIT);
  registerCivic(D, H, KIT);
  registerHall(D, H, KIT);
  registerTram(D, H, KIT);
  KIT.street = registerStreet(D, H, KIT);
  registerScenery(D, H, KIT);
  registerLanding(D, H, KIT);
}

// ================================================================================================ placements
// house(x0, x1, z0, z1, h, style, faces, roof): a crossmarket_house dressing the block x0…x1 × z0…z1 (wall top h)
const house = (x0, x1, z0, z1, h, style, faces, roof, extra = {}) => ({ type: 'crossmarket_house', pos: [(x0 + x1) / 2, 0, (z0 + z1) / 2], w: x1 - x0, d: z1 - z0, h, style, faces, roof, ...extra });
const FAS = { green: '#1f3d33', navy: '#23304a', wine: '#5b2230', black: '#202124', teal: '#1f4a4a', brown: '#4a3222' };
const AWN = { red: ['#b8483e', '#efe6d2'], green: ['#3f7a5a', '#efe6d2'], blue: ['#3f5f86', '#efe6d2'], ochre: ['#cf9a3c', '#efe6d2'], plum: ['#7a3a4c', '#efe6d2'], teal: ['#3f8a85', '#efe6d2'] };

// the tramway frame (layout.js): tw(u, v, y) → world pos; turned placements take rotY = RT (+ a local turn)
const RT = -TH;
const tw = (u, v, y = 0) => { const [x, z] = T(u, v); return [x, y, z]; };

const HOUSES = [
  // back corners either side of the spawn terrace (BL +X ochre render, BR −X brick)
  house(9, 24, -44, -36, 8.6, { style: 'render', trim: '#efe6d3', shut: '#4f7a5a', quoins: true, quoinC: '#e0d2b4' }, {
    n: { shops: [{ x0: -6.9, x1: -1.1, name: 'IRONMONGER', fascia: FAS.green, rolled: '#3f7a5a', door: 'r', goods: 'tins', sign: 'key' }, { x0: 0.6, x1: 6.9, name: 'TEA ROOMS', fascia: FAS.wine, awn: AWN.plum, door: 'l', goods: 'cups' }], balc: [1, 4] },
    e: { gwin: [-2.5, 0, 2.5] },
    w: { french: true, noGround: true },
  }, { kind: 'hip', c: '#b0634a', pitch: 0.55, chimneys: [[-4, -1.5, 3], [4.5, 1.8, 2]] }),
  house(-24, -9, -44, -36, 9.2, { style: 'brick', trim: '#e4d7bd', archC: '#8e5641' }, {
    n: { shops: [{ x0: -6.9, x1: -0.6, name: 'SMOKEHOUSE', fascia: FAS.black, awn: AWN.red, door: 'r', goods: 'fish', sign: 'fish' }, { x0: 0.6, x1: 6.9, name: 'CHANDLER', fascia: FAS.navy, rolled: '#3f5f86', door: 'l', goods: 'tins' }], cornice: 'dentil' },
    w: { gwin: [-2.5, 0, 2.5] },
    e: { french: true, noGround: true },
  }, { kind: 'gable', c: '#5b646e', pitch: 0.6, wall: '#b8765c', chimneys: [[-5, 0, 3], [5, 0, 3]], dormers: [[-2.5, 1], [2.5, 1]] }),
  // right block (−X): R2 (square to Market Street, the gallery on its east face) and R1, turned to the tramway
  house(-15, -6, -28, -23, 8.0, { style: 'ashlar', trim: '#efe6d3' }, {
    s: { shops: [{ x0: -4.2, x1: 4.2, name: 'BUTCHER', fascia: FAS.wine, awn: AWN.red, door: 'c', goods: 'tins' }], balc: 'first', plaque: [-3.4, 3.05, 'EXCHANGE SQUARE'] },
    e: { shops: [{ x0: -2.3, x1: 2.3, name: 'CHEESE', fascia: FAS.brown, door: 'l', top: 2.22, goods: 'tins' }], french: true },
    w: { shops: [{ x0: -2.3, x1: 2.3, name: 'FISH', fascia: FAS.navy, awn: AWN.blue, door: 'r', goods: 'fish', sign: 'fish' }], floors: [] },
    n: { gwin: [-3.6] },
  }, { kind: 'hip', c: '#5b646e', pitch: 0.58, chimneys: [[-2.5, 0.6, 2]] }),
  { type: 'crossmarket_house', pos: tw(-16.4, -6.6), rotY: RT, w: 7, d: 5.2, h: 7.6, style: { style: 'render', trim: '#f1ebdf', shut: '#5d7f9c', boxes: true }, faces: {
    n: { shops: [{ x0: -3.1, x1: 3.1, name: 'FLORIST', fascia: FAS.green, awn: AWN.green, door: 'l', goods: 'flowers', sign: 'flower' }], plaque: [3.0, 3.05, 'TRAM STREET'] },
    e: { shops: [{ x0: -2.1, x1: 2.1, name: 'BOOKS', fascia: FAS.navy, rolled: '#3f5f86', door: 'c', goods: 'books' }] },
    w: { shops: [{ x0: -2.1, x1: 2.1, name: 'OYSTERS', fascia: FAS.teal, awn: AWN.teal, door: 'c', goods: 'fish' }] },
    s: { door: [-1.8, 1.0], gwin: [1.6] },
  }, roof: { kind: 'gable', c: '#b0634a', pitch: 0.55, wall: '#a9bcc4', chimneys: [[2.2, 0, 2]] } },
  // left block (+X): the tall row on Market Street (bakery · passage · café) and the shops under the roof terrace
  house(6, 10.5, -28, -12, 8.4, { style: 'render', trim: '#efe6d3', shut: '#4f7a5a', boxes: true }, {
    w: { shops: [{ x0: -7.8, x1: -1.4, name: 'BAKERY', fascia: FAS.brown, awn: AWN.ochre, door: 'r', goods: 'bread', sign: 'pretzel' }, { x0: 2.4, x1: 7.8, name: 'CAFE', fascia: FAS.black, awn: AWN.green, door: 'l', goods: 'cups', sign: 'cup' }], uskip: [], balc: [1, 4] },
    n: { shops: [{ x0: -2.1, x1: 2.1, name: 'CAFE', fascia: FAS.black, awn: AWN.green, door: 'c' }], floors: [] },
    s: { gwin: [0], floors: [], plaque: [1.2, 2.9, 'MARKET STREET'] },
    e: { french: true, noGround: true },
  }, { kind: 'gable', ry: Math.PI / 2, c: '#5b646e', pitch: 0.62, wall: '#e8dfcc', chimneys: [[-4, 0, 3], [4, 0, 2]], dormers: [[-5, 1], [0, 1], [5, 1], [-3, -1], [3, -1]] }),
  house(10.5, 15, -28, -21, FL, { style: 'ashlar', trim: '#efe6d3', cornice: 'none', pipe: false, noBand: true }, {
    e: { shops: [{ x0: -3.2, x1: 3.2, name: 'WINES', fascia: FAS.wine, rolled: '#7a3a4c', door: 'r', goods: 'wine' }] },
  }),
  house(10.5, 15, -18, -16, FL, { style: 'ashlar', trim: '#efe6d3', cornice: 'none', pipe: false, noBand: true }, {
    e: { door: [0, 1.0] },
  }),
  // the sea-front row over the Fish Lane arcade (upper floors; the arcade is open below), ending at the tramway
  house(-24, -19.4, -36, -20, 8.2, { style: 'ashlar', trim: '#efe6d3', shut: '#8a948f' }, {
    e: { floors: [3.1, 5.8], plinth: false, pipe: false, bays: 6, balc: [1, 4], noBand: true },
    w: { floors: [3.1, 5.8], plinth: false, bays: 5 },
    n: { floors: [3.1, 5.8], plinth: false, plaque: [0, 3.0, 'FISH LANE'] },
  }, { kind: 'gable', ry: Math.PI / 2, c: '#b0634a', pitch: 0.58, wall: '#e8dfcc', chimneys: [[-5, 0, 2], [4, 0, 3]] }),
  // the arcade's back wall: the fish market's shopfronts inside the arcade
  house(-24, -23.2, -36, -20, 2.8, { style: 'ashlar', cornice: 'none', plinth: false, pipe: false, noBand: true }, {
    e: { shops: [{ x0: -7.2, x1: -1.4, name: 'FRESH FISH', fascia: FAS.navy, door: 'c', goods: 'fish' }, { x0: 1.2, x1: 7.2, name: 'OYSTER BAR', fascia: FAS.teal, door: 'l', goods: 'wine' }] },
  }),
];
const STREET = [
  { type: 'crossmarket_hall', pos: [0, 0, 0], rotY: RT, mirror: false },
  { type: 'crossmarket_tram', pos: [0, 0, 0], rotY: RT, mirror: false },
  // ---- the tramway: traction poles on alternate kerbs (arms over the track), the overhead, the stop, the pier end
  { type: 'crossmarket_catenary', pos: tw(11, -3.55), rotY: RT, reach: 3.55 },
  { type: 'crossmarket_catenary', pos: tw(19.5, -3.55), rotY: RT, reach: 3.55 },
  { type: 'crossmarket_catenary', pos: tw(28, -3.55), rotY: RT, reach: 3.55 },
  { type: 'crossmarket_wire', pos: tw(9.4, 0), rotY: RT, length: 23 },
  { type: 'crossmarket_tramstop', pos: tw(17, -3.75, 0.3), rotY: RT, length: 4 },
  { type: 'crossmarket_buffer', pos: tw(32.2, 0), rotY: RT },
  // pier railings (the tramway runs out over the harbour): the end, the dock-basin side, the sea side
  { type: 'crossmarket_railing', pos: tw(-32.95, -3.95), rotY: RT - P / 2, length: 7.9 },
  { type: 'crossmarket_railing', pos: tw(-33, 3.95), rotY: RT, length: 17.85 },
  { type: 'crossmarket_railing', pos: tw(-33, -3.95), rotY: RT, length: 2.65 },
  // the dock basin: its quay edge by the wedge plaza, the flank street + Parade landing's edge, the wedge's sea edge
  { type: 'crossmarket_railing', pos: [-14.9, 0, -4.3], rotY: -P / 2, length: 4.3 },
  { type: 'crossmarket_railing', pos: [15, 0, -0.1], rotY: 0, length: 8.95, notIn: 'zones' },   // (Zone Control: opened for the gangplank)
  { type: 'crossmarket_railing', pos: [-23.9, 0, -20], rotY: -P / 2, length: 0.95 },
  // ---- the Corn Exchange behind the spawn terrace, the podium front, the stairs
  { type: 'crossmarket_exchange', pos: [0, 0, -44], rotY: 0, w: 18, team: 0 },
  { type: 'crossmarket_podium', pos: [0, 0, -36], rotY: 0, w: 18, h: 2.4, arches: [-7.6, -4.9, 3.9], skip: [[-2.2, 2.2], [5.6, 8.4]] },
  { type: 'crossmarket_stonestair', pos: [0, 0, -29.8], rotY: P, run: 6.2, rise: FL, width: 4.4 },
  { type: 'crossmarket_stonestair', pos: [7, 0, -29.8], rotY: P, run: 6.2, rise: FL, width: 2.8 },
  { type: 'crossmarket_stonestair', pos: [12.75, 0, -34.2], rotY: 0, run: 6.2, rise: FL, width: 4.5 },
  { type: 'crossmarket_stonestair', pos: [12.75, 0, -9.8], rotY: P, run: 6.2, rise: FL, width: 4.5 },
  { type: 'crossmarket_stonestair', pos: [21.75, 0, -33], rotY: 0, run: 3, rise: 1.2, width: 4.5 },
  { type: 'crossmarket_stonestair', pos: [21.75, 0, -3], rotY: P, run: 3, rise: 1.2, width: 4.5 },
  // ---- spawn terrace: front balustrades between the stairs, planters + benches at the back
  { type: 'crossmarket_balustrade', pos: [-9, FL, -36.2], rotY: 0, length: 3.0 },
  { type: 'crossmarket_balustrade', pos: [-3.8, FL, -36.2], rotY: 0, length: 1.42 },
  { type: 'crossmarket_balustrade', pos: [2.38, FL, -36.2], rotY: 0, length: 3.04 },
  { type: 'planter', pos: [-7.7, FL, -43.35], rotY: 0, variant: 2, color: 'tealdark' },
  { type: 'planter', pos: [7.7, FL, -43.35], rotY: 0, variant: 2, color: 'tealdark' },
  { type: 'crossmarket_bench', pos: [-5.2, FL, -43.55], rotY: 0 },
  { type: 'crossmarket_bench', pos: [5.2, FL, -43.55], rotY: 0 },
  // ---- the roof terrace (café Les Halles): pergola along the tall row, tables, balustrade on the street edge
  { type: 'crossmarket_pergola', pos: [10.55, FL, -16.6], rotY: P / 2, length: 10.8, d: 1.5 },
  { type: 'cafeset', pos: [13.2, FL, -25.4], rotY: 0.4, variant: 0, color: '#3f7a5a' },
  { type: 'cafeset', pos: [13.1, FL, -18.6], rotY: 1.2, variant: 1, color: '#3f7a5a' },
  { type: 'crossmarket_balustrade', pos: [14.8, FL, -16.1], rotY: P / 2, length: 3.5 },
  { type: 'crossmarket_balustrade', pos: [14.8, FL, -21.9], rotY: P / 2, length: 6.0 },
  { type: 'crossmarket_passage', pos: [6, 0, -19.5], rotY: -P / 2, w: 3, depth: 9, h: FL, h2: 2.2, split: 4.5 },
  // ---- the veranda (Arcade Gallery, z -36 … -19) + its iron stairs; the Fish Lane arcade
  { type: 'crossmarket_veranda', pos: [-4.9, 0, -27.5], rotY: 0, length: 17, free: [[-8.5, -0.5]], railW: [[-8.5, -0.5], [6.6, 8.5]] },
  { type: 'crossmarket_ironstair', pos: [-4.9, 0, -12.8], rotY: P, run: 6.2, rise: FL, width: 2.2 },
  { type: 'crossmarket_ironstair', pos: [-12.4, 0, -21.9], rotY: P / 2, run: 6.4, rise: FL, width: 2.0, sides: [-1] },
  { type: 'crossmarket_arcade', pos: [-19.8, 0, -27.95], rotY: 0, n: 5, pitch: 3.8, depth: 3.8 },
  // ---- Market Street: the fountain, the island stalls, a lamp refuge where the street meets the hall's corner
  { type: 'crossmarket_fountain', pos: [0, 0, -24.5] },
  { type: 'crossmarket_stall', pos: [0, 0, -19.0], rotY: P / 2, w: 3.0, d: 1.3, kind: 'veg', double: true },
  { type: 'crossmarket_stall', pos: [0, 0, -15.6], rotY: P / 2, w: 3.0, d: 1.3, kind: 'fruit', double: true },
  { type: 'crossmarket_bollard', pos: [-3.55, 0, -28.4], rotY: P / 2, count: 2, spacing: 1.6 },
  { type: 'crossmarket_bollard', pos: [3.55, 0, -28.4], rotY: P / 2, count: 2, spacing: 1.6 },
  { type: 'crossmarket_bollard', pos: [3.55, 0, -11.6], rotY: -P / 2, count: 2, spacing: 1.5, variant: 1 },
  { type: 'crossmarket_lamp', pos: [0.6, 0, -11.6], variant: 1, height: 3.6 },
  { type: 'crossmarket_bollard', pos: [-1.3, 0, -12.2], count: 2, spacing: 1.2 },
  { type: 'crossmarket_barrow', pos: [4.8, 0.15, -24.6], rotY: -P / 2, kind: 'fruit' },
  { type: 'crossmarket_lamp', pos: [4.25, 0.15, -14.2] },
  { type: 'crossmarket_lamp', pos: [4.25, 0.15, -27.2] },
  // ---- the hall floor (hall frame, turned): aisle stalls + the central island stall facing the tram
  // (Zone Control moves these three out of the centre zone: see ZONES below)
  { type: 'crossmarket_stall', pos: tw(-6.9, -4.9), rotY: RT, w: 2.6, d: 1.2, kind: 'cheese', notIn: 'zones' },
  { type: 'crossmarket_stall', pos: tw(6.9, -4.9), rotY: RT, w: 2.6, d: 1.2, kind: 'bread', notIn: 'zones' },
  { type: 'crossmarket_stall', pos: tw(0, -5.0), rotY: RT, w: 2.4, d: 1.3, kind: 'flowers', double: true, notIn: 'zones' },
  { type: 'bunting', pos: tw(-9, -6.95), rotY: RT, length: 4.5, height: 4.45, posts: false },
  { type: 'bunting', pos: tw(4.5, -6.95), rotY: RT, length: 4.5, height: 4.45, posts: false },
  { type: 'bunting', pos: tw(-9, -2.65), rotY: RT, length: 4.5, height: 4.45, posts: false },
  // ---- forecourt: café tables in front of the smokehouse, lamps between the stairs, a flower barrow
  { type: 'cafeset', pos: [-12.6, 0, -32.6], rotY: 0.3, variant: 0, color: '#7a3a4c' },
  { type: 'cafeset', pos: [-16.4, 0, -31.0], rotY: 1.1, variant: 1, color: '#7a3a4c' },
  { type: 'crossmarket_barrow', pos: [-9.4, 0, -30.2], rotY: 0.25, kind: 'flowers', variant: 1 },
  { type: 'crossmarket_lamp', pos: [3.9, 0, -31.2], variant: 1 },
  { type: 'crossmarket_bench', pos: [17.3, 0, -35.3], rotY: 0 },
  { type: 'crossmarket_crates', pos: [9.6, 0, -31.0], rotY: P / 2, kind: 'veg', variant: 0 },
  // ---- right flank: Fish Lane + the arcade (fish counters under the arches), the wedge court, the tramway's end
  { type: 'crossmarket_stall', pos: [-22.5, 0.15, -29.5], rotY: P / 2, w: 2.4, d: 0.95, kind: 'fish', canopy: false },
  { type: 'crossmarket_stall', pos: [-22.5, 0.15, -22.2], rotY: P / 2, w: 2.4, d: 0.95, kind: 'fish', canopy: false },
  { type: 'crossmarket_barrow', pos: [-17.3, 0, -26.2], rotY: P / 2, kind: 'fish', variant: 1 },
  { type: 'crossmarket_crates', pos: [-16.8, 0, -18.4], rotY: 0.2, kind: 'fish', variant: 2 },
  { type: 'crossmarket_crates', pos: [-14.0, 0, -19.3], rotY: 0.4, kind: 'veg', variant: 1 },
  { type: 'crossmarket_sacks', pos: [-8.6, 0, -19.6], rotY: RT, variant: 0 },
  // the little wedge plaza between the florist's gable end, the hall's corner and the gallery stair: a tree in a tub
  { type: 'planter', pos: tw(-11.4, -5.4), rotY: RT, length: 1.4, width: 1.0, variant: 2, color: 'tealdark' },
  // festoon from the florist's across the tramway to the traction pole opposite
  { type: 'stringlights', pos: tw(-13.3, -4.1), rotY: RT - Math.atan2(7.65, 2.3), length: 8.0, height: 4.9, endHeight: 5.4, sag: 0.5, count: 13 },
  { type: 'crossmarket_bin', pos: [-7.3, 0, -12.3] },
  // ---- the plaza by the hall's east corner (left) and its twin: news kiosk, advertising column, ticket booth, crates
  { type: 'crossmarket_kiosk', pos: [13.4, 0, -5.2], rotY: 0 },
  { type: 'crossmarket_column', pos: [17.2, 0, -9.0] },
  { type: 'crossmarket_booth', pos: tw(-10.5, 5.6), rotY: RT + P },
  { type: 'crossmarket_crates', pos: tw(-12.5, 5.3), rotY: RT, kind: 'fruit', variant: 2 },
  // ---- left flank: flower barrow + crates in the street, benches + lamps + stalls on the Parade
  { type: 'crossmarket_barrow', pos: [17.3, 0, -20.4], rotY: P / 2, kind: 'flowers' },
  { type: 'crossmarket_crates', pos: [16.4, 0, -13.0], rotY: 0.1, kind: 'fruit', variant: 1 },
  { type: 'crossmarket_bench', pos: [23.2, 1.2, -21.6], rotY: P / 2 },
  { type: 'crossmarket_bench', pos: [23.2, 1.2, -11.6], rotY: P / 2 },
  { type: 'crossmarket_stall', pos: [22.55, 1.2, -26.4], rotY: -P / 2, w: 2.4, d: 1.1, kind: 'fish', name: 'CATCH OF THE DAY' },
  { type: 'crossmarket_stall', pos: [22.55, 1.2, -15.6], rotY: -P / 2, w: 2.4, d: 1.1, kind: 'fish', name: 'OYSTERS' },
  { type: 'crossmarket_lamp', pos: [23.4, 1.2, -18.0] },
  { type: 'crossmarket_lamp', pos: [23.4, 1.2, -28.5] },
  { type: 'crossmarket_lamp', pos: [23.4, 1.2, -7.5] },
  { type: 'crossmarket_railing', pos: [23.9, 1.2, -30], rotY: -P / 2, length: 24 },
  { type: 'crossmarket_railing', pos: [23.9, 0, -36], rotY: -P / 2, length: 3 },
  { type: 'crossmarket_railing', pos: [23.9, 0, -3], rotY: -P / 2, length: 2.95 },
  // ---- festoons + bunting: across Market Street from the veranda canopy to the tall row, across Fish Lane, over
  //      the flank street
  { type: 'stringlights', pos: [-3.7, 0, -33.4], rotY: 0, length: 9.7, height: 5.25, sag: 0.55, count: 16 },
  { type: 'stringlights', pos: [-3.7, 0, -26.6], rotY: 0, length: 9.7, height: 5.25, sag: 0.55, count: 16 },
  { type: 'stringlights', pos: [-3.7, 0, -20.2], rotY: 0, length: 9.7, height: 5.25, sag: 0.6, count: 16 },
  { type: 'bunting', pos: [-19.3, 0, -31.5], rotY: 0, length: 4.2, height: 4.7, posts: false },
  { type: 'bunting', pos: [-19.3, 0, -25.6], rotY: 0, length: 4.2, height: 4.7, posts: false },
  { type: 'bunting', pos: [15.05, 0, -25.8], rotY: 0, length: 8.3, height: 4.3, posts: false },
  { type: 'bunting', pos: [15.05, 0, -13.6], rotY: 0, length: 8.3, height: 4.3, posts: false },
  // ---- street clutter: post boxes, fingerposts, bins, sacks, casks, lobster pots, tubs, A-boards
  { type: 'crossmarket_fingerpost', pos: [-10.8, 0, -29.0], rotY: 0, arms: [[90, 'MARKET HALL'], [0, 'FISH LANE'], [-90, 'CORN EXCHANGE']] },
  { type: 'crossmarket_fingerpost', pos: [20.2, FL - 1.4, -9.0], rotY: 0, arms: [[90, 'TRAMS'], [-90, 'THE PARADE'], [180, 'HARBOUR']] },
  { type: 'crossmarket_postbox', pos: [9.7, 0, -35.3] },
  { type: 'crossmarket_postbox', pos: [8.0, 0, -11.35] },
  { type: 'crossmarket_bin', pos: [-7.1, 0, -33.2] },
  { type: 'crossmarket_aboard', pos: [-10.6, 0, -34.9], rotY: 0.2, text: 'KIPPERS' },
  { type: 'crossmarket_aboard', pos: [4.45, 0.15, -16.4], rotY: -P / 2 + 0.3, text: 'CAFE' },
  { type: 'crossmarket_tubs', pos: [-14.2, 0, -35.55], rotY: 0, count: 2, spacing: 1.2, color: '#5b2230' },
  { type: 'crossmarket_tubs', pos: [15.35, 0, -17.6], rotY: P / 2, count: 1, variant: 1 },
  { type: 'crossmarket_pots', pos: [-22.6, 0.15, -25.6], rotY: P / 2, variant: 0 },
  { type: 'crossmarket_pots', pos: [22.75, FL - 1.4, -9.6], rotY: P / 2, variant: 1 },
  { type: 'crossmarket_sacks', pos: [18.6, 0, -35.0], rotY: P, variant: 1 },
  { type: 'crossmarket_casks', pos: [16.1, 0, -26.6], rotY: P / 2 },
  // ---- fly-posted bills on a blank ground-floor wall
  { type: 'crossmarket_bills', pos: [-13.8, 0, -22.99], rotY: 0, count: 2, seedN: 5 },
  // ---- drains + manholes in the setts
  { type: 'crossmarket_manhole', pos: [-1.8, 0, -29.2], rotY: 0.2 },
  { type: 'crossmarket_manhole', pos: [17.2, 0, -30.5], rotY: 0.6 },
  { type: 'crossmarket_manhole', pos: [-17.4, 0, -18.5], rotY: 1.1 },
  { type: 'crossmarket_manhole', pos: [-3.5, 0, -21.0], rotY: P / 2, variant: 1 },
  { type: 'crossmarket_manhole', pos: [3.5, 0, -13.3], rotY: P / 2, variant: 1 },
  // ---- the town beyond the harbour channels (scenery)
  { type: 'crossmarket_farside', pos: [38, 0, -48], rotY: -P / 2, length: 48, seedN: 1 },
  { type: 'crossmarket_farside', pos: [-38, 0, 0], rotY: P / 2, length: 48, seedN: 5 },
  { type: 'crossmarket_farside', pos: [-30, 0, -57], rotY: 0, length: 60, seedN: 9 },
];

// ================================================================================================ Zone Control only
// (onlyIn: 'zones', src/world/variants.js: built only in that mode, mirrored like everything else; Turf War is untouched)
// · the centre zone round the tram is cleared: the hall's island flower stall steps back out through the gable end
//   onto the street, the cheese + bread stalls slide back along the aisles; all still there as cover round the zone
// · each tram pier (the side zone) gets the goods landing (layout.js: hoist stage + lighter deck + gangplank): the
//   market lighter in the dock basin, its cargo stacked as steps up to the hoist stage, which overhangs the pier
const ZC = 'zones';
const CT = Math.cos(TH), ST = Math.sin(TH);
const STAGE = [-25.6, 5.65], LIGHTER = [-23.825, 10.0];                // tramway frame (u, v) centres
// world (x, y, z) → the lighter's local frame (x along u toward the bow, z along v)
const inLighter = (x, y, z) => [x * CT + z * ST - LIGHTER[0], y, -x * ST + z * CT - LIGHTER[1]];
const ZONES = [
  { type: 'crossmarket_stall', pos: tw(0, -8.1), rotY: RT, w: 2.4, d: 1.3, kind: 'flowers', double: true, onlyIn: ZC },
  { type: 'crossmarket_stall', pos: tw(-7.4, -4.9), rotY: RT, w: 2.6, d: 1.2, kind: 'cheese', onlyIn: ZC },
  { type: 'crossmarket_stall', pos: tw(7.4, -4.9), rotY: RT, w: 2.6, d: 1.2, kind: 'bread', onlyIn: ZC },
  // the hoist stage (deck u -27.5 … -23.7, v 3.05 … 8.25 at 3.1; the pier edge is v 3.95): its outer railing opens
  // onto the cargo's top step (u -27.2 … -25.15); the crane on the outer +u corner swings over the lighter
  { type: 'crossmarket_hoist', pos: tw(...STAGE), rotY: RT, w: 3.8, d: 5.2, deckY: 3.1, over: 0.9, open: [-1.6, 0.45], onlyIn: ZC },
  // the lighter (deck u -27.2 … -20.45, v 8.45 … 11.55 at -0.3: 4.5 m of water off the pier), bow toward the far
  // quay; bow line to a bollard there, stern line to the stage's corner pile
  { type: 'crossmarket_lighter', pos: tw(...LIGHTER), rotY: RT, L: 6.75, W: 3.1, deckY: -0.3, onlyIn: ZC,
    lines: [[3.535, -0.02, 0, ...inLighter(-21.25, 0.72, 0.4)], [-3.3, -0.12, -1.4, -3.42, 0.6, -2.15]] },
  // its cargo as steps: bow landing (-0.3, the gangplank comes down onto it) → 0.6 → 1.5 → 2.35, then the stage (3.1).
  // Step depths are tuned to the bots' 1 m nav grid (turned 31° to it): every riser keeps 2-3 jump links
  { type: 'crossmarket_cargo', pos: tw(...LIGHTER), rotY: RT, W: 3.1, deckY: -0.3, tiers: [[-3.375, -1.175, 2.35], [-1.175, 0.175, 1.5], [0.175, 1.875, 0.6]], onlyIn: ZC },
  // the quay railing at the foot of the Parade stair opens at its corner for the gangplank + the bow line's bollard
  { type: 'crossmarket_railing', pos: [15, 0, -0.1], rotY: 0, length: 6.0, onlyIn: ZC },
  { type: 'crossmarket_bollard', pos: [21.25, 0, -0.4], rotY: 0, count: 1, variant: 1, onlyIn: ZC },
];

export const PLACEMENTS = [...HOUSES, ...STREET, ...ZONES];
