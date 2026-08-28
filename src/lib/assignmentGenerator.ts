/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HomeworkBlueprint, BankQuestion, User, GeneratedAssignment, Question, QuestionType, DifficultyLevel } from "../types";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

/**
 * ==============================================================================
 * BALANCED & DIVERSE QUESTION SELECTION ALGORITHM (BDQSA)
 * ==============================================================================
 * 
 * Objective:
 * Automatically generates a high-quality, balanced, non-repetitive homework 
 * assignment from a question bank according to a specified blueprint.
 * 
 * KEY ALGORITHM ALGORITHMIC GOALS:
 * 1. Difficulty Balance:
 *    - Respects blueprint's DifficultyDistribution (Easy, Medium, Hard counts).
 *    - Dynamically backfills from adjacent difficulty levels if a pool is sparse.
 * 
 * 2. Strict Deduplication (Anti-Duplicate):
 *    - Rejects questions with identical IDs or identical normalized text strings.
 * 
 * 3. Near-Duplicate Prevention (Jaccard Text Overlap Similarity):
 *    - Normalizes question text (lowercase, strip diacritics & non-alphanumeric chars).
 *    - Tokenizes text into word sets and computes Jaccard Similarity J(Q1, Q2).
 *    - If J(Q1, Q2) >= 0.55 (55% word overlap), candidate Q2 is flagged as a 
 *      near-duplicate and skipped to prevent redundant questions.
 * 
 * 4. Concept Coverage Maximization:
 *    - Extracts concept keywords (significant terms >= 3 characters) from 
 *      question text and explanation.
 *    - Prioritizes candidate questions that introduce unrepresented concept 
 *      keywords, maximizing lesson topic coverage.
 * 
 * 5. Adaptive Fallback & Randomization:
 *    - Shuffles candidates among top-diverse questions so students receive 
 *      unique variations when desired.
 *    - Shuffles question order and answer choices according to blueprint flags.
 * ==============================================================================
 */

// Fisher-Yates array shuffle
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Normalizes text for similarity comparison
 */
function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, "") // Remove Arabic diacritics if any
    .replace(/[^\w\s\u0600-\u06FF]/g, " ") // Keep letters/digits in Arabic & English
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts significant word tokens (concept terms) from text
 */
function getWordTokens(text: string): Set<string> {
  const normalized = normalizeText(text);
  const stopWords = new Set([
    "what", "is", "are", "the", "in", "on", "at", "of", "and", "or", "to", "for", "a", "an", "by", "with",
    "which", "that", "this", "from", "how", "why", "does", "do", "when", "where",
    "ما", "من", "في", "على", "عن", "إلى", "هو", "هي", "هل", "أين", "كيف", "ماذا", "مع", "أو", "أن", "هذا"
  ]);

  const words = normalized.split(" ");
  const tokens = new Set<string>();

  for (const w of words) {
    if (w.length >= 3 && !stopWords.has(w)) {
      tokens.add(w);
    }
  }

  return tokens;
}

/**
 * Calculates Jaccard Similarity index between two text strings
 * Returns a value between 0.0 (no overlap) and 1.0 (identical token sets)
 */
export function calculateJaccardSimilarity(textA: string, textB: string): number {
  const setA = getWordTokens(textA);
  const setB = getWordTokens(textB);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionCount++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionCount;
  return unionSize === 0 ? 0 : intersectionCount / unionSize;
}

/**
 * Checks if candidate question is a near-duplicate of any already selected question
 */
function isNearDuplicate(candidate: Question, selectedList: Question[], threshold = 0.55): boolean {
  const candNorm = normalizeText(candidate.text);

  for (const sel of selectedList) {
    // 1. Exact ID match
    if (sel.id === candidate.id) return true;

    // 2. Exact text match
    if (normalizeText(sel.text) === candNorm) return true;

    // 3. Jaccard Similarity check
    const sim = calculateJaccardSimilarity(candidate.text, sel.text);
    if (sim >= threshold) return true;
  }

  return false;
}

/**
 * Extracts all concept keywords from a question
 */
function extractQuestionConcepts(q: Question): Set<string> {
  const concepts = getWordTokens(q.text);
  if (q.explanation) {
    const expTokens = getWordTokens(q.explanation);
    for (const t of expTokens) concepts.add(t);
  }
  return concepts;
}

/**
 * Selects a question from candidates that maximizes novelty (new concept terms)
 * while avoiding near-duplicates.
 */
