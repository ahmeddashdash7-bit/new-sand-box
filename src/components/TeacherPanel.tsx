/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { 
  Plus, 
  Trash2,
  Unlock,
  Share2, 
  Copy, 
  Check, 
  ExternalLink, 
  BookOpen, 
  HelpCircle, 
  Save, 
  FileText, 
  Phone, 
  MessageCircle,
  Sparkles, 
  User, 
  GraduationCap, 
  QrCode, 
  ChevronDown, 
  ArrowRight,
  RefreshCw,
  Printer,
  Search,
  Users,
  Award,
  Clock,
  Download,
  KeyRound,
  FilePlus,
  Cloud,
  CheckCircle,
  AlertTriangle,
  Info,
  X,
  Eye,
  Filter,
  BarChart2,
  Home,
  Layers,
  CheckCircle2,
  XCircle,
  Database,
  Sliders,
  Star,
  RotateCcw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Quiz, Question, QuestionType, StudentResult, Subject, BankQuestion, DifficultyLevel, HomeworkBlueprint, GradeLevel, StudentAssignmentDocument, AssessmentShareSettings, StudentRecord, StudentGroup, ReportDeliveryInfo, ReportDeliveryLog } from "../types";
import { SAMPLE_QUIZZES } from "../data/templates";
import { encodeQuiz } from "../lib/encoder";
import GhadaLogo from "./GhadaLogo";
import PrintableReport from "./PrintableReport";
import SendWhatsAppModal from "./SendWhatsAppModal";
import { reconstructAssessmentFromSubmission } from "../lib/assessmentReconstructor";
import { getCurrentUser } from "../lib/authStore";
import { importSubmissionCode } from "../lib/submissionStore";
import { 
  subscribeToFirestoreSubmissions, 
  subscribeToFirestoreQuestions, 
  subscribeToFirestoreBlueprints,
  saveAssessmentToFirestore,
  buildAssessmentShareUrl,
  deleteAssessmentFromFirestore,
  subscribeToFirestoreAssessments,
  backfillAssessmentCodeMirrors,
  subscribeToFirestoreStudentAssignments,
  subscribeToFirestoreStudents,
  subscribeToFirestoreGroups,
  saveBankQuestionToFirestore,
  pickQuestionImageFields,
  deleteQuestionFromFirestore,
  saveBlueprintToFirestore,
  deleteBlueprintFromFirestore,
  deleteSubmissionFromFirestore,
  clearSubmissionsFromFirestore,
  subscribeToReportDeliveryLogs,
  markReportUnsentInFirestore,
  reopenAttemptInFirestore,
  releaseStudentCodeClaim
} from "../lib/firebase";
import {
  ALL_FILTER,
  NO_GROUP_FILTER,
  NO_GROUP_LABEL,
  matchesGroupFilter,
  resolveGroupOptions,
  resolveResultGroup
} from "../lib/classification";
import QuestionBankView from "./QuestionBankView";
import QuestionBankPickerModal from "./QuestionBankPickerModal";
import BlueprintListView from "./BlueprintListView";
import AnalyticsDashboardView from "./AnalyticsDashboardView";
import StudentAssignmentsView from "./StudentAssignmentsView";
import QuestionEditorCard from "./QuestionEditorCard";
import QuizHomeworkAssignmentModal from "./QuizHomeworkAssignmentModal";
import ShareAssessmentModal from "./ShareAssessmentModal";

interface TeacherPanelProps {
  onPreviewQuiz: (quiz: Quiz) => void;
  onSelectQuiz: (quiz: Quiz) => void;
}

type ToastTone = "success" | "error" | "info";

interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmTone?: "default" | "danger";
  onConfirm: () => void;
}

