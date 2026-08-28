/**
 * Per-attempt randomization — executable verification.
 *
 * These cover the properties the feature is actually judged on: different students differ, one
 * attempt never changes, canonical truth survives, and scoring still identifies the right choice.
 * The identity cases matter most — they are what guarantee existing attempts and reports are
 * unaffected.
 */

import { describe, it, expect } from "vitest";
import {
  buildAttemptPaper,
  applyAttemptPaper,
  toCanonicalOptionIndex,
  generateAttemptSeed,
  hashToSeed
} from "../src/lib/attemptPaper";
import { Question, QuestionType } from "../src/types";

function mcq(id: string, correct = 0): Question {
  return {
    id,
    type: QuestionType.MCQ,
    text: `Question ${id}`,
    options: [`${id}-opt0`, `${id}-opt1`, `${id}-opt2`, `${id}-opt3`],
    correctAnswerIndex: correct
  };
}

const QUESTIONS: Question[] = [mcq("qA", 0), mcq("qB", 1), mcq("qC", 2), mcq("qD", 3), mcq("qE", 1)];

const OFF = { shuffleQuestions: false, shuffleOptions: false };

describe("buildAttemptPaper", () => {
  it("both flags off: canonical order, no permutations", () => {
    const plan = buildAttemptPaper(QUESTIONS, OFF, 12345);
    expect(plan.questionIds).toEqual(["qA", "qB", "qC", "qD", "qE"]);
    expect(plan.optionPermutations).toEqual({});
  });

  it("question shuffle only: order varies, option order untouched", () => {
    const plan = buildAttemptPaper(QUESTIONS, { shuffleQuestions: true, shuffleOptions: false }, 42);
    expect([...plan.questionIds].sort()).toEqual(["qA", "qB", "qC", "qD", "qE"]);
    expect(plan.optionPermutations).toEqual({});
  });

  it("choice shuffle only: question order canonical, every permutation valid", () => {
    const plan = buildAttemptPaper(QUESTIONS, { shuffleQuestions: false, shuffleOptions: true }, 42);
    expect(plan.questionIds).toEqual(["qA", "qB", "qC", "qD", "qE"]);
    for (const q of QUESTIONS) {
      expect([...plan.optionPermutations[q.id]].sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it("is deterministic: the same seed reproduces the same plan exactly", () => {
    const a = buildAttemptPaper(QUESTIONS, { shuffleQuestions: true, shuffleOptions: true }, 999);
    const b = buildAttemptPaper(QUESTIONS, { shuffleQuestions: true, shuffleOptions: true }, 999);
    expect(a).toEqual(b);
  });

  it("different seeds give different arrangements for the overwhelming majority of pairs", () => {
    // This is the "two students see different papers" property. Sampled rather than asserted on
    // one pair, because any two shuffles can legitimately coincide by chance.
    const opts = { shuffleQuestions: true, shuffleOptions: true };
    const orders = new Set<string>();
    const perms = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const plan = buildAttemptPaper(QUESTIONS, opts, seed);
      orders.add(plan.questionIds.join(","));
      perms.add(JSON.stringify(plan.optionPermutations));
    }
    // 5 questions => 120 possible orders. Anything near 1 would mean the shuffle is not seeded.
    expect(orders.size).toBeGreaterThan(50);
    expect(perms.size).toBeGreaterThan(150);
  });

  it("does not shuffle True/False or short-answer options", () => {
    const tf: Question = {
      id: "tf1", type: QuestionType.TrueFalse, text: "T or F",
      options: ["True", "False"], correctAnswerIndex: 0
    };
    const sa: Question = {
      id: "sa1", type: QuestionType.ShortAnswer, text: "Explain",
      options: [], correctAnswerIndex: 0
    };
    const plan = buildAttemptPaper([tf, sa], { shuffleOptions: true }, 7);
    expect(plan.optionPermutations).toEqual({});
  });

  it("question order for a given seed does not depend on the option flag", () => {
    const a = buildAttemptPaper(QUESTIONS, { shuffleQuestions: true, shuffleOptions: false }, 555);
    const b = buildAttemptPaper(QUESTIONS, { shuffleQuestions: true, shuffleOptions: true }, 555);
    expect(a.questionIds).toEqual(b.questionIds);
  });
});

/**
 * INVARIANT A — the canonical assessment definition is never mutated.
 *
 * Randomization is presentation-only. If either function mutated its input, the teacher's own
 * assessment/blueprint/question bank would be reordered by a student sitting the quiz — and,
 * because `quiz.questions` is shared state in React, the next student would inherit it.
 */
describe("canonical definition is never mutated", () => {
  it("buildAttemptPaper does not touch the questions it is given", () => {
    const before = JSON.parse(JSON.stringify(QUESTIONS));
    for (let seed = 1; seed <= 25; seed++) {
      buildAttemptPaper(QUESTIONS, { shuffleQuestions: true, shuffleOptions: true }, seed);
    }
    expect(QUESTIONS).toEqual(before);
    expect(QUESTIONS.map((q) => q.id)).toEqual(["qA", "qB", "qC", "qD", "qE"]);
    expect(QUESTIONS[0].options).toEqual(["qA-opt0", "qA-opt1", "qA-opt2", "qA-opt3"]);
  });

  it("applyAttemptPaper does not touch the questions or the attempt it is given", () => {
    const plan = buildAttemptPaper(QUESTIONS, { shuffleQuestions: true, shuffleOptions: true }, 77);
    const questionsBefore = JSON.parse(JSON.stringify(QUESTIONS));
    const planBefore = JSON.parse(JSON.stringify(plan));

    applyAttemptPaper(QUESTIONS, plan);
    applyAttemptPaper(QUESTIONS, plan);

    expect(QUESTIONS).toEqual(questionsBefore);
    expect(plan).toEqual(planBefore);
  });

  it("mutating the returned paper cannot corrupt the canonical questions", () => {
    const plan = buildAttemptPaper(QUESTIONS, { shuffleOptions: true }, 5);
    const paper = applyAttemptPaper(QUESTIONS, plan);
    paper[0].options[0] = "TAMPERED";
    paper.reverse();
    // The shuffled question objects are copies; the canonical originals are untouched.
    expect(QUESTIONS.map((q) => q.id)).toEqual(["qA", "qB", "qC", "qD", "qE"]);
    expect(QUESTIONS.some((q) => q.options.includes("TAMPERED"))).toBe(false);
  });

  it("two attempts by the same student produce independent papers (Paper A vs Paper B)", () => {
    // Same student, same assessment, different attempt id -> different seed -> different paper,
    // and neither plan shares mutable state with the other.
    const seedA = hashToSeed("quiz-1__c_AAAA");
    const seedB = hashToSeed("quiz-1__c_AAAA__a2");
    expect(seedA).not.toBe(seedB);

    const planA = buildAttemptPaper(QUESTIONS, { shuffleQuestions: true, shuffleOptions: true }, seedA);
    const planB = buildAttemptPaper(QUESTIONS, { shuffleQuestions: true, shuffleOptions: true }, seedB);

    const identical =
      planA.questionIds.join(",") === planB.questionIds.join(",") &&
      JSON.stringify(planA.optionPermutations) === JSON.stringify(planB.optionPermutations);
    expect(identical).toBe(false);

    // Regenerating A after B has been built still yields A — no shared PRNG state.
    const planAAgain = buildAttemptPaper(QUESTIONS, { shuffleQuestions: true, shuffleOptions: true }, seedA);
    expect(planAAgain).toEqual(planA);
  });
});

describe("applyAttemptPaper — backward compatibility", () => {
  it("returns the input unchanged for a legacy attempt (canonical ids, no permutations)", () => {
    const legacy = { questionIds: QUESTIONS.map((q) => q.id), optionPermutations: {} };
    expect(applyAttemptPaper(QUESTIONS, legacy)).toEqual(QUESTIONS);
  });

  it("returns the input unchanged when the attempt has no stored order at all", () => {
    expect(applyAttemptPaper(QUESTIONS, { questionIds: [] })).toEqual(QUESTIONS);
    expect(applyAttemptPaper(QUESTIONS, null)).toEqual(QUESTIONS);
  });

  it("ignores a corrupt permutation rather than mangling the question", () => {
    const bad = {
      questionIds: ["qA"],
      optionPermutations: { qA: [0, 0, 1, 2] as number[] } // duplicate index
    };
    expect(applyAttemptPaper([mcq("qA", 0)], bad)[0].options).toEqual(mcq("qA").options);

    const wrongLength = { questionIds: ["qA"], optionPermutations: { qA: [1, 0] } };
    expect(applyAttemptPaper([mcq("qA", 0)], wrongLength)[0].options).toEqual(mcq("qA").options);
  });
});

describe("applyAttemptPaper — correctness under shuffling", () => {
  const opts = { shuffleQuestions: true, shuffleOptions: true };

  it("preserves the identity of the correct answer for every question and seed", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const plan = buildAttemptPaper(QUESTIONS, opts, seed);
      const paper = applyAttemptPaper(QUESTIONS, plan);

      expect(paper).toHaveLength(QUESTIONS.length);

      for (const shown of paper) {
        const canonical = QUESTIONS.find((q) => q.id === shown.id)!;
        // The option text at the shown correct index must be the canonical correct option text.
        expect(shown.options[shown.correctAnswerIndex]).toBe(
          canonical.options[canonical.correctAnswerIndex]
        );
        // And the shown options must be the same set, not new content.
        expect([...shown.options].sort()).toEqual([...canonical.options].sort());
      }
    }
  });

  it("presents questions in the attempt's stored order", () => {
    const plan = buildAttemptPaper(QUESTIONS, opts, 31337);
    const paper = applyAttemptPaper(QUESTIONS, plan);
    expect(paper.map((q) => q.id)).toEqual(plan.questionIds);
  });

  it("is stable: re-applying the SAME stored attempt gives the same paper (page refresh)", () => {
    const plan = buildAttemptPaper(QUESTIONS, opts, 24680);
    const first = applyAttemptPaper(QUESTIONS, plan);
    const second = applyAttemptPaper(QUESTIONS, plan);
    const third = applyAttemptPaper(QUESTIONS, plan);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("freezes the question set: a question added to the assessment later does not appear", () => {
    const plan = buildAttemptPaper(QUESTIONS, opts, 11);
    const withExtra = [...QUESTIONS, mcq("qLATE", 0)];
    const paper = applyAttemptPaper(withExtra, plan);
    expect(paper.map((q) => q.id)).not.toContain("qLATE");
    expect(paper).toHaveLength(QUESTIONS.length);
  });

  it("survives a question deleted from the bank after the attempt started", () => {
    const plan = buildAttemptPaper(QUESTIONS, opts, 12);
    const withoutOne = QUESTIONS.filter((q) => q.id !== "qC");
    const paper = applyAttemptPaper(withoutOne, plan);
    expect(paper.map((q) => q.id)).not.toContain("qC");
    expect(paper).toHaveLength(QUESTIONS.length - 1);
  });
});

describe("toCanonicalOptionIndex", () => {
  it("maps a shown position back to the underlying canonical choice", () => {
    const plan = buildAttemptPaper(QUESTIONS, { shuffleOptions: true }, 4242);
    const paper = applyAttemptPaper(QUESTIONS, plan);

    for (const shown of paper) {
      const canonical = QUESTIONS.find((q) => q.id === shown.id)!;
      for (let displayIdx = 0; displayIdx < shown.options.length; displayIdx++) {
        const canonicalIdx = toCanonicalOptionIndex(plan, shown.id, displayIdx);
        // The choice named by the canonical index must be the very option shown at that position.
        expect(canonical.options[canonicalIdx]).toBe(shown.options[displayIdx]);
      }
    }
  });

  it("maps the student's correct pick back to the canonical correct index", () => {
    const plan = buildAttemptPaper(QUESTIONS, { shuffleOptions: true }, 606);
    const paper = applyAttemptPaper(QUESTIONS, plan);

    for (const shown of paper) {
      const canonical = QUESTIONS.find((q) => q.id === shown.id)!;
      // A student clicking the option the paper marks correct...
      const picked = shown.correctAnswerIndex;
      // ...must resolve to the canonical correct answer.
      expect(toCanonicalOptionIndex(plan, shown.id, picked)).toBe(canonical.correctAnswerIndex);
    }
  });

  it("passes through unanswered (-1) and unshuffled questions unchanged", () => {
    expect(toCanonicalOptionIndex({ optionPermutations: {} }, "qA", -1)).toBe(-1);
    expect(toCanonicalOptionIndex({ optionPermutations: {} }, "qA", 2)).toBe(2);
    expect(toCanonicalOptionIndex(null, "qA", 3)).toBe(3);
  });
});

describe("seeding", () => {
  it("hashToSeed is stable and varies with input", () => {
    expect(hashToSeed("quiz-1__c_AAAA")).toBe(hashToSeed("quiz-1__c_AAAA"));
    expect(hashToSeed("quiz-1__c_AAAA")).not.toBe(hashToSeed("quiz-1__c_AAAA__a2"));
  });

  it("generateAttemptSeed produces distinct seeds across attempts", () => {
    const seeds = new Set<number>();
    for (let i = 0; i < 500; i++) seeds.add(generateAttemptSeed(`quiz-1__c_A${i}`));
    expect(seeds.size).toBeGreaterThan(490);
  });
});

/**
 * End-to-end grading simulation.
 *
 * Reproduces what StudentQuiz does: render the paper, record a display index per question, then
 * grade by comparing that index to the paper's correctAnswerIndex. This is the property that
 * matters most — a shuffled paper must score exactly like an unshuffled one.
 */
describe("scoring is unaffected by shuffling", () => {
  function simulate(seed: number, shuffle: boolean, pickCorrectFor: Set<string>) {
    const plan = buildAttemptPaper(
      QUESTIONS,
      { shuffleQuestions: shuffle, shuffleOptions: shuffle },
      seed
    );
    const paper = applyAttemptPaper(QUESTIONS, plan);

    let score = 0;
    const answers = paper.map((q, displayIdx) => {
      // The student picks the right answer for the chosen ids, and a wrong one otherwise.
      const studentAnswerIndex = pickCorrectFor.has(q.id)
        ? q.correctAnswerIndex
        : (q.correctAnswerIndex + 1) % q.options.length;
      const isCorrect = studentAnswerIndex === q.correctAnswerIndex;
      if (isCorrect) score++;
      return {
        questionId: q.id,
        displayIdx,
        studentAnswerIndex,
        canonicalAnswerIndex: toCanonicalOptionIndex(plan, q.id, studentAnswerIndex),
        isCorrect
      };
    });
    return { score, answers };
  }

  it("scores the same shuffled and unshuffled, for many seeds", () => {
    const correctSet = new Set(["qA", "qC", "qE"]);
    const unshuffled = simulate(1, false, correctSet);
    expect(unshuffled.score).toBe(3);

    for (let seed = 1; seed <= 100; seed++) {
      expect(simulate(seed, true, correctSet).score).toBe(3);
    }
  });

  it("records the canonical choice, so a right answer maps to the canonical correct index", () => {
    const all = new Set(QUESTIONS.map((q) => q.id));
    for (let seed = 1; seed <= 50; seed++) {
      const { answers, score } = simulate(seed, true, all);
      expect(score).toBe(QUESTIONS.length);
      for (const a of answers) {
        const canonical = QUESTIONS.find((q) => q.id === a.questionId)!;
        expect(a.canonicalAnswerIndex).toBe(canonical.correctAnswerIndex);
      }
    }
  });
});
