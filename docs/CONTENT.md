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
- **Vendor `minimum.surcharge`** is a flat silver fee for accepting an order below the minimum:
  fletchers 15, smithy 40, armory 60.
- **Split shares** are re-normalised per scenario over the vendors present. If only one source
  remains, `splitShare` is dropped.
- **Opening stock** is `mean × onHandDays`, capped at half the shelf life for perishables.
- **Period allowance** is the expected base spend at the cheapest source × the period length × a
  per-level factor (1.5 in levels I–II, 1.1–1.3 after that, 1.35 in the sandbox), rounded to two significant figures (sandbox: 83,000). Battle-plan
  uplift is not included, so letters create budget pressure. A final period cut short by the
  scenario end gets a pro-rated allowance.
- **Balance targets** (accept every proposal, checked against the real engine): service ≥ 95% on
  every level; levels I–VI use about 50–80% of the allowance; the sandbox uses 76–96% per period.
  Level VII goes over on purpose: about 7% in period 1 and 37% in period 2. Most of the period-2
  overspend comes from the post-assault forecast (see the engine note below).

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
| guild-fletchers | Worshipful Guild of Fletchers | Tue | 5 | 120 units (+15 surcharge) | 0.90 |
| mountain-smithy | Ironhollow Mountain Smithy | Wed | 7 | 250 silver (+40 surcharge) | 0.80 |
| river-merchants | Merchants of the Silverwash | Mon, Wed, Fri | 2 | — | 0.75 |
| apothecary | Brother Fennick's Apothecary | Mon–Sat | 1 | — | 0.97 |
| royal-armory | Royal Armory of Kingsreach | Fri | 4 | 400 silver (+60 surcharge) | 0.99 |

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

## Tutorial campaign

| # | id | Teaches | Items @ depot | Vendors | Days |
|---|---|---|---|---|---|
| I | tutorial-1 | forecast, projected stock, order proposal | bandages @ eastern-camp | apothecary | 14 |
| II | tutorial-2 | lead time, order days, D1, D2 | grain @ eastern-camp | abbey | 21 |
| III | tutorial-3 | safety stock, service level, presentation stock, MOP | grain (steady, SL 0.98, pres. 20), hardtack (volatile, SL 0.9) @ harrowmere | abbey | 28 |
| IV | tutorial-4 | pack size, rounding, shelf life, spoilage | ale (pack 12, 10-day life), salt pork, hardtack @ eastern-camp | abbey, river | 28 |
| V | tutorial-5 | vendor minimums, COP, must vs can | arrows, bowstrings (fletchers, units min); horseshoes, mail rings (smithy, value min) @ northern-pass | fletchers, smithy | 28 |
| VI | tutorial-6 | multi-sourcing: priority, split, reliability | grain, oats, arrows @ eastern-camp | abbey, river, fletchers, armory | 35 |
| VII | tutorial-7 | battle plans, uplift trust, budget pressure | arrows (guild only), pitch, rope, bandages, grain @ harrowmere; grain, ale @ eastern-camp | 5 vendors | 56 |
| — | sandbox | everything | all 14 items × 3 depots (38 locations) | all 6 | 112 |

In level V, typical weekly volume is under each vendor's minimum: fletchers about 70 units against
a minimum of 120, and the smithy about 185 silver against 250. This forces a top-up with can-order
items, which is the lesson of the level.

## Icons needed (Raven Fantasy Icons)

Each item's `icon` key should map in `public/assets/manifest.json` to one curated PNG. The proposed
shape is `"icons": { "item.grain": "icons/items/grain.png", … }`. Pick one icon per row from the
Raven Fantasy Icons pack. The pack is organised by theme (food, materials, weapons, armor, potions,
tools). Use the 32×32 or 64×64 versions for every icon, so they all match.

| Icon key | Look for in Raven pack | Fallback idea |
|---|---|---|
| item.grain | Sack of grain / wheat sheaf (food) | Bundle of wheat |
| item.hardtack | Biscuit / hard bread / cracker (food) | Bread loaf |
| item.salt-pork | Ham / salted meat / meat on bone (food) | Raw meat slab |
| item.ale | Wooden tankard of ale, or small cask (food/drink) | Mug of beer |
| item.oats | Grain sack in a different colour, or a hay bundle (materials) | Seeds pouch |
| item.arrows | Bundle/quiver of arrows (weapons/ammo) | Single arrow |
| item.bowstrings | Coiled string / thread spool (materials) | Bow with string |
| item.bolts | Crossbow bolts, or a crossbow (weapons/ammo) | Short metal-tipped arrow |
| item.horseshoes | Horseshoe (tools/misc) | Iron ingot |
| item.pitch | Pot of tar / black liquid jar / oil flask (materials/potions) | Black potion |
| item.siege-rope | Coiled rope (materials/tools) | Rope ladder |
| item.bandages | Bandage roll / linen cloth (medical/materials) | Cloth bolt |
| item.poultices | Herb bowl / mortar and pestle / green salve jar (potions/herbs) | Herb bundle |
| item.mail-rings | Chainmail piece / iron rings (armor/materials) | Chainmail shirt |

Also useful from the same pack, as UI icons:

| Key | Use | Look for |
|---|---|---|
| ui.coin | Silver / budget | Silver coin stack |
| ui.letter | Battle-plan letters | Sealed scroll / wax-sealed letter |
| ui.cart | Deliveries / open orders | Wagon / cart |
| ui.calendar | D1 / D2 markers | Hourglass or sundial |
| ui.warning | Exceptions | Red exclamation / broken shield |
| ui.morale | Morale | Banner / helmet |
| ui.spoiled | Spoilage | Rotten food / skull |
| vendor.abbey-granary | Vendor crest | Church / cross |
| vendor.guild-fletchers | Vendor crest | Bow |
| vendor.mountain-smithy | Vendor crest | Anvil / hammer |
| vendor.river-merchants | Vendor crest | Boat / anchor |
| vendor.apothecary | Vendor crest | Potion bottle |
| vendor.royal-armory | Vendor crest | Crown / shield |

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
