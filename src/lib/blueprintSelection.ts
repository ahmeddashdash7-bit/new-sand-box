/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BankQuestion,
  DifficultyLevel,
  HomeworkBlueprint,
  Question,
  QuestionType
} from "../types";
import { hasMatchingTag } from "./tagUtils";

/**
 * ==============================================================================
 * BLUEPRINT -> ASSESSMENT QUESTION SELECTION
 * ==============================================================================
 *
 * The single source of truth for "which questions may this blueprint draw, and
 * how many of each difficulty". Both the blueprint authoring preview (the live
 * "N matching questions" counter) and the actual generator call in here, so the
 * number the teacher is shown while authoring cannot drift from the pool the
 * generator later uses. Those were two separate copies of the filter before, and
 * they disagreed: the preview applied the question-type filter, the generator
 * did not.
 *
 * Pipeline:
 *
 *   Question Bank
 *        -> matchesBlueprintFilters (ALL blueprint filters)
 *   Eligible pool
 *        -> computeDifficultyQuotas (percentages -> integer quotas)
 *   Per-difficulty draw (random WITHIN each bucket only)
 *        -> shuffle
 *   Final question list
 *
 * Randomness never decides the difficulty mix. It only decides which questions
 * fill an already-fixed quota, and the final presentation order.
 * ==============================================================================
 */

/** Difficulty buckets in canonical order. Quota tie-breaks resolve in this order. */
const DIFFICULTY_ORDER: DifficultyLevel[] = [
  DifficultyLevel.Easy,
  DifficultyLevel.Medium,
  DifficultyLevel.Hard
];

/**
 * Lesson values that mean "no lesson constraint" rather than a lesson name.
 *
 * "General Unit" is not a teacher's word: BlueprintFormModal substitutes it when the
 * lesson field is left blank (`lesson.trim() || "General Unit"`). Matching it literally
 * against q.lesson is what emptied the pool on every blueprint that did not name a
 * lesson, which in turn triggered the old unfiltered fallback. "جميع الدروس" is the
 * equivalent sentinel already recognised in assignmentGenerator.ts.
 */
const ALL_LESSONS_SENTINELS = new Set([
  "",
  "general unit",
  "all lessons",
  "all",
  "جميع الدروس"
]);

/** Grade value on a bank question meaning "applies to every grade". */
const ANY_GRADE = "General";

export type DifficultyQuotas = Record<DifficultyLevel, number>;

/**
 * The blueprint fields that constrain the eligible pool. Accepting this subset rather
 * than a whole HomeworkBlueprint lets the authoring form — which holds the same values
 * in loose component state, before a blueprint exists — reuse the identical predicate.
 */
export interface BlueprintFilters {
  subject: HomeworkBlueprint["subject"];
  grade?: string;
  lesson?: string;
  tags?: string[];
  allowedQuestionTypes?: QuestionType[];
}

/**
 * Maps any stored difficulty value onto a canonical DifficultyLevel.
 *
 * Bank questions are written with `difficulty: q.difficulty || "Medium"`
 * (firebase.ts saveBankQuestionToFirestore) and read back raw, so the field can be a
 * canonical enum value, a legacy/imported casing, or absent. The substring matching
 * mirrors the one normalization the app already performs, in
 * BulkQuestionImportModal ("easy" -> Easy, "hard" -> Hard, else Medium), and the
 * Medium default matches the write path.
 */
export function normalizeDifficulty(raw: unknown): DifficultyLevel {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value.includes("easy")) return DifficultyLevel.Easy;
  if (value.includes("hard")) return DifficultyLevel.Hard;
  return DifficultyLevel.Medium;
}

/** True when the blueprint's lesson field names an actual lesson to filter on. */
function hasLessonConstraint(lesson?: string): boolean {
  return !ALL_LESSONS_SENTINELS.has(String(lesson ?? "").trim().toLowerCase());
}

/**
 * THE blueprint filter predicate. A question may appear in an assessment generated
 * from this blueprint if and only if this returns true.
 *
 * Semantics are carried over unchanged from the authoring preview
 * (BlueprintFormModal's matching-questions counter), with two corrections:
 * blank-lesson sentinels no longer match literally, and the question-type filter is
 * now applied by the generator too rather than by the preview alone.
 *
 * `topics` is deliberately NOT filtered on: it is auto-derived from the lesson when
 * the teacher leaves it empty, and the authoring preview has never enforced it, so
 * enforcing it now would retroactively empty the pool of every existing blueprint.
 */
