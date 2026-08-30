import { describe, it, expect, beforeEach, vi } from "vitest";

// The module barrel re-exports the document classes, which extend `pf1.*` at import
// time. Only MODULE_ID is needed here, so stub the barrel rather than mocking the
// whole PF1 system.
vi.mock("../../scripts/_module.mjs", () => ({ MODULE_ID: "pf1-psionics" }));

const { calculateCasterLevel } = await import("../../scripts/documents/actor/actor-pf.mjs");

/**
 * Build the minimal actor/rollData/book trio `calculateCasterLevel` reads.
 *
 * @param {object} [options]
 * @param {number} [options.classLevel] - Levels in the manifesting class
 * @param {string} [options.offsetFormula] - Prestige-class level offset formula
 * @param {number} [options.energyDrain] - Negative levels on the actor
 * @returns {{actor: object, rollData: object, book: object}}
 */
function setup({ classLevel = 10, offsetFormula = "", energyDrain = 0 } = {}) {
  const actor = {
    type: "character",
    sourceInfo: {},
    classes: { psion: { _id: "abc", name: "Psion" } },
    system: { attributes: { hd: { total: classLevel } } },
  };
  const rollData = {
    class: { unlevel: classLevel },
    attributes: { energyDrain },
  };
  const book = {
    class: "psion",
    cl: { formula: "", autoLevelCalculationFormula: offsetFormula, total: 0 },
  };
  return { actor, rollData, book };
}

describe("calculateCasterLevel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("leaves the class level alone when no offset formula is set", () => {
    const { actor, rollData, book } = setup({ classLevel: 10 });

    calculateCasterLevel(actor, rollData, "primary", book);

    expect(book.cl.classLevelTotal).toBe(10);
    expect(book.cl.total).toBe(10);
  });

  it("adds a prestige-class offset to both the class level and the manifester level", () => {
    const { actor, rollData, book } = setup({ classLevel: 10, offsetFormula: "5" });

    calculateCasterLevel(actor, rollData, "primary", book);

    // classLevelTotal drives power points and max power level; cl.total is the
    // manifester level. The offset has to reach both.
    expect(book.cl.classLevelTotal).toBe(15);
    expect(book.cl.total).toBe(15);
  });

  it("clamps the offset class level to 20", () => {
    const { actor, rollData, book } = setup({ classLevel: 18, offsetFormula: "6" });

    calculateCasterLevel(actor, rollData, "primary", book);

    // POINTS_PER_LEVEL is only keyed 1..20.
    expect(book.cl.classLevelTotal).toBe(20);
  });

  it("clamps the offset class level to a minimum of 1", () => {
    const { actor, rollData, book } = setup({ classLevel: 3, offsetFormula: "-8" });

    calculateCasterLevel(actor, rollData, "primary", book);

    expect(book.cl.classLevelTotal).toBe(1);
  });

  it("reports the offset as its own source", () => {
    const { actor, rollData, book } = setup({ classLevel: 10, offsetFormula: "5" });

    calculateCasterLevel(actor, rollData, "primary", book);

    expect(pf1.documents.actor.changes.setSourceInfoByName).toHaveBeenCalledWith(
      actor.sourceInfo,
      "flags.pf1-psionics.manifesters.primary.cl.total",
      "PF1-Psionics.ManifesterLevelOffset.Formula",
      5,
    );
  });

  it("subtracts negative levels once, not once per contribution", () => {
    const { actor, rollData, book } = setup({ classLevel: 10, offsetFormula: "5", energyDrain: 2 });

    calculateCasterLevel(actor, rollData, "primary", book);

    // classLevelTotal is unaffected by drain; only the manifester level is reduced.
    expect(book.cl.classLevelTotal).toBe(15);
    expect(book.cl.total).toBe(13);
  });
});
