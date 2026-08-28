import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs,
  runTransaction,
  serverTimestamp,
  deleteField
} from "firebase/firestore";
import { deleteQuestionImage } from "./images/imageService";
import type { DeleteOutcome, QuestionImageRef } from "./images/imageService";
import {
  StudentResult, 
  User, 
  BankQuestion, 
  HomeworkBlueprint, 
  Quiz, 
  StudentAssignmentDocument, 
  Question,
  SubmissionDocument,
  StudentRecord,
  StudentGroup,
  ReportDeliveryInfo,
  ReportDeliveryLog
} from "../types";
import { DEFAULT_BANK_QUESTIONS, DEFAULT_BLUEPRINTS, SAMPLE_QUIZZES } from "../data/templates";
import { normalizeTags } from "./tagUtils";
import { normalizeStudentCode } from "./codeGenerator";
import { DEFAULT_GRADE, normalizeGroup } from "./classification";

// Firebase configuration for Science Garden.
// No storageBucket: Firebase Cloud Storage is deliberately not used — it requires the paid Blaze
// plan. Question image FILES live with the image provider (see src/lib/images/), and Firestore
// stores only reference metadata.
const firebaseConfig = {
  apiKey: "AIzaSyD_cqDki-IT_4ZYPHoKa395PuMLnApVAf4",
  authDomain: "sciencegarden-9d3d9.firebaseapp.com",
  projectId: "sciencegarden-9d3d9",
  messagingSenderId: "895195906817",
  appId: "1:895195906817:web:40e32c53c0fc7ce279d100"
};

// Initialize Firebase App & Firestore Database
const app = initializeApp(firebaseConfig);

/**
 * NOTE: initializeFirestore(..., { ignoreUndefinedProperties: true }) replaces getFirestore(app).
 *
 * Question objects legitimately carry optional fields (imageUrl, imagePath, difficulty, ...) that are
 * `undefined` for questions without an image. Firestore's default behaviour is to THROW on any
 * undefined value, including undefined values nested inside arrays such as
 * studentAssignments.generatedQuestions[]. Those throws were being swallowed by handleFirestoreError,
 * so writes appeared to succeed while silently persisting nothing. Ignoring undefined makes the
 * "optional image" model safe: absent fields are simply omitted from the document.
 */
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

/**
 * Firebase Authentication.
 *
 * The source of truth for authentication state — see src/lib/authStore.ts. Sessions persist
 * across page reloads via the SDK's default browser persistence; no localStorage handling of
 * credentials or sessions exists anywhere in this app.
 */
export const auth = getAuth(app);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.warn("Firestore Notice/Error:", JSON.stringify(errInfo));
}

// ==========================================
// QUESTION IMAGES — reference bookkeeping
// ==========================================
//
// Image FILES are handled entirely by src/lib/images/ (see imageService). Firestore stores only
// reference metadata: imageUrl / imagePath / imageProvider / imageName / imageWidth /
// imageHeight / imageUploadedAt. Image bytes are NEVER written to Firestore.
//
// This section holds the two concerns that are inherently Firestore's job: deciding whether a
// remote file is still referenced by another question, and recording assets we were unable to
// delete so they can be cleaned up later.

/**
 * Records an asset whose Firestore reference was removed but whose remote file could not be
 * deleted (for unsigned Cloudinary uploads, once the ~10 minute delete token has expired).
 *
 * Writing this down keeps the situation honest and auditable: the file can be purged later by
 * hand from the provider's media library, or automatically once a signing backend exists.
 */
export async function recordOrphanedImage(params: {
  imagePath?: string;
  imageUrl?: string;
  imageProvider?: string;
  questionId?: string;
  reason?: string;
}): Promise<boolean> {
  if (!params.imagePath && !params.imageUrl) return false;

  try {
    const id = `orphan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    await setDoc(doc(db, "orphanedImages", id), {
      id,
      imagePath: params.imagePath || "",
      imageUrl: params.imageUrl || "",
      imageProvider: params.imageProvider || "unknown",
      questionId: params.questionId || "",
      reason: params.reason || "delete-token-expired",
      orphanedAt: Date.now()
    });
    return true;
  } catch (err) {
    // Never block a delete on bookkeeping.
    handleFirestoreError(err, OperationType.WRITE, "orphanedImages");
    return false;
  }
}

/**
 * Deletes a question image only when no OTHER question document still references the same file.
 *
 * Quiz/homework questions are independent copies that reuse the bank question's remote asset, so
 * deleting one copy must never blank the figure in an already-published assessment.
 *
 * Never throws — image cleanup is best effort and must not block the Firestore delete.
 */
export async function deleteQuestionImageIfUnreferenced(
  ref: QuestionImageRef,
  exceptQuestionId: string,
  options?: { deleteToken?: string }
): Promise<DeleteOutcome> {
  if (!ref || !ref.imageUrl) return "not-owned";

  // Only provider-owned files have an imagePath worth checking for sharing.
  if (ref.imagePath) {
    try {
      const q = query(collection(db, "questions"), where("imagePath", "==", ref.imagePath));
      const snap = await getDocs(q);
      const stillReferenced = snap.docs.some((d) => (d.data().id || d.id) !== exceptQuestionId);
      if (stillReferenced) return "not-owned";
    } catch (err) {
      // If we cannot prove the file is unreferenced, keep it. An orphaned file is strictly
      // better than a broken image in a live assessment.
      handleFirestoreError(err, OperationType.LIST, `questions?imagePath=${ref.imagePath}`);
      return "not-owned";
    }
  }

  const outcome = await deleteQuestionImage(ref, options);

  if (outcome === "orphaned") {
    await recordOrphanedImage({
      imagePath: ref.imagePath,
      imageUrl: ref.imageUrl,
      imageProvider: ref.imageProvider,
      questionId: exceptQuestionId
    });
  }

  return outcome;
}

// ==========================================
// 1. COLLECTION: users
// ==========================================

/**
 * @deprecated Authentication is Firebase Auth. This collection is now only a profile record.
 *
 * The `password` field is deliberately NOT written any more. It used to persist the credential in
 * plaintext, which is why the old `users` documents may still contain one — that is existing data
 * and is left untouched here; clear it from the Firebase Console if you want it gone. Nothing in
 * the app calls this function today, and nothing should start: passwords belong to Firebase Auth.
 */
export async function saveUserToFirestore(user: User): Promise<boolean> {
  try {
    const userDocRef = doc(db, "users", user.username.toLowerCase());
    await setDoc(userDocRef, {
      id: user.id,
      username: user.username.toLowerCase(),
      fullName: user.fullName,
      role: user.role,
      grade: user.grade || "",
      centerGroup: user.centerGroup || "",
      specialization: user.specialization || "",
      schoolName: user.schoolName || "",
      createdAt: user.createdAt || Date.now()
    }, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${user.username}`);
    return false;
  }
}

