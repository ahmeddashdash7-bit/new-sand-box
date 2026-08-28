/**
 * END-TO-END DATA FLOW — the real application functions against the real security rules.
 *
 * The unit tests prove the shuffle is correct and the rules tests prove the rules permit the right
 * writes. Neither proves that the app, driving those rules with its own code, actually produces
 * the documents a teacher then sees — which is precisely where the retake bug lived: every layer
 * looked right in isolation, and the write was refused at the join between them.
 *
 * So this drives lib/firebase.ts itself, as an anonymous student under the deployed rules, through
 * the sequence a real student and teacher perform:
 *
 *   join → attempt 1 → submit → teacher grants a retake → join → attempt 2 → submit
 *
 * Teacher-side fixtures are seeded through an admin context, exactly as the teacher's own
 * (rule-permitted) writes would create them.
 *
 *   npm run test:rules
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { connectFirestoreEmulator } from "firebase/firestore";
import { connectAuthEmulator, signInAnonymously, signOut } from "firebase/auth";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";

import { db, auth } from "../../src/lib/firebase";
import {
  buildAttemptId,
  resolveAttemptChain,
  startOrResumeAttempt,
  reopenAttemptInFirestore,
  getStudentAssignmentFromFirestore,
  saveSubmissionToFirestore,
  updateStudentAssignmentProgressInFirestore
} from "../../src/lib/firebase";
import { buildAttemptPaper, applyAttemptPaper, generateAttemptSeed } from "../../src/lib/attemptPaper";
import { Question, QuestionType, StudentAssignmentDocument, StudentResult } from "../../src/types";

/**
 * MUST match the projectId hardcoded in src/lib/firebase.ts.
 *
 * The admin context and the app's own `db` are two clients of the same emulator, and the emulator
 * namespaces data per project — point them at different projects and the app reads an empty
 * database while every fixture sits in the other namespace.
 */
const PROJECT_ID = "sciencegarden-9d3d9";
const ASSESSMENT = "quiz-int-1";
const CODE_A = "AAAA";
const CODE_B = "BBBB";

let testEnv: RulesTestEnvironment;

/** Five 4-option MCQs — enough that a shuffle is overwhelmingly unlikely to be the identity. */
const QUESTIONS: Question[] = ["q1", "q2", "q3", "q4", "q5"].map((id, i) => ({
  id,
  type: QuestionType.MCQ,
  text: `Question ${id}`,
  options: [`${id}-a`, `${id}-b`, `${id}-c`, `${id}-d`],
  correctAnswerIndex: i % 4
}));

beforeAll(async () => {
  // The app's own db/auth singletons, pointed at the emulators. This is what makes the test
  // exercise production code paths rather than a reimplementation of them.
  connectFirestoreEmulator(db, "127.0.0.1", 8088);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });

  const rules = readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: "127.0.0.1", port: 8088 }
  });
}, 120_000);

afterAll(async () => {
  await testEnv?.cleanup();
}, 30_000);

/** Seeds what the teacher's own writes would have created. */
beforeEach(async () => {
  await testEnv.clearFirestore();
  await signOut(auth).catch(() => {});

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    for (const code of [CODE_A, CODE_B]) {
      await setDoc(doc(adminDb, "studentCodes", code), {
        code, studentId: `std-${code}`, name: `Student ${code}`,
        grade: "2 Sec", active: true, claimedByUid: "", claimedAt: 0
      });
    }
    for (const q of QUESTIONS) {
      await setDoc(doc(adminDb, "questions", q.id), q);
    }
  });
}, 30_000);

/** Signs in a fresh anonymous session, as a student's browser does, and claims their code. */
async function joinAs(code: string): Promise<string> {
  await signOut(auth).catch(() => {});
  const cred = await signInAnonymously(auth);
  const uid = cred.user.uid;
  await testEnv.withSecurityRulesDisabled(async (ctx) =>
    setDoc(doc(ctx.firestore(), "studentCodes", code), { claimedByUid: uid, claimedAt: Date.now() }, { merge: true })
  );
  return uid;
}

/**
 * Exactly what JoinAssessment.handleStartAssessment does: resolve where the student stands, build
 * the paper for the resulting attempt number, and create the attempt transactionally.
 */
