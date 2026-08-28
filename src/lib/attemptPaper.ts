/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PER-ATTEMPT RANDOMIZATION
 * =========================
 *
 * "The paper" is the arrangement of questions and options ONE attempt presents. It is generated
 * once, when the attempt document is created, and persisted onto that document. It is never
 * derived from the assessment, and the assessment is never reordered to produce it.
 *
 * WHY HERE AND NOT AT ASSESSMENT CREATION
 * ---------------------------------------
 * Randomization used to run once, in QuizHomeworkAssignmentModal, against the assessment itself:
 * the shuffled order became the canonical order and every student then received that same order.
 * Shuffling at assessment level cannot produce per-student variation by construction — there is
 * only one assessment document. So the shuffle moved to the only object that is per-student and
 * per-sitting: the attempt (`studentAssignments/{attemptId}`).
 *
 * THE THREE PROPERTIES THIS MODULE HAS TO DELIVER
 * -----------------------------------------------
 * 1. Different students differ. Two students get two attempt documents with two seeds.
 * 2. One attempt never changes. The arrangement is persisted at creation, and
 *    startOrResumeAttempt returns an existing attempt untouched — so a refresh, a reload, a new
 *    device or a resumed session all replay the same stored arrangement. Nothing reshuffles.
 * 3. Canonical truth is recoverable. `optionPermutations[qId][displayIndex] = canonicalIndex`,
 *    so any display position can be mapped back to the underlying choice at any time. The
 *    teacher's assessment, blueprint and question bank keep their defined order throughout.
 *
 * The seed is stored as well as the result. The stored arrangement is the authority; the seed
 * makes it reproducible (and this module unit-testable) if a permutation is ever lost.
 *
 * BACKWARD COMPATIBILITY — the load-bearing property
 * -------------------------------------------------
 * `applyAttemptPaper` is an EXACT identity transform when the attempt carries no permutations and
 * its questionIds are the canonical order. Every attempt written before this module existed is
 * exactly that, so historical attempts, submissions and A4 reports render byte-identically.
 */

import { Question, QuestionType, StudentAssignmentDocument } from "../types";

export interface AttemptPaperOptions {
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
}

export interface AttemptPaperPlan {
  /** Question ids in presentation order. */
  questionIds: string[];
  /** `perm[displayIndex] = canonicalIndex`, keyed by question id. Only shuffled questions appear. */
  optionPermutations: Record<string, number[]>;
}

/**
 * mulberry32 — small, fast, well-distributed 32-bit PRNG.
 *
 * `Math.random()` cannot be used for the shuffle itself: an attempt has to be reproducible from
 * its seed, and Math.random has no seed. (The seed is not a secret and does not need to be
 * unguessable — it decides presentation order, not correctness. Nothing security-relevant rests
 * on it.)
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash, so an attempt id alone can produce a usable seed. */
export function hashToSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * A fresh seed for a new attempt. Crypto where available so two students starting at the same
 * millisecond cannot collide; the attempt id is mixed in for the same reason.
 */
export function generateAttemptSeed(attemptId: string): number {
  const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  let random: number;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    cryptoObj.getRandomValues(buf);
    random = buf[0];
  } else {
    random = Math.floor(Math.random() * 4294967296);
  }
  return (random ^ hashToSeed(attemptId)) >>> 0;
}

/** Seeded Fisher-Yates. Returns a new array; the input is never mutated. */
function seededShuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Only MCQ options carry meaning in a shuffled order.
 *
 * True/False is deliberately excluded: presenting "False / True" reads as a mistake rather than as
 * randomization, and it gains nothing — there are two options and the student reads both. Short
 * answers have no options at all. This matches the long-standing behaviour of shuffleMCQQuestion
 * in assignmentGenerator.ts.
 */
function isShuffleableOptions(q: Question): boolean {
  return q.type === QuestionType.MCQ && Array.isArray(q.options) && q.options.length > 1;
}

/**
 * Builds the arrangement for ONE attempt. Pure: same questions + same seed + same options in,
 * same plan out.
 *
 * Both flags are independent. Question order and option order are decided separately and neither
 * influences the other, so ON/OFF, OFF/ON, ON/ON and OFF/OFF all behave as their name says.
 */
