/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import {
  BankQuestion,
  DifficultyLevel,
  HomeworkBlueprint,
  QuestionType,
  Subject
} from "../src/types";
import {
  analyzeBlueprintPool,
  blueprintFilters,
  computeDifficultyQuotas,
  getEligibleQuestions,
  matchesBlueprintFilters,
  normalizeDifficulty,
  selectBlueprintQuestions,
  validateSelection
} from "../src/lib/blueprintSelection";
import { applyAttemptPaper, buildAttemptPaper } from "../src/lib/attemptPaper";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let seq = 0;

function bankQuestion(over: Partial<BankQuestion> = {}): BankQuestion {
  seq += 1;
  return {
    id: `q-${seq}`,
    type: QuestionType.MCQ,
    text: `Question ${seq}`,
    options: ["a", "b", "c", "d"],
    correctAnswerIndex: 0,
    subject: Subject.Chemistry,
    grade: "1 Sec",
    lesson: "Thermochemistry",
    topic: "Thermochemistry",
    difficulty: DifficultyLevel.Medium,
    estimatedTimeMinutes: 2,
    tags: [],
    status: "active",
    createdAt: 1,
    ...over
  };
}

function makeBank(counts: { easy?: number; medium?: number; hard?: number }, over: Partial<BankQuestion> = {}): BankQuestion[] {
  const out: BankQuestion[] = [];
  for (let i = 0; i < (counts.easy || 0); i++) out.push(bankQuestion({ difficulty: DifficultyLevel.Easy, ...over }));
  for (let i = 0; i < (counts.medium || 0); i++) out.push(bankQuestion({ difficulty: DifficultyLevel.Medium, ...over }));
  for (let i = 0; i < (counts.hard || 0); i++) out.push(bankQuestion({ difficulty: DifficultyLevel.Hard, ...over }));
  return out;
}

function blueprint(over: Partial<HomeworkBlueprint> = {}): HomeworkBlueprint {
  return {
    id: "bp-1",
    title: "Test Blueprint",
    subject: Subject.Chemistry,
    grade: "1 Sec",
    lesson: "General Unit",
    tags: [],
    totalQuestions: 20,
    difficultyDistribution: { easyPct: 20, mediumPct: 30, hardPct: 50 },
    allowedQuestionTypes: [QuestionType.MCQ, QuestionType.TrueFalse],
    timeLimitMinutes: 20,
    randomizeQuestionOrder: true,
    randomizeAnswerChoices: true,
    createdAt: 1,
    ...over
  };
}

function countByDifficulty(questions: BankQuestion[]) {
  return {
    Easy: questions.filter((q) => normalizeDifficulty(q.difficulty) === DifficultyLevel.Easy).length,
    Medium: questions.filter((q) => normalizeDifficulty(q.difficulty) === DifficultyLevel.Medium).length,
    Hard: questions.filter((q) => normalizeDifficulty(q.difficulty) === DifficultyLevel.Hard).length
  };
}

// ---------------------------------------------------------------------------
// TEST A — exact 20/30/50 distribution
// ---------------------------------------------------------------------------

describe("Test A — exact difficulty distribution", () => {
  it("produces exactly 4 Easy / 6 Medium / 10 Hard for 20 questions at 20/30/50", () => {
    const bank = makeBank({ easy: 15, medium: 15, hard: 15 });
    const result = selectBlueprintQuestions(blueprint(), bank);

    expect(result.ok).toBe(true);
    expect(result.questions).toHaveLength(20);
    expect(countByDifficulty(result.questions)).toEqual({ Easy: 4, Medium: 6, Hard: 10 });
  });

  it("holds the distribution even when one bucket is far larger than the others", () => {
    // The old implementation drew from a single shuffled pool, so a lopsided bank
    // produced a lopsided assessment. Bucket quotas must be immune to pool size.
    const bank = makeBank({ easy: 4, medium: 6, hard: 200 });
    const result = selectBlueprintQuestions(blueprint(), bank);

    expect(result.ok).toBe(true);
    expect(countByDifficulty(result.questions)).toEqual({ Easy: 4, Medium: 6, Hard: 10 });
  });
});

// ---------------------------------------------------------------------------
// TEST B — filters
// ---------------------------------------------------------------------------