// -----------------------------------------------------------------------
// Teacher Toast Notification
// -----------------------------------------------------------------------
function TeacherToast({ toast, onClose }: { toast: ToastState; onClose: () => void; key?: React.Key }) {
  const toneStyles: Record<ToastTone, string> = {
    error: "bg-rose-600 text-white",
    success: "bg-emerald-600 text-white",
    info: "bg-slate-900 text-white"
  };
  const Icon = toast.tone === "error" ? AlertTriangle : toast.tone === "success" ? CheckCircle2 : Info;

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className={`${toneStyles[toast.tone]} text-xs font-bold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 max-w-md pointer-events-auto border border-white/10`}
      dir="ltr"
      role="status"
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="leading-relaxed flex-1 text-left">{toast.message}</span>
      <button onClick={onClose} className="opacity-80 hover:opacity-100 p-0.5 shrink-0" aria-label="Close">
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

// -----------------------------------------------------------------------
// Custom Interactive Confirmation Modal
// -----------------------------------------------------------------------
function ConfirmModal({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  if (!state.isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="ltr">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl border border-slate-100 text-left"
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              state.confirmTone === "danger"
                ? "bg-rose-100 text-rose-600"
                : "bg-indigo-100 text-indigo-600"
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1 pt-0.5">
            <h3 className="text-sm font-bold text-slate-800">{state.title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">{state.message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              state.onConfirm();
              onClose();
            }}
            className={`px-5 py-2.5 font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer ${
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

export default function TeacherPanel({ onPreviewQuiz, onSelectQuiz }: TeacherPanelProps) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  /** Ensures the assessmentCodes join-mirror backfill runs at most once per mount. */
  const assessmentMirrorsBackfilledRef = useRef(false);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [shareableUrl, setShareableUrl] = useState("");
  const [shareableCode, setShareableCode] = useState("");

  // Navigation & Filtering
  const [activeTab, setActiveTab] = useState<"bank" | "blueprints" | "quizzes" | "assignments" | "submissions" | "analytics">("bank");
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all");
  const [searchQuizQuery, setSearchQuizQuery] = useState("");

  // Question Bank
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([]);
  const [showBankPickerModal, setShowBankPickerModal] = useState(false);

  // Homework Blueprints & Assignments
  const [blueprints, setBlueprints] = useState<HomeworkBlueprint[]>([]);
  const [studentAssignments, setStudentAssignments] = useState<StudentAssignmentDocument[]>([]);
  const [assignModal, setAssignModal] = useState<{
    isOpen: boolean;
    type: "quiz" | "homework";
    blueprint: HomeworkBlueprint | null;
  }>({
    isOpen: false,
    type: "quiz",
    blueprint: null
  });

  const [shareModalQuiz, setShareModalQuiz] = useState<Quiz | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const handleOpenShareModal = (quiz: Quiz) => {
    setShareModalQuiz(quiz);
    setShowShareModal(true);
  };

  const handleUpdateQuizShareSettings = async (quizId: string, settings: AssessmentShareSettings) => {
    const quizToUpdate = quizzes.find(q => q.id === quizId);
    if (quizToUpdate) {
      const updatedQuiz = { ...quizToUpdate, shareSettings: settings };
      const joinCode = await saveAssessmentToFirestore(updatedQuiz);
      if (!joinCode) {
        showToast("Could not save the share settings. Please try again.", "error");
        return;
      }
      // Keep the open share dialog showing the code that was actually stored.
      setShareModalQuiz(prev =>
        prev && prev.id === quizId
          ? { ...prev, assessmentCode: joinCode, shareSettings: { ...settings, joinCode, assessmentCode: joinCode } }
          : prev
      );
    }
    showToast("Share settings updated & saved to Firestore! ✨", "success");
  };

  const handleOpenAssignModal = (type: "quiz" | "homework", bp: HomeworkBlueprint | null = null) => {
    setAssignModal({
      isOpen: true,
      type,
      blueprint: bp
    });
  };

  const handleAssignQuizSaved = async (newQuiz: Quiz) => {
    const joinCode = await saveAssessmentToFirestore(newQuiz);

    if (!joinCode) {
      showToast("Could not save the assessment to Firestore. Please try again.", "error");
      return;
    }

    showToast(`${newQuiz.type === "quiz" ? "Quiz" : "Homework"} "${newQuiz.title}" published & saved to Firestore! 🚀`, "success");
    setActiveTab("quizzes");

    // Share the code that was actually stored, not the one generated client-side.
    handleOpenShareModal({
      ...newQuiz,
      assessmentCode: joinCode,
      shareSettings: { ...(newQuiz.shareSettings || {}), joinCode, assessmentCode: joinCode }
    });
  };

  // Student Submissions & Reports
  const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
  const [studentsList, setStudentsList] = useState<StudentRecord[]>([]);
  const [groupsList, setGroupsList] = useState<StudentGroup[]>([]);
  const [deliveryLogsMap, setDeliveryLogsMap] = useState<Record<string, ReportDeliveryLog>>({});
  const [selectedResultForPrint, setSelectedResultForPrint] = useState<{ result: StudentResult; quiz: Quiz } | null>(null);
  const [selectedResultForWhatsApp, setSelectedResultForWhatsApp] = useState<{ result: StudentResult; studentRecord?: StudentRecord | null } | null>(null);
  const [resultSearchTerm, setResultSearchTerm] = useState("");
  const [filterQuizTitle, setFilterQuizTitle] = useState("all");
  const [filterDeliveryStatus, setFilterDeliveryStatus] = useState<"all" | "sent" | "unsent">("all");
  /** Group filter for the submissions table. Composes with the quiz/search/delivery filters. */
  const [filterResultGroup, setFilterResultGroup] = useState<string>(ALL_FILTER);

  // Manual Import
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCodeInput, setImportCodeInput] = useState("");

  // Toasts & Confirmation Modals
  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmState>({
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "",
    onConfirm: () => {}
  });

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const closeConfirmModal = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  };

  // Return to Home
  const handleReturnHome = useCallback(() => {
    if (editingQuiz) {
      setConfirmModal({
        isOpen: true,
        title: "Return to Main Dashboard",
        message: "Are you sure you want to return to the main list? Unsaved changes will be lost.",
        confirmLabel: "Yes, Return to Home",
        confirmTone: "danger",
        onConfirm: () => {
          setEditingQuiz(null);
          setShareableUrl("");
          setShareableCode("");
          setShowQR(false);
          setActiveTab("quizzes");
          showToast("Returned to Main Dashboard ✨", "info");
        }
      });
    } else {
      setActiveTab("quizzes");
      showToast("You are on the Main Dashboard 🏠", "info");
    }
  }, [editingQuiz, showToast]);

  // Listen for global back-to-home events
  useEffect(() => {
    const handleGlobalBackHome = () => {
      setEditingQuiz(null);
      setShareableUrl("");
      setShareableCode("");
      setShowQR(false);
      setActiveTab("quizzes");
    };

    window.addEventListener("science_garden_back_to_home", handleGlobalBackHome);
    return () => {
      window.removeEventListener("science_garden_back_to_home", handleGlobalBackHome);
    };
  }, []);

  // Manual refresh
  const handleManualRefresh = () => {
    showToast("Firestore collections synchronized 🔄", "success");
  };

  // Import submission code
  const handleImportCodeSubmit = async () => {
    if (!importCodeInput.trim()) {
      showToast("Please enter a submission code first.", "error");
      return;
    }

    let cleanCode = importCodeInput.trim();
    if (cleanCode.includes("RESULT_CODE:")) {
      const match = cleanCode.match(/RESULT_CODE:([A-Za-z0-9%+/=]+)/);
      if (match && match[1]) {
        cleanCode = match[1];
      }
    }

    const res = await importSubmissionCode(cleanCode);
    if (res.success) {
      setImportCodeInput("");
      setShowImportModal(false);
      showToast(res.message, "success");
    } else {
      showToast(res.message, "error");
    }
  };

  // 1. Submissions Real-time Sync from Firestore
  useEffect(() => {
    const unsubscribeFirestore = subscribeToFirestoreSubmissions((firestoreResults) => {
      setStudentResults(firestoreResults || []);
    });
    return () => unsubscribeFirestore();
  }, []);

  // 2. Question Bank Real-time Sync from Firestore
  useEffect(() => {
    const unsubscribeBank = subscribeToFirestoreQuestions((remoteQuestions) => {
      setBankQuestions(remoteQuestions || []);
    });
    return () => unsubscribeBank();
  }, []);

  // 3. Blueprints Real-time Sync from Firestore
  useEffect(() => {
    const unsubscribeBp = subscribeToFirestoreBlueprints((remoteBlueprints) => {
      setBlueprints(remoteBlueprints || []);
    });
    return () => unsubscribeBp();
  }, []);

  // 4. Assessments Real-time Sync from Firestore
  useEffect(() => {
    const unsubscribeAssessments = subscribeToFirestoreAssessments((remoteAssessments) => {
      setQuizzes(remoteAssessments && remoteAssessments.length > 0 ? remoteAssessments : SAMPLE_QUIZZES);

      /**
       * Backfill assessmentCodes/{CODE} join mirrors for assessments published before that
       * collection existed. This screen is the only place holding both the full assessment list
       * and the permission to write the mirrors. Additive and idempotent — it never touches the
       * assessment documents and skips anything already mirrored correctly.
       */
      if (!assessmentMirrorsBackfilledRef.current && remoteAssessments?.length) {
        assessmentMirrorsBackfilledRef.current = true;
        backfillAssessmentCodeMirrors(remoteAssessments).catch(() => {
          /* non-fatal: the teacher's own code lookup still resolves via `assessments` */
        });
      }
    });
    return () => unsubscribeAssessments();
  }, []);

  // 5. Student Assignments Real-time Sync from Firestore
  useEffect(() => {
    const unsubscribeAssignments = subscribeToFirestoreStudentAssignments((remoteAssignments) => {
      setStudentAssignments(remoteAssignments || []);
    });
    return () => unsubscribeAssignments();
  }, []);

  // 6. Registered Students Real-time Sync from Firestore
  useEffect(() => {
    const unsubscribeStudents = subscribeToFirestoreStudents((remoteStudents) => {
      setStudentsList(remoteStudents || []);
    });
    return () => unsubscribeStudents();
  }, []);

  // 6b. Class Groups Real-time Sync from Firestore. Subscribed once here and passed down, the way
  // studentsList is — the group pickers in the sub-views must all offer the same vocabulary.
  useEffect(() => {
    const unsubscribeGroups = subscribeToFirestoreGroups((remoteGroups) => {
      setGroupsList(remoteGroups || []);
    });
    return () => unsubscribeGroups();
  }, []);

  // 7. Report Delivery Logs Real-time Sync from Firestore
  useEffect(() => {
    const unsubscribeDeliveryLogs = subscribeToReportDeliveryLogs((logsMap) => {
      setDeliveryLogsMap(logsMap || {});
    });
    return () => unsubscribeDeliveryLogs();
  }, []);

  // Helper to resolve delivery status for any student result
  const getResultDeliveryInfo = useCallback((res: StudentResult): ReportDeliveryInfo => {
    // 1. Direct object check
    if (res.reportDelivery && (res.reportDelivery.status === "sent" || res.reportDelivery.status === "resent")) {
      return res.reportDelivery;
    }

    // 2. Lookup by ID / submissionId in deliveryLogsMap
    const docId = res.id || res.submissionId;
    if (docId && deliveryLogsMap[docId]) {
      const log = deliveryLogsMap[docId];
      if (log.status !== "unsent") {
        return {
          status: log.status,
          lastSentAt: log.lastSentAt,
          sendCount: log.sendCount || 1,
          parentPhone: log.parentPhone,
          lastTeacherNote: log.teacherNote
        };
      }
    }

    // 3. Lookup by composite key
    if (res.quizId && res.studentName && res.submittedAt) {
      const key = `log_${res.quizId}_${res.studentName.replace(/\s+/g, "_").toLowerCase()}_${res.submittedAt}`;
      if (deliveryLogsMap[key]) {
        const log = deliveryLogsMap[key];
        if (log.status !== "unsent") {
          return {
            status: log.status,
            lastSentAt: log.lastSentAt,
            sendCount: log.sendCount || 1,
            parentPhone: log.parentPhone,
            lastTeacherNote: log.teacherNote
          };
        }
      }
    }

    /**
     * 4. Last-resort match by quizId + studentName, for logs written before submissionId was
     *    recorded on them.
     *
     * SCOPED TO SUBMISSIONS THAT CARRY NO ID, deliberately. A student may now hold several
     * submissions for one quiz (a first attempt and a retake), and this branch cannot tell them
     * apart — so applied broadly it would mark attempt 1's row "Sent" the moment the teacher sent
     * attempt 2's report, and vice versa. Any submission with an id has already been given its
     * exact answer by steps 2 and 3; falling through to a fuzzy match would only ever be wrong.
     */
    if (!res.id && !res.submissionId) {
      for (const log of Object.values(deliveryLogsMap) as ReportDeliveryLog[]) {
        if (log.quizId === res.quizId && log.studentName?.toLowerCase() === res.studentName?.toLowerCase() && log.status !== "unsent") {
          return {
            status: log.status,
            lastSentAt: log.lastSentAt,
            sendCount: log.sendCount || 1,
            parentPhone: log.parentPhone,
            lastTeacherNote: log.teacherNote
          };
        }
      }
    }

    return {
      status: "unsent",
      sendCount: 0
    };
  }, [deliveryLogsMap]);

  const handleMarkUnsentDirect = async (res: StudentResult) => {
    if (!confirm(`Mark WhatsApp delivery status for "${res.studentName}" as Unsent?`)) return;

    await markReportUnsentInFirestore({
      submissionId: res.id || res.submissionId,
      submittedAt: res.submittedAt,
      quizId: res.quizId,
      studentName: res.studentName
    });

    showToast(`Delivery status for "${res.studentName}" marked as Unsent ⚪`, "info");
  };

  /**
   * Grants a student one further sitting of an assessment.
   *
   * This is the escape hatch for one-attempt enforcement, and it is the ONLY way a retake happens
   * — the student cannot grant themselves one, in the UI or by talking to Firestore directly.
   *
   * The grant is stamped on the finished attempt; the student's next join creates a brand new
   * attempt document. The submission being unlocked from here is never touched, so attempt 1's
   * score and answers stay on the record beside the retake rather than being replaced by it.
   *
   * Because an attempt is anchored to the student's access code, a student who legitimately
   * changes phone or browser would otherwise be locked out — so releasing the code claim is part
   * of the same action, not a separate step the teacher has to discover.
   */
  const handleReopenAttempt = async (res: StudentResult) => {
    const attemptId = res.studentAssignmentId;
    if (!attemptId) {
      showToast("This submission has no linked attempt record to reopen.", "error");
      return;
    }

    const attemptLabel = Math.max(1, Number(res.attemptNumber) || 1);

    if (
      !confirm(
        `Allow "${res.studentName}" to sit "${res.quizTitle}" again?\n\n` +
          `Attempt ${attemptLabel} stays on record with its own score. They will be able to start ` +
          `a new, separately recorded attempt, including from a different device.`
      )
    ) {
      return;
    }

    const reopened = await reopenAttemptInFirestore(attemptId);

    /**
     * Free the code so a new device can claim it.
     *
     * Only the real access code is usable here. This used to fall back to `res.seatNumber`, which
     * holds the student's DOCUMENT id (`std-…`) — a string releaseStudentCodeClaim rejects as a
     * malformed code, so it returned false and released nothing, and the student was refused from
     * any device but the original one. `studentCode` is now mapped on read, so the fallback is
     * both unnecessary and harmful.
     */
    const code = res.studentCode;
    const released = code ? await releaseStudentCodeClaim(code) : false;

    if (!reopened) {
      showToast("Could not grant the retake. Please try again.", "error");
      return;
    }

    showToast(
      released
        ? `"${res.studentName}" can now retake this assessment from any device 🔓`
        : `"${res.studentName}" can now retake this assessment. Their access code could not be released, so they must use the same device 🔓`,
      released ? "success" : "info"
    );
  };

  const handleSaveBlueprint = async (bp: HomeworkBlueprint) => {
    await saveBlueprintToFirestore(bp);
    showToast("Blueprint saved to Firestore! 💾", "success");
  };

  const handleDeleteBlueprint = async (id: string) => {
    await deleteBlueprintFromFirestore(id);
    showToast("Blueprint deleted from Firestore.", "info");
  };

  const handleSaveBankQuestion = async (q: BankQuestion) => {
    await saveBankQuestionToFirestore(q);
    showToast("Question saved to Firestore Bank! 💾", "success");
  };

  const handleDeleteBankQuestion = async (id: string) => {
    await deleteQuestionFromFirestore(id);
    showToast("Question removed from Firestore Bank.", "info");
  };

  const handleSaveQuestionToBankFromQuiz = (q: Question) => {
    if (!editingQuiz) return;
    if (!q.text.trim()) {
      showToast("Please enter question text before saving to bank.", "error");
      return;
    }
    const bankQ: BankQuestion = {
      id: "bq-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      subject: q.subject || editingQuiz.subject || Subject.IntegratedScience,
      grade: editingQuiz.grade || GradeLevel.Secondary1,
      lesson: q.lesson || editingQuiz.title || "General Lesson",
      topic: q.lesson || editingQuiz.title || "General Topic",
      difficulty: q.difficulty || DifficultyLevel.Medium,
      type: q.type,
      text: q.text,
      options: [...q.options],
      correctAnswerIndex: q.correctAnswerIndex,
      explanation: q.explanation || "",
      // Keep the attached figure when promoting a quiz question back into the bank.
      ...pickQuestionImageFields(q),
      estimatedTimeMinutes: 2,
      tags: [(q.subject || editingQuiz.subject || "science").toLowerCase(), "quiz-export"],
      status: "active",
      createdBy: editingQuiz.teacherName || "Science Teacher",
      createdAt: Date.now()
    };
    handleSaveBankQuestion(bankQ);
    showToast("Question saved to Question Bank successfully! 💾", "success");
  };

  const handleImportBankQuestionsToQuiz = (imported: Question[]) => {
    if (!editingQuiz) return;
    setEditingQuiz({
      ...editingQuiz,
      questions: [...editingQuiz.questions, ...imported]
    });
    showToast(`Inserted ${imported.length} questions into the quiz! 🎉`, "success");
  };

  // Print student report
  const handlePrintStudentReport = async (res: StudentResult) => {
    try {
      showToast("Reconstructing assessment for A4 report...", "info");
      const reconstructedQuiz = await reconstructAssessmentFromSubmission(res, bankQuestions);
      setSelectedResultForPrint({ result: res, quiz: reconstructedQuiz });
      setTimeout(() => {
        window.print();
      }, 250);
    } catch (err) {
      console.error("Failed to prepare A4 report:", err);
      showToast("Could not generate report.", "error");
    }
  };

  /**
   * Export CSV — exports EXACTLY what the table is showing.
   *
   * This used to dump every submission regardless of the active filters, so a teacher who had
   * narrowed to one quiz got a spreadsheet of everything. Sharing `filteredResults` with the table
   * is also what makes the group filter carry into the export for free.
   */
  const handleExportCSV = () => {
    if (filteredResults.length === 0) {
      showToast(
        studentResults.length === 0
          ? "No submission records to export."
          : "No submissions match the current filters.",
        "error"
      );
      return;
    }

    const headers = ["Student Name", "Group", "Attempt", "Seat / Group Number", "Quiz Title", "Score", "Total Questions", "Percentage", "Time Taken (s)", "Submitted Date"];
    const rows = filteredResults.map(r => [
      `"${(r.studentName || "Student").replace(/"/g, '""')}"`,
      `"${(resolveResultGroup(studentsList, r) || NO_GROUP_LABEL).replace(/"/g, '""')}"`,
      Math.max(1, Number(r.attemptNumber) || 1),
      `"${(r.seatNumber || "N/A").replace(/"/g, '""')}"`,
      `"${(r.quizTitle || "").replace(/"/g, '""')}"`,
      r.score,
      r.totalQuestions,
      `"${Math.round((r.score / Math.max(1, r.totalQuestions)) * 100)}%"`,
      r.timeTakenSeconds || 0,
      `"${new Date(r.submittedAt || Date.now()).toLocaleString('en-US')}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Student_Results_Edulink_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Excel / CSV file exported successfully 📊", "success");
  };

  // Delete result
  const handleDeleteResult = (submittedAt: number) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Result Record",
      message: "Are you sure you want to delete this result record from Firestore? This action cannot be undone.",
      confirmLabel: "Yes, Delete Record",
      confirmTone: "danger",
      onConfirm: async () => {
        await deleteSubmissionFromFirestore(submittedAt);
        showToast("Result record deleted from Firestore.", "success");
      }
    });
  };

  // Clear all results
  const handleClearAllResults = () => {
    setConfirmModal({
      isOpen: true,
      title: "Clear All Records",
      message: "🗑️ Are you sure you want to clear all student submission records permanently from Firestore?",
      confirmLabel: "Yes, Clear All Records",
      confirmTone: "danger",
      onConfirm: async () => {
        await clearSubmissionsFromFirestore();
        showToast("All submission records cleared from Firestore ✨", "success");
      }
    });
  };

  // Create new quiz
  const handleCreateNewQuiz = () => {
    const user = getCurrentUser();
    const newQuiz: Quiz = {
      id: "quiz-" + Date.now(),
      title: "",
      subject: Subject.IntegratedScience,
      grade: "Grade 7",
      teacherName: user?.fullName || "Science Teacher",
      teacherWhatsApp: "201000205897",
      questions: [
        {
          id: "q-" + Date.now() + "-1",
          type: QuestionType.MCQ,
          text: "",
          options: ["", "", "", ""],
          correctAnswerIndex: 0,
          explanation: ""
        }
      ],
      createdAt: Date.now()
    };
    setEditingQuiz(newQuiz);
    setShareableUrl("");
    setShareableCode("");
    setShowQR(false);
  };

  // Load template
  const handleLoadTemplate = (template: Quiz) => {
    const cloned: Quiz = {
      ...template,
      id: "quiz-" + Date.now(),
      title: template.title + " (Copy)",
      createdAt: Date.now()
    };
    setEditingQuiz(cloned);
    setShareableUrl("");
    setShareableCode("");
    setShowQR(false);
    showToast("Template loaded for editing ✨", "info");
  };

  // Delete quiz
  const handleDeleteQuiz = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: "Delete Quiz",
      message: "Are you sure you want to permanently delete this quiz from Firestore?",
      confirmLabel: "Yes, Delete Quiz",
      confirmTone: "danger",
      onConfirm: async () => {
        await deleteAssessmentFromFirestore(id);
        if (editingQuiz?.id === id) {
          setEditingQuiz(null);
          setShareableUrl("");
          setShareableCode("");
        }
        showToast("Quiz deleted from Firestore.", "success");
      }
    });
  };

  // Update quiz metadata
  const handleUpdateQuizMeta = (field: keyof Quiz, value: any) => {
    if (!editingQuiz) return;
    setEditingQuiz({
      ...editingQuiz,
      [field]: value
    });
  };

  // Update question
  const handleUpdateQuestion = (qIndex: number, updatedQ: Question) => {
    if (!editingQuiz) return;
    const updatedQuestions = [...editingQuiz.questions];
    updatedQuestions[qIndex] = updatedQ;
    setEditingQuiz({
      ...editingQuiz,
      questions: updatedQuestions
    });
  };

  // Add question
  const handleAddQuestion = (type: QuestionType) => {
    if (!editingQuiz) return;
    const newQ: Question = {
      id: "q-" + Date.now() + "-" + (editingQuiz.questions.length + 1),
      type,
      text: "",
      options: type === QuestionType.TrueFalse ? ["True", "False"] : ["", "", "", ""],
      correctAnswerIndex: 0,
      explanation: ""
    };
    setEditingQuiz({
      ...editingQuiz,
      questions: [...editingQuiz.questions, newQ]
    });
  };

  // Delete question
  const handleDeleteQuestion = (qIndex: number) => {
    if (!editingQuiz) return;
    if (editingQuiz.questions.length <= 1) {
      showToast("Quiz must contain at least one question.", "error");
      return;
    }
    const qText = editingQuiz.questions[qIndex]?.text?.trim();
    const promptPreview = qText ? `"${qText.slice(0, 60)}${qText.length > 60 ? "..." : ""}"` : `Question #${qIndex + 1}`;

    setConfirmModal({
      isOpen: true,
      title: "Remove Question from Quiz",
      message: `Are you sure you want to remove ${promptPreview} from this quiz?`,
      confirmLabel: "Yes, Remove Question",
      confirmTone: "danger",
      onConfirm: () => {
        if (!editingQuiz) return;
        const updatedQuestions = editingQuiz.questions.filter((_, idx) => idx !== qIndex);
        setEditingQuiz({
          ...editingQuiz,
          questions: updatedQuestions
        });
        showToast(`Question #${qIndex + 1} removed from quiz 🗑️`, "info");
      }
    });
  };

  // Save & Publish Assessment
  const handleSaveAndShare = async () => {
    if (!editingQuiz) return;

    if (!editingQuiz.title.trim()) {
      showToast("Please enter a title for the assessment.", "error");
      return;
    }
    if (!editingQuiz.teacherName.trim()) {
      showToast("Please enter the teacher's name.", "error");
      return;
    }
    if (!editingQuiz.teacherWhatsApp.trim()) {
      showToast("Please enter a WhatsApp phone number for receiving results.", "error");
      return;
    }

    const cleanPhone = editingQuiz.teacherWhatsApp.replace(/[^0-9]/g, "");
    if (cleanPhone.length < 8) {
      showToast("Please enter a valid WhatsApp phone number.", "error");
      return;
    }

    for (let i = 0; i < editingQuiz.questions.length; i++) {
      const q = editingQuiz.questions[i];
      if (!q.text.trim()) {
        showToast(`Question #${i + 1} prompt is empty. Please enter text.`, "error");
        return;
      }
      if (q.type === QuestionType.MCQ) {
        for (let j = 0; j < q.options.length; j++) {
          if (!q.options[j].trim()) {
            showToast(`Option #${j + 1} in Question #${i + 1} is empty.`, "error");
            return;
          }
        }
      }
    }

    const quizToPublish: Quiz = {
      ...editingQuiz,
      teacherWhatsApp: cleanPhone,
      status: "active",
      visibility: "published",
      createdAt: editingQuiz.createdAt || Date.now()
    };

    // Persist first, then take the canonical join code back from the write.
    // The code is never invented here: previously this built an "SG-123456" code, which the
    // canonical validator rejects (hyphens are not allowed), so Firestore silently stored a
    // different generated code while the teacher was shown — and handed out — the SG- one.
    const joinCode = await saveAssessmentToFirestore(quizToPublish);

    if (!joinCode) {
      showToast("Could not save the assessment to Firestore. Please check your connection and try again.", "error");
      return;
    }

    // Mirror the stored code back into local state so the editor, the share panel and the
    // student join URL can never drift apart.
    const publishedQuiz: Quiz = {
      ...quizToPublish,
      assessmentCode: joinCode,
      shareSettings: {
        ...(quizToPublish.shareSettings || {}),
        joinCode,
        assessmentCode: joinCode
      }
    };

    setEditingQuiz(publishedQuiz);
    setShareableUrl(buildAssessmentShareUrl(joinCode));
    setShareableCode(joinCode);
    showToast("Assessment published and stored in Firestore successfully! 🚀", "success");
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string, isLink: boolean) => {
    try {
      await navigator.clipboard.writeText(text);
      if (isLink) {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      }
      showToast("Copied to clipboard ✅", "success");
    } catch {
      showToast("Unable to copy automatically", "error");
    }
  };

  // Subject Theme
  const getSubjectTheme = (sub: Subject) => {
    switch (sub) {
      case Subject.Physics:
        return {
          primary: "bg-indigo-600 hover:bg-indigo-700 text-white",
          border: "border-indigo-200",
          bg: "bg-indigo-50",
          text: "text-indigo-900",
          accent: "text-indigo-600",
          badge: "bg-indigo-100 text-indigo-800",
          gradient: "from-indigo-600 to-blue-500"
        };
      case Subject.Chemistry:
        return {
          primary: "bg-purple-600 hover:bg-purple-700 text-white",
          border: "border-purple-200",
          bg: "bg-purple-50",
          text: "text-purple-900",
          accent: "text-purple-600",
          badge: "bg-purple-100 text-purple-800",
          gradient: "from-purple-600 to-pink-500"
        };
      case Subject.Biology:
        return {
          primary: "bg-emerald-600 hover:bg-emerald-700 text-white",
          border: "border-emerald-200",
          bg: "bg-emerald-50",
          text: "text-emerald-900",
          accent: "text-emerald-600",
          badge: "bg-emerald-100 text-emerald-800",
          gradient: "from-emerald-600 to-teal-500"
        };
      // Science and Integrated Science are separate subjects, so they get separate colours —
      // sharing one would make them indistinguishable at a glance in the quiz list.
      case Subject.Science:
        return {
          primary: "bg-sky-600 hover:bg-sky-700 text-white",
          border: "border-sky-200",
          bg: "bg-sky-50",
          text: "text-sky-900",
          accent: "text-sky-600",
          badge: "bg-sky-100 text-sky-800",
          gradient: "from-sky-600 to-blue-400"
        };
      case Subject.IntegratedScience:
      default:
        return {
          primary: "bg-teal-600 hover:bg-teal-700 text-white",
          border: "border-teal-200",
          bg: "bg-teal-50",
          text: "text-teal-900",
          accent: "text-teal-600",
          badge: "bg-teal-100 text-teal-800",
          gradient: "from-teal-600 to-cyan-500"
        };
    }
  };

  const currentTheme = editingQuiz ? getSubjectTheme(editingQuiz.subject) : getSubjectTheme(Subject.IntegratedScience);

  // Filter quizzes
  const filteredQuizzes = useMemo(() => {
    return quizzes.filter(q => {
      const matchSubject = selectedSubjectFilter === "all" || q.subject === selectedSubjectFilter;
      const matchSearch = !searchQuizQuery || q.title.toLowerCase().includes(searchQuizQuery.toLowerCase());
      return matchSubject && matchSearch;
    });
  }, [quizzes, selectedSubjectFilter, searchQuizQuery]);

  /**
   * The group vocabulary the submissions filter offers.
   *
   * resolveGroupOptions is what every other picker in the app uses, so this filter shows the same
   * list as the roster and the dashboard — including the pre-groups fallback when the teacher has
   * not created any, and any group name still held by a student but since renamed or deleted, so
   * nobody ends up stranded behind a filter that cannot reach them.
   */
  const resultGroupOptions = useMemo(
    () => resolveGroupOptions(groupsList, studentsList.map((s) => s.group)),
    [groupsList, studentsList]
  );

  /**
   * ONE filter pipeline for the submissions tab.
   *
   * The table used to filter inline while Export CSV exported `studentResults` wholesale, so the
   * spreadsheet never matched what was on screen. Both now consume this, which is what makes
   * "filter to Group A, then export" mean what a teacher expects — the group filter reaches the
   * export because there is only one definition of what is being shown.
   *
   * The four filters are independent and compose: search AND quiz AND group AND delivery status.
   */
  /** True when any submissions filter is narrowing the view — drives the "(filtered)" labels. */
  const submissionFiltersActive =
    filterQuizTitle !== "all" ||
    filterResultGroup !== ALL_FILTER ||
    filterDeliveryStatus !== "all" ||
    resultSearchTerm.trim() !== "";

  const filteredResults = useMemo(() => {
    const term = resultSearchTerm.trim().toLowerCase();
    return studentResults.filter((r) => {
      const matchSearch = !term || (r.studentName || "").toLowerCase().includes(term);
      const matchQuiz = filterQuizTitle === "all" || r.quizTitle === filterQuizTitle;
      const matchGroup = matchesGroupFilter(
        resolveResultGroup(studentsList, r),
        filterResultGroup
      );

      const dInfo = getResultDeliveryInfo(r);
      const isSent = dInfo.status === "sent" || dInfo.status === "resent";
      const matchDelivery =
        filterDeliveryStatus === "all" ? true : filterDeliveryStatus === "sent" ? isSent : !isSent;

      return matchSearch && matchQuiz && matchGroup && matchDelivery;
    });
  }, [
    studentResults,
    studentsList,
    resultSearchTerm,
    filterQuizTitle,
    filterResultGroup,
    filterDeliveryStatus,
    getResultDeliveryInfo
  ]);

  return (
    <div className="w-full relative" id="teacher-dashboard-view" dir="ltr">
      {/* Toast Notification Container */}
      <div className="fixed top-4 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
        <AnimatePresence>
          {toast && <TeacherToast key={toast.id} toast={toast} onClose={() => setToast(null)} />}
        </AnimatePresence>
      </div>

      {/* Custom Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.isOpen && <ConfirmModal state={confirmModal} onClose={closeConfirmModal} />}
      </AnimatePresence>

      {!editingQuiz ? (
        // =================================================================
        // Main Teacher Dashboard View
        // =================================================================
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-8"
        >
          {/* Welcome Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 md:p-10 text-white shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8 border border-slate-800" id="hero-welcome-banner">
            <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
            <div className="absolute bottom-0 left-0 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl -ml-20 -mb-20"></div>
            
            <div className="relative z-10 space-y-4 text-left flex-1">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold text-amber-300 border border-white/10">
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                Edulink Platform 🧪
              </div>

              <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-snug">
                Smart Teacher Dashboard & Instant Assessment 🚀
              </h1>

              <p className="text-slate-300 text-xs md:text-sm leading-relaxed max-w-2xl">
                Create interactive science quizzes, share links & QR codes with your students, review verified submissions, and generate official printable A4 reports instantly!
              </p>
              
              {/* Quick Stats Header Bar */}
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 flex items-center gap-2 text-xs font-bold">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  <span>{quizzes.length} Quizzes Available</span>
                </div>

                <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 flex items-center gap-2 text-xs font-bold">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span>{studentResults.length} Submissions</span>
                </div>

                <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 flex items-center gap-2 text-xs font-bold">
                  <Cloud className="w-4 h-4 text-cyan-400" />
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                    Cloud Sync Active
                  </span>
                </div>
              </div>
            </div>

            {/* Logo and Create Button */}
            <div className="relative z-10 shrink-0 flex flex-col items-center gap-4">
              <button
                id="btn-create-new-quiz-start"
                onClick={handleCreateNewQuiz}
                className="px-6 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black rounded-2xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 flex items-center gap-2 text-xs cursor-pointer"
              >
                <Plus className="w-5 h-5" />
                Create New Quiz
              </button>

              <div className="flex items-center gap-2 bg-white/5 p-3 rounded-2xl border border-white/10 backdrop-blur-sm">
                <GhadaLogo size="sm" showText={false} />
                <div className="text-left">
                  <span className="text-[11px] font-bold block text-amber-300">Dr. Ghada Abdelaal</span>
                  <span className="text-[9px] text-slate-400 block">Edulink 🧪✨</span>
                </div>
              </div>
            </div>
          </div>

          {/* LMS Assessment Workflow Progress Bar */}
          <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800 text-white shadow-sm flex flex-wrap items-center justify-between gap-2 text-xs" id="lms-workflow-bar">
            <div className="font-extrabold text-amber-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5 px-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Assessment Workflow:
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
              <button
                onClick={() => setActiveTab("bank")}
                className={`px-3 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                  activeTab === "bank" ? "bg-indigo-600 text-white shadow" : "bg-white/10 hover:bg-white/20 text-slate-300"
                }`}
              >
                <span>1. Question Bank</span>
              </button>
              <span className="text-slate-600">➔</span>
              <button
                onClick={() => setActiveTab("blueprints")}
                className={`px-3 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                  activeTab === "blueprints" ? "bg-amber-600 text-white shadow" : "bg-white/10 hover:bg-white/20 text-slate-300"
                }`}
              >
                <span>2. Blueprints</span>
              </button>
              <span className="text-slate-600">➔</span>
              <button
                onClick={() => setActiveTab("quizzes")}
                className={`px-3 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                  activeTab === "quizzes" ? "bg-emerald-600 text-white shadow" : "bg-white/10 hover:bg-white/20 text-slate-300"
                }`}
              >
                <span>3. Quiz & Homework</span>
              </button>
              <span className="text-slate-600">➔</span>
              <button
                onClick={() => setActiveTab("assignments")}
                className={`px-3 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                  activeTab === "assignments" ? "bg-teal-600 text-white shadow" : "bg-white/10 hover:bg-white/20 text-slate-300"
                }`}
              >
                <span>4. Student Assignments</span>
              </button>
              <span className="text-slate-600">➔</span>
              <button
                onClick={() => setActiveTab("submissions")}
                className={`px-3 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                  activeTab === "submissions" ? "bg-cyan-600 text-white shadow" : "bg-white/10 hover:bg-white/20 text-slate-300"
                }`}
              >
                <span>5. Submissions</span>
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm" id="teacher-tabs-navigation">
            <div className="flex flex-wrap items-center gap-2">
              <button
                id="tab-btn-bank"
                onClick={() => setActiveTab("bank")}
                className={`px-4 py-2.5 font-bold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === "bank"
                    ? "bg-indigo-600 text-white shadow-md"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Database className="w-4 h-4 text-indigo-300" />
                <span>1. Question Bank ({bankQuestions.length})</span>
              </button>

              <button
                id="tab-btn-blueprints"
                onClick={() => setActiveTab("blueprints")}
                className={`px-4 py-2.5 font-bold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === "blueprints"
                    ? "bg-amber-600 text-white shadow-md"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Sliders className="w-4 h-4 text-amber-200" />
                <span>2. Blueprints ({blueprints.length})</span>
              </button>

              <button
                id="tab-btn-quizzes"
                onClick={() => setActiveTab("quizzes")}
                className={`px-4 py-2.5 font-bold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === "quizzes"
                    ? "bg-slate-900 text-white shadow-md"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <BookOpen className="w-4 h-4 text-amber-400" />
                <span>3. Assessments ({quizzes.length})</span>
              </button>

              <button
                id="tab-btn-assignments"
                onClick={() => setActiveTab("assignments")}
                className={`px-4 py-2.5 font-bold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === "assignments"
                    ? "bg-teal-700 text-white shadow-md"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Users className="w-4 h-4 text-teal-300" />
                <span>4. Student Assignments ({studentAssignments.length})</span>
              </button>

              <button
                id="tab-btn-submissions"
                onClick={() => setActiveTab("submissions")}
                className={`px-4 py-2.5 font-bold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === "submissions"
                    ? "bg-emerald-700 text-white shadow-md"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Award className="w-4 h-4 text-emerald-300" />
                <span>5. Submissions ({studentResults.length})</span>
              </button>

              <button
                id="tab-btn-analytics"
                onClick={() => setActiveTab("analytics")}
                className={`px-4 py-2.5 font-bold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === "analytics"
                    ? "bg-purple-700 text-white shadow-md"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <BarChart2 className="w-4 h-4 text-purple-200" />
                <span>Analytics Dashboard 📊</span>
              </button>

              <button
                id="btn-quick-home-reset"
                onClick={handleReturnHome}
                className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-indigo-100"
                title="Return to Main Dashboard"
              >
                <Home className="w-4 h-4 text-indigo-600" />
                <span>Home 🏠</span>
              </button>
            </div>

            {activeTab === "submissions" && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  id="btn-manual-refresh"
                  onClick={handleManualRefresh}
                  className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Refresh submission records"
                >
                  <RefreshCw className="w-4 h-4 text-amber-600" />
                  <span>Refresh 🔄</span>
                </button>

                <button
                  id="btn-import-code"
                  onClick={() => setShowImportModal(true)}
                  className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Import student submission code"
                >
                  <KeyRound className="w-4 h-4 text-indigo-600" />
                  <span>Import Code 📥</span>
                </button>

                {studentResults.length > 0 && (
                  <>
                    <button
                      id="btn-export-csv"
                      onClick={handleExportCSV}
                      className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                      title="Export results to Excel CSV"
                    >
                      <Download className="w-4 h-4 text-emerald-600" />
                      <span>Export CSV 📊</span>
                    </button>

                    <button
                      id="btn-reset-storage"
                      onClick={handleClearAllResults}
                      className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                      title="Clear all records"
                    >
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      <span>Clear All 🗑️</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Quizzes Tab */}
          {activeTab === "quizzes" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Ready Curriculum Templates */}
              <div className="bg-white rounded-3xl border border-slate-100 p-6 space-y-6 shadow-sm" id="templates-section">
                <div className="space-y-1 text-left">
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-indigo-600" />
                    Curriculum Templates
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Select a ready template to adapt or launch immediately:
                  </p>
                </div>

                <div className="space-y-3.5">
                  {SAMPLE_QUIZZES.map((tmpl) => {
                    const theme = getSubjectTheme(tmpl.subject);
                    return (
                      <div
                        key={tmpl.id}
                        id={`template-item-${tmpl.id}`}
                        onClick={() => handleLoadTemplate(tmpl)}
                        className="group p-4 border border-slate-100 rounded-2xl hover:border-indigo-200 hover:bg-indigo-50/30 cursor-pointer transition-all duration-200 flex flex-col justify-between h-36 relative overflow-hidden text-left"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${theme.badge}`}>
                              {tmpl.subject}
                            </span>
                            <span className="text-[10px] text-slate-400 font-semibold">{tmpl.grade}</span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-800 group-hover:text-indigo-700 transition-colors line-clamp-2 leading-relaxed">
                            {tmpl.title}
                          </h4>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                          <span className="flex items-center gap-1 font-medium">
                            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                            {tmpl.questions.length} questions
                          </span>
                          <span className="text-indigo-600 font-bold flex items-center gap-0.5 group-hover:translate-x-1 transition-transform">
                            Use Template <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Saved Quizzes Section */}
              <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 p-6 space-y-6 shadow-sm" id="my-quizzes-section">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="text-left">
                    <h3 className="text-base font-bold text-slate-800">Saved Quizzes ({filteredQuizzes.length})</h3>
                    <p className="text-xs text-slate-500">Stored and ready for editing, preview, and immediate sharing</p>
                  </div>

                  {/* Search and Subject filter */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuizQuery}
                        onChange={(e) => setSearchQuizQuery(e.target.value)}
                        placeholder="Search title..."
                        className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 w-36 sm:w-44 font-semibold"
                      />
                    </div>

                    <select
                      value={selectedSubjectFilter}
                      onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                      className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none text-slate-700 cursor-pointer"
                    >
                      <option value="all">All Subjects</option>
                      {Object.values(Subject).map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>

                    <button
                      id="btn-add-quick-quiz-top"
                      onClick={handleCreateNewQuiz}
                      className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow cursor-pointer"
                      title="Create New Quiz"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {filteredQuizzes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center space-y-4" id="empty-quizzes-view">
                    <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
                      <FileText className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-slate-700 font-bold text-sm">No matching quizzes found</p>
                      <p className="text-slate-400 text-xs max-w-sm">
                        Create a new quiz or adjust filter parameters to view your saved quizzes.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="saved-quizzes-grid">
                    {filteredQuizzes.map((quiz) => {
                      const theme = getSubjectTheme(quiz.subject);
                      const quizSubmissionsCount = studentResults.filter(r => r.quizId === quiz.id || r.quizTitle === quiz.title).length;

                      return (
                        <div
                          key={quiz.id}
                          id={`saved-quiz-card-${quiz.id}`}
                          className="group p-5 border border-slate-100 rounded-2xl hover:border-slate-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between h-52 bg-slate-50/40 relative overflow-hidden text-left"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${theme.badge}`}>
                                {quiz.subject}
                              </span>
                              <span className="text-[10px] text-slate-400 font-semibold">{quiz.grade}</span>
                            </div>
                            <h4 className="text-sm font-bold text-slate-800 transition-colors line-clamp-2 leading-relaxed">
                              {quiz.title}
                            </h4>
                          </div>

                          <div className="space-y-3 border-t border-slate-200/60 pt-3">
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span className="flex items-center gap-1 font-semibold">
                                <User className="w-3.5 h-3.5 text-slate-400" />
                                {quiz.teacherName || "Science Teacher"}
                              </span>
                              <span className="flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                                <Users className="w-3.5 h-3.5" />
                                {quizSubmissionsCount} submissions
                              </span>
                            </div>
                            
                            <div className="flex items-center justify-between pt-1">
                              <div className="flex items-center gap-2">
                                <button
                                  id={`btn-open-quiz-item-${quiz.id}`}
                                  onClick={() => onSelectQuiz(quiz)}
                                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                                >
                                  Edit ✏️
                                </button>
                                <button
                                  onClick={() => handleOpenShareModal(quiz)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                                >
                                  Share 🔗
                                </button>
                                <button
                                  onClick={() => onPreviewQuiz(quiz)}
                                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer"
                                >
                                  Preview 👁️
                                </button>
                              </div>

                              <button
                                id={`btn-delete-quiz-item-${quiz.id}`}
                                onClick={(e) => handleDeleteQuiz(quiz.id, e)}
                                className="p-1.5 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                title="Delete Quiz"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submissions Tab */}
          {activeTab === "submissions" && (
            <div className="space-y-6" id="teacher-submissions-view">
              {/*
                Summary cards follow the active filters, like the table and the export.

                They read the unfiltered list before, which made "Submissions → this quiz →
                Group A" show Group A's rows above the whole class's average and pass rate — the
                one number a teacher is most likely to read off this screen and quote. The label
                says so explicitly whenever a filter is narrowing them.
              */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                  <div className="space-y-1 text-left">
                    <span className="text-xs text-slate-400 font-bold block">
                      {submissionFiltersActive ? "Submissions (filtered)" : "Total Recorded Submissions"}
                    </span>
                    <span className="text-2xl font-black text-slate-800">
                      {filteredResults.length} Submissions
                      {submissionFiltersActive && (
                        <span className="text-xs font-bold text-slate-400"> of {studentResults.length}</span>
                      )}
                    </span>
                  </div>
                  <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                    <Users className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                  <div className="space-y-1 text-left">
                    <span className="text-xs text-slate-400 font-bold block">
                      Average Score{submissionFiltersActive ? " (filtered)" : ""}
                    </span>
                    <span className="text-2xl font-black text-indigo-600">
                      {filteredResults.length > 0
                        ? Math.round(filteredResults.reduce((acc, r) => acc + (r.score / Math.max(1, r.totalQuestions)) * 100, 0) / filteredResults.length)
                        : 0}%
                    </span>
                  </div>
                  <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                    <Award className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                  <div className="space-y-1 text-left">
                    <span className="text-xs text-slate-400 font-bold block">
                      Pass Rate (≥50%){submissionFiltersActive ? " (filtered)" : ""}
                    </span>
                    <span className="text-2xl font-black text-emerald-600">
                      {filteredResults.length > 0
                        ? Math.round((filteredResults.filter(r => (r.score / Math.max(1, r.totalQuestions)) >= 0.5).length / filteredResults.length) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                    <Sparkles className="w-6 h-6" />
                  </div>
                </div>
              </div>

              {/* Filter and Search Bar */}
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="relative w-full md:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={resultSearchTerm}
                    onChange={(e) => setResultSearchTerm(e.target.value)}
                    placeholder="Search by student name..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-emerald-100"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Quiz:</span>
                    <select
                      value={filterQuizTitle}
                      onChange={(e) => setFilterQuizTitle(e.target.value)}
                      className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none text-slate-700 cursor-pointer"
                    >
                      <option value="all">All Quizzes</option>
                      {Array.from(new Set(studentResults.map(r => r.quizTitle))).map((t, idx) => (
                        <option key={idx} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/*
                    Group filter — same vocabulary and same control styling as the roster and the
                    analytics dashboard, sitting alongside the existing filters rather than
                    replacing them. Assessment + group is the intersection.
                  */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Group:</span>
                    <select
                      value={filterResultGroup}
                      onChange={(e) => setFilterResultGroup(e.target.value)}
                      className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none text-slate-700 cursor-pointer"
                      title="Filter results by student group"
                    >
                      <option value={ALL_FILTER}>All Groups</option>
                      {resultGroupOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                      <option value={NO_GROUP_FILTER}>{NO_GROUP_LABEL}</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500 font-bold whitespace-nowrap">WhatsApp Delivery:</span>
                    <select
                      value={filterDeliveryStatus}
                      onChange={(e) => setFilterDeliveryStatus(e.target.value as "all" | "sent" | "unsent")}
                      className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none text-slate-700 cursor-pointer"
                    >
                      <option value="all">All Delivery Statuses</option>
                      <option value="sent">📱 Sent / Resent ({studentResults.filter(r => getResultDeliveryInfo(r).status !== "unsent").length})</option>
                      <option value="unsent">⚪ Not Sent ({studentResults.filter(r => getResultDeliveryInfo(r).status === "unsent").length})</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Submissions Table */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                {studentResults.length === 0 ? (
                  <div className="p-12 text-center space-y-3">
                    <Users className="w-12 h-12 text-slate-300 mx-auto" />
                    <p className="text-slate-700 font-bold text-sm">No student results submitted yet</p>
                    <p className="text-slate-400 text-xs max-w-sm mx-auto">
                      When students complete a quiz and submit answers, their results and scores will automatically appear here with print report options.
                    </p>
                  </div>
                ) : filteredResults.length === 0 ? (
                  /* Results exist but the active filters exclude them all — say so, rather than
                     rendering a headed table with nothing under it. */
                  <div className="p-12 text-center space-y-3">
                    <Filter className="w-12 h-12 text-slate-300 mx-auto" />
                    <p className="text-slate-700 font-bold text-sm">No submissions match the current filters</p>
                    <p className="text-slate-400 text-xs max-w-sm mx-auto">
                      {studentResults.length} recorded submission{studentResults.length === 1 ? "" : "s"} are hidden by the quiz, group, delivery or search filters above.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                          <th className="py-3 px-4">Student Name</th>
                          <th className="py-3 px-4">Group</th>
                          <th className="py-3 px-4">Grade / Class</th>
                          <th className="py-3 px-4">Phone Number</th>
                          <th className="py-3 px-4">Quiz Title</th>
                          <th className="py-3 px-4 text-center">Attempt</th>
                          <th className="py-3 px-4 text-center">Score & Status</th>
                          <th className="py-3 px-4 text-center">WhatsApp Delivery</th>
                          <th className="py-3 px-4 text-center">Time Taken</th>
                          <th className="py-3 px-4">Submission Time</th>
                          <th className="py-3 px-4 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredResults
                          .map((res, idx) => {
                            const pct = Math.round((res.score / Math.max(1, res.totalQuestions)) * 100);
                            const minutes = Math.floor((res.timeTakenSeconds || 0) / 60);
                            const seconds = (res.timeTakenSeconds || 0) % 60;
                            const timeFormatted = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
                            const resDelivery = getResultDeliveryInfo(res);
                            const resGroup = resolveResultGroup(studentsList, res);
                            const attemptNo = Math.max(1, Number(res.attemptNumber) || 1);

                            const gradeBadge = pct >= 90
                              ? { label: "Excellent 🌟", color: "bg-emerald-100 text-emerald-800" }
                              : pct >= 75
                              ? { label: "Very Good 🔵", color: "bg-blue-100 text-blue-800" }
                              : pct >= 50
                              ? { label: "Passed 🟡", color: "bg-amber-100 text-amber-800" }
                              : { label: "Needs Review 🔴", color: "bg-rose-100 text-rose-800" };

                            return (
                              /*
                                Keyed by the submission document id. `submittedAt` was the key
                                before, which was unique only while a student could have one
                                submission per quiz — two attempts submitted in the same
                                millisecond would now collide and React would drop a row.
                              */
                              <tr key={res.id || res.submissionId || `${res.submittedAt}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3.5 px-4 font-bold text-slate-800">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center shrink-0">
                                      {res.studentName ? res.studentName.charAt(0).toUpperCase() : "S"}
                                    </div>
                                    <span>{res.studentName}</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-slate-600 font-semibold">
                                  {resGroup || <span className="text-slate-300">—</span>}
                                </td>
                                <td className="py-3.5 px-4 text-slate-700 font-bold">
                                  {res.studentClass || res.seatNumber || "N/A"}
                                </td>
                                <td className="py-3.5 px-4 text-slate-600 font-medium text-[11px]">
                                  {res.phoneNumber || res.studentIdNumber || "N/A"}
                                </td>
                                <td className="py-3.5 px-4 font-bold text-slate-700">
                                  {res.quizTitle}
                                </td>
                                {/* Retakes are separate rows; this is what tells them apart. */}
                                <td className="py-3.5 px-4 text-center">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                      attemptNo > 1
                                        ? "bg-blue-50 text-blue-800 border-blue-200"
                                        : "bg-slate-50 text-slate-500 border-slate-200"
                                    }`}
                                    title={attemptNo > 1 ? "A teacher-granted retake" : "First attempt"}
                                  >
                                    #{attemptNo}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="font-black text-slate-800">
                                      {res.score} / {res.totalQuestions} ({pct}%)
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${gradeBadge.color}`}>
                                      {gradeBadge.label}
                                    </span>
                                  </div>
                                </td>

                                {/* WhatsApp Delivery Status Cell */}
                                <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                  {resDelivery.status === "sent" || resDelivery.status === "resent" ? (
                                    <div className="inline-flex flex-col items-center gap-0.5">
                                      <span 
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black border ${
                                          resDelivery.status === "resent"
                                            ? "bg-teal-50 text-teal-800 border-teal-200 shadow-2xs"
                                            : "bg-emerald-50 text-emerald-800 border-emerald-200 shadow-2xs"
                                        }`}
                                        title={`Sent ${resDelivery.sendCount}x • Last sent: ${resDelivery.lastSentAt ? new Date(resDelivery.lastSentAt).toLocaleString() : "Previously"}`}
                                      >
                                        {resDelivery.status === "resent" ? (
                                          <RefreshCw className="w-3 h-3 text-teal-600" />
                                        ) : (
                                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                        )}
                                        <span>{resDelivery.status === "resent" ? "Resent" : "Sent"} ({resDelivery.sendCount}x)</span>
                                      </span>
                                      {resDelivery.lastSentAt && (
                                        <span className="text-[10px] text-slate-400 font-medium">
                                          {new Date(resDelivery.lastSentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(resDelivery.lastSentAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                      <span>Not Sent</span>
                                    </span>
                                  )}
                                </td>

                                <td className="py-3.5 px-4 text-center text-slate-500 font-mono font-semibold">
                                  {timeFormatted}
                                </td>
                                <td className="py-3.5 px-4 text-slate-400 font-medium text-[10px]">
                                  {new Date(res.submittedAt || Date.now()).toLocaleString("en-US")}
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => handlePrintStudentReport(res)}
                                      className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs flex items-center gap-1 transition-all cursor-pointer"
                                      title="Print Official A4 Report"
                                    >
                                      <Printer className="w-3.5 h-3.5" />
                                      <span>Report A4</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        const matchedStudent = studentsList.find(
                                          s => (s.id && res.studentIdNumber && s.id === res.studentIdNumber) || 
                                               (s.code && res.seatNumber && s.code.toUpperCase() === res.seatNumber.toUpperCase()) ||
                                               (s.name && res.studentName && s.name.trim().toLowerCase() === res.studentName.trim().toLowerCase())
                                        );
                                        const resultWithDelivery = { ...res, reportDelivery: resDelivery };
                                        setSelectedResultForWhatsApp({
                                          result: resultWithDelivery,
                                          studentRecord: matchedStudent || null
                                        });
                                      }}
                                      className={`px-2.5 py-1.5 font-bold rounded-lg text-xs flex items-center gap-1 transition-all cursor-pointer shadow-xs ${
                                        resDelivery.status === "sent" || resDelivery.status === "resent"
                                          ? "bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200"
                                          : "bg-emerald-600 hover:bg-emerald-700 text-white"
                                      }`}
                                      title={resDelivery.status !== "unsent" ? `Resend Summary Report via WhatsApp (Sent ${resDelivery.sendCount}x)` : "Send Summary Report via WhatsApp to Parent"}
                                    >
                                      {resDelivery.status !== "unsent" ? (
                                        <RefreshCw className="w-3.5 h-3.5 text-teal-600" />
                                      ) : (
                                        <MessageCircle className="w-3.5 h-3.5 fill-current" />
                                      )}
                                      <span>{resDelivery.status !== "unsent" ? "Resend" : "WhatsApp"}</span>
                                    </button>

                                    {resDelivery.status !== "unsent" && (
                                      <button
                                        onClick={() => handleMarkUnsentDirect(res)}
                                        className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                        title="Reset Delivery Status to Not Sent"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                      </button>
                                    )}

                                    <button
                                      onClick={() => handleReopenAttempt(res)}
                                      className="p-1.5 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors cursor-pointer"
                                      title="Allow this student to sit the assessment again (releases their device lock)"
                                    >
                                      <Unlock className="w-4 h-4" />
                                    </button>

                                    <button
                                      onClick={() => handleDeleteResult(res.submittedAt)}
                                      className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                      title="Delete Record"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Question Bank Tab */}
          {activeTab === "bank" && (
            <QuestionBankView
              questions={bankQuestions}
              onSaveQuestion={handleSaveBankQuestion}
              onDeleteQuestion={handleDeleteBankQuestion}
              onUpdateQuestions={(updatedQuestions) => {
                updatedQuestions.forEach(q => saveBankQuestionToFirestore(q));
              }}
              onShowToast={showToast}
            />
          )}

          {/* Homework Blueprints Tab */}
          {activeTab === "blueprints" && (
            <BlueprintListView
              blueprints={blueprints}
              bankQuestions={bankQuestions}
              onSaveBlueprint={handleSaveBlueprint}
              onDeleteBlueprint={handleDeleteBlueprint}
              onCreateQuizFromBlueprint={(bp) => handleOpenAssignModal("quiz", bp)}
              onCreateHomeworkFromBlueprint={(bp) => handleOpenAssignModal("homework", bp)}
              onShowToast={showToast}
            />
          )}

          {/* Student Assignments Tab */}
          {activeTab === "assignments" && (
            <StudentAssignmentsView
              assignments={studentAssignments}
              quizzes={quizzes}
              students={studentsList}
              groups={groupsList}
            />
          )}

          {/* Analytics Dashboard Tab */}
          {activeTab === "analytics" && (
            <AnalyticsDashboardView
              studentResults={studentResults}
              blueprints={blueprints}
              bankQuestions={bankQuestions}
              quizzes={quizzes}
              students={studentsList}
              groups={groupsList}
            />
          )}
        </motion.div>
      ) : (
        // =================================================================
        // Interactive Quiz Editor Workspace
        // =================================================================
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="space-y-8 pb-16"
          id="quiz-editor-workspace"
        >
          {/* Sticky Header Bar */}
          <div className="sticky top-20 z-30 flex flex-wrap items-center justify-between gap-4 bg-white/95 backdrop-blur-md p-4 md:p-5 rounded-2xl border border-slate-200 shadow-md" id="editor-actions-nav">
            <div className="flex items-center gap-2">
              <button
                id="btn-editor-back"
                onClick={handleReturnHome}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl transition-all flex items-center gap-2 text-xs cursor-pointer shadow-sm"
              >
                <ArrowRight className="w-4 h-4 text-indigo-600 rotate-180" />
                <span>Return Home 🏠</span>
              </button>

              <span className="text-xs text-slate-400 font-bold hidden sm:inline">
                | Editing Active Quiz
              </span>
            </div>
            
            <div className="flex items-center gap-2.5">
              <button
                id="btn-editor-save"
                onClick={handleSaveAndShare}
                className={`px-5 py-2.5 font-extrabold rounded-xl shadow-md transition-all flex items-center gap-2 text-xs cursor-pointer ${currentTheme.primary}`}
              >
                <Save className="w-4 h-4" />
                Save & Generate Link 💾
              </button>
              
              {shareableUrl && (
                <button
                  id="btn-editor-preview"
                  onClick={() => onPreviewQuiz(editingQuiz)}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all flex items-center gap-2 text-xs cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4 text-amber-400" />
                  Preview as Student 👁️
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Sidebar Meta Inputs */}
            <div className="space-y-6 lg:col-span-1">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6 text-left" id="quiz-meta-panel">
                <h3 className="text-base font-bold text-slate-800 pb-3 border-b border-slate-100 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-indigo-600" />
                  Quiz General Information
                </h3>

                {/* Title */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 block">Quiz Title</label>
                  <input
                    id="input-quiz-title"
                    type="text"
                    value={editingQuiz.title}
                    onChange={(e) => handleUpdateQuizMeta("title", e.target.value)}
                    placeholder="e.g., November Assessment - Chapter 1"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none text-xs transition-all font-semibold"
                  />
                </div>

                {/* Subject */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 block">Subject</label>
                  <div className="relative">
                    <select
                      id="select-quiz-subject"
                      value={editingQuiz.subject}
                      onChange={(e) => handleUpdateQuizMeta("subject", e.target.value as Subject)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none text-xs font-semibold appearance-none cursor-pointer"
                    >
                      {Object.values(Subject).map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Grade */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 block">Grade Level / Stage</label>
                  <input
                    id="input-quiz-grade"
                    type="text"
                    value={editingQuiz.grade}
                    onChange={(e) => handleUpdateQuizMeta("grade", e.target.value)}
                    placeholder="e.g., 2 prep, 1 Sec"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none text-xs font-semibold transition-all"
                  />
                </div>

                {/* Teacher Name */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 block">Teacher Name</label>
                  <div className="relative">
                    <input
                      id="input-quiz-teacher-name"
                      type="text"
                      value={editingQuiz.teacherName}
                      onChange={(e) => handleUpdateQuizMeta("teacherName", e.target.value)}
                      placeholder="e.g., Dr. Ghada Abdelaal"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none text-xs font-semibold transition-all"
                    />
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* WhatsApp Number */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 block">Teacher WhatsApp Number</label>
                  <div className="relative">
                    <input
                      id="input-quiz-teacher-whatsapp"
                      type="text"
                      value={editingQuiz.teacherWhatsApp}
                      onChange={(e) => handleUpdateQuizMeta("teacherWhatsApp", e.target.value)}
                      placeholder="e.g., 201000205897"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none text-xs font-semibold font-mono text-left transition-all"
                    />
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                  <span className="text-[10px] text-slate-400 leading-normal block">
                    * Include country code (e.g., 20) for direct WhatsApp score submission button.
                  </span>
                </div>
              </div>

              {/* Generated Links Panel */}
              {shareableUrl && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-6 rounded-3xl border border-emerald-100 bg-emerald-50/20 shadow-sm space-y-5 text-left"
                  id="quiz-share-panel"
                >
                  <h3 className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-emerald-600" />
                    Share Quiz with Students
                  </h3>

                  {/* Direct Link */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-emerald-800 block">Direct Quiz Link:</label>
                    <div className="flex gap-2">
                      <input
                        id="input-share-url-read"
                        type="text"
                        readOnly
                        value={shareableUrl}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-mono outline-none text-slate-600"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        id="btn-copy-share-url"
                        onClick={() => copyToClipboard(shareableUrl, true)}
                        className="px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedLink ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {/* Short Code */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-emerald-800 block">Short Access Code:</label>
                    <div className="flex gap-2">
                      <input
                        id="input-share-code-read"
                        type="text"
                        readOnly
                        value={shareableCode}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-mono outline-none text-slate-600 overflow-ellipsis"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        id="btn-copy-share-code"
                        onClick={() => copyToClipboard(shareableCode, false)}
                        className="px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedCode ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {/* QR Code */}
                  <div className="space-y-2 pt-1">
                    <button
                      id="btn-toggle-qr"
                      onClick={() => setShowQR(!showQR)}
                      className="w-full py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl font-bold text-xs text-slate-700 flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <QrCode className="w-4 h-4 text-emerald-600" />
                      {showQR ? "Hide QR Code" : "Show Classroom QR Code"}
                    </button>

                    {showQR && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center justify-center p-3 bg-white border border-slate-100 rounded-2xl space-y-2"
                      >
                        <img
                          id="qr-code-image"
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareableUrl)}`}
                          alt="QR Code"
                          className="w-40 h-40 border border-slate-100 rounded-lg p-1 shadow-sm"
                          referrerPolicy="no-referrer"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold text-center">
                          Scan with mobile camera to launch quiz instantly
                        </span>
                      </motion.div>
                    )}
                  </div>

                  {/* WhatsApp Group Link */}
                  <a
                    id="link-whatsapp-share-quiz"
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                      `Hello students! Here is your interactive science quiz link for ${editingQuiz.subject} (${editingQuiz.grade}) by ${editingQuiz.teacherName}.\nDirect Link:\n${shareableUrl}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs shadow-sm transition-all text-center cursor-pointer"
                  >
                    <Phone className="w-4 h-4" />
                    Share Quiz in WhatsApp Group
                  </a>
                </motion.div>
              )}
            </div>

            {/* Main Questions Builder */}
            <div className="lg:col-span-2 space-y-6" id="questions-builder-panel">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="text-left">
                  <h3 className="text-base font-bold text-slate-800">Quiz Questions ({editingQuiz.questions.length})</h3>
                  <p className="text-xs text-slate-500">Add questions, set correct choices, and add explanations</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    id="btn-import-from-bank"
                    onClick={() => setShowBankPickerModal(true)}
                    className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Import from Bank 📥</span>
                  </button>

                  <button
                    id="btn-add-mcq"
                    onClick={() => handleAddQuestion(QuestionType.MCQ)}
                    className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    + MCQ Question
                  </button>
                  <button
                    id="btn-add-tf"
                    onClick={() => handleAddQuestion(QuestionType.TrueFalse)}
                    className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-100 font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    + True / False
                  </button>
                </div>
              </div>

              {/* Questions List */}
              <div className="space-y-6">
                {editingQuiz.questions.map((q, qIndex) => (
                  <QuestionEditorCard
                    key={q.id}
                    question={q}
                    qIndex={qIndex}
                    currentThemeBadge={currentTheme.badge}
                    onUpdateQuestion={handleUpdateQuestion}
                    onDeleteQuestion={handleDeleteQuestion}
                    onSaveToBank={handleSaveQuestionToBankFromQuiz}
                  />
                ))}
              </div>

              {/* Add Question Bottom Actions */}
              <div className="flex flex-wrap items-center justify-center gap-4 py-4 border-t border-slate-100" id="editor-bottom-add-buttons">
                <button
                  id="btn-add-mcq-bottom"
                  onClick={() => handleAddQuestion(QuestionType.MCQ)}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add New MCQ Question
                </button>
                <button
                  id="btn-add-tf-bottom"
                  onClick={() => handleAddQuestion(QuestionType.TrueFalse)}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs shadow transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add New True / False Question
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Code Import Modal */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl border border-slate-100 text-left"
              dir="ltr"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-indigo-600" />
                  Import Student Result Code
                </h3>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 font-bold text-lg cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Paste the message or submission code (<span className="font-mono text-indigo-600 font-bold">RESULT_CODE</span>) sent by the student to import their score into records:
                </p>
                <textarea
                  value={importCodeInput}
                  onChange={(e) => setImportCodeInput(e.target.value)}
                  placeholder="Paste submission code or message here..."
                  rows={4}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-confirm-import-code"
                  onClick={handleImportCodeSubmit}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow transition-all flex items-center gap-2 cursor-pointer"
                >
                  <FilePlus className="w-4 h-4" />
                  Import Result
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Question Bank Picker Modal */}
      <QuestionBankPickerModal
        isOpen={showBankPickerModal}
        onClose={() => setShowBankPickerModal(false)}
        onImportQuestions={handleImportBankQuestionsToQuiz}
        bankQuestions={bankQuestions}
        currentQuizSubject={editingQuiz?.subject}
      />

      {/* Quiz / Homework Assignment Modal */}
      <QuizHomeworkAssignmentModal
        isOpen={assignModal.isOpen}
        type={assignModal.type}
        initialBlueprint={assignModal.blueprint}
        blueprints={blueprints}
        bankQuestions={bankQuestions}
        groups={groupsList}
        onClose={() => setAssignModal({ ...assignModal, isOpen: false })}
        onAssign={handleAssignQuizSaved}
      />

      {/* Share Assessment Modal */}
      <ShareAssessmentModal
        isOpen={showShareModal}
        quiz={shareModalQuiz}
        onClose={() => setShowShareModal(false)}
        onUpdateSettings={handleUpdateQuizShareSettings}
      />

      {/* Printable Report Component */}
      {selectedResultForPrint && (
        <PrintableReport result={selectedResultForPrint.result} quiz={selectedResultForPrint.quiz} />
      )}

      {/* Send WhatsApp Modal Component */}
      {selectedResultForWhatsApp && (
        <SendWhatsAppModal
          isOpen={!!selectedResultForWhatsApp}
          onClose={() => setSelectedResultForWhatsApp(null)}
          result={selectedResultForWhatsApp.result}
          studentRecord={selectedResultForWhatsApp.studentRecord}
          onToast={showToast}
        />
      )}
    </div>
  );
}
