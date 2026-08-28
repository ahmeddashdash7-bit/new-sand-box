import React, { useState, useEffect, useRef } from "react";
import { 
  GraduationCap, 
  LogIn, 
  BookOpen, 
  Clock, 
  User, 
  Phone, 
  Hash, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  HelpCircle, 
  ShieldCheck, 
  Sparkles,
  ArrowLeft,
  FileText,
  Award,
  KeyRound,
  UserCheck,
  Loader2,
  RefreshCw,
  Search
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Quiz, StudentRecord } from "../types";
import { decodeQuiz } from "../lib/encoder";
import GhadaLogo from "./GhadaLogo";
import {
  auth,
  getAssessmentByCodeFromFirestore,
  getStudentByCodeForJoin,
  buildAttemptId,
  resolveAttemptChain,
  startOrResumeAttempt,
  claimStudentCode
} from "../lib/firebase";
import { buildAttemptPaper, generateAttemptSeed } from "../lib/attemptPaper";
import { StudentAssignmentDocument } from "../types";
import { normalizeStudentCode, STUDENT_CODE_LENGTH } from "../lib/codeGenerator";
import { TEACHER_NAME } from "../lib/teacher";
import { DEFAULT_GRADE } from "../lib/classification";

// Fallback sample quizzes if storage is empty
const SAMPLE_QUIZZES_KEY = "teacher_quizzes";

interface JoinAssessmentProps {
  initialCode?: string;
  onOpenTeacherLogin: () => void;
  onStartAssessment: (
    quiz: Quiz, 
    studentData: { 
      studentName: string; 
      studentClass: string; 
      phoneNumber?: string;
      studentIdNumber?: string;
      assignmentId?: string;
      assignment?: StudentAssignmentDocument;
    }
  ) => void;
}

