import { G } from '../../core/ctx.js';
// Registries for main-weapon and sub-weapon kinds that live in their own modules (src/game/kits/<kind>.js). Each kit
// module registers itself when imported (kits/index.js imports them all); the core systems look a kind up here after
// their built-in ones. Hooks are all optional unless marked.
//
// MAIN_KITS[kind] = {
//   update(runner, dt, inp, w)         REQUIRED — per-frame trigger handling (WeaponRunner.update's switch)
//   reset?(runner)                     runner state reset (spawn, death, loadout swap)
//   busy?(runner) / firingPose?(runner)  extend WeaponRunner.busy() / firingPose()
//   moveSpeed?(runner, w)              run speed override while using the weapon (0 / undefined = default)
//   spreadDeg?(runner, w)              current spread (feeds the reticle)
//   tick?(dt) / clear?()               module-owned world objects (projectiles, shields …): once per frame / on match reset
//   blockShot?(prev, pos, team, dmg) → bool   a shot segment prev→pos hits something this kit owns (e.g. a shield)
//   damageTaken?(runner, amount, attacker, source) → amount   scale damage the wielder takes (actor.damage; e.g. the mitts'
//                                      leap armour); ≤ 0 cancels the hit
//   jump?(runner, intent) → bool       claim this frame's jump press (actor.js; e.g. the mitts' leap). runner.kit.hang
//                                      (set by the kit) holds the kid in place (wall cling)
//   bot?: { fight?(brain, ctx) → bool fire, paint?(brain, ctx) → bool fire, paintPitch?, melee?, charges?, long?, painter?,
//           tactics?(brain, ctx)      every fight / retreat frame after the dodge block: owns fire, hold, swim and move
//           stayIn?(brain, ctx) → bool   veto the low-HP retreat (keep fighting when the kill is close)
//           targetBias?(brain, enemy) → number   added to that enemy's target score in _perceive }
//   shields?(out) → out                push a descriptor for every shield up this frame (bots.js flanks held ones and
//                                      steers round launched ones). Stable per shield; getters read live state:
//                                      { kind, held, team, owner, C (disc centre), N (facing / launched: travel dir), R,
//                                        hp, hpMax, live, blocksActors, left, and launched only: pos (foot), halfW (players
//                                        are held back over ±halfW along the wall), planeOff (the blocking plane sits
//                                        planeOff along N from pos), speed }
// }
// SUB_KITS[kind] = {
//   use(subs, actor, sub)              REQUIRED — the throw / placement on release (SubSystem.use)
//   hold?(runner, dt, inp, sub)        while the sub button is held (charge-up)
//   blocked?(actor, sub) → bool        refuse the throw ("Can't use" — e.g. one already out); emits 'sub:cantuse'
//   tick?(dt) / clear?()               module-owned objects
//   blockShot?(prev, pos, team, dmg) → bool   (shoot-able bombs)
//   blockRay?(from, dir, len, team, dmg) → dist   (charger beams vs shoot-able bombs)
//   damageArea?(c, radius, dmg, team)  a blast went off (G.subs.damageArea): kit objects of other teams caught in it
//   noArc?: true                       no bomb-arc preview while held (the kit draws its own aim guide)
//   bot?: { fight?(brain, dist) → bool throw now, paint?(brain) → bool }
//   threats?(out) → out                push a descriptor for every live object of this kind that hunts / hurts foes
//                                      (bots.js shoots them down or evades them). Stable per object; getters read live
//                                      state: { kind, obj, team, owner, pos (live: feet for walkers, centre for flyers),
//                                        aimY (hit centre above pos), vel, speed, radius (blast), trigger (contact reach),
//                                        ground (walks on the ground), live, state, hp, shootable, locked, target (the
//                                        actor it tracks, or null) } + kind extras (waddle: senseRadius, left;
//                                        torpedo: lockRange, hover)
// }
//
// Online (src/net/netmatch.js), any kit:
//   ghost?(actor, data)                a remote player's world object, from the owner's G.netm.recKit(actor, kind, data)
//                                      (data: a short array of rounded numbers): build a visual copy — it never paints
//                                      (netmatch mutes paint while ghost() runs; the kit keeps muting in its own tick for
//                                      ghost objects) and never hurts (a remote attacker's hits are dropped). Shields /
//                                      curtains stay solid (they block the local player's shots like the owner's do).
//   netHurt?(id, dmg)                  the owner's side of a device hit made on another screen (registry netHurt)
//   MAIN_KITS only: netState?(runner) → int   the pose / state bits other screens need (packed each tick)
//                   netApply?(runner, bits, dt)   a remote runner: rebuild runner.kit from those bits
// KIT_GHOSTS[kind] = { ghost } — ghost-only entries for things that aren't a main or sub kit (e.g. a special's objects)
export const MAIN_KITS = {};
export const SUB_KITS = {};
export const KIT_GHOSTS = {};
// the local owner records a spawn for the other players (no-op offline / for remote actors)
export function netRec(actor, kind, data) { G.netm?.recKit?.(actor, kind, data); }
// a network id for an owner's world object (its ghosts carry the same id): owner nid × 1e5 + a per-session sequence
let _seq = 0;
export function netId(owner) { return owner && owner.nid !== undefined ? owner.nid * 100000 + (++_seq % 100000) : 0; }
// a non-owner damaged a ghost device (a remote player's sprinkler, curtain, waddle …): the owner's copy takes it.
// (kind: 'subs' for SubSystem items, else the kit kind — its netHurt(id, dmg) applies it on the owner's screen)
export function netHurt(owner, kind, id, dmg) { if (id && dmg > 0) G.netm?.sendDevHit?.(owner, kind, id, dmg); }
// run fn with paint muted when obj is a ghost (a remote player's copy): its splats are the owner's to send
// true while a ghost (a remote player's replayed shot / bomb / sub) is being simulated: its damage to devices counts for
// nothing here — the owner's own copy hits our ghost of the device and that hit arrives by netHurt
export function netMuted() { return (G.netm?.mute | 0) > 0; }
export function ghostMute(obj, fn) {
  const nm = obj && obj.ghost ? G.netm : null;
  if (nm) nm.mute++;
  try { return fn(); } finally { if (nm) nm.mute--; }
}
