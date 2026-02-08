# Twin-Stick Shooter Gunplay Research

## Games Researched
- Escape from Duckov (top-down extraction shooter)
- Synthetik / Synthetik 2 (top-down roguelike shooter)
- Hades / Hades 2 (isometric action roguelike)

---

## Escape from Duckov

### Overview
Top-down PvE extraction shooter parodying Escape from Tarkov. 95%+ positive Steam reviews, 500K+ copies sold. Duck-themed but with genuinely deep combat systems.

### Hitscan vs Projectile
**Confirmed projectile-based.** Every weapon has a **Bullet Speed** stat in m/s (Glock = 68, MK-47 = 126 — deliberately much slower than real life). Bullets are physical projectiles with travel time. Players can dodge-roll through bullets, and enemies lead their shots to predict movement. At least one weapon (anti-materiel sniper) is explicitly hitscan as a special exception.

Key evidence: Players describe *"he predicts your movement so unless you change movement direction/velocity during the travel time of the bullet, it'll hit you"* and *"If you try to reaction dodge the bullet projectile, it travels too fast and catches you in the startup frames."*

### Headshots in Top-Down (Two-Part Check)
Headshots use a **hybrid system** confirmed by Steam community member Banana Bob: **"Crosshair has to be on head (at time of click) + bullet hits = headshot / critical hit."**

Two conditions must BOTH be true:
1. Cursor was on the enemy's head area when the player clicked (checked at fire time)
2. The bullet physically connects with the enemy (checked at collision time)

If cursor was on head but bullet misses (enemy moved), no headshot. If bullet hits but cursor wasn't on head, body shot.

Additional details:
- The player's crosshair must be positioned **over the enemy's head area** (the top of the sprite) when firing
- If the crosshair is aligned to the target's head AND the shot connects, it counts as a headshot
- **Crimson (red) hit indicator** confirms headshots, distinct from body hit indicators
- Guides recommend aiming "slightly above ocular regions" for an error buffer
- Post-shot recoil does NOT retroactively affect whether a shot was a headshot

**Critical damage multipliers vary per weapon:**
| Weapon | Crit Multiplier |
|--------|----------------|
| AK-47/AK-103 | 1.45x |
| SV98 sniper | 2.7x |
| M700 sniper | 2.55x |
| Glock | 1.2x |
| MP7 | 1.1x |

### Aiming / Cursor-to-World Mapping
- WASD controls movement independently of aim direction
- Mouse cursor controls aim direction — character faces toward cursor
- Right-click enters ADS: reduces movement speed, tightens spread cone, takes time to "focus" (crosshair goes blurry to sharp)
- Camera shifts in cursor direction, giving more vision ahead of where you're aiming
- Keyboard-only (no controller support) because devs say aiming wouldn't work on gamepad

### FOV / Line of Sight System
- Forward-facing **vision cone** (FOV stat controls width)
- **Cannot see enemies** behind walls or outside vision cone
- **Perception stat** provides 360-degree awareness radius (~3m baseline), detects enemies through walls
- **Visual range stat** controls how far within your cone you can spot enemies
- Creates tension: you must physically turn to see things, enemies approach from blind spots

### Armor System
**Formula:** `damage_coefficient = 2 / (max(armor - penetration, 0) + 2)`

| Armor - Penetration | Damage Multiplier | Reduction |
|---------------------|-------------------|-----------|
| 0 or less | 1.0x | 0% |
| 1 | 0.67x | 33% |
| 2 | 0.5x | 50% |
| 3 | 0.4x | 60% |
| 4 | 0.33x | 67% |

**Equipment:** Body armor (armor rating + bonus inventory slots) and Helmet (head armor). Armor ratings T0 to T5+ with fractional values.

**Ammo penetration tiers:**
- Rusty: -1 penetration
- Standard: 1 penetration
- AP: 3 penetration
- Advanced AP: 5 penetration
- Special variants: varying pen + 1.1-1.4x damage multipliers

AP ammo deals same base damage as standard — only adds penetration. Against unarmored targets, no reason to use expensive AP.

### Accuracy / Spread Mechanics
**Spread:** Hip-fire ranges from ~6 (accurate) to 80 (wild). ADS generally 50-80% tighter via an aiming coefficient (0.4-0.6).

**Recoil:** Vertical pushes crosshair away from character. Horizontal causes left-right drift. Both are separate stats modified by attachments.

**Attachments:** Grip (horizontal recoil), Laser sight (hip-fire spread), Stock (ADS spread), Scope (magnification), Muzzle (range, sound, recoil).

**Range:** Binary falloff — within half weapon's range stat = 1.0x damage; beyond = 0.5x damage.