export function buildAttemptPaper(
  questions: Question[],
  options: AttemptPaperOptions,
  seed: number
): AttemptPaperPlan {
  const source = (questions || []).filter((q) => q && q.id);
  const rand = mulberry32(seed);

  // Question order. Drawn FIRST so that toggling option-shuffling does not change which question
  // order a given seed produces.
  const ordered = options.shuffleQuestions ? seededShuffle(source, rand) : source;

  const optionPermutations: Record<string, number[]> = {};
  if (options.shuffleOptions) {
    // Walk in canonical order, not presentation order, so a question's option permutation does not
    // depend on where the question happened to land.
    for (const q of source) {
      if (!isShuffleableOptions(q)) continue;
      const indices = q.options.map((_, i) => i);
      optionPermutations[q.id] = seededShuffle(indices, rand);
    }
  }

  return {
    questionIds: ordered.map((q) => q.id),
    optionPermutations
  };
}

/** True when `perm` is a genuine permutation of 0..length-1. Anything else is ignored as corrupt. */
function isValidPermutation(perm: unknown, length: number): perm is number[] {
  if (!Array.isArray(perm) || perm.length !== length) return false;
  const seen = new Set<number>();
  for (const value of perm) {
    if (typeof value !== "number" || !Number.isInteger(value)) return false;
    if (value < 0 || value >= length) return false;
    if (seen.has(value)) return false;
    seen.add(value);
  }
  return true;
}

/**
 * Rebuilds the paper this attempt presents, from the canonical questions plus the attempt's
 * stored arrangement.
 *
 * This is THE single place the stored arrangement is turned into something renderable, so every
 * entry path — first join, page refresh, App.tsx session resume, a second device — produces the
 * same paper from the same attempt document.
 *
 * The returned questions carry a `correctAnswerIndex` re-derived for the shuffled options, which
 * is what lets the existing scoring code keep comparing a selected display index against
 * `correctAnswerIndex` with no changes and stay correct.
 *
 * IDENTITY GUARANTEE: with no permutations and canonical questionIds this returns the input
 * questions unchanged, which is why pre-randomization attempts are unaffected.
 */
export function applyAttemptPaper(
  questions: Question[],
  attempt: Pick<StudentAssignmentDocument, "questionIds" | "optionPermutations"> | null | undefined
): Question[] {
  const source = questions || [];
  if (!attempt) return source;

  const orderedIds = Array.isArray(attempt.questionIds) ? attempt.questionIds : [];
  const permutations = attempt.optionPermutations || {};

  // No stored order (a legacy attempt, or one whose questions could not be hydrated): the
  // assessment's own order stands. Never invent an order here.
  const byId = new Map<string, Question>();
  source.forEach((q) => { if (q && q.id) byId.set(q.id, q); });

  /**
   * The attempt's question list is frozen at creation. A question the teacher deleted from the
   * bank afterwards simply drops out (fetchQuestionsByIdsFromFirestore already returns fewer
   * documents than ids), and a question added to the assessment afterwards must NOT appear
   * mid-attempt — which is why the attempt's ids drive this, not the assessment's.
   */
  const ordered: Question[] = orderedIds.length
    ? orderedIds.map((id) => byId.get(id)).filter((q): q is Question => Boolean(q))
    : source;

  return ordered.map((q) => {
    const perm = permutations[q.id];
    if (!isShuffleableOptions(q) || !isValidPermutation(perm, q.options.length)) {
      return q;
    }

    const shownOptions = perm.map((canonicalIndex) => q.options[canonicalIndex]);
    const shownCorrect = perm.indexOf(q.correctAnswerIndex);

    return {
      ...q,
      options: shownOptions,
      // A negative index would mean the stored correctAnswerIndex is out of range for its own
      // options; fall back rather than silently marking option 0 correct.
      correctAnswerIndex: shownCorrect >= 0 ? shownCorrect : q.correctAnswerIndex
    };
  });
}

/**
 * Maps a position in the presented options back to the underlying canonical option index — the
 * stable identity of a choice in this data model (options are plain strings and carry no id of
 * their own).
 *
 * Used when recording an answer so the submission stores the underlying choice as well as the
 * position it was shown in, and stays interpretable without re-reading the attempt.
 */
export function toCanonicalOptionIndex(
  attempt: Pick<StudentAssignmentDocument, "optionPermutations"> | null | undefined,
  questionId: string,
  displayIndex: number
): number {
  if (displayIndex < 0) return displayIndex;
  const perm = attempt?.optionPermutations?.[questionId];
  if (!Array.isArray(perm) || displayIndex >= perm.length) return displayIndex;
  const canonical = perm[displayIndex];
  return typeof canonical === "number" && Number.isInteger(canonical) ? canonical : displayIndex;
}