describe("Test B — blueprint filters are enforced", () => {
  it("excludes every question outside the subject / grade / lesson / tag / type filters", () => {
    const wanted = makeBank(
      { easy: 5, medium: 5, hard: 5 },
      { subject: Subject.Physics, grade: "2 Sec", lesson: "Circular Motion", tags: ["kinematics"] }
    );
    const decoys = [
      ...makeBank({ easy: 5, medium: 5, hard: 5 }, { subject: Subject.Biology, grade: "2 Sec", lesson: "Circular Motion", tags: ["kinematics"] }),
      ...makeBank({ easy: 5, medium: 5, hard: 5 }, { subject: Subject.Physics, grade: "3 Sec", lesson: "Circular Motion", tags: ["kinematics"] }),
      ...makeBank({ easy: 5, medium: 5, hard: 5 }, { subject: Subject.Physics, grade: "2 Sec", lesson: "Optics", tags: ["kinematics"] }),
      ...makeBank({ easy: 5, medium: 5, hard: 5 }, { subject: Subject.Physics, grade: "2 Sec", lesson: "Circular Motion", tags: ["thermo"] }),
      ...makeBank({ easy: 5, medium: 5, hard: 5 }, { subject: Subject.Physics, grade: "2 Sec", lesson: "Circular Motion", tags: ["kinematics"], type: QuestionType.ShortAnswer })
    ];

    const bp = blueprint({
      subject: Subject.Physics,
      grade: "2 Sec",
      lesson: "Circular Motion",
      tags: ["kinematics"],
      allowedQuestionTypes: [QuestionType.MCQ, QuestionType.TrueFalse],
      totalQuestions: 10,
      difficultyDistribution: { easyPct: 20, mediumPct: 30, hardPct: 50 }
    });

    const result = selectBlueprintQuestions(bp, [...decoys, ...wanted]);
    expect(result.ok).toBe(true);
    expect(result.questions).toHaveLength(10);

    const wantedIds = new Set(wanted.map((q) => q.id));
    for (const q of result.questions) {
      expect(wantedIds.has(q.id)).toBe(true);
    }
  });

  it("keeps questions marked grade 'General' regardless of the blueprint grade", () => {
    const general = makeBank({ medium: 10 }, { grade: "General" });
    const bp = blueprint({ grade: "3 Sec", totalQuestions: 5, difficultyDistribution: { mediumPct: 100 } });
    const result = selectBlueprintQuestions(bp, general);
    expect(result.ok).toBe(true);
    expect(result.questions).toHaveLength(5);
  });

  it("does NOT fall back to unfiltered bank questions when the filters match nothing", () => {
    // Regression: the previous implementation replaced an empty match with
    // bankQuestions.slice(0, N) — arbitrary off-blueprint questions.
    const bank = makeBank({ easy: 20, medium: 20, hard: 20 }, { subject: Subject.Biology });
    const result = selectBlueprintQuestions(blueprint({ subject: Subject.Physics }), bank);

    expect(result.ok).toBe(false);
    expect(result.questions).toHaveLength(0);
    expect(result.error).toContain("No questions in the Question Bank match");
  });

  it("treats an auto-inserted blank-lesson sentinel as 'no lesson filter'", () => {
    // BlueprintFormModal stores "General Unit" when the teacher leaves the lesson blank.
    // Matching it literally emptied the pool and triggered the unfiltered fallback.
    const bank = makeBank({ easy: 10, medium: 10, hard: 10 }, { lesson: "Thermochemistry" });

    for (const sentinel of ["General Unit", "general unit", "", "  ", "All Lessons", "جميع الدروس"]) {
      const result = selectBlueprintQuestions(blueprint({ lesson: sentinel }), bank);
      expect(result.ok, `sentinel ${JSON.stringify(sentinel)} should not filter`).toBe(true);
      expect(result.questions).toHaveLength(20);
    }
  });

  it("still applies a real lesson name as a substring filter", () => {
    const bank = [
      ...makeBank({ easy: 10, medium: 10, hard: 10 }, { lesson: "Unit 3 — Thermochemistry" }),
      ...makeBank({ easy: 10, medium: 10, hard: 10 }, { lesson: "Optics" })
    ];
    const result = selectBlueprintQuestions(blueprint({ lesson: "thermochemistry" }), bank);
    expect(result.ok).toBe(true);
    for (const q of result.questions) expect(q.lesson).toContain("Thermochemistry");
  });

  it("treats an empty allowedQuestionTypes list as no type constraint", () => {
    // firebase.ts reads a missing allowedQuestionTypes back as [].
    const bank = makeBank({ easy: 10, medium: 10, hard: 10 }, { type: QuestionType.ShortAnswer });
    const result = selectBlueprintQuestions(blueprint({ allowedQuestionTypes: [] }), bank);
    expect(result.ok).toBe(true);
    expect(result.questions).toHaveLength(20);
  });

  it("getEligibleQuestions deduplicates by id", () => {
    const q = bankQuestion({ difficulty: DifficultyLevel.Easy });
    const eligible = getEligibleQuestions(
      { subject: Subject.Chemistry, grade: "1 Sec" },
      [q, { ...q }, { ...q }]
    );
    expect(eligible).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TEST C — repeated generation
// ---------------------------------------------------------------------------

describe("Test C — repeated generation varies questions but never the distribution", () => {
  it("keeps identical difficulty counts across 50 generations", () => {
    const bank = makeBank({ easy: 30, medium: 30, hard: 30 });
    const signatures = new Set<string>();

    for (let i = 0; i < 50; i++) {
      const result = selectBlueprintQuestions(blueprint(), bank);
      expect(result.ok).toBe(true);
      expect(countByDifficulty(result.questions)).toEqual({ Easy: 4, Medium: 6, Hard: 10 });
      signatures.add(result.questions.map((q) => q.id).join("|"));
    }

    // Different draws AND different orders are expected from a pool this large.
    expect(signatures.size).toBeGreaterThan(1);
  });

  it("draws different question sets over repeated runs, not just different orders", () => {
    const bank = makeBank({ easy: 30, medium: 30, hard: 30 });
    const sets = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const result = selectBlueprintQuestions(blueprint(), bank);
      sets.add(result.questions.map((q) => q.id).sort().join("|"));
    }
    expect(sets.size).toBeGreaterThan(1);
  });

  it("never emits duplicate questions within one assessment", () => {
    const bank = makeBank({ easy: 4, medium: 6, hard: 10 });
    for (let i = 0; i < 20; i++) {
      const result = selectBlueprintQuestions(blueprint(), bank);
      expect(result.ok).toBe(true);
      expect(new Set(result.questions.map((q) => q.id)).size).toBe(result.questions.length);
    }
  });

  it("does not leave the final order grouped by difficulty", () => {
    // Selecting bucket-by-bucket would otherwise emit Easy, then Medium, then Hard.
    const bank = makeBank({ easy: 30, medium: 30, hard: 30 });
    let sawInterleaved = false;
    for (let i = 0; i < 30 && !sawInterleaved; i++) {
      const order = selectBlueprintQuestions(blueprint(), bank).questions.map((q) =>
        normalizeDifficulty(q.difficulty)
      );
      const grouped =
        order.join(",") ===
        [...order].sort(
          (a, b) =>
            [DifficultyLevel.Easy, DifficultyLevel.Medium, DifficultyLevel.Hard].indexOf(a) -
            [DifficultyLevel.Easy, DifficultyLevel.Medium, DifficultyLevel.Hard].indexOf(b)
        ).join(",");
      if (!grouped) sawInterleaved = true;
    }
    expect(sawInterleaved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TEST D — insufficient difficulty bucket
// ---------------------------------------------------------------------------

describe("Test D — insufficient pool is rejected, never substituted", () => {
  it("refuses when one bucket is short and names the shortage", () => {
    const bank = makeBank({ easy: 2, medium: 20, hard: 20 });
    const result = selectBlueprintQuestions(blueprint(), bank);

    expect(result.ok).toBe(false);
    expect(result.questions).toHaveLength(0);
    expect(result.shortages).toEqual([
      { level: DifficultyLevel.Easy, required: 4, available: 2 }
    ]);
    expect(result.error).toContain("Not enough eligible questions");
    expect(result.error).toContain("Easy:\n  Required: 4\n  Available: 2");
  });

  it("never backfills a short bucket from another difficulty", () => {
    // The bank holds 42 eligible questions in total — more than the 20 requested — so a
    // naive implementation would happily return 20. It must still refuse.
    const bank = makeBank({ easy: 2, medium: 20, hard: 20 });
    const result = selectBlueprintQuestions(blueprint(), bank);
    expect(result.eligibleCount).toBe(42);
    expect(result.ok).toBe(false);
  });

  it("reports every short bucket at once", () => {
    const bank = makeBank({ easy: 1, medium: 1, hard: 20 });
    const result = selectBlueprintQuestions(blueprint(), bank);
    expect(result.shortages.map((s) => s.level)).toEqual([DifficultyLevel.Easy, DifficultyLevel.Medium]);
    expect(result.error).toContain("Easy:\n  Required: 4\n  Available: 1");
    expect(result.error).toContain("Medium:\n  Required: 6\n  Available: 1");
  });

  it("Test E — refuses when the eligible total is below the requested total", () => {
    // Required 20, eligible 12. Every bucket is short, so nothing can be drawn anywhere.
    const bank = makeBank({ easy: 4, medium: 4, hard: 4 });
    const result = selectBlueprintQuestions(blueprint(), bank);

    expect(result.eligibleCount).toBe(12);
    expect(result.ok).toBe(false);
    expect(result.questions).toHaveLength(0);
    expect(result.shortages.map((s) => s.level)).toEqual([
      DifficultyLevel.Medium,
      DifficultyLevel.Hard
    ]);
  });

  it("Test E — refuses even when the shortfall is only one question", () => {
    const bank = makeBank({ easy: 4, medium: 6, hard: 9 });
    const result = selectBlueprintQuestions(blueprint(), bank);
    expect(result.ok).toBe(false);
    expect(result.shortages).toEqual([
      { level: DifficultyLevel.Hard, required: 10, available: 9 }
    ]);
  });

  it("refuses a blueprint that requests zero questions", () => {
    const result = selectBlueprintQuestions(blueprint({ totalQuestions: 0 }), makeBank({ easy: 10 }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("0 questions");
  });
});

// ---------------------------------------------------------------------------
// TEST E — rounding / apportionment
// ---------------------------------------------------------------------------

describe("Test E — quota rounding", () => {
  it("apportions 7 questions at 33/33/34 to integers summing to exactly 7", () => {
    const quotas = computeDifficultyQuotas(7, { easyPct: 33, mediumPct: 33, hardPct: 34 })!;
    const values = [
      quotas[DifficultyLevel.Easy],
      quotas[DifficultyLevel.Medium],
      quotas[DifficultyLevel.Hard]
    ];

    expect(values.reduce((a, b) => a + b, 0)).toBe(7);
    for (const v of values) expect(Number.isInteger(v)).toBe(true);
    // exact = 2.31 / 2.31 / 2.38 -> floors 2/2/2, the spare seat goes to the largest remainder.
    expect(values).toEqual([2, 2, 3]);
  });

  it("always sums to the requested total and never exceeds it", () => {
    const percentages = [
      { easyPct: 33, mediumPct: 33, hardPct: 34 },
      { easyPct: 20, mediumPct: 30, hardPct: 50 },
      { easyPct: 1, mediumPct: 1, hardPct: 98 },
      { easyPct: 40, mediumPct: 40, hardPct: 20 },
      { easyPct: 0, mediumPct: 0, hardPct: 100 }
    ];

    for (const dist of percentages) {
      for (let total = 1; total <= 60; total++) {
        const q = computeDifficultyQuotas(total, dist)!;
        const values = [q[DifficultyLevel.Easy], q[DifficultyLevel.Medium], q[DifficultyLevel.Hard]];
        expect(values.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
        expect(values.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it("keeps every quota within one question of its exact share", () => {
    const dist = { easyPct: 33, mediumPct: 33, hardPct: 34 };
    for (let total = 1; total <= 60; total++) {
      const q = computeDifficultyQuotas(total, dist)!;
      const pairs: [DifficultyLevel, number][] = [
        [DifficultyLevel.Easy, 33],
        [DifficultyLevel.Medium, 33],
        [DifficultyLevel.Hard, 34]
      ];
      for (const [level, pct] of pairs) {
        expect(Math.abs(q[level] - (total * pct) / 100)).toBeLessThan(1);
      }
    }
  });

  it("normalizes percentages that do not sum to 100", () => {
    // The three sliders move independently and are not constrained to total 100.
    const q = computeDifficultyQuotas(10, { easyPct: 50, mediumPct: 50, hardPct: 100 })!;
    expect(q[DifficultyLevel.Easy] + q[DifficultyLevel.Medium] + q[DifficultyLevel.Hard]).toBe(10);
    expect(q).toEqual({
      [DifficultyLevel.Easy]: 3,
      [DifficultyLevel.Medium]: 2,
      [DifficultyLevel.Hard]: 5
    });
  });

  it("is deterministic for a given blueprint", () => {
    const dist = { easyPct: 33, mediumPct: 33, hardPct: 34 };
    const first = computeDifficultyQuotas(7, dist);
    for (let i = 0; i < 20; i++) {
      expect(computeDifficultyQuotas(7, dist)).toEqual(first);
    }
  });

  it("falls back to stored counts when no percentages are present", () => {
    const q = computeDifficultyQuotas(10, { easyCount: 3, mediumCount: 5, hardCount: 2 })!;
    expect(q).toEqual({
      [DifficultyLevel.Easy]: 3,
      [DifficultyLevel.Medium]: 5,
      [DifficultyLevel.Hard]: 2
    });
  });

  it("re-apportions stored counts that do not sum to the total", () => {
    // BlueprintFormModal used to round each count independently; 7 at 33/33/34 stored 2/2/2.
    const q = computeDifficultyQuotas(7, { easyCount: 2, mediumCount: 2, hardCount: 2 })!;
    expect(q[DifficultyLevel.Easy] + q[DifficultyLevel.Medium] + q[DifficultyLevel.Hard]).toBe(7);
  });

  it("returns null when the blueprint expresses no distribution at all", () => {
    // firebase.ts reads a missing difficultyDistribution back as all-zero counts.
    expect(computeDifficultyQuotas(10, { easyCount: 0, mediumCount: 0, hardCount: 0 })).toBeNull();
    expect(computeDifficultyQuotas(10, undefined)).toBeNull();
    expect(computeDifficultyQuotas(0, { easyPct: 20, mediumPct: 30, hardPct: 50 })).toBeNull();
  });

  it("still generates a filter-strict assessment for a blueprint with no distribution", () => {
    const bank = makeBank({ easy: 10, medium: 10, hard: 10 });
    const bp = blueprint({ difficultyDistribution: { easyCount: 0, mediumCount: 0, hardCount: 0 } });
    const result = selectBlueprintQuestions(bp, bank);

    expect(result.ok).toBe(true);
    expect(result.quotas).toBeNull();
    expect(result.questions).toHaveLength(20);
  });

  it("refuses an unconstrained blueprint whose pool is simply too small", () => {
    const bank = makeBank({ easy: 3, medium: 3, hard: 3 });
    const bp = blueprint({ difficultyDistribution: {} });
    const result = selectBlueprintQuestions(bp, bank);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Available after Blueprint filters: 9");
  });
});

// ---------------------------------------------------------------------------
// Difficulty normalization
// ---------------------------------------------------------------------------

describe("difficulty normalization", () => {
  it("maps canonical, legacy and absent values the way the app already does", () => {
    expect(normalizeDifficulty(DifficultyLevel.Easy)).toBe(DifficultyLevel.Easy);
    expect(normalizeDifficulty("easy")).toBe(DifficultyLevel.Easy);
    expect(normalizeDifficulty("  EASY  ")).toBe(DifficultyLevel.Easy);
    expect(normalizeDifficulty("Very Easy")).toBe(DifficultyLevel.Easy);
    expect(normalizeDifficulty("Hard")).toBe(DifficultyLevel.Hard);
    expect(normalizeDifficulty("HARD")).toBe(DifficultyLevel.Hard);
    // Absent / unknown defaults to Medium, matching saveBankQuestionToFirestore.
    expect(normalizeDifficulty(undefined)).toBe(DifficultyLevel.Medium);
    expect(normalizeDifficulty(null)).toBe(DifficultyLevel.Medium);
    expect(normalizeDifficulty("")).toBe(DifficultyLevel.Medium);
    expect(normalizeDifficulty("unspecified")).toBe(DifficultyLevel.Medium);
  });

  it("counts legacy-cased questions in the right bucket during selection", () => {
    const bank = [
      ...makeBank({}, {}),
      ...Array.from({ length: 10 }, () => bankQuestion({ difficulty: "easy" as any })),
      ...Array.from({ length: 10 }, () => bankQuestion({ difficulty: "HARD" as any })),
      ...Array.from({ length: 10 }, () => bankQuestion({ difficulty: undefined as any }))
    ];
    const result = selectBlueprintQuestions(blueprint(), bank);
    expect(result.ok).toBe(true);
    expect(countByDifficulty(result.questions)).toEqual({ Easy: 4, Medium: 6, Hard: 10 });
  });
});

// ---------------------------------------------------------------------------
// Defensive validation
// ---------------------------------------------------------------------------

describe("defensive validation", () => {
  const filters = { subject: Subject.Chemistry, grade: "1 Sec" };

  it("passes a correct selection", () => {
    const questions = makeBank({ easy: 1, medium: 1, hard: 2 });
    const quotas = {
      [DifficultyLevel.Easy]: 1,
      [DifficultyLevel.Medium]: 1,
      [DifficultyLevel.Hard]: 2
    };
    expect(validateSelection(questions, filters, quotas, 4)).toBe("");
  });

  it("rejects a question that violates the filters", () => {
    const questions = [...makeBank({ easy: 1 }), bankQuestion({ subject: Subject.Biology, difficulty: DifficultyLevel.Easy })];
    const quotas = {
      [DifficultyLevel.Easy]: 2,
      [DifficultyLevel.Medium]: 0,
      [DifficultyLevel.Hard]: 0
    };
    expect(validateSelection(questions, filters, quotas, 2)).toContain("does not match the Blueprint filters");
  });

  it("rejects a difficulty count that misses its quota", () => {
    const questions = makeBank({ easy: 3 });
    const quotas = {
      [DifficultyLevel.Easy]: 2,
      [DifficultyLevel.Medium]: 1,
      [DifficultyLevel.Hard]: 0
    };
    expect(validateSelection(questions, filters, quotas, 3)).toContain("Easy questions but the Blueprint requires 2");
  });

  it("rejects a wrong total", () => {
    expect(validateSelection(makeBank({ easy: 3 }), filters, null, 5)).toContain("generated 3 questions");
  });

  it("rejects a duplicated question", () => {
    const q = bankQuestion({ difficulty: DifficultyLevel.Easy });
    expect(validateSelection([q, q], filters, null, 2)).toContain("was selected twice");
  });
});

// ---------------------------------------------------------------------------
// TEST B — the teacher-visible matching count
// ---------------------------------------------------------------------------

describe("Test B — teacher-visible matching count", () => {
  /**
   * 50 bank questions, of which exactly 17 satisfy the blueprint. The UI panel renders
   * analyzeBlueprintPool(...).eligibleCount, so asserting on that function is asserting on
   * the number the teacher reads.
   */
  function bankWith17Matches() {
    const matching = [
      ...makeBank({ easy: 5 }, { subject: Subject.Physics, grade: "2 Sec", lesson: "Fractions", tags: ["algebra"] }),
      ...makeBank({ medium: 6 }, { subject: Subject.Physics, grade: "2 Sec", lesson: "Fractions", tags: ["algebra"] }),
      ...makeBank({ hard: 6 }, { subject: Subject.Physics, grade: "2 Sec", lesson: "Fractions", tags: ["algebra"] })
    ];
    const nonMatching = [
      ...makeBank({ easy: 8 }, { subject: Subject.Biology, grade: "2 Sec", lesson: "Fractions", tags: ["algebra"] }),
      ...makeBank({ medium: 8 }, { subject: Subject.Physics, grade: "3 Sec", lesson: "Fractions", tags: ["algebra"] }),
      ...makeBank({ hard: 8 }, { subject: Subject.Physics, grade: "2 Sec", lesson: "Geometry", tags: ["algebra"] }),
      ...makeBank({ medium: 9 }, { subject: Subject.Physics, grade: "2 Sec", lesson: "Fractions", tags: ["calculus"] })
    ];
    expect(matching.length + nonMatching.length).toBe(50);
    return { matching, nonMatching, bank: [...nonMatching, ...matching] };
  }

  const bp = () =>
    blueprint({
      subject: Subject.Physics,
      grade: "2 Sec",
      lesson: "Fractions",
      tags: ["algebra"],
      totalQuestions: 10,
      difficultyDistribution: { easyPct: 20, mediumPct: 30, hardPct: 50 }
    });

  it("reports 17 matching questions out of a 50-question bank", () => {
    const { bank } = bankWith17Matches();
    expect(analyzeBlueprintPool(bp(), bank).eligibleCount).toBe(17);
  });

  it("the generator sees exactly those same 17 questions", () => {
    const { matching, bank } = bankWith17Matches();
    const analysis = analyzeBlueprintPool(bp(), bank);
    const matchingIds = new Set(matching.map((q) => q.id));

    expect(new Set(analysis.eligible.map((q) => q.id))).toEqual(matchingIds);

    // And every question the generator actually picks comes from that same set.
    for (let i = 0; i < 25; i++) {
      const result = selectBlueprintQuestions(bp(), bank);
      expect(result.ok).toBe(true);
      expect(result.eligibleCount).toBe(17);
      for (const q of result.questions) expect(matchingIds.has(q.id)).toBe(true);
    }
  });

  it("the displayed count never disagrees with the generator's pool", () => {
    // The property the whole shared-helper design exists to guarantee, checked across a
    // spread of blueprints rather than one hand-picked case.
    const { bank } = bankWith17Matches();
    const variants = [
      bp(),
      blueprint({ subject: Subject.Physics, grade: "2 Sec", lesson: "Fractions", tags: [], totalQuestions: 10 }),
      blueprint({ subject: Subject.Physics, grade: "", lesson: "", tags: [], totalQuestions: 5 }),
      blueprint({ subject: Subject.Biology, grade: "2 Sec", lesson: "Fractions", tags: ["algebra"], totalQuestions: 3 }),
      blueprint({ subject: Subject.Physics, grade: "2 Sec", lesson: "Geometry", tags: ["algebra"], totalQuestions: 4 })
    ];

    for (const variant of variants) {
      const displayed = analyzeBlueprintPool(variant, bank).eligibleCount;
      const generator = selectBlueprintQuestions(variant, bank).eligibleCount;
      expect(generator).toBe(displayed);
    }
  });

  it("never reports a count the generator would silently expand", () => {
    // A blueprint asking for more than the pool holds must surface as an error, never as a
    // generation that quietly reached beyond the eligible set.
    const { bank } = bankWith17Matches();
    const greedy = blueprint({
      subject: Subject.Physics,
      grade: "2 Sec",
      lesson: "Fractions",
      tags: ["algebra"],
      totalQuestions: 40,
      difficultyDistribution: { easyPct: 20, mediumPct: 30, hardPct: 50 }
    });

    const analysis = analyzeBlueprintPool(greedy, bank);
    expect(analysis.eligibleCount).toBe(17);
    expect(analysis.error).not.toBe("");

    const result = selectBlueprintQuestions(greedy, bank);
    expect(result.ok).toBe(false);
    expect(result.questions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TEST C — the count responds to each filter
// ---------------------------------------------------------------------------

describe("Test C — matching count changes as filters change", () => {
  // One bank, deliberately layered so each added filter cuts the pool further.
  const bank = [
    // 20 that survive every filter below.
    ...makeBank({ easy: 8, medium: 6, hard: 6 }, { subject: Subject.Physics, grade: "2 Sec", lesson: "Fractions", tags: ["algebra"], type: QuestionType.MCQ }),
    // Right subject/grade/lesson/tag, wrong type.
    ...makeBank({ medium: 7 }, { subject: Subject.Physics, grade: "2 Sec", lesson: "Fractions", tags: ["algebra"], type: QuestionType.ShortAnswer }),
    // Right subject/grade/lesson, wrong tag.
    ...makeBank({ medium: 9 }, { subject: Subject.Physics, grade: "2 Sec", lesson: "Fractions", tags: ["calculus"], type: QuestionType.MCQ }),
    // Right subject/grade, wrong lesson.
    ...makeBank({ medium: 11 }, { subject: Subject.Physics, grade: "2 Sec", lesson: "Geometry", tags: ["algebra"], type: QuestionType.MCQ }),
    // Right subject, wrong grade.
    ...makeBank({ medium: 13 }, { subject: Subject.Physics, grade: "3 Sec", lesson: "Fractions", tags: ["algebra"], type: QuestionType.MCQ }),
    // Wrong subject entirely.
    ...makeBank({ medium: 17 }, { subject: Subject.Biology, grade: "2 Sec", lesson: "Fractions", tags: ["algebra"], type: QuestionType.MCQ })
  ];

  const countFor = (over: Partial<HomeworkBlueprint>) =>
    analyzeBlueprintPool(blueprint({ totalQuestions: 1, ...over }), bank).eligibleCount;

  it("narrows monotonically as each filter is added", () => {
    const subjectOnly = countFor({ subject: Subject.Physics, grade: "", lesson: "", tags: [], allowedQuestionTypes: [] });
    const plusGrade = countFor({ subject: Subject.Physics, grade: "2 Sec", lesson: "", tags: [], allowedQuestionTypes: [] });
    const plusLesson = countFor({ subject: Subject.Physics, grade: "2 Sec", lesson: "Fractions", tags: [], allowedQuestionTypes: [] });
    const plusTag = countFor({ subject: Subject.Physics, grade: "2 Sec", lesson: "Fractions", tags: ["algebra"], allowedQuestionTypes: [] });
    const plusType = countFor({ subject: Subject.Physics, grade: "2 Sec", lesson: "Fractions", tags: ["algebra"], allowedQuestionTypes: [QuestionType.MCQ] });

    expect(subjectOnly).toBe(20 + 7 + 9 + 11 + 13);
    expect(plusGrade).toBe(20 + 7 + 9 + 11);
    expect(plusLesson).toBe(20 + 7 + 9);
    expect(plusTag).toBe(20 + 7);
    expect(plusType).toBe(20);

    // Strictly decreasing — every filter demonstrably does something.
    const steps = [subjectOnly, plusGrade, plusLesson, plusTag, plusType];
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
  });

  it("reaches zero when a filter matches nothing, and blocks creation there", () => {
    const bpZero = blueprint({ subject: Subject.Chemistry, grade: "2 Sec", lesson: "Fractions", tags: ["algebra"], totalQuestions: 5 });
    const analysis = analyzeBlueprintPool(bpZero, bank);
    expect(analysis.eligibleCount).toBe(0);
    expect(analysis.error).toContain("No questions in the Question Bank match");
    expect(selectBlueprintQuestions(bpZero, bank).ok).toBe(false);
  });

  it("uses the same predicate the count and the generator share", () => {
    const bp = blueprint({ subject: Subject.Physics, grade: "2 Sec", lesson: "Fractions", tags: ["algebra"], allowedQuestionTypes: [QuestionType.MCQ], totalQuestions: 1 });
    const viaPredicate = bank.filter((q) => matchesBlueprintFilters(q, blueprintFilters(bp))).length;
    expect(analyzeBlueprintPool(bp, bank).eligibleCount).toBe(viaPredicate);
  });
});

// ---------------------------------------------------------------------------
// TEST F — what the student receives
// ---------------------------------------------------------------------------

describe("Test F — the stored assessment is what the student sits", () => {
  it("selection output survives the modal's question mapping unchanged in identity and difficulty", () => {
    // QuizHomeworkAssignmentModal maps the selection onto the Quiz question shape.
    // Ids and difficulty must survive, because attemptPaper.ts keys per-student
    // shuffling off the stored question ids and never re-draws from the bank.
    const bank = makeBank({ easy: 15, medium: 15, hard: 15 });
    const result = selectBlueprintQuestions(blueprint(), bank);
    expect(result.ok).toBe(true);

    const mapped = result.questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      options: q.options,
      correctAnswerIndex: q.correctAnswerIndex,
      subject: q.subject,
      lesson: q.lesson,
      difficulty: q.difficulty
    }));

    expect(mapped.map((q) => q.id)).toEqual(result.questions.map((q) => q.id));
    expect(countByDifficulty(mapped as BankQuestion[])).toEqual({ Easy: 4, Medium: 6, Hard: 10 });
  });

  /**
   * TEST K — student retrieval.
   *
   * Drives the real per-attempt randomization (lib/attemptPaper.ts) over a generated
   * assessment. The student path resolves the assessment's stored questionIds
   * (firebase.ts: saveAssessmentToFirestore writes `quiz.questions.map(q => q.id)`, and
   * fetchQuestionsByIdsFromFirestore reads exactly that list back), then applies the
   * attempt paper. Nothing in that chain can reach the question bank.
   */
  it("Test K — student randomization reorders the saved questions and introduces none", () => {
    const bank = makeBank({ easy: 30, medium: 30, hard: 30 });
    const generated = selectBlueprintQuestions(blueprint(), bank);
    expect(generated.ok).toBe(true);

    // What saveAssessmentToFirestore persists.
    const savedIds = generated.questions.map((q) => q.id);
    const savedSet = new Set(savedIds);

    for (let seed = 1; seed <= 25; seed++) {
      const plan = buildAttemptPaper(generated.questions, { shuffleQuestions: true, shuffleOptions: true }, seed);
      const delivered = applyAttemptPaper(generated.questions, plan);

      // Same membership, same count — a permutation, nothing more.
      expect(delivered).toHaveLength(savedIds.length);
      expect(new Set(delivered.map((q) => q.id))).toEqual(savedSet);
      for (const q of delivered) expect(savedSet.has(q.id)).toBe(true);

      // Difficulty distribution survives student-side randomization untouched.
      expect(countByDifficulty(delivered as BankQuestion[])).toEqual({ Easy: 4, Medium: 6, Hard: 10 });

      // Filter compliance survives too.
      for (const q of delivered) {
        expect(matchesBlueprintFilters(q, blueprintFilters(blueprint()))).toBe(true);
      }
    }
  });

  it("Test K — a student attempt cannot pull in a question outside the saved set", () => {
    const bank = makeBank({ easy: 30, medium: 30, hard: 30 });
    const generated = selectBlueprintQuestions(blueprint(), bank);
    const savedSet = new Set(generated.questions.map((q) => q.id));

    // An attempt whose stored questionIds name questions that are NOT in the assessment
    // (a tampered or stale attempt document) must not cause them to be served.
    const intruder = bank.find((q) => !savedSet.has(q.id))!;
    const delivered = applyAttemptPaper(generated.questions, {
      questionIds: [...generated.questions.map((q) => q.id), intruder.id],
      optionPermutations: {}
    });

    expect(delivered.map((q) => q.id)).not.toContain(intruder.id);
    expect(new Set(delivered.map((q) => q.id))).toEqual(savedSet);
  });

  it("Test K — student option shuffling keeps the correct answer correct", () => {
    const bank = makeBank({ easy: 30, medium: 30, hard: 30 });
    const generated = selectBlueprintQuestions(blueprint(), bank);
    const canonicalById = new Map(generated.questions.map((q) => [q.id, q]));

    for (let seed = 1; seed <= 10; seed++) {
      const plan = buildAttemptPaper(generated.questions, { shuffleQuestions: true, shuffleOptions: true }, seed);
      for (const shown of applyAttemptPaper(generated.questions, plan)) {
        const canonical = canonicalById.get(shown.id)!;
        expect(shown.options[shown.correctAnswerIndex]).toBe(
          canonical.options[canonical.correctAnswerIndex]
        );
      }
    }
  });

  it("every stored question still satisfies the blueprint filters after mapping", () => {
    const bp = blueprint({ lesson: "Thermochemistry", tags: ["heat"] });
    const bank = makeBank({ easy: 10, medium: 10, hard: 10 }, { lesson: "Thermochemistry", tags: ["heat"] });
    const result = selectBlueprintQuestions(bp, bank);

    expect(result.ok).toBe(true);
    for (const q of result.questions) {
      expect(
        matchesBlueprintFilters(q, {
          subject: bp.subject,
          grade: bp.grade,
          lesson: bp.lesson,
          tags: bp.tags,
          allowedQuestionTypes: bp.allowedQuestionTypes
        })
      ).toBe(true);
    }
  });
});