async function startAttempt(
  code: string,
  uid: string,
  shuffle: { shuffleQuestions: boolean; shuffleOptions: boolean }
) {
  const chain = await resolveAttemptChain(ASSESSMENT, code, uid);
  const attemptNumber = chain.active ? Number(chain.active.attemptNumber) || 1 : chain.nextAttemptNumber;
  const attemptId = buildAttemptId(ASSESSMENT, code, uid, attemptNumber);
  const seed = generateAttemptSeed(attemptId);
  const plan = buildAttemptPaper(QUESTIONS, shuffle, seed);

  const candidate: StudentAssignmentDocument = {
    id: attemptId,
    assessmentId: ASSESSMENT,
    assessmentReference: ASSESSMENT,
    blueprintId: "bp-1",
    studentName: `Student ${code}`,
    studentClass: "2 Sec",
    questionIds: plan.questionIds,
    optionPermutations: plan.optionPermutations,
    randomSeed: seed,
    timeLimitMinutes: 20,
    status: "in_progress",
    studentUid: uid,
    studentCode: code,
    attemptNumber,
    startedAt: Date.now(),
    createdAt: Date.now(),
    currentProgress: { currentQuestionIndex: 0, selectedAnswers: {}, timeTaken: 0, lastUpdated: Date.now() }
  };

  const outcome = await startOrResumeAttempt(candidate);
  return { ...outcome, attemptId, attemptNumber, chain };
}

/** What StudentQuiz does on submit: grade the paper, save, then mark the attempt completed. */
async function submitAttempt(
  attempt: StudentAssignmentDocument,
  code: string,
  correctFor: Set<string>
) {
  const paper = applyAttemptPaper(QUESTIONS, attempt);

  let score = 0;
  const answers = paper.map((q) => {
    const studentAnswerIndex = correctFor.has(q.id)
      ? q.correctAnswerIndex
      : (q.correctAnswerIndex + 1) % q.options.length;
    const isCorrect = studentAnswerIndex === q.correctAnswerIndex;
    if (isCorrect) score++;
    return { questionId: q.id, studentAnswerIndex, isCorrect };
  });

  const result: StudentResult = {
    studentName: attempt.studentName,
    studentCode: code,
    attemptNumber: Number(attempt.attemptNumber) || 1,
    seatNumber: "N/A",
    studentAssignmentId: attempt.id,
    assessmentId: ASSESSMENT,
    quizId: ASSESSMENT,
    quizTitle: "Integration Quiz",
    score,
    totalQuestions: paper.length,
    answers,
    timeTakenSeconds: 120,
    submittedAt: Date.now()
  };

  const saved = await saveSubmissionToFirestore(result);
  await updateStudentAssignmentProgressInFirestore(
    attempt.id,
    { currentQuestionIndex: paper.length - 1, selectedAnswers: {}, timeTaken: 120 },
    "completed"
  );
  return { saved, score, paper };
}

/** Reads every submission admin-side — the teacher's view, without needing the teacher uid. */
async function allSubmissions() {
  let rows: Record<string, any>[] = [];
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDocs(collection(ctx.firestore(), "submissions"));
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
  return rows;
}

const NO_SHUFFLE = { shuffleQuestions: false, shuffleOptions: false };
const FULL_SHUFFLE = { shuffleQuestions: true, shuffleOptions: true };