**Full damage formula:**
```
Final damage = Weapon damage
  × Ammo damage coefficient
  × Character attack correction
  × (1 / bullets per shot)
  × Range correction
  × Critical damage multiplier
  × Difficulty correction
  × Armor correction
  × Attribute compatibility
```

### What Makes Combat Satisfying (Reviews)
- "Heads pop in a satisfying way" — strong headshot feedback
- Distinct hit indicators (crimson for headshots)
- AI uses cover, flanks, presents genuine challenge
- Melee enemies telegraph with red flash for dodge-roll windows
- High lethality both directions — you kill fast AND die fast
- FOV cone + line of sight forces positioning awareness
- Each weapon genuinely feels different due to stat combinations

---

## Synthetik

### Overview
Top-down roguelike shooter known for exceptionally deep gunplay. Claims to be the first top-down shooter to implement headshots.

### Hitscan vs Projectile
**Confirmed projectile-based** (with rare beam/lightning hitscan exceptions). Every ammo type has an explicit **Travel Speed** stat. The wiki documents: *"The travel speed is (the default ammo speed value × 60)/sec."* Speeds range from 900 (flame) to 24,000 (railgun) in game units. Synthetik 2 also adds bullet **acceleration**.

Community guide confirms: *"Bullets are slow, you can dodge most of the non-shotgun attacks without need for cover given a little space."* The Haste difficulty modifier makes *"all projectiles fly faster"* (~50% faster). Beam weapons are the only true hitscan: *"fire instantly hitting ammo that can't pierce."*

Bullets support penetration, ricochet/deflection, damage falloff over distance, and homing — all requiring physical projectile objects.

### Magazine Ejection, Active Reload, and Jams
Multi-step manual reload:
1. **Eject Magazine (E key):** Remaining bullets are LOST. Tactical decision: reload early and waste ammo, or fire until empty?
2. **Insert New Magazine (R/Space):** Between ejection and insertion, can switch ammo types
3. **Active Reload (R/Space again):** Time the button press within the "active reload zone" for stat bonuses (accuracy, damage, fire rate). "Haste" modifier adds a secondary sweet spot for even stronger bonuses

**Gun Jamming:** Weapons jam randomly during firing. Must mash reload button to clear. Successfully clearing instantly reloads, saves remaining bullets, grants weapon mastery bonus.

### Headshots
- Enemies have a **head hitbox** slightly above visual center of head ("a pixel or two north of center")
- Whether you score a headshot depends on where the bullet physically lands on the enemy sprite
- **Angle matters:** Easier to headshot enemies when shooting downward at them
- **Cursor-on-target bonus:** Crosshair placed directly over an enemy shrinks, increasing accuracy and headshot probability

### Locational Damage and Armor
- **Rear Armor (Synthetik 2):** Attacking from behind bypasses/reduces armor
- **Deflection/Ricochets:** Bullets can deflect off heavily armored targets if armor exceeds penetration. Deflected bullets deal 75% reduced damage but can hit other enemies
- **Critical Hits vs. Headshots:** Separate systems. Crits influenced by cursor placement; headshots by physical bullet location

### Accuracy, Recoil, and Spread
**Four separate stats:**
- **Accuracy:** Outer boundary cone size. Higher = narrower cone
- **Deviation:** Scatter within the cone. Increases with sustained fire, resets on trigger release
- **Recoil:** Rate of accuracy loss from continued fire. Visible cursor kickback + screen shake
- **Control:** Recovery speed from recoil

**Movement effects:**
- Moving dramatically increases reticle size
- Standing still improves accuracy
- Optimal technique: **stutter-stepping** (pausing briefly to tighten reticle before firing)

**Cursor-on-target:** Reticle hovering directly over enemy **shrinks further**, granting improved accuracy + increased crit/headshot probability. Precise aim is rewarded with more precision.

### What Makes Guns Feel Different
- 98 base weapons × 23 variants each
- Distinct weapon categories with different playstyles
- Multiple ammo technologies: Ballistic, Laser (stronger with heat), Plasma (ammo regen, armor-ignoring), S-Lightning (chain damage)
- Heat system: most weapons penalized by heat, but laser weapons benefit from it
- Weapon perks: "Inverted Recoil" (more accurate as you keep shooting), "Better With Time" (stats improve over run)
- 4 attachment slots per weapon

### Game Feel / Juice
Developers' stated goal: "make the weapons feel the most impactful as possible"
- Screen shake on firing
- Muzzle flash with "Firing Screen Flash" option
- Recoil screen jerk — camera physically kicks per shot
- Hit stagger on both player and enemies
- "Bullet weight" — reviewers describe "a weight to everything"
- Punchy, loud weapon sounds