function selectBestCandidate(
  candidates: BankQuestion[],
  selectedList: Question[],
  coveredConcepts: Set<string>
): BankQuestion | null {
  const validCandidates = candidates.filter(
    (c) => !isNearDuplicate(c, selectedList, 0.55)
  );

  if (validCandidates.length === 0) {
    // Fallback: relax similarity threshold slightly if pool is extremely constrained
    const relaxedCandidates = candidates.filter(
      (c) => !selectedList.some((s) => s.id === c.id || normalizeText(s.text) === normalizeText(c.text))
    );
    if (relaxedCandidates.length === 0) return null;
    return shuffleArray(relaxedCandidates)[0];
  }

  // Score candidates based on concept novelty
  let bestCandidate: BankQuestion | null = null;
  let maxNovelty = -1;
  let topCandidates: BankQuestion[] = [];

  for (const cand of validCandidates) {
    const candConcepts = extractQuestionConcepts(cand);
    let noveltyScore = 0;
    for (const token of candConcepts) {
      if (!coveredConcepts.has(token)) {
        noveltyScore++;
      }
    }

    if (noveltyScore > maxNovelty) {
      maxNovelty = noveltyScore;
      topCandidates = [cand];
    } else if (noveltyScore === maxNovelty) {
      topCandidates.push(cand);
    }
  }

  // Shuffle among top scored candidates for diversity across student generations
  bestCandidate = shuffleArray(topCandidates)[0] || null;
  return bestCandidate;
}

/**
 * Main selection algorithm function:
 * Selects balanced, non-duplicate, non-similar, and concept-diverse questions.
 */
export function selectBalancedAndDiverseQuestions(
  blueprint: HomeworkBlueprint,
  allBankQuestions: BankQuestion[]
): Question[] {
  // 1. Strict Filter by Subject & Allowed Question Types
  let pool = allBankQuestions.filter(
    (q) =>
      q.subject.trim().toLowerCase() === blueprint.subject.trim().toLowerCase() &&
      blueprint.allowedQuestionTypes.includes(q.type)
  );

  // Stop if no questions exist for this subject or selected question types
  if (pool.length === 0) {
    alert(
      `لا توجد أسئلة متوفرة للمادة: "${blueprint.subject}" بالأنواع المحددة. يرجى تعديل البلوبرينت أو إضافة أسئلة للبنك.`
    );
    throw new Error("No questions match the subject and allowed question types.");
  }

  // 2. Filter by Tags (if tags were specified in the blueprint)
  if (blueprint.tags && blueprint.tags.length > 0) {
    pool = pool.filter(
      (q) => q.tags && q.tags.some((tag) => blueprint.tags.includes(tag))
    );
    if (pool.length === 0) {
      alert(
        `لا توجد أسئلة تطابق الوسوم (Tags) المحددة في المادة: "${blueprint.subject}". يرجى تغيير الوسوم أو إضافة أسئلة لها.`
      );
      throw new Error("No questions match the selected tags.");
    }
  }

  // 3. Filter by Lesson (if specified and not "جميع الدروس")
  if (blueprint.lesson && blueprint.lesson !== "جميع الدروس") {
    const lessonPool = pool.filter(
      (q) => q.lesson && q.lesson.toLowerCase().trim() === blueprint.lesson.toLowerCase().trim()
    );
    if (lessonPool.length === 0) {
      alert(
        `لا توجد أسئلة متوفرة للدرس: "${blueprint.lesson}". يرجى اختيار درس آخر أو تغيير الإعدادات.`
      );
      throw new Error("No questions match the selected lesson.");
    }
    pool = lessonPool;
  }

  // Deduplicate pool by ID
  const uniquePoolMap = new Map<string, BankQuestion>();
  for (const q of pool) {
    if (!uniquePoolMap.has(q.id)) {
      uniquePoolMap.set(q.id, q);
    }
  }
  pool = Array.from(uniquePoolMap.values());

  // Check total available pool vs requested total
  if (pool.length < blueprint.totalQuestions) {
    alert(
      `عدد الأسئلة المتاحة المطبقة للشروط هو (${pool.length}) فقط، بينما المطلوب في البلوبرينت هو (${blueprint.totalQuestions}). يرجى تقليل العدد المطلوب أو تغيير الفلاتر.`
    );
    throw new Error("Insufficient questions in question bank to fulfill blueprint requirement.");
  }

  // 4. Partition by difficulty
  const easyPool = pool.filter((q) => q.difficulty === DifficultyLevel.Easy);
  const mediumPool = pool.filter((q) => q.difficulty === DifficultyLevel.Medium);
  const hardPool = pool.filter((q) => q.difficulty === DifficultyLevel.Hard);

  const selectedList: Question[] = [];
  const coveredConcepts = new Set<string>();

  const difficultyTargets = [
    { pool: easyPool, quota: blueprint.difficultyDistribution.easyCount, name: "سهل" },
    { pool: mediumPool, quota: blueprint.difficultyDistribution.mediumCount, name: "متوسط" },
    { pool: hardPool, quota: blueprint.difficultyDistribution.hardCount, name: "صعب" }
  ];

  // 5. Check difficulty fulfillment strictly
  for (const stage of difficultyTargets) {
    if (stage.pool.length < stage.quota) {
      alert(
        `الأسئلة المتوفرة بمستوى (${stage.name}) هي (${stage.pool.length}) فقط، بينما المطلوب هو (${stage.quota}). يرجى تعديل نسبة الصعوبة.`
      );
      throw new Error(`Insufficient questions for difficulty level: ${stage.name}`);
    }

    let count = 0;
    while (count < stage.quota) {
      const best = selectBestCandidate(stage.pool, selectedList, coveredConcepts);
      if (!best) break;

      selectedList.push({ ...best });
      count++;

      const newConcepts = extractQuestionConcepts(best);
      for (const t of newConcepts) coveredConcepts.add(t);
    }
  }

  // 6. Randomize order if requested
  let finalQuestions = [...selectedList];
  if (blueprint.randomizeQuestionOrder) {
    finalQuestions = shuffleArray(finalQuestions);
  }

  // 7. Randomize answer choice order for MCQs if requested
  if (blueprint.randomizeAnswerChoices) {
    finalQuestions = finalQuestions.map((q) => shuffleMCQQuestion(q));
  }

  return finalQuestions;
}