describe("TEST C — retake is recorded as its own submission", () => {
  it("records attempt 1 and attempt 2 independently, and never overwrites", async () => {
    // ---- Attempt 1 -------------------------------------------------------
    const uidA = await joinAs(CODE_A);
    const first = await startAttempt(CODE_A, uidA, NO_SHUFFLE);
    expect(first.failed).toBe(false);
    expect(first.created).toBe(true);
    expect(first.attemptNumber).toBe(1);
    // Attempt 1 keeps the historical, suffix-free id — this is the backward-compat guarantee.
    expect(first.attemptId).toBe(`${ASSESSMENT}__c_${CODE_A}`);

    const sub1 = await submitAttempt(first.assignment, CODE_A, new Set(["q1", "q2"]));
    expect(sub1.saved).toBe(true);
    expect(sub1.score).toBe(2);

    expect(await allSubmissions()).toHaveLength(1);

    // ---- Student is blocked until the teacher acts ------------------------
    const blocked = await resolveAttemptChain(ASSESSMENT, CODE_A, uidA);
    expect(blocked.blockedByCompletedAttempt).toBe(true);
    expect(blocked.canStartNewAttempt).toBe(false);

    // A student who tries anyway is refused by the RULES, not merely by the UI.
    const sneaky = await startAttempt(CODE_A, uidA, NO_SHUFFLE);
    expect(sneaky.failed).toBe(true);

    // ---- Teacher grants the retake (the Unlock control) -------------------
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      // reopenAttemptInFirestore runs as the teacher in the app; the write itself is what matters.
      await setDoc(
        doc(ctx.firestore(), "studentAssignments", first.attemptId),
        { retakeApproved: true, retakeApprovedAt: Date.now() },
        { merge: true }
      );
    });

    const granted = await resolveAttemptChain(ASSESSMENT, CODE_A, uidA);
    expect(granted.canStartNewAttempt).toBe(true);
    expect(granted.nextAttemptNumber).toBe(2);

    // ---- Attempt 2 -------------------------------------------------------
    const second = await startAttempt(CODE_A, uidA, NO_SHUFFLE);
    expect(second.failed).toBe(false);
    expect(second.created).toBe(true);
    expect(second.attemptNumber).toBe(2);
    expect(second.attemptId).toBe(`${ASSESSMENT}__c_${CODE_A}__a2`);

    // A better score this time, so an overwrite would be unmistakable.
    const sub2 = await submitAttempt(second.assignment, CODE_A, new Set(["q1", "q2", "q3", "q4"]));
    expect(sub2.saved).toBe(true);
    expect(sub2.score).toBe(4);

    // ---- THE ASSERTION THIS WHOLE CHANGE EXISTS FOR ----------------------
    const rows = await allSubmissions();
    expect(rows).toHaveLength(2);

    const byAttempt = new Map(rows.map((r) => [r.attemptNumber, r]));
    expect(byAttempt.get(1)?.score).toBe(2);
    expect(byAttempt.get(2)?.score).toBe(4);
    expect(byAttempt.get(1)?.studentAssignmentId).toBe(first.attemptId);
    expect(byAttempt.get(2)?.studentAssignmentId).toBe(second.attemptId);
    // Each attempt carries its own timing and answers.
    expect(byAttempt.get(1)?.answers).toHaveLength(5);
    expect(byAttempt.get(2)?.answers).toHaveLength(5);
    expect(byAttempt.get(1)?.submittedAt).not.toBe(byAttempt.get(2)?.submittedAt);

    // Attempt 1's own record is untouched by the retake.
    const attempt1After = await getStudentAssignmentFromFirestore(first.attemptId);
    expect(attempt1After?.status).toBe("completed");
    expect(attempt1After?.attemptNumber).toBe(1);
  }, 60_000);

  it("one grant authorizes exactly one retake", async () => {
    const uidA = await joinAs(CODE_A);
    const a1 = await startAttempt(CODE_A, uidA, NO_SHUFFLE);
    await submitAttempt(a1.assignment, CODE_A, new Set());

    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", a1.attemptId),
        { retakeApproved: true }, { merge: true })
    );

    const a2 = await startAttempt(CODE_A, uidA, NO_SHUFFLE);
    expect(a2.failed).toBe(false);
    await submitAttempt(a2.assignment, CODE_A, new Set());

    // No second grant -> attempt 3 is refused.
    const a3 = await startAttempt(CODE_A, uidA, NO_SHUFFLE);
    expect(a3.failed).toBe(true);
    expect(await allSubmissions()).toHaveLength(2);
  }, 60_000);
});

