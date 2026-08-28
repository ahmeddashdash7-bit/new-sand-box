/**
 * Firestore security rules — executable verification.
 *
 * Runs the REAL rules file against the Firestore emulator, so these are genuine results rather
 * than reasoning about what the rules probably do. Two Stage 2 findings (the attemptNumber
 * escalation and the silently-inert code claim) survived a careful manual read of the same file,
 * which is the reason this suite exists.
 *
 *   npm run test:rules
 *
 * The rules pin the teacher to a single uid. The file ships with a placeholder, so the loader
 * below substitutes a fixture uid; that keeps the suite working after the real uid is pasted in.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, runTransaction } from "firebase/firestore";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEACHER_UID = "teacher-uid-fixture";
const A_UID = "student-a-uid";
const B_UID = "student-b-uid";
const NEW_DEVICE_UID = "student-a-new-device-uid";

const CODE_A = "AAAA";
const CODE_B = "BBBB";
const CODE_FREE = "FREE";

const ASSESSMENT = "quiz-1";
/** The join code students actually type. assessmentCodes/{CODE} is addressed by it. */
const ASSESSMENT_CODE = "AB7XQ2";

/**
 * The derived attempt id. Attempt 1 is unsuffixed — that is deliberate and load-bearing: it keeps
 * every attempt and submission written before retakes existed valid, so nothing was migrated.
 */
const attemptId = (code: string, n = 1, assessment = ASSESSMENT) =>
  n <= 1 ? `${assessment}__c_${code}` : `${assessment}__c_${code}__a${n}`;
const ATTEMPT_A = attemptId(CODE_A);
const ATTEMPT_A2 = attemptId(CODE_A, 2);
const ATTEMPT_A3 = attemptId(CODE_A, 3);
const ATTEMPT_B = attemptId(CODE_B);
const LEGACY_ATTEMPT = "sa_quiz-1_x7k_1700000000";

/** A well-formed attempt payload as the app writes it. */
function attemptDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTEMPT_A,
    assessmentId: ASSESSMENT,
    blueprintId: "bp-1",
    studentName: "Student A",
    studentClass: "Grade 10",
    questionIds: ["q1", "q2"],
    optionPermutations: {},
    timeLimitMinutes: 20,
    status: "in_progress",
    studentUid: A_UID,
    studentCode: CODE_A,
    attemptNumber: 1,
    focusLossCount: 0,
    startedAt: 1_700_000_000_000,
    createdAt: 1_700_000_000_000,
    currentProgress: { currentQuestionIndex: 0, selectedAnswers: {}, timeTaken: 0, lastUpdated: 1 },
    ...overrides
  };
}

function submissionDoc(overrides: Record<string, unknown> = {}) {
  return {
    studentAssignmentId: ATTEMPT_A,
    assessmentId: ASSESSMENT,
    quizId: ASSESSMENT,
    quizTitle: "Test Quiz",
    studentUid: A_UID,
    studentName: "Student A",
    score: 2,
    totalQuestions: 2,
    percentage: 100,
    answers: [],
    timeTakenSeconds: 30,
    submittedAt: 1_700_000_100_000,
    status: "submitted",
    ...overrides
  };
}

let testEnv: RulesTestEnvironment;

const teacher = () => testEnv.authenticatedContext(TEACHER_UID).firestore();
/** Students are anonymous sessions, which is what the app actually creates. */
const student = (uid: string) =>
  testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).firestore();
/** A self-registered email/password account — the V1 forgery attempt. */
const impostor = () =>
  testEnv
    .authenticatedContext("self-signed-up-uid", { firebase: { sign_in_provider: "password" } })
    .firestore();
const signedOut = () => testEnv.unauthenticatedContext().firestore();

beforeAll(async () => {
  /**
   * Swap whatever uid the rules pin to for the fixture uid.
   *
   * Matches the literal inside teacherUid() rather than a fixed placeholder string, so this keeps
   * working now that the real uid is filled in — an exact-match replace would silently no-op and
   * leave the suite testing the wrong identity while still reporting green.
   */
  const raw = readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8");
  const rules = raw.replace(
    /(function\s+teacherUid\(\)\s*\{\s*return\s*)'[^']*'/,
    `$1'${TEACHER_UID}'`
  );
  if (rules === raw) {
    throw new Error("Could not substitute teacherUid() in firestore.rules — check its shape.");
  }

  testEnv = await initializeTestEnvironment({
    projectId: "demo-science-garden",
    // Must match the emulators.firestore.port in firebase.json.
    firestore: { rules, host: "127.0.0.1", port: 8088 }
  });
  // Generous: the very first run downloads the emulator jar before this can connect.
}, 120_000);

