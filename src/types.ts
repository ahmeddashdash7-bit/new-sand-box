/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Subjects offered by the pickers. Values are persisted verbatim to Firestore — changing an
 * existing value breaks every document already written with it.
 *
 * `Science` and `IntegratedScience` are two DIFFERENT subjects the same teacher teaches, not
 * synonyms. `Science` was added later; nothing about `Integrated Science` changed when it was, and
 * no existing document was rewritten. Anything that maps free text onto this enum (bulk import)
 * must therefore test for "integrated" BEFORE testing for "science", or it will collapse the two.
 */
export enum Subject {
  Physics = "Physics",
  Chemistry = "Chemistry",
  Biology = "Biology",
  IntegratedScience = "Integrated Science",
  Science = "Science"
}

export enum QuestionType {
  MCQ = "MCQ",
  TrueFalse = "TF",
  ShortAnswer = "ShortAnswer"
}

export enum DifficultyLevel {
  Easy = "Easy",
  Medium = "Medium",
  Hard = "Hard"
}

/**
 * Academic years offered by the grade pickers. Values are persisted verbatim to Firestore.
 * Documents written before this list changed keep their old value — readers must tolerate a
 * grade string that is not a member here (see withLegacyValues in lib/classification.ts).
 */
export enum GradeLevel {
  Prep1 = "1 prep",
  Prep2 = "2 prep",
  Prep3 = "3 prep",
  Secondary1 = "1 Sec",
  Secondary2 = "2 Sec",
  Secondary3 = "3 Sec"
}

export type QuestionStatus = "active" | "draft" | "archived";

export type UserRole = "teacher" | "student";

export interface User {
  id: string;
  username: string;
  password?: string;
  fullName: string;
  role: UserRole;
  grade?: string;
  centerGroup?: string;
  specialization?: string;
  schoolName?: string;
  createdAt: number;
}

export interface StudentRecord {
  id: string;
  name: string;
  code: string;
  parentPhone: string;
  grade?: string;
  /**
   * Optional class group, stored as the group's *name* (e.g. "Group A", "Saturday 5pm") rather
   * than an id, so no student document needs rewriting when the group vocabulary changes.
   * Empty/absent means the student has no group. A name that no longer matches any record in the
   * `groups` collection is tolerated, not rewritten — see withLegacyValues in lib/classification.ts.
   */
  group?: string;
  createdAt: number;
  updatedAt?: number;
  createdBy?: string;
}

/**
 * A class group the teacher created, e.g. "Group A" or "Saturday 5pm".
 *
 * `name` is the value written to StudentRecord.group, which is why renaming a group has to cascade
 * to its students (renameGroupAcrossStudents in lib/firebase.ts). Storing the name rather than the
 * id is deliberate: it keeps every student document written before this collection existed valid.
 */
export interface StudentGroup {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
}

export interface DifficultyDistribution {
  easyCount?: number;
  mediumCount?: number;
  hardCount?: number;
  easyPct?: number;
  mediumPct?: number;
  hardPct?: number;
}

export interface QuestionMix {
  mcqCount: number;
  trueFalseCount: number;
  shortAnswerCount: number;
}

export interface HomeworkBlueprint {
  id: string;
  title: string;
  subject: Subject;
  grade: string;
  description?: string;
  lesson: string;
  topics?: string[];
  tags?: string[];
  totalQuestions: number;
  questionMix?: QuestionMix;
  difficultyDistribution: DifficultyDistribution;
  allowedQuestionTypes: QuestionType[];
  timeLimitMinutes: number;
  randomizeQuestionOrder: boolean;
  randomizeAnswerChoices: boolean;
  allowBacktracking?: boolean;
  passingScorePct?: number;
  maxAttempts?: number;
  status?: "active" | "archived";
  teacherName?: string;
  createdAt: number;
}

export interface GeneratedAssignment {
  id: string; // e.g. hw-[blueprintId]-[studentId]
  blueprintId: string;
  blueprintTitle: string;
  studentId: string;
  studentName: string;
  subject: Subject;
  lesson: string;
  timeLimitMinutes: number;
  questions: Question[];
  createdAt: number;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
  /** Directly renderable URL. For Cloudinary this is the `secure_url`. */
  imageUrl?: string;
  /** Provider-scoped identifier. For Cloudinary this is the `public_id`. */
  imagePath?: string;
  /** Which storage backend owns the file. Absent on documents written before providers existed. */
  imageProvider?: "cloudinary" | "inline" | "external";
  imageName?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageUploadedAt?: number;
  subject?: Subject;
  grade?: string;
  lesson?: string;
  topic?: string;
  difficulty?: DifficultyLevel;
  estimatedTimeMinutes?: number;
  tags?: string[];
  status?: QuestionStatus;
  isPriority?: boolean;
  createdBy?: string;
  createdAt?: number;
}

