/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Question, QuestionType } from "../types";
import { Check, Sparkles, HelpCircle } from "lucide-react";

interface QuestionPreviewCardProps {
  question: Partial<Question>;
  indexNumber?: number;
}

export default function QuestionPreviewCard({
  question,
  indexNumber = 1
}: QuestionPreviewCardProps) {
  const {
    type = QuestionType.MCQ,
    text = "نص السؤال يظهر هنا...",
    options = ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"],
    correctAnswerIndex = 0,
    imageUrl,
    explanation
  } = question;

  // Render text with simple HTML tags or markdown-style bold/italic/underline/mark
  const renderFormattedText = (rawText: string) => {
    let formatted = rawText || "نص السؤال...";
    // Replace markdown tags for quick preview
    formatted = formatted
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/<mark>(.*?)<\/mark>/g, '<mark class="bg-amber-200 text-amber-900 px-1 rounded">$1</mark>');

    return <span dangerouslySetInnerHTML={{ __html: formatted }} />;
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-3xl shadow-xl border border-indigo-800/40 text-right dir-rtl space-y-4">
      <div className="flex items-center justify-between border-b border-indigo-900/60 pb-3">
        <span className="flex items-center gap-2 text-xs font-black text-indigo-300">
          <span className="w-6 h-6 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-[11px] font-bold">
            {indexNumber}
          </span>
          معاينة السؤال حية كما يراها الطالب 👁️
        </span>
        <span className="text-[10px] bg-indigo-900/80 text-indigo-200 border border-indigo-700/60 px-2.5 py-1 rounded-full font-bold">
          {type === QuestionType.MCQ ? "اختيار من متعدد" : "صح أو خطأ"}
        </span>
      </div>

      {/* Figure preview, exactly as the student will receive it */}
      {imageUrl && (
        <div className="w-full bg-slate-950/80 rounded-2xl p-2 border border-indigo-900/50 flex items-center justify-center">
          <img
            src={imageUrl}
            alt={question.imageName || "Question figure"}
            loading="lazy"
            decoding="async"
            onError={(e) => {
              // Make a broken figure obvious to the teacher instead of leaving an empty box.
              const img = e.currentTarget;
              img.style.display = "none";
              img.insertAdjacentHTML(
                "afterend",
                '<span class="text-[11px] font-bold text-amber-300">⚠️ This figure could not be loaded.</span>'
              );
            }}
            className="max-h-48 max-w-full object-contain rounded-xl"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      {/* Question Text */}
      <div className="text-sm font-bold text-slate-100 leading-relaxed bg-slate-800/40 p-3.5 rounded-2xl border border-slate-700/40 text-left font-sans" dir="ltr">
        {renderFormattedText(text)}
      </div>

      {/* Options */}
      <div className="space-y-2">
        <span className="text-[11px] font-bold text-indigo-300 block">خيارات الإجابة:</span>
        <div className={`grid gap-2 ${type === QuestionType.TrueFalse ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
          {options.map((opt, idx) => {
            const isCorrect = correctAnswerIndex === idx;
            return (
              <div
                key={idx}
                dir="ltr"
                className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between transition-all text-left font-sans ${
                  isCorrect
                    ? "bg-emerald-950/80 border-emerald-500 text-emerald-200 shadow-md"
                    : "bg-slate-800/60 border-slate-700/60 text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] shrink-0 ${
                    isCorrect ? "bg-emerald-500 text-slate-950 font-black" : "bg-slate-700 text-slate-300"
                  }`}>
                    {idx + 1}
                  </span>
                  <span>{opt || `Option ${idx + 1}`}</span>
                </div>
                {isCorrect && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shrink-0">
                    <Check className="w-3 h-3" /> Correct
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Explanation */}
      {explanation && (
        <div className="text-xs bg-amber-950/40 border border-amber-800/40 p-3 rounded-2xl text-amber-200 space-y-1">
          <span className="font-extrabold flex items-center gap-1.5 text-amber-300">
            <Sparkles className="w-3.5 h-3.5" /> الشرح والتفسير العلمي للطالب:
          </span>
          <p className="leading-relaxed text-[11px]">{explanation}</p>
        </div>
      )}
    </div>
  );
}