afterAll(async () => {
  await testEnv?.cleanup();
}, 30_000);

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await setDoc(doc(db, "studentCodes", CODE_A), {
      code: CODE_A, studentId: "std-a", name: "Student A", grade: "Grade 10",
      active: true, claimedByUid: A_UID, claimedAt: 1
    });
    await setDoc(doc(db, "studentCodes", CODE_B), {
      code: CODE_B, studentId: "std-b", name: "Student B", grade: "Grade 10",
      active: true, claimedByUid: B_UID, claimedAt: 1
    });
    await setDoc(doc(db, "studentCodes", CODE_FREE), {
      code: CODE_FREE, studentId: "std-c", name: "Student C", grade: "Grade 11",
      active: true, claimedByUid: "", claimedAt: 0
    });

    await setDoc(doc(db, "assessments", ASSESSMENT), {
      id: ASSESSMENT, title: "Test Quiz", questionIds: ["q1", "q2"],
      assessmentCode: ASSESSMENT_CODE, joinCode: ASSESSMENT_CODE,
      // Teacher-only metadata that must stay out of the student-readable mirror (F3).
      teacherWhatsApp: "201000205897", teacherId: "teacher-1", notes: "internal marking notes",
      shareSettings: { maxAttempts: 1 }
    });
    // The student-facing join mirror, as saveAssessmentToFirestore writes it.
    await setDoc(doc(db, "assessmentCodes", ASSESSMENT_CODE), {
      code: ASSESSMENT_CODE, assessmentId: ASSESSMENT, title: "Test Quiz",
      subject: "Chemistry", grade: "Grade 10", teacherName: "Dr. Ghada Abdelaal",
      visibility: "published", status: "active", timeLimitMinutes: 20,
      questionIds: ["q1", "q2"], assessmentSettings: { maxAttempts: 1 },
      shareSettings: { maxAttempts: 1 }, createdAt: 1_700_000_000_000
    });
    await setDoc(doc(db, "questions", "q1"), { id: "q1", text: "Q1", correctAnswerIndex: 0 });
    await setDoc(doc(db, "blueprints", "bp-1"), { id: "bp-1", title: "Blueprint" });
    await setDoc(doc(db, "groups", "grp-a"), {
      id: "grp-a", name: "Group A", createdAt: 1_700_000_000_000
    });
    await setDoc(doc(db, "students", "std-a"), {
      id: "std-a", name: "Student A", code: CODE_A, parentPhone: "201000000000"
    });
    await setDoc(doc(db, "users", "u1"), { id: "u1", username: "teacher" });
    await setDoc(doc(db, "reportDeliveryLogs", "log1"), { id: "log1", parentPhone: "201000000000" });
    await setDoc(doc(db, "studentAssignments", ATTEMPT_B), attemptDoc({
      id: ATTEMPT_B, studentUid: B_UID, studentCode: CODE_B, studentName: "Student B"
    }));
  });
}, 30_000);

// ===========================================================================
// Tests 1-15 from the verification report
// ===========================================================================