export default function JoinAssessment({
  initialCode = "",
  onOpenTeacherLogin,
  onStartAssessment
}: JoinAssessmentProps) {
  // Navigation / View Step: "form" | "welcome"
  const [step, setStep] = useState<"form" | "welcome">("form");

  // Form Fields
  const [studentCode, setStudentCode] = useState<string>("");
  const [fullName, setFullName] = useState("");
  const [classGrade, setClassGrade] = useState("");
  const [assessmentCode, setAssessmentCode] = useState(initialCode);
  const [phoneNumber, setPhoneNumber] = useState("");

  // Student code validation states
  const [validatedStudent, setValidatedStudent] = useState<StudentRecord | null>(null);
  const [isValidatingStudent, setIsValidatingStudent] = useState<boolean>(false);
  const [studentCodeError, setStudentCodeError] = useState<string>("");
  /**
   * Debounces student-code lookup. Codes vary in length (STUDENT_CODE_LENGTH for new ones, 3 for
   * codes issued earlier), so we cannot fire the lookup on an exact character count without either
   * missing legacy codes or flashing "not found" partway through a longer one.
   */
  const codeLookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Errors & Validation
  const [errorMessage, setErrorMessage] = useState("");
  const [validationErrors, setValidationErrors] = useState<{
    studentCode?: string;
    fullName?: string;
    classGrade?: string;
    assessmentCode?: string;
  }>({});

  // Verified Quiz object
  const [validatedQuiz, setValidatedQuiz] = useState<Quiz | null>(null);

  // Auto update assessment code if initialCode changes
  useEffect(() => {
    if (initialCode) {
      const cleanCode = initialCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
      setAssessmentCode(cleanCode);
    }
  }, [initialCode]);

  // Auto lookup assessment quiz details when assessmentCode changes
  useEffect(() => {
    if (assessmentCode && assessmentCode.trim().length >= 4) {
      const cleanCode = assessmentCode.trim().toUpperCase();
      const checkQuiz = async () => {
        let quiz = findQuizByCode(cleanCode);
        if (!quiz) {
          quiz = await getAssessmentByCodeFromFirestore(cleanCode);
        }
        if (quiz) {
          setValidatedQuiz(quiz);
        } else {
          setValidatedQuiz(null);
        }
      };
      checkQuiz();
    } else {
      setValidatedQuiz(null);
    }
  }, [assessmentCode]);

  // Validate student code against Firestore
  const handleValidateStudentCode = async (codeToVerify?: string) => {
    const rawVal = (codeToVerify !== undefined ? codeToVerify : studentCode).trim().toUpperCase();
    if (!rawVal) {
      setStudentCodeError("Please enter your student access code.");
      setValidatedStudent(null);
      setFullName("");
      setClassGrade("");
      setPhoneNumber("");
      return null;
    }

    // Codes issued before the length increase are 3 characters and must keep working.
    const codeVal = normalizeStudentCode(rawVal);
    if (!codeVal) {
      setStudentCodeError(`Student code must be ${STUDENT_CODE_LENGTH} characters (letters and digits only).`);
      setValidatedStudent(null);
      setFullName("");
      setClassGrade("");
      setPhoneNumber("");
      return null;
    }

    setIsValidatingStudent(true);
    setStudentCodeError("");
    setErrorMessage("");

    const student = await getStudentByCodeForJoin(codeVal);
    setIsValidatingStudent(false);

    if (student) {
      setValidatedStudent(student);
      setFullName(student.name);
      setClassGrade(student.grade || DEFAULT_GRADE);
      setPhoneNumber(student.parentPhone || "");
      setValidationErrors((prev) => ({ 
        ...prev, 
        studentCode: undefined,
        assessmentCode: prev.assessmentCode
      }));
      return student;
    } else {
      setValidatedStudent(null);
      setFullName("");
      setClassGrade("");
      setPhoneNumber("");
      setStudentCodeError(`No student record found for code "${codeVal}". Please ask your teacher for your assigned access code.`);
      return null;
    }
  };

  // Retrieve stored quizzes from localStorage
  const getAvailableQuizzes = (): Quiz[] => {
    try {
      const saved = localStorage.getItem(SAMPLE_QUIZZES_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to parse stored quizzes:", e);
    }
    return [];
  };

  // Find quiz by short code, joinCode, or decode
  const findQuizByCode = (codeStr: string): Quiz | null => {
    const clean = codeStr.trim();
    if (!clean) return null;

    // 1. Try decoding as short base64 hash
    const decoded = decodeQuiz(clean);
    if (decoded && decoded.title) return decoded;

    // 2. Search stored teacher quizzes
    const quizzes = getAvailableQuizzes();
    const upperCode = clean.toUpperCase();

    const matched = quizzes.find(q => {
      if (q.shareSettings?.joinCode && q.shareSettings.joinCode.trim().toUpperCase() === upperCode) {
        return true;
      }
      if (q.id.toUpperCase() === upperCode) return true;
      if (q.id.slice(-6).toUpperCase() === upperCode) return true;
      return false;
    });

    if (matched) return matched;

    return null;
  };

  // Form Submission & Validation
  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setStudentCodeError("");

    const errors: { studentCode?: string; assessmentCode?: string } = {};

    const cleanStudentCode = normalizeStudentCode(studentCode) || "";
    let currentStudent = validatedStudent;

    if (!studentCode.trim()) {
      errors.studentCode = "Student Access Code is required to enter the exam.";
    } else if (!cleanStudentCode) {
      errors.studentCode = `Student Access Code must be ${STUDENT_CODE_LENGTH} characters (letters and digits only).`;
    } else if (!currentStudent || (normalizeStudentCode(currentStudent.code) || "") !== cleanStudentCode) {
      currentStudent = await handleValidateStudentCode(cleanStudentCode);
    }

    if (!assessmentCode.trim()) {
      errors.assessmentCode = "Please enter the Assessment Exam Code provided by your teacher.";
    }

    setValidationErrors(errors);

    if (Object.keys(errors).length > 0 || !currentStudent) {
      if (!currentStudent && cleanStudentCode) {
        setErrorMessage(`Invalid Student Access Code "${cleanStudentCode}". You cannot join the exam without a valid student access code.`);
      }
      return;
    }

    // 1. Find Quiz locally or in Firestore
    let quiz = findQuizByCode(assessmentCode);
    if (!quiz) {
      quiz = await getAssessmentByCodeFromFirestore(assessmentCode);
    }

    if (!quiz) {
      setErrorMessage("Invalid Assessment Code. Please double-check the exam code provided by your teacher.");
      return;
    }

    // 2. Verify published & active status
    if (quiz.visibility === "draft" || quiz.status === "archived") {
      setErrorMessage("This assessment is not currently active or published.");
      return;
    }

    // 3. Verify due date
    if (quiz.dueDate) {
      const dueTime = new Date(quiz.dueDate).getTime();
      if (!isNaN(dueTime) && dueTime < Date.now()) {
        setErrorMessage("The due date for this assessment has passed. Submissions are closed.");
        return;
      }
    }

    /**
     * 4. Attempt eligibility — decided on the SERVER, not in this browser.
     *
     * What this replaces: a localStorage counter that tested `Array.isArray` against a value
     * written as an object (so it never once fired), plus a Firestore lookup that filtered out
     * completed attempts and therefore returned null in exactly the case it was meant to catch.
     * Between them, nothing prevented a repeat attempt.
     */
    const uid = auth.currentUser?.uid || "";

    // 4a. Bind the access code to this device. First device to use a code owns it; a different
    // device is refused until the teacher releases it.
    const claim = await claimStudentCode(cleanStudentCode, uid, currentStudent.id);
    if (!claim.ok) {
      if (claim.reason === "claimed-by-other") {
        setErrorMessage(
          "This student code is already in use on another device. If this is your code, ask your teacher to release it for you."
        );
      } else if (claim.reason === "inactive") {
        setErrorMessage("This student code has been deactivated. Please ask your teacher.");
      } else {
        setErrorMessage("Could not verify your student code. Please try again.");
      }
      return;
    }

    /**
     * 4b. Where does this student stand on this assessment?
     *
     * A completed attempt is final as far as the student is concerned. There is deliberately no
     * self-service reopen here: the client used to call reopenAttemptInFirestore when the
     * assessment allowed extra attempts, which meant the browser decided how many attempts it was
     * entitled to. A further sitting happens only when the teacher's Unlock control has stamped a
     * grant on the finished attempt — and the security rules check that grant independently, so
     * this branch is a courtesy message rather than the enforcement point.
     */
    const chain = await resolveAttemptChain(quiz.id, cleanStudentCode, uid);

    if (chain.blockedByCompletedAttempt) {
      setErrorMessage(
        "You have already completed and submitted this assessment. If you need to sit it again, ask your teacher to reopen it for you."
      );
      return;
    }

    // Validation succeeded! Proceed to Assessment Welcome Page
    setValidatedQuiz(quiz);
    setStep("welcome");
  };

  // Handle Start Assessment Click
  const handleStartAssessment = async () => {
    if (!validatedQuiz) return;

    const uid = auth.currentUser?.uid || "";
    const cleanStudentCode = normalizeStudentCode(studentCode) || "";

    /**
     * The attempt id is derived, not random, and it carries the attempt number.
     *
     * Previously this minted `sa_<quizId>_<random>_<timestamp>` whenever it failed to find an
     * existing row, so every rejoin created a brand new attempt. A derived id means the same
     * student always lands on the same document for a given sitting, and startOrResumeAttempt
     * only creates it once. Including the attempt number is what lets a teacher-granted retake be
     * a genuinely separate record instead of an overwrite of the first.
     */
    const chain = await resolveAttemptChain(validatedQuiz.id, cleanStudentCode, uid);
    const attemptNumber = chain.active
      ? Number(chain.active.attemptNumber) || 1
      : chain.nextAttemptNumber;

    const attemptId = buildAttemptId(validatedQuiz.id, cleanStudentCode, uid, attemptNumber);
    const questions = validatedQuiz.questions || [];

    /**
     * THIS ATTEMPT'S PAPER.
     *
     * Generated per attempt, here, immediately before the create — not against the assessment.
     * The assessment holds one canonical order shared by everyone, so shuffling it (which is what
     * used to happen, once, at assessment-creation time) can only ever give every student the
     * same "random" order. Two students produce two attempt documents with two seeds, so they get
     * two arrangements; the same student refreshing produces no new document at all, because
     * startOrResumeAttempt returns the existing one untouched — so their order never changes.
     *
     * A retake is a new attempt document, so it gets a new seed and a fresh arrangement.
     *
     * `settings` comes from the assessmentCodes join mirror, which already carries
     * assessmentSettings. The two flags are read independently of one another.
     */
    const settings = validatedQuiz.shareSettings || {};
    const randomSeed = generateAttemptSeed(attemptId);
    const paper = buildAttemptPaper(
      questions,
      {
        shuffleQuestions: Boolean(settings.shuffleQuestions),
        shuffleOptions: Boolean(settings.shuffleOptions)
      },
      randomSeed
    );

    const candidate: StudentAssignmentDocument = {
      id: attemptId,
      assessmentId: validatedQuiz.id,
      assessmentReference: validatedQuiz.id,
      blueprintId: validatedQuiz.blueprintId || `bp-${validatedQuiz.id}`,
      studentName: fullName.trim(),
      studentClass: classGrade.trim(),
      class: classGrade.trim(),
      studentIdNumber: validatedStudent?.id || "",
      phoneNumber: phoneNumber.trim() || validatedStudent?.parentPhone || "",
      phone: phoneNumber.trim() || validatedStudent?.parentPhone || "",
      // Presentation order for THIS attempt. Equals the canonical order when shuffling is off.
      questionIds: paper.questionIds,
      optionPermutations: paper.optionPermutations,
      generatedQuestions: questions,
      randomSeed,
      timeLimitMinutes:
        validatedQuiz.shareSettings?.timeLimitMinutes || (questions.length ? questions.length * 2 : 15),
      status: "in_progress",
      studentUid: uid,
      studentCode: cleanStudentCode,
      attemptNumber,
      startedAt: Date.now(),
      createdAt: Date.now(),
      currentProgress: {
        currentQuestionIndex: 0,
        selectedAnswers: {},
        timeTaken: 0,
        lastUpdated: Date.now()
      }
    };

    const { assignment: activeAssignment, alreadyCompleted, failed } = await startOrResumeAttempt(candidate);

    /**
     * Both failure paths return to "form", not "join". `step` is "form" | "welcome" — "join" was
     * never a valid value, so the view rendered nothing and the error message, which only exists
     * inside the form card, was invisible. A student refused at the door saw a blank screen.
     */
    if (failed) {
      setErrorMessage(
        "Could not start your assessment. Your access code may be in use on another device — please ask your teacher to release it for you."
      );
      setStep("form");
      return;
    }

    if (alreadyCompleted) {
      setErrorMessage("You have already completed and submitted this assessment.");
      setStep("form");
      return;
    }

    // Local copy is a cache for offline resilience only — Firestore is the authority on mount.
    try {
      localStorage.setItem(`sg_active_assignment_${validatedQuiz.id}`, JSON.stringify(activeAssignment));
      localStorage.setItem(
        "sg_active_session",
        JSON.stringify({
          assessmentId: validatedQuiz.id,
          assessmentCode: validatedQuiz.assessmentCode || assessmentCode.trim().toUpperCase(),
          assignmentId: activeAssignment.id,
          studentName: fullName.trim(),
          studentClass: classGrade.trim(),
          phoneNumber: phoneNumber.trim(),
          studentIdNumber: validatedStudent?.id || "",
          studentCode: cleanStudentCode,
          savedAt: Date.now()
        })
      );
    } catch {
      /* private browsing — Firestore still holds the attempt */
    }

    onStartAssessment(validatedQuiz, {
      studentName: fullName.trim(),
      studentClass: classGrade.trim(),
      phoneNumber: phoneNumber.trim(),
      studentIdNumber: validatedStudent?.id,
      assignmentId: activeAssignment.id,
      assignment: activeAssignment
    });
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 text-left" dir="ltr" id="join-assessment-container">
      
      {/* Primary Action Switcher Header */}
      <div className="bg-slate-200/80 p-1.5 rounded-2xl grid grid-cols-2 gap-2 shadow-inner" id="primary-entry-switcher">
        <button
          type="button"
          onClick={() => { setStep("form"); setErrorMessage(""); }}
          className="py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer bg-emerald-600 text-white shadow-md"
        >
          <GraduationCap className="w-4 h-4" />
          <span>Join Assessment 🎓</span>
        </button>

        <button
          type="button"
          onClick={onOpenTeacherLogin}
          className="py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer text-slate-600 hover:text-indigo-700 hover:bg-white/60"
        >
          <ShieldCheck className="w-4 h-4 text-indigo-600" />
          <span>Teacher Login 👨‍🏫</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {step === "form" ? (
          <motion.div
            key="join-form-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-slate-100 space-y-6"
          >
            {/* Header */}
            <div className="text-center space-y-2 border-b border-slate-100 pb-5">
              <GhadaLogo size="sm" showText={false} className="mx-auto" />
              <h2 className="text-2xl font-black text-slate-800">Student Assessment Login</h2>
              <p className="inline-flex items-center gap-1.5 text-[11px] font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
                <span>Assessments by {TEACHER_NAME}</span>
              </p>
              <p className="text-xs text-slate-500 font-medium">
                Enter your unique student access code assigned by your teacher
              </p>
            </div>

            {/* Error Message Alert */}
            {errorMessage && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-2xl text-xs font-bold flex items-start gap-3 animate-shake">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-black block">Unable to Join Assessment</span>
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleJoinSubmit} className="space-y-5">
              
              {/* CARD 1: UNIQUE STUDENT ACCESS CODE (EMERALD THEME) */}
              <div className="space-y-3 bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100/50 p-5 rounded-2xl border-2 border-emerald-300 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 bg-emerald-700 text-white font-black text-[11px] rounded-lg tracking-wider uppercase flex items-center gap-1.5 shadow-xs">
                    <KeyRound className="w-3.5 h-3.5" />
                    1. Student Access Code <span className="text-emerald-300">*</span>
                  </span>

                  {validatedStudent && (
                    <span className="px-2.5 py-0.5 bg-emerald-600 text-white text-[10px] font-black rounded-full flex items-center gap-1 shadow-xs animate-bounce-short">
                      <UserCheck className="w-3.5 h-3.5" />
                      Student Verified
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-grow">
                    <input
                      type="text"
                      maxLength={8}
                      value={studentCode}
                      onChange={(e) => {
                        const formatted = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
                        setStudentCode(formatted);
                        setStudentCodeError("");
                        setValidatedStudent(null);

                        if (codeLookupTimerRef.current) clearTimeout(codeLookupTimerRef.current);
                        if (formatted.length >= 3) {
                          codeLookupTimerRef.current = setTimeout(() => {
                            handleValidateStudentCode(formatted);
                          }, 450);
                        }
                      }}
                      placeholder="e.g. X7KM"
                      className={`w-full pl-4 pr-10 py-3.5 bg-white border-2 text-center text-2xl font-black tracking-widest uppercase font-mono shadow-inner outline-none transition-all rounded-xl ${
                        studentCodeError 
                          ? "border-rose-400 bg-rose-50/30 text-rose-950 focus:ring-4 focus:ring-rose-200"
                          : validatedStudent 
                          ? "border-emerald-500 bg-emerald-50/20 text-emerald-950 focus:ring-4 focus:ring-emerald-200" 
                          : "border-emerald-300 text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                      }`}
                    />
                    {isValidatingStudent && (
                      <Loader2 className="w-5 h-5 text-emerald-600 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleValidateStudentCode()}
                    disabled={isValidatingStudent || !studentCode}
                    className="px-4 py-3.5 bg-emerald-700 hover:bg-emerald-800 text-white font-black rounded-xl text-xs transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {isValidatingStudent ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Search className="w-3.5 h-3.5" />
                        Verify Code
                      </>
                    )}
                  </button>
                </div>

                {studentCodeError && (
                  <p className="text-[11px] text-rose-600 font-bold flex items-center gap-1 bg-white/80 p-2 rounded-lg border border-rose-200">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>{studentCodeError}</span>
                  </p>
                )}

                {/* Validated Student Profile Card */}
                {validatedStudent ? (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white p-3.5 rounded-xl border border-emerald-300 shadow-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                      <div>
                        <span className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-wider block">Verified Student</span>
                        <span className="font-black text-slate-900 text-base block">{validatedStudent.name}</span>
                      </div>
                      <span className="text-[11px] text-emerald-800 bg-emerald-100 font-black px-2.5 py-1 rounded-lg border border-emerald-200">
                        {validatedStudent.grade || DEFAULT_GRADE}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-0.5 text-slate-600">
                      <span>Parent Phone: <strong className="font-mono text-slate-800">{validatedStudent.parentPhone || "N/A"}</strong></span>
                      <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] border border-emerald-200">
                        Code: {validatedStudent.code}
                      </span>
                    </div>
                  </motion.div>
                ) : (
                  <p className="text-[11px] text-emerald-800 font-medium">
                    Enter your assigned student access code to automatically load your profile.
                  </p>
                )}
              </div>

              {/* CARD 2: ASSESSMENT EXAM CODE (INDIGO / PURPLE THEME) */}
              <div className="space-y-3 bg-gradient-to-br from-indigo-50 via-violet-50 to-purple-100/50 p-5 rounded-2xl border-2 border-indigo-300 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 bg-indigo-700 text-white font-black text-[11px] rounded-lg tracking-wider uppercase flex items-center gap-1.5 shadow-xs">
                    <FileText className="w-3.5 h-3.5" />
                    2. Assessment Exam Code <span className="text-indigo-300">*</span>
                  </span>

                  {initialCode && (
                    <span className="text-[10px] font-black text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded-full border border-indigo-200 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-indigo-600" />
                      Auto-filled from Link
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={assessmentCode}
                    maxLength={8}
                    onChange={(e) => {
                      const formatted = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
                      setAssessmentCode(formatted);
                      if (validationErrors.assessmentCode) setValidationErrors(prev => ({ ...prev, assessmentCode: undefined }));
                    }}
                    placeholder="e.g. AB7XQ2"
                    className={`w-full px-4 py-3.5 bg-white border-2 text-center text-xl font-mono font-black tracking-widest uppercase outline-none transition-all rounded-xl ${
                      validationErrors.assessmentCode 
                        ? "border-rose-300 focus:ring-4 focus:ring-rose-100 text-rose-950" 
                        : validatedQuiz 
                        ? "border-indigo-500 bg-indigo-50/20 text-indigo-950 focus:ring-4 focus:ring-indigo-200" 
                        : "border-indigo-300 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                    }`}
                  />
                </div>

                {validatedQuiz ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-white border border-indigo-200 rounded-xl text-xs text-indigo-900 shadow-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-indigo-600 font-extrabold uppercase tracking-wider">Exam Recognized</span>
                      <span className="text-[10px] text-indigo-700 bg-indigo-50 font-black px-2 py-0.5 rounded border border-indigo-100">
                        {validatedQuiz.subject}
                      </span>
                    </div>
                    <span className="font-extrabold text-slate-900 text-sm block">{validatedQuiz.title}</span>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-indigo-50">
                      <span>Total Questions: <strong className="text-slate-700">{validatedQuiz.questions?.length || 0} Qs</strong></span>
                      <span>Time Limit: <strong className="text-slate-700">{validatedQuiz.shareSettings?.timeLimitMinutes ? `${validatedQuiz.shareSettings.timeLimitMinutes} mins` : "Untimed"}</strong></span>
                    </div>
                  </motion.div>
                ) : (
                  <p className="text-[11px] text-indigo-800 font-medium">
                    Enter the assessment exam code provided by your teacher for this quiz session.
                  </p>
                )}

                {validationErrors.assessmentCode && (
                  <p className="text-[11px] text-rose-600 font-bold bg-white/80 p-2 rounded-lg border border-rose-200">{validationErrors.assessmentCode}</p>
                )}
              </div>

              {/* Primary Submit Button */}
              <button
                type="submit"
                className="w-full py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-700 hover:to-indigo-700 text-white font-black rounded-2xl text-base shadow-xl shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer mt-4 active:scale-98"
              >
                <span>Join & Enter Exam</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          </motion.div>
        ) : (
          /* Assessment Welcome Page */
          validatedQuiz && (
            <motion.div
              key="welcome-overview-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-slate-100 space-y-6"
            >
              {/* Top Banner */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-emerald-900 space-y-1 text-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 rounded-full text-xs font-extrabold text-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Assessment Verified</span>
                </div>
                <h3 className="text-xl font-black text-slate-800">{validatedQuiz.title}</h3>
                <p className="text-xs text-slate-600 font-medium">
                  {validatedQuiz.subject} • {validatedQuiz.grade}
                </p>
              </div>

              {/* Assessment Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Instructor</span>
                  <p className="font-extrabold text-slate-800">{validatedQuiz.teacherName || TEACHER_NAME}</p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Questions</span>
                  <p className="font-extrabold text-slate-800">{validatedQuiz.questions.length} Questions</p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Est. Time</span>
                  <p className="font-extrabold text-slate-800">{validatedQuiz.questions.length * 2} Minutes</p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1 col-span-2 sm:col-span-3">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Due Date</span>
                  <p className="font-extrabold text-slate-800">
                    {validatedQuiz.dueDate ? new Date(validatedQuiz.dueDate).toLocaleString() : "No strict deadline"}
                  </p>
                </div>
              </div>

              {/* Student Information Summary */}
              <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-4 space-y-2 text-xs">
                <span className="text-[11px] font-extrabold text-amber-900 block flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-amber-600" />
                    Student Profile Summary
                  </span>
                  {validatedStudent && (
                    <span className="font-mono font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                      Code: {validatedStudent.code}
                    </span>
                  )}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700 font-semibold">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Full Name:</span>
                    <span className="font-black text-slate-800">{fullName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Class / Grade:</span>
                    <span className="font-black text-slate-800">{classGrade}</span>
                  </div>
                  {phoneNumber && (
                    <div className="sm:col-span-2">
                      <span className="text-[10px] text-slate-400 font-bold block">Parent Phone:</span>
                      <span className="font-black text-slate-800">{phoneNumber}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Instructions */}
              <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-4">
                <h4 className="font-extrabold text-slate-800 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-emerald-600" />
                  Important Instructions
                </h4>
                <ul className="list-disc list-inside space-y-1 text-slate-500 font-medium pl-1">
                  <li>Ensure a stable internet connection before beginning.</li>
                  <li>Answer each question carefully. You can navigate between questions.</li>
                  <li>Click Submit when you are finished to record your final score.</li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep("form")}
                  className="w-full sm:w-auto px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Change Codes</span>
                </button>

                <button
                  type="button"
                  onClick={handleStartAssessment}
                  className="w-full flex-grow py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-sm shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Start Assessment 🚀</span>
                </button>
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
  );
}

