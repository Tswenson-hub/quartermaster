# Content

Game data lives in `src/content/` and is typed against `src/engine/types.ts`. It is pure data — no
React, no `Math.random`. Demand history is generated at import from a seeded PRNG, so every load
produces the same numbers.

| File | What |
|---|---|
| `items.ts` | 14 supplies: shelf life, holding cost, criticality, icon key |
| `vendors.ts` | 6 suppliers: order weekdays, lead time, minimums, reliability |
| `sourcing.ts` | Item × vendor: unit cost, pack size, priority, split share |
| `depots.ts` | 3 front-line depots |
| `battlePlans.ts` | 4 military letters with stated vs actual (hidden) uplift |
| `history.ts` | Deterministic demand-history generator (weekday profile, trend, noise) |
| `scenarios.ts` | 7 tutorial levels + sandbox, built from the above |
| `index.ts` | Public exports; `scenarios: Scenario[]` (first = `tutorial-1`, last = `sandbox`) |
| `content.test.ts` | Sanity checks: references resolve, split shares sum to 1, history ≥ 28 days |

## Conventions and interpretations

- **History** is 56 days (8 full weeks), oldest first; the last entry is day −1 (a Sunday). So
  `history[i]` falls on weekday `i % 7`, and day 0 is Monday. Slow movers (mean < 3/day) use
  Poisson demand. Faster ones use Gaussian noise with the item's coefficient of variation.
- **Vendor `reliability`** is the chance that a delivery arrives on time and in full (1 = never
  fails), as the contract now states.
- **Vendor `orderTrigger`** (vendors with a minimum): the share of the minimum that the real
  must-order need has to reach before the system builds the order up to the minimum (RELEX_RULES §4).
  Fletchers 0.5 (builds readily), armory 0.6, smithy 0.8. At 0.8, a small garrison's need never
  fires the smithy trigger, so the player has to lower it. There are no surcharges any more.
- **`minimumFill`** is the player's floor. MOP = max(safety stock, minimumFill). It is set where the
  lesson needs it: level III grain (30, above safety stock) and level IX Harrowmere bandages (20).
- **Split shares** are re-normalised per scenario over the vendors present. If only one source
  remains, `splitShare` is dropped.
- **Opening stock** is `mean × onHandDays`, capped at half the shelf life for perishables.
- **Period allowance** = expected spend per day × period length × a per-level `allowanceFactor`,
  rounded to two significant figures. Expected spend is base demand **plus the actual battle-plan
  surges**, at the cheapest source, averaged over the campaign. `rules.difficulty.budgetFactor`
  is applied on top (easy 1.15, normal 1, hard 0.85). A final period cut short by the scenario end
  gets a pro-rated allowance.

## Balance (market-driven demand, synthetic KO/AAPL/TSLA snapshots)

Checked against the real engine with two strategies. **Accept-all** accepts every proposal.
**Careful** also judges each letter correctly (stated uplift = actual uplift). Levels that teach
`order trigger` are also checked with every trigger lowered to 0.5, as the lead's tests do.

| Level | Accept-all, easy / normal / hard | Notes |
|---|---|---|
| I–V, VII | service 97–100%, budget used 46–100% | No letters beyond commendations. |
| VI (trigger) | service ~42% at the default 0.8 trigger (no proposal ever fires); 100% with trigger 0.5 | Lesson: lower the smith's trigger. |
| VIII (override) | service 95.8 / 97.3 / 97.8%; levies battle won at 94–97% | Accept-all must stay ≥ 95%, so the unannounced surge (grain ×1.75, ale ×1.8) is kept moderate. Careful: 99%. |
| IX (letters, budget) | easy and normal: battles won, rank 2 → 4, no reprimands. Hard: 2 reprimands (136% / 109% of budget) | The careful player stays on budget on normal; on hard they are still reprimanded but win both battles. |
| Sandbox | easy and normal: rank 2 → 4, **winter crossing lost** (understated letter). Hard: 2 reprimands, crossing lost, rank 3 | Careful: rank 6 on normal, rank 5 on hard, all 4 battles won. |

## Items