describe("attempt lifecycle (tests 1-15)", () => {
  it("1. Student A can create their own attempt", async () => {
    await assertSucceeds(setDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A), attemptDoc()));
  });

  it("2. Student A can update their own in-progress attempt", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", ATTEMPT_A), attemptDoc())
    );
    await assertSucceeds(
      updateDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A), {
        currentProgress: { currentQuestionIndex: 1, selectedAnswers: { 0: 1 }, timeTaken: 12, lastUpdated: 2 }
      })
    );
  });

  it("3. Student A cannot update a completed attempt", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", ATTEMPT_A), attemptDoc({ status: "completed" }))
    );
    await assertFails(
      updateDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A), {
        currentProgress: { currentQuestionIndex: 0, selectedAnswers: {}, timeTaken: 0, lastUpdated: 3 }
      })
    );
  });

  it("4. Student A cannot modify another student's attempt", async () => {
    await assertFails(
      updateDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_B), { status: "completed" })
    );
    await assertFails(getDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_B)));
  });

  it("5. Student A cannot create an attempt using another student's claimed code", async () => {
    await assertFails(
      setDoc(doc(student(A_UID), "studentAssignments", attemptId(CODE_B)),
        attemptDoc({ id: attemptId(CODE_B), studentCode: CODE_B }))
    );
  });

  it("6. A second anonymous UID cannot take over a claimed code", async () => {
    await assertFails(
      updateDoc(doc(student(NEW_DEVICE_UID), "studentCodes", CODE_A), {
        claimedByUid: NEW_DEVICE_UID, claimedAt: 99
      })
    );
  });

  it("7. Teacher can release the code and grant a retake on a completed attempt", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", ATTEMPT_A), attemptDoc({ status: "completed" }))
    );
    await assertSucceeds(
      updateDoc(doc(teacher(), "studentCodes", CODE_A), { claimedByUid: "", claimedAt: 0 })
    );
    /**
     * The grant, not a reset. The completed attempt keeps its status, answers and score — the
     * retake becomes a separate document (see the "retakes" block below). Reopening in place is
     * what used to destroy attempt 1's record.
     */
    await assertSucceeds(
      updateDoc(doc(teacher(), "studentAssignments", ATTEMPT_A), {
        retakeApproved: true, retakeApprovedAt: 1_700_000_500_000
      })
    );
  });

  it("8. After teacher release, a new UID can claim and continue", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, "studentCodes", CODE_A), { claimedByUid: "", claimedAt: 0 });
      await setDoc(doc(db, "studentAssignments", ATTEMPT_A), attemptDoc({ status: "in_progress", attemptNumber: 2 }));
    });

    await assertSucceeds(
      updateDoc(doc(student(NEW_DEVICE_UID), "studentCodes", CODE_A), {
        claimedByUid: NEW_DEVICE_UID, claimedAt: 100
      })
    );
    // Ownership now flows from the code claim even though studentUid still names the old device.
    await assertSucceeds(
      updateDoc(doc(student(NEW_DEVICE_UID), "studentAssignments", ATTEMPT_A), {
        currentProgress: { currentQuestionIndex: 1, selectedAnswers: {}, timeTaken: 5, lastUpdated: 4 }
      })
    );
  });

  it("9. Student cannot change attemptNumber to bypass the completed freeze", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", ATTEMPT_A), attemptDoc({ status: "completed" }))
    );
    await assertFails(
      updateDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A), {
        status: "in_progress", attemptNumber: 2
      })
    );
  });

  it("9b. Student cannot seed attemptNumber below 1 at create (the V2 escalation)", async () => {
    await assertFails(
      setDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A), attemptDoc({ attemptNumber: 0 }))
    );
    await assertFails(
      setDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A), attemptDoc({ attemptNumber: -100 }))
    );
  });

  it("10. Student cannot change identity fields on their own attempt", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", ATTEMPT_A), attemptDoc())
    );
    const db = student(A_UID);
    await assertFails(updateDoc(doc(db, "studentAssignments", ATTEMPT_A), { assessmentId: "quiz-2" }));
    await assertFails(updateDoc(doc(db, "studentAssignments", ATTEMPT_A), { studentUid: B_UID }));
    await assertFails(updateDoc(doc(db, "studentAssignments", ATTEMPT_A), { studentCode: CODE_B }));
    await assertFails(updateDoc(doc(db, "studentAssignments", ATTEMPT_A), { attemptNumber: 5 }));
    await assertFails(updateDoc(doc(db, "studentAssignments", ATTEMPT_A), { createdAt: 1 }));
  });

  it("11. Student cannot delete an attempt", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", ATTEMPT_A), attemptDoc())
    );
    await assertFails(deleteDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A)));
    await assertSucceeds(deleteDoc(doc(teacher(), "studentAssignments", ATTEMPT_A)));
  });

  it("12. Student cannot create, update or delete questions", async () => {
    const db = student(A_UID);
    await assertFails(setDoc(doc(db, "questions", "evil"), { id: "evil", text: "x" }));
    await assertFails(updateDoc(doc(db, "questions", "q1"), { correctAnswerIndex: 3 }));
    await assertFails(deleteDoc(doc(db, "questions", "q1")));
    await assertSucceeds(getDoc(doc(db, "questions", "q1")));
  });

  it("12b. Student cannot enumerate the question bank, only fetch by id", async () => {
    const db = student(A_UID);
    // What the quiz player actually does: one getDoc per id from the assessment.
    await assertSucceeds(getDoc(doc(db, "questions", "q1")));
    // What an attacker would do: dump the collection.
    await assertFails(getDocs(collection(db, "questions")));
    await assertSucceeds(getDocs(collection(teacher(), "questions")));
  });

  it("12c. Student cannot read blueprints at all", async () => {
    await assertFails(getDoc(doc(student(A_UID), "blueprints", "bp-1")));
    await assertFails(getDocs(collection(student(A_UID), "blueprints")));
    await assertSucceeds(getDocs(collection(teacher(), "blueprints")));
  });

  it("12d. Student can still resolve an assessment by join code, via the mirror", async () => {
    // getAssessmentByCodeFromFirestore now reads exactly one document, keyed by the code.
    const db = student(A_UID);
    const snap = await getDoc(doc(db, "assessmentCodes", ASSESSMENT_CODE));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.questionIds).toEqual(["q1", "q2"]);
  });

  it("13. Student cannot read the students collection", async () => {
    await assertFails(getDoc(doc(student(A_UID), "students", "std-a")));
    await assertFails(getDocs(collection(student(A_UID), "students")));
  });

  it("14. Student cannot read users", async () => {
    await assertFails(getDoc(doc(student(A_UID), "users", "u1")));
    await assertFails(getDocs(collection(student(A_UID), "users")));
  });

  it("15. Student can perform the minimum needed to join and sit a quiz", async () => {
    const db = student(A_UID);
    await assertSucceeds(getDoc(doc(db, "studentCodes", CODE_A)));
    await assertSucceeds(getDoc(doc(db, "assessmentCodes", ASSESSMENT_CODE)));
    await assertSucceeds(getDoc(doc(db, "questions", "q1")));
    await assertSucceeds(setDoc(doc(db, "studentAssignments", ATTEMPT_A), attemptDoc()));
    await assertSucceeds(
      updateDoc(doc(db, "studentAssignments", ATTEMPT_A), {
        currentProgress: { currentQuestionIndex: 1, selectedAnswers: { 0: 1 }, timeTaken: 9, lastUpdated: 5 }
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, "studentAssignments", ATTEMPT_A), { status: "completed", submittedAt: 123 })
    );
    await assertSucceeds(
      setDoc(doc(db, "submissions", `sub_${ATTEMPT_A}`), submissionDoc())
    );
  });
});

