# Inventory System Spec — Escape from Knockov

## Overview

A Tarkov-lite inventory and looting system. Players carry equipment and a backpack into raids, loot items from bodies and crates by pressing F, and manage gear between raids at a 3D home base with persistent storage.

---

## 1. Item System

### Item Definition

Every item in the game is defined by an `ItemDef` in a central item registry:

```ts
interface ItemDef {
  id: string;              // e.g. "pistol", "bandage_small", "metal_plate"
  name: string;            // Display name
  category: ItemCategory;
  icon: string;            // Path to icon texture/sprite
  stackable: boolean;      // Can multiple stack in one slot?
  maxStack: number;        // Max per slot (1 for non-stackable)
  sellValue: number;       // Cash value when sold to shop
  description: string;     // Tooltip text
}

type ItemCategory =
  | 'weapon'
  | 'armor'
  | 'helmet'
  | 'ammo'
  | 'medical'
  | 'grenade'
  | 'valuable'    // Sell-only items (cash, gems, etc.)
  | 'material';   // Crafting/trade materials
```

### Item Instance

Items in inventories are instances with potential state:

```ts
interface ItemInstance {
  defId: string;           // References ItemDef.id
  quantity: number;         // 1 for non-stackable, N for stackable
  // Weapon-specific state
  currentAmmo?: number;    // Rounds in magazine
  upgradeLevel?: number;   // Weapon upgrade tier
  // Armor-specific state
  currentHp?: number;      // Remaining durability
}
```

### Item Categories & Examples

| Category | Examples | Stackable | Notes |
|----------|----------|-----------|-------|
| weapon | pistol, smg, rifle, shotgun, machinegun | No | Carried in weapon slots. Has ammo state. |
| armor | light_armor, medium_armor, heavy_armor | No | Equipped in armor slot. Has durability. |
| helmet | basic_helmet, military_helmet | No | Equipped in helmet slot. Has durability. |
| ammo | 9mm, 5.56, 12gauge, 7.62 | Yes (60) | Consumed when reloading. Weapon-specific types. |
| medical | bandage_small, bandage_large, medkit, painkillers | Yes (3) | Bandages heal over time. Medkits instant. Painkillers give temp buff. |
| grenade | frag_grenade, flashbang, smoke | Yes (3) | Throwable. Current grenade system wraps into this. |
| valuable | cash_stack, gold_chain, circuit_board | Yes (varies) | Sell to shop for cash. No in-raid use. |
| material | metal_plate, bolt, nut, duct_tape | Yes (10) | Future crafting. For now, sell value only. |

---

## 2. Inventory System

### Player Inventory Structure

The player has three inventory regions:

```
┌─────────────────────────────┐
│         EQUIPMENT           │
│  [Weapon 1] [Weapon 2]     │  ← 2 weapon slots (keys 1, 2)
│  [Armor]    [Helmet]        │  ← 1 armor slot, 1 helmet slot
├─────────────────────────────┤
│          HOTBAR             │
│  [3] [4] [5] [6] [7]       │  ← 5 quick-use slots
├─────────────────────────────┤
│         BACKPACK            │
│  ┌──┬──┬──┬──┬──┐          │
│  │  │  │  │  │  │  5 cols  │
│  ├──┼──┼──┼──┼──┤          │
│  │  │  │  │  │  │  4 rows  │
│  ├──┼──┼──┼──┼──┤          │
│  │  │  │  │  │  │          │
│  ├──┼──┼──┼──┼──┤          │
│  │  │  │  │  │  │          │
│  └──┴──┴──┴──┴──┘          │
│  20 slots (default)         │
└─────────────────────────────┘
```

### Equipment Slots

| Slot | Accepts | Key | Behavior |
|------|---------|-----|----------|
| Weapon 1 (Primary) | weapon | 1 | Active weapon. Press 1 to switch to this. |
| Weapon 2 (Secondary) | weapon | 2 | Press 2 to switch to this weapon. |
| Armor | armor | — | Passive damage reduction. |
| Helmet | helmet | — | Headshot damage reduction. |

### Hotbar Slots (3–7)

- 5 slots bound to keys 3, 4, 5, 6, 7
- Can hold any usable item: medical, grenade
- Using a hotbar slot consumes 1 of that item from the backpack
- The hotbar slot is an *assignment* — it points to an item type in your backpack
- When backpack runs out of that item, the hotbar slot shows empty/grayed
- Drag items from backpack to hotbar to assign