export interface BankQuestion extends Question {
  subject: Subject;
  grade: string;
  lesson: string;
  topic: string;
  difficulty: DifficultyLevel;
  estimatedTimeMinutes: number;
  tags: string[];
  status: QuestionStatus;
  createdBy?: string;
  createdAt: number;
}

export interface AssessmentShareSettings {
  publicLinkEnabled?: boolean;
  joinCode?: string;
  assessmentCode?: string;
  startDate?: string;
  dueDate?: string;
  maxAttempts?: number;
  timeLimitMinutes?: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showAnswersAfterSubmit?: boolean;
  requireStudentName?: boolean;
  requireGradeClass?: boolean;
  requireStudentId?: boolean;
}

export interface AssessmentDocument {
  id: string;
  title: string;
  type?: "quiz" | "homework";
  blueprintId: string;
  subject: Subject;
  grade: string;
  questionIds: string[];
  joinCode?: string;
  assessmentCode?: string;
  visibility?: "draft" | "published" | "scheduled";
  status?: "active" | "archived";
  dueDate?: string;
  startDate?: string;
  teacherId?: string;
  teacherName: string;
  teacherWhatsApp?: string;
  notes?: string;
  shareSettings?: AssessmentShareSettings;
  createdAt: number;
}

/**
 * ONE attempt by one student at one assessment. Not "the" attempt — a retake is a separate
 * document, never a mutation of this one.
 *
 * The document id is deterministic AND carries the attempt number — see buildAttemptId() in
 * lib/firebase.ts — so "attempt N exists at most once" is enforced by the document key itself
 * rather than by a query. That is what makes it expressible in Firestore security rules.
 * Attempt 1 keeps the historical suffix-free id, which is why no existing document needed
 * rewriting when multi-attempt support landed.
 */
export interface StudentAssignmentDocument {
  id: string;
  assessmentId: string;
  assessmentReference?: string;
  blueprintId: string;
  studentName: string;
  studentClass: string;
  class?: string;
  studentIdNumber?: string;
  phoneNumber?: string;
  phone?: string;
  /**
   * The question ids IN THE ORDER THIS ATTEMPT PRESENTS THEM. When question randomization is off
   * this equals the assessment's canonical order; when it is on this is the attempt's own shuffle.
   * The canonical assessment definition is never reordered — randomization lives here, per attempt.
   */
  questionIds: string[];
  /**
   * Per-question option shuffle, keyed by question id: `perm[displayIndex] = canonicalIndex`.
   * e.g. [2,0,3,1] means the option shown first is canonical option #2.
   *
   * An absent or empty map means "canonical order", so every attempt written before randomization
   * worked still reconstructs exactly as it did. assessmentReconstructor.ts consumes this shape
   * verbatim — keep it truthful or reports will show the wrong answers.
   */
  optionPermutations?: Record<string, number[]>;
  generatedQuestions?: Question[];
  /**
   * Seed for this attempt's shuffle. The persisted questionIds/optionPermutations are the
   * authority; the seed exists so the same arrangement can be re-derived deterministically
   * (see lib/attemptPaper.ts) and so the shuffle is testable.
   */
  randomSeed?: number | string;
  timeLimitMinutes: number;
  status: "assigned" | "in_progress" | "completed";
  startedAt?: number;
  createdAt: number;
  /** Firebase anonymous uid that owns this attempt. Used by security rules. */
  studentUid?: string;
  /** Teacher-issued access code this attempt is anchored to, when the student has one. */
  studentCode?: string;
  /** 1-based. Immutable for the life of the document — a retake is a NEW document, not an edit. */
  attemptNumber?: number;
  /**
   * Teacher grant authorizing exactly ONE further attempt after this one.
   *
   * Written only by the teacher's Unlock control. This is what the security rules consult before
   * letting a student create attempt N+1, so "the teacher allowed a retake" is enforced rather
   * than merely intended. Absent on every document written before retakes existed, which is
   * correct: no grant, no retake.
   */
  retakeApproved?: boolean;
  retakeApprovedAt?: number;
  submittedAt?: number;
  /**
   * Server-assigned clock start (Firestore serverTimestamp). Elapsed time is derived from this
   * rather than from a client counter, so closing the tab cannot pause the exam clock.
   * Typed loosely because it is a Firestore Timestamp on read and a sentinel on write.
   */
  serverStartedAt?: unknown;
  /** Count of times the student left the tab. Evidence for the teacher, not an enforcement device. */
  focusLossCount?: number;
  currentProgress?: {
    currentQuestionIndex?: number;
    selectedAnswers?: Record<number, number>;
    timeTaken?: number;
    lastUpdated?: number;
  };
}

export interface ReportDeliveryInfo {
  status: "unsent" | "sent" | "resent";
  lastSentAt?: number;
  sendCount: number;
  parentPhone?: string;
  lastTeacherNote?: string;
}