// ===========================================================================
// V1-V10
// ===========================================================================

describe("V1 — teacher boundary is not forgeable", () => {
  it("a self-registered email/password account gets no teacher powers", async () => {
    const db = impostor();
    await assertFails(getDoc(doc(db, "students", "std-a")));
    await assertFails(getDoc(doc(db, "users", "u1")));
    await assertFails(getDocs(collection(db, "submissions")));
    await assertFails(setDoc(doc(db, "questions", "evil"), { id: "evil" }));
    await assertFails(getDoc(doc(db, "reportDeliveryLogs", "log1")));
  });

  it("only the pinned uid is the teacher", async () => {
    await assertSucceeds(getDoc(doc(teacher(), "students", "std-a")));
  });
});

describe("V2 — attemptNumber escalation is closed", () => {
  it("a completed attempt cannot be reopened by any student manipulation", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", ATTEMPT_A),
        attemptDoc({ status: "completed", attemptNumber: 0 }))
    );
    const db = student(A_UID);
    await assertFails(updateDoc(doc(db, "studentAssignments", ATTEMPT_A), { status: "in_progress", attemptNumber: 1 }));
    await assertFails(updateDoc(doc(db, "studentAssignments", ATTEMPT_A), { status: "in_progress" }));
  });
});

describe("V3 — claim fields behave", () => {
  it("an unclaimed code can be claimed exactly once", async () => {
    await assertSucceeds(
      updateDoc(doc(student(A_UID), "studentCodes", CODE_FREE), { claimedByUid: A_UID, claimedAt: 7 })
    );
    await assertFails(
      updateDoc(doc(student(B_UID), "studentCodes", CODE_FREE), { claimedByUid: B_UID, claimedAt: 8 })
    );
  });

  it("a student cannot claim on someone else's behalf", async () => {
    await assertFails(
      updateDoc(doc(student(A_UID), "studentCodes", CODE_FREE), { claimedByUid: B_UID, claimedAt: 9 })
    );
  });

  it("a student cannot create a studentCodes document", async () => {
    await assertFails(
      setDoc(doc(student(A_UID), "studentCodes", "ZZZZ"), { code: "ZZZZ", claimedByUid: A_UID, name: "Invented" })
    );
  });

  it("a student cannot edit non-claim fields", async () => {
    await assertFails(
      updateDoc(doc(student(A_UID), "studentCodes", CODE_A), { claimedByUid: A_UID, name: "Renamed" })
    );
    await assertFails(
      updateDoc(doc(student(A_UID), "studentCodes", CODE_A), { claimedByUid: A_UID, active: false })
    );
  });
});

