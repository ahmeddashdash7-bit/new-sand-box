/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { X, Search, Check, FilePlus, HelpCircle, BookOpen, Star, Tag as TagIcon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { BankQuestion, Question, QuestionType, Subject, DifficultyLevel } from "../types";
import { normalizeTag, normalizeTags, hasMatchingTag } from "../lib/tagUtils";
import { pickQuestionImageFields } from "../lib/firebase";

interface QuestionBankPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportQuestions: (importedQuestions: Question[]) => void;
  bankQuestions: BankQuestion[];
  currentQuizSubject?: Subject;
}

export default function QuestionBankPickerModal({
  isOpen,
  onClose,
  onImportQuestions,
  bankQuestions,
  currentQuizSubject
}: QuestionBankPickerModalProps) {
  const [selectedSubject, setSelectedSubject] = useState<string>(currentQuizSubject || "all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [selectedPriority, setSelectedPriority] = useState<string>("all");
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());

  // Unique normalized tags from bank
  const availableTags = useMemo(() => {
    const raw: string[] = [];
    bankQuestions.forEach(q => {
      if (q.tags && Array.isArray(q.tags)) {
        raw.push(...q.tags);
      }
    });
    return normalizeTags(raw);
  }, [bankQuestions]);

  const filteredQuestions = useMemo(() => {
    return bankQuestions.filter((q) => {
      const matchSubject = selectedSubject === "all" || q.subject === selectedSubject;
      const matchDifficulty = selectedDifficulty === "all" || q.difficulty === selectedDifficulty;
      const matchPriority =
        selectedPriority === "all" ||
        (selectedPriority === "priority" && q.isPriority) ||
        (selectedPriority === "normal" && !q.isPriority);
      const matchTag = hasMatchingTag(q.tags, selectedTagFilter);
      const matchSearch =
        !searchQuery ||
        q.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.lesson.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (q.tags && q.tags.some(t => normalizeTag(t).includes(searchQuery.toLowerCase())));

      return matchSubject && matchDifficulty && matchPriority && matchTag && matchSearch;
    });
  }, [bankQuestions, selectedSubject, selectedDifficulty, selectedPriority, selectedTagFilter, searchQuery]);

  const handleToggleSelect = (id: string) => {
    const updated = new Set(selectedQuestionIds);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    setSelectedQuestionIds(updated);
  };

  const handleSelectAll = () => {
    if (selectedQuestionIds.size === filteredQuestions.length) {
      setSelectedQuestionIds(new Set());
    } else {
      const allIds = new Set(filteredQuestions.map(q => q.id));
      setSelectedQuestionIds(allIds);
    }
  };

  const handleConfirmImport = () => {
    const selectedBankList = bankQuestions.filter(q => selectedQuestionIds.has(q.id));
    const convertedQuestions: Question[] = selectedBankList.map(bq => ({
      id: "q-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      type: bq.type,
      text: bq.text,
      options: [...bq.options],
      correctAnswerIndex: bq.correctAnswerIndex,
      explanation: bq.explanation || "",
      subject: bq.subject,
      lesson: bq.lesson,
      difficulty: bq.difficulty,
      tags: bq.tags ? normalizeTags(bq.tags) : [],
      // The quiz copy gets a fresh id (so editing it never mutates the bank question) but must
      // keep the image reference; without this the figure was lost the moment a question was
      // imported into a quiz. Both copies point at the same Storage file.
      ...pickQuestionImageFields(bq)
    }));

    onImportQuestions(convertedQuestions);
    setSelectedQuestionIds(new Set());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" dir="ltr">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl p-6 max-w-4xl w-full space-y-5 shadow-2xl border border-slate-100 text-left my-8 max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                Import Questions from Question Bank
              </h3>
              <p className="text-xs text-slate-500">
                Filter by tag, subject, and difficulty to insert directly into this quiz
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 shrink-0 bg-slate-50 p-3 rounded-2xl border border-slate-200">
          <div className="relative w-full md:w-56">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search bank or tags..."
              className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="py-1.5 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer outline-none"
            >
              <option value="all">All Subjects</option>
              {Object.values(Subject).map((sub) => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>

            {/* Tag Filter Dropdown */}
            <select
              value={selectedTagFilter}
              onChange={(e) => setSelectedTagFilter(e.target.value)}
              className="py-1.5 px-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-900 cursor-pointer outline-none"
            >
              <option value="all">🏷️ All Tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>#{tag}</option>
              ))}
            </select>

            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="py-1.5 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer outline-none"
            >
              <option value="all">All Difficulties</option>
              <option value={DifficultyLevel.Easy}>🟢 Easy</option>
              <option value={DifficultyLevel.Medium}>🟡 Medium</option>
              <option value={DifficultyLevel.Hard}>🔴 Hard</option>
            </select>

            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="py-1.5 px-3 bg-amber-100 border border-amber-300 rounded-xl text-xs font-extrabold text-amber-900 cursor-pointer outline-none"
            >
              <option value="all">All Priorities</option>
              <option value="priority">⭐ High Priority Only</option>
            </select>

            <button
              onClick={handleSelectAll}
              className="py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs border border-indigo-200 transition-colors cursor-pointer"
            >
              {selectedQuestionIds.size === filteredQuestions.length && filteredQuestions.length > 0
                ? "Deselect All"
                : "Select All Filtered"}
            </button>
          </div>
        </div>

        {/* Question List */}
        <div className="overflow-y-auto space-y-3 flex-1 pr-1" dir="ltr">
          {filteredQuestions.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <HelpCircle className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-xs font-bold text-slate-600">No questions found matching criteria</p>
            </div>
          ) : (
            filteredQuestions.map((q) => {
              const isSelected = selectedQuestionIds.has(q.id);
              return (
                <div
                  key={q.id}
                  onClick={() => handleToggleSelect(q.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                    isSelected
                      ? "bg-indigo-50/70 border-indigo-400 shadow-sm"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-slate-100 text-transparent border-slate-300"
                    }`}
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>

                  <div className="space-y-2 flex-1 text-left" dir="ltr">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {q.isPriority && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-400 text-slate-950 flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-slate-950" /> High Priority
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-700">
                        {q.subject}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-600">
                        {q.lesson}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-100 text-indigo-800">
                        {q.difficulty}
                      </span>
                      {/* Render question tags */}
                      {q.tags && q.tags.length > 0 && q.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <p className="text-xs font-bold text-slate-800 leading-relaxed font-sans">
                      {q.text}
                    </p>

                    {q.imageUrl && (
                      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 w-fit max-w-full">
                        <img
                          src={q.imageUrl}
                          alt={q.imageName || "Question figure"}
                          loading="lazy"
                          decoding="async"
                          className="h-14 w-auto max-w-[140px] object-contain rounded-lg bg-white"
                          referrerPolicy="no-referrer"
                        />
                        <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full shrink-0">
                          🖼️ Figure attached
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 text-[10px] text-slate-500 font-semibold font-sans">
                      {q.options.map((opt, idx) => (
                        <span
                          key={idx}
                          className={`px-2 py-0.5 rounded-md border ${
                            idx === q.correctAnswerIndex
                              ? "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold"
                              : "bg-slate-50 border-slate-200"
                          }`}
                        >
                          {opt} {idx === q.correctAnswerIndex && "✓"}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 shrink-0">
          <span className="text-xs font-bold text-slate-600">
            Selected: <span className="text-indigo-600 font-black">{selectedQuestionIds.size}</span> questions
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              disabled={selectedQuestionIds.size === 0}
              onClick={handleConfirmImport}
              className={`px-5 py-2 font-bold rounded-xl text-xs shadow transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedQuestionIds.size > 0
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              <FilePlus className="w-4 h-4" /> Import Selected Questions
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