| id | Name | Category | Unit | Shelf life (d) | Hold/day | Crit |
|---|---|---|---|---|---|---|
| grain | Grain | rations | sack | 180 | 0.04 | 5 |
| hardtack | Hardtack | rations | crate | 365 | 0.05 | 4 |
| salt-pork | Salt Pork | rations | barrel | 120 | 0.15 | 4 |
| ale | Ale | rations | cask | **10** | 0.12 | 3 |
| oats | Oats & Fodder | fodder | sack | 90 | 0.04 | 4 |
| arrows | War Arrows | munitions | sheaf (24) | — | 0.02 | 5 |
| bowstrings | Bowstrings | munitions | bundle (12) | 120 | 0.01 | 4 |
| bolts | Crossbow Bolts | munitions | case (50) | — | 0.03 | 4 |
| horseshoes | Horseshoes & Nails | tools | set | — | 0.02 | 3 |
| pitch | Pitch | siege | pot | — | 0.08 | 3 |
| siege-rope | Siege Rope | siege | coil | — | 0.05 | 2 |
| bandages | Linen Bandages | medical | roll | — | 0.005 | 4 |
| poultices | Herbal Poultices | medical | jar | **7** | 0.03 | 3 |
| mail-rings | Mail Rings | armor | keg | — | 0.10 | 2 |

## Vendors (weekday 0 = Mon)

| id | Name | Order days | LT | Minimum | Reliability |
|---|---|---|---|---|---|
| abbey-granary | St. Aldric's Abbey Granary | Mon, Thu | 3 | — | 0.95 |
| guild-fletchers | Worshipful Guild of Fletchers | Tue | 5 | 120 units, trigger 0.5 | 0.90 |
| mountain-smithy | Ironhollow Mountain Smithy | Wed | 7 | 250 silver, trigger **0.8** | 0.80 |
| river-merchants | Merchants of the Silverwash | Mon, Wed, Fri | 2 | — | 0.75 |
| apothecary | Brother Fennick's Apothecary | Mon–Sat | 1 | — | 0.97 |
| royal-armory | Royal Armory of Kingsreach | Fri | 4 | 400 silver, trigger 0.6 | 0.99 |

## Multi-sourcing

| Item | Mode | Sources |
|---|---|---|
| grain | priority | abbey (1, 4s, pack 10) → river (2, 5s, pack 25) |
| ale | priority | abbey (1, 12s, pack 12) → river (2, 14s, pack 6) |
| arrows | priority | fletchers (1, 6s, pack 12) → armory (2, 8s, pack 50) |
| oats | split | abbey 60% (3s, pack 20) / river 40% (3.5s, pack 10) |
| bolts | split | smithy 50% (10s, pack 10) / armory 50% (12s, pack 20) |

## Battle plans

| id | Depot | Letter → window | Stated | Actual | Lesson |
|---|---|---|---|---|---|
| harrowmere-assault | harrowmere | d10 → d21–27 | arrows 2.5, pitch 3, rope 2, bandages 2 | 2.4, 2.8, 2.1, 2.2 | accurate |
| feast-muster | eastern-camp | d22 → d32–34 | ale 3, grain 1.5 | 1.6, 1.15 | exaggerated |
| winter-crossing | northern-pass | d42 → d52–65 | oats 1.5, horseshoes 1.5 | 2.1, 2.6 | **under-stated** |
| ford-feint | eastern-camp | d70 → d80–84 | arrows 1.8, bolts 1.8, bowstrings 1.33 | 1.85, 1.7, 1.35 | accurate |
| levies-arrive | eastern-camp | d3 → d14–34 | *(no figures)* | grain 1.75, ale 1.8, bandages 1.4 | **silent**: needs a forecast override |