describe("V4 — submissions cannot be fabricated", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", ATTEMPT_A), attemptDoc())
    );
  });

  it("rejects an arbitrary submission id", async () => {
    await assertFails(setDoc(doc(student(A_UID), "submissions", "sub_anything_i_want"), submissionDoc()));
    await assertFails(setDoc(doc(student(A_UID), "submissions", `sub_${ATTEMPT_A}_2`), submissionDoc()));
  });

  it("rejects a submission attributed to another uid", async () => {
    await assertFails(
      setDoc(doc(student(A_UID), "submissions", `sub_${ATTEMPT_A}`), submissionDoc({ studentUid: B_UID }))
    );
  });

  it("rejects a submission referencing an attempt the caller does not own", async () => {
    await assertFails(
      setDoc(doc(student(A_UID), "submissions", `sub_${ATTEMPT_B}`),
        submissionDoc({ studentAssignmentId: ATTEMPT_B }))
    );
  });

  it("rejects an out-of-range score", async () => {
    await assertFails(
      setDoc(doc(student(A_UID), "submissions", `sub_${ATTEMPT_A}`), submissionDoc({ score: 99, totalQuestions: 2 }))
    );
    await assertFails(
      setDoc(doc(student(A_UID), "submissions", `sub_${ATTEMPT_A}`), submissionDoc({ score: -1 }))
    );
  });

  /**
   * Still one submission PER ATTEMPT, write-once. This is the guarantee that stops a student
   * re-submitting to improve a score; it is not, and never was, meant to stop a teacher-granted
   * retake. A retake now writes to a different attempt id and therefore a different submission
   * id — see the retakes block below.
   */
  it("allows exactly one submission per attempt and refuses the second", async () => {
    await assertSucceeds(setDoc(doc(student(A_UID), "submissions", `sub_${ATTEMPT_A}`), submissionDoc()));
    await assertFails(
      setDoc(doc(student(A_UID), "submissions", `sub_${ATTEMPT_A}`), submissionDoc({ score: 0 }))
    );
  });

  it("students cannot read submissions", async () => {
    await assertFails(getDocs(collection(student(A_UID), "submissions")));
  });
});

/**
 * ===========================================================================
 * RETAKES — a granted second attempt is a separate, independently recorded document.
 *
 * The bug these cover: every attempt shared one id, so a retake's submission collided with the
 * first attempt's and the write-once rule refused it. The retake was graded in the browser and
 * then silently dropped. Fixing it must NOT reopen the attemptNumber escalation, so the whole
 * point of this block is that a second attempt is possible ONLY with a teacher grant.
 * ===========================================================================
 */
