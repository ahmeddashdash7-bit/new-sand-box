/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { 
  Plus, 
  Trash2, 
  Search, 
  BookOpen, 
  HelpCircle, 
  Edit3, 
  Sparkles, 
  Check, 
  Layers, 
  Filter, 
  ArrowRight,
  Copy,
  Star,
  Tag as TagIcon,
  LayoutGrid,
  List,
  Archive,
  CheckSquare,
  Square,
  Upload
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { BankQuestion, Subject, QuestionType, DifficultyLevel } from "../types";
import QuestionImage from "./QuestionImage";
import QuestionImageLightbox from "./QuestionImageLightbox";
import { normalizeTag, normalizeTags, hasMatchingTag } from "../lib/tagUtils";
import BankQuestionFormModal from "./BankQuestionFormModal";
import TagManagerModal from "./TagManagerModal";
import BulkQuestionImportModal from "./BulkQuestionImportModal";

interface QuestionBankViewProps {
  questions: BankQuestion[];
  onSaveQuestion: (question: BankQuestion) => void;
  onDeleteQuestion: (id: string) => void;
  onUpdateQuestions?: (questions: BankQuestion[]) => void;
  onCreateQuizFromQuestions?: (questions: BankQuestion[]) => void;
  onShowToast: (msg: string, tone?: "success" | "error" | "info") => void;
}

export default function QuestionBankView({
  questions,
  onSaveQuestion,
  onDeleteQuestion,
  onUpdateQuestions,
  onCreateQuizFromQuestions,
  onShowToast
}: QuestionBankViewProps) {
  const [viewMode, setViewMode] = useState<"card" | "table">("card");

  // Figure lightbox for the teacher, so a diagram can be checked at full size before it is assigned.
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);
  const openLightbox = (url: string, alt: string) => setLightbox({ url, alt });
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [selectedPriority, setSelectedPriority] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Bulk Selection State
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);

  // Modals State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<BankQuestion | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<BankQuestion | null>(null);

  // Calculate all unique tags in bank
  const allBankTags = useMemo(() => {
    const raw: string[] = [];
    questions.forEach(q => {
      if (q.tags && Array.isArray(q.tags)) {
        raw.push(...q.tags);
      }
    });
    return normalizeTags(raw);
  }, [questions]);

  // Statistics
  const stats = useMemo(() => {
    const total = questions.length;
    const easyCount = questions.filter(q => q.difficulty === DifficultyLevel.Easy).length;
    const mediumCount = questions.filter(q => q.difficulty === DifficultyLevel.Medium).length;
    const hardCount = questions.filter(q => q.difficulty === DifficultyLevel.Hard).length;
    const priorityCount = questions.filter(q => q.isPriority).length;
    return { total, easyCount, mediumCount, hardCount, priorityCount };
  }, [questions]);

  // Filtered Questions
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const matchSubject = selectedSubject === "all" || q.subject === selectedSubject;
      const matchDifficulty = selectedDifficulty === "all" || q.difficulty === selectedDifficulty;
      const matchType = selectedType === "all" || q.type === selectedType;
      const matchStatus = selectedStatus === "all" || q.status === selectedStatus;
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

      return matchSubject && matchDifficulty && matchType && matchStatus && matchPriority && matchTag && matchSearch;
    });
  }, [questions, selectedSubject, selectedDifficulty, selectedType, selectedStatus, selectedPriority, selectedTagFilter, searchQuery]);

  const handleAddNew = () => {
    setEditingQuestion(null);
    setIsFormOpen(true);
  };

  const handleEdit = (q: BankQuestion) => {
    setEditingQuestion(q);
    setIsFormOpen(true);
  };

  const handleDuplicate = (q: BankQuestion) => {
    const duplicated: BankQuestion = {
      ...q,
      id: "q-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      text: `${q.text} (Copy)`,
      createdAt: Date.now()
    };
    onSaveQuestion(duplicated);
    onShowToast("Question duplicated in bank! ✨", "success");
  };

  const handleTogglePriority = (q: BankQuestion, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = { ...q, isPriority: !q.isPriority };
    onSaveQuestion(updated);
    onShowToast(updated.isPriority ? "Marked as High Priority ⭐" : "Priority removed", "info");
  };

  const handleDeleteClick = (q: BankQuestion, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeletingQuestion(q);
  };

  // Bulk actions
  const handleSelectAll = () => {
    if (selectedQuestionIds.length === filteredQuestions.length) {
      setSelectedQuestionIds([]);
    } else {
      setSelectedQuestionIds(filteredQuestions.map(q => q.id));
    }
  };

  const toggleSelectQuestion = (id: string) => {
    if (selectedQuestionIds.includes(id)) {
      setSelectedQuestionIds(selectedQuestionIds.filter(i => i !== id));
    } else {
      setSelectedQuestionIds([...selectedQuestionIds, id]);
    }
  };

  const handleBulkDelete = () => {
    if (selectedQuestionIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedQuestionIds.length} selected questions?`)) return;

    selectedQuestionIds.forEach(id => onDeleteQuestion(id));
    setSelectedQuestionIds([]);
    onShowToast(`Deleted ${selectedQuestionIds.length} questions 🗑️`, "success");
  };

  const getDifficultyBadge = (diff: DifficultyLevel) => {
    switch (diff) {
      case DifficultyLevel.Easy:
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case DifficultyLevel.Medium:
        return "bg-amber-100 text-amber-800 border-amber-200";
      case DifficultyLevel.Hard:
      default:
        return "bg-rose-100 text-rose-800 border-rose-200";
    }
  };

  return (
    <div className="space-y-6" id="question-bank-main-view" dir="ltr">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 border border-slate-800">
        <div className="absolute top-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -ml-16 -mt-16"></div>

        <div className="relative z-10 space-y-3 text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold text-amber-300 border border-white/10">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            Centralized Question Bank Engine 📚
          </div>
          <h2 className="text-xl md:text-2xl font-black">Question Bank Repository</h2>
          <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
            Store, categorize, and tag assessment questions. Use these questions across Blueprints, Quizzes, and Homework assignments.
          </p>

          {/* Quick Stat Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <button
              onClick={() => { setSelectedDifficulty("all"); setSelectedPriority("all"); setSelectedTagFilter("all"); }}
              className={`px-3 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
                selectedDifficulty === "all" && selectedPriority === "all" && selectedTagFilter === "all"
                  ? "bg-amber-400 text-slate-950 border-amber-400 shadow-md scale-105"
                  : "bg-white/10 hover:bg-white/20 border-white/10 text-amber-300"
              }`}
            >
              Total Questions: {stats.total}
            </button>
            <button
              onClick={() => { setSelectedDifficulty(DifficultyLevel.Easy); setSelectedPriority("all"); }}
              className={`px-3 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
                selectedDifficulty === DifficultyLevel.Easy
                  ? "bg-emerald-500 text-white border-emerald-500 shadow-md scale-105"
                  : "bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/30 text-emerald-300"
              }`}
            >
              🟢 Easy: {stats.easyCount}
            </button>
            <button
              onClick={() => { setSelectedDifficulty(DifficultyLevel.Medium); setSelectedPriority("all"); }}
              className={`px-3 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
                selectedDifficulty === DifficultyLevel.Medium
                  ? "bg-amber-500 text-white border-amber-500 shadow-md scale-105"
                  : "bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30 text-amber-300"
              }`}
            >
              🟡 Medium: {stats.mediumCount}
            </button>
            <button
              onClick={() => { setSelectedDifficulty(DifficultyLevel.Hard); setSelectedPriority("all"); }}
              className={`px-3 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
                selectedDifficulty === DifficultyLevel.Hard
                  ? "bg-rose-500 text-white border-rose-500 shadow-md scale-105"
                  : "bg-rose-500/20 hover:bg-rose-500/30 border-rose-500/30 text-rose-300"
              }`}
            >
              🔴 Hard: {stats.hardCount}
            </button>
            <button
              onClick={() => { setSelectedPriority("priority"); setSelectedDifficulty("all"); }}
              className={`px-3 py-1.5 rounded-xl font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                selectedPriority === "priority"
                  ? "bg-amber-400 text-slate-950 border-amber-400 shadow-md scale-105"
                  : "bg-amber-400/20 hover:bg-amber-400/30 border-amber-400/30 text-amber-300"
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>Priority ⭐: {stats.priorityCount}</span>
            </button>
          </div>
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-2 shrink-0">
          <button
            onClick={() => setIsTagManagerOpen(true)}
            className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl border border-white/20 text-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <TagIcon className="w-4 h-4 text-amber-300" />
            Manage Tags
          </button>

          <button
            onClick={() => setIsBulkImportOpen(true)}
            className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl border border-white/20 text-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <Upload className="w-4 h-4 text-amber-300" />
            Bulk Import
          </button>

          <button
            onClick={handleAddNew}
            className="px-6 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2 text-xs cursor-pointer transform hover:-translate-y-0.5"
          >
            <Plus className="w-5 h-5" />
            Add New Question
          </button>
        </div>
      </div>

      {/* Filter Bar & View Toggle */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search text or lesson..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Filters Selectors */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none text-slate-700 cursor-pointer"
            >
              <option value="all">All Subjects</option>
              {Object.values(Subject).map((sub) => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>

            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none text-slate-700 cursor-pointer"
            >
              <option value="all">All Difficulties</option>
              <option value={DifficultyLevel.Easy}>🟢 Easy</option>
              <option value={DifficultyLevel.Medium}>🟡 Medium</option>
              <option value={DifficultyLevel.Hard}>🔴 Hard</option>
            </select>

            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none text-slate-700 cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value={QuestionType.MCQ}>MCQ</option>
              <option value={QuestionType.TrueFalse}>True / False</option>
              <option value={QuestionType.ShortAnswer}>Short Answer</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode("card")}
                className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  viewMode === "card" ? "bg-white shadow text-indigo-600 font-bold" : "text-slate-500"
                }`}
                title="Card Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  viewMode === "table" ? "bg-white shadow text-indigo-600 font-bold" : "text-slate-500"
                }`}
                title="Table View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Tag Filter Chips Bar */}
        {allBankTags.length > 0 && (
          <div className="flex items-center gap-1.5 pt-1 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] font-bold text-slate-400 shrink-0">Tags:</span>
            <button
              onClick={() => setSelectedTagFilter("all")}
              className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors cursor-pointer shrink-0 ${
                selectedTagFilter === "all"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              All Tags
            </button>
            {allBankTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTagFilter(selectedTagFilter === tag ? "all" : tag)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors cursor-pointer shrink-0 ${
                  selectedTagFilter.toLowerCase() === tag.toLowerCase()
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-indigo-50/80 border-indigo-100 text-indigo-800 hover:bg-indigo-100"
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* Bulk Action Bar */}
        {selectedQuestionIds.length > 0 && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-between text-xs font-bold text-indigo-950 animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="bg-indigo-600 text-white px-2.5 py-0.5 rounded-full text-[11px]">
                {selectedQuestionIds.length} Selected
              </span>
              <span>Bulk Actions Available</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Selected
              </button>
              <button
                onClick={() => setSelectedQuestionIds([])}
                className="px-3 py-1.5 bg-white border border-indigo-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs cursor-pointer"
              >
                Deselect All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Content View (Cards or Table) */}
      {filteredQuestions.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center space-y-4 shadow-sm">
          <HelpCircle className="w-12 h-12 text-slate-300 mx-auto" />
          <div className="space-y-1">
            <p className="text-slate-800 font-bold text-sm">No questions matching search or filters</p>
            <p className="text-slate-400 text-xs">Try clearing tag filters or click "Add New Question" to add items.</p>
          </div>
          <button
            onClick={handleAddNew}
            className="px-5 py-2.5 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Question
          </button>
        </div>
      ) : viewMode === "card" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredQuestions.map((q) => {
            const isSelected = selectedQuestionIds.includes(q.id);
            return (
              <div
                key={q.id}
                className={`bg-white rounded-3xl border p-5 space-y-3.5 shadow-sm hover:shadow-md transition-all relative flex flex-col justify-between ${
                  isSelected
                    ? "ring-2 ring-indigo-500 border-indigo-200"
                    : q.isPriority
                    ? "border-amber-300 bg-amber-50/20"
                    : "border-slate-100"
                }`}
              >
                <div className="space-y-3">
                  {/* Select Checkbox & Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleSelectQuestion(q.id)}
                        className="text-slate-400 hover:text-indigo-600 cursor-pointer"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600 fill-indigo-100" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>

                      {q.isPriority && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 flex items-center gap-1 shadow-sm">
                          <Star className="w-3 h-3 fill-slate-950" /> Priority ⭐
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {q.subject}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                        {q.lesson}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getDifficultyBadge(q.difficulty)}`}>
                        {q.difficulty}
                      </span>
                    </div>

                    <span className="text-[10px] font-bold text-slate-400">
                      {q.type}
                    </span>
                  </div>

                  {/* Question Text */}
                  <h4 className="text-xs md:text-sm font-bold text-slate-800 leading-relaxed text-left font-sans" dir="ltr">
                    {q.text}
                  </h4>

                  {/* Attached figure — click to check legibility before assigning it. */}
                  <QuestionImage
                    question={q}
                    onEnlarge={openLightbox}
                    maxHeightClass="max-h-40"
                    className="my-1"
                  />

                  {/* Clickable Tags */}
                  {q.tags && q.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {q.tags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => setSelectedTagFilter(selectedTagFilter === tag ? "all" : tag)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                            selectedTagFilter.toLowerCase() === tag.toLowerCase()
                              ? "bg-indigo-600 text-white"
                              : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                          }`}
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Options */}
                  <div className="space-y-1.5 pt-1" dir="ltr">
                    {q.options.map((opt, idx) => (
                      <div
                        key={idx}
                        className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between font-semibold text-left font-sans ${
                          idx === q.correctAnswerIndex
                            ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-bold"
                            : "bg-slate-50 border-slate-200 text-slate-700"
                        }`}
                      >
                        <span>{opt}</span>
                        {idx === q.correctAnswerIndex && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md shrink-0">
                            Correct ✓
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {q.explanation && (
                    <div className="bg-amber-50/60 p-2.5 rounded-xl border border-amber-100 text-[11px] text-amber-900 leading-relaxed text-left font-sans" dir="ltr">
                      <span className="font-bold">Explanation: </span>
                      {q.explanation}
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-2">
                  <span className="text-[10px] text-slate-400 font-medium">
                    {q.grade || "Grade 10"} • {q.createdBy || "Teacher"}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleDuplicate(q)}
                      className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-indigo-600 rounded-xl transition-colors cursor-pointer"
                      title="Duplicate Question"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => handleTogglePriority(q, e)}
                      className={`p-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                        q.isPriority
                          ? "bg-amber-400 text-slate-950 font-black"
                          : "bg-slate-100 hover:bg-amber-100 text-slate-500 hover:text-amber-700"
                      }`}
                      title={q.isPriority ? "Remove Priority" : "Mark Priority ⭐"}
                    >
                      <Star className={`w-3.5 h-3.5 ${q.isPriority ? "fill-slate-950" : ""}`} />
                    </button>

                    <button
                      onClick={() => handleEdit(q)}
                      className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>

                    <button
                      onClick={(e) => handleDeleteClick(q, e)}
                      className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
                      title="Delete Question"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="p-3 w-10 text-center">
                    <button onClick={handleSelectAll} className="cursor-pointer">
                      {selectedQuestionIds.length === filteredQuestions.length ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="p-3">Question Text</th>
                  <th className="p-3">Subject & Lesson</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Difficulty</th>
                  <th className="p-3">Tags</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                {filteredQuestions.map((q) => {
                  const isSelected = selectedQuestionIds.includes(q.id);
                  return (
                    <tr key={q.id} className={`hover:bg-slate-50/80 transition-colors ${isSelected ? "bg-indigo-50/40" : ""}`}>
                      <td className="p-3 text-center">
                        <button onClick={() => toggleSelectQuestion(q.id)} className="cursor-pointer">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                      </td>
                      <td className="p-3 max-w-xs md:max-w-md font-bold text-slate-800">
                        <div className="flex items-center gap-2.5">
                          {q.imageUrl && (
                            <img
                              src={q.imageUrl}
                              alt="Thumbnail"
                              className="w-9 h-9 object-cover rounded-lg border border-slate-200 shrink-0 shadow-sm"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <span className="line-clamp-2">{q.text}</span>
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap text-slate-600">
                        <div>{q.subject}</div>
                        <div className="text-[11px] text-slate-400">{q.lesson}</div>
                      </td>
                      <td className="p-3 whitespace-nowrap text-slate-600 font-bold">{q.type}</td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getDifficultyBadge(q.difficulty)}`}>
                          {q.difficulty}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {q.tags && q.tags.map(t => (
                            <span key={t} className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] rounded font-bold">
                              #{t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleDuplicate(q)} className="p-1 text-slate-400 hover:text-indigo-600" title="Duplicate">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleEdit(q)} className="p-1 text-slate-400 hover:text-indigo-600" title="Edit">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeletingQuestion(q)} className="p-1 text-slate-400 hover:text-rose-600" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingQuestion && (
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
                <div className="space-y-1.5 pt-0.5 flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-slate-800">Delete Question from Bank</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Are you sure you want to permanently delete this question from the Question Bank?
                  </p>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs font-semibold text-slate-700 max-h-24 overflow-y-auto italic line-clamp-3">
                    "{deletingQuestion.text}"
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeletingQuestion(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (deletingQuestion) {
                      onDeleteQuestion(deletingQuestion.id);
                      onShowToast("Question deleted from Question Bank 🗑️", "success");
                      setDeletingQuestion(null);
                    }
                  }}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Yes, Delete Question
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Question Form Modal */}
      <BankQuestionFormModal
        isOpen={isFormOpen}
        initialQuestion={editingQuestion}
        onClose={() => {
          setIsFormOpen(false);
          setEditingQuestion(null);
        }}
        onSave={(updatedQ) => {
          onSaveQuestion(updatedQ);
          onShowToast("Question saved in Question Bank successfully! ✨", "success");
        }}
      />

      {/* Tag Manager Modal */}
      <TagManagerModal
        isOpen={isTagManagerOpen}
        bankQuestions={questions}
        onClose={() => setIsTagManagerOpen(false)}
        onUpdateQuestions={(updatedList) => {
          if (onUpdateQuestions) {
            onUpdateQuestions(updatedList);
          } else {
            updatedList.forEach(q => onSaveQuestion(q));
          }
        }}
        onShowToast={onShowToast}
      />

      {/* Bulk Question Import Modal */}
      <BulkQuestionImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        existingQuestions={questions}
        onImportSuccess={(importedList) => {
          if (onUpdateQuestions) {
            onUpdateQuestions([...questions, ...importedList]);
          } else {
            importedList.forEach(q => onSaveQuestion(q));
          }
        }}
        onShowToast={onShowToast}
      />

      {/* Figure lightbox */}
      <AnimatePresence>
        {lightbox && (
          <QuestionImageLightbox
            url={lightbox.url}
            alt={lightbox.alt}
            onClose={() => setLightbox(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
