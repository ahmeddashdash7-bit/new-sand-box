/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Sliders, Plus, Edit3, Trash2, Copy, Eye, BookOpen, FileText, Tag as TagIcon, Sparkles, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { HomeworkBlueprint, BankQuestion } from "../types";
import BlueprintFormModal from "./BlueprintFormModal";

interface BlueprintListViewProps {
  blueprints: HomeworkBlueprint[];
  bankQuestions?: BankQuestion[];
  onSaveBlueprint: (bp: HomeworkBlueprint) => void;
  onDeleteBlueprint: (id: string) => void;
  onCreateQuizFromBlueprint: (bp: HomeworkBlueprint) => void;
  onCreateHomeworkFromBlueprint: (bp: HomeworkBlueprint) => void;
  onShowToast: (msg: string, tone?: "success" | "error" | "info") => void;
}

export default function BlueprintListView({
  blueprints,
  bankQuestions = [],
  onSaveBlueprint,
  onDeleteBlueprint,
  onCreateQuizFromBlueprint,
  onCreateHomeworkFromBlueprint,
  onShowToast
}: BlueprintListViewProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBlueprint, setEditingBlueprint] = useState<HomeworkBlueprint | null>(null);
  const [deletingBlueprint, setDeletingBlueprint] = useState<HomeworkBlueprint | null>(null);
  const [previewBlueprint, setPreviewBlueprint] = useState<HomeworkBlueprint | null>(null);

  const handleAddNew = () => {
    setEditingBlueprint(null);
    setIsFormOpen(true);
  };

  const handleEdit = (bp: HomeworkBlueprint) => {
    setEditingBlueprint(bp);
    setIsFormOpen(true);
  };

  const handleDuplicate = (bp: HomeworkBlueprint) => {
    const duplicated: HomeworkBlueprint = {
      ...bp,
      id: "bp-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      title: `${bp.title} (Copy)`,
      createdAt: Date.now()
    };
    onSaveBlueprint(duplicated);
    onShowToast("Blueprint duplicated successfully ✨", "success");
  };

  const handleDeleteClick = (bp: HomeworkBlueprint) => {
    setDeletingBlueprint(bp);
  };

  // Calculate live matching questions for a blueprint
  const getMatchingQuestionsCount = (bp: HomeworkBlueprint) => {
    return bankQuestions.filter(q => {
      if (q.subject !== bp.subject) return false;
      if (bp.grade && q.grade && q.grade !== bp.grade && q.grade !== "General") return false;
      if (bp.lesson && !q.lesson?.toLowerCase().includes(bp.lesson.toLowerCase())) return false;
      if (bp.tags && bp.tags.length > 0) {
        const qTags = (q.tags || []).map(t => t.toLowerCase());
        const hasTag = bp.tags.some(tag => qTags.includes(tag.toLowerCase()));
        if (!hasTag) return false;
      }
      return true;
    }).length;
  };

  return (
    <div className="space-y-6" dir="ltr">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-extrabold text-slate-900">Homework & Quiz Blueprints</h2>
          </div>
          <p className="text-xs text-slate-500 max-w-xl">
            Blueprints define automated question selection rules from your Question Bank (subject, grade, tags, mix, and difficulty).
          </p>
        </div>

        <button
          onClick={handleAddNew}
          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" /> Build New Blueprint
        </button>
      </div>

      {/* Blueprint Cards Grid */}
      {blueprints.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
            <Sliders className="w-7 h-7" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="text-sm font-bold text-slate-800">No Blueprints Created Yet</h3>
            <p className="text-xs text-slate-500">
              Create your first assessment Blueprint to quickly auto-generate quizzes and homework assignments for students.
            </p>
          </div>
          <button
            onClick={handleAddNew}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Create Blueprint Wizard
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {blueprints.map((bp) => {
            const matchingCount = getMatchingQuestionsCount(bp);
            const mix = bp.questionMix || { mcqCount: 10, trueFalseCount: 5, shortAnswerCount: 0 };
            const diff = bp.difficultyDistribution || {};

            return (
              <motion.div
                key={bp.id}
                layout
                className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-3 py-1 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {bp.subject} • {bp.grade || "Grade 10"}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {new Date(bp.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-extrabold text-slate-900 leading-snug line-clamp-2">
                    {bp.title}
                  </h3>

                  {/* Lesson */}
                  <p className="text-xs font-semibold text-slate-600 line-clamp-1">
                    📖 Lesson: {bp.lesson || "General Unit"}
                  </p>

                  {/* Tags Chips */}
                  {bp.tags && bp.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {bp.tags.map(t => (
                        <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Question Mix & Difficulty Stats */}
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs space-y-2">
                    <div className="flex justify-between font-bold text-slate-700">
                      <span>Question Mix ({bp.totalQuestions || 15} items):</span>
                      <span className="text-indigo-700">
                        {mix.mcqCount} MCQ • {mix.trueFalseCount} TF {mix.shortAnswerCount ? `• ${mix.shortAnswerCount} SA` : ""}
                      </span>
                    </div>

                    <div className="flex justify-between text-[11px] font-bold text-slate-500">
                      <span>Difficulty Dist.:</span>
                      <span>
                        🟢 {diff.easyPct ?? 40}% / 🟡 {diff.mediumPct ?? 40}% / 🔴 {diff.hardPct ?? 20}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 font-extrabold text-[11px]">
                      <span className="text-slate-600">Bank Match:</span>
                      <span className="text-emerald-700 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        {matchingCount} matching questions
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onCreateQuizFromBlueprint(bp)}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <BookOpen className="w-3.5 h-3.5" /> Create Quiz
                    </button>
                    <button
                      onClick={() => onCreateHomeworkFromBlueprint(bp)}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <FileText className="w-3.5 h-3.5" /> Create HW
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-1 text-slate-400">
                    <button
                      onClick={() => setPreviewBlueprint(bp)}
                      className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" /> Preview
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDuplicate(bp)}
                        className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-indigo-600 rounded-xl transition-colors cursor-pointer"
                        title="Duplicate Blueprint"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleEdit(bp)}
                        className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-indigo-600 rounded-xl transition-colors cursor-pointer"
                        title="Edit Blueprint"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(bp)}
                        className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
                        title="Delete Blueprint"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Blueprint Preview Modal */}
      <AnimatePresence>
        {previewBlueprint && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" dir="ltr">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl border border-slate-100 text-left my-8"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-extrabold text-slate-900">Blueprint Preview</h3>
                <button onClick={() => setPreviewBlueprint(null)} className="p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 font-bold block">Title:</span>
                  <span className="text-sm font-extrabold text-slate-900">{previewBlueprint.title}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <div>
                    <span className="text-slate-400 font-bold block">Subject:</span>
                    <span className="font-bold text-slate-800">{previewBlueprint.subject}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold block">Grade:</span>
                    <span className="font-bold text-slate-800">{previewBlueprint.grade || "Grade 10"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold block">Lesson:</span>
                    <span className="font-bold text-slate-800">{previewBlueprint.lesson}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold block">Time Limit:</span>
                    <span className="font-bold text-slate-800">{previewBlueprint.timeLimitMinutes} mins</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 font-bold block mb-1">Tags:</span>
                  <div className="flex flex-wrap gap-1">
                    {previewBlueprint.tags?.length ? previewBlueprint.tags.map(t => (
                      <span key={t} className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full text-[10px] font-bold">
                        #{t}
                      </span>
                    )) : <span className="text-slate-400 italic">All tags</span>}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  onClick={() => setPreviewBlueprint(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const bp = previewBlueprint;
                    setPreviewBlueprint(null);
                    onCreateQuizFromBlueprint(bp);
                  }}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
                >
                  <BookOpen className="w-3.5 h-3.5" /> Create Quiz Now
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingBlueprint && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="ltr">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl border border-slate-100 text-left"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="space-y-1 pt-0.5 flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-slate-800">Delete Blueprint</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Are you sure you want to delete the blueprint <span className="font-bold text-slate-800">"{deletingBlueprint.title}"</span>?
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeletingBlueprint(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (deletingBlueprint) {
                      onDeleteBlueprint(deletingBlueprint.id);
                      onShowToast("Blueprint deleted successfully 🗑️", "success");
                      setDeletingBlueprint(null);
                    }
                  }}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Yes, Delete Blueprint
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Blueprint Form Modal */}
      <BlueprintFormModal
        isOpen={isFormOpen}
        initialBlueprint={editingBlueprint}
        bankQuestions={bankQuestions}
        onClose={() => setIsFormOpen(false)}
        onSave={(bp) => {
          onSaveBlueprint(bp);
          onShowToast(editingBlueprint ? "Blueprint updated! ✏️" : "New Blueprint created! ✨", "success");
        }}
      />
    </div>
  );
}
