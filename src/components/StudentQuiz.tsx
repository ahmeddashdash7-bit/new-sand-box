/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RotateCcw,
  HelpCircle,
  User,
  Hash,
  Clock,
  Award,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Phone,
  Download,
  AlertTriangle,
  Info,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Quiz, Question, StudentResult, Subject, StudentAssignmentDocument } from "../types";
import GhadaLogo from "./GhadaLogo";
import PrintableReport from "./PrintableReport";
import QuestionImage from "./QuestionImage";
import QuestionImageLightbox from "./QuestionImageLightbox";
import { saveSubmission, encodeResultCode } from "../lib/submissionStore";
import { getCurrentUser } from "../lib/authStore";
import {
  updateStudentAssignmentProgressInFirestore,
  getStudentAssignmentFromFirestore,
  incrementAttemptFocusLoss
} from "../lib/firebase";
import { applyAttemptPaper, toCanonicalOptionIndex } from "../lib/attemptPaper";

export interface StudentQuizProps {
  quiz: Quiz;
  studentData?: {
    studentName: string;
    studentClass: string;
    phoneNumber?: string;
    studentIdNumber?: string;
    assignmentId?: string;
    assignment?: StudentAssignmentDocument;
  };
  onBackToTeacher: () => void;
}

type ToastTone = "error" | "success" | "info";

interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  confirmTone?: "default" | "danger";
  secondaryLabel?: string;
  onSecondary?: () => void;
  onConfirm: () => void;
}

const STORAGE_PREFIX = "science_garden_quiz_progress_";

/**
 * How often mid-attempt progress reaches Firestore.
 *
 * This effect used to run on every `timeTaken` tick — one un-awaited setDoc per second, roughly
 * 1,200 writes for a 20-minute attempt. The free Spark plan allows 20,000 writes per DAY across
 * the whole project, so about 17 students sitting one quiz exhausted it. Answers are additionally
 * flushed on navigation, on tab-hide and before submit, so the heartbeat only has to cover an
 * idle student staring at one question.
 */
const PROGRESS_SYNC_INTERVAL_MS = 30_000;
/** Coalesces bursts of answer changes into one write. */
const PROGRESS_DEBOUNCE_MS = 3_000;

