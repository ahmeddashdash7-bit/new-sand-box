/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Beaker, 
  Sparkles, 
  GraduationCap, 
  HelpCircle, 
  Globe, 
  Code, 
  BookOpen, 
  Database,
  ArrowLeft,
  Search,
  Wifi,
  Github,
  LogOut,
  UserCheck,
  ShieldCheck,
  UserPlus
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Quiz, User, StudentAssignmentDocument } from "./types";
import { signOutUser, subscribeToAuthState } from "./lib/authStore";
import {
  getStudentAssignmentFromFirestore,
  getAssessmentByCodeFromFirestore,
  getAssessmentFromFirestore
} from "./lib/firebase";
import TeacherPanel from "./components/TeacherPanel";
import StudentQuiz from "./components/StudentQuiz";
import AuthScreen from "./components/AuthScreen";
import GhadaLogo from "./components/GhadaLogo";
import JoinAssessment from "./components/JoinAssessment";
import AddStudentModal from "./components/AddStudentModal";

export default function App() {
  // Current logged in user (teacher)
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [activeStudentData, setActiveStudentData] = useState<{
    studentName: string;
    studentClass: string;
    phoneNumber?: string;
    studentIdNumber?: string;
    assignmentId?: string;
    assignment?: StudentAssignmentDocument;
  } | null>(null);
  
  // Unauthenticated view mode: "join" | "teacher-login"
  const [unauthViewMode, setUnauthViewMode] = useState<"join" | "teacher-login">("join");
  const [initialCode, setInitialCode] = useState<string>("");
  const [isAddStudentOpen, setIsAddStudentOpen] = useState<boolean>(false);

  // True until Firebase Auth has reported the restored session. Gating on this stops the join
  // screen from flashing before an already-signed-in teacher's panel appears.
  const [authInitializing, setAuthInitializing] = useState<boolean>(true);

  // Firebase Auth is the source of truth for who is signed in. It also restores the session
  // after a page refresh, which the previous localStorage-based mechanism never did.
  useEffect(() => {
    const unsubscribe = subscribeToAuthState((authState) => {
      setCurrentUser(authState.user);
      setAuthInitializing(authState.initializing);
    });
    return unsubscribe;
  }, []);

  // Check URL parameters for direct assessment links (e.g. ?code=... or ?q=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let quizCode = params.get("code") || params.get("q") || params.get("quiz");

    if (!quizCode && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      quizCode = hashParams.get("code") || hashParams.get("q") || hashParams.get("quiz");
    }

    if (quizCode) {
      setInitialCode(quizCode);
    }
  }, []);

  /**
   * Restore an in-progress attempt after a page refresh.
   *
   * `currentQuiz` lives in component state and there is no router, so a refresh previously dropped
   * the student straight back to the join screen — they had to re-enter both codes before
   * StudentQuiz could restore anything. Their answers were never actually lost, but it looked
   * exactly as if they were, which is what made refreshing feel destructive.
   *
   * Runs after auth resolves, because the attempt read depends on the anonymous session.
   */
  useEffect(() => {
    if (authInitializing || currentQuiz || currentUser) return;

    let cancelled = false;

    (async () => {
      let session: {
        assessmentId?: string;
        assessmentCode?: string;
        assignmentId?: string;
        studentName?: string;
        studentClass?: string;
        phoneNumber?: string;
        studentIdNumber?: string;
      } | null = null;

      try {
        const raw = localStorage.getItem("sg_active_session");
        session = raw ? JSON.parse(raw) : null;
      } catch {
        session = null;
      }

      if (!session?.assignmentId || !session.assessmentId) return;

      const attempt = await getStudentAssignmentFromFirestore(session.assignmentId);
      if (cancelled) return;

      // Nothing to resume: either no attempt, or it is already finished.
      if (!attempt || attempt.status === "completed") {
        try {
          localStorage.removeItem("sg_active_session");
        } catch {
          /* ignore */
        }
        return;
      }

      const quiz = session.assessmentCode
        ? await getAssessmentByCodeFromFirestore(session.assessmentCode)
        : await getAssessmentFromFirestore(session.assessmentId);

      if (cancelled || !quiz) return;

      setActiveStudentData({
        studentName: session.studentName || attempt.studentName || "",
        studentClass: session.studentClass || attempt.studentClass || "",
        phoneNumber: session.phoneNumber,
        studentIdNumber: session.studentIdNumber,
        assignmentId: attempt.id,
        assignment: attempt
      });
      setCurrentQuiz(quiz);
    })();

    return () => {
      cancelled = true;
    };
  }, [authInitializing, currentQuiz, currentUser]);

  // Logout Teacher. Firebase signs out, the auth listener clears currentUser, and the browser
  // falls back to an anonymous student session.
  const handleLogout = async () => {
    await signOutUser();
    setCurrentQuiz(null);
    setActiveStudentData(null);
    setUnauthViewMode("join");
    window.dispatchEvent(new CustomEvent("science_garden_back_to_home"));
  };

  // Back to Main / Control
  const handleBackToControl = () => {
    window.dispatchEvent(new CustomEvent("science_garden_back_to_home"));
    // Drop the resume pointer, otherwise the next load would pull the student straight back into
    // the attempt they just deliberately left.
    try {
      localStorage.removeItem("sg_active_session");
    } catch {
      /* ignore */
    }
    setCurrentQuiz(null);
    setActiveStudentData(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between selection:bg-amber-100 font-sans" dir="ltr" id="app-root-container">
      
      {/* Main Navigation Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40 shadow-sm" id="main-navigation-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* Logo & Platform Title */}
          <div className="flex items-center gap-3.5 cursor-pointer" onClick={handleBackToControl}>
            <GhadaLogo size="sm" showText={false} />
            <div>
              <span className="text-sm md:text-base font-black bg-gradient-to-r from-emerald-700 via-teal-700 to-indigo-700 bg-clip-text text-transparent">
                Edulink 🧪🌱
              </span>
              <span className="text-[10px] text-emerald-700 font-bold block leading-none mt-1">
                Interactive Assessment & Learning Platform
              </span>
            </div>
          </div>

          {/* Current User Info & Logout Button */}
          {currentUser ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-2xl text-xs font-bold text-slate-700">
                {currentUser.role === "teacher" ? (
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                ) : (
                  <GraduationCap className="w-4 h-4 text-emerald-600" />
                )}
                <span>{currentUser.fullName}</span>
                <span className="text-[10px] text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-100 capitalize">
                  {currentUser.role === "teacher" ? "Teacher" : "Student"}
                </span>
              </div>

              {currentUser.role === "teacher" && (
                <button
                  onClick={() => setIsAddStudentOpen(true)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:shadow"
                  title="Add & Manage Students"
                  id="add-student-header-btn"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add Student</span>
                </button>
              )}

              <button
                onClick={handleLogout}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer border border-rose-100"
                title="Log Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Log Out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 font-bold text-xs bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
              <span className="text-slate-500 font-semibold text-[10px]">Unified Portal Login ✨</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Interactive Content */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6" id="main-content-area">
        {currentUser && !currentQuiz && (
          <div className="bg-gradient-to-r from-emerald-500 via-teal-600 to-indigo-600 text-white px-5 py-3.5 rounded-2xl shadow-md flex items-center justify-between gap-3 text-xs md:text-sm font-extrabold animate-fade-in" id="welcome-user-banner">
            <div className="flex items-center gap-2">
              <span className="text-lg">👋</span>
              <span>
                {currentUser.role === "teacher" 
                  ? `Welcome back, Prof. ${currentUser.fullName} ✨` 
                  : `Welcome back, ${currentUser.fullName} 🎓`}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[11px] bg-white/15 px-3 py-1 rounded-xl backdrop-blur-md border border-white/20">
              <span>{currentUser.role === "teacher" ? `Subject: ${currentUser.specialization || "Science"}` : `Grade: ${currentUser.grade || "Grade 10"}`}</span>
              {currentUser.centerGroup && <span>• {currentUser.centerGroup}</span>}
              {currentUser.schoolName && <span>• {currentUser.schoolName}</span>}
            </div>
          </div>
        )}

        {/*
          The auth gate is deliberately OUTSIDE AnimatePresence. As a presence-animated sibling
          its exit animation could fail to complete, and with mode="wait" AnimatePresence then
          never mounts the next child — leaving the app stuck on the spinner forever.
        */}
        {authInitializing && (
          <div
            className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400"
            id="auth-initializing-state"
          >
            <span className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-emerald-500 animate-spin" />
            <span className="text-xs font-bold text-slate-500">Checking your session…</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {authInitializing ? null : currentQuiz ? (
            <motion.div
              key="student-quiz-active"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <StudentQuiz 
                quiz={currentQuiz} 
                studentData={activeStudentData || undefined}
                onBackToTeacher={handleBackToControl} 
              />
            </motion.div>
          ) : !currentUser ? (
            <motion.div
              key={unauthViewMode === "join" ? "join-assessment-screen" : "teacher-login-screen"}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="py-4"
            >
              {unauthViewMode === "join" ? (
                <JoinAssessment
                  initialCode={initialCode}
                  onOpenTeacherLogin={() => setUnauthViewMode("teacher-login")}
                  onStartAssessment={(quiz, studentData) => {
                    setCurrentQuiz(quiz);
                    setActiveStudentData(studentData);
                  }}
                />
              ) : (
                <AuthScreen 
                  onSuccess={(user) => setCurrentUser(user)} 
                  onCancel={() => setUnauthViewMode("join")}
                />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="teacher-portal-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <TeacherPanel 
                onPreviewQuiz={(quiz) => {
                  setCurrentQuiz(quiz);
                }}
                onSelectQuiz={(quiz) => {
                  setCurrentQuiz(quiz);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Teacher Footer */}
      {currentUser?.role === "teacher" && (
        <footer className="bg-slate-50 text-slate-500 py-6 border-t border-slate-200/80 text-xs mt-12 text-center" id="teacher-footer">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 font-semibold">
            <div className="flex items-center gap-2 text-slate-700">
              <GhadaLogo size="sm" showText={false} />
              <span className="font-extrabold">Edulink 🧪🌱</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              All rights reserved © {new Date().getFullYear()} - Edulink Learning Platform
            </p>
          </div>
        </footer>
      )}

      {/* Add Student Modal */}
      <AddStudentModal
        isOpen={isAddStudentOpen}
        onClose={() => setIsAddStudentOpen(false)}
        currentUser={currentUser}
      />
    </div>
  );
}