export async function getUserFromFirestore(username: string): Promise<User | null> {
  try {
    const userDocRef = doc(db, "users", username.trim().toLowerCase());
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
      return docSnap.data() as User;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${username}`);
  }
  return null;
}

// ==========================================
// 2. COLLECTION: questions
// ==========================================

/**
 * Builds the image portion of a question write payload.
 *
 * Because every question write uses { merge: true }, the three cases must stay distinct:
 *
 *   imageUrl === undefined  -> OMIT the image fields entirely, preserving whatever is stored.
 *   imageUrl === ""         -> explicitly CLEAR the image (the teacher removed it).
 *   imageUrl is a real URL  -> write the full reference metadata.
 *
 * Previously this always wrote `imageUrl: q.imageUrl || ""`, so saving a quiz whose questions had
 * been stripped of their image fields silently blanked the image on the original bank question.
 */
function buildQuestionImagePayload(q: Partial<Question>): Record<string, unknown> {
  if (q.imageUrl === undefined) return {};

  if (!q.imageUrl) {
    return {
      imageUrl: "",
      imagePath: "",
      imageProvider: "",
      imageName: "",
      imageWidth: null,
      imageHeight: null,
      imageUploadedAt: null
    };
  }

  return {
    imageUrl: q.imageUrl,
    imagePath: q.imagePath || "",
    imageProvider: q.imageProvider || "",
    imageName: q.imageName || "",
    imageWidth: q.imageWidth || null,
    imageHeight: q.imageHeight || null,
    imageUploadedAt: q.imageUploadedAt || null
  };
}

/** Just the image reference fields of a question — never any of its required fields. */
export interface QuestionImageFields {
  imageUrl?: string;
  imagePath?: string;
  imageProvider?: Question["imageProvider"];
  imageName?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageUploadedAt?: number;
}

/**
 * Copies the image reference fields off a question. Used everywhere a question is converted or
 * copied (bank -> quiz, bank -> homework, quiz -> bank, submission -> report) so the image
 * survives every hop. Returns an empty object for questions without an image.
 */
export function pickQuestionImageFields(q: Partial<Question> | undefined): QuestionImageFields {
  if (!q || !q.imageUrl) return {};
  return {
    imageUrl: q.imageUrl,
    imagePath: q.imagePath,
    imageProvider: q.imageProvider,
    imageName: q.imageName,
    imageWidth: q.imageWidth,
    imageHeight: q.imageHeight,
    imageUploadedAt: q.imageUploadedAt
  };
}

export async function saveBankQuestionToFirestore(q: BankQuestion | Question): Promise<boolean> {
  try {
    const qDocRef = doc(db, "questions", q.id);
    const bankQ = q as BankQuestion;
    await setDoc(qDocRef, {
      id: q.id,
      text: q.text,
      type: q.type,
      options: q.options || [],
      correctAnswerIndex: Number(q.correctAnswerIndex) || 0,
      explanation: q.explanation || "",
      ...buildQuestionImagePayload(q),
      subject: q.subject || "Integrated Science",
      grade: bankQ.grade || DEFAULT_GRADE,
      lesson: q.lesson || "",
      topic: bankQ.topic || q.lesson || "",
      difficulty: q.difficulty || "Medium",
      estimatedTimeMinutes: Number(bankQ.estimatedTimeMinutes) || 2,
      tags: normalizeTags(bankQ.tags || []),
      isPriority: Boolean(bankQ.isPriority),
      status: bankQ.status || "active",
      createdBy: q.createdBy || "Teacher",
      createdAt: Number(q.createdAt) || Date.now()
    }, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `questions/${q.id}`);
    return false;
  }
}

/**
 * Writes a question that is being used INSIDE a quiz/homework, without ever overwriting
 * Question Bank metadata.
 *
 * Why this exists: publishing an assessment has to guarantee that every id in `questionIds`
 * resolves to a document in the `questions` collection, so it writes each question. But quiz
 * question objects only carry *content* (text / options / answer / explanation / image) — they
 * have no `tags`, `grade`, `topic`, `estimatedTimeMinutes` or `status`. Routing them through the
 * authoritative writer meant every publish stamped those fields with defaults, so a blueprint
 * quiz (which reuses the bank question's id) silently reset the bank question's tags to [],
 * grade to the default grade, topic to the lesson name, and status to "active".
 *
 *   - Document already exists -> write content only. Bank metadata is left completely untouched.
 *   - Document does not exist  -> create it in full, exactly as before, so a quiz-only question
 *                                 still becomes a well-formed standalone question document.
 */
export async function saveQuestionReferenceToFirestore(q: Question): Promise<boolean> {
  try {
    const qDocRef = doc(db, "questions", q.id);
    const existing = await getDoc(qDocRef);

    if (!existing.exists()) {
      // Brand-new question document: fall back to the authoritative writer so it is created
      // with a complete, valid shape (including createdAt, which orderBy queries require).
      return saveBankQuestionToFirestore(q);
    }

    // Content the teacher may legitimately have edited in the quiz builder. Every optional
    // field is included only when it is actually present, so an absent field never blanks
    // the stored one.
    await setDoc(
      qDocRef,
      {
        id: q.id,
        text: q.text,
        type: q.type,
        options: q.options || [],
        correctAnswerIndex: Number(q.correctAnswerIndex) || 0,
        ...(q.explanation !== undefined ? { explanation: q.explanation } : {}),
        ...(q.subject !== undefined ? { subject: q.subject } : {}),
        ...(q.lesson !== undefined ? { lesson: q.lesson } : {}),
        ...(q.difficulty !== undefined ? { difficulty: q.difficulty } : {}),
        ...buildQuestionImagePayload(q)
        // Deliberately NOT written here: grade, topic, tags, estimatedTimeMinutes,
        // isPriority, status, createdBy, createdAt. Those belong to the Question Bank and are
        // only ever changed from the Question Bank editor.
      },
      { merge: true }
    );

    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `questions/${q.id} (reference)`);
    return false;
  }
}

export async function deleteBankQuestionFromFirestore(id: string): Promise<boolean> {
  try {
    const qDocRef = doc(db, "questions", id);
    const docSnap = await getDoc(qDocRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.imageUrl) {
        // Only remove the file if no other question (e.g. a quiz copy) still points at it.
        // The delete token is long gone by now, so this typically records an orphan.
        await deleteQuestionImageIfUnreferenced(
          { imageUrl: data.imageUrl, imagePath: data.imagePath, imageProvider: data.imageProvider },
          id
        );
      }
    }
    await deleteDoc(qDocRef);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `questions/${id}`);
    return false;
  }
}

export function subscribeToFirestoreQuestions(callback: (questions: BankQuestion[]) => void): () => void {
  try {
    const questionsRef = collection(db, "questions");
    const q = query(questionsRef, orderBy("createdAt", "desc"));

    return onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          // Auto-seed default bank questions if empty
          DEFAULT_BANK_QUESTIONS.forEach(bq => saveBankQuestionToFirestore(bq).catch(() => {}));
        }
        const list: BankQuestion[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: data.id || docSnap.id,
            text: data.text || "",
            type: data.type,
            options: data.options || [],
            correctAnswerIndex: Number(data.correctAnswerIndex) || 0,
            explanation: data.explanation || "",
            imageUrl: data.imageUrl || undefined,
            imagePath: data.imagePath || undefined,
            imageProvider: data.imageProvider || undefined,
            imageName: data.imageName || undefined,
            imageWidth: data.imageWidth || undefined,
            imageHeight: data.imageHeight || undefined,
            imageUploadedAt: data.imageUploadedAt || undefined,
            subject: data.subject,
            grade: data.grade || "Grade 10",
            lesson: data.lesson || "",
            topic: data.topic || "",
            difficulty: data.difficulty,
            estimatedTimeMinutes: Number(data.estimatedTimeMinutes) || 2,
            tags: normalizeTags(data.tags || []),
            isPriority: Boolean(data.isPriority),
            status: data.status || "active",
            createdBy: data.createdBy,
            createdAt: Number(data.createdAt) || Date.now()
          } as BankQuestion);
        });
        callback(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "questions");
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, "questions");
    return () => {};
  }
}

export async function fetchBankQuestionsFromFirestore(): Promise<BankQuestion[]> {
  try {
    const questionsRef = collection(db, "questions");
    const q = query(questionsRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const list: BankQuestion[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      list.push({
        id: data.id || docSnap.id,
        text: data.text || "",
        type: data.type,
        options: data.options || [],
        correctAnswerIndex: Number(data.correctAnswerIndex) || 0,
        explanation: data.explanation || "",
        imageUrl: data.imageUrl || undefined,
        imagePath: data.imagePath || undefined,
        imageProvider: data.imageProvider || undefined,
        imageName: data.imageName || undefined,
        imageWidth: data.imageWidth || undefined,
        imageHeight: data.imageHeight || undefined,
        imageUploadedAt: data.imageUploadedAt || undefined,
        subject: data.subject,
        grade: data.grade || "Grade 10",
        lesson: data.lesson || "",
        topic: data.topic || "",
        difficulty: data.difficulty,
        estimatedTimeMinutes: Number(data.estimatedTimeMinutes) || 2,
        tags: normalizeTags(data.tags || []),
        isPriority: Boolean(data.isPriority),
        status: data.status || "active",
        createdBy: data.createdBy,
        createdAt: Number(data.createdAt) || Date.now()
      } as BankQuestion);
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, "questions");
    return [];
  }
}

export async function fetchQuestionsByIdsFromFirestore(ids: string[]): Promise<Question[]> {
  if (!ids || ids.length === 0) return [];
  try {
    const promises = ids.map(id => getDoc(doc(db, "questions", id)));
    const snapshots = await Promise.all(promises);
    const result: Question[] = [];
    snapshots.forEach((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        result.push({
          id: data.id || snap.id,
          text: data.text || "",
          type: data.type,
          options: data.options || [],
          correctAnswerIndex: Number(data.correctAnswerIndex) || 0,
          explanation: data.explanation || "",
          imageUrl: data.imageUrl || undefined,
          imagePath: data.imagePath || undefined,
          imageProvider: data.imageProvider || undefined,
          imageName: data.imageName || undefined,
          imageWidth: data.imageWidth || undefined,
          imageHeight: data.imageHeight || undefined,
          imageUploadedAt: data.imageUploadedAt || undefined,
          subject: data.subject,
          grade: data.grade || "Grade 10",
          lesson: data.lesson || "",
          topic: data.topic || "",
          difficulty: data.difficulty,
          tags: normalizeTags(data.tags || []),
          isPriority: Boolean(data.isPriority),
          createdBy: data.createdBy,
          createdAt: Number(data.createdAt) || Date.now()
        } as Question);
      }
    });
    return result;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, "questions-by-ids");
    return [];
  }
}

export async function deleteQuestionFromFirestore(questionId: string): Promise<boolean> {
  try {
    const qDocRef = doc(db, "questions", questionId);
    const docSnap = await getDoc(qDocRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.imageUrl) {
        // Only remove the file if no other question (e.g. a quiz copy) still points at it.
        await deleteQuestionImageIfUnreferenced(
          { imageUrl: data.imageUrl, imagePath: data.imagePath, imageProvider: data.imageProvider },
          questionId
        );
      }
    }
    await deleteDoc(qDocRef);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `questions/${questionId}`);
    return false;
  }
}

// ==========================================
// 3. COLLECTION: blueprints
// ==========================================

export async function saveBlueprintToFirestore(bp: HomeworkBlueprint): Promise<boolean> {
  try {
    const bpDocRef = doc(db, "blueprints", bp.id);
    await setDoc(bpDocRef, {
      id: bp.id,
      title: bp.title,
      subject: bp.subject,
      grade: bp.grade || DEFAULT_GRADE,
      description: bp.description || "",
      lesson: bp.lesson || "",
      topics: bp.topics || [],
      tags: normalizeTags(bp.tags || []),
      questionMix: bp.questionMix || { mcqCount: 0, trueFalseCount: 0, shortAnswerCount: 0 },
      totalQuestions: Number(bp.totalQuestions) || 1,
      difficultyDistribution: bp.difficultyDistribution || { easyCount: 0, mediumCount: 0, hardCount: 0 },
      allowedQuestionTypes: bp.allowedQuestionTypes || [],
      timeLimitMinutes: Number(bp.timeLimitMinutes) || 0,
      randomizeQuestionOrder: Boolean(bp.randomizeQuestionOrder),
      randomizeAnswerChoices: Boolean(bp.randomizeAnswerChoices),
      allowBacktracking: Boolean(bp.allowBacktracking ?? true),
      passingScorePct: Number(bp.passingScorePct) || 60,
      maxAttempts: Number(bp.maxAttempts) || 2,
      teacherName: bp.teacherName || "Teacher",
      status: bp.status || "active",
      createdAt: Number(bp.createdAt) || Date.now()
    }, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `blueprints/${bp.id}`);
    return false;
  }
}

export async function deleteBlueprintFromFirestore(id: string): Promise<boolean> {
  try {
    const bpDocRef = doc(db, "blueprints", id);
    await deleteDoc(bpDocRef);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `blueprints/${id}`);
    return false;
  }
}

export function subscribeToFirestoreBlueprints(callback: (blueprints: HomeworkBlueprint[]) => void): () => void {
  try {
    const blueprintsRef = collection(db, "blueprints");
    const q = query(blueprintsRef, orderBy("createdAt", "desc"));

    return onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          DEFAULT_BLUEPRINTS.forEach(bp => saveBlueprintToFirestore(bp).catch(() => {}));
        }
        const list: HomeworkBlueprint[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: data.id || docSnap.id,
            title: data.title || "Blueprint",
            subject: data.subject,
            grade: data.grade || "Grade 10",
            description: data.description || "",
            lesson: data.lesson || "",
            topics: data.topics || [],
            tags: normalizeTags(data.tags || []),
            questionMix: data.questionMix,
            totalQuestions: Number(data.totalQuestions) || 0,
            difficultyDistribution: data.difficultyDistribution || { easyCount: 0, mediumCount: 0, hardCount: 0 },
            allowedQuestionTypes: data.allowedQuestionTypes || [],
            timeLimitMinutes: Number(data.timeLimitMinutes) || 0,
            randomizeQuestionOrder: Boolean(data.randomizeQuestionOrder),
            randomizeAnswerChoices: Boolean(data.randomizeAnswerChoices),
            allowBacktracking: Boolean(data.allowBacktracking ?? true),
            passingScorePct: Number(data.passingScorePct) || 60,
            maxAttempts: Number(data.maxAttempts) || 2,
            teacherName: data.teacherName || "Teacher",
            status: data.status || "active",
            createdAt: Number(data.createdAt) || Date.now()
          } as HomeworkBlueprint);
        });
        callback(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "blueprints");
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, "blueprints");
    return () => {};
  }
}

export async function fetchBlueprintsFromFirestore(): Promise<HomeworkBlueprint[]> {
  try {
    const blueprintsRef = collection(db, "blueprints");
    const q = query(blueprintsRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const list: HomeworkBlueprint[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      list.push({
        id: data.id || docSnap.id,
        title: data.title || "Blueprint",
        subject: data.subject,
        grade: data.grade || "Grade 10",
        description: data.description || "",
        lesson: data.lesson || "",
        topics: data.topics || [],
        tags: normalizeTags(data.tags || []),
        questionMix: data.questionMix,
        totalQuestions: Number(data.totalQuestions) || 0,
        difficultyDistribution: data.difficultyDistribution || { easyCount: 0, mediumCount: 0, hardCount: 0 },
        allowedQuestionTypes: data.allowedQuestionTypes || [],
        timeLimitMinutes: Number(data.timeLimitMinutes) || 0,
        randomizeQuestionOrder: Boolean(data.randomizeQuestionOrder),
        randomizeAnswerChoices: Boolean(data.randomizeAnswerChoices),
        allowBacktracking: Boolean(data.allowBacktracking ?? true),
        passingScorePct: Number(data.passingScorePct) || 60,
        maxAttempts: Number(data.maxAttempts) || 2,
        teacherName: data.teacherName || "Teacher",
        status: data.status || "active",
        createdAt: Number(data.createdAt) || Date.now()
      } as HomeworkBlueprint);
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, "blueprints");
    return [];
  }
}

import { generateAssessmentCode, normalizeAssessmentCode } from "./codeGenerator";

// Helper: Ensure unique 6-8 character uppercase alphanumeric assessment code
export async function generateUniqueAssessmentCode(): Promise<string> {
  let isUnique = false;
  let code = "";
  let attempts = 0;

  while (!isUnique && attempts < 10) {
    attempts++;
    code = generateAssessmentCode(6); // 6-character uppercase alphanumeric string (e.g. AB7XQ2)
    try {
      const qCode = query(collection(db, "assessments"), where("assessmentCode", "==", code));
      const qJoin = query(collection(db, "assessments"), where("joinCode", "==", code));
      const [snap1, snap2] = await Promise.all([getDocs(qCode), getDocs(qJoin)]);
      if (snap1.empty && snap2.empty) {
        isUnique = true;
      }
    } catch {
      // Fallback if offline or permission restricted
      isUnique = true;
    }
  }
  return code || generateAssessmentCode(6);
}

/**
 * Resolves THE canonical join code for an assessment: keeps the existing code when it is already
 * canonical, otherwise mints a fresh unique one. Single source of truth — the value returned here
 * is what gets stored, displayed, put in the share URL and matched at student join time.
 */
export async function resolveAssessmentCode(quiz: Pick<Quiz, "shareSettings" | "assessmentCode">): Promise<string> {
  const existing =
    normalizeAssessmentCode(quiz.shareSettings?.joinCode) ||
    normalizeAssessmentCode(quiz.shareSettings?.assessmentCode) ||
    normalizeAssessmentCode(quiz.assessmentCode);

  return existing || generateUniqueAssessmentCode();
}

/** Builds the student join URL for a code. Used everywhere a share link is produced. */
export function buildAssessmentShareUrl(joinCode: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  return `${origin}${pathname}?code=${joinCode}`;
}

// ==========================================
// 4. COLLECTION: assessments
// ==========================================

/**
 * Persists an assessment and returns THE canonical join code it was stored under
 * (null when the write failed). Callers must use the returned value for anything they
 * display, copy, put in a QR code or hand to a student — never a locally invented code.
 */
export async function saveAssessmentToFirestore(quiz: Quiz): Promise<string | null> {
  try {
    // 1. Ensure every question id resolves to a document in the reusable 'questions' collection.
    //    Uses the reference writer, NOT the authoritative one: publishing an assessment must
    //    never rewrite Question Bank metadata (tags / grade / topic / estimatedTimeMinutes /
    //    status) belonging to the source question.
    if (quiz.questions && quiz.questions.length > 0) {
      for (const q of quiz.questions) {
        await saveQuestionReferenceToFirestore(q);
      }
    }

    const questionIds = quiz.questions ? quiz.questions.map(q => q.id) : [];

    // THE canonical 6-8 char uppercase alphanumeric join code for this assessment.
    const joinCode = await resolveAssessmentCode(quiz);
    const publicShareLink = buildAssessmentShareUrl(joinCode);

    const assessmentSettings = {
      // Caller-supplied settings first...
      timeLimitMinutes: quiz.shareSettings?.timeLimitMinutes || 0,
      shuffleQuestions: quiz.shareSettings?.shuffleQuestions || false,
      shuffleOptions: quiz.shareSettings?.shuffleOptions || false,
      showAnswersAfterSubmit: quiz.shareSettings?.showAnswersAfterSubmit ?? true,
      maxAttempts: quiz.shareSettings?.maxAttempts || 1,
      publicLinkEnabled: quiz.shareSettings?.publicLinkEnabled ?? true,
      requireStudentName: quiz.shareSettings?.requireStudentName ?? true,
      requireGradeClass: quiz.shareSettings?.requireGradeClass ?? true,
      requireStudentId: quiz.shareSettings?.requireStudentId ?? false,
      ...(quiz.shareSettings || {}),
      // ...and the canonical code LAST so it always wins. This spread used to come after the
      // code fields, which let a non-canonical incoming code (e.g. "SG-123456") overwrite the
      // validated one inside shareSettings while the top-level fields kept the good code —
      // leaving the same document holding two different codes.
      joinCode,
      assessmentCode: joinCode
    };

    // 2. Save Assessment document inside 'assessments' collection with all required fields
    const assessmentRef = doc(db, "assessments", quiz.id);

    // Read the code this assessment was previously stored under, BEFORE overwriting it, so a
    // rotated code does not leave a live mirror behind serving the old questionIds.
    let previousCode: string | null = null;
    try {
      const before = await getDoc(assessmentRef);
      if (before.exists()) {
        const beforeData = before.data();
        previousCode =
          normalizeAssessmentCode(beforeData.assessmentCode) ||
          normalizeAssessmentCode(beforeData.joinCode);
      }
    } catch {
      // Non-fatal: worst case a stale mirror survives until the next backfill.
    }

    await setDoc(assessmentRef, {
      id: quiz.id,
      assessmentId: quiz.id,
      assessmentCode: joinCode,
      joinCode: joinCode,
      publicShareLink: publicShareLink,
      shareLink: publicShareLink,
      status: quiz.status || "active",
      publishDate: quiz.createdAt || Date.now(),
      createdAt: quiz.createdAt || Date.now(),
      dueDate: quiz.dueDate || "",
      startDate: quiz.startDate || "",
      blueprintId: quiz.blueprintId || `bp-${quiz.id}`,
      blueprintReference: quiz.blueprintId || `bp-${quiz.id}`,
      teacherId: quiz.teacherId || quiz.teacherName || "teacher-1",
      teacherName: quiz.teacherName || "Science Teacher",
      teacherReference: quiz.teacherName || "Science Teacher",
      teacherWhatsApp: quiz.teacherWhatsApp || "",
      timeLimit: quiz.shareSettings?.timeLimitMinutes || 0,
      timeLimitMinutes: quiz.shareSettings?.timeLimitMinutes || 0,
      title: quiz.title,
      type: quiz.type || "quiz",
      subject: quiz.subject,
      grade: quiz.grade,
      questionIds,
      visibility: quiz.visibility || "published",
      notes: quiz.notes || "",
      assessmentSettings,
      shareSettings: assessmentSettings
    }, { merge: true });

    // 3. Mirror the student-facing subset into assessmentCodes/{CODE}. This is what a joining
    //    student actually reads — `assessments` is teacher-only. See the section below.
    await upsertAssessmentCodeMirror(quiz, joinCode, questionIds, assessmentSettings, previousCode);

    return joinCode;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `assessments/${quiz.id}`);
    return null;
  }
}

export async function getAssessmentFromFirestore(id: string): Promise<Quiz | null> {
  try {
    const docSnap = await getDoc(doc(db, "assessments", id));
    if (!docSnap.exists()) return null;

    const data = docSnap.data();
    const questionIds: string[] = data.questionIds || [];

    // Resolve referenced questions from 'questions' collection
    const questions = await fetchQuestionsByIdsFromFirestore(questionIds);

    return {
      id: data.id || docSnap.id,
      title: data.title,
      type: data.type,
      blueprintId: data.blueprintId || data.blueprintReference,
      subject: data.subject,
      grade: data.grade,
      visibility: data.visibility || "published",
      status: data.status || "active",
      dueDate: data.dueDate,
      startDate: data.startDate,
      teacherId: data.teacherId || data.teacherReference,
      teacherName: data.teacherName || data.teacherReference,
      teacherWhatsApp: data.teacherWhatsApp,
      notes: data.notes,
      assessmentCode: data.assessmentCode || data.joinCode,
      shareSettings: data.assessmentSettings || data.shareSettings,
      questions,
      createdAt: data.publishDate || data.createdAt
    } as Quiz;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `assessments/${id}`);
    return null;
  }
}

// ==========================================
// 4b. COLLECTION: assessmentCodes  (student-facing join mirror)
// ==========================================

/**
 * Mirrors the fields a student needs at join time into assessmentCodes/{CODE}.
 *
 * WHY (F1 — assessment → question enumeration): an assessment document carries `questionIds`,
 * and `questions/{id}` is readable by any signed-in session because that is exactly how the quiz
 * player loads its own paper. While students could also LIST `assessments`, the two together were
 * a full bank dump: enumerate assessments → harvest every question id → fetch each question, model
 * answers included. That defeats the anti-cheating purpose of the product.
 *
 * The fix follows the studentCodes/{CODE} pattern already in this file: the join code IS the
 * document id, so resolving an assessment needs no query and possession of one code buys exactly
 * one assessment. With this in place `assessments` closes to the teacher only.
 *
 * WHY THE SUBSET (F3): teacherWhatsApp, teacherId/teacherReference, internal `notes`, and the
 * share links are deliberately NOT mirrored. The student flow never reads them, and this mirror is
 * now the ONE assessment surface a student can reach — anything added here is published to every
 * holder of a join code. Keep it to what the quiz player consumes.
 */
function buildAssessmentCodeMirrorPayload(
  quiz: Quiz,
  joinCode: string,
  questionIds: string[],
  assessmentSettings: Record<string, unknown>
): Record<string, unknown> {
  return {
    code: joinCode,
    assessmentId: quiz.id,
    title: quiz.title || "",
    type: quiz.type || "quiz",
    subject: quiz.subject,
    grade: quiz.grade,
    blueprintId: quiz.blueprintId || `bp-${quiz.id}`,
    // The teacher's display name is shown on the student's welcome screen and report header.
    // Her phone number is not, and must not be mirrored here.
    teacherName: quiz.teacherName || "Science Teacher",
    visibility: quiz.visibility || "published",
    status: quiz.status || "active",
    startDate: quiz.startDate || "",
    dueDate: quiz.dueDate || "",
    timeLimitMinutes: Number((assessmentSettings as { timeLimitMinutes?: number }).timeLimitMinutes) || 0,
    questionIds,
    assessmentSettings,
    shareSettings: assessmentSettings,
    createdAt: quiz.createdAt || Date.now(),
    updatedAt: Date.now()
  };
}

/**
 * Writes (or refreshes) the join mirror for one assessment. Idempotent — a merge, keyed by the
 * code, so re-running it on an already-mirrored assessment is a no-op in effect.
 *
 * `previousCode` retires a mirror orphaned by a code rotation. Without it the old code would keep
 * resolving to a stale questionIds list forever.
 */
export async function upsertAssessmentCodeMirror(
  quiz: Quiz,
  joinCode: string,
  questionIds: string[],
  assessmentSettings: Record<string, unknown>,
  previousCode?: string | null
): Promise<boolean> {
  const cleanCode = normalizeAssessmentCode(joinCode);
  if (!cleanCode) return false;

  try {
    await setDoc(
      doc(db, "assessmentCodes", cleanCode),
      buildAssessmentCodeMirrorPayload(quiz, cleanCode, questionIds, assessmentSettings),
      { merge: true }
    );

    const stale = normalizeAssessmentCode(previousCode);
    if (stale && stale !== cleanCode) {
      await deleteDoc(doc(db, "assessmentCodes", stale)).catch(() => {
        /* already gone */
      });
    }
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `assessmentCodes/${cleanCode}`);
    return false;
  }
}

/**
 * Creates any missing join mirrors for assessments published before this collection existed.
 *
 * Additive, idempotent and non-destructive: it never touches the `assessments` documents, never
 * changes an assessment or question id, and only writes a mirror when one is missing or has
 * drifted from the assessment it represents. Safe to run any number of times.
 *
 * Runs from the teacher panel, which is the only place holding both the full assessment list and
 * the permissions to write this collection.
 */
export async function backfillAssessmentCodeMirrors(quizzes: Quiz[]): Promise<number> {
  let written = 0;

  for (const quiz of quizzes) {
    const cleanCode =
      normalizeAssessmentCode(quiz.assessmentCode) ||
      normalizeAssessmentCode(quiz.shareSettings?.joinCode) ||
      normalizeAssessmentCode(quiz.shareSettings?.assessmentCode);

    // An assessment with no canonical code has no join path to protect, and minting one here
    // would change the code a teacher has already handed out. Skip it.
    if (!cleanCode) continue;

    const questionIds = (quiz.questions || []).map(q => q.id).filter(Boolean);

    try {
      const ref = doc(db, "assessmentCodes", cleanCode);
      const existing = await getDoc(ref);
      const data = existing.exists() ? (existing.data() as Record<string, unknown>) : null;

      const storedIds = Array.isArray(data?.questionIds) ? (data!.questionIds as string[]) : [];
      const idsMatch =
        storedIds.length === questionIds.length &&
        storedIds.every((id, i) => id === questionIds[i]);

      // Repair conditions, in order: no mirror at all; a mirror that predates a question-set
      // change; a mirror written before the F3 field pruning (so it still carries teacher-only
      // metadata that must not be student-readable).
      const needsCreate = !data;
      const staleQuestions = data ? !idsMatch : false;
      const carriesTeacherOnlyFields = data
        ? data.teacherWhatsApp !== undefined ||
          data.notes !== undefined ||
          data.teacherId !== undefined
        : false;

      if (!needsCreate && !staleQuestions && !carriesTeacherOnlyFields) continue;

      // Same shape saveAssessmentToFirestore stores: the canonical code always wins, so a mirror
      // never disagrees with the id it is filed under.
      const assessmentSettings: Record<string, unknown> = {
        ...((quiz.shareSettings || {}) as unknown as Record<string, unknown>),
        joinCode: cleanCode,
        assessmentCode: cleanCode
      };
      await setDoc(
        ref,
        {
          ...buildAssessmentCodeMirrorPayload(quiz, cleanCode, questionIds, assessmentSettings),
          // Explicitly strip anything a pre-F3 mirror may already hold. deleteField() on an
          // absent field is a no-op, so this stays safe on freshly created mirrors.
          ...(carriesTeacherOnlyFields
            ? { teacherWhatsApp: deleteField(), notes: deleteField(), teacherId: deleteField() }
            : {})
        },
        { merge: true }
      );
      written++;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `assessmentCodes/${cleanCode}`);
    }
  }

  return written;
}

/**
 * Builds a Quiz from a join mirror, hydrating the referenced questions.
 *
 * Note the shape difference from getAssessmentFromFirestore: teacherWhatsApp and notes come back
 * undefined by design. StudentQuiz already falls back to its default contact number, so the
 * student-side WhatsApp share keeps working.
 */
async function quizFromAssessmentCodeMirror(
  data: Record<string, any>,
  cleanCode: string
): Promise<Quiz> {
  const questionIds: string[] = Array.isArray(data.questionIds) ? data.questionIds : [];
  const questions = await fetchQuestionsByIdsFromFirestore(questionIds);

  return {
    id: data.assessmentId || cleanCode,
    title: data.title,
    type: data.type,
    blueprintId: data.blueprintId,
    subject: data.subject,
    grade: data.grade,
    visibility: data.visibility || "published",
    status: data.status || "active",
    dueDate: data.dueDate,
    startDate: data.startDate,
    teacherName: data.teacherName,
    assessmentCode: data.code || cleanCode,
    shareSettings: data.assessmentSettings || data.shareSettings,
    questions,
    createdAt: data.createdAt
  } as Quiz;
}

/** True for the teacher's session. Students are always anonymous — see authStore.ts. */
function isPrivilegedSession(): boolean {
  return !!auth.currentUser && !auth.currentUser.isAnonymous;
}

export async function getAssessmentByCodeFromFirestore(codeStr: string): Promise<Quiz | null> {
  const cleanCode = codeStr.trim().toUpperCase();
  if (!cleanCode) return null;

  /**
   * 1. The join mirror — the only path a student has, and the only one that needs to work at
   *    scale. One document read, addressed by the code, no listing.
   */
  const mirrorCode = normalizeAssessmentCode(cleanCode);
  if (mirrorCode) {
    try {
      const mirror = await getDoc(doc(db, "assessmentCodes", mirrorCode));
      if (mirror.exists()) {
        return await quizFromAssessmentCodeMirror(mirror.data() as Record<string, any>, mirrorCode);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `assessmentCodes/${mirrorCode}`);
    }
  }

  /**
   * 2. Legacy resolution against `assessments`.
   *
   * Only the teacher can reach this collection now, so running it for a student would produce
   * nothing but permission-denied noise. It stays for the teacher's own preview/share flows and
   * for any assessment whose mirror the backfill has not yet created.
   */
  if (!isPrivilegedSession()) return null;

  try {
    // 2a. Query by assessmentCode (Indexed single-field equality lookup)
    const q1 = query(collection(db, "assessments"), where("assessmentCode", "==", cleanCode));
    const snap1 = await getDocs(q1);
    if (!snap1.empty) {
      return getAssessmentFromFirestore(snap1.docs[0].id);
    }

    // 2b. Query by joinCode (Indexed single-field equality lookup)
    const q2 = query(collection(db, "assessments"), where("joinCode", "==", cleanCode));
    const snap2 = await getDocs(q2);
    if (!snap2.empty) {
      return getAssessmentFromFirestore(snap2.docs[0].id);
    }

    // 2c. Direct document lookup by ID
    const directDoc = await getDoc(doc(db, "assessments", cleanCode));
    if (directDoc.exists()) {
      return getAssessmentFromFirestore(cleanCode);
    }

    // 2d. Query all assessments fallback
    const allAssessments = await getDocs(collection(db, "assessments"));
    let matchedDocId: string | null = null;
    allAssessments.forEach(d => {
      const data = d.data();
      if (
        d.id.toUpperCase() === cleanCode ||
        d.id.slice(-6).toUpperCase() === cleanCode ||
        (data.assessmentCode && data.assessmentCode.toUpperCase() === cleanCode) ||
        (data.joinCode && data.joinCode.toUpperCase() === cleanCode)
      ) {
        matchedDocId = d.id;
      }
    });

    if (matchedDocId) {
      return getAssessmentFromFirestore(matchedDocId);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `assessments/by-code/${codeStr}`);
  }
  return null;
}

export function subscribeToFirestoreAssessments(callback: (quizzes: Quiz[]) => void): () => void {
  try {
    const assessmentsRef = collection(db, "assessments");
    const q = query(assessmentsRef, orderBy("createdAt", "desc"));

    return onSnapshot(
      q,
      async (snapshot) => {
        if (snapshot.empty) {
          SAMPLE_QUIZZES.forEach(sq => saveAssessmentToFirestore(sq).catch(() => {}));
        }
        const quizzes: Quiz[] = [];
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          const questionIds: string[] = data.questionIds || [];
          const questions = await fetchQuestionsByIdsFromFirestore(questionIds);
          quizzes.push({
            id: data.id || docSnap.id,
            title: data.title,
            type: data.type,
            blueprintId: data.blueprintId,
            subject: data.subject,
            grade: data.grade,
            visibility: data.visibility,
            status: data.status,
            dueDate: data.dueDate,
            startDate: data.startDate,
            teacherId: data.teacherId,
            teacherName: data.teacherName,
            teacherWhatsApp: data.teacherWhatsApp,
            notes: data.notes,
            // Carried so the share dialog always has the stored code available, even for older
            // documents whose shareSettings map predates the canonical-code fix.
            assessmentCode: data.assessmentCode || data.joinCode,
            shareSettings: data.assessmentSettings || data.shareSettings,
            questions: questions && questions.length > 0 ? questions : (data.questions || []),
            createdAt: data.createdAt
          } as Quiz);
        }
        callback(quizzes);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "assessments");
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, "assessments");
    return () => {};
  }
}

export async function fetchAssessmentsFromFirestore(): Promise<Quiz[]> {
  try {
    const assessmentsRef = collection(db, "assessments");
    const q = query(assessmentsRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const quizzes: Quiz[] = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const questionIds: string[] = data.questionIds || [];
      const questions = await fetchQuestionsByIdsFromFirestore(questionIds);
      quizzes.push({
        id: data.id || docSnap.id,
        title: data.title,
        type: data.type,
        blueprintId: data.blueprintId,
        subject: data.subject,
        grade: data.grade,
        visibility: data.visibility,
        status: data.status,
        dueDate: data.dueDate,
        startDate: data.startDate,
        teacherId: data.teacherId,
        teacherName: data.teacherName,
        teacherWhatsApp: data.teacherWhatsApp,
        notes: data.notes,
        // Carried so the share dialog always has the stored code available, even for older
        // documents whose shareSettings map predates the canonical-code fix.
        assessmentCode: data.assessmentCode || data.joinCode,
        shareSettings: data.assessmentSettings || data.shareSettings,
        questions,
        createdAt: data.createdAt
      } as Quiz);
    }
    return quizzes;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, "assessments");
    return [];
  }
}

export async function deleteAssessmentFromFirestore(id: string): Promise<boolean> {
  try {
    /**
     * Retire the join mirror first. If the assessment document went away while its mirror
     * survived, the code would keep resolving and the questionIds would stay reachable — a
     * deleted assessment must stop being joinable.
     */
    try {
      const snap = await getDoc(doc(db, "assessments", id));
      if (snap.exists()) {
        const data = snap.data();
        const code =
          normalizeAssessmentCode(data.assessmentCode) || normalizeAssessmentCode(data.joinCode);
        if (code) {
          await deleteDoc(doc(db, "assessmentCodes", code));
        }
      }
    } catch {
      // Non-fatal — the assessment delete below is still the primary action.
    }

    await deleteDoc(doc(db, "assessments", id));
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `assessments/${id}`);
    return false;
  }
}

// ==========================================
// 5. COLLECTION: studentAssignments
// ==========================================

/**
 * Builds the deterministic attempt document id.
 *
 * Anchored to the student CODE when there is one, because the code is the identity that survives
 * cleared storage, incognito and a change of device. The uid is only the fallback for a student
 * joining without a code — that fallback is genuinely weaker, and is the case a teacher closes by
 * issuing codes.
 *
 * THE ATTEMPT NUMBER IS PART OF THE KEY, with one deliberate exception: attempt 1 keeps the
 * historical suffix-free id.
 *
 *   attempt 1 → quiz-1__c_AAAA
 *   attempt 2 → quiz-1__c_AAAA__a2
 *   attempt 3 → quiz-1__c_AAAA__a3
 *
 * Why the key and not a field: uniqueness of an attempt is then a property Firestore itself
 * enforces, and one a security rule can check (rules can compare the document id to the payload;
 * they cannot run a query). This is the same reasoning that put the student code in the id.
 * Before this, the id stopped at the code, so a retake landed on attempt 1's document — and, one
 * level down, on attempt 1's submission id, where the rules correctly refused to let a student
 * overwrite an existing submission. That refusal is why retakes silently vanished.
 *
 * Why attempt 1 is unsuffixed: every attempt and every submission written before multi-attempt
 * support keeps working untouched, and `sub_${attemptId}` keeps resolving to the same historical
 * submission document. Nothing had to be migrated.
 *
 * Firestore document ids may not contain "/", so every component is sanitised.
 */
export function buildAttemptId(
  assessmentId: string,
  studentCode?: string,
  uid?: string,
  attemptNumber: number = 1
): string {
  const safe = (s: string) => String(s || "").replace(/[^A-Za-z0-9_-]/g, "_");
  const anchor = studentCode ? `c_${safe(studentCode.toUpperCase())}` : `u_${safe(uid || "anon")}`;
  const base = `${safe(assessmentId)}__${anchor}`;
  const n = Math.max(1, Math.floor(Number(attemptNumber) || 1));
  return n <= 1 ? base : `${base}__a${n}`;
}

/**
 * Upper bound on the attempt-chain walk in resolveAttemptChain.
 *
 * Not a product limit — the teacher's grant is what limits retakes. This only stops a corrupt or
 * adversarial state from spinning the loop, and costs one document read per step.
 */
const MAX_ATTEMPTS_PER_ASSESSMENT = 20;

export interface AttemptChainState {
  /** The attempt to resume, when one is still open. */
  active: StudentAssignmentDocument | null;
  /** The most recent attempt, open or completed. Null when the student has never sat this. */
  latest: StudentAssignmentDocument | null;
  /** The number the NEXT attempt would take. */
  nextAttemptNumber: number;
  /** True when the latest attempt is finished and the teacher has granted another sitting. */
  canStartNewAttempt: boolean;
  /** True when the latest attempt is finished and no retake has been granted. */
  blockedByCompletedAttempt: boolean;
}

/**
 * Walks this student's attempts at one assessment and reports where they stand.
 *
 * Reads by derived id rather than by query, which is what keeps `studentAssignments` unlistable
 * to students: the caller can only construct ids for their own code. In practice this is one or
 * two document reads, since the chain is short and stops at the first gap.
 */
export async function resolveAttemptChain(
  assessmentId: string,
  studentCode?: string,
  uid?: string
): Promise<AttemptChainState> {
  let latest: StudentAssignmentDocument | null = null;
  let n = 1;

  for (; n <= MAX_ATTEMPTS_PER_ASSESSMENT; n++) {
    const attempt = await getStudentAssignmentFromFirestore(
      buildAttemptId(assessmentId, studentCode, uid, n)
    );
    if (!attempt) break;
    latest = attempt;
  }

  if (!latest) {
    return {
      active: null,
      latest: null,
      nextAttemptNumber: 1,
      canStartNewAttempt: true,
      blockedByCompletedAttempt: false
    };
  }

  /**
   * The next attempt number is the next CHAIN POSITION, not `latest.attemptNumber + 1`.
   *
   * The id scheme and the security rules both key off position: creating attempt N requires the
   * document derived for N-1 to exist and carry the grant. Trusting the stored field instead
   * breaks the one case where the two disagree — an attempt reopened IN PLACE by the previous
   * retake implementation, which left `attemptNumber: 2` on the document still sitting at chain
   * position 1 (the suffix-free id). Asking for attempt 3 there makes the rules look for a grant
   * on `__a2`, which never existed, and the student is refused forever with no way back.
   *
   * Counting positions instead means that student's next attempt is 2, filed at `__a2`, and the
   * grant is looked up on the legacy document that actually holds it. This is what makes the
   * deployment safe without a manual "no attempt mid-flight" sweep beforehand.
   *
   * `n - 1` is the number of consecutive attempt documents found, since the loop breaks on the
   * first gap.
   */
  const chainLength = Math.max(1, n - 1);
  const isCompleted = latest.status === "completed";
  const granted = latest.retakeApproved === true;

  return {
    active: isCompleted ? null : latest,
    latest,
    nextAttemptNumber: chainLength + 1,
    canStartNewAttempt: isCompleted && granted,
    blockedByCompletedAttempt: isCompleted && !granted
  };
}

export async function saveStudentAssignmentToFirestore(assignment: StudentAssignmentDocument): Promise<boolean> {
  try {
    const docRef = doc(db, "studentAssignments", assignment.id);
    const payload: Record<string, unknown> = {
      id: assignment.id,
      assessmentId: assignment.assessmentId,
      assessmentReference: assignment.assessmentReference || assignment.assessmentId,
      blueprintId: assignment.blueprintId || "",
      studentName: assignment.studentName,
      studentClass: assignment.studentClass,
      class: assignment.studentClass,
      studentIdNumber: assignment.studentIdNumber || "",
      phoneNumber: assignment.phoneNumber || "",
      phone: assignment.phoneNumber || "",
      questionIds: assignment.questionIds || [],
      // Was absent from this payload entirely, which meant the field could never be persisted and
      // assessmentReconstructor always fell back to unshuffled bank order.
      optionPermutations: assignment.optionPermutations || {},
      generatedQuestions: assignment.generatedQuestions || [],
      randomSeed: assignment.randomSeed || Date.now(),
      timeLimitMinutes: assignment.timeLimitMinutes || 0,
      status: assignment.status || "in_progress",
      startedAt: assignment.startedAt || assignment.createdAt || Date.now(),
      createdAt: assignment.createdAt || Date.now(),
      studentUid: assignment.studentUid || "",
      studentCode: assignment.studentCode || "",
      attemptNumber: assignment.attemptNumber || 1,
      focusLossCount: assignment.focusLossCount || 0,
      currentProgress: assignment.currentProgress || {
        currentQuestionIndex: 0,
        selectedAnswers: {},
        timeTaken: 0,
        lastUpdated: Date.now()
      }
    };

    // Only stamp the server clock on creation. Re-stamping on every merge would restart the exam
    // clock, which is exactly what a student reloading the page must not be able to do.
    if (!assignment.serverStartedAt) {
      payload.serverStartedAt = serverTimestamp();
    }

    await setDoc(docRef, payload, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `studentAssignments/${assignment.id}`);
    return false;
  }
}

/**
 * Creates the attempt only if it does not already exist, and returns whatever is authoritative.
 *
 * Transactional because two tabs (or a double-tap on "Start") would otherwise both create, and
 * the later write would reset progress. When the attempt already exists this returns it untouched
 * — including when it is `completed`, which is what lets the caller refuse a second attempt.
 */
export async function startOrResumeAttempt(
  attempt: StudentAssignmentDocument
): Promise<{
  assignment: StudentAssignmentDocument;
  created: boolean;
  alreadyCompleted: boolean;
  failed: boolean;
}> {
  const docRef = doc(db, "studentAssignments", attempt.id);

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);

      if (snap.exists()) {
        const existing = snap.data() as StudentAssignmentDocument;
        return {
          assignment: existing,
          created: false,
          alreadyCompleted: existing.status === "completed",
          failed: false
        };
      }

      const fresh: Record<string, unknown> = {
        ...attempt,
        status: "in_progress",
        optionPermutations: attempt.optionPermutations || {},
        studentUid: attempt.studentUid || "",
        studentCode: attempt.studentCode || "",
        attemptNumber: attempt.attemptNumber || 1,
        focusLossCount: 0,
        startedAt: attempt.startedAt || Date.now(),
        createdAt: attempt.createdAt || Date.now(),
        serverStartedAt: serverTimestamp(),
        currentProgress: attempt.currentProgress || {
          currentQuestionIndex: 0,
          selectedAnswers: {},
          timeTaken: 0,
          lastUpdated: Date.now()
        }
      };

      tx.set(docRef, fresh);
      return {
        assignment: fresh as unknown as StudentAssignmentDocument,
        created: true,
        alreadyCompleted: false,
        failed: false
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `studentAssignments/${attempt.id}`);
    /**
     * FAILS CLOSED. This used to hand back the caller's own candidate object as though the
     * transaction had succeeded, so a student whose write was denied — the exact situation when
     * someone else holds the code claim — proceeded into the quiz on a purely local attempt.
     * They would sit the whole assessment and the submission would then be silently rejected.
     * Better to refuse at the door and say so.
     */
    return { assignment: attempt, created: false, alreadyCompleted: false, failed: true };
  }
}

export async function getStudentAssignmentFromFirestore(id: string): Promise<StudentAssignmentDocument | null> {
  try {
    const docSnap = await getDoc(doc(db, "studentAssignments", id));
    if (docSnap.exists()) {
      return docSnap.data() as StudentAssignmentDocument;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `studentAssignments/${id}`);
  }
  return null;
}

/**
 * @deprecated Superseded by buildAttemptId + getStudentAssignmentFromFirestore.
 *
 * Two problems made this unusable as an attempt guard:
 *  - identity was the typed name string, so a different spelling or casing became a new student;
 *  - it skips `status === "completed"`, so it returns null in exactly the case a caller wants to
 *    detect ("has this student already finished?"), which made the completed-attempt block in
 *    JoinAssessment unreachable.
 *
 * Retained only so any remaining caller keeps compiling. Do not use for new code.
 */
export async function findExistingStudentAssignmentFromFirestore(
  assessmentId: string,
  studentName: string,
  studentClass: string
): Promise<StudentAssignmentDocument | null> {
  try {
    const colRef = collection(db, "studentAssignments");
    const q = query(
      colRef, 
      where("assessmentId", "==", assessmentId),
      where("studentName", "==", studentName.trim())
    );
    const snapshot = await getDocs(q);
    for (const snapDoc of snapshot.docs) {
      const data = snapDoc.data() as StudentAssignmentDocument;
      if (
        data.status !== "completed" && 
        (!studentClass || data.studentClass === studentClass.trim())
      ) {
        return data;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `studentAssignments/find`);
  }
  return null;
}

/**
 * Persists mid-attempt progress.
 *
 * NOTE ON WRITE VOLUME: callers must throttle. This used to be invoked once per second from
 * StudentQuiz (the `timeTaken` tick was in the effect's dependency array), which produced roughly
 * 1,200 writes per 20-minute attempt — the free Spark plan allows 20,000 writes per DAY in total.
 *
 * `currentProgress` is written as a whole nested object, so callers must pass every field they
 * want to keep; a partial object silently drops the others.
 */
export async function updateStudentAssignmentProgressInFirestore(
  assignmentId: string,
  progress: { currentQuestionIndex?: number; selectedAnswers?: Record<number, number>; timeTaken?: number },
  status: "assigned" | "in_progress" | "completed" = "in_progress"
): Promise<boolean> {
  try {
    const docRef = doc(db, "studentAssignments", assignmentId);
    const payload: Record<string, unknown> = {
      status,
      currentProgress: {
        ...progress,
        lastUpdated: Date.now()
      }
    };
    if (status === "completed") {
      payload.submittedAt = Date.now();
    }
    await setDoc(docRef, payload, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `studentAssignments/${assignmentId}/progress`);
    return false;
  }
}

/**
 * Records that the student left the tab. Deterrent/evidence only — it is trivially avoidable and
 * must never be described to a teacher as cheating prevention.
 */
export async function incrementAttemptFocusLoss(assignmentId: string, count: number): Promise<void> {
  try {
    await setDoc(
      doc(db, "studentAssignments", assignmentId),
      { focusLossCount: count },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `studentAssignments/${assignmentId}/focus`);
  }
}

/**
 * Teacher action: allow the student ONE further sitting of this assessment.
 *
 * This GRANTS a retake; it does not reopen the attempt in place.
 *
 * It used to do the latter — flipping the completed attempt back to `in_progress`, bumping its
 * attemptNumber, zeroing `submittedAt` and blanking `currentProgress.selectedAnswers`. That
 * destroyed attempt 1's record the moment the teacher clicked Unlock, and it left the retake
 * writing to attempt 1's document and therefore to attempt 1's submission id, which the rules
 * (correctly) refuse to let a student overwrite. The retake was lost twice over.
 *
 * Now the completed attempt is left exactly as it is — its answers, score, timings and focus-loss
 * count stay on the record forever — and a grant flag is stamped on it. The student's next join
 * creates a NEW attempt document at the next number; the security rules consult this flag on
 * attempt N before permitting the creation of attempt N+1. One grant authorizes exactly one
 * further attempt, so the teacher stays the sole gatekeeper of retakes, exactly as before.
 *
 * Pairs with releaseStudentCodeClaim — a teacher normally wants both, so the student can rejoin
 * from any device.
 */
export async function reopenAttemptInFirestore(assignmentId: string): Promise<boolean> {
  try {
    await setDoc(
      doc(db, "studentAssignments", assignmentId),
      {
        retakeApproved: true,
        retakeApprovedAt: Date.now()
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `studentAssignments/${assignmentId}/reopen`);
    return false;
  }
}

export function subscribeToFirestoreStudentAssignments(callback: (assignments: StudentAssignmentDocument[]) => void): () => void {
  try {
    const colRef = collection(db, "studentAssignments");
    const q = query(colRef, orderBy("createdAt", "desc"));

    return onSnapshot(
      q,
      (snapshot) => {
        const list: StudentAssignmentDocument[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as StudentAssignmentDocument);
        });
        callback(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "studentAssignments");
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, "studentAssignments");
    return () => {};
  }
}

export async function fetchStudentAssignmentsFromFirestore(assessmentId?: string): Promise<StudentAssignmentDocument[]> {
  try {
    const colRef = collection(db, "studentAssignments");
    const q = assessmentId 
      ? query(colRef, where("assessmentId", "==", assessmentId))
      : query(colRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const list: StudentAssignmentDocument[] = [];
    snapshot.forEach(snap => {
      list.push(snap.data() as StudentAssignmentDocument);
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, "studentAssignments");
    return [];
  }
}

// ==========================================
// 6. COLLECTION: submissions
// ==========================================

export async function saveSubmissionToFirestore(result: StudentResult): Promise<boolean> {
  try {
    /**
     * No synthetic fallback id. This used to derive `sa_<quizId>_<name>` when the caller had no
     * attempt reference, which produced a submission pointing at an attempt that does not exist —
     * unlinkable for reports, and rejected outright by the security rules, which require the
     * referenced attempt to exist and be owned by the caller. If there is no attempt, there is
     * nothing legitimate to submit.
     */
    const studentAssignmentId = result.studentAssignmentId || "";
    if (!studentAssignmentId) {
      console.warn("[submissions] Refusing to save a submission with no linked attempt.");
      return false;
    }
    /**
     * Derived from the attempt rather than from Date.now()+random.
     *
     * With a random id, every re-submit minted a NEW document, so one student could accumulate
     * any number of submission rows for a single assessment. Deriving it from the attempt means a
     * repeat submit of the SAME attempt lands on the same document, and security rules can then
     * forbid the update outright — which is where the write-once guarantee actually comes from.
     *
     * This derivation is unchanged, and is now also what gives each ATTEMPT its own submission:
     * the attempt id carries the attempt number (buildAttemptId), so attempt 2 has a different
     * attempt id and therefore a different submission id. One submission per attempt, write-once,
     * with no rule change and no new id scheme:
     *
     *   attempt 1 → sub_quiz-1__c_AAAA
     *   attempt 2 → sub_quiz-1__c_AAAA__a2
     */
    const submissionId = `sub_${studentAssignmentId}`;
    const assessmentId = result.assessmentId || result.quizId;
    const blueprintId = result.blueprintId || result.quizSnapshot?.blueprintId || `bp-${assessmentId}`;
    const teacherId = result.teacherId || result.quizSnapshot?.teacherId || result.teacherName || "teacher-1";
    const teacherName = result.teacherName || result.quizSnapshot?.teacherName || "Science Teacher";

    const totalQ = Number(result.totalQuestions) || 1;
    const scoreVal = Number(result.score) || 0;
    const percentage = Math.round((scoreVal / Math.max(1, totalQ)) * 100);
    const timeTakenSec = Number(result.timeTakenSeconds) || 0;
    const submittedAtTs = Number(result.submittedAt) || Date.now();
    const startedAtTs = result.startedAt || (submittedAtTs - (timeTakenSec * 1000));

    /**
     * The attempt document is deliberately NOT written here.
     *
     * This function used to also mark the attempt "completed" with `selectedAnswers: {}`, racing
     * the caller in StudentQuiz which was writing the real answers to the same field at the same
     * moment. Whichever landed second won, so a submitted attempt could end up with its answers
     * blanked. The submitting component is now the single writer of attempt state.
     */

    // Create Submission document referencing studentAssignmentId, assessmentId, blueprintId, teacherId
    const payload: SubmissionDocument = {
      id: submissionId,
      // References
      studentAssignmentId,
      studentAssignmentReference: studentAssignmentId,
      assessmentId,
      assessmentReference: assessmentId,
      blueprintId,
      blueprintReference: blueprintId,
      teacherId,
      teacherReference: teacherId,
      teacherName,

      // Student metadata
      studentId: result.studentId || "",
      studentUsername: result.studentUsername || "",
      // Taken from the live auth session, never from caller-supplied data, so security rules can
      // require it to equal request.auth.uid.
      studentUid: auth.currentUser?.uid || "",
      studentCode: result.studentCode || "",
      studentName: result.studentName || "Student",
      // Which sitting this is. Mirrored from the attempt so the teacher's table can label
      // "Attempt 2" without reading studentAssignments for every row.
      attemptNumber: Math.max(1, Number(result.attemptNumber) || 1),
      seatNumber: result.seatNumber || "N/A",
      studentClass: result.studentClass || "N/A",
      class: result.studentClass || "N/A",
      studentIdNumber: result.studentIdNumber || "",
      phoneNumber: result.phoneNumber || "",
      phone: result.phoneNumber || "",

      // Assessment metadata
      quizId: assessmentId,
      quizTitle: result.quizTitle || "Assessment",

      // Score & Evaluation
      score: scoreVal,
      totalQuestions: totalQ,
      percentage,
      earnedPoints: scoreVal,
      totalPoints: totalQ,

      // Answers array (referencing questionId, student answer index, and correctness - NO duplicated questions)
      // `studentAnswerIndex` is the position AS SHOWN to the student; `canonicalAnswerIndex` is
      // the same choice in the question's defined order, so the record stays interpretable on its
      // own once option randomization is in play.
      answers: (result.answers || []).map(a => ({
        questionId: a.questionId,
        studentAnswerIndex: a.studentAnswerIndex,
        canonicalAnswerIndex:
          typeof a.canonicalAnswerIndex === "number" ? a.canonicalAnswerIndex : a.studentAnswerIndex,
        isCorrect: a.isCorrect
      })),

      // Timing & Lifecycle
      timeTaken: timeTakenSec,
      timeTakenSeconds: timeTakenSec,
      startedAt: startedAtTs,
      submittedAt: submittedAtTs,
      status: "submitted"
    };

    await setDoc(doc(db, "submissions", submissionId), payload);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, "submissions");
    return false;
  }
}

export function subscribeToFirestoreSubmissions(callback: (results: StudentResult[]) => void): () => void {
  try {
    const submissionsRef = collection(db, "submissions");
    const q = query(submissionsRef, orderBy("submittedAt", "desc"));

    return onSnapshot(
      q,
      (snapshot) => {
        const results: StudentResult[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          results.push({
            id: docSnap.id,
            submissionId: docSnap.id,
            studentId: data.studentId,
            studentUsername: data.studentUsername,
            studentName: data.studentName || "Student",
            /**
             * Mapped since the retake work. It was written by saveSubmissionToFirestore but never
             * read back, so `res.studentCode` was always undefined in the teacher panel — which is
             * why the Unlock control ended up passing a `std-…` document id to
             * releaseStudentCodeClaim, where it failed validation and silently released nothing.
             */
            studentCode: data.studentCode || undefined,
            /** Submissions written before retakes have no attempt number; they are all attempt 1. */
            attemptNumber: Number(data.attemptNumber) || 1,
            seatNumber: data.seatNumber || "N/A",
            studentClass: data.studentClass || data.class,
            studentIdNumber: data.studentIdNumber,
            phoneNumber: data.phoneNumber || data.phone,
            studentAssignmentId: data.studentAssignmentId || data.studentAssignmentReference,
            assessmentId: data.assessmentId || data.assessmentReference,
            blueprintId: data.blueprintId || data.blueprintReference,
            teacherId: data.teacherId || data.teacherReference,
            teacherName: data.teacherName,
            quizId: data.quizId || data.assessmentId,
            quizTitle: data.quizTitle,
            quizSnapshot: data.quizSnapshot,
            score: data.score,
            totalQuestions: data.totalQuestions,
            answers: data.answers || [],
            timeTakenSeconds: data.timeTakenSeconds || data.timeTaken || 0,
            startedAt: data.startedAt,
            submittedAt: data.submittedAt,
            reportDelivery: data.reportDelivery || undefined
          });
        });
        callback(results);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "submissions");
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, "submissions");
    return () => {};
  }
}

export async function fetchAllSubmissionsFromFirestore(): Promise<StudentResult[]> {
  try {
    const submissionsRef = collection(db, "submissions");
    const q = query(submissionsRef, orderBy("submittedAt", "desc"));
    const snapshot = await getDocs(q);
    const results: StudentResult[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      results.push({
        id: docSnap.id,
        submissionId: docSnap.id,
        studentId: data.studentId,
        studentUsername: data.studentUsername,
        studentName: data.studentName || "Student",
        // See the matching notes in subscribeToFirestoreSubmissions — both readers must agree.
        studentCode: data.studentCode || undefined,
        attemptNumber: Number(data.attemptNumber) || 1,
        seatNumber: data.seatNumber || "N/A",
        studentClass: data.studentClass || data.class,
        studentIdNumber: data.studentIdNumber,
        phoneNumber: data.phoneNumber || data.phone,
        studentAssignmentId: data.studentAssignmentId || data.studentAssignmentReference,
        assessmentId: data.assessmentId || data.assessmentReference,
        blueprintId: data.blueprintId || data.blueprintReference,
        teacherId: data.teacherId || data.teacherReference,
        teacherName: data.teacherName,
        quizId: data.quizId || data.assessmentId,
        quizTitle: data.quizTitle,
        quizSnapshot: data.quizSnapshot,
        score: data.score,
        totalQuestions: data.totalQuestions,
        answers: data.answers || [],
        timeTakenSeconds: data.timeTakenSeconds || data.timeTaken || 0,
        startedAt: data.startedAt,
        submittedAt: data.submittedAt,
        reportDelivery: data.reportDelivery || undefined
      });
    });
    return results;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, "submissions");
    return [];
  }
}

export async function deleteSubmissionFromFirestore(submittedAt: number): Promise<boolean> {
  try {
    const colRef = collection(db, "submissions");
    const q = query(colRef, where("submittedAt", "==", submittedAt));
    const snap = await getDocs(q);
    for (const docSnap of snap.docs) {
      await deleteDoc(doc(db, "submissions", docSnap.id));
    }
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `submissions/${submittedAt}`);
    return false;
  }
}

export async function clearSubmissionsFromFirestore(): Promise<boolean> {
  try {
    const snap = await getDocs(collection(db, "submissions"));
    for (const docSnap of snap.docs) {
      await deleteDoc(doc(db, "submissions", docSnap.id));
    }
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, "submissions");
    return false;
  }
}

// ==========================================
// 7. COLLECTION: students
// ==========================================

/**
 * Re-exported so existing importers (AddStudentModal) keep working unchanged. The generation
 * logic itself now lives with the other code logic in codeGenerator.ts, which is also where the
 * alphabet and the code length (STUDENT_CODE_LENGTH) are documented.
 */
export { generateStudentCode, normalizeStudentCode } from "./codeGenerator";

export async function saveStudentToFirestore(student: StudentRecord): Promise<boolean> {
  try {
    const cleanCode = normalizeStudentCode(student.code) || student.code.trim().toUpperCase();
    const docRef = doc(db, "students", student.id);
    await setDoc(docRef, {
      id: student.id,
      name: student.name.trim(),
      code: cleanCode,
      parentPhone: student.parentPhone.trim(),
      grade: student.grade || DEFAULT_GRADE,
      // Optional classification. "" is a real value here — it means "no group" — so it is written
      // explicitly rather than omitted, keeping the merge consistent with every other field.
      group: (student.group || "").trim(),
      createdAt: student.createdAt || Date.now(),
      updatedAt: Date.now(),
      createdBy: student.createdBy || "Teacher"
    }, { merge: true });

    await upsertStudentCodeMirror(student);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `students/${student.id}`);
    return false;
  }
}

/**
 * Mirrors the fields a student needs at join time into studentCodes/{CODE}.
 *
 * WHY: validating an access code used to mean querying — and on the fallback path, downloading —
 * the entire `students` collection from an unauthenticated browser. That exposed every student's
 * name, grade, parent phone number and access code to anyone who opened the site, and it is what
 * prevented `students` from being locked to teachers.
 *
 * Reading studentCodes requires knowing the code, because the code IS the document id: there is no
 * query, so a student can only ever fetch their own row. That is what lets `students` become
 * teacher-only without breaking joining.
 */
export async function upsertStudentCodeMirror(student: StudentRecord): Promise<boolean> {
  const cleanCode = normalizeStudentCode(student.code);
  if (!cleanCode) return false;

  try {
    const ref = doc(db, "studentCodes", cleanCode);
    const existing = await getDoc(ref);

    const payload: Record<string, unknown> = {
      code: cleanCode,
      studentId: student.id,
      name: student.name.trim(),
      grade: student.grade || DEFAULT_GRADE,
      active: true,
      updatedAt: Date.now(),
      // Parent phone numbers are deliberately absent. This document is fetchable by anyone who
      // knows the code, and a 4-character code space is enumerable by a script, so storing a
      // phone number here would re-expose the exact data the teacher-only `students` collection
      // exists to protect. The teacher reads the number from `students`; SendWhatsAppModal
      // already falls back to studentRecord.parentPhone.
      parentPhone: deleteField()
    };

    // Seed the claim fields only when creating. A blind merge would wipe a live claim and hand
    // a completed student's code back to any new device.
    if (!existing.exists()) {
      payload.claimedByUid = "";
      payload.claimedAt = 0;
    }

    await setDoc(ref, payload, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `studentCodes/${cleanCode}`);
    return false;
  }
}

/**
 * Creates any missing studentCodes mirrors for students created before this collection existed.
 * Safe to re-run: every write is a merge. Called by the teacher's student manager, which is the
 * only place with both the full list and the necessary permissions.
 */
export async function backfillStudentCodeMirrors(students: StudentRecord[]): Promise<number> {
  let written = 0;
  for (const student of students) {
    const cleanCode = normalizeStudentCode(student.code);
    if (!cleanCode) continue;
    try {
      const ref = doc(db, "studentCodes", cleanCode);
      const existing = await getDoc(ref);
      const data = existing.exists() ? (existing.data() as Record<string, unknown>) : null;

      // A mirror needs repair when it is missing, has no name, still carries a phone number, or
      // predates the claimedByUid field. That last case is not cosmetic: the security rules
      // compare against claimedByUid, and a document without it could never be claimed, which
      // made claim-once silently inert.
      const needsCreate = !data;
      const needsName = data ? !data.name : false;
      const hasPii = data ? data.parentPhone !== undefined : false;
      const missingClaimField = data ? data.claimedByUid === undefined : false;

      if (!needsCreate && !needsName && !hasPii && !missingClaimField) continue;

      if (needsCreate || needsName) {
        if (await upsertStudentCodeMirror(student)) written++;
        continue;
      }

      const repair: Record<string, unknown> = {};
      if (hasPii) repair.parentPhone = deleteField();
      if (missingClaimField) {
        repair.claimedByUid = "";
        repair.claimedAt = 0;
      }
      await setDoc(ref, repair, { merge: true });
      written++;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `studentCodes/${cleanCode}`);
    }
  }
  return written;
}

/**
 * Join-time student lookup. Reads exactly one document, addressed by the code itself, so a
 * student can only ever retrieve their own row and no listing is possible.
 *
 * There is deliberately no fallback to the `students` collection: that collection is teacher-only,
 * so the fallback could only ever produce a permission error, and swallowing it would report
 * "no student found" for what is really a misconfiguration. A code with no mirror means the
 * teacher's student manager has not been opened since the mirror was introduced.
 *
 * `parentPhone` is always empty here by design — see upsertStudentCodeMirror.
 */
export async function getStudentByCodeForJoin(code: string): Promise<StudentRecord | null> {
  const cleanCode = normalizeStudentCode(code);
  if (!cleanCode) return null;

  try {
    const snap = await getDoc(doc(db, "studentCodes", cleanCode));
    if (!snap.exists()) return null;

    const data = snap.data() as {
      studentId?: string;
      name?: string;
      grade?: string;
      active?: boolean;
    };
    if (data.active === false || !data.name) return null;

    return {
      id: data.studentId || "",
      name: data.name,
      code: cleanCode,
      parentPhone: "",
      grade: data.grade || "",
      createdAt: 0
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `studentCodes/${cleanCode}`);
    return null;
  }
}

export async function deleteStudentFromFirestore(studentId: string): Promise<boolean> {
  try {
    const docRef = doc(db, "students", studentId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `students/${studentId}`);
    return false;
  }
}

export function subscribeToFirestoreStudents(callback: (students: StudentRecord[]) => void): () => void {
  try {
    const colRef = collection(db, "students");
    const q = query(colRef, orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snapshot) => {
        const list: StudentRecord[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as StudentRecord);
        });
        callback(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "students");
        // fallback query without orderBy in case index is building
        getDocs(colRef).then((snap) => {
          const fallbackList: StudentRecord[] = [];
          snap.forEach((d) => fallbackList.push(d.data() as StudentRecord));
          callback(fallbackList);
        }).catch(() => callback([]));
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, "students");
    return () => {};
  }
}

export async function getStudentByCodeFromFirestore(code: string): Promise<StudentRecord | null> {
  try {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return null;
    const colRef = collection(db, "students");
    const q = query(colRef, where("code", "==", cleanCode));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].data() as StudentRecord;
    }
    // Fallback: search client side in case of index issues
    const allSnap = await getDocs(colRef);
    for (const docSnap of allSnap.docs) {
      const data = docSnap.data() as StudentRecord;
      if (data.code && data.code.trim().toUpperCase() === cleanCode) {
        return data;
      }
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `students?code=${code}`);
    return null;
  }
}

// ==========================================
// 7b. COLLECTION: studentCodes  (claim-once identity)
// ==========================================

/**
 * WHY THIS COLLECTION EXISTS
 *
 * One-attempt enforcement needs an identity that survives the student clearing storage, opening
 * an incognito window, or switching device. The Firebase anonymous uid does not: each of those
 * produces a brand new uid, and therefore would produce a brand new attempt.
 *
 * So the teacher-issued student code becomes the anchor. The FIRST uid to join with a code
 * claims it; a different uid presenting the same code afterwards is refused. The document id is
 * the code itself, which is what makes the claim atomic and enforceable in security rules —
 * a query-based check could not be.
 *
 * A student who legitimately changes device is not stuck: the teacher releases the claim
 * (releaseStudentCodeClaim below, surfaced in TeacherPanel).
 */

/**
 * Deliberately a single shape with an optional `reason` rather than a discriminated union:
 * this project compiles without `strict`, so narrowing on a boolean literal discriminant does
 * not work and every consumer would have to cast.
 */
export interface StudentCodeClaimResult {
  ok: boolean;
  firstClaim?: boolean;
  reason?: "invalid-code" | "claimed-by-other" | "inactive" | "error";
}

export interface StudentCodeClaim {
  code: string;
  studentId?: string;
  claimedByUid?: string;
  claimedAt?: number;
  active?: boolean;
}

/**
 * Atomically binds `code` to `uid`, or confirms it is already bound to that same uid.
 *
 * Runs in a transaction so two devices racing on the same code cannot both win.
 *
 * FAILS CLOSED. An earlier version returned `{ ok: true }` from the catch block on the reasoning
 * that a transient Firestore failure should never lock a student out of an exam. The effect was
 * the opposite of intended: once security rules denied the claim write, every caller saw a
 * successful claim, so claim-once silently enforced nothing at all. A claim that cannot be
 * written is a claim that does not exist, and the caller must be told.
 *
 * Does NOT create the document. Mirrors are created by the teacher's student manager
 * (upsertStudentCodeMirror); a code with no mirror is not a code this class issued, and letting a
 * student create one would let them mint an identity for any string they invented.
 */
export async function claimStudentCode(
  code: string,
  uid: string,
  studentId?: string
): Promise<StudentCodeClaimResult> {
  const cleanCode = normalizeStudentCode(code);
  if (!cleanCode) return { ok: false, reason: "invalid-code" };
  if (!uid) return { ok: false, reason: "error" };

  try {
    return await runTransaction(db, async (tx) => {
      const ref = doc(db, "studentCodes", cleanCode);
      const snap = await tx.get(ref);

      if (!snap.exists()) {
        return { ok: false, reason: "invalid-code" } as StudentCodeClaimResult;
      }

      const data = snap.data() as StudentCodeClaim;

      if (data.active === false) {
        return { ok: false, reason: "inactive" } as StudentCodeClaimResult;
      }

      if (data.claimedByUid && data.claimedByUid !== uid) {
        return { ok: false, reason: "claimed-by-other" } as StudentCodeClaimResult;
      }

      // Unclaimed, or already ours (the normal resume path). Only the two claim fields are
      // written — the rules restrict students to exactly these keys, and rewriting `studentId`
      // or `active` here would be rejected as tampering.
      const firstClaim = !data.claimedByUid;
      if (firstClaim) {
        tx.update(ref, { claimedByUid: uid, claimedAt: Date.now() });
      }
      return { ok: true, firstClaim } as StudentCodeClaimResult;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `studentCodes/${cleanCode}`);
    return { ok: false, reason: "error" };
  }
}

export async function getStudentCodeClaim(code: string): Promise<StudentCodeClaim | null> {
  const cleanCode = normalizeStudentCode(code);
  if (!cleanCode) return null;
  try {
    const snap = await getDoc(doc(db, "studentCodes", cleanCode));
    return snap.exists() ? (snap.data() as StudentCodeClaim) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `studentCodes/${cleanCode}`);
    return null;
  }
}

/**
 * Teacher action: unbind a code so it can be claimed by a new device.
 * Used when a student legitimately changes phone/browser, or a session is stuck.
 */
export async function releaseStudentCodeClaim(code: string): Promise<boolean> {
  const cleanCode = normalizeStudentCode(code);
  if (!cleanCode) return false;
  try {
    await setDoc(
      doc(db, "studentCodes", cleanCode),
      { code: cleanCode, claimedByUid: "", claimedAt: 0, active: true, releasedAt: Date.now() },
      { merge: true }
    );
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `studentCodes/${cleanCode}`);
    return false;
  }
}

export async function getStudentsFromFirestore(): Promise<StudentRecord[]> {
  try {
    const colRef = collection(db, "students");
    const snap = await getDocs(colRef);
    const list: StudentRecord[] = [];
    snap.forEach((d) => list.push(d.data() as StudentRecord));
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, "students");
    return [];
  }
}

// ==========================================
// 8. COLLECTION: reportDeliveryLogs
// ==========================================

export async function saveReportDeliveryLogToFirestore(params: {
  submissionId?: string;
  submittedAt?: number;
  quizId: string;
  quizTitle: string;
  studentName: string;
  seatNumber?: string;
  studentIdNumber?: string;
  parentPhone: string;
  teacherNote?: string;
  status?: "sent" | "resent" | "unsent";
}): Promise<ReportDeliveryInfo | null> {
  try {
    const cleanPhone = params.parentPhone.replace(/[^0-9+]/g, "").trim();
    if (!cleanPhone) return null;

    let logDocId = params.submissionId;
    if (!logDocId && params.submittedAt && params.quizId && params.studentName) {
      logDocId = `log_${params.quizId}_${params.studentName.replace(/\s+/g, "_").toLowerCase()}_${params.submittedAt}`;
    }
    if (!logDocId) {
      logDocId = `log_${params.quizId}_${params.studentName.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}`;
    }

    const logRef = doc(db, "reportDeliveryLogs", logDocId);
    const existingSnap = await getDoc(logRef);

    let prevCount = 0;
    let prevStatus: "unsent" | "sent" | "resent" = "unsent";

    if (existingSnap.exists()) {
      const data = existingSnap.data();
      prevCount = Number(data.sendCount) || 0;
      prevStatus = (data.status as "unsent" | "sent" | "resent") || "unsent";
    }

    const newStatus: "sent" | "resent" | "unsent" = params.status 
      ? params.status 
      : (prevCount > 0 || prevStatus !== "unsent" ? "resent" : "sent");

    const newSendCount = newStatus === "unsent" ? 0 : prevCount + 1;
    const now = Date.now();

    const deliveryInfo: ReportDeliveryInfo = {
      status: newStatus,
      lastSentAt: newStatus === "unsent" ? undefined : now,
      sendCount: newSendCount,
      parentPhone: cleanPhone,
      lastTeacherNote: params.teacherNote || ""
    };

    const logPayload: ReportDeliveryLog = {
      id: logDocId,
      submissionId: params.submissionId || "",
      quizId: params.quizId,
      quizTitle: params.quizTitle,
      studentName: params.studentName,
      seatNumber: params.seatNumber || "",
      studentIdNumber: params.studentIdNumber || "",
      parentPhone: cleanPhone,
      status: newStatus,
      sendCount: newSendCount,
      lastSentAt: now,
      teacherNote: params.teacherNote || "",
      createdAt: existingSnap.exists() ? (existingSnap.data().createdAt || now) : now
    };

    await setDoc(logRef, logPayload, { merge: true });

    // Also update corresponding document in "submissions" collection if submissionId or submittedAt is provided
    if (params.submissionId) {
      const subRef = doc(db, "submissions", params.submissionId);
      await setDoc(subRef, { reportDelivery: deliveryInfo, phoneNumber: cleanPhone }, { merge: true });
    }
    if (params.submittedAt) {
      const subCol = collection(db, "submissions");
      const q = query(subCol, where("submittedAt", "==", params.submittedAt));
      const snap = await getDocs(q);
      for (const dSnap of snap.docs) {
        await setDoc(doc(db, "submissions", dSnap.id), { reportDelivery: deliveryInfo, phoneNumber: cleanPhone }, { merge: true });
      }
    }

    return deliveryInfo;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, "reportDeliveryLogs");
    return null;
  }
}

export async function markReportUnsentInFirestore(params: {
  submissionId?: string;
  submittedAt?: number;
  quizId?: string;
  studentName?: string;
}): Promise<boolean> {
  try {
    const unsentInfo: ReportDeliveryInfo = {
      status: "unsent",
      sendCount: 0,
      lastSentAt: undefined,
      parentPhone: ""
    };

    let logDocId = params.submissionId;
    if (!logDocId && params.submittedAt && params.quizId && params.studentName) {
      logDocId = `log_${params.quizId}_${params.studentName.replace(/\s+/g, "_").toLowerCase()}_${params.submittedAt}`;
    }

    if (logDocId) {
      const logRef = doc(db, "reportDeliveryLogs", logDocId);
      await setDoc(logRef, { status: "unsent", sendCount: 0, lastSentAt: null }, { merge: true });
    }

    if (params.submissionId) {
      const subRef = doc(db, "submissions", params.submissionId);
      await setDoc(subRef, { reportDelivery: unsentInfo }, { merge: true });
    }

    if (params.submittedAt) {
      const subCol = collection(db, "submissions");
      const q = query(subCol, where("submittedAt", "==", params.submittedAt));
      const snap = await getDocs(q);
      for (const dSnap of snap.docs) {
        await setDoc(doc(db, "submissions", dSnap.id), { status: "unsent", sendCount: 0, lastSentAt: null }, { merge: true });
        await setDoc(doc(db, "submissions", dSnap.id), { reportDelivery: unsentInfo }, { merge: true });
      }
    }

    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, "reportDeliveryLogs");
    return false;
  }
}

export function subscribeToReportDeliveryLogs(callback: (logs: Record<string, ReportDeliveryLog>) => void): () => void {
  try {
    const logsRef = collection(db, "reportDeliveryLogs");
    return onSnapshot(
      logsRef,
      (snapshot) => {
        const logMap: Record<string, ReportDeliveryLog> = {};
        snapshot.forEach((docSnap) => {
          logMap[docSnap.id] = docSnap.data() as ReportDeliveryLog;
        });
        callback(logMap);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "reportDeliveryLogs");
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, "reportDeliveryLogs");
    return () => {};
  }
}

// ==========================================
// 9. COLLECTION: groups
// ==========================================

/**
 * The teacher's own class-group vocabulary, replacing what used to be a hardcoded array in
 * lib/classification.ts. Students store the group *name*, not this document's id, so nothing here
 * needs to exist for an existing roster to keep working — see resolveGroupOptions.
 *
 * Deliberately NOT auto-seeded. Every other subscribeToFirestore* function re-seeds its defaults on
 * an empty snapshot, which is right for the sample bank but wrong for a list the teacher curates:
 * it would resurrect a group she had just deleted. The empty case is handled in the UI instead, by
 * falling back to FALLBACK_GROUP_OPTIONS.
 *
 * Note this is section 9 here but block 10 in firestore.rules, which numbers orphanedImages as 9.
 */
export async function saveGroupToFirestore(group: StudentGroup): Promise<boolean> {
  try {
    const groupDocRef = doc(db, "groups", group.id);
    await setDoc(groupDocRef, {
      id: group.id,
      name: normalizeGroup(group.name),
      createdAt: Number(group.createdAt) || Date.now(),
      updatedAt: Date.now()
    }, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `groups/${group.id}`);
    return false;
  }
}

/**
 * Removes the group record only. Students keep whatever name they already hold — withLegacyValues
 * keeps them selectable — so this can never orphan a student behind an unreachable filter.
 */
export async function deleteGroupFromFirestore(id: string): Promise<boolean> {
  try {
    const groupDocRef = doc(db, "groups", id);
    await deleteDoc(groupDocRef);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `groups/${id}`);
    return false;
  }
}

export function subscribeToFirestoreGroups(callback: (groups: StudentGroup[]) => void): () => void {
  try {
    const groupsRef = collection(db, "groups");
    const q = query(groupsRef, orderBy("name", "asc"));

    return onSnapshot(
      q,
      (snapshot) => {
        const list: StudentGroup[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const name = normalizeGroup(data.name);
          // A blank name would render as an unselectable option, so skip it rather than offer it.
          if (!name) return;
          list.push({
            id: data.id || docSnap.id,
            name,
            createdAt: Number(data.createdAt) || Date.now(),
            updatedAt: Number(data.updatedAt) || undefined
          });
        });
        callback(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "groups");
        // Fallback query without orderBy in case the index is still building.
        getDocs(groupsRef).then((snap) => {
          const fallbackList: StudentGroup[] = [];
          snap.forEach((d) => {
            const data = d.data();
            const name = normalizeGroup(data.name);
            if (!name) return;
            fallbackList.push({
              id: data.id || d.id,
              name,
              createdAt: Number(data.createdAt) || Date.now(),
              updatedAt: Number(data.updatedAt) || undefined
            });
          });
          callback(fallbackList);
        }).catch(() => callback([]));
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, "groups");
    return () => {};
  }
}

export async function fetchGroupsFromFirestore(): Promise<StudentGroup[]> {
  try {
    const groupsRef = collection(db, "groups");
    const snap = await getDocs(query(groupsRef, orderBy("name", "asc")));
    const list: StudentGroup[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const name = normalizeGroup(data.name);
      if (!name) return;
      list.push({
        id: data.id || docSnap.id,
        name,
        createdAt: Number(data.createdAt) || Date.now(),
        updatedAt: Number(data.updatedAt) || undefined
      });
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, "groups");
    return [];
  }
}

/**
 * Repoints every student holding `oldName` at `newName`, and returns how many were updated.
 *
 * This cascade is the price of storing the group name on the student instead of an id — the trade
 * that keeps every pre-existing student document valid without a migration. Bounded by the roster
 * size, and each write goes through saveStudentToFirestore so the studentCodes mirror stays in
 * step. Returns 0 on failure, like every other read path in this file.
 */
export async function renameGroupAcrossStudents(oldName: string, newName: string): Promise<number> {
  try {
    const from = normalizeGroup(oldName);
    const to = normalizeGroup(newName);
    if (!from || !to || from === to) return 0;

    const students = await getStudentsFromFirestore();
    const affected = students.filter((s) => normalizeGroup(s.group) === from);

    let updated = 0;
    for (const student of affected) {
      const ok = await saveStudentToFirestore({ ...student, group: to });
      if (ok) updated += 1;
    }
    return updated;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, "students");
    return 0;
  }
}