### Backpack

- Default: 5 columns x 4 rows = 20 slots
- All items are 1x1 (one slot each)
- Stackable items share a slot up to `maxStack`
- Backpack size is a config value (not hardcoded), anticipating future upgradeable backpacks
- Items beyond capacity cannot be picked up — player must drop/swap something

### Data Model

```ts
interface PlayerInventory {
  equipment: {
    weapon1: ItemInstance | null;
    weapon2: ItemInstance | null;
    armor: ItemInstance | null;
    helmet: ItemInstance | null;
  };
  hotbar: (string | null)[];     // Array of 5 defId references (what item type is assigned)
  backpack: (ItemInstance | null)[];  // Flat array, length = backpackSize
  backpackSize: number;          // Default 20, configurable
}
```

---

## 3. Weapon System Changes

### Dual Weapon Carry

- Player carries up to 2 weapons in equipment slots
- Press `1` to switch to weapon 1, `2` to switch to weapon 2
- Weapon switching has a short swap delay (configurable, ~0.3s / 18 ticks)
- Cannot fire during swap animation
- If only one weapon equipped, the other key does nothing

### Ammo System

- Each weapon type uses a specific ammo type (e.g., pistol → 9mm, rifle → 5.56)
- Ammo is stored in the backpack as stackable items
- Reloading pulls ammo from backpack into the weapon's magazine
- If backpack has no matching ammo, cannot reload
- Current magazine ammo is stored on the weapon's `ItemInstance.currentAmmo`
- Weapon ammo type mapping defined in weapon configs

### Migration from Current System

The current system tracks `player.ammo` as a simple counter and `player.activeWeapon` as a type. This becomes:
- `player.activeWeaponSlot`: 1 or 2 (which equipment slot is active)
- Ammo comes from backpack inventory
- Weapon stats come from the equipped `ItemInstance`'s def + upgradeLevel

---

## 4. Loot System

### Lootable Containers

When an enemy dies or a destructible crate is broken, it becomes a **lootable container** in the world:

```ts
interface LootContainer {
  id: number;
  pos: Vec2;
  containerType: 'body' | 'crate' | 'stash';
  lootTable: string;       // References a loot table for generating contents
  items: (ItemInstance | null)[];   // Slot array (size varies by container)
  capacity: number;
  searched: boolean;        // Has this been searched yet?
  searchProgress: number;   // 0 to capacity — how many slots revealed
  despawnTimer?: number;    // Bodies/crates disappear after a while
}
```

### Container Types & Sizes

| Type | Slots | Source | Despawn |
|------|-------|--------|---------|
| body | 6–10 | Dead enemy | 120 seconds |
| crate | 4–8 | Destructible crate | Never (placed on map) |
| stash | 8–12 | Hidden spots on map | Never |

### Loot Tables

Each container references a loot table that defines what can spawn:

```ts
interface LootTable {
  id: string;
  slots: number;           // How many item slots
  entries: LootEntry[];
}

interface LootEntry {
  defId: string;           // Item def ID
  weight: number;          // Relative spawn chance
  quantityMin: number;     // Stack range
  quantityMax: number;
}
```

Different enemy types and crate tiers reference different loot tables (e.g., `"enemy_sprinter"` has low-value loot, `"crate_tier3"` has better weapons/armor).

### Loot Interaction Flow

1. Player walks near a lootable container (within interaction radius, ~1.5 units)
2. A prompt appears: **"Press F to search"**
3. Player presses F → inventory UI opens
   - **Left side**: Player's inventory (equipment + backpack)
   - **Right side**: Container's loot slots
4. If container has NOT been searched yet (`searched === false`):
   - All container slots show as `[?]` (undiscovered)
   - Search begins automatically when UI opens
   - Every ~0.5–1 second, one slot reveals its contents (or reveals as empty)
   - Revealed items can be grabbed immediately, even while search continues
   - Player can close UI mid-search; progress is saved on the container
   - Reopening resumes from where it left off
5. If container HAS been fully searched:
   - All items show immediately on reopen
6. Player drags items from container → backpack (or equipment slots)
7. Closing the UI (Escape or F again) returns to gameplay

### Search Timing

- Base search time per slot: configurable (default ~0.8 seconds / 48 ticks)
- Total search time for a 8-slot crate: ~6.4 seconds
- Search only progresses while the UI is open (pauses when closed)
- In the future, perks could speed up search time