Each plan ends in a battle. `BattlePlan.winServiceLevel` is the service level its depots need
over the window to win: the assault needs 0.92, the feast 0.85, and the others 0.9. `BATTLES` in
`battlePlans.ts` holds the flavour: name, key items, and victory and defeat lines (rendered by the
store's `selectLetterText`).

## Tutorial campaign

| # | id | Teaches | Items @ depot | Vendors | Days |
|---|---|---|---|---|---|
| I | tutorial-1 | forecast, projected stock, order proposal | bandages @ eastern-camp | apothecary | 14 |
| II | tutorial-2 | lead time, order days, D1, D2 | grain @ eastern-camp | abbey | 21 |
| III | tutorial-3 | safety stock, service level, minimum fill, MOP = max(SS, minimumFill) | grain (steady, minimumFill 30), hardtack (volatile) @ harrowmere | abbey | 28 |
| IV | tutorial-4 | pack size, rounding, shelf life, spoilage | ale (pack 12, 10-day life), salt pork, hardtack @ eastern-camp | abbey, river | 28 |
| V | tutorial-5 | vendor minimum, **order trigger**, build-up | arrows, bowstrings @ northern-pass (need ≈ 58% of the 120-unit minimum; trigger 0.5, so it builds) | fletchers | 28 |
| VI | tutorial-6 | **order trigger**: below the trigger no proposal appears; adjust it | horseshoes, mail rings @ northern-pass (need ≈ 50% of 250 silver; trigger 0.8, so it never fires) | smithy | 28 |
| VII | tutorial-7 | multi-sourcing: priority, split, reliability | grain, oats, arrows @ eastern-camp | abbey, river, fletchers, armory | 35 |
| VIII | tutorial-8 | **forecast override** (daily or aggregate), SWAPE/bias | grain, ale, bandages @ eastern-camp + the silent `levies-arrive` letter | abbey, river, apothecary | 35 |
| IX | tutorial-9 | battle plans, trusting the letter, budget, fiscal period, rank | arrows (guild only), pitch, rope, bandages, grain @ harrowmere; grain, ale @ eastern-camp | 5 vendors | 56 |
| — | sandbox | everything | all 14 items × 3 depots (38 locations) | all 6 | 112 |

## Ranks, letters, difficulty (`ranks.ts`)

- `RANKS` / `RANK_TITLES` (levels 0–6): Sutler's Boy, Clerk of Stores, Sergeant of Stores (start),
  Master of Wagons, Quartermaster, Quartermaster of the Host, Quartermaster-General. Insignia keys
  are `rank.0`–`rank.6`. `rankTitle(level)` clamps out-of-range levels.
- `SENDERS`: Lord Marshal Edric Vane, Dame Isolde Marrow (Treasury), King Aldwin III, plus the
  steward and the captain who sign battle-plan letters.
- `LETTER_TEMPLATES[kind](ctx)` returns `{ from, subject, body }` for every `LetterKind`. The ctx
  fields are rankTitle, period, committed, allowance, reprimands, serviceLevel, battleTitle and
  battleLine (from `BATTLES`).
- `DIFFICULTY_FLAVOUR`: title and description for easy, normal and hard. The tickers and budget
  factors themselves are in `rules.difficulty`.

## Curated assets (in `public/assets/`)

`public/assets/manifest.json` maps keys to file paths relative to the site root. Prefix the path
with `import.meta.env.BASE_URL`. It has three groups: `icons` (32×32, Raven), `tiles` (64×64,
Kenney) and `ui` (empty for now). `Item.icon` values are keys in `icons`. Vendor icons are
`vendor.<vendorId>`, rank insignia are `rank.<level>` (0–6), and letter icons are
`letter.<LetterKind>`. Render the icons with `image-rendering: pixelated` to keep the pixel art sharp.

`fbN` is the Raven file `Separated Files/32x32/fbN.png`, which is also cell N−1, row-major, of
`Full Spritesheet/32x32.png`. To swap an icon, copy another `fbN.png` over the file with the same name.

| Key | Source |
|---|---|
| `item.grain` | raven fb516 |
| `item.hardtack` | raven fb517 |
| `item.salt-pork` | raven fb486 |
| `item.ale` | raven fb503 |
| `item.oats` | raven fb432 |
| `item.arrows` | raven fb401 |
| `item.bowstrings` | raven fb1499 |
| `item.bolts` | raven fb1481 |
| `item.horseshoes` | raven fb116 |
| `item.pitch` | raven fb340 |
| `item.siege-rope` | raven fb2068 |
| `item.bandages` | raven fb109 |
| `item.poultices` | raven fb53 |
| `item.mail-rings` | raven fb2063 |
| `vendor.abbey-granary` | raven fb37 |
| `vendor.guild-fletchers` | raven fb1515 |
| `vendor.mountain-smithy` | raven fb125 |
| `vendor.river-merchants` | raven fb398 |
| `vendor.apothecary` | raven fb121 |
| `vendor.royal-armory` | raven fb34 |
| `rank.0` | raven fb663 |
| `rank.1` | raven fb664 |
| `rank.2` | raven fb856 |
| `rank.3` | raven fb855 |
| `rank.4` | raven fb859 |
| `rank.5` | raven fb857 |
| `rank.6` | raven fb854 |
| `letter.sealed` | raven fb107 |
| `letter.reprimand` | raven fb896 |
| `letter.commendation` | raven fb880 |
| `letter.promotion` | raven fb865 |
| `letter.demotion` | raven fb884 |
| `letter.battle-won` | raven fb853 |
| `letter.battle-lost` | raven fb862 |
| `letter.game-over` | raven fb862 |
| `ui.battle` | raven fb721 |
| `ui.coin` | raven fb132 |
| `ui.treasury` | raven fb158 |
| `ui.trigger` | raven fb124 |
| `ui.delivery` | raven fb25 |
| `ui.camp` | raven fb40 |
| `ui.spoiled` | raven fb407 |
| `ui.morale` | raven fb659 |
| `ui.banner` | raven fb43 |
| `tile.grass` | kenney medievalTile_57.png |
| `tile.grass-2` | kenney medievalTile_58.png |
| `tile.dirt` | kenney medievalTile_13.png |
| `tile.sand` | kenney medievalTile_01.png |
| `tile.snow` | kenney medievalTile_29.png |
| `tile.water` | kenney medievalTile_27.png |
| `tile.road-ns` | kenney medievalTile_03.png |
| `tile.road-cross` | kenney medievalTile_05.png |
| `tile.forest` | kenney medievalTile_44.png |
| `tile.pines` | kenney medievalTile_48.png |
| `tile.trees` | kenney medievalTile_42.png |
| `tile.stumps` | kenney medievalTile_52.png |
| `tile.crate-yard` | kenney medievalTile_55.png |
| `struct.tent` | kenney medievalStructure_10.png |
| `struct.tent-large` | kenney medievalStructure_16.png |
| `struct.tent-small` | kenney medievalStructure_23.png |
| `struct.market` | kenney medievalStructure_07.png |
| `struct.stall` | kenney medievalStructure_22.png |
| `struct.church` | kenney medievalStructure_04.png |
| `struct.castle` | kenney medievalStructure_05.png |
| `struct.windmill` | kenney medievalStructure_13.png |
| `struct.house` | kenney medievalStructure_20.png |
| `env.campfire` | kenney medievalEnvironment_21.png |
| `env.tree` | kenney medievalEnvironment_04.png |
| `env.rock` | kenney medievalEnvironment_09.png |
| `env.log` | kenney medievalEnvironment_06.png |
| `env.bush` | kenney medievalEnvironment_13.png |

Suggested camp backdrop: lay `tile.grass` / `tile.grass-2` as the ground, run a `tile.road-ns`
supply road through it, and put `tile.forest` / `tile.pines` at the edges. Place the tents
(`struct.tent*`), `env.campfire` and a `struct.market` quartermaster stall on top. Use `tile.snow`
for the Northern Pass and `tile.dirt` / `tile.stumps` for the Harrowmere siege lines.

### Licences

Full terms are in `public/assets/LICENSES.md`. In short:
- **Raven Fantasy Icons (free version):** allowed only while the game is free, with no ads and no
  microtransactions. Don't redistribute the icons on their own. Credit is welcome but not required.
  Buy the premium version before any commercial release.
- **Kenney RTS Medieval:** CC0. Credit is optional.
- **MedievalFantasyFree:** ToffeeCraft free tier, personal use only, no redistribution. **Not
  shipped.** For the UI, use CSS panels or buy the ToffeeCraft paid tier.

## Suggested asset purchases (≤ $25 total)

1. **Raven Fantasy Icons** (Clockwork Raven, itch.io): pay what you want, about $10. Covers all
   14 items plus the UI and vendor icons above.
2. **ToffeeCraft UI Mega Pack**, paid tier with the medieval theme: about $3–5. Parchment panels,
   buttons, progress bars (for the vendor-minimum meter) and inventory frames.
3. **Kenney** Tiny Town, Medieval RTS and UI Pack RPG: free (CC0). Map backdrop for the depots and
   extra UI elements.
4. **Google Fonts** Pixelify Sans (UI) and IM Fell English (letters and headings): free.
5. Optional: a pixel character-portrait pack (about $5) for letter senders: Lord Marshal Edric Vane,
   Sir Hamon Ashby, Captain Rowan Thale.

Put the raw downloads in `assets/_raw/` (gitignored). Copy only the chosen files into
`public/assets/` and list them in `manifest.json`.

## Engine notes found while balancing (for lead/engine)

- **Event demand inflates the baseline.** After the Harrowmere assault (days 21–27), the 14-day
  moving average still contains the boosted demand. The engine then orders about 1.8× normal
  arrows in the following period. RELEX cleans event days out of history before computing the
  baseline (for example, by dividing those days by the actual uplift).
- **Priority fallback orders every week.** For a priority-sourced item, each vendor's order day
  picks "best vendor ordering today", so the fallback vendor (e.g. armory on Fridays) also gets
  weekly orders. Its large packs (arrows, 50) then overstock the depot.
- **`splitShare` is not applied yet.** Oats and bolts are currently sourced by priority/order day.