export function matchesBlueprintFilters(q: Question | BankQuestion, filters: BlueprintFilters): boolean {
  if (!q) return false;

  // Subject — always required.
  if (q.subject !== filters.subject) return false;

  // Grade — a question marked "General" applies to every grade.
  const grade = String(filters.grade || "").trim();
  if (grade && q.grade && q.grade !== grade && q.grade !== ANY_GRADE) return false;

  // Lesson — substring match, as the preview has always done.
  if (hasLessonConstraint(filters.lesson)) {
    const needle = String(filters.lesson).trim().toLowerCase();
    if (!q.lesson?.toLowerCase().includes(needle)) return false;
  }

  // Tags — the question must carry at least one of the blueprint's tags.
  if (filters.tags && filters.tags.length > 0) {
    if (!filters.tags.some((tag) => hasMatchingTag(q.tags, tag))) return false;
  }

  // Question type — an empty allow-list means "no type constraint".
  const allowedTypes = filters.allowedQuestionTypes;
  if (allowedTypes && allowedTypes.length > 0 && !allowedTypes.includes(q.type)) return false;

  return true;
}

/**
 * Builds the eligible pool: every bank question satisfying ALL blueprint filters,
 * deduplicated by id. Never falls back to a wider pool — a blueprint whose filters
 * match nothing yields an empty pool, and the caller reports that.
 */
export function getEligibleQuestions(
  filters: BlueprintFilters,
  bankQuestions: BankQuestion[]
): BankQuestion[] {
  const seen = new Map<string, BankQuestion>();
  for (const q of bankQuestions || []) {
    if (!q || !q.id) continue;
    if (!matchesBlueprintFilters(q, filters)) continue;
    if (!seen.has(q.id)) seen.set(q.id, q);
  }
  return Array.from(seen.values());
}

/** Splits an eligible pool into its three difficulty buckets. */
export function partitionByDifficulty(questions: BankQuestion[]): Record<DifficultyLevel, BankQuestion[]> {
  const buckets: Record<DifficultyLevel, BankQuestion[]> = {
    [DifficultyLevel.Easy]: [],
    [DifficultyLevel.Medium]: [],
    [DifficultyLevel.Hard]: []
  };
  for (const q of questions) {
    buckets[normalizeDifficulty(q.difficulty)].push(q);
  }
  return buckets;
}

/**
 * Converts a blueprint's difficulty distribution into exact integer quotas that sum
 * to `total`, using largest-remainder (Hamilton) apportionment.
 *
 * ROUNDING
 * --------
 * 1. Percentages are normalized by their own sum, not assumed to total 100 — the
 *    three sliders in the blueprint form move independently and are free to sum to
 *    anything.
 * 2. exact_i = total * pct_i / sum(pcts); each bucket takes floor(exact_i).
 * 3. Leftover seats (total - sum of floors) go to the buckets with the largest
 *    fractional remainders, ties broken Easy > Medium > Hard so the result is
 *    deterministic for a given blueprint.
 *
 * This guarantees integer counts, an exact sum of `total`, never more than `total`,
 * and the closest achievable approximation of the requested percentages.
 * Worked example — 7 questions at 33/33/34: exact = 2.31/2.31/2.38, floors = 2/2/2,
 * one seat left, largest remainder is Hard (.38) -> 2/2/3, summing to exactly 7.
 *
 * Returns null when the blueprint carries no usable distribution at all (no
 * percentages and no counts). Blueprints saved before the percentage fields existed
 * read back as `{easyCount: 0, mediumCount: 0, hardCount: 0}` (the default in
 * firebase.ts), and those must stay generatable rather than resolve to zero
 * questions — the caller treats null as "no difficulty constraint".
 */