describe("retakes — separate attempts, teacher-gated", () => {
  /** Attempt 1, finished. `granted` reflects whether the teacher pressed Unlock. */
  const seedCompletedAttempt1 = (granted: boolean) =>
    testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(
        doc(ctx.firestore(), "studentAssignments", ATTEMPT_A),
        attemptDoc({ status: "completed", retakeApproved: granted })
      )
    );

  const attempt2Doc = (overrides: Record<string, unknown> = {}) =>
    attemptDoc({ id: ATTEMPT_A2, attemptNumber: 2, ...overrides });

  it("refuses attempt 2 when attempt 1 is completed but NOT granted", async () => {
    await seedCompletedAttempt1(false);
    await assertFails(
      setDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A2), attempt2Doc())
    );
  });

  it("refuses attempt 2 when attempt 1 does not exist at all", async () => {
    await assertFails(
      setDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A2), attempt2Doc())
    );
  });

  it("refuses attempt 2 while attempt 1 is still in progress, even if granted", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", ATTEMPT_A),
        attemptDoc({ status: "in_progress", retakeApproved: true }))
    );
    await assertFails(
      setDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A2), attempt2Doc())
    );
  });

  it("allows attempt 2 once the teacher has granted it", async () => {
    await seedCompletedAttempt1(true);
    await assertSucceeds(
      setDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A2), attempt2Doc())
    );
  });

  it("a granted retake does not disturb attempt 1", async () => {
    await seedCompletedAttempt1(true);
    await assertSucceeds(
      setDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A2), attempt2Doc())
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore(), "studentAssignments", ATTEMPT_A));
      expect(snap.data()?.status).toBe("completed");
      expect(snap.data()?.attemptNumber).toBe(1);
    });
  });

  it("each attempt gets its own submission, and both survive", async () => {
    await seedCompletedAttempt1(true);
    await assertSucceeds(
      setDoc(doc(student(A_UID), "submissions", `sub_${ATTEMPT_A}`), submissionDoc({ score: 1 }))
    );
    await assertSucceeds(
      setDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A2), attempt2Doc())
    );
    await assertSucceeds(
      setDoc(doc(student(A_UID), "submissions", `sub_${ATTEMPT_A2}`),
        submissionDoc({ studentAssignmentId: ATTEMPT_A2, score: 2, attemptNumber: 2 }))
    );

    // Both documents exist, with their own scores. This is the whole feature.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const first = await getDoc(doc(db, "submissions", `sub_${ATTEMPT_A}`));
      const second = await getDoc(doc(db, "submissions", `sub_${ATTEMPT_A2}`));
      expect(first.exists()).toBe(true);
      expect(second.exists()).toBe(true);
      expect(first.data()?.score).toBe(1);
      expect(second.data()?.score).toBe(2);
    });
  });

  it("one grant buys exactly one attempt — attempt 3 needs a second grant", async () => {
    await seedCompletedAttempt1(true);
    await assertSucceeds(
      setDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A2), attempt2Doc())
    );
    // Attempt 2 is in progress and ungranted, so attempt 3 is refused.
    await assertFails(
      setDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A3),
        attemptDoc({ id: ATTEMPT_A3, attemptNumber: 3 }))
    );

    // Teacher completes the cycle: attempt 2 finishes and is granted.
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", ATTEMPT_A2),
        attempt2Doc({ status: "completed", retakeApproved: true }))
    );
    await assertSucceeds(
      setDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A3),
        attemptDoc({ id: ATTEMPT_A3, attemptNumber: 3 }))
    );
  });

  it("a student cannot grant themselves a retake", async () => {
    // On their own completed attempt...
    await seedCompletedAttempt1(false);
    await assertFails(
      updateDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A), { retakeApproved: true })
    );

    // ...nor on an in-progress one, where retakeApproved is outside the allowed key set.
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", ATTEMPT_A), attemptDoc({ status: "in_progress" }))
    );
    await assertFails(
      updateDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A), { retakeApproved: true })
    );
  });

  it("a student cannot skip ahead to a high attempt number", async () => {
    await seedCompletedAttempt1(true);
    const far = attemptId(CODE_A, 9);
    await assertFails(
      setDoc(doc(student(A_UID), "studentAssignments", far), attemptDoc({ id: far, attemptNumber: 9 }))
    );
  });

  it("the id must match the claimed attempt number, in both directions", async () => {
    await seedCompletedAttempt1(true);
    // Attempt 2's payload filed at attempt 1's id — this is precisely the overwrite that used to
    // happen, and it must be refused outright.
    await assertFails(
      setDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A), attemptDoc({ attemptNumber: 2 }))
    );
    // Attempt 1's payload filed at attempt 2's id.
    await assertFails(
      setDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A2),
        attemptDoc({ id: ATTEMPT_A2, attemptNumber: 1 }))
    );
  });

  it("a retake cannot be filed against someone else's granted attempt", async () => {
    await seedCompletedAttempt1(true);
    await assertFails(
      setDoc(doc(student(B_UID), "studentAssignments", ATTEMPT_A2), attempt2Doc({ studentUid: B_UID }))
    );
  });

  it("a submission for attempt 2 is refused while the caller owns only attempt 1", async () => {
    await seedCompletedAttempt1(true);
    await assertFails(
      setDoc(doc(student(A_UID), "submissions", `sub_${ATTEMPT_A2}`),
        submissionDoc({ studentAssignmentId: ATTEMPT_A2 }))
    );
  });
});

describe("V5 — deterministic id is enforced by the rules, not assumed", () => {
  it("rejects an attempt at an id that does not match assessmentId + code", async () => {
    await assertFails(
      setDoc(doc(student(A_UID), "studentAssignments", "whatever-i-like"), attemptDoc({ id: "whatever-i-like" }))
    );
    await assertFails(
      setDoc(doc(student(A_UID), "studentAssignments", `${ASSESSMENT}__c_WRONG`),
        attemptDoc({ id: `${ASSESSMENT}__c_WRONG` }))
    );
  });

  it("rejects an attempt whose status does not start in progress", async () => {
    await assertFails(
      setDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A), attemptDoc({ status: "completed" }))
    );
  });
});

describe("V6 — empty studentUid is not world-ownership", () => {
  it("an attempt with an empty studentUid is not readable or writable by an unrelated student", async () => {
    const orphanId = attemptId("FREE");
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", orphanId),
        attemptDoc({ id: orphanId, studentUid: "", studentCode: "FREE" }))
    );
    await assertFails(getDoc(doc(student(B_UID), "studentAssignments", orphanId)));
    await assertFails(updateDoc(doc(student(B_UID), "studentAssignments", orphanId), { status: "completed" }));
  });
});