describe("TESTS D & E — randomization is per attempt and stable", () => {
  it("two students sitting the same assessment get different papers", async () => {
    const uidA = await joinAs(CODE_A);
    const a = await startAttempt(CODE_A, uidA, FULL_SHUFFLE);

    const uidB = await joinAs(CODE_B);
    const b = await startAttempt(CODE_B, uidB, FULL_SHUFFLE);

    const orderA = a.assignment.questionIds.join(",");
    const orderB = b.assignment.questionIds.join(",");
    const permsA = JSON.stringify(a.assignment.optionPermutations);
    const permsB = JSON.stringify(b.assignment.optionPermutations);

    // Same questions, different arrangement. (Two independent 5!-and-4!^5 draws colliding on both
    // axes at once is vanishingly unlikely; if this ever flakes, the seeding is broken.)
    expect([...a.assignment.questionIds].sort()).toEqual([...b.assignment.questionIds].sort());
    expect(orderA !== orderB || permsA !== permsB).toBe(true);
  }, 60_000);

  it("a refresh replays the identical paper — re-reading never reshuffles", async () => {
    const uidA = await joinAs(CODE_A);
    const started = await startAttempt(CODE_A, uidA, FULL_SHUFFLE);
    const original = applyAttemptPaper(QUESTIONS, started.assignment);

    // Simulate three page reloads: re-read the attempt and rebuild the paper, as StudentQuiz does.
    for (let reload = 0; reload < 3; reload++) {
      const reread = await getStudentAssignmentFromFirestore(started.attemptId);
      expect(reread).not.toBeNull();
      expect(applyAttemptPaper(QUESTIONS, reread!)).toEqual(original);

      // And re-running the join path must NOT create a second attempt or a new arrangement.
      const rejoin = await startAttempt(CODE_A, uidA, FULL_SHUFFLE);
      expect(rejoin.created).toBe(false);
      expect(rejoin.attemptId).toBe(started.attemptId);
      expect(applyAttemptPaper(QUESTIONS, rejoin.assignment)).toEqual(original);
    }
  }, 60_000);

  it("a retake gets a fresh arrangement, and both attempts score correctly", async () => {
    const uidA = await joinAs(CODE_A);
    const a1 = await startAttempt(CODE_A, uidA, FULL_SHUFFLE);
    const r1 = await submitAttempt(a1.assignment, CODE_A, new Set(QUESTIONS.map((q) => q.id)));
    expect(r1.score).toBe(5); // all correct, under a shuffled paper

    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", a1.attemptId),
        { retakeApproved: true }, { merge: true })
    );

    const a2 = await startAttempt(CODE_A, uidA, FULL_SHUFFLE);
    const r2 = await submitAttempt(a2.assignment, CODE_A, new Set(["q1"]));
    expect(r2.score).toBe(1);

    expect(a2.assignment.randomSeed).not.toBe(a1.assignment.randomSeed);

    const rows = await allSubmissions();
    expect(rows.map((r) => r.score).sort()).toEqual([1, 5]);
  }, 60_000);

  it("TEST F — with randomization off, every student gets the canonical order", async () => {
    const uidA = await joinAs(CODE_A);
    const a = await startAttempt(CODE_A, uidA, NO_SHUFFLE);
    const uidB = await joinAs(CODE_B);
    const b = await startAttempt(CODE_B, uidB, NO_SHUFFLE);

    const canonical = QUESTIONS.map((q) => q.id);
    expect(a.assignment.questionIds).toEqual(canonical);
    expect(b.assignment.questionIds).toEqual(canonical);
    expect(a.assignment.optionPermutations).toEqual({});
    expect(b.assignment.optionPermutations).toEqual({});

    // And the rendered paper is the canonical questions, untouched.
    expect(applyAttemptPaper(QUESTIONS, a.assignment)).toEqual(QUESTIONS);
  }, 60_000);

  it("question randomization alone leaves option order canonical, and vice versa", async () => {
    const uidA = await joinAs(CODE_A);
    const qOnly = await startAttempt(CODE_A, uidA, { shuffleQuestions: true, shuffleOptions: false });
    expect(qOnly.assignment.optionPermutations).toEqual({});
    expect([...qOnly.assignment.questionIds].sort()).toEqual(QUESTIONS.map((q) => q.id).sort());

    const uidB = await joinAs(CODE_B);
    const cOnly = await startAttempt(CODE_B, uidB, { shuffleQuestions: false, shuffleOptions: true });
    expect(cOnly.assignment.questionIds).toEqual(QUESTIONS.map((q) => q.id));
    expect(Object.keys(cOnly.assignment.optionPermutations || {})).toHaveLength(QUESTIONS.length);
  }, 60_000);
});