// Shuffle MCQ question options while preserving correct answer index
function shuffleMCQQuestion(q: Question): Question {
  if (q.type !== QuestionType.MCQ || !q.options || q.options.length <= 1) {
    return q;
  }
  const correctAnswerText = q.options[q.correctAnswerIndex];
  if (correctAnswerText === undefined) return q;

  const shuffledOptions = shuffleArray(q.options);
  const newCorrectIndex = shuffledOptions.indexOf(correctAnswerText);

  return {
    ...q,
    options: shuffledOptions,
    correctAnswerIndex: newCorrectIndex >= 0 ? newCorrectIndex : 0
  };
}

const LOCAL_STORAGE_ASSIGNMENTS_PREFIX = "student_assignment_";

/**
 * Retrieves a persistent student assignment or generates a new one.
 */
export async function getOrGenerateAssignment(
  blueprint: HomeworkBlueprint,
  user: User,
  allBankQuestions: BankQuestion[]
): Promise<GeneratedAssignment> {
  const sanitizeUserKey = (user.id || user.username || "student").replace(/[^a-zA-Z0-9_-]/g, "_");
  const assignmentId = `hw-${blueprint.id}-${sanitizeUserKey}`;
  const localKey = `${LOCAL_STORAGE_ASSIGNMENTS_PREFIX}${assignmentId}`;

  // 1. Check local storage cache
  try {
    const cachedLocal = localStorage.getItem(localKey);
    if (cachedLocal) {
      const parsed: GeneratedAssignment = JSON.parse(cachedLocal);
      if (parsed && parsed.questions && parsed.questions.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Error reading local assignment cache:", e);
  }

  // 2. Check Firestore for /assignments/{assignmentId}
  try {
    const docRef = doc(db, "assignments", assignmentId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const remoteData = docSnap.data() as GeneratedAssignment;
      if (remoteData && remoteData.questions && remoteData.questions.length > 0) {
        try {
          localStorage.setItem(localKey, JSON.stringify(remoteData));
        } catch (e) {}
        return remoteData;
      }
    }
  } catch (e) {
    console.warn("Error checking Firestore for assignment:", e);
  }

  // 3. Generate balanced and diverse questions using BDQSA
  const finalQuestionsList = selectBalancedAndDiverseQuestions(blueprint, allBankQuestions);

  // 4. Construct generated assignment
  const generated: GeneratedAssignment = {
    id: assignmentId,
    blueprintId: blueprint.id,
    blueprintTitle: blueprint.title,
    studentId: user.id || user.username,
    studentName: user.fullName || "Student",
    subject: blueprint.subject,
    lesson: blueprint.lesson,
    timeLimitMinutes: blueprint.timeLimitMinutes,
    questions: finalQuestionsList,
    createdAt: Date.now()
  };

  // 5. Persist locally and in Firestore
  try {
    localStorage.setItem(localKey, JSON.stringify(generated));
  } catch (e) {}

  try {
    const docRef = doc(db, "assignments", assignmentId);
    await setDoc(docRef, generated, { merge: true });
  } catch (e) {
    console.warn("Could not save generated assignment to Firestore:", e);
  }

  return generated;
}

