# Feature Ideas

## 1. Bleeding System
**What**: Damage has a chance to cause bleeding. Higher burst damage (last 200ms) = higher bleed chance. Bleed ticks for small HP loss every ~5s until healed.

**Visual**: Blood particles squirting from player + blood decals on the ground that persist.

**My take**: This is a strong addition. It creates tension — you can't just tank a hit and keep going, you need to stop and bandage. It makes the existing bandage system more important since right now bandages are just "heal when low." With bleeding, there's a reason to heal even at 80 HP. The burst-damage-scaling mechanic is smart because it punishes standing in shotgunner fire or eating a sniper shot, while a single sprinter swipe is less likely to cause a bleed.

**Complexity**: Medium. Simulation-side is straightforward (add `bleedTimer` and `isBeeding` to Player, tick it down in `player.ts`). The visual is the harder part — a particle emitter attached to the player that spawns red droplets, plus ground decals that persist. Ground decals need a shader or projected texture approach since the floor is a flat plane.

**Suggestion**: Bandages should stop bleeding (they already exist and this gives them a second purpose). Maybe small bandage stops bleeding only, large bandage stops bleeding + heals. That makes the small/large distinction more meaningful.

---

## 2. Enemies Use Player Weapons + Loot Drops
**What**: Enemies carry the same weapon types the player can use. On death, they drop their gun. Player can loot it.

**My take**: This is the most impactful idea on the list for making extraction mode feel like a real extraction game. Right now enemies have hardcoded projectile stats in `enemies.json` that don't map to real weapons. Switching them to use actual weapon configs (pistol, SMG, etc.) would:
- Make enemy behavior more readable — "that's a guy with a shotgun" instead of "that's a shotgunner with arbitrary stats"
- Create a loot economy that makes progression emergent rather than shop-only
- Add tactical decisions (do I push that sniper to get the rifle?)

**On the loot question (swap vs. inventory)**:
I'd lean toward a simple **swap system** first — walk over a dropped gun, it replaces your current weapon, your old weapon drops. Reasons:
- Fits the pace of the game. Stopping to browse an inventory screen in a twin-stick shooter kills momentum.
- An inventory/looting UI is a huge amount of work (UI rendering, inventory state, drag-and-drop or selection) for a game that doesn't have any UI framework yet.
- Swap still creates the "what will I get?" excitement because you see the gun on the ground before you pick it up, and you have to decide whether it's worth trading your current weapon.

You could always add a two-weapon carry later (press a key to swap between primary/secondary) which gives some of the inventory feel without a full UI.

**Complexity**: High. Enemies need to reference WeaponConfig instead of inline stats. Enemy AI firing logic needs to handle reload, spread, and magazine. Drop entities need a new type in the simulation. Rendering needs gun models on the ground.

---

## 3. Environment / Level Art Improvements
**What**: Replace the flat arena with outdoor scenery — trees, terrain variation, more interesting visuals. Keep everything at the same height mechanically.

**My take**: Purely visual changes are the safest kind — they can't break game balance and they make a huge difference in feel. The simulation doesn't need to change at all since obstacles are already axis-aligned boxes. You can make a box look like anything in the renderer.

Good first steps:
- **Trees**: Render obstacles as tree trunks with canopy above (canopy fades when player is near). Some obstacles become rocks, some become trees.
- **Ground variation**: Grass texture with patches of dirt. Can be a simple shader on the ground plane.
- **Skybox/background**: Even a gradient sky instead of flat color helps a lot.
- **3D models**: GLTF models for obstacles would be the biggest visual upgrade. Free packs on itch.io / Kenney.nl for low-poly outdoor assets.

The extraction map's long corridor shape already suggests a path through somewhere — a forest clearing, a canyon, a ruined street. Leaning into that with art would give the mode a lot more identity.

**Complexity**: Low to medium depending on ambition. Swapping box meshes for loaded models is straightforward. A ground shader with noise-based grass/dirt is moderate. Full environment art is an ongoing effort.

---

## 4. Camera Direction (Look Toward Extraction)
**What**: Rotate the camera so the player faces toward the top of the screen (toward the extraction point) instead of the current fixed angle.

**My take**: Yes, do this. It's a small change with big gameplay impact. In extraction mode the player is almost always moving north (+Y). With the current camera angle, enemies approaching from ahead are at the top of the screen where they're harder to see and react to. Flipping the camera so "forward" is toward the top of the screen means:
- You see threats coming before they reach you
- The fog of war cone (which faces your aim direction, usually forward) reveals more useful area
- It matches the natural expectation from every top-down game

**Complexity**: Very low. In `camera.ts`, the camera offset is calculated from an angle. Rotating 180 degrees around the Y axis (or negating the Z offset) should do it. Maybe 15 minutes of work including testing.

**Suggestion**: Do this one first — it's the highest impact-to-effort ratio on this list by far.

---

## 5. More Weapon Variety
**What**: Add weapons with distinct characteristics beyond the current 5. Find sounds for them.

**My take**: The current weapons already cover the main archetypes (pistol, SMG, rifle, shotgun, LMG). New weapons should occupy genuinely different niches rather than being stat variations. Some ideas:

- **Burst rifle**: 3-round burst per trigger pull. Different feel from full-auto or semi-auto.
- **Revolver**: Very high damage, very slow fire rate, very small magazine (6), very fast reload. The "skill cannon."
- **Grenade launcher**: Fires a projectile that explodes on impact. Uses the existing grenade explosion system but as a weapon. Rare/expensive.
- **Dual pistols**: Two pistols, alternating fire, wider spread. Fun and distinct from SMG despite similar DPS.

For sounds: Freesound.org has CC0 gunshot samples. Layering a "punch" sound with a "tail" sound gives variety cheaply.

**Complexity**: Low per weapon (just a new entry in `weapons.json` plus maybe a new firing mode if needed). Sound integration depends on whether an audio system exists yet.

---

## Priority Recommendation

| # | Feature | Impact | Effort | Suggested Order |
|---|---------|--------|--------|-----------------|
| 4 | ~~Camera flip~~ | ~~High~~ | ~~Very Low~~ | **Done** (98e34a4) |
| 2 | Enemy weapons + drops | Very High | High | **Do second** (biggest gameplay addition) |
| 1 | Bleeding system | Medium | Medium | Third (adds depth to combat) |
| 5 | More weapons | Medium | Low each | Fourth (benefits from #2 being done) |
| 3 | Level art | High | Ongoing | Anytime / parallel effort |

### Partial Progress on #2 and #3

**3D Weapon Models + Enemy Facing** (1683e5c): Loaded FBX weapon models from Synty PolygonMilitary pack and attached them to both the player and ranged enemies (gunner→SMG, shotgunner→shotgun, sniper→sniper rifle). Enemies now track a `facingDir` and rotate to face their target. Player bullets replaced with tracer effects originating from the gun muzzle. This is foundational work for idea #2 (enemy weapons + drops) — enemies now visually carry weapons, the model loading/caching system is in place, and the `createWeaponMesh` function supports all weapon types including sniper.

The camera flip is a quick win. Enemy weapon drops are the meatiest feature and would transform how extraction mode plays. Bleeding adds tactical depth. New weapons benefit from the enemy-weapons system being in place. Level art is independent and can happen whenever.