### Interaction During Looting

- While the loot UI is open, the game world continues (NOT paused)
- Player cannot move or shoot while looting
- Player can take damage from enemies while looting
- Taking damage closes the loot UI automatically (interrupted)
- This creates the core tension: do you loot now or clear threats first?

---

## 5. Hotbar & Quick-Use

### Hotbar Layout

```
[3] [4] [5] [6] [7]
```

- Each slot is bound to a number key
- Drag consumables (medical, grenades) from backpack to a hotbar slot to assign
- Pressing the key uses one of that item from backpack
- Visual: shows item icon + remaining count from backpack
- Empty/depleted slots show as dark/grayed out

### Use Actions

| Item Type | Use Action |
|-----------|------------|
| bandage_small | Start healing (current bandage system, 1.5s) |
| bandage_large | Start healing (current bandage system, 3s) |
| medkit | Instant heal to full, 4s use time |
| painkillers | Temp speed boost + damage resist, 1s use time |
| frag_grenade | Enter grenade charge (current system) |
| flashbang | Throw, blinds enemies in radius |
| smoke | Throw, creates vision-blocking cloud |

### Migration

Current keys 4 and 5 (small/large bandage) become hotbar keys 4 and 5. The grenade key G can remain as an alias for whichever hotbar slot has a grenade, or the player assigns grenades to a hotbar slot manually.

---

## 6. Home Base (3D Level)

### Layout

A small 3D room that replaces the current hub screen:

```
┌──────────────────────────────────┐
│                                  │
│   [Storage Crate]                │
│       ↑ Press F to manage        │
│       ↑ stash inventory          │
│                                  │
│              [Player]            │
│              spawns here         │
│                                  │
│   [Shop Terminal / NPC]          │
│       ↑ Press F to open shop     │
│                                  │
│                    ══════════    │
│                    RAID DOOR     │
│                    Walk into     │
│                    to deploy     │
└──────────────────────────────────┘
```

### Interactions

| Object | Action | Result |
|--------|--------|--------|
| Storage Crate | Press F | Opens stash UI (player inventory ↔ stash transfer) |
| Shop Terminal | Press F | Opens shop UI (buy/sell items with cash) |
| Raid Door | Walk into | Starts extraction raid with current loadout |

### Player in Home Base

- Player moves with WASD in the room (same movement as raid, but no enemies)
- Camera follows player, same isometric view
- No combat, no enemies
- Same player model with currently equipped gear visible

### Stash (Persistent Storage)

```ts
interface Stash {
  items: (ItemInstance | null)[];
  capacity: number;          // Default: 50 slots (configurable)
}
```

- Persists in localStorage across sessions
- Transfer items freely between player inventory and stash
- Same drag-and-drop UI as loot screen, but left = player, right = stash
- Stash is safe — items here never lost

### Shop

- Buy items with cash (cash is a valuable item, converted to currency at shop)
- Sell items for their `sellValue`
- Available shop items configurable (same items as current shop: weapons, armor, bandages, ammo)
- Weapon upgrades also available at shop
- Shop stock could be limited or unlimited (start with unlimited for simplicity)

### Raid Deployment

- Walk into the raid door zone to trigger raid start
- Game checks your loadout: warns if no weapon equipped
- Transition to extraction map with your current inventory

---

## 7. Raid Flow (Updated)

### Start of Raid

- Player spawns in extraction map with their full inventory (equipment + backpack contents)
- Hotbar assignments carry over from home base
- Weapon 1 is active by default

### During Raid

- Kill enemies → their body becomes a lootable container (stays for despawn time)
- Destroy crates → becomes lootable container
- Find stashes placed on map → lootable container
- Press F near containers to loot
- Use hotbar items (3–7) for consumables
- Switch weapons (1, 2)
- Standard combat: move, shoot, dodge, reload

### Enemy Deaths (Changed)

Currently enemies drop cash/crates that auto-pickup. New behavior:
- Enemy dies → body stays at death position as a lootable container
- Body contains items from the enemy's loot table
- Cash is an item in the loot table (cash_stack, valuable category)
- No more auto-pickup of anything from enemies
- Health/grenade crates no longer spawn from enemy kills

### Extraction (Success)

- Reach extraction zone → raid ends
- Everything in your inventory (equipment + backpack) is kept
- Return to home base with all your loot
- Transfer valuables to stash, sell at shop, prepare for next raid