describe("V7 — no parent phone numbers reachable by students", () => {
  it("the studentCodes mirror carries no parentPhone", async () => {
    const snap = await getDoc(doc(student(A_UID), "studentCodes", CODE_A));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.parentPhone).toBeUndefined();
  });

  it("students cannot reach phone numbers through students or reportDeliveryLogs", async () => {
    await assertFails(getDoc(doc(student(A_UID), "students", "std-a")));
    await assertFails(getDoc(doc(student(A_UID), "reportDeliveryLogs", "log1")));
  });
});

describe("V8 — legacy attempts fail closed without raising", () => {
  it("a legacy attempt lacking studentUid/studentCode denies cleanly", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "studentAssignments", LEGACY_ATTEMPT), {
        id: LEGACY_ATTEMPT, assessmentId: ASSESSMENT, studentName: "Old", status: "in_progress"
      })
    );
    await assertFails(getDoc(doc(student(A_UID), "studentAssignments", LEGACY_ATTEMPT)));
    await assertSucceeds(getDoc(doc(teacher(), "studentAssignments", LEGACY_ATTEMPT)));
  });
});

describe("V9 — orphanedImages is teacher-only", () => {
  it("a student cannot create orphanedImages documents", async () => {
    await assertFails(
      setDoc(doc(student(A_UID), "orphanedImages", "orphan_1"), { id: "orphan_1", imageUrl: "x" })
    );
    await assertSucceeds(
      setDoc(doc(teacher(), "orphanedImages", "orphan_1"), { id: "orphan_1", imageUrl: "x" })
    );
  });
});

describe("groups is teacher-only", () => {
  it("a student can neither read nor enumerate groups", async () => {
    await assertFails(getDoc(doc(student(A_UID), "groups", "grp-a")));
    await assertFails(getDocs(collection(student(A_UID), "groups")));
    await assertSucceeds(getDoc(doc(teacher(), "groups", "grp-a")));
    await assertSucceeds(getDocs(collection(teacher(), "groups")));
  });

  it("a student cannot create or delete groups", async () => {
    await assertFails(
      setDoc(doc(student(A_UID), "groups", "grp-x"), { id: "grp-x", name: "Injected", createdAt: 1 })
    );
    await assertFails(deleteDoc(doc(student(A_UID), "groups", "grp-a")));
    await assertSucceeds(
      setDoc(doc(teacher(), "groups", "grp-x"), { id: "grp-x", name: "Saturday 5pm", createdAt: 1 })
    );
    await assertSucceeds(deleteDoc(doc(teacher(), "groups", "grp-a")));
  });
});

describe("F1 — assessments cannot be enumerated into the question bank", () => {
  it("a student cannot list assessments", async () => {
    await assertFails(getDocs(collection(student(A_UID), "assessments")));
    await assertFails(
      getDocs(query(collection(student(A_UID), "assessments"), where("assessmentCode", "==", ASSESSMENT_CODE)))
    );
    await assertFails(
      getDocs(query(collection(student(A_UID), "assessments"), where("joinCode", "==", ASSESSMENT_CODE)))
    );
  });

  it("a student cannot read a single assessment document even knowing its id", async () => {
    // Denying only `list` would not have been enough: assessment ids appear in share links.
    await assertFails(getDoc(doc(student(A_UID), "assessments", ASSESSMENT)));
  });

  it("a student cannot list assessmentCodes to discover other join codes", async () => {
    await assertFails(getDocs(collection(student(A_UID), "assessmentCodes")));
    await assertSucceeds(getDocs(collection(teacher(), "assessmentCodes")));
  });

  it("a student cannot create or edit a join mirror", async () => {
    await assertFails(
      setDoc(doc(student(A_UID), "assessmentCodes", "ZZZZZZ"), {
        code: "ZZZZZZ", assessmentId: ASSESSMENT, questionIds: ["q1", "q2"]
      })
    );
    await assertFails(
      updateDoc(doc(student(A_UID), "assessmentCodes", ASSESSMENT_CODE), { questionIds: ["q1", "q2", "q3"] })
    );
  });

  it("the full attack chain is broken: no listing, so no question ids to harvest", async () => {
    const db = student(A_UID);
    // Step 1 of the chain — dump assessments — is where it now stops.
    await assertFails(getDocs(collection(db, "assessments")));
    // Step 2 was never open on its own.
    await assertFails(getDocs(collection(db, "questions")));
    // What remains legitimate: the one assessment whose code the student was given, and the
    // questions named inside it.
    const mirror = await getDoc(doc(db, "assessmentCodes", ASSESSMENT_CODE));
    expect(mirror.data()?.questionIds).toEqual(["q1", "q2"]);
    await assertSucceeds(getDoc(doc(db, "questions", "q1")));
  });

  it("the teacher keeps full read and write access to assessments", async () => {
    const db = teacher();
    await assertSucceeds(getDocs(collection(db, "assessments")));
    await assertSucceeds(getDoc(doc(db, "assessments", ASSESSMENT)));
    await assertSucceeds(setDoc(doc(db, "assessments", "quiz-2"), { id: "quiz-2", title: "New" }));
    await assertSucceeds(
      setDoc(doc(db, "assessmentCodes", "QQ1234"), { code: "QQ1234", assessmentId: "quiz-2", questionIds: [] })
    );
    await assertSucceeds(deleteDoc(doc(db, "assessmentCodes", "QQ1234")));
  });
});

