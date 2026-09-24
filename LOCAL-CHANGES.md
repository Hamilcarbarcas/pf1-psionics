# Local Changes

Fork-tracking record for this checkout of **pf1-psionics**.

- **Upstream:** <https://github.com/SoxMax/pf1-psionics>
- **Fork:** <https://github.com/Hamilcarbarcas/pf1-psionics> (`origin`)
- **Branch:** `local-mods`, based on upstream `cb53e4d` ("Fix errors when opening actor
  compendiums", #77, 2026-05-22)
- **Module version at time of forking:** 0.9.1

Four independent changes live on this branch. Each section below is written as a ready
PR description — title, body, and the notes a reviewer will want — and should go upstream
as its **own** branch and PR, in the order given. They touch unrelated subsystems and
mixing them would make all three harder to review.

All changes are PR-clean as of 2026-08-30: no downstream-only markers, no borrowed
localization keys, `npm run lint` clean, `npm test` 98/98 passing, and all three exercised
in a live Foundry v13 / PF1 v11.11 world.

**Do not include this file in any PR** — it is fork bookkeeping.

---

# PR 1 — Fix `TypeError` when rendering trap, haunt, vehicle and NPC Lite sheets

**Branch:** `fix/sheet-render-crash`
**Files:** `scripts/applications/actor/actor-sheet.mjs`
**Type:** bug fix · **Send first** — smallest, most obviously correct, no dependencies

## Description

Opening a trap actor's sheet throws and leaves the sheet partly unrendered:

```
actor-sheet.mjs:225 Uncaught (in promise) TypeError: Cannot convert undefined or null to object
    at Function.values (<anonymous>)
    at injectPsionicsTab (actor-sheet.mjs:225:14)
    at Object.renderActorHook [as fn] (actor-sheet.mjs:26:9)
    at ActorSheetPFTrap._render (foundry.mjs:37406:10)
```

The same throw occurs on haunt, vehicle and **NPC Lite** sheets. NPC Lite is the one most
likely to be hit in a real world — it is an ordinary `npc`, not an exotic actor type.

## Cause

The module's two halves disagree about which sheets they cover.

The data-prep half registers its wrapper on the base prototype:

```js
libWrapper.register(MODULE_ID, "pf1.applications.actor.ActorSheetPF.prototype._prepareItems", ...)
```

This calls `prepareManifesters()`, the only thing that ever assigns
`context.manifesterData`.

The injection half listens on `renderActorSheetPF`. Foundry's AppV1 `_callHooks` walks the
whole constructor chain and emits a render hook for **every** class name in it, so that
hook fires for all `ActorSheetPF` subclasses.

Four PF1 sheets override `_prepareItems` without calling `super`, which shadows the
wrapped method on the parent prototype, so the wrapper never runs for them:

| Sheet | PF1 source | Actor type |
| --- | --- | --- |
| `ActorSheetPFTrap` | `module/applications/actor/trap-sheet.mjs:240` | `trap` |
| `ActorSheetPFHaunt` | `module/applications/actor/haunt-sheet.mjs:204` | `haunt` |
| `ActorSheetPFVehicle` | `module/applications/actor/vehicle-sheet.mjs:396` | `vehicle` |
| `ActorSheetPFNPCLite` | `module/applications/actor/npc-lite-sheet.mjs:33` | `npc` |

`renderActorHook` therefore runs against a context with no psionics data at all, and
`injectPsionicsTab` dereferenced `data.manifesterData` unguarded.

## Fix

Adds `hasPsionicsContext(data)` and an early return in `renderActorHook`, before any
injection runs. It tests `data.manifesterData !== undefined`, which is a precise probe for
"did the `_prepareItems` wrapper run for this sheet": `prepareManifesters` always assigns
the key, giving `{}` for an actor with no manifesters, so `undefined` can only mean the
wrapper was bypassed.

Bailing before `injectSettings` also prevents the empty "Psionics" heading that
`injectPsionicsDiv` would otherwise append to those sheets' `.settings` block.

The original crash site is additionally guarded with `data.manifesterData ?? {}`, matching
the guard already used on the same field inside the `_prepareItems` wrapper.

## Notes for the reviewer

Two alternatives were considered and rejected:

- **An actor-type allowlist** (`["character", "npc"]`, matching this module's own
  `onPreCreateActor` gate) would not catch NPC Lite, which is an `npc`.
- **Extending `SKIPPED_SHEET_CLASSES`** cannot cover third-party sheets that override
  `_prepareItems` the same way, and would need a new entry for every such sheet.

`SKIPPED_SHEET_CLASSES` is deliberately left untouched. It solves a different problem —
sheets where the data *is* prepared but a psionics tab is unwanted (pf1alt, loot sheets) —
and is still needed.

## Testing

`npm run lint` clean, `npm test` passing.

Verified in Foundry v13 with PF1 v11.11: opening a trap actor sheet and an NPC using the
Lite sheet renders cleanly with no console error and no stray psionics markup, and a
character sheet with an active manifester is unaffected.

---

# PR 2 — Add a manifester "Class Level Modification" field for prestige classes

**Branch:** `feat/manifester-level-offset`
**Files:** `scripts/data/manifesters.mjs`, `scripts/documents/actor/actor-pf.mjs`,
`templates/actor/actor-manifester.hbs`, `lang/en.json`, `test/setup.mjs`,
`test/unit/caster-level.test.mjs`
**Type:** feature · **Send last** — largest surface, has open design questions

## Description

There is currently no way to let a prestige class advance an existing manifester, so
Cerebremancer, Thrallherd and similar classes cannot be modelled.

`book.cl.classLevelTotal` is derived from the manifesting class's own level, and the
existing `cl.formula` bonus reaches `cl.total` only — it never feeds `classLevelTotal`,
which is the value driving power points and maximum power level. So no existing field can
do this.

Core PF1 solves the identical problem for spellbooks with
`cl.autoSpellLevelCalculationFormula` ("Class Level Modification"). This adds the psionic
counterpart, `cl.autoLevelCalculationFormula`.

## What changed

- **`scripts/data/manifesters.mjs`** — adds `cl.autoLevelCalculationFormula: ""` to the
  default manifester template.
- **`scripts/documents/actor/actor-pf.mjs`** — in `calculateCasterLevel`, evaluates the
  formula and applies the result to **both** `classLevelTotal` and `clTotal`, before
  `classLevelTotal` is stored. Registers source info so the bonus is visible in the UI.
- **`templates/actor/actor-manifester.hbs`** — adds the input and its help text, laid out
  to match the core PF1 spellbook field.
- **`lang/en.json`** — adds `PF1-Psionics.ManifesterLevelOffset.Formula` / `.InfoBox`.

## Notes for the reviewer

**The help text deliberately differs from core PF1's.** Core's `InfoBox` suggests
`@classes.mysticTheurge.level`, which is wrong: `level` is already `unlevel` minus negative
levels (`actor-pf.mjs:4791` in the PF1 system), and energy drain is subtracted again from
`cl.total` at the end of `calculateCasterLevel`. Using `.level` therefore double-counts the
drain penalty. The book's own class contribution uses `rollData.class.unlevel`, so this
help text says `.unlevel` and explains why. There is a regression test covering it.

**Open question — where the 1..20 clamp belongs.** `POINTS_PER_LEVEL` is only keyed for
levels 1–20, and an out-of-range level silently zeroes the manifester's power points rather
than failing loudly. The offset is clamped at the point of application to avoid that. It
may belong at the `POINTS_PER_LEVEL` lookup instead, which would be a broader change and is
left to your call. Note the clamp only runs when the offset is non-zero, so it cannot
change behaviour for anyone not using the field.

**No migration is included.** Existing manifester flags lack the new key; reads fall back
via `book.cl.autoLevelCalculationFormula || "0"` and the template input renders empty, so
it degrades safely.

**`calculateCasterLevel` is now exported**, solely so the test can reach it — flagged in a
comment.

## Testing

Adds `test/unit/caster-level.test.mjs` (6 cases): no-offset regression, offset reaching
both totals, both clamp bounds, source-info reporting, and the negative-levels
single-subtraction guard.

This is the first test to touch the document layer, so `test/setup.mjs` gains stubs for
`pf1.documents.actor.changes.setSourceInfoByName`, `RollPF.safeRollSync`, `Hooks`, and a
`Math.clamp` polyfill (Foundry extends `Math`; plain Node does not). Existing tests are
unaffected — full suite 98/98.

Verified in Foundry v13 with PF1 v11.11 on a Psion/Cerebremancer: power points, maximum
power level and manifester level all advance correctly, the new field and its help text
render on the manifester config, and the offset appears by name in the manifester-level
tooltip.

---

# PR 3 — Fix `packs:compile` and `packs:extract` silently doing nothing on Windows

**Branch:** `fix/windows-pack-paths`
**Files:** `tools/packs.mjs`
**Type:** bug fix · **Send second** — independent and trivial to review

## Description

On Windows, `npm run packs:compile` and `npm run packs:extract` exit successfully having
done nothing at all. No error, no output — the pack simply is not built.

The CLI entry guard compares two path strings that use different separators:

```js
const __filename = url.fileURLToPath(import.meta.url);   // C:\...\tools\packs.mjs
...
if (process.argv[1] === __filename) {                    // C:/.../tools/packs.mjs
```

`url.fileURLToPath` returns a backslash path on Windows, while `process.argv[1]` and the
rest of this module use forward slashes. The comparison never matches, so the yargs block
never runs.

## Fix

- Normalizes `__filename` to forward slashes at its definition, so every downstream
  `path.*` call sees consistent separators.
- Compares against `normalizePath(process.argv[1])` rather than the raw value.

`normalizePath` already exists in this file (`tools/packs.mjs:24`) and is already used for
the same purpose elsewhere in it; this just applies it at the entry guard too.

## Notes for the reviewer

No behavioural change on Linux or macOS — `fileURLToPath` already returns forward slashes
there and `replaceAll("\\", "/")` is a no-op. Pure portability fix.

## Testing

Verified on Windows 10: `npm run packs:extract` and `npm run packs:compile` both produce
output with the fix and are silent no-ops without it.

---

# PR 4 — Fix section filters on the Psionics tab and the combat-tab Powers section

**Branch:** `fix/section-filters`
**Files:** `scripts/applications/actor/actor-sheet.mjs`
**Type:** bug fix · independent of PRs 1–3

## Description

Two filter bugs, both visible as "Filter out empty sections" not hiding anything:

1. **Psionics tab:** none of the filter pills work, "empty" included.
2. **Combat tab:** the Powers section shows even when it has no powers, and ignores both
   the "empty" filter and the other section filter pills.

## Cause

1. A regression from #75 ("reduce jquery reliance"). The jQuery delegated handler
   `filterLists.on("click", ".filter-rule", …)` set `event.currentTarget` to the clicked
   `li`. The native replacement listens on the `ul`, so `currentTarget` is the `ul`, which
   has no `data-category` / `data-filter`. PF1's `_onToggleFilter` then toggles
   `_filters.sections[undefined]` and nothing changes.
2. `addPowersToCombatTab` runs after `wrapped(context)`, by which point PF1's
   `_prepareItems` has already dropped empty `hideEmpty` sections (`actor-sheet.mjs:3970` in
   the PF1 system) and run `_filterSection` over the `attacks` category (`:3998`). The Powers
   section is added after both passes, so neither applies to it.

## Fix

1. Binds `_onToggleFilter` to each `.filter-rule` directly, so `currentTarget` is the `li`
   again.
2. In `addPowersToCombatTab`, an empty Powers section is dropped (mirroring PF1's
   `hideEmpty` handling), and a non-empty one gets `_filterSection` with the `attacks`
   filter set.

## Testing

`npm run lint` clean, `npm test` 98/98 passing. Not yet verified in Foundry.