### Aiming with Isometric Camera
- "Fully designed for Mouse and Keyboard" — devs put extensive effort into "the perfect mouse aiming"
- Cursor/crosshair projected on game world, character aims toward it
- Dynamic reticle: expands when moving, shrinks when still, shrinks further on enemy
- Distance to cursor affects hit probability
- Deliberately "unlearns" twin-stick habits: rewards stop-and-shoot, trigger discipline, precise cursor placement
- Plays more like "a real-time X-COM" than typical twin-stick shooter

---

## Hades / Hades 2

### Overview
Isometric action roguelike by Supergiant Games. Not technically a twin-stick shooter — attack direction is tied to movement on controller. Extremely polished combat feel.

### Ranged Combat
**All ranged attacks are projectile-based, not hitscan.**

**Heart-Seeking Bow:** Charge-and-release. Damage scales 20 (uncharged) → 60 (full) → 70 (Power Shot timing window). Arrows are real projectiles with travel time.

**Adamant Rail:** Automatic rapid-fire, 10 damage/shot. Player is immobile while firing — key risk/reward tradeoff. Magazine system with auto-reload, dash-reload, or manual reload.

**Cast:** Slow long-range projectile (50 damage). Ammo-limited (3 bloodstones). Lodges in enemies for 15s, enabling status effects. God boons completely transform the projectile type.

### Aiming with Isometric Camera
- **Mouse/keyboard:** Cursor position on isometric plane determines attack direction. Independent of movement direction.
- **Controller:** Attack direction tied to movement direction (NOT twin-stick). Aim assist auto-targets nearest enemy.
- Many attacks have wide arcs, cones, or AoE to compensate for inherent imprecision of isometric aiming
- Encounter design accommodates coarse directional control

### What Makes Combat Feel Good
**Responsive controls:**
- Near-zero input latency
- Generous dash iframes for weaving through attacks
- Dash-attacks chain movement into offense seamlessly
- Animation canceling enables repositioning during attacks

**Impact feedback trifecta:**
- **Hitstop** (2-4 frame freeze on significant hits, scaled to magnitude)
- **Screen shake** (scaled to hit magnitude, toggleable)
- **Audio punch** (distinct per weapon/damage type, carries feedback when visuals can't)

**Mechanical knockback:**
- Wall slams deal bonus damage
- Body slams when knocked enemies collide
- Knockback is a core damage mechanic, not just visual juice

**Visual clarity:**
- Color-coded per god (Zeus=yellow, Poseidon=blue, Ares=red, etc.)
- Bold, confident VFX over detailed VFX
- Room-clear slow-motion punctuates encounters
- Damage numbers for numerical confirmation

**Design philosophy:** "Immediate and impactful, visceral and satisfying" with "bold, confident execution" — art serves gameplay clarity first.

---

## Comparative Summary

| Feature | Hades (Arcade) | Duckov (Tactical) | Synthetik (Sim-lite) |
|---------|---------------|-------------------|---------------------|
| Aiming precision | Generous hitboxes, aim assist | Cursor on head = headshot | Cursor-on-target shrinks reticle |
| Reloading | Auto/simple | Standard reload | 3-step manual (eject → insert → active reload) |
| Movement while shooting | Dash-attacks encouraged | ADS = slow, hip-fire = mobile | Moving balloons reticle |
| Accuracy model | Fixed per weapon | Spread + recoil + ADS focus | Accuracy + deviation + recoil + control |
| Core feel | Movement IS combat | Positioning + lethality | Trigger discipline + weapon mastery |

## Key Mechanics Worth Considering

### 1. Dynamic Crosshair (Synthetik)
Reticle visually reflects current accuracy state — expands when moving, shrinks when still, shrinks further on enemy hover. Single biggest contributor to gun feel in top-down.

### 2. Spread vs Recoil as Separate Systems (Duckov + Synthetik)
- **Spread** = random bullet deviation (wider cone)
- **Recoil** = deterministic crosshair drift per shot
- **Deviation** (Synthetik) = scatter within cone, increases with sustained fire

### 3. Movement Accuracy Penalty (Synthetik)
Breaks circle-strafe-while-holding-fire degenerate strategy. Forces stutter-stepping.

### 4. Armor Penetration Formula (Duckov)
`2 / (max(armor - pen, 0) + 2)` — simple, no lookup tables, diminishing returns built in.

### 5. Impact Feedback Trifecta (Hades)
Hitstop + screen shake + audio punch. Even tiny amounts sell weight.

### 6. ADS / Focus Time (Duckov)
Risk/reward: stand still for precision or stay mobile with worse accuracy.

### 7. Headshots via Sprite Hitbox Zones (Duckov + Synthetik)
Head is a smaller hitbox region on the 2D enemy. Bullets that collide with it get a damage multiplier. No 3D height calculations needed.
