export const MANIFESTER =  {
        name: "",
        inUse: false,
        showConfig: false,
        casterType: "high",
        class: "",
        cl: {
            formula: "",
            // ASTORA LOCAL PATCH: prestige-class manifester level offset (mirrors
            // core PF1's spellbook `cl.autoSpellLevelCalculationFormula`).
            autoLevelCalculationFormula: "",
            notes: "",
        },
        concentration: {
            formula: "",
            notes: "",
        },
        ability: "int",
        autoLevelPowerPoints: true,
        autoAttributePowerPoints: true,
        autoMaxPowerLevel: true,
        hasCantrips: true,
        spellPreparationMode: "spontaneous",
        baseDCFormula: "10 + @sl + @ablMod",
        powerPoints: {
            max: 0,
            formula: "",
        },
    };

export const MANIFESTERS = {
    primary: foundry.utils.deepClone(MANIFESTER),
    secondary: foundry.utils.deepClone(MANIFESTER),
    tertiary: foundry.utils.deepClone(MANIFESTER),
    spelllike: Object.assign(foundry.utils.deepClone(MANIFESTER), {
        class: "_hd",
        ability: "cha",
    })
};