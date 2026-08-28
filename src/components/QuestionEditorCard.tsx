/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Question, QuestionType, Subject, DifficultyLevel } from "../types";
import { 
  Trash2, 
  Save, 
  Check, 
  Plus, 
  Eye, 
  Sparkles, 
  ImageIcon, 
  HelpCircle,
  Atom,
  Calculator,
  Zap,
  Dna,
  Star
} from "lucide-react";
import ScientificNotationToolbar from "./ScientificNotationToolbar";
import QuestionImageUploader from "./QuestionImageUploader";
import QuestionPreviewCard from "./QuestionPreviewCard";
import { BiologyDiagram } from "../data/biologyDiagrams";

interface QuestionEditorCardProps {
  key?: React.Key;
  question: Question;
  qIndex: number;
  currentThemeBadge: string;
  onUpdateQuestion: (qIndex: number, updatedQ: Question) => void;
  onDeleteQuestion: (qIndex: number) => void;
  onSaveToBank: (q: Question) => void;
}

export default function QuestionEditorCard({
  question,
  qIndex,
  currentThemeBadge,
  onUpdateQuestion,
  onDeleteQuestion,
  onSaveToBank
}: QuestionEditorCardProps) {
  const [showPreview, setShowPreview] = useState(false);

  const handleTypeChange = (newType: QuestionType) => {
    const updatedOptions = newType === QuestionType.TrueFalse 
      ? ["True", "False"] 
      : (question.options.length >= 2 ? question.options : ["", "", "", ""]);
    
    onUpdateQuestion(qIndex, {
      ...question,
      type: newType,
      options: updatedOptions,
      correctAnswerIndex: question.correctAnswerIndex > (updatedOptions.length - 1) ? 0 : question.correctAnswerIndex
    });
  };

  const handleInsertSymbol = (symbol: string) => {
    onUpdateQuestion(qIndex, {
      ...question,
      text: question.text + symbol
    });
  };

  const handleSelectBiologyDiagram = (diagram: BiologyDiagram) => {
    onUpdateQuestion(qIndex, {
      ...question,
      imageUrl: diagram.svgDataUrl,
      // Built-in diagrams are inline SVG data URLs with no remote file. Clearing imagePath stops
      // a previously uploaded file's identifier from lingering on the question.
      imagePath: "",
      imageProvider: "inline",
      imageName: diagram.title,
      imageWidth: undefined,
      imageHeight: undefined,
      imageUploadedAt: Date.now()
    });
  };

  const handleAddOption = () => {
    if (question.options.length < 6) {
      onUpdateQuestion(qIndex, {
        ...question,
        options: [...question.options, ""]
      });
    }
  };

  const handleRemoveOption = (optIdx: number) => {
    if (question.options.length <= 2) return;
    const updatedOpts = question.options.filter((_, idx) => idx !== optIdx);
    onUpdateQuestion(qIndex, {
      ...question,
      options: updatedOpts,
      correctAnswerIndex: question.correctAnswerIndex >= updatedOpts.length ? 0 : question.correctAnswerIndex
    });
  };

  return (
    <div className="bg-white p-6 md:p-7 rounded-3xl border border-slate-200/80 shadow-sm relative space-y-5 text-left transition-all hover:border-slate-300" dir="ltr">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className={`w-8 h-8 rounded-2xl flex items-center justify-center text-xs font-black shadow-sm ${currentThemeBadge}`}>
            {qIndex + 1}
          </span>
          <div>
            <h4 className="text-sm font-extrabold text-slate-800">
              {question.type === QuestionType.MCQ ? "Multiple Choice Question" : "True / False Question"}
            </h4>
            <span className="text-[11px] text-slate-400 font-medium">
              Enter question prompt and mark correct answer
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle Live Preview */}
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              showPreview ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{showPreview ? "Close Preview" : "Preview 👁️"}</span>
          </button>

          {/* Save to Bank */}
          <button
            id={`btn-save-to-bank-${qIndex}`}
            type="button"
            onClick={() => onSaveToBank(question)}
            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
            title="Save to Question Bank"
          >
            <Save className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline">Save to Bank 💾</span>
          </button>

          {/* Delete Question */}
          <button
            id={`btn-delete-question-${qIndex}`}
            type="button"
            onClick={() => onDeleteQuestion(qIndex)}
            className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
            title="Delete Question"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Live Preview Card if enabled */}
      {showPreview && (
        <QuestionPreviewCard
          question={question}
          indexNumber={qIndex + 1}
        />
      )}

      {/* Question Type & Difficulty Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
        <div className="flex flex-wrap items-center gap-3">
          {/* Question Type */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600">Type:</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => handleTypeChange(QuestionType.MCQ)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition-all ${
                  question.type === QuestionType.MCQ
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                Multiple Choice
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange(QuestionType.TrueFalse)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition-all ${
                  question.type === QuestionType.TrueFalse
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                True / False
              </button>
            </div>
          </div>

          {/* Difficulty Level */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600">Difficulty:</span>
            <select
              value={question.difficulty || DifficultyLevel.Medium}
              onChange={(e) => onUpdateQuestion(qIndex, { ...question, difficulty: e.target.value as DifficultyLevel })}
              className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100 cursor-pointer shadow-sm"
            >
              <option value={DifficultyLevel.Easy}>🟢 Easy</option>
              <option value={DifficultyLevel.Medium}>🟡 Medium</option>
              <option value={DifficultyLevel.Hard}>🔴 Hard</option>
            </select>
          </div>
        </div>

        {/* Priority Toggle */}
        <button
          type="button"
          onClick={() => onUpdateQuestion(qIndex, { ...question, isPriority: !question.isPriority })}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
            question.isPriority
              ? "bg-amber-400 border border-amber-500 text-slate-950 font-black"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
          }`}
          title="Mark as High Priority Question"
        >
          <Star className={`w-3.5 h-3.5 ${question.isPriority ? "fill-slate-950 text-slate-950" : "text-slate-400"}`} />
          <span>{question.isPriority ? "High Priority ⭐" : "Normal"}</span>
        </button>
      </div>

      {/* Scientific & Rich Formatting Toolbar */}
      <ScientificNotationToolbar
        onInsertSymbol={handleInsertSymbol}
        onSelectBiologyDiagram={handleSelectBiologyDiagram}
        onImageSelected={(url) =>
          onUpdateQuestion(qIndex, {
            ...question,
            imageUrl: url,
            imagePath: "",
            imageProvider: "inline",
            imageUploadedAt: Date.now()
          })
        }
      />

      {/* Question Text Input */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 block">Question Text Prompt:</label>
        <textarea
          id={`input-question-text-${qIndex}`}
          rows={3}
          dir="ltr"
          value={question.text}
          onChange={(e) => onUpdateQuestion(qIndex, { ...question, text: e.target.value })}
          placeholder="Enter scientific question text... (e.g. What is Newton's second law of motion?)"
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none text-xs font-semibold leading-relaxed text-left font-sans"
        />
      </div>

      {/* Question Image / Diagram Attachment */}
      <QuestionImageUploader
        questionId={question.id}
        imageUrl={question.imageUrl}
        imagePath={question.imagePath}
        imageProvider={question.imageProvider}
        imageName={question.imageName}
        imageWidth={question.imageWidth}
        imageHeight={question.imageHeight}
        onChangeImage={(url, metadata) =>
          onUpdateQuestion(qIndex, {
            ...question,
            imageUrl: url,
            imagePath: metadata?.imagePath,
            imageProvider: metadata?.imageProvider,
            imageName: metadata?.imageName,
            imageWidth: metadata?.imageWidth,
            imageHeight: metadata?.imageHeight,
            imageUploadedAt: metadata?.imageUploadedAt
          })
        }
      />

      {/* Options Section */}
      <div className="space-y-3 bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80">
        <div className="flex items-center justify-between">
          <label className="text-xs font-extrabold text-slate-700 block">
            Options (Click index button to select the correct answer):
          </label>
          {question.type === QuestionType.MCQ && question.options.length < 6 && (
            <button
              type="button"
              onClick={handleAddOption}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer bg-white px-2.5 py-1 rounded-xl border border-indigo-100 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Add Option
            </button>
          )}
        </div>

        {question.type === QuestionType.MCQ ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" id={`mcq-options-container-${qIndex}`}>
            {question.options.map((option, optIdx) => (
              <div
                key={optIdx}
                className={`flex items-center gap-2.5 p-3 rounded-2xl border transition-all ${
                  question.correctAnswerIndex === optIdx
                    ? "border-emerald-300 bg-emerald-50/60 shadow-sm"
                    : "border-slate-200 bg-white"
                }`}
              >
                <button
                  id={`btn-select-correct-${qIndex}-${optIdx}`}
                  type="button"
                  onClick={() => onUpdateQuestion(qIndex, { ...question, correctAnswerIndex: optIdx })}
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
                    question.correctAnswerIndex === optIdx
                      ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                      : "border-slate-300 hover:border-emerald-500 bg-white text-slate-400"
                  }`}
                  title={question.correctAnswerIndex === optIdx ? "Correct Answer" : "Set as Correct Answer"}
                >
                  {question.correctAnswerIndex === optIdx ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <span className="text-[11px] font-bold">{optIdx + 1}</span>
                  )}
                </button>

                <input
                  id={`input-option-${qIndex}-${optIdx}`}
                  type="text"
                  dir="ltr"
                  value={option}
                  onChange={(e) => {
                    const updatedOpts = [...question.options];
                    updatedOpts[optIdx] = e.target.value;
                    onUpdateQuestion(qIndex, { ...question, options: updatedOpts });
                  }}
                  placeholder={`Option ${optIdx + 1}`}
                  className="w-full bg-transparent outline-none text-xs font-semibold text-slate-800 placeholder-slate-400 text-left font-sans"
                />

                {question.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(optIdx)}
                    className="p-1 hover:bg-rose-50 text-slate-300 hover:text-rose-600 rounded-lg transition-colors cursor-pointer shrink-0"
                    title="Remove option"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4" id={`tf-options-container-${qIndex}`}>
            {["True", "False"].map((label, optIdx) => (
              <button
                id={`btn-select-tf-${qIndex}-${optIdx}`}
                key={optIdx}
                type="button"
                onClick={() => onUpdateQuestion(qIndex, { ...question, correctAnswerIndex: optIdx })}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border font-extrabold text-xs transition-all cursor-pointer ${
                  question.correctAnswerIndex === optIdx
                    ? "border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm"
                    : "border-slate-200 bg-white hover:bg-slate-100 text-slate-600"
                }`}
              >
                <span>{label}</span>
                {question.correctAnswerIndex === optIdx && <Check className="w-4 h-4 text-emerald-600" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Explanation optional */}
      <div className="space-y-1">
        <label className="text-[11px] font-bold text-slate-600 block">Scientific Solution Explanation:</label>
        <input
          type="text"
          dir="ltr"
          value={question.explanation || ""}
          onChange={(e) => onUpdateQuestion(qIndex, { ...question, explanation: e.target.value })}
          placeholder="Brief explanation for students..."
          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 text-left font-sans"
        />
      </div>
    </div>
  );
}