// Non-blocking toast notification
function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void; key?: number | string }) {
  const toneStyles: Record<ToastTone, string> = {
    error: "bg-rose-600",
    success: "bg-emerald-600",
    info: "bg-slate-800"
  };
  const Icon = toast.tone === "error" ? AlertTriangle : toast.tone === "success" ? CheckCircle2 : Info;

  return (
    <motion.div
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      className={`${toneStyles[toast.tone]} text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-lg flex items-center gap-2.5 max-w-sm pointer-events-auto`}
      dir="ltr"
      role="status"
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="leading-relaxed">{toast.message}</span>
      <button onClick={onClose} className="ml-1 opacity-80 hover:opacity-100 shrink-0" aria-label="Close notification">
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

// Custom confirmation dialog
function ConfirmDialog({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl p-6 max-w-md w-full space-y-5 shadow-xl border border-slate-100 text-left"
        dir="ltr"
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              state.confirmTone === "danger" ? "bg-rose-100 text-rose-600" : "bg-indigo-100 text-indigo-600"
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">{state.title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">{state.message}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
          >
            Cancel
          </button>
          {state.secondaryLabel && state.onSecondary && (
            <button
              onClick={state.onSecondary}
              className="w-full sm:w-auto px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-bold rounded-xl text-xs transition-colors"
            >
              {state.secondaryLabel}
            </button>
          )}
          <button
            onClick={state.onConfirm}
            className={`w-full sm:w-auto px-5 py-2.5 font-bold rounded-xl text-xs shadow transition-all ${
              state.confirmTone === "danger"
                ? "bg-rose-600 hover:bg-rose-700 text-white"
                : "bg-indigo-600 hover:bg-indigo-700 text-white"
            }`}
          >
            {state.confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function StudentQuiz({ quiz, studentData, onBackToTeacher }: StudentQuizProps) {
  const storageKey = `${STORAGE_PREFIX}${quiz.id}`;
  const submissionKey = `sg_sub_${quiz.id}`;

  const [stage, setStage] = useState<"intro" | "playing" | "results">(
    studentData ? "playing" : "intro"
  );
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [pastResult, setPastResult] = useState<StudentResult | null>(null);

  const currentUser = getCurrentUser();
  const [studentName, setStudentName] = useState(studentData?.studentName || currentUser?.fullName || "");
  const [studentClass, setStudentClass] = useState(studentData?.studentClass || currentUser?.centerGroup || currentUser?.grade || "");
  const [studentPhoneNumber, setStudentPhoneNumber] = useState(studentData?.phoneNumber || "");
  const [studentIdNumber, setStudentIdNumber] = useState(studentData?.studentIdNumber || "");

  const [nameError, setNameError] = useState<string | null>(null);
  const [classError, setClassError] = useState<string | null>(null);
  const [idError, setIdError] = useState<string | null>(null);

  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [timeTaken, setTimeTaken] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [copiedReport, setCopiedReport] = useState(false);

  // Figure lightbox. Kept in its own state slice, entirely separate from selectedAnswers /
  // currentQIdx / timeTaken, so opening or closing it cannot disturb the attempt in progress.
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);
  const openLightbox = useCallback((url: string, alt: string) => setLightbox({ url, alt }), []);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  const resultSavedRef = useRef(false);
  const restoredRef = useRef(false);

  /**
   * THE PAPER: the questions in the order THIS ATTEMPT presents them, with each question's options
   * in this attempt's order and `correctAnswerIndex` re-derived to match.
   *
   * Everything below reads `paper`, never `quiz.questions`. The distinction matters: `quiz` is the
   * canonical assessment, shared by every student and never reordered; `paper` is one student's
   * one sitting. Rendering the canonical questions is exactly why randomization appeared not to
   * work — the attempt's stored order was written but never actually used to display anything.
   *
   * It is resolved in the restore effect below, which is the single point EVERY entry path passes
   * through (fresh join, F5, App.tsx session resume, second device). That is what makes the order
   * stable across a refresh: the paper is rebuilt from the attempt document, not re-rolled.
   *
   * Seeded with the canonical order so the intro/preview screens (which have no attempt) render.
   */
  const [paper, setPaper] = useState<Question[]>(quiz.questions || []);
  /**
   * The attempt's option permutations, kept so a recorded answer can be mapped from the position
   * the student clicked back to the underlying canonical choice.
   */
  const attemptPermutationsRef = useRef<Record<string, number[]>>({});
  const attemptNumberRef = useRef<number>(1);

  /** Resolved attempt document id. Everything that persists progress needs this. */
  const attemptIdRef = useRef<string | undefined>(studentData?.assignmentId || studentData?.assignment?.id);
  /**
   * Wall-clock start of the attempt, in epoch ms.
   *
   * Elapsed time is derived from this rather than accumulated by the interval, so a reload — or
   * closing the tab for ten minutes — cannot rewind or pause the exam clock. The interval now only
   * drives re-render; it is no longer the source of truth for how long the student has taken.
   */
  const startedAtRef = useRef<number>(Date.now());
  const [attemptReady, setAttemptReady] = useState(false);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(
    quiz.shareSettings?.timeLimitMinutes || studentData?.assignment?.timeLimitMinutes || 0
  );

  /** Throttling state for Firestore progress writes. */
  const lastSyncedAtRef = useRef(0);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestProgressRef = useRef<{ currentQuestionIndex: number; selectedAnswers: Record<number, number>; timeTaken: number }>({
    currentQuestionIndex: 0,
    selectedAnswers: {},
    timeTaken: 0
  });
  const focusLossRef = useRef(0);

  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const closeConfirm = () => setConfirmState(null);

  /**
   * Restore the attempt on mount.
   *
   * Firestore is the authority here. This component previously restored purely from
   * localStorage/sessionStorage and never queried Firestore at all, which meant a student on a
   * second device — or one who had cleared storage — silently began a fresh attempt with a clean
   * slate. Web storage is now only a fallback for when the network read fails.
   */
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    let cancelled = false;

    const readLocalSnapshot = () => {
      try {
        const raw = localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };

    const applyIdentity = (saved: { studentName?: string; studentClass?: string; studentIdNumber?: string } | null) => {
      if (!saved) return;
      if (saved.studentName) setStudentName(saved.studentName);
      if (saved.studentClass) setStudentClass(saved.studentClass);
      if (saved.studentIdNumber) setStudentIdNumber(saved.studentIdNumber);
    };

    (async () => {
      const localAssignment = (() => {
        try {
          const stored = localStorage.getItem(`sg_active_assignment_${quiz.id}`);
          return stored ? JSON.parse(stored) : null;
        } catch {
          return null;
        }
      })();

      const attemptId = studentData?.assignmentId || studentData?.assignment?.id || localAssignment?.id;
      attemptIdRef.current = attemptId;

      let assignment: StudentAssignmentDocument | null = studentData?.assignment || null;

      if (attemptId) {
        const remote = await getStudentAssignmentFromFirestore(attemptId);
        if (remote) assignment = remote;
      }
      if (!assignment) assignment = localAssignment;
      if (cancelled) return;

      /**
       * Rebuild this attempt's paper BEFORE anything renders a question.
       *
       * Done here rather than at join time because this is the one code path every entry shares,
       * so a refresh, a resumed session and a second device all reproduce the identical
       * arrangement from the identical attempt document. With no attempt, or a legacy attempt
       * carrying no permutations and the canonical id order, applyAttemptPaper returns the
       * assessment's questions unchanged — which is why nothing written before randomization
       * behaves any differently.
       */
      if (assignment) {
        setPaper(applyAttemptPaper(quiz.questions || [], assignment));
        attemptPermutationsRef.current = assignment.optionPermutations || {};
        attemptNumberRef.current = Number(assignment.attemptNumber) || 1;
      }

      // Already finished — show the past result instead of letting them play again.
      if (assignment?.status === "completed") {
        setAlreadySubmitted(true);
        try {
          const pastSubStr = localStorage.getItem(submissionKey);
          if (pastSubStr) setPastResult(JSON.parse(pastSubStr).lastResult || null);
        } catch {
          /* result will simply not be shown */
        }
        setAttemptReady(true);
        return;
      }

      if (assignment?.timeLimitMinutes) setTimeLimitMinutes(assignment.timeLimitMinutes);

      const rawSnapshot = readLocalSnapshot();
      /**
       * The local cache is keyed by QUIZ id, but a student may now sit one quiz more than once.
       * A snapshot is therefore only usable if it belongs to the attempt being restored — without
       * this check a retake could inherit the first attempt's answers from web storage, which is
       * precisely the "one attempt must never contaminate another" guarantee this work exists to
       * provide. Snapshots written before attempts were stamped carry no attemptId; those are
       * accepted only when there is no attempt to disagree with.
       */
      const localSnapshot =
        rawSnapshot && (!rawSnapshot.attemptId || !attemptId || rawSnapshot.attemptId === attemptId)
          ? rawSnapshot
          : null;
      applyIdentity(localSnapshot);

      const cp = assignment?.currentProgress;
      const localIsNewer =
        localSnapshot && cp?.lastUpdated ? (localSnapshot.savedAt || 0) > cp.lastUpdated : !cp;
      const source = localIsNewer && localSnapshot ? localSnapshot : cp;

      if (source) {
        setCurrentQIdx(source.currentQuestionIndex ?? source.currentQIdx ?? 0);
        setSelectedAnswers(source.selectedAnswers ?? {});
      }

      /**
       * Anchor the clock. `startedAt` is what the attempt document recorded when it was created,
       * so elapsed time survives a reload. Fall back to reconstructing it from the last saved
       * duration only when the attempt has no start stamp at all.
       */
      const savedElapsed = source?.timeTaken ?? 0;
      startedAtRef.current = assignment?.startedAt || Date.now() - savedElapsed * 1000;
      setTimeTaken(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));

      if (assignment || localSnapshot) {
        setStage("playing");
        if (savedElapsed > 0 || (source?.currentQuestionIndex ?? 0) > 0) {
          showToast("Your progress was restored — carry on where you left off 👌", "info");
        }
      }

      setAttemptReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [quiz.id, storageKey, submissionKey, studentData?.assignment, studentData?.assignmentId, showToast]);

  /**
   * Pushes the latest progress to Firestore, at most once per PROGRESS_SYNC_INTERVAL_MS unless
   * `force` is set (navigation, tab hide, submit).
   */
  const flushProgress = useCallback(
    (force = false) => {
      const attemptId = attemptIdRef.current;
      if (!attemptId) return;

      const now = Date.now();
      if (!force && now - lastSyncedAtRef.current < PROGRESS_SYNC_INTERVAL_MS) return;

      lastSyncedAtRef.current = now;
      updateStudentAssignmentProgressInFirestore(attemptId, latestProgressRef.current, "in_progress");
    },
    []
  );

  /**
   * Local snapshot on every change (cheap, synchronous, no quota), Firestore on a throttle.
   *
   * `timeTaken` is deliberately NOT in the dependency array. It ticks once a second, and having it
   * here is what produced one Firestore write per second per student.
   */
  useEffect(() => {
    if (stage !== "playing") return;

    latestProgressRef.current = {
      currentQuestionIndex: currentQIdx,
      selectedAnswers,
      timeTaken
    };

    try {
      const statePayload = JSON.stringify({
        stage,
        // Stamped so a snapshot cannot be replayed into a different attempt at the same quiz.
        attemptId: attemptIdRef.current || "",
        studentName,
        studentClass,
        studentIdNumber,
        currentQIdx,
        selectedAnswers,
        timeTaken,
        savedAt: Date.now()
      });
      localStorage.setItem(storageKey, statePayload);
      sessionStorage.setItem(storageKey, statePayload);
    } catch {
      /* private browsing — Firestore still has the attempt */
    }

    // Coalesce a burst of answer changes into a single write shortly after the student settles.
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => flushProgress(true), PROGRESS_DEBOUNCE_MS);

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, studentName, studentClass, studentIdNumber, currentQIdx, selectedAnswers, storageKey, flushProgress]);

  /** Idle heartbeat: covers a student who sits on one question without touching anything. */
  useEffect(() => {
    if (stage !== "playing") return;
    const id = setInterval(() => flushProgress(false), PROGRESS_SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [stage, flushProgress]);

  /**
   * Flush when the tab is hidden or closed, and count focus losses.
   *
   * The counter is evidence for the teacher, not prevention — it is trivially avoided with a
   * second device, and must never be presented as anti-cheating enforcement.
   */
  useEffect(() => {
    if (stage !== "playing") return;

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushProgress(true);
        focusLossRef.current += 1;
        if (attemptIdRef.current) {
          incrementAttemptFocusLoss(attemptIdRef.current, focusLossRef.current);
        }
      }
    };

    const handlePageHide = () => flushProgress(true);

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [stage, flushProgress]);

  // Save submission when finished
  useEffect(() => {
    if (stage === "results" && !resultSavedRef.current) {
      resultSavedRef.current = true;
      try {
        const user = getCurrentUser();
        const resultData = calculateResultDetails();
        const activeAssignment = studentData?.assignment || (() => {
          try {
            const stored = localStorage.getItem(`sg_active_assignment_${quiz.id}`);
            return stored ? JSON.parse(stored) : null;
          } catch { return null; }
        })();

        const activeAssignmentId =
          attemptIdRef.current ||
          studentData?.assignmentId ||
          activeAssignment?.id ||
          `sa_${quiz.id}_${studentName.trim().replace(/\s+/g, "_")}`;
        const startedAtTimestamp = startedAtRef.current || activeAssignment?.startedAt || activeAssignment?.createdAt || (Date.now() - (timeTaken * 1000));

        const newResult: StudentResult = {
          studentId: user?.id,
          studentUsername: user?.username,
          studentCode: activeAssignment?.studentCode || undefined,
          studentName: studentName.trim() || user?.fullName || "Student",
          // Which sitting this is, taken from the attempt resolved on mount. Carried onto the
          // submission so the teacher's table can tell a retake from a first attempt.
          attemptNumber: attemptNumberRef.current,
          seatNumber: studentIdNumber.trim() || studentClass.trim() || "N/A",
          studentClass: studentClass.trim() || "N/A",
          studentIdNumber: studentIdNumber.trim() || undefined,
          phoneNumber: studentData?.phoneNumber || activeAssignment?.phoneNumber || undefined,
          studentAssignmentId: activeAssignmentId,
          assessmentId: quiz.id,
          blueprintId: quiz.blueprintId || activeAssignment?.blueprintId || `bp-${quiz.id}`,
          teacherId: quiz.teacherId || quiz.teacherName || "teacher-1",
          teacherName: quiz.teacherName || "Science Teacher",
          quizId: quiz.id,
          quizTitle: quiz.title,
          score: resultData.score,
          totalQuestions: paper.length,
          answers: resultData.answers,
          timeTakenSeconds: timeTaken,
          startedAt: startedAtTimestamp,
          submittedAt: Date.now()
        };

        // Stop any pending throttled write from landing after the "completed" write below and
        // flipping the attempt back to in_progress.
        if (syncTimerRef.current) {
          clearTimeout(syncTimerRef.current);
          syncTimerRef.current = null;
        }

        /**
         * The submission write is CHECKED.
         *
         * This return value used to be discarded. When a retake's submission was rejected — which
         * it always was, because it collided with attempt 1's document id and the rules refuse to
         * let a student overwrite a submission — the failure surfaced as nothing at all: the
         * student saw their score, the teacher never received it, and no one had any reason to
         * suspect a problem. The id collision is fixed, but a write can still fail for ordinary
         * reasons (offline, a claim lost to another device), and when it does the student must be
         * told rather than shown a result that only exists in their browser.
         */
        saveSubmission(newResult).then((saved) => {
          if (!saved) {
            showToast(
              "Your answers were graded but could not be sent to your teacher. Please check your connection and tell your teacher.",
              "error"
            );
          }
        });

        /**
         * Sole writer of the attempt's completion.
         *
         * saveSubmissionToFirestore used to write this same field too, with an empty
         * `selectedAnswers`, racing this call — so a submitted attempt could end up with its
         * answers blanked depending on which write landed last.
         */
        if (activeAssignmentId) {
          updateStudentAssignmentProgressInFirestore(
            activeAssignmentId,
            { currentQuestionIndex: currentQIdx, selectedAnswers, timeTaken },
            "completed"
          );
        }

        // Record submission counter in localStorage
        try {
          const pastSubStr = localStorage.getItem(submissionKey);
          let count = 0;
          if (pastSubStr) {
            const p = JSON.parse(pastSubStr);
            count = p.count || 0;
          }
          localStorage.setItem(
            submissionKey,
            JSON.stringify({
              count: count + 1,
              lastSubmittedAt: Date.now(),
              lastResult: newResult
            })
          );
        } catch {
          // Ignore
        }

        // Clean active attempt storage, including the resume pointer App.tsx uses on boot.
        localStorage.removeItem(storageKey);
        sessionStorage.removeItem(storageKey);
        localStorage.removeItem("sg_active_session");
      } catch (err) {
        console.error("Failed to save student submission:", err);
      }
    }
  }, [stage]);

  const handleDownloadPDF = () => {
    try {
      window.print();
    } catch (err) {
      console.error("Print execution error:", err);
      showToast("Unable to open print dialog. Try pressing Ctrl+P to save as PDF.", "error");
    }
  };

  /**
   * Timer.
   *
   * Derived from the anchored start time, not accumulated with `prev + 1`. An accumulating counter
   * stops whenever the tab is closed or the page is reloaded, so a student could pause the exam
   * clock at will and the reported duration was simply wrong after any refresh.
   */
  useEffect(() => {
    if (stage !== "playing") {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const tick = () => {
      setTimeTaken(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
    };

    tick();
    timerRef.current = setInterval(tick, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stage]);

  /**
   * Time-limit auto-submit.
   *
   * `timeLimitMinutes` has always been stored on the assessment and on the attempt, but nothing
   * ever read it during play, so a limit set by the teacher had no effect whatsoever.
   */
  useEffect(() => {
    if (stage !== "playing" || !attemptReady) return;
    if (!timeLimitMinutes || timeLimitMinutes <= 0) return;

    const limitSeconds = timeLimitMinutes * 60;
    if (timeTaken < limitSeconds) return;

    showToast("Time is up — your answers have been submitted automatically.", "info");
    flushProgress(true);
    setStage("results");
  }, [stage, attemptReady, timeLimitMinutes, timeTaken, showToast, flushProgress]);

  const getSubjectTheme = (sub: Subject) => {
    switch (sub) {
      case Subject.Physics:
        return {
          primary: "bg-indigo-600 hover:bg-indigo-700 text-white",
          border: "border-indigo-200",
          text: "text-indigo-900",
          accent: "text-indigo-600",
          badge: "bg-indigo-100 text-indigo-800",
          lightBg: "bg-indigo-50/40",
          borderActive: "border-indigo-500 ring-2 ring-indigo-100"
        };
      case Subject.Chemistry:
        return {
          primary: "bg-purple-600 hover:bg-purple-700 text-white",
          border: "border-purple-200",
          text: "text-purple-900",
          accent: "text-purple-600",
          badge: "bg-purple-100 text-purple-800",
          lightBg: "bg-purple-50/40",
          borderActive: "border-purple-500 ring-2 ring-purple-100"
        };
      case Subject.Biology:
        return {
          primary: "bg-emerald-600 hover:bg-emerald-700 text-white",
          border: "border-emerald-200",
          text: "text-emerald-900",
          accent: "text-emerald-600",
          badge: "bg-emerald-100 text-emerald-800",
          lightBg: "bg-emerald-50/40",
          borderActive: "border-emerald-500 ring-2 ring-emerald-100"
        };
      // Separate colour from Integrated Science — they are separate subjects.
      case Subject.Science:
        return {
          primary: "bg-sky-600 hover:bg-sky-700 text-white",
          border: "border-sky-200",
          text: "text-sky-900",
          accent: "text-sky-600",
          badge: "bg-sky-100 text-sky-800",
          lightBg: "bg-sky-50/40",
          borderActive: "border-sky-500 ring-2 ring-sky-100"
        };
      case Subject.IntegratedScience:
      default:
        return {
          primary: "bg-teal-600 hover:bg-teal-700 text-white",
          border: "border-teal-200",
          text: "text-teal-900",
          accent: "text-teal-600",
          badge: "bg-teal-100 text-teal-800",
          lightBg: "bg-teal-50/40",
          borderActive: "border-teal-500 ring-2 ring-teal-100"
        };
    }
  };

  const theme = getSubjectTheme(quiz.subject);

  const handleStartQuiz = (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;
    if (!studentName.trim()) {
      setNameError("Please enter your full name.");
      hasError = true;
    } else {
      setNameError(null);
    }

    if (!studentClass.trim()) {
      setClassError("Please enter your class or grade.");
      hasError = true;
    } else {
      setClassError(null);
    }

    if (quiz.shareSettings?.requireStudentId && !studentIdNumber.trim()) {
      setIdError("Student ID is required for this assessment.");
      hasError = true;
    } else {
      setIdError(null);
    }

    if (hasError) return;

    setStage("playing");
    setCurrentQIdx(0);
    setSelectedAnswers({});
    setTimeTaken(0);
  };

  const handleSelectOption = (optIdx: number) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [currentQIdx]: optIdx
    }));
  };

  const handleNextQuestion = () => {
    if (currentQIdx < paper.length - 1) {
      setCurrentQIdx(currentQIdx + 1);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQIdx > 0) {
      setCurrentQIdx(currentQIdx - 1);
    }
  };

  const jumpToQuestion = (idx: number) => {
    setCurrentQIdx(idx);
  };

  /**
   * Grades the attempt.
   *
   * Correctness is decided against `paper`, whose `correctAnswerIndex` was re-derived for this
   * attempt's option order, so a shuffled paper grades correctly with no special handling — the
   * comparison is always "the position the student clicked" vs "the position the right answer is
   * in for this student". Question identity is `q.id` throughout; the array position is only ever
   * a display position and is never stored as an identity.
   *
   * Each answer additionally records `canonicalAnswerIndex` — the same choice expressed in the
   * question's defined order — so the underlying choice is recoverable from the submission alone.
   */
  function calculateResultDetails() {
    let score = 0;
    const answersList = paper.map((q, idx) => {
      const studentAnsIdx = selectedAnswers[idx] ?? -1;
      const isCorrect = studentAnsIdx === q.correctAnswerIndex;
      if (isCorrect) score++;
      return {
        questionId: q.id,
        studentAnswerIndex: studentAnsIdx,
        canonicalAnswerIndex: toCanonicalOptionIndex(
          { optionPermutations: attemptPermutationsRef.current },
          q.id,
          studentAnsIdx
        ),
        isCorrect
      };
    });

    return {
      score,
      percentage: Math.round((score / Math.max(1, paper.length)) * 100),
      answers: answersList
    };
  }

  const { score, percentage, answers } = useMemo(
    () => calculateResultDetails(),
    [selectedAnswers, paper]
  );

  const unansweredIndices = useMemo(
    () => paper.map((_, idx) => idx).filter(idx => selectedAnswers[idx] === undefined),
    [selectedAnswers, paper]
  );

  const generateTextReport = () => {
    try {
      const timeFormatted = formatTime(timeTaken);
      let detailsText = "";
      paper.forEach((q, idx) => {
        const studentAnsIdx = selectedAnswers[idx];
        const isCorrect = studentAnsIdx === q.correctAnswerIndex;
        const statusIcon = isCorrect ? "✅ Correct" : "❌ Incorrect";
        const studentChoice = studentAnsIdx !== undefined ? q.options[studentAnsIdx] : "Unanswered";
        const correctChoice = q.options[q.correctAnswerIndex];

        detailsText += `Q${idx + 1}: ${q.text}\n- Student Answer: ${studentChoice} [${statusIcon}]\n${
          !isCorrect ? `- Correct Answer: ${correctChoice}\n` : ""
        }\n`;
      });

      const currentResObj: StudentResult = {
        studentName: studentName.trim() || "Student",
        seatNumber: studentIdNumber.trim() || studentClass.trim() || "N/A",
        studentClass: studentClass.trim() || "N/A",
        studentIdNumber: studentIdNumber.trim() || undefined,
        phoneNumber: studentPhoneNumber.trim() || undefined,
        quizId: quiz.id,
        quizTitle: quiz.title,
        quizSnapshot: quiz,
        score,
        totalQuestions: paper.length,
        answers,
        timeTakenSeconds: timeTaken,
        submittedAt: Date.now()
      };
      const resultCode = encodeResultCode(currentResObj);

      return `📝 Quiz Results Report - Edulink
---------------------------
👤 Student Name: ${studentName || "N/A"}
🏫 Class / Grade: ${studentClass || "N/A"}
🆔 Student ID: ${studentIdNumber || "N/A"}
📚 Quiz Title: ${quiz.title}
🧪 Subject: ${quiz.subject} - ${quiz.grade}
👨‍🏫 Instructor: ${quiz.teacherName}
🎯 Score: ${score} / ${paper.length} (${percentage}%)
⏱️ Time Elapsed: ${timeFormatted}
---------------------------
🔑 Teacher Import Result Code:
RESULT_CODE:${resultCode}

Detailed Breakdown:
${detailsText}Submitted via Edulink 🧪✨`;
    } catch (e) {
      console.error("Report generation error:", e);
      return `Student: ${studentName || "Student"} - Score: ${score}/${paper.length}`;
    }
  };

  const handleCopyReport = async () => {
    try {
      const report = generateTextReport();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = report;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2500);
    } catch (err) {
      console.error("Copy report error:", err);
      showToast("Unable to copy report automatically.", "error");
    }
  };

  const handleSendWhatsApp = () => {
    try {
      const reportText = generateTextReport();
      const defaultPhone = "201000205897";
      const rawPhone = quiz.teacherWhatsApp || defaultPhone;
      const cleanPhone = rawPhone.replace(/[^0-9]/g, "") || defaultPhone;

      const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(reportText)}`;

      const win = window.open(whatsappUrl, "_blank");
      if (!win) {
        window.location.href = whatsappUrl;
      }
    } catch (err) {
      console.error("WhatsApp open error:", err);
      showToast("Could not open WhatsApp automatically. You can copy the report and send it manually.", "error");
    }
  };

  const finalizeSubmit = () => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore
    }
    setStage("results");
    closeConfirm();
  };

  const handleRequestSubmit = () => {
    if (unansweredIndices.length > 0) {
      setConfirmState({
        title: "Unanswered Questions Remaining",
        message: `You have left ${unansweredIndices.length} question(s) unanswered (Questions ${unansweredIndices
          .map(i => i + 1)
          .join(", ")}). You can jump back to complete them or submit as is.`,
        confirmLabel: "Submit As Is",
        confirmTone: "danger",
        secondaryLabel: "Go to Unanswered",
        onSecondary: () => {
          setCurrentQIdx(unansweredIndices[0]);
          closeConfirm();
        },
        onConfirm: finalizeSubmit
      });
    } else {
      setConfirmState({
        title: "Confirm Quiz Submission",
        message: "Are you sure you want to finish the quiz and submit your answers?",
        confirmLabel: "Yes, Submit Quiz",
        onConfirm: finalizeSubmit
      });
    }
  };

  /**
   * Retake is a PREVIEW/practice affordance only.
   *
   * It used to be offered to real students and simply reset `resultSavedRef`, which let anyone
   * submit the same assessment an unlimited number of times straight from the results screen —
   * this was the single largest hole in attempt integrity. A real attempt is now reopened only by
   * the teacher, server-side; see reopenAttemptInFirestore.
   */
  const isPreviewAttempt = !attemptIdRef.current;

  const handleRetake = () => {
    if (!isPreviewAttempt) return;
    setConfirmState({
      title: "Restart Preview",
      message: "Restart this preview? Answers will be reset. Nothing is recorded in preview mode.",
      confirmLabel: "Yes, Restart",
      onConfirm: () => {
        setStage("playing");
        setCurrentQIdx(0);
        setSelectedAnswers({});
        startedAtRef.current = Date.now();
        setTimeTaken(0);
        resultSavedRef.current = false;
        closeConfirm();
      }
    });
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  const currentQuestion = paper[currentQIdx];

  // Keyboard navigation
  useEffect(() => {
    if (stage !== "playing") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (confirmState) return;

      const num = parseInt(e.key, 10);
      const optionsCount = paper[currentQIdx]?.options.length ?? 0;
      if (!Number.isNaN(num) && num >= 1 && num <= optionsCount) {
        handleSelectOption(num - 1);
        return;
      }

      if (e.key === "ArrowRight" || e.key === "Enter") {
        if (currentQIdx < paper.length - 1) {
          setCurrentQIdx(prev => prev + 1);
        } else {
          handleRequestSubmit();
        }
      } else if (e.key === "ArrowLeft") {
        if (currentQIdx > 0) setCurrentQIdx(prev => prev - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // `paper` is listed explicitly: the handler reads it for the option count and the last-question
    // check, and it changes once the attempt resolves. It arrived indirectly via unansweredIndices,
    // which is too subtle to rely on.
  }, [stage, currentQIdx, confirmState, unansweredIndices, paper]);

  return (
    <div className="w-full max-w-3xl mx-auto" id="student-quiz-view">
      {/* Toast Notifications */}
      <div className="fixed top-4 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
        <AnimatePresence>
          {toast && <Toast key={toast.id} toast={toast} onClose={() => setToast(null)} />}
        </AnimatePresence>
      </div>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {confirmState && <ConfirmDialog state={confirmState} onClose={closeConfirm} />}
      </AnimatePresence>

      {alreadySubmitted && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 md:p-10 rounded-3xl border border-slate-200 shadow-xl space-y-6 text-center max-w-xl mx-auto"
          dir="ltr"
        >
          <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-2xl mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900">You have already submitted this assessment.</h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Your responses have been recorded by your teacher. Multiple attempts are disabled for this link.
            </p>
          </div>

          {pastResult && (
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 text-left space-y-2.5 max-w-md mx-auto">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Assessment Title:</span>
                <span className="text-slate-900">{pastResult.quizTitle}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Student Name:</span>
                <span className="text-slate-900">{pastResult.studentName}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Score:</span>
                <span className="text-emerald-600 font-black">{pastResult.score} / {pastResult.totalQuestions} ({Math.round((pastResult.score / pastResult.totalQuestions) * 100)}%)</span>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span>Submitted At:</span>
                <span>{new Date(pastResult.submittedAt).toLocaleString("en-US")}</span>
              </div>
            </div>
          )}

          {onBackToTeacher && (
            <button
              onClick={onBackToTeacher}
              className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Back to Teacher Dashboard
            </button>
          )}
        </motion.div>
      )}

      {!alreadySubmitted && stage === "intro" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-6 md:p-10 rounded-3xl border border-slate-100 shadow-xl space-y-8 text-left relative overflow-hidden"
          dir="ltr"
          id="student-intro-card"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/5 rounded-full blur-2xl"></div>
          <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl"></div>

          {/* Assessment Header Card */}
          <div className="bg-slate-50/80 p-6 rounded-2xl border border-slate-200/70 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600 block">
                  {quiz.subject} • {quiz.grade}
                </span>
                <h2 className="text-2xl font-black text-slate-900">{quiz.title}</h2>
              </div>
              <GhadaLogo size="sm" showText={false} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block font-medium">Topic / Lesson</span>
                <span className="font-bold text-slate-800">{quiz.blueprintTitle || paper[0]?.lesson || "General Assessment"}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Teacher</span>
                <span className="font-bold text-slate-800">{quiz.teacherName || "Mrs. Ghada"}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Estimated Time</span>
                <span className="font-bold text-slate-800">{paper.length * 2} minutes</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Questions</span>
                <span className="font-bold text-slate-800">{paper.length} Questions</span>
              </div>
            </div>
          </div>

          {/* Student Registration Form */}
          <form onSubmit={handleStartQuiz} className="space-y-6" id="form-student-registration" noValidate>
            <div className="space-y-1 border-b border-slate-100 pb-2">
              <h3 className="text-sm font-extrabold text-slate-900">Student Information</h3>
              <p className="text-xs text-slate-400">Please enter your details below to start the assessment.</p>
            </div>

            <div className="space-y-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Full Name <span className="text-rose-500">*</span></span>
                </label>
                <input
                  id="input-student-name"
                  type="text"
                  value={studentName}
                  onChange={e => {
                    setStudentName(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  placeholder="e.g. Sarah Connor"
                  className={`w-full px-4 py-3 bg-slate-50 border rounded-xl focus:bg-white focus:ring-2 outline-none text-xs font-bold ${
                    nameError ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 focus:ring-indigo-100"
                  }`}
                />
                {nameError && (
                  <p className="text-[11px] text-rose-600 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    {nameError}
                  </p>
                )}
              </div>

              {/* Class / Grade */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Class / Grade <span className="text-rose-500">*</span></span>
                </label>
                <input
                  id="input-student-class"
                  type="text"
                  value={studentClass}
                  onChange={e => {
                    setStudentClass(e.target.value);
                    if (classError) setClassError(null);
                  }}
                  placeholder="e.g. Grade 10 - Section A"
                  className={`w-full px-4 py-3 bg-slate-50 border rounded-xl focus:bg-white focus:ring-2 outline-none text-xs font-bold ${
                    classError ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 focus:ring-indigo-100"
                  }`}
                />
                {classError && (
                  <p className="text-[11px] text-rose-600 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    {classError}
                  </p>
                )}
              </div>

              {/* Student ID (Optional) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Student ID <span className="text-slate-400 font-normal">(Optional)</span></span>
                </label>
                <input
                  id="input-student-id"
                  type="text"
                  value={studentIdNumber}
                  onChange={e => {
                    setStudentIdNumber(e.target.value);
                    if (idError) setIdError(null);
                  }}
                  placeholder="e.g. 2026-1042"
                  className={`w-full px-4 py-3 bg-slate-50 border rounded-xl focus:bg-white focus:ring-2 outline-none text-xs font-bold ${
                    idError ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 focus:ring-indigo-100"
                  }`}
                />
                {idError && (
                  <p className="text-[11px] text-rose-600 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    {idError}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row gap-4 items-center justify-between border-t border-slate-100">
              {onBackToTeacher && (
                <button
                  id="btn-back-to-teacher-view-intro"
                  type="button"
                  onClick={onBackToTeacher}
                  className="text-xs text-slate-500 hover:text-slate-800 font-bold transition-colors flex items-center gap-1 order-2 sm:order-1 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
              )}

              <button
                id="btn-start-student-quiz-action"
                type="submit"
                className={`px-8 py-3.5 font-bold rounded-2xl shadow-lg transition-all w-full sm:w-auto text-sm flex items-center justify-center gap-2 order-1 sm:order-2 focus-visible:outline-none cursor-pointer ${theme.primary}`}
              >
                Start Quiz 🚀
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/*
        Waiting for the attempt to resolve.

        Nothing may render a question before the restore effect has rebuilt this attempt's paper.
        `paper` is seeded with the canonical order so the teacher's preview works, but a real
        student must never see that seed — they would be shown, and could answer, the unshuffled
        question 1 for the moment before their own arrangement arrives.
      */}
      {stage === "playing" && !attemptReady && (
        <div
          className="bg-white p-10 rounded-3xl border border-slate-100 shadow-xl flex flex-col items-center justify-center gap-3"
          id="student-quiz-preparing"
        >
          <span className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-emerald-500 animate-spin" />
          <span className="text-xs font-bold text-slate-500">Preparing your assessment…</span>
        </div>
      )}

      {stage === "playing" && attemptReady && currentQuestion && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xl space-y-6 text-left"
          dir="ltr"
          id="student-quiz-active-panel"
        >
          {/* Progress Header */}
          <div className="flex items-center justify-between border-b border-slate-50 pb-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500">
                Question {currentQIdx + 1} of {paper.length}
              </span>
              <div className="w-24 md:w-40 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${theme.primary.split(" ")[0]} transition-all duration-300`}
                  style={{ width: `${((currentQIdx + 1) / paper.length) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold bg-slate-50 px-3 py-1.5 rounded-full">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{formatTime(timeTaken)}</span>
            </div>
          </div>

          {/* Question Palette Navigation */}
          <div className="space-y-2" id="question-palette-wrapper">
            <div
              className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1"
              role="tablist"
              aria-label="Question Navigation"
            >
              {paper.map((q, idx) => {
                const isAnswered = selectedAnswers[idx] !== undefined;
                const isCurrent = idx === currentQIdx;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => jumpToQuestion(idx)}
                    aria-current={isCurrent}
                    aria-label={`Question ${idx + 1}${isAnswered ? " - Answered" : " - Unanswered"}`}
                    className={`shrink-0 w-8 h-8 rounded-xl text-[11px] font-bold flex items-center justify-center border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                      isCurrent
                        ? theme.borderActive + " bg-white text-slate-800"
                        : isAnswered
                        ? "bg-slate-800 border-slate-800 text-white"
                        : "border-slate-200 text-slate-400 bg-white hover:border-slate-300"
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
            {unansweredIndices.length > 0 && (
              <p className="text-[11px] text-amber-600 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {unansweredIndices.length} question(s) left unanswered
              </p>
            )}
          </div>

          {/* Question Display Card */}
          <div className="space-y-5 py-2">
            <h3 className="text-base md:text-lg font-bold text-slate-800 leading-relaxed font-sans">{currentQuestion.text}</h3>

            <QuestionImage
              question={currentQuestion}
              onEnlarge={openLightbox}
              maxHeightClass="max-h-72"
            />


            {/* Answer Options */}
            <div
              className="space-y-3"
              id={`options-player-grid-${currentQIdx}`}
              role="radiogroup"
              aria-label="Answer Options"
            >
              {currentQuestion.options.map((option, optIdx) => {
                const isSelected = selectedAnswers[currentQIdx] === optIdx;
                return (
                  <button
                    key={optIdx}
                    id={`btn-student-option-${currentQIdx}-${optIdx}`}
                    onClick={() => handleSelectOption(optIdx)}
                    role="radio"
                    aria-checked={isSelected}
                    className={`w-full p-4 rounded-2xl border text-left font-sans font-semibold text-xs md:text-sm flex items-center justify-between transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                      isSelected
                        ? theme.borderActive + " bg-slate-50"
                        : "border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center border font-bold text-[11px] transition-all shrink-0 ${
                          isSelected ? "bg-slate-800 border-slate-800 text-white" : "border-slate-300 text-slate-400 bg-white"
                        }`}
                      >
                        {String.fromCharCode(65 + optIdx)}
                      </span>
                      <span className="text-slate-700">{option}</span>
                    </div>
                    {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-slate-800 shrink-0"></div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-50" id="student-quiz-navigation">
            <button
              id="btn-student-prev-question"
              onClick={handlePrevQuestion}
              disabled={currentQIdx === 0}
              className={`px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl text-xs transition-all flex items-center gap-1 ${
                currentQIdx === 0 ? "opacity-40 cursor-not-allowed" : "hover:bg-slate-50"
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            {currentQIdx < paper.length - 1 ? (
              <button
                id="btn-student-next-question"
                onClick={handleNextQuestion}
                className={`px-5 py-2.5 font-bold rounded-xl text-xs transition-all flex items-center gap-1 ${theme.primary}`}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                id="btn-student-submit-quiz"
                onClick={handleRequestSubmit}
                className="px-6 py-3 font-bold rounded-xl text-xs transition-all flex items-center gap-2 shadow-lg bg-rose-600 hover:bg-rose-700 text-white"
              >
                Submit Answers 🏁
              </button>
            )}
          </div>
        </motion.div>
      )}

      {stage === "results" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-5 max-w-2xl mx-auto text-left"
          dir="ltr"
          id="student-results-panel"
        >
          {/* Dynamic Header */}
          <div className="text-center space-y-1 pt-2">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
              {percentage >= 95
                ? "Excellent!"
                : percentage >= 80
                ? "Very Good!"
                : percentage >= 60
                ? "Good Work!"
                : percentage >= 40
                ? "Quiz Completed"
                : percentage >= 20
                ? "Needs Improvement"
                : "Quiz Completed"}
            </h2>
            <p className="text-xs md:text-sm font-medium text-slate-500">
              You answered {score} of {paper.length} questions correctly.
            </p>
          </div>

          {/* Result Summary Card */}
          <div
            className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col items-center text-center space-y-4"
            id="student-score-summary-card"
          >
            {/* Score Ring */}
            <div className="relative w-32 h-32 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="64" cy="64" r="52" className="stroke-slate-100" strokeWidth="10" fill="transparent" />
                <circle
                  cx="64"
                  cy="64"
                  r="52"
                  className={`${
                    percentage >= 60 ? "stroke-emerald-500" : percentage >= 40 ? "stroke-amber-500" : "stroke-rose-500"
                  } transition-all duration-700`}
                  strokeWidth="10"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 52}
                  strokeDashoffset={2 * Math.PI * 52 * (1 - percentage / 100)}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-2xl md:text-3xl font-black text-slate-900">{percentage}%</span>
                <span className="text-[10px] text-slate-400 font-bold">
                  {score} / {paper.length}
                </span>
              </div>
            </div>

            {/* Student & Quiz Details */}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-600 font-medium pt-3 border-t border-slate-100 w-full">
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-800">{studentName}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                <span>{quiz.title}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{formatTime(timeTaken)}</span>
              </span>
            </div>
          </div>

          {/* Statistics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col items-center text-center space-y-0.5">
              <span className="text-xs font-bold text-emerald-600">✓ Correct Answers</span>
              <span className="text-lg font-black text-slate-900">{score}</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col items-center text-center space-y-0.5">
              <span className="text-xs font-bold text-rose-600">✗ Incorrect Answers</span>
              <span className="text-lg font-black text-slate-900">{paper.length - score}</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col items-center text-center space-y-0.5">
              <span className="text-xs font-bold text-slate-500">⏱ Time Taken</span>
              <span className="text-lg font-black text-slate-900">{formatTime(timeTaken)}</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col items-center text-center space-y-0.5">
              <span className="text-xs font-bold text-indigo-600">🏆 Final Score</span>
              <span className="text-lg font-black text-slate-900">{percentage}%</span>
            </div>
          </div>

          {/* Save Report Card */}
          <div
            className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs text-center space-y-3"
            id="results-save-report-card"
          >
            <div className="space-y-0.5">
              <h3 className="text-base font-bold text-slate-900">Save Report</h3>
              <p className="text-xs text-slate-500">Download a PDF copy of your results.</p>
            </div>

            <button
              id="btn-student-download-pdf"
              onClick={handleDownloadPDF}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-xs transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Save as PDF</span>
            </button>
          </div>

          {/* Answer Review */}
          <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4" id="results-review-answers-section">
            <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">Answer Review</h3>

            <div className="space-y-3">
              {paper.map((q, idx) => {
                const studentAnsIdx = selectedAnswers[idx];
                const isCorrect = studentAnsIdx === q.correctAnswerIndex;
                const studentChoice = studentAnsIdx !== undefined ? q.options[studentAnsIdx] : "Unanswered";
                const correctChoice = q.options[q.correctAnswerIndex];

                return (
                  <div
                    key={q.id || idx}
                    className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold text-slate-800 flex items-start gap-2">
                        <span className="text-slate-400 font-bold shrink-0">{idx + 1}.</span>
                        <span>{q.text}</span>
                      </div>

                      {isCorrect ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md shrink-0">
                          Correct
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded-md shrink-0">
                          Incorrect
                        </span>
                      )}
                    </div>

                    <QuestionImage
                      question={q}
                      onEnlarge={openLightbox}
                      maxHeightClass="max-h-40"
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 font-medium text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Your Answer:</span>
                        <span className={isCorrect ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold"}>
                          {studentChoice}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px]">Correct Answer:</span>
                        <span className="text-slate-700 font-semibold">{correctChoice}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom actions */}
          <div className="flex items-center justify-between gap-3 pt-2 pb-8" id="results-bottom-actions">
            {isPreviewAttempt ? (
              <button
                id="btn-results-retake-quiz"
                onClick={handleRetake}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restart Preview
              </button>
            ) : (
              <span className="text-[11px] text-slate-400 font-semibold">
                Submitted — ask your teacher if you need to sit this again.
              </span>
            )}

            {onBackToTeacher && (
              <button
                id="btn-results-back-home"
                onClick={onBackToTeacher}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
              >
                Back to Dashboard
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* Figure lightbox: zoom, pan, Esc / backdrop / button to close. */}
      <AnimatePresence>
        {lightbox && (
          <QuestionImageLightbox
            url={lightbox.url}
            alt={lightbox.alt}
            onClose={closeLightbox}
          />
        )}
      </AnimatePresence>

      {/* Printable Report Template */}
      <PrintableReport
        result={{
          studentName: studentName.trim() || "Student",
          seatNumber: studentIdNumber.trim() || studentClass.trim() || "N/A",
          studentClass: studentClass.trim() || "N/A",
          studentIdNumber: studentIdNumber.trim() || undefined,
          quizId: quiz.id,
          quizTitle: quiz.title,
          quizSnapshot: quiz,
          score,
          totalQuestions: paper.length,
          answers,
          timeTakenSeconds: timeTaken,
          submittedAt: Date.now()
        }}
        quiz={quiz}
      />
    </div>
  );
}
