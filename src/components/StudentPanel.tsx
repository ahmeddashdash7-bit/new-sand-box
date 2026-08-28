import React, { useState, useEffect } from "react";
import { User, Quiz, StudentResult, HomeworkBlueprint, BankQuestion } from "../types";
import { getStoredSubmissions } from "../lib/submissionStore";
import { decodeQuiz } from "../lib/encoder";
import { SAMPLE_QUIZZES } from "../data/templates";
import { getStoredBlueprints } from "../lib/blueprintStore";
import { getStoredBankQuestions } from "../lib/questionBankStore";
import { subscribeToFirestoreBlueprints, subscribeToFirestoreQuestions } from "../lib/firebase";
import { getOrGenerateAssignment } from "../lib/assignmentGenerator";
import { 
  GraduationCap, 
  Award, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  BookOpen, 
  Code, 
  Printer, 
  Eye, 
  FileCheck, 
  Sparkles,
  Search,
  Sliders,
  FileText,
  Loader2
} from "lucide-react";
import PrintableReport from "./PrintableReport";
import { reconstructAssessmentFromSubmission } from "../lib/assessmentReconstructor";

interface StudentPanelProps {
  user: User;
  onStartQuiz: (quiz: Quiz) => void;
}

export default function StudentPanel({ user, onStartQuiz }: StudentPanelProps) {
  const [activeTab, setActiveTab] = useState<"available" | "homeworks" | "history">("homeworks");
  const [availableQuizzes, setAvailableQuizzes] = useState<Quiz[]>([]);
  const [blueprints, setBlueprints] = useState<HomeworkBlueprint[]>([]);
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([]);
  const [myResults, setMyResults] = useState<StudentResult[]>([]);
  const [directCode, setDirectCode] = useState("");
  const [selectedResultForReview, setSelectedResultForReview] = useState<StudentResult | null>(null);
  const [selectedResultForPrint, setSelectedResultForPrint] = useState<{ result: StudentResult; quiz: Quiz } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [generatingHomeworkId, setGeneratingHomeworkId] = useState<string | null>(null);

  // Load available quizzes and student submissions
  const loadStudentData = async () => {
    // 1. Saved Quizzes
    const savedQuizzesStr = localStorage.getItem("teacher_quizzes");
    if (savedQuizzesStr) {
      try {
        setAvailableQuizzes(JSON.parse(savedQuizzesStr));
      } catch (e) {
        setAvailableQuizzes(SAMPLE_QUIZZES);
      }
    } else {
      setAvailableQuizzes(SAMPLE_QUIZZES);
    }

    // 2. Personal submissions
    const allSubmissions = await getStoredSubmissions();
    const mySubmissions = allSubmissions.filter(s => 
      s.studentId === user.id || 
      s.studentUsername?.toLowerCase() === user.username.toLowerCase() ||
      s.studentName.trim().toLowerCase() === user.fullName.trim().toLowerCase()
    );
    setMyResults(mySubmissions);

    // 3. Homework blueprints and Question bank
    const bps = await getStoredBlueprints();
    setBlueprints(bps);

    const bqs = await getStoredBankQuestions();
    setBankQuestions(bqs);
  };

  useEffect(() => {
    loadStudentData();

    // Firestore Real-time subscriptions
    const unsubBp = subscribeToFirestoreBlueprints((remoteBps) => {
      if (remoteBps && remoteBps.length > 0) {
        setBlueprints(remoteBps);
      }
    });

    const unsubBq = subscribeToFirestoreQuestions((remoteBqs) => {
      if (remoteBqs && remoteBqs.length > 0) {
        setBankQuestions(remoteBqs);
      }
    });

    const handleSubmissionEvent = () => loadStudentData();
    window.addEventListener("science_garden_submission_updated", handleSubmissionEvent);
    window.addEventListener("student_result_submitted", handleSubmissionEvent);
    return () => {
      unsubBp();
      unsubBq();
      window.removeEventListener("science_garden_submission_updated", handleSubmissionEvent);
      window.removeEventListener("student_result_submitted", handleSubmissionEvent);
    };
  }, [user]);

  // Start automatic homework generation
  const handleStartHomework = async (bp: HomeworkBlueprint) => {
    try {
      setGeneratingHomeworkId(bp.id);
      
      const generated = await getOrGenerateAssignment(bp, user, bankQuestions);

      if (!generated || !generated.questions || generated.questions.length === 0) {
        alert("Sorry, could not find enough matching questions in the question bank for this homework assignment. Please contact your instructor.");
        setGeneratingHomeworkId(null);
        return;
      }

      const homeworkQuiz: Quiz = {
        id: generated.id,
        title: generated.blueprintTitle,
        subject: generated.subject,
        grade: user.grade || "Grade 10 Secondary",
        teacherName: bp.teacherName || "Science Instructor",
        teacherWhatsApp: "",
        questions: generated.questions,
        createdAt: generated.createdAt
      };

      onStartQuiz(homeworkQuiz);
    } catch (err) {
      console.error("Error starting homework:", err);
      alert("An error occurred while loading homework. Please try again.");
    } finally {
      setGeneratingHomeworkId(null);
    }
  };

  // Open quiz via direct base64 code
  const handleLoadDirectCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directCode.trim()) {
      alert("Please enter a quiz code first.");
      return;
    }
    const decoded = decodeQuiz(directCode.trim());
    if (decoded) {
      onStartQuiz(decoded);
    } else {
      alert("Invalid quiz code. Please make sure you copied the full code.");
    }
  };

  // Print student report
  const triggerPrint = async (res: StudentResult) => {
    try {
      const reconstructedQuiz = await reconstructAssessmentFromSubmission(res, bankQuestions);
      setSelectedResultForPrint({ result: res, quiz: reconstructedQuiz });
      setTimeout(() => {
        window.print();
      }, 300);
    } catch (err) {
      console.error("Failed to prepare printable report:", err);
    }
  };

  const filteredQuizzes = availableQuizzes.filter(q => 
    q.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    q.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
    q.grade.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 text-left" dir="ltr" id="student-panel-wrapper">
      {/* Student Profile Banner */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden" id="student-profile-card">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white text-2xl border border-white/30 shadow-inner">
              👨‍🎓
            </div>
            <div>
              <h2 className="text-xl font-black">{user.fullName}</h2>
              <p className="text-xs text-emerald-100 font-bold opacity-90 mt-0.5">
                {user.grade || "Grade 10 Secondary"} • Username: <span className="font-mono">@{user.username}</span>
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/20 text-xs font-bold">
            <div className="text-center px-2">
              <span className="block text-emerald-200 text-[10px]">Completed Quizzes</span>
              <span className="text-sm font-black">{myResults.length} Quizzes</span>
            </div>
            <div className="h-6 w-px bg-white/20"></div>
            <div className="text-center px-2">
              <span className="block text-emerald-200 text-[10px]">Average Score</span>
              <span className="text-sm font-black">
                {myResults.length > 0 
                  ? `${Math.round(myResults.reduce((acc, r) => acc + (r.score / r.totalQuestions) * 100, 0) / myResults.length)}%` 
                  : "---"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3" id="student-tabs-bar">
        <div className="flex flex-wrap gap-2 bg-slate-100 p-1 rounded-2xl w-fit">
          <button
            id="student-tab-btn-homeworks"
            onClick={() => setActiveTab("homeworks")}
            className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "homeworks"
                ? "bg-white text-amber-700 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Sliders className="w-4 h-4 text-amber-500" />
            <span>Homework Assignments ({blueprints.length})</span>
          </button>

          <button
            id="student-tab-btn-available"
            onClick={() => setActiveTab("available")}
            className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "available"
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <BookOpen className="w-4 h-4 text-emerald-500" />
            <span>Public Quizzes ({availableQuizzes.length})</span>
          </button>

          <button
            id="student-tab-btn-history"
            onClick={() => setActiveTab("history")}
            className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "history"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Award className="w-4 h-4 text-indigo-500" />
            <span>Quiz History ({myResults.length})</span>
          </button>
        </div>

        {(activeTab === "available" || activeTab === "homeworks") && (
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search title or subject..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        )}
      </div>

      {/* Homework Tab */}
      {activeTab === "homeworks" && (
        <div className="space-y-6" id="student-homeworks-section">
          {blueprints.length === 0 ? (
            <div className="bg-white p-10 rounded-3xl text-center space-y-3 border border-slate-100">
              <Sliders className="w-12 h-12 text-amber-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-700">No Homework Assignments Available</h3>
              <p className="text-xs text-slate-400">Your instructor will publish homework assignments here for personalized question generation.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {blueprints
                .filter(bp => 
                  bp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  bp.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  bp.lesson.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map((bp) => {
                  const assignmentId = `hw-${bp.id}-${user.id || user.username}`;
                  const completedResult = myResults.find(r => r.quizId === assignmentId || r.quizTitle === bp.title);
                  const isGenerating = generatingHomeworkId === bp.id;

                  return (
                    <div
                      key={bp.id}
                      className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 relative overflow-hidden"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 bg-amber-50 text-amber-800 font-black text-[10px] rounded-lg border border-amber-200">
                              {bp.subject}
                            </span>
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-bold text-[10px] rounded-lg">
                              {bp.lesson}
                            </span>
                          </div>

                          <span className="text-[10px] font-bold text-slate-400">
                            {bp.totalQuestions} Questions
                          </span>
                        </div>

                        <h4 className="text-sm font-black text-slate-800 leading-snug">
                          {bp.title}
                        </h4>

                        <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50/80 p-3 rounded-2xl border border-slate-100 text-slate-600 font-semibold">
                          <div>
                            ⏱️ Time Limit: <strong>{bp.timeLimitMinutes === 0 ? "Untimed" : `${bp.timeLimitMinutes} mins`}</strong>
                          </div>
                          <div>
                            👨‍🏫 Instructor: <strong>{bp.teacherName || "Science Instructor"}</strong>
                          </div>
                          <div className="col-span-2 flex items-center gap-1.5 pt-1 border-t border-slate-200/60 font-bold text-[10px]">
                            <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Easy: {bp.difficultyDistribution.easyCount}</span>
                            <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Medium: {bp.difficultyDistribution.mediumCount}</span>
                            <span className="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">Hard: {bp.difficultyDistribution.hardCount}</span>
                          </div>
                        </div>
                      </div>

                      {/* Status and Action */}
                      <div className="pt-2 border-t border-slate-100">
                        {completedResult ? (
                          <div className="bg-emerald-50/80 p-3 rounded-2xl border border-emerald-200 flex items-center justify-between">
                            <div>
                              <span className="text-xs font-black text-emerald-900 block">Submitted Successfully ✅</span>
                              <span className="text-[11px] text-emerald-700 font-bold">
                                Score: {completedResult.score} of {completedResult.totalQuestions} ({Math.round((completedResult.score / completedResult.totalQuestions) * 100)}%)
                              </span>
                            </div>
                            <button
                              onClick={() => setSelectedResultForReview(completedResult)}
                              className="px-3 py-1.5 bg-white text-emerald-800 font-extrabold rounded-xl text-xs border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                            >
                              Review 👁️
                            </button>
                          </div>
                        ) : (
                          <button
                            id={`btn-start-homework-${bp.id}`}
                            onClick={() => handleStartHomework(bp)}
                            disabled={isGenerating}
                            className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black rounded-2xl text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                          >
                            {isGenerating ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin text-white" />
                                <span>Generating personalized questions...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4 text-amber-200" />
                                <span>Start Homework Assignment 🚀</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Available Public Quizzes Tab */}
      {activeTab === "available" && (
        <div className="space-y-6">
          {/* Direct Code Input Card */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-3">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Code className="w-4 h-4 text-emerald-600" />
              Enter Quiz Access Code:
            </h3>
            <form onSubmit={handleLoadDirectCode} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={directCode}
                onChange={(e) => setDirectCode(e.target.value)}
                placeholder="Paste Base64 quiz code here..."
                className="flex-grow px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
              <button
                type="submit"
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow transition-all cursor-pointer"
              >
                Open Quiz 🔓
              </button>
            </form>
          </div>

          {/* Public Quizzes Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredQuizzes.map((quiz) => (
              <div
                key={quiz.id}
                className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-extrabold text-[10px] rounded-lg border border-emerald-100">
                      {quiz.subject}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {quiz.questions.length} Questions
                    </span>
                  </div>

                  <h4 className="text-sm font-extrabold text-slate-800 leading-snug">
                    {quiz.title}
                  </h4>
                  <p className="text-[11px] font-bold text-slate-500">
                    👨‍🏫 Instructor: {quiz.teacherName || "Science Instructor"}
                  </p>
                </div>

                <button
                  onClick={() => onStartQuiz(quiz)}
                  className="w-full py-2.5 bg-slate-900 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Start Quiz Now</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quiz History Tab */}
      {activeTab === "history" && (
        <div className="space-y-4">
          {myResults.length === 0 ? (
            <div className="bg-white p-10 rounded-3xl text-center space-y-3 border border-slate-100">
              <Award className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-700">No Previous Quiz Results Recorded</h3>
              <p className="text-xs text-slate-400">Complete your first quiz to view your score history and certificates here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myResults.map((res, index) => {
                const percentage = Math.round((res.score / res.totalQuestions) * 100);
                return (
                  <div
                    key={`${res.submittedAt}-${index}`}
                    className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400">
                          {new Date(res.submittedAt).toLocaleDateString("en-US")}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                          percentage >= 80 ? "bg-emerald-100 text-emerald-800" :
                          percentage >= 50 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"
                        }`}>
                          {percentage}%
                        </span>
                      </div>

                      <h4 className="text-sm font-extrabold text-slate-800 leading-snug">
                        {res.quizTitle}
                      </h4>

                      <div className="flex items-center gap-4 text-xs font-bold text-slate-600 pt-1">
                        <span>🎯 Score: <strong className="text-slate-900">{res.score} of {res.totalQuestions}</strong></span>
                        <span>⏱️ Time: <strong className="text-slate-900">{Math.floor(res.timeTakenSeconds / 60)} mins</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={async () => {
                          const reconstructedQuiz = res.quizSnapshot || await reconstructAssessmentFromSubmission(res, bankQuestions);
                          setSelectedResultForReview({ ...res, quizSnapshot: reconstructedQuiz });
                        }}
                        className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Review Quiz</span>
                      </button>

                      <button
                        onClick={() => triggerPrint(res)}
                        className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Print A4 Report"
                      >
                        <Printer className="w-4 h-4" />
                        <span>📄 A4</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Answer Review Modal */}
      {selectedResultForReview && selectedResultForReview.quizSnapshot && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full my-8 space-y-5 shadow-2xl border border-slate-100 text-left" dir="ltr">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-800">
                  Reviewing Answers - {selectedResultForReview.quizTitle}
                </h3>
                <p className="text-xs text-slate-500 font-bold mt-0.5">
                  Your Score: {selectedResultForReview.score} of {selectedResultForReview.totalQuestions}
                </p>
              </div>
              <button
                onClick={() => setSelectedResultForReview(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pl-1">
              {selectedResultForReview.quizSnapshot.questions.map((q, idx) => {
                const ansItem = selectedResultForReview.answers?.[idx];
                const studentAnsIdx = ansItem ? ansItem.studentAnswerIndex : -1;
                const isCorrect = ansItem ? ansItem.isCorrect : false;

                return (
                  <div key={q.id} className={`p-4 rounded-2xl border ${isCorrect ? 'bg-emerald-50/30 border-emerald-200' : 'bg-rose-50/30 border-rose-200'} space-y-2.5`}>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-extrabold text-slate-800">
                        Q{idx + 1}: {q.text}
                      </h4>
                      {isCorrect ? (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-md shrink-0">
                          ✅ Correct
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-black rounded-md shrink-0">
                          ❌ Incorrect
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 text-xs font-bold">
                      {q.options.map((opt, optIdx) => {
                        const isStudentChoice = optIdx === studentAnsIdx;
                        const isCorrectAnswer = optIdx === q.correctAnswerIndex;

                        return (
                          <div
                            key={optIdx}
                            className={`p-2 rounded-xl text-xs flex items-center justify-between ${
                              isCorrectAnswer
                                ? 'bg-emerald-600 text-white font-black'
                                : isStudentChoice && !isCorrect
                                ? 'bg-rose-600 text-white'
                                : 'bg-white text-slate-700 border border-slate-100'
                            }`}
                          >
                            <span>{opt}</span>
                            {isCorrectAnswer && <span className="text-[10px]">Correct Answer ✅</span>}
                            {isStudentChoice && !isCorrectAnswer && <span className="text-[10px]">Your Answer ❌</span>}
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200/60 rounded-xl text-[11px] text-amber-900 font-bold leading-relaxed">
                        💡 <strong>Scientific Explanation:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setSelectedResultForReview(null)}
                className="px-6 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 cursor-pointer"
              >
                Close Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Report Component */}
      {selectedResultForPrint && (
        <PrintableReport result={selectedResultForPrint.result} quiz={selectedResultForPrint.quiz} />
      )}
    </div>
  );
}