/**
 * The pre-deployment review scenarios, stated explicitly end to end rather than inferred from the
 * blocks above. Paper A vs Paper B is the one that matters most: it is the difference between
 * "attempt 2 was persisted" and "attempt 2 was persisted with its OWN independent randomization".
 */
describe("REVIEW — retake identity, paper independence, and attempt-limit integrity", () => {
  async function grant(attemptId: string) {
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", attemptId), { retakeApproved: true }, { merge: true })
    );
  }

  it("Paper A and Paper B are independently generated and independently persisted", async () => {
    const uid = await joinAs(CODE_A);

    // ---- Attempt 1: Paper A ----
    const a1 = await startAttempt(CODE_A, uid, FULL_SHUFFLE);
    const paperA = applyAttemptPaper(QUESTIONS, a1.assignment);
    const orderA = [...a1.assignment.questionIds];
    const permsA = JSON.parse(JSON.stringify(a1.assignment.optionPermutations || {}));
    const seedA = a1.assignment.randomSeed;

    await submitAttempt(a1.assignment, CODE_A, new Set(["q1", "q2"]));
    await grant(a1.attemptId);

    // ---- Attempt 2: Paper B ----
    const a2 = await startAttempt(CODE_A, uid, FULL_SHUFFLE);

    // 6. A different attempt identity.
    expect(a2.attemptId).not.toBe(a1.attemptId);
    expect(a2.attemptId).toBe(`${a1.attemptId}__a2`);
    expect(a2.attemptNumber).toBe(2);

    // 2/7. A new seed and its own arrangement — NOT a copy of attempt 1's.
    expect(a2.assignment.randomSeed).not.toBe(seedA);
    const sameOrder = a2.assignment.questionIds.join(",") === orderA.join(",");
    const samePerms = JSON.stringify(a2.assignment.optionPermutations) === JSON.stringify(permsA);
    expect(sameOrder && samePerms).toBe(false);

    // 3. Attempt 2 does not reuse attempt 1's randomization — both are stored on their own docs.
    const storedA = await getStudentAssignmentFromFirestore(a1.attemptId);
    const storedB = await getStudentAssignmentFromFirestore(a2.attemptId);
    expect(storedA!.questionIds).toEqual(orderA);
    expect(storedA!.optionPermutations).toEqual(permsA);
    expect(storedB!.questionIds).toEqual(a2.assignment.questionIds);
    expect(storedB!.randomSeed).toBe(a2.assignment.randomSeed);

    // 5. Attempt 1 is byte-for-byte what it was: same paper, same completed state, same number.
    expect(applyAttemptPaper(QUESTIONS, storedA!)).toEqual(paperA);
    expect(storedA!.status).toBe("completed");
    expect(storedA!.attemptNumber).toBe(1);
    expect(storedA!.randomSeed).toBe(seedA);

    // 8/9. Refreshing attempt 2 replays Paper B exactly — three times over.
    const paperB = applyAttemptPaper(QUESTIONS, storedB!);
    for (let reload = 0; reload < 3; reload++) {
      const reread = await getStudentAssignmentFromFirestore(a2.attemptId);
      expect(applyAttemptPaper(QUESTIONS, reread!)).toEqual(paperB);
      const rejoin = await startAttempt(CODE_A, uid, FULL_SHUFFLE);
      expect(rejoin.created).toBe(false);           // no new attempt
      expect(rejoin.attemptId).toBe(a2.attemptId);
      expect(applyAttemptPaper(QUESTIONS, rejoin.assignment)).toEqual(paperB);
    }
    // ...and attempt 1 is still untouched after all that re-reading.
    expect(applyAttemptPaper(QUESTIONS, (await getStudentAssignmentFromFirestore(a1.attemptId))!))
      .toEqual(paperA);

    // Attempt 2 scores correctly on its own paper.
    const r2 = await submitAttempt(storedB!, CODE_A, new Set(QUESTIONS.map((q) => q.id)));
    expect(r2.saved).toBe(true);
    expect(r2.score).toBe(5);

    // 4. The teacher sees both, with independent scores.
    const rows = await allSubmissions();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.attemptNumber).sort()).toEqual([1, 2]);
    expect(rows.find((r) => r.attemptNumber === 1)?.score).toBe(2);
    expect(rows.find((r) => r.attemptNumber === 2)?.score).toBe(5);
  }, 90_000);

  it("10. cannot create attempt 3 without a further grant, then can with one", async () => {
    const uid = await joinAs(CODE_A);
    const a1 = await startAttempt(CODE_A, uid, NO_SHUFFLE);
    await submitAttempt(a1.assignment, CODE_A, new Set());
    await grant(a1.attemptId);

    const a2 = await startAttempt(CODE_A, uid, NO_SHUFFLE);
    expect(a2.failed).toBe(false);
    await submitAttempt(a2.assignment, CODE_A, new Set());

    // The grant on attempt 1 is spent; attempt 2 carries no grant of its own.
    const a3Blocked = await startAttempt(CODE_A, uid, NO_SHUFFLE);
    expect(a3Blocked.failed).toBe(true);
    expect(await allSubmissions()).toHaveLength(2);

    await grant(a2.attemptId);
    const a3 = await startAttempt(CODE_A, uid, NO_SHUFFLE);
    expect(a3.failed).toBe(false);
    expect(a3.attemptNumber).toBe(3);
    expect(a3.attemptId).toBe(`${a1.attemptId}__a3`);
  }, 90_000);

  it("11. a student cannot jump straight to attempt 9, by any route", async () => {
    const uid = await joinAs(CODE_A);
    const a1 = await startAttempt(CODE_A, uid, NO_SHUFFLE);
    await submitAttempt(a1.assignment, CODE_A, new Set());
    await grant(a1.attemptId); // even WITH a grant outstanding for attempt 2

    // Hand-crafted attempt 9, exactly as a tampered client would send it.
    const forged = await startOrResumeAttempt({
      id: buildAttemptId(ASSESSMENT, CODE_A, uid, 9),
      assessmentId: ASSESSMENT,
      blueprintId: "bp-1",
      studentName: "Student AAAA",
      studentClass: "2 Sec",
      questionIds: QUESTIONS.map((q) => q.id),
      optionPermutations: {},
      timeLimitMinutes: 20,
      status: "in_progress",
      studentUid: uid,
      studentCode: CODE_A,
      attemptNumber: 9,
      startedAt: Date.now(),
      createdAt: Date.now(),
      currentProgress: { currentQuestionIndex: 0, selectedAnswers: {}, timeTaken: 0, lastUpdated: Date.now() }
    } as StudentAssignmentDocument);
    expect(forged.failed).toBe(true);

    // ...and a submission for it cannot be smuggled in either.
    const orphanSubmission = await saveSubmissionToFirestore({
      studentName: "Student AAAA", studentCode: CODE_A, seatNumber: "N/A",
      studentAssignmentId: buildAttemptId(ASSESSMENT, CODE_A, uid, 9),
      assessmentId: ASSESSMENT, quizId: ASSESSMENT, quizTitle: "Integration Quiz",
      score: 5, totalQuestions: 5, answers: [], timeTakenSeconds: 1, submittedAt: Date.now()
    } as StudentResult);
    expect(orphanSubmission).toBe(false);
    expect(await allSubmissions()).toHaveLength(1);
  }, 90_000);

  it("a completed attempt cannot be re-submitted to inflate a score", async () => {
    const uid = await joinAs(CODE_A);
    const a1 = await startAttempt(CODE_A, uid, NO_SHUFFLE);
    const first = await submitAttempt(a1.assignment, CODE_A, new Set(["q1"]));
    expect(first.saved).toBe(true);
    expect(first.score).toBe(1);

    // Same attempt, better score — must be refused, and the stored score must not move.
    const replay = await submitAttempt(a1.assignment, CODE_A, new Set(QUESTIONS.map((q) => q.id)));
    expect(replay.saved).toBe(false);

    const rows = await allSubmissions();
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(1);
  }, 60_000);
});

