# Local Changes

Fork-tracking record for this checkout of **pf1-psionics**.

- **Upstream:** <https://github.com/SoxMax/pf1-psionics>
- **Fork:** <https://github.com/Hamilcarbarcas/pf1-psionics> (`origin`)
- **Branch:** `local-mods`, based on upstream `cb53e4d` ("Fix errors when opening actor
  compendiums", #77, 2026-05-22)
- **Module version at time of forking:** 0.9.1

Every entry below records what changed, why, which files it touches, and whether it is
worth sending upstream. This file is fork bookkeeping — **do not include it in a PR to
upstream.**

## Re-applying after an update

This module has no build step, so `scripts/` and `templates/` edits are live. When
upstream releases a new version, rebase `local-mods` onto it and re-verify each entry
still applies; the two manifester-offset entries are hand-written against code that
upstream may have moved.

Entries carrying an in-source marker use the comment `ASTORA LOCAL PATCH`, so
`grep -rn "ASTORA LOCAL PATCH" scripts/ templates/` finds them all. Note that anything
sent upstream needs that marker and the "Astora" name stripped first — it refers to a
private downstream module and means nothing to upstream readers.

---

## 1. Trap/haunt/vehicle/NPC-Lite sheets throw on render

**Status:** upstream bug fix — **good PR candidate, send this one first**
**Date:** 2026-08-30
**Commit:** not yet committed
**Files:** `scripts/applications/actor/actor-sheet.mjs`

### Symptom

Opening the sheet of a **trap** actor threw, and the sheet rendered incomplete:

```
actor-sheet.mjs:225 Uncaught (in promise) TypeError: Cannot convert undefined or null to object
    at Function.values (<anonymous>)
    at injectPsionicsTab (actor-sheet.mjs:225:14)
    at Object.renderActorHook [as fn] (actor-sheet.mjs:26:9)
    at ActorSheetPFTrap._render (foundry.mjs:37406:10)
```

### Cause

Two gates in this module disagree about which sheets it applies to.

The data-prep side registers its wrapper on the base prototype:

```js
libWrapper.register(MODULE_ID, "pf1.applications.actor.ActorSheetPF.prototype._prepareItems", ...)
```

which calls `prepareManifesters()` and is the only thing that ever assigns
`context.manifesterData`.

The injection side listens on `renderActorSheetPF`. Foundry's AppV1 `_callHooks` walks
the entire constructor chain and emits a render hook for **every** class name in it, so
that hook fires for all `ActorSheetPF` subclasses.

Four PF1 sheets override `_prepareItems` without calling `super`, which shadows the
wrapped method on the parent prototype so the wrapper never runs:

| Sheet | PF1 source | Actor type |
| --- | --- | --- |
| `ActorSheetPFTrap` | `module/applications/actor/trap-sheet.mjs:240` | `trap` |
| `ActorSheetPFHaunt` | `module/applications/actor/haunt-sheet.mjs:204` | `haunt` |
| `ActorSheetPFVehicle` | `module/applications/actor/vehicle-sheet.mjs:396` | `vehicle` |
| `ActorSheetPFNPCLite` | `module/applications/actor/npc-lite-sheet.mjs:33` | `npc` |

For those, `renderActorHook` runs against a context with no psionics data at all, and
`injectPsionicsTab` dereferenced `data.manifesterData` unguarded.

NPC Lite is the one that matters most in practice — it is an ordinary `npc`, not an
exotic actor type, so any world using the Lite sheet hits this.

`SKIPPED_SHEET_CLASSES` does not help here: it is a list of *sheet class names* aimed at
sheets where the data **is** prepared but a psionics tab is unwanted (pf1alt, loot
sheets). That list is still needed and is left alone.

### Fix

Added `hasPsionicsContext(data)` and an early return in `renderActorHook`, before any
injection runs. It tests `data.manifesterData !== undefined`, which is a precise probe
for "did the `_prepareItems` wrapper run for this sheet": `prepareManifesters` always
assigns the key, giving `{}` for an actor with no manifesters, so `undefined` can only
mean the wrapper was bypassed.

Chosen over an actor-type allowlist (`["character", "npc"]`, matching this module's
`onPreCreateActor` gate) because a type gate would not catch NPC Lite, and over
extending `SKIPPED_SHEET_CLASSES` because a name list cannot cover third-party sheets
that override `_prepareItems` the same way.

Bailing before `injectSettings` also stops the empty "Psionics" heading that
`injectPsionicsDiv` would otherwise append to any such sheet's `.settings` block.

Also hardened the original crash site with `data.manifesterData ?? {}`, matching the
guard already used on the same field inside the `_prepareItems` wrapper.

### Verification

`npm run lint` clean, `npm test` 92/92 passing. Needs an in-Foundry check: open a trap
actor sheet, and an NPC using the Lite sheet, and confirm no console error and no stray
psionics markup. Requires only an F5, no Foundry restart.

---

## 2. Prestige-class manifester level offset

**Status:** feature — **upstreamable, but needs cleanup first** (see below)
**Date:** 2026-07-27, committed 2026-07-31
**Commit:** `98391b8` "Added local patches for prestige class manifester level offsets"
**Files:** `scripts/data/manifesters.mjs`, `scripts/documents/actor/actor-pf.mjs`
(in `calculateCasterLevel`), `templates/actor/actor-manifester.hbs`

### Why

Stock pf1-psionics has no way to let a prestige class advance an existing manifester.
`book.cl.classLevelTotal` is derived from the manifesting class's own level, and the
existing `cl.formula` bonus reaches `cl.total` only — it never feeds `classLevelTotal`,
which is the value that drives power points and maximum power level. So a
Cerebremancer (or Thrallherd, or any other psionic PrC) cannot be modelled at all.

Core PF1 solves the same problem for spellbooks with
`cl.autoSpellLevelCalculationFormula`. This patch adds the psionic equivalent.

### What it does

- **`scripts/data/manifesters.mjs`** — adds `cl.autoLevelCalculationFormula: ""` to the
  default manifester template.
- **`scripts/documents/actor/actor-pf.mjs`** — in `calculateCasterLevel`, evaluates that
  formula and applies the result to **both** `classLevelTotal` and `clTotal`, before
  `classLevelTotal` is stored. Clamped to 1–20 because `POINTS_PER_LEVEL` is only keyed
  for those levels and an out-of-range level silently zeroes the manifester's power
  points. Registers source info so the bonus is visible in the UI.
- **`templates/actor/actor-manifester.hbs`** — adds the "Class Level Modification" input
  and its help text, mirroring the core PF1 spellbook field.

### Notes for upstreaming

- The three edits reuse core PF1's localization keys
  (`PF1.AutoSpellClassLevelOffset.Formula` / `.InfoBox`), which say "spell". Upstream
  would want module-owned keys under `PF1-Psionics.*` in `lang/en.json` instead.
- The `ASTORA LOCAL PATCH` comments must be rewritten as ordinary explanatory comments.
- No migration is included. Existing manifester flags lack the new key; reads fall back
  to `"0"` via `book.cl.autoLevelCalculationFormula || "0"`, so it degrades safely, but
  upstream may still want a migration to write the field explicitly.
- No unit test covers `calculateCasterLevel`. Worth adding one before submitting.

### Downstream consumer

`astora-mod`'s `cerebremancer-spells-per-day.create.js` depends on this and detects a
missing patch by checking whether `cl.classLevelTotal` actually moved after writing the
field. A fuller per-file description lives in that module's
`scripts/reference/README.md` under "PF1-Psionics manifester level offset".

---

## 3. Windows path handling in the pack tool

**Status:** cross-platform bug fix — **good PR candidate, small and self-contained**
**Date:** 2026-07-31 (same commit as entry 2)
**Commit:** `98391b8`
**Files:** `tools/packs.mjs`

### Why

`npm run packs:compile` and `packs:extract` were no-ops on Windows: the CLI entry guard
never matched, so the script exited silently having done nothing.

`url.fileURLToPath(import.meta.url)` returns a backslash path on Windows
(`C:\...\tools\packs.mjs`), while `process.argv[1]` and the rest of this module use
POSIX-style forward slashes. The equality test `process.argv[1] === __filename`
therefore always failed.

### What it does

- Normalizes `__filename` to forward slashes at definition, so every downstream
  `path.*` call sees consistent separators.
- Compares against `normalizePath(process.argv[1])` rather than the raw value. The
  `normalizePath` helper already existed in this file (`tools/packs.mjs:24`) and was
  already used elsewhere in it — this just applies it at the entry guard too.

### Notes for upstreaming

Clean as-is; carries no `ASTORA` marker and no downstream coupling. Upstream is
presumably developed on Linux/macOS, so this is a pure portability fix with no
behavioural change on those platforms.

---

## Suggested PR order

1. **Entry 1** (sheet crash) — a bug fix against current upstream, no dependencies,
   should go out on its own.
2. **Entry 3** (Windows paths) — independent, trivial to review.
3. **Entry 2** (manifester offset) — a feature; do the localization keys, comment
   rewrite and a test first, and expect discussion about whether the clamp belongs in
   `calculateCasterLevel` or in the power-point lookup.