export interface ReportDeliveryLog {
  id: string;
  submissionId?: string;
  quizId: string;
  quizTitle: string;
  studentName: string;
  seatNumber?: string;
  studentIdNumber?: string;
  parentPhone: string;
  status: "sent" | "resent" | "unsent";
  sendCount: number;
  lastSentAt: number;
  teacherNote?: string;
  createdAt?: number;
}

export interface SubmissionDocument {
  id?: string;
  submissionId?: string;
  studentAssignmentId?: string;
  studentAssignmentReference?: string;
  assessmentId?: string;
  assessmentReference?: string;
  blueprintId?: string;
  blueprintReference?: string;
  teacherId?: string;
  teacherReference?: string;
  teacherName?: string;
  quizId: string;
  quizTitle: string;
  studentId?: string;
  studentUsername?: string;
  /** Firebase anonymous uid that submitted. Written server-side from auth; used by security rules. */
  studentUid?: string;
  /** Access code the attempt was anchored to, when the student had one. */
  studentCode?: string;
  studentName: string;
  /**
   * Which attempt this submission records. Mirrored from the attempt at submit time so the
   * teacher's table can distinguish attempt 1 from a retake without a second read.
   * Absent on submissions written before retakes existed — readers default it to 1.
   */
  attemptNumber?: number;
  studentClass?: string;
  class?: string;
  studentIdNumber?: string;
  phoneNumber?: string;
  phone?: string;
  seatNumber?: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  earnedPoints?: number;
  totalPoints?: number;
  answers: {
    questionId: string;
    /**
     * Index into the options AS THE STUDENT SAW THEM. This has always been the contract —
     * assessmentReconstructor rebuilds the shown order and PrintableReport indexes into it — and
     * it is unchanged now that option shuffling actually happens.
     */
    studentAnswerIndex: number;
    /**
     * The same choice expressed as its index in the question's CANONICAL option order — the
     * stable identity of a choice, since options are plain strings with no id of their own.
     * Written since option randomization shipped so an answer is interpretable without also
     * loading the attempt's permutation. Absent on older submissions, where the two are equal
     * because nothing was ever shuffled.
     */
    canonicalAnswerIndex?: number;
    isCorrect: boolean;
  }[];
  timeTaken?: number;
  timeTakenSeconds: number;
  startedAt?: number;
  submittedAt: number;
  status?: "submitted" | "graded" | "completed";
  reportDelivery?: ReportDeliveryInfo;
}

export interface Quiz {
  id: string;
  title: string;
  type?: "quiz" | "homework";
  blueprintId?: string;
  blueprintTitle?: string;
  subject: Subject;
  grade: string;
  assignTo?: string;
  startDate?: string;
  dueDate?: string;
  visibility?: "draft" | "published" | "scheduled";
  notes?: string;
  teacherId?: string;
  teacherName: string;
  teacherWhatsApp?: string;
  assessmentCode?: string;
  questions: Question[];
  shareSettings?: AssessmentShareSettings;
  status?: "active" | "archived";
  createdAt: number;
}

export interface StudentResult {
  id?: string;
  submissionId?: string;
  studentId?: string;
  studentUsername?: string;
  /** Access code the attempt was anchored to, when the student had one. */
  studentCode?: string;
  studentName: string;
  /** Which attempt this result records. Defaults to 1 for submissions written before retakes. */
  attemptNumber?: number;
  seatNumber: string;
  studentClass?: string;
  studentIdNumber?: string;
  phoneNumber?: string;
  studentAssignmentId?: string;
  assessmentId?: string;
  blueprintId?: string;
  teacherId?: string;
  teacherName?: string;
  quizId: string;
  quizTitle: string;
  quizSnapshot?: Quiz;
  score: number;
  totalQuestions: number;
  answers: {
    questionId: string;
    /**
     * Index into the options AS THE STUDENT SAW THEM. This has always been the contract —
     * assessmentReconstructor rebuilds the shown order and PrintableReport indexes into it — and
     * it is unchanged now that option shuffling actually happens.
     */
    studentAnswerIndex: number;
    /**
     * The same choice expressed as its index in the question's CANONICAL option order — the
     * stable identity of a choice, since options are plain strings with no id of their own.
     * Written since option randomization shipped so an answer is interpretable without also
     * loading the attempt's permutation. Absent on older submissions, where the two are equal
     * because nothing was ever shuffled.
     */
    canonicalAnswerIndex?: number;
    isCorrect: boolean;
  }[];
  timeTakenSeconds: number;
  startedAt?: number;
  submittedAt: number;
  reportDelivery?: ReportDeliveryInfo;
}

export interface TagMeta {
  name: string;
  color?: string;
  questionCount?: number;
}