### Death (Failure)

- Die in raid → lose EVERYTHING on your person
  - All equipped weapons, armor, helmet
  - All backpack contents
  - All hotbar consumables
- Stash at home base is safe
- Player respawns at home base with empty inventory
- Must re-equip from stash or buy new gear from shop

---

## 8. Inventory UI Design

### Loot Screen (In-Raid)

Overlaid on the game world (game continues underneath, not paused):

```
┌─────────── YOUR INVENTORY ──────────┐  ┌──────── LOOT ────────┐
│  Equipment                          │  │  Container Name       │
│  [W1: Rifle] [W2: Pistol]          │  │  (3/8 searched)       │
│  [Armor: Medium] [Helmet: Basic]    │  │                       │
│                                     │  │  [Butcher Knife] [?]  │
│  Backpack (14/20)                   │  │  [Wood x3]  [?]       │
│  ┌──┬──┬──┬──┬──┐                  │  │  [Bandage]   [?]      │
│  │9m│9m│5.│AP│  │                  │  │  [?]         [?]      │
│  ├──┼──┼──┼──┼──┤                  │  │                       │
│  │Dy│Gr│Gr│Me│FA│                  │  │                       │
│  ├──┼──┼──┼──┼──┤                  │  │                       │
│  │MP│Bo│Nu│Ca│  │                  │  └───────────────────────┘
│  ├──┼──┼──┼──┼──┤                  │
│  │  │  │  │  │  │                  │
│  └──┴──┴──┴──┴──┘                  │
│                                     │
│  Hotbar                             │
│  [3:Medkit] [4:Bandage] [5:Grenade] │
│  [6:empty]  [7:empty]              │
└─────────────────────────────────────┘
```

### Stash Screen (Home Base)

Similar layout but with stash on right instead of loot:

```
┌─────── YOUR INVENTORY ──────┐  ┌──────── STASH ────────────┐
│  (same as loot screen)       │  │  Storage (23/50)           │
│                              │  │  ┌──┬──┬──┬──┬──┐         │
│                              │  │  │  │  │  │  │  │  5 cols │
│                              │  │  ├──┼──┼──┼──┼──┤         │
│                              │  │  │  │  │  │  │  │ 10 rows │
│                              │  │  │...               ...│   │
│                              │  │  └──┴──┴──┴──┴──┘         │
└──────────────────────────────┘  └────────────────────────────┘
```

### Drag and Drop

- Click an item to pick it up (attaches to cursor)
- Click a valid slot to place it
- If target slot is occupied by same stackable item, merge stacks
- If target slot is occupied by different item, swap them
- Right-click an item for context menu: Use, Drop, Split Stack
- Drag to equipment slot: only accepts matching category
- Invalid placements snap the item back to its origin

### Loot Slot Visual States

Reference: Escape from Duckov loot panel. Each slot in a loot container has one of four visual states:

| State | Visual | Description |
|-------|--------|-------------|
| **Revealed** | Item icon + truncated name below | Search has reached this slot and found an item. Fully interactive — can drag to inventory. |
| **Searching** | Diagonal stripe/hatched pattern + magnifying glass icon | This is the slot currently being searched. Animated stripes. |
| **Unsearched** | Diagonal stripe/hatched pattern (no icon) | Search hasn't reached this slot yet. Cannot interact. |
| **Empty** | Plain outlined rounded-rect, no fill | Either the slot is empty, or search hasn't reached it and it will end up empty. Unreached empty slots look identical to reached empty slots once search passes them. |

The loot panel header shows `"Loot (N/M)"` where N = items found so far, M = total slots. A progress bar beneath the header fills as search progresses through slots left-to-right, top-to-bottom.

### General Visual Feedback

- Item icons with quantity badge (top-right corner for stacks)
- Equipment slot outlines showing accepted type
- Hover tooltip: item name, description, stats
- Full backpack: red tint on backpack header
- Semi-transparent dark panel backgrounds (game world visible underneath)
- Rounded corners on all slots and panels
- Weight bar at bottom (future, when weight system is added)

---

## 9. Persistence

### Save Data (Updated)

```ts
interface SaveData {
  // Existing
  cashStash: number;           // Deprecated → cash becomes an item in stash
  weaponUpgrades: Record<string, number>;  // Keep as separate tracking

  // New
  playerInventory: PlayerInventory;   // What's on the player
  stash: Stash;                       // Home base storage
  hotbarAssignments: (string | null)[]; // 5 hotbar slot assignments
}
```