export function computeDifficultyQuotas(
  total: number,
  distribution: HomeworkBlueprint["difficultyDistribution"] | undefined | null
): DifficultyQuotas | null {
  const target = Math.max(0, Math.floor(Number(total) || 0));
  if (target <= 0) return null;

  const dist = distribution || {};
  const pcts: Record<DifficultyLevel, number> = {
    [DifficultyLevel.Easy]: Math.max(0, Number(dist.easyPct) || 0),
    [DifficultyLevel.Medium]: Math.max(0, Number(dist.mediumPct) || 0),
    [DifficultyLevel.Hard]: Math.max(0, Number(dist.hardPct) || 0)
  };
  let weightTotal = DIFFICULTY_ORDER.reduce((sum, level) => sum + pcts[level], 0);

  // Fall back to the stored counts when no percentages are present. The counts are a
  // derived, independently-rounded field and may not sum to `total`, so they are used
  // as relative weights and re-apportioned rather than trusted as final quotas.
  if (weightTotal <= 0) {
    pcts[DifficultyLevel.Easy] = Math.max(0, Number(dist.easyCount) || 0);
    pcts[DifficultyLevel.Medium] = Math.max(0, Number(dist.mediumCount) || 0);
    pcts[DifficultyLevel.Hard] = Math.max(0, Number(dist.hardCount) || 0);
    weightTotal = DIFFICULTY_ORDER.reduce((sum, level) => sum + pcts[level], 0);
  }

  // No distribution expressed at all — caller draws from the whole eligible pool.
  if (weightTotal <= 0) return null;

  const quotas = {} as DifficultyQuotas;
  const remainders: { level: DifficultyLevel; remainder: number }[] = [];
  let assigned = 0;

  for (const level of DIFFICULTY_ORDER) {
    const exact = (target * pcts[level]) / weightTotal;
    const floor = Math.floor(exact);
    quotas[level] = floor;
    assigned += floor;
    remainders.push({ level, remainder: exact - floor });
  }

  // Distribute the leftover seats by largest fractional remainder. The index tie-break
  // keeps DIFFICULTY_ORDER as the deterministic ordering for equal remainders, since
  // Array.prototype.sort is only guaranteed stable, not ordered, across engines.
  remainders.sort((a, b) =>
    b.remainder - a.remainder ||
    DIFFICULTY_ORDER.indexOf(a.level) - DIFFICULTY_ORDER.indexOf(b.level)
  );

  let leftover = target - assigned;
  for (let i = 0; leftover > 0 && i < remainders.length; i++) {
    quotas[remainders[i].level] += 1;
    leftover -= 1;
  }

  return quotas;
}

