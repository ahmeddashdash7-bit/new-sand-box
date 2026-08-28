import React from "react";
import { StudentResult, Quiz } from "../types";
import GhadaLogo from "./GhadaLogo";

interface PrintableReportProps {
  result: StudentResult;
  quiz?: Quiz;
}

export default function PrintableReport({ result, quiz }: PrintableReportProps) {
  const currentQuiz = quiz || result.quizSnapshot;
  if (!currentQuiz) return null;

  const percentage = Math.round((result.score / result.totalQuestions) * 100);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    if (mins === 0) return `${remainingSecs}s`;
    return `${mins}m ${remainingSecs}s`;
  };

  return (
    <div 
      id="pdf-report-template" 
      className="absolute left-[-9999px] top-[-9999px] w-[190mm] max-w-[190mm] bg-white p-5 text-left font-sans text-slate-800 border-2 border-emerald-600 rounded-2xl shadow-xl overflow-hidden box-border"
      dir="ltr"
    >
      {/* Report Header */}
      <div className="flex items-center justify-between border-b-2 border-emerald-500/40 pb-3 mb-3">
        <div className="text-left space-y-0.5">
          <span className="text-xs font-black text-emerald-800 block">Edulink 🧪🌱</span>
          <span className="text-[10px] text-slate-500 block">Interactive Science Learning Platform</span>
          <span className="text-[9px] text-emerald-600 font-bold block">Our Motto: Understand First... ✨</span>
        </div>

        {/* Logo */}
        <div className="flex flex-col items-center gap-1">
          <GhadaLogo size="sm" showText={false} />
          <span className="text-xs font-black text-slate-800">Edulink</span>
        </div>

        <div className="text-right space-y-0.5 text-slate-500 text-[10px]">
          <div>Date: {new Date(result.submittedAt || Date.now()).toLocaleDateString('en-US')}</div>
          <div>Report #: #{currentQuiz.id.substring(0, 6).toUpperCase()}-{Math.floor(Math.random() * 9000 + 1000)}</div>
          <span className="text-[9px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full inline-block border border-emerald-200 font-bold">Auto-Graded Certified Report</span>
        </div>
      </div>

      {/* Main Title */}
      <div className="text-center space-y-0.5 mb-3">
        <h1 className="text-base font-black text-slate-800 tracking-tight">Student Performance Assessment Card</h1>
        <p className="text-[10px] text-slate-500 max-w-md mx-auto leading-tight">
          Official record of student performance - Edulink Interactive Platform.
        </p>
      </div>

      {/* Student & Score Grid */}
      <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
        {/* Left Card: Student Info */}
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1">
          <h3 className="text-[10px] font-black text-slate-500 border-b border-slate-200 pb-0.5">👤 Student & Assessment Info</h3>
          <div className="space-y-0.5 text-[10px] font-bold text-slate-700">
            <div className="flex justify-between"><span className="text-slate-400">Student Name:</span> <span>{result.studentName || "N/A"}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Grade / Class:</span> <span>{currentQuiz.grade || result.studentClass || "N/A"}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">School / Teacher:</span> <span>{currentQuiz.teacherName || "Edulink"}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Assessment Title:</span> <span>{currentQuiz.title}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Subject:</span> <span>{currentQuiz.subject}</span></div>
          </div>
        </div>

        {/* Right Card: Score & Rating */}
        <div className="bg-emerald-50/40 p-2.5 rounded-xl border border-emerald-200 flex flex-col justify-between">
          <div>
            <h3 className="text-[10px] font-black text-emerald-900 border-b border-emerald-200 pb-0.5 mb-1.5">🏆 Performance Summary</h3>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="bg-white p-1 rounded-lg border border-emerald-100 shadow-2xs">
                <span className="text-[7.5px] text-slate-400 block font-bold">Final Score</span>
                <span className="text-xs font-black text-slate-800">{result.score} / {result.totalQuestions}</span>
              </div>
              <div className="bg-white p-1 rounded-lg border border-emerald-100 shadow-2xs">
                <span className="text-[7.5px] text-slate-400 block font-bold">Percentage</span>
                <span className="text-xs font-black text-emerald-700">{percentage}%</span>
              </div>
              <div className="bg-white p-1 rounded-lg border border-emerald-100 shadow-2xs">
                <span className="text-[7.5px] text-slate-400 block font-bold">Breakdown</span>
                <span className="text-[10px] font-black text-emerald-800">
                  {result.score}✓ {result.totalQuestions - result.score}✗
                </span>
              </div>
            </div>
          </div>
          <div className="flex justify-between items-center text-[9px] font-bold text-slate-600 pt-1 border-t border-emerald-200 mt-1">
            <span>⏱️ Time Taken: {formatTime(result.timeTakenSeconds)}</span>
            <span className="text-emerald-800 font-extrabold">
              {percentage >= 95 ? "Excellent 🏆" :
               percentage >= 80 ? "Very Good 🌟" :
               percentage >= 60 ? "Good Work 👏" :
               percentage >= 40 ? "Pass 👍" : "Needs Improvement 📚"}
            </span>
          </div>
        </div>
      </div>

      {/* Questions Table */}
      <div className="space-y-1.5 mb-3">
        <h3 className="text-[10px] font-black text-slate-500 border-b border-slate-200 pb-0.5">📋 Detailed Answers</h3>
        <table className="w-full text-left border-collapse text-[9px]">
          <thead>
            <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 font-bold">
              <th className="py-1 px-1.5 w-5 text-center rounded-l-lg">#</th>
              <th className="py-1 px-1.5">Question & Answer Options (In Order Shown)</th>
              <th className="py-1 px-1.5">Student Answer</th>
              <th className="py-1 px-1.5">Correct Answer</th>
              <th className="py-1 px-1.5 text-center rounded-r-lg">Status</th>
            </tr>
          </thead>
          <tbody>
            {currentQuiz.questions.map((q, idx) => {
              const ansItem = result.answers?.[idx] || result.answers?.find(a => a.questionId === q.id);
              const studentAnsIdx = ansItem ? ansItem.studentAnswerIndex : -1;
              const isCorrect = ansItem ? ansItem.isCorrect : false;
              const studentChoice = studentAnsIdx !== undefined && studentAnsIdx >= 0 && q.options[studentAnsIdx] !== undefined 
                ? q.options[studentAnsIdx] 
                : "Unanswered";
              const correctChoice = q.options[q.correctAnswerIndex] !== undefined 
                ? q.options[q.correctAnswerIndex] 
                : "";

              return (
                <tr key={q.id || idx} className={`border-b border-slate-100 font-medium ${isCorrect ? 'bg-emerald-50/20' : 'bg-rose-50/20'}`}>
                  <td className="py-1 px-1.5 text-center text-slate-400 font-bold">{idx + 1}</td>
                  <td className="py-1 px-1.5 font-bold text-slate-800 leading-tight">
                    <div className="mb-0.5">{q.text}</div>
                    {q.imageUrl && (
                      <div className="my-1 max-h-24 overflow-hidden rounded-lg bg-slate-50 border border-slate-200 p-1 flex items-center justify-start">
                        {/*
                          No crossOrigin attribute: this is a plain <img> render, never drawn to a
                          canvas. Requesting CORS mode would make the image fail to load outright
                          unless the Storage bucket has an explicit CORS configuration.
                        */}
                        <img
                          src={q.imageUrl}
                          alt={q.imageName || "Question figure"}
                          loading="lazy"
                          decoding="async"
                          className="max-h-20 max-w-full object-contain rounded"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                    {/* Render answer options in order shown */}
                    <div className="text-[8px] font-normal text-slate-500 flex flex-wrap gap-1 mt-0.5">
                      {q.options.map((opt, optIdx) => {
                        const isStudentChoice = optIdx === studentAnsIdx;
                        const isCorrectOption = optIdx === q.correctAnswerIndex;
                        let badgeStyle = "bg-slate-50 text-slate-600 border-slate-200";
                        if (isStudentChoice && isCorrect) {
                          badgeStyle = "bg-emerald-100 text-emerald-900 border-emerald-300 font-bold";
                        } else if (isStudentChoice && !isCorrect) {
                          badgeStyle = "bg-rose-100 text-rose-900 border-rose-300 font-bold";
                        } else if (isCorrectOption) {
                          badgeStyle = "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold";
                        }

                        return (
                          <span key={optIdx} className={`px-1 py-0.2 rounded border ${badgeStyle}`}>
                            {String.fromCharCode(65 + optIdx)}) {opt}
                          </span>
                        );
                      })}
                    </div>
                    {q.explanation && (
                      <div className="text-[7.5px] italic text-slate-400 font-normal mt-0.5">
                        💡 {q.explanation}
                      </div>
                    )}
                  </td>
                  <td className={`py-1 px-1.5 font-bold ${isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {studentAnsIdx >= 0 ? `${String.fromCharCode(65 + studentAnsIdx)}: ${studentChoice}` : "Unanswered"}
                  </td>
                  <td className="py-1 px-1.5 text-slate-700 font-bold">
                    {`${String.fromCharCode(65 + q.correctAnswerIndex)}: ${correctChoice}`}
                  </td>
                  <td className="py-1 px-1.5 text-center shrink-0">
                    {isCorrect ? (
                      <span className="inline-block px-1.5 py-0.2 rounded-full text-[8px] font-bold bg-emerald-100 text-emerald-800">✅ Correct</span>
                    ) : (
                      <span className="inline-block px-1.5 py-0.2 rounded-full text-[8px] font-bold bg-rose-100 text-rose-800">❌ Incorrect</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center pt-2 border-t-2 border-emerald-500/40 mt-auto">
        <div className="space-y-0.5 text-left text-[9px]">
          <span className="text-slate-400 block">Interactive Quiz Platform:</span>
          <span className="font-extrabold text-emerald-800">Edulink 🧪🌱</span>
        </div>

        {/* Signature & Seal */}
        <div className="flex items-center gap-3 relative">
          <div className="text-center space-y-0.5">
            <span className="text-[8px] text-slate-400 block font-bold">Instructor / Supervisor</span>
            <span className="text-[11px] font-black text-emerald-900 block">{currentQuiz.teacherName || "Instructor"}</span>
            <span className="text-[7px] text-slate-400 block">Verified Digital Stamp</span>
          </div>
          
          {/* Stamp Seal */}
          <div className="w-11 h-11 rounded-full border-2 border-emerald-600 border-double flex items-center justify-center text-center p-0.5 transform rotate-6 bg-emerald-50 shadow-sm">
            <div className="text-[6.5px] font-black text-emerald-800 leading-tight">
              Science<br />
              Garden<br />
              Approved 🏆
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