describe("TEST I — existing data keeps working", () => {
  it("a legacy attempt (no permutations, canonical ids) plays and submits unchanged", async () => {
    const uidA = await joinAs(CODE_A);
    const legacyId = `${ASSESSMENT}__c_${CODE_A}`;

    // Written the way the app wrote attempts before randomization or retakes existed:
    // no optionPermutations, no randomSeed, no retakeApproved.
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", legacyId), {
        id: legacyId, assessmentId: ASSESSMENT, blueprintId: "bp-1",
        studentName: "Student AAAA", studentClass: "2 Sec",
        questionIds: QUESTIONS.map((q) => q.id),
        timeLimitMinutes: 20, status: "in_progress",
        studentUid: uidA, studentCode: CODE_A, attemptNumber: 1,
        startedAt: 1_700_000_000_000, createdAt: 1_700_000_000_000,
        currentProgress: { currentQuestionIndex: 0, selectedAnswers: {}, timeTaken: 0, lastUpdated: 1 }
      })
    );

    const legacy = await getStudentAssignmentFromFirestore(legacyId);
    // The paper is the canonical questions — byte-identical to pre-change behaviour.
    expect(applyAttemptPaper(QUESTIONS, legacy!)).toEqual(QUESTIONS);

    const submitted = await submitAttempt(legacy!, CODE_A, new Set(["q1", "q3"]));
    expect(submitted.saved).toBe(true);
    expect(submitted.score).toBe(2);

    const rows = await allSubmissions();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(`sub_${legacyId}`);
    // Readers default a missing attemptNumber to 1; the writer stamps it explicitly.
    expect(rows[0].attemptNumber).toBe(1);
  }, 60_000);

  /**
   * The hardest legacy shape: an attempt the PREVIOUS retake implementation reopened in place, so
   * it carries `attemptNumber: 2` while still sitting at chain position 1 (the suffix-free id).
   *
   * Deriving the next number from that stored field would ask for attempt 3, whose grant the rules
   * look for on a `__a2` that was never created — refusing the student permanently. Counting chain
   * positions instead lands them on `__a2`, where the grant actually lives.
   */
  it("a pre-deploy in-place-reopened attempt can still be granted a further retake", async () => {
    const uid = await joinAs(CODE_A);
    const legacyId = `${ASSESSMENT}__c_${CODE_A}`;

    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", legacyId), {
        id: legacyId, assessmentId: ASSESSMENT, questionIds: QUESTIONS.map((q) => q.id),
        // The tell-tale mismatch: number says 2, position says 1.
        status: "completed", attemptNumber: 2,
        studentUid: uid, studentCode: CODE_A, createdAt: 1_700_000_000_000
      })
    );

    const beforeGrant = await resolveAttemptChain(ASSESSMENT, CODE_A, uid);
    expect(beforeGrant.blockedByCompletedAttempt).toBe(true);
    // Positional, NOT latest.attemptNumber + 1 (which would be 3 and unreachable).
    expect(beforeGrant.nextAttemptNumber).toBe(2);

    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", legacyId), { retakeApproved: true }, { merge: true })
    );

    const retake = await startAttempt(CODE_A, uid, NO_SHUFFLE);
    expect(retake.failed).toBe(false);
    expect(retake.attemptId).toBe(`${legacyId}__a2`);

    const submitted = await submitAttempt(retake.assignment, CODE_A, new Set(["q1", "q2", "q3"]));
    expect(submitted.saved).toBe(true);
    expect(submitted.score).toBe(3);
  }, 90_000);

  it("a legacy completed attempt is still retakeable once the teacher grants it", async () => {
    const uidA = await joinAs(CODE_A);
    const legacyId = `${ASSESSMENT}__c_${CODE_A}`;
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", legacyId), {
        id: legacyId, assessmentId: ASSESSMENT, questionIds: QUESTIONS.map((q) => q.id),
        status: "completed", studentUid: uidA, studentCode: CODE_A, attemptNumber: 1,
        createdAt: 1_700_000_000_000
      })
    );

    // No grant on a legacy document -> no retake, which is the correct default.
    expect((await resolveAttemptChain(ASSESSMENT, CODE_A, uidA)).blockedByCompletedAttempt).toBe(true);

    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", legacyId), { retakeApproved: true }, { merge: true })
    );

    const retake = await startAttempt(CODE_A, uidA, NO_SHUFFLE);
    expect(retake.failed).toBe(false);
    expect(retake.attemptNumber).toBe(2);
  }, 60_000);
});