describe("F3 — the join mirror carries no teacher-only metadata", () => {
  it("the mirror a student reads has no teacherWhatsApp, teacherId or notes", async () => {
    const snap = await getDoc(doc(student(A_UID), "assessmentCodes", ASSESSMENT_CODE));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.teacherWhatsApp).toBeUndefined();
    expect(snap.data()?.teacherId).toBeUndefined();
    expect(snap.data()?.notes).toBeUndefined();
  });

  it("that metadata still exists on the assessment, which only the teacher can read", async () => {
    const snap = await getDoc(doc(teacher(), "assessments", ASSESSMENT));
    expect(snap.data()?.teacherWhatsApp).toBe("201000205897");
    expect(snap.data()?.notes).toBe("internal marking notes");
    await assertFails(getDoc(doc(student(A_UID), "assessments", ASSESSMENT)));
  });
});

/**
 * The production join flow, in order. Every step below is something JoinAssessment actually does
 * before the student sees question 1, and the suite previously tested none of the reads:
 * test 1 called setDoc directly, which only ever evaluates the `create` rule.
 */
describe("F4 — the pre-create existence check on a brand-new attempt", () => {
  it("a student can GET their own attempt document before it exists", async () => {
    // JoinAssessment line ~313: getStudentAssignmentFromFirestore(attemptId) — "have I already
    // finished this?" — runs BEFORE the attempt is created, so the document is absent.
    await assertSucceeds(getDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_A)));
  });

  it("startOrResumeAttempt's transactional read+create succeeds end to end", async () => {
    // The real create path is runTransaction(tx.get -> tx.set), not a bare setDoc. The tx.get is
    // a read of a non-existent document and is billed/authorised as a get.
    const db = student(A_UID);
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        const ref = doc(db, "studentAssignments", ATTEMPT_A);
        const snap = await tx.get(ref);
        if (!snap.exists()) tx.set(ref, attemptDoc());
      })
    );
  });

  it("a non-existent attempt is still not a way to read someone else's", async () => {
    // The absent-document allowance must not become a general read of the collection.
    await assertFails(getDoc(doc(student(A_UID), "studentAssignments", ATTEMPT_B)));
    await assertFails(getDocs(collection(student(A_UID), "studentAssignments")));
  });

  it("a signed-out session still cannot probe for a non-existent attempt", async () => {
    await assertFails(getDoc(doc(signedOut(), "studentAssignments", ATTEMPT_A)));
  });
});

describe("signed-out sessions are denied everywhere", () => {
  it("cannot read any collection", async () => {
    const db = signedOut();
    await assertFails(getDoc(doc(db, "questions", "q1")));
    await assertFails(getDoc(doc(db, "assessments", ASSESSMENT)));
    await assertFails(getDoc(doc(db, "assessmentCodes", ASSESSMENT_CODE)));
    await assertFails(getDoc(doc(db, "studentCodes", CODE_A)));
    await assertFails(getDoc(doc(db, "students", "std-a")));
    await assertFails(getDoc(doc(db, "users", "u1")));
    await assertFails(getDoc(doc(db, "groups", "grp-a")));
  });

  it("cannot write anything", async () => {
    const db = signedOut();
    await assertFails(setDoc(doc(db, "studentAssignments", ATTEMPT_A), attemptDoc()));
    await assertFails(setDoc(doc(db, "submissions", `sub_${ATTEMPT_A}`), submissionDoc()));
    await assertFails(setDoc(doc(db, "orphanedImages", "o1"), { id: "o1" }));
    await assertFails(setDoc(doc(db, "groups", "grp-x"), { id: "grp-x", name: "X" }));
  });
});

describe("the default-deny catch-all", () => {
  it("denies the undeclared assignments collection to everyone", async () => {
    await assertFails(setDoc(doc(student(A_UID), "assignments", "hw-1"), { id: "hw-1" }));
    await assertFails(setDoc(doc(teacher(), "assignments", "hw-1"), { id: "hw-1" }));
  });
});