/** Unbiased Fisher-Yates. Copies; never mutates the input. */
function shuffle<T>(items: T[], rand: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface DifficultyShortage {
  level: DifficultyLevel;
  required: number;
  available: number;
}

export interface BlueprintSelectionResult {
  ok: boolean;
  questions: BankQuestion[];
  /** null when the blueprint expressed no difficulty distribution. */
  quotas: DifficultyQuotas | null;
  eligibleCount: number;
  availableByDifficulty: Record<DifficultyLevel, number>;
  shortages: DifficultyShortage[];
  /** Teacher-facing explanation. Empty when ok. */
  error: string;
}

function emptyCounts(): Record<DifficultyLevel, number> {
  return {
    [DifficultyLevel.Easy]: 0,
    [DifficultyLevel.Medium]: 0,
    [DifficultyLevel.Hard]: 0
  };
}

/** Extracts the filtering fields from a blueprint. */
export function blueprintFilters(blueprint: HomeworkBlueprint): BlueprintFilters {
  return {
    subject: blueprint.subject,
    grade: blueprint.grade,
    lesson: blueprint.lesson,
    tags: blueprint.tags,
    allowedQuestionTypes: blueprint.allowedQuestionTypes
  };
}

export interface BlueprintPoolAnalysis {
  filters: BlueprintFilters;
  /** Questions the blueprint asks for. */
  total: number;
  /** Every bank question passing the filters, deduplicated. */
  eligible: BankQuestion[];
  eligibleCount: number;
  buckets: Record<DifficultyLevel, BankQuestion[]>;
  availableByDifficulty: Record<DifficultyLevel, number>;
  /** null when the blueprint expresses no difficulty distribution. */
  quotas: DifficultyQuotas | null;
  shortages: DifficultyShortage[];
  /** Empty when this blueprint can be generated right now. */
  error: string;
}

/**
 * Answers "what can this blueprint draw from the bank right now, and can it be generated?"
 * without selecting anything.
 *
 * This is the single code path behind BOTH the teacher-facing "matching questions" count and
 * the generator: selectBlueprintQuestions calls this and then only draws from
 * `analysis.buckets`. The count the teacher is shown and the pool the generator uses are
 * therefore the same computation, not two implementations that agree by convention — which is
 * exactly how they drifted apart before.
 *
 * Read-only and side-effect free, so the UI can call it on every keystroke.
 */
export function analyzeBlueprintPool(
  blueprint: HomeworkBlueprint,
  bankQuestions: BankQuestion[]
): BlueprintPoolAnalysis {
  const filters = blueprintFilters(blueprint);
  const total = Math.max(0, Math.floor(Number(blueprint.totalQuestions) || 0));
  const eligible = getEligibleQuestions(filters, bankQuestions || []);
  const buckets = partitionByDifficulty(eligible);

  const availableByDifficulty = emptyCounts();
  for (const level of DIFFICULTY_ORDER) availableByDifficulty[level] = buckets[level].length;

  const base = {
    filters,
    total,
    eligible,
    eligibleCount: eligible.length,
    buckets,
    availableByDifficulty
  };

  if (total <= 0) {
    return {
      ...base,
      quotas: null,
      shortages: [],
      error: "This Blueprint requests 0 questions. Edit the Blueprint's Question Mix and try again."
    };
  }

  if (eligible.length === 0) {
    return {
      ...base,
      quotas: null,
      shortages: [],
      error:
        "No questions in the Question Bank match this Blueprint's filters " +
        `(${describeFilters(filters)}). Please change the Blueprint filters or add matching ` +
        "questions to the Question Bank."
    };
  }

  const quotas = computeDifficultyQuotas(total, blueprint.difficultyDistribution);

  // No difficulty distribution expressed — the whole assessment is drawn from the eligible
  // pool. Still filter-strict, just difficulty-agnostic.
  if (!quotas) {
    if (eligible.length < total) {
      return {
        ...base,
        quotas: null,
        shortages: [],
        error:
          "Not enough eligible questions to create this assessment.\n\n" +
          `Required: ${total}\nAvailable after Blueprint filters: ${eligible.length}\n\n` +
          "Please add more questions matching the selected Blueprint filters or lower the question count."
      };
    }
    return { ...base, quotas: null, shortages: [], error: "" };
  }

  // Availability is checked per difficulty BEFORE anything is selected. A bucket that cannot
  // meet its quota is never topped up from another difficulty, and the filters are never
  // widened — the blueprint is simply refused.
  const shortages: DifficultyShortage[] = DIFFICULTY_ORDER
    .filter((level) => quotas[level] > buckets[level].length)
    .map((level) => ({ level, required: quotas[level], available: buckets[level].length }));

  if (shortages.length > 0) {
    const detail = shortages
      .map((s) => `${s.level}:\n  Required: ${s.required}\n  Available: ${s.available}`)
      .join("\n\n");
    return {
      ...base,
      quotas,
      shortages,
      error:
        "Not enough eligible questions to create this assessment.\n\n" +
        `${detail}\n\n` +
        "Please add more questions of that difficulty matching the selected Blueprint filters, " +
        "or change the difficulty distribution."
    };
  }

  return { ...base, quotas, shortages: [], error: "" };
}

/**
 * Selects the questions for an assessment generated from `blueprint`.
 *
 * Filters first, then applies exact per-difficulty quotas, then shuffles. Refuses —
 * rather than substituting questions from another difficulty or from outside the
 * filters — whenever the eligible pool cannot satisfy the requested distribution.
 *
 * `rand` is injectable purely so tests can pin the draw; production passes nothing
 * and gets Math.random.
 */
export function selectBlueprintQuestions(
  blueprint: HomeworkBlueprint,
  bankQuestions: BankQuestion[],
  rand: () => number = Math.random
): BlueprintSelectionResult {
  // Same call the teacher-facing "matching questions" panel makes. The generator
  // re-runs it here rather than trusting anything the UI computed, so a bank that
  // changed between opening the modal and pressing Assign is caught.
  const analysis = analyzeBlueprintPool(blueprint, bankQuestions || []);
  const { filters, total, eligible, buckets, availableByDifficulty, quotas } = analysis;

  const fail = (error: string, shortages: DifficultyShortage[] = [], q: DifficultyQuotas | null = null)
    : BlueprintSelectionResult => ({
      ok: false,
      questions: [],
      quotas: q,
      eligibleCount: eligible.length,
      availableByDifficulty,
      shortages,
      error
    });

  // Anything the analysis rejects — zero matches, insufficient total, a short difficulty
  // bucket — stops here. There is no branch from this point that widens the pool.
  if (analysis.error) return fail(analysis.error, analysis.shortages, quotas);

  // No difficulty distribution expressed — draw the whole assessment from the
  // eligible pool. Still filter-strict, just difficulty-agnostic.
  if (!quotas) {
    return {
      ok: true,
      questions: shuffle(eligible, rand).slice(0, total),
      quotas: null,
      eligibleCount: eligible.length,
      availableByDifficulty,
      shortages: [],
      error: ""
    };
  }

  // Draw the exact quota from each bucket, randomly within the bucket.
  const selected: BankQuestion[] = [];
  for (const level of DIFFICULTY_ORDER) {
    selected.push(...shuffle(buckets[level], rand).slice(0, quotas[level]));
  }

  // Shuffle the combined list. This is presentation order for the stored assessment,
  // and it runs unconditionally: selecting per bucket would otherwise emit every Easy
  // question, then every Medium, then every Hard, exposing the difficulty grouping in
  // the canonical order. The blueprint's randomizeQuestionOrder flag still governs
  // per-student ordering, via shareSettings.shuffleQuestions -> lib/attemptPaper.ts.
  const questions = shuffle(selected, rand);

  const validationError = validateSelection(questions, filters, quotas, total);
  if (validationError) return fail(validationError, [], quotas);

  return {
    ok: true,
    questions,
    quotas,
    eligibleCount: eligible.length,
    availableByDifficulty,
    shortages: [],
    error: ""
  };
}

/**
 * Last-line defence run immediately before the assessment is handed off to be saved.
 * Re-checks the two invariants this module exists to uphold, against the actual output
 * rather than the intent. A failure here is a bug in this file, not teacher error, so
 * it reports as such — but it still refuses to save an invalid assessment.
 */
export function validateSelection(
  questions: Question[],
  filters: BlueprintFilters,
  quotas: DifficultyQuotas | null,
  expectedTotal: number
): string {
  if (questions.length !== expectedTotal) {
    return `Internal error: generated ${questions.length} questions but the Blueprint requires ${expectedTotal}. The assessment was not saved.`;
  }

  const ids = new Set<string>();
  for (const q of questions) {
    if (ids.has(q.id)) {
      return `Internal error: question "${q.id}" was selected twice. The assessment was not saved.`;
    }
    ids.add(q.id);
    if (!matchesBlueprintFilters(q, filters)) {
      return `Internal error: selected question "${q.id}" does not match the Blueprint filters. The assessment was not saved.`;
    }
  }

  if (quotas) {
    const counts = emptyCounts();
    for (const q of questions) counts[normalizeDifficulty(q.difficulty)] += 1;
    for (const level of DIFFICULTY_ORDER) {
      if (counts[level] !== quotas[level]) {
        return `Internal error: generated ${counts[level]} ${level} questions but the Blueprint requires ${quotas[level]}. The assessment was not saved.`;
      }
    }
  }

  return "";
}

/** Human-readable summary of the active filters, for the "nothing matched" message. */
function describeFilters(filters: BlueprintFilters): string {
  const parts: string[] = [`subject: ${filters.subject}`];
  if (filters.grade) parts.push(`grade: ${filters.grade}`);
  if (hasLessonConstraint(filters.lesson)) parts.push(`lesson: ${filters.lesson}`);
  if (filters.tags && filters.tags.length > 0) parts.push(`tags: ${filters.tags.join(", ")}`);
  if (filters.allowedQuestionTypes && filters.allowedQuestionTypes.length > 0) {
    parts.push(`types: ${filters.allowedQuestionTypes.join(", ")}`);
  }
  return parts.join(" • ");
}