### Save Points

- Auto-save when leaving stash/shop UI
- Auto-save when returning from raid (extraction success)
- On death: clear player inventory, save stash (unchanged)

---

## 10. Config Values

New config file: `inventory.json`

```json
{
  "backpackSize": 20,
  "backpackColumns": 5,
  "stashSize": 50,
  "stashColumns": 5,
  "hotbarSlots": 5,
  "hotbarStartKey": 3,
  "searchTimePerSlot": 48,
  "lootInteractionRadius": 1.5,
  "bodyDespawnTime": 7200,
  "weaponSwapTicks": 18,
  "lootUIClosesOnDamage": true
}
```

---

## 11. Implementation Phases

### Phase 1: Core Item & Inventory Data Model — DONE
- Define `ItemDef`, `ItemInstance`, `PlayerInventory`, `Stash` types
- Create item registry with all item definitions
- Create inventory manipulation functions (add, remove, move, swap, stack)
- Migrate current weapon/armor/bandage data to new item system
- Update persistence layer

### Phase 2: Inventory UI — DONE
- Build the inventory grid UI (HTML/CSS overlay)
- Implement drag-and-drop between slots
- Equipment slot rendering with type validation
- Backpack grid with item icons and stack counts
- Hotbar display at bottom of screen during gameplay
- Tooltip system for item hover info
- Right-click context menu (Equip, Unequip, Split Stack, Drop; Use stubbed for Phase 4)
- Stash screen (two-panel transfer UI, accessible from hub via "Manage Stash" button)

**Implementation notes:**
- Stash is currently accessed from the 2D hub screen rather than a 3D home base (deferred to Phase 5)
- `splitStack()` helper added to `src/simulation/inventory.ts`
- Shared rendering helpers exported from `inventory-screen.ts` for reuse by stash screen

### Phase 3: Loot System — DONE
- Loot container entity in simulation (bodies, crates)
- Loot table definitions and random generation
- "Press F" interaction prompt when near containers
- Search/reveal mechanic (progressive slot reveal, items only)
- Loot UI (player inventory + container side-by-side)
- Enemy death → lootable body instead of auto-drops
- Destructible crates replaced with loot containers in extraction mode
- Remove old crate/cash auto-pickup system in extraction mode (arena unchanged)

**Implementation notes:**
- Items are packed left-to-right, top-to-bottom in containers (no gaps)
- Progressive reveal only animates through item-bearing slots; trailing empty slots shown as plain empty
- Destructible crates no longer exist in extraction mode — crate positions spawn as loot containers directly at level start
- Taking damage while looting closes the loot UI
- Body containers despawn after configurable timeout (default 120s); crate containers never despawn
- `lootColumns` config controls the loot panel grid width (default 2)

### Phase 4: Weapon & Combat Updates
- Dual weapon slots (keys 1, 2)
- Weapon swap mechanic with delay
- Ammo-from-backpack reload system
- Hotbar quick-use (keys 3–7) replacing current bandage/grenade keys
- Migrate grenade system to inventory-based
- Wire up "Use" context menu action (currently stubbed)

### Phase 5: Home Base
- Simple 3D room level (floor, walls, objects)
- Player movement in home base
- Storage crate interaction (F to open stash UI)
- Shop terminal interaction (buy/sell UI)
- Raid door trigger zone
- Replace current hub screen with home base
- Transition flow: home base → raid → home base

### Phase 6: Polish & Balance
- Loot table balancing across enemy types and crate tiers
- Item sell values and shop prices
- Search time tuning
- UI animations (item reveal shimmer, drag feedback)
- Sound effects for inventory actions
- Body/crate despawn visual (fade out)

---

## Open Questions / Future Considerations

- **Secure containers**: A small pouch (2-3 slots) that keeps items on death? Common in extraction shooters.
- **Backpack upgrades**: Different backpack tiers with more slots. Data model supports this already.
- **Weight system**: Could be layered on top of slots later.
- **Item durability for weapons**: Weapons degrade with use, need repair at shop?
- **Insurance**: Pay to have items returned after death (delayed)?
- **Flea market / player trading**: Way in the future, if multiplayer.
- **Ammo types per caliber**: AP vs standard vs tracer rounds with different stats.
- **Magazine system**: Magazines as items you load with ammo, rather than ammo directly? (Complex, defer.)
