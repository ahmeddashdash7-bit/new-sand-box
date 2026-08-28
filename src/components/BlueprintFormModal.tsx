/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { X, Sliders, Check, ArrowRight, ArrowLeft, Save, Sparkles, Filter, Layers, Settings, FileCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { HomeworkBlueprint, Subject, QuestionType, DifficultyLevel, BankQuestion } from "../types";
import { normalizeTag, normalizeTags } from "../lib/tagUtils";
import { matchesBlueprintFilters, computeDifficultyQuotas } from "../lib/blueprintSelection";
import { GRADE_OPTIONS, DEFAULT_GRADE, withLegacyValues } from "../lib/classification";

interface BlueprintFormModalProps {
  isOpen: boolean;
  initialBlueprint: HomeworkBlueprint | null;
  bankQuestions?: BankQuestion[];
  onClose: () => void;
  onSave: (blueprint: HomeworkBlueprint) => void;
}

export default function BlueprintFormModal({
  isOpen,
  initialBlueprint,
  bankQuestions = [],
  onClose,
  onSave
}: BlueprintFormModalProps) {
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Step 1: Basic Info
  const [title, setTitle] = useState<string>("");
  const [subject, setSubject] = useState<Subject>(Subject.Chemistry);
  const [grade, setGrade] = useState<string>(DEFAULT_GRADE);
  const [description, setDescription] = useState<string>("");

  // Step 2: Filters
  const [lesson, setLesson] = useState<string>("");
  const [topicsInput, setTopicsInput] = useState<string>("");
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allowedQuestionTypes, setAllowedQuestionTypes] = useState<QuestionType[]>([
    QuestionType.MCQ,
    QuestionType.TrueFalse
  ]);

  // Step 3: Question Mix & Difficulty
  const [mcqCount, setMcqCount] = useState<number>(10);
  const [trueFalseCount, setTrueFalseCount] = useState<number>(5);
  const [shortAnswerCount, setShortAnswerCount] = useState<number>(0);
  const [easyPct, setEasyPct] = useState<number>(40);
  const [mediumPct, setMediumPct] = useState<number>(40);
  const [hardPct, setHardPct] = useState<number>(20);

  // Step 4: Assessment Settings
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(20);
  const [randomizeQuestionOrder, setRandomizeQuestionOrder] = useState<boolean>(true);
  const [randomizeAnswerChoices, setRandomizeAnswerChoices] = useState<boolean>(true);
  const [allowBacktracking, setAllowBacktracking] = useState<boolean>(true);
  const [passingScorePct, setPassingScorePct] = useState<number>(60);
  const [maxAttempts, setMaxAttempts] = useState<number>(2);

  const [errorMsg, setErrorMsg] = useState<string>("");

  /** Keeps a blueprint saved under an older grade name selectable instead of silently rewritten. */
  const gradeOptions = useMemo(() => withLegacyValues(GRADE_OPTIONS, [grade]), [grade]);

  // Available tags in Question Bank
  const availableTags = useMemo(() => {
    const raw: string[] = [];
    bankQuestions.forEach(q => {
      if (q.tags && Array.isArray(q.tags)) raw.push(...q.tags);
    });
    return normalizeTags(raw);
  }, [bankQuestions]);

  /**
   * Live Matching Questions Counter.
   *
   * Runs the same predicate the generator runs (lib/blueprintSelection.ts) so this number
   * is a promise the generator can keep. It used to be a separate copy of the filter, and
   * the two had already drifted — this one applied the question-type filter and the
   * generator did not.
   */
  const matchingQuestionsCount = useMemo(
    () =>
      bankQuestions.filter((q) =>
        matchesBlueprintFilters(q, {
          subject,
          grade,
          lesson: lesson.trim(),
          tags: selectedTags,
          allowedQuestionTypes
        })
      ).length,
    [bankQuestions, subject, grade, lesson, selectedTags, allowedQuestionTypes]
  );

  useEffect(() => {
    if (initialBlueprint) {
      setTitle(initialBlueprint.title);
      setSubject(initialBlueprint.subject);
      setGrade(initialBlueprint.grade || DEFAULT_GRADE);
      setDescription(initialBlueprint.description || "");
      setLesson(initialBlueprint.lesson || "");
      setTopics(initialBlueprint.topics || []);
      setSelectedTags(initialBlueprint.tags || []);
      setAllowedQuestionTypes(initialBlueprint.allowedQuestionTypes || [QuestionType.MCQ, QuestionType.TrueFalse]);
      
      const mix = initialBlueprint.questionMix || {
        mcqCount: Math.ceil((initialBlueprint.totalQuestions || 10) * 0.6),
        trueFalseCount: Math.floor((initialBlueprint.totalQuestions || 10) * 0.4),
        shortAnswerCount: 0
      };
      setMcqCount(mix.mcqCount);
      setTrueFalseCount(mix.trueFalseCount);
      setShortAnswerCount(mix.shortAnswerCount);

      const diff = initialBlueprint.difficultyDistribution || {};
      setEasyPct(diff.easyPct ?? 40);
      setMediumPct(diff.mediumPct ?? 40);
      setHardPct(diff.hardPct ?? 20);

      setTimeLimitMinutes(initialBlueprint.timeLimitMinutes || 20);
      setRandomizeQuestionOrder(initialBlueprint.randomizeQuestionOrder ?? true);
      setRandomizeAnswerChoices(initialBlueprint.randomizeAnswerChoices ?? true);
      setAllowBacktracking(initialBlueprint.allowBacktracking ?? true);
      setPassingScorePct(initialBlueprint.passingScorePct ?? 60);
      setMaxAttempts(initialBlueprint.maxAttempts ?? 2);
    } else {
      setTitle("");
      setSubject(Subject.Chemistry);
      setGrade(DEFAULT_GRADE);
      setDescription("");
      setLesson("");
      setTopics([]);
      setSelectedTags([]);
      setAllowedQuestionTypes([QuestionType.MCQ, QuestionType.TrueFalse]);
      setMcqCount(10);
      setTrueFalseCount(5);
      setShortAnswerCount(0);
      setEasyPct(40);
      setMediumPct(40);
      setHardPct(20);
      setTimeLimitMinutes(20);
      setRandomizeQuestionOrder(true);
      setRandomizeAnswerChoices(true);
      setAllowBacktracking(true);
      setPassingScorePct(60);
      setMaxAttempts(2);
    }
    setCurrentStep(1);
    setErrorMsg("");
  }, [initialBlueprint, isOpen]);

  const totalQuestionsRequested = mcqCount + trueFalseCount + shortAnswerCount;

  /**
   * The exact per-difficulty question counts this blueprint will generate. Shown beside the
   * sliders so the preview is the real quota rather than an independently rounded estimate
   * that could sum to more or fewer than the requested total.
   */
  const previewQuotas = useMemo(
    () =>
      computeDifficultyQuotas(totalQuestionsRequested, { easyPct, mediumPct, hardPct }) || {
        [DifficultyLevel.Easy]: 0,
        [DifficultyLevel.Medium]: 0,
        [DifficultyLevel.Hard]: 0
      },
    [totalQuestionsRequested, easyPct, mediumPct, hardPct]
  );

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const toggleQuestionType = (qType: QuestionType) => {
    if (allowedQuestionTypes.includes(qType)) {
      if (allowedQuestionTypes.length > 1) {
        setAllowedQuestionTypes(allowedQuestionTypes.filter(t => t !== qType));
      }
    } else {
      setAllowedQuestionTypes([...allowedQuestionTypes, qType]);
    }
  };

  const handleNextStep = () => {
    setErrorMsg("");
    if (currentStep === 1) {
      if (!title.trim()) {
        setErrorMsg("Please enter a Blueprint Name.");
        return;
      }
    }
    if (currentStep === 3) {
      if (totalQuestionsRequested <= 0) {
        setErrorMsg("Please request at least 1 question in the Question Mix.");
        return;
      }
    }
    setCurrentStep(prev => Math.min(5, prev + 1));
  };

  const handlePrevStep = () => {
    setErrorMsg("");
    setCurrentStep(prev => Math.max(1, prev - 1));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Please enter a Blueprint Name.");
      return;
    }

    const blueprintToSave: HomeworkBlueprint = {
      id: initialBlueprint ? initialBlueprint.id : "bp-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      title: title.trim(),
      subject,
      grade,
      description: description.trim(),
      lesson: lesson.trim() || "General Unit",
      topics: topics.length > 0 ? topics : [lesson.trim() || "General Unit"],
      tags: selectedTags,
      totalQuestions: totalQuestionsRequested,
      questionMix: {
        mcqCount,
        trueFalseCount,
        shortAnswerCount
      },
      difficultyDistribution: {
        easyPct,
        mediumPct,
        hardPct,
        // Derived from the percentages through the same apportionment the generator uses, so
        // the counts stored on the blueprint are the counts an assessment will actually have.
        // Three independent Math.round calls did not agree with each other: at 7 questions and
        // 33/33/34 they summed to 6.
        ...(() => {
          const quotas = computeDifficultyQuotas(totalQuestionsRequested, {
            easyPct,
            mediumPct,
            hardPct
          }) || { [DifficultyLevel.Easy]: 0, [DifficultyLevel.Medium]: 0, [DifficultyLevel.Hard]: 0 };
          return {
            easyCount: quotas[DifficultyLevel.Easy],
            mediumCount: quotas[DifficultyLevel.Medium],
            hardCount: quotas[DifficultyLevel.Hard]
          };
        })()
      },
      allowedQuestionTypes,
      timeLimitMinutes,
      randomizeQuestionOrder,
      randomizeAnswerChoices,
      allowBacktracking,
      passingScorePct,
      maxAttempts,
      status: initialBlueprint?.status || "active",
      teacherName: initialBlueprint?.teacherName || "Science Teacher",
      createdAt: initialBlueprint?.createdAt || Date.now()
    };

    onSave(blueprintToSave);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" dir="ltr">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl p-6 md:p-8 max-w-3xl w-full space-y-6 shadow-2xl border border-slate-100 text-left my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                {initialBlueprint ? "Edit Homework Blueprint" : "Blueprint Builder Wizard"}
              </h3>
              <p className="text-xs text-slate-500">Define criteria to automatically select assessment questions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Steps Indicator */}
        <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
          {[
            { step: 1, label: "Basic Info", icon: Sliders },
            { step: 2, label: "Filters", icon: Filter },
            { step: 3, label: "Question Mix", icon: Layers },
            { step: 4, label: "Settings", icon: Settings },
            { step: 5, label: "Review", icon: FileCheck }
          ].map(({ step, label, icon: Icon }) => (
            <div key={step} className="flex items-center gap-1.5 flex-1 justify-center">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold transition-all ${
                  currentStep === step
                    ? "bg-indigo-600 text-white shadow-md scale-105"
                    : currentStep > step
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {currentStep > step ? <Check className="w-4 h-4" /> : step}
              </div>
              <span className={`text-[11px] font-bold hidden md:inline ${currentStep === step ? "text-indigo-900" : "text-slate-500"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-bold flex items-center gap-2">
            ⚠️ <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* STEP 1: Basic Information */}
          {currentStep === 1 && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 text-xs text-indigo-900 font-medium">
                Step 1: Set the title, target subject, grade level, and description for this Blueprint.
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">Blueprint Name *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Thermochemistry & Reaction Dynamics Blueprint"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">Subject *</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value as Subject)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 cursor-pointer"
                  >
                    {Object.values(Subject).map((sub) => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">Grade / Level *</label>
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 cursor-pointer"
                  >
                    {gradeOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                    <option value="General">General / All Grades</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">Description / Objective (Optional)</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the assessment focus and target learning outcomes..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </motion.div>
          )}

          {/* STEP 2: Filters */}
          {currentStep === 2 && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 text-xs text-indigo-900 font-medium">
                Step 2: Choose which Lessons, Topics, Tags, and Question Types are eligible for this Blueprint.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">Target Lesson</label>
                  <input
                    type="text"
                    value={lesson}
                    onChange={(e) => setLesson(e.target.value)}
                    placeholder="e.g. Thermochemistry"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">Allowed Question Types</label>
                  <div className="flex items-center gap-2 pt-1">
                    {[QuestionType.MCQ, QuestionType.TrueFalse, QuestionType.ShortAnswer].map((qType) => (
                      <button
                        key={qType}
                        type="button"
                        onClick={() => toggleQuestionType(qType)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          allowedQuestionTypes.includes(qType)
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {qType === QuestionType.MCQ ? "MCQ" : qType === QuestionType.TrueFalse ? "True / False" : "Short Answer"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tags Selector */}
              <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <label className="text-xs font-extrabold text-slate-800 block">Filter by Question Tags</label>
                <p className="text-[11px] text-slate-500">Click tags from Question Bank to restrict question selection:</p>
                <div className="flex flex-wrap gap-1.5 pt-1 max-h-32 overflow-y-auto">
                  {availableTags.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">No tags in Question Bank yet.</span>
                  ) : (
                    availableTags.map((tag) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                            isSelected
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"
                          }`}
                        >
                          #{tag} {isSelected ? "✓" : "+"}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Question Mix & Difficulty Distribution */}
          {currentStep === 3 && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              {/* LIVE COUNTER BANNER */}
              <div className="p-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-2xl shadow-md flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-medium text-indigo-100">Live Question Bank Match</div>
                  <div className="text-lg font-extrabold flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-300" />
                    <span>{matchingQuestionsCount} matching questions found</span>
                  </div>
                </div>
                <div className="text-xs bg-white/10 px-3 py-1.5 rounded-xl border border-white/20 font-bold">
                  Target: {totalQuestionsRequested} Questions
                </div>
              </div>

              {/* Question Mix Inputs */}
              <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <label className="text-xs font-extrabold text-slate-800 block">Question Type Quantities</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">MCQ Questions</label>
                    <input
                      type="number"
                      min={0}
                      value={mcqCount}
                      onChange={(e) => setMcqCount(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">True / False Questions</label>
                    <input
                      type="number"
                      min={0}
                      value={trueFalseCount}
                      onChange={(e) => setTrueFalseCount(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block">Short Answer Questions</label>
                    <input
                      type="number"
                      min={0}
                      value={shortAnswerCount}
                      onChange={(e) => setShortAnswerCount(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>
              </div>

              {/* Difficulty Distribution Sliders */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <label className="text-xs font-extrabold text-slate-800 block">Difficulty Distribution (%)</label>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                      <span>🟢 Easy Questions ({easyPct}%)</span>
                      <span>{previewQuotas[DifficultyLevel.Easy]} items</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={easyPct}
                      onChange={(e) => setEasyPct(parseInt(e.target.value))}
                      className="w-full accent-emerald-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                      <span>🟡 Medium Questions ({mediumPct}%)</span>
                      <span>{previewQuotas[DifficultyLevel.Medium]} items</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={mediumPct}
                      onChange={(e) => setMediumPct(parseInt(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                      <span>🔴 Hard Questions ({hardPct}%)</span>
                      <span>{previewQuotas[DifficultyLevel.Hard]} items</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={hardPct}
                      onChange={(e) => setHardPct(parseInt(e.target.value))}
                      className="w-full accent-rose-600"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 4: Assessment Settings */}
          {currentStep === 4 && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 text-xs text-indigo-900 font-medium">
                Step 4: Configure assessment rules, timing, backtracking, and attempt limits.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">Time Limit (Minutes)</label>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={timeLimitMinutes}
                    onChange={(e) => setTimeLimitMinutes(Math.max(5, parseInt(e.target.value) || 15))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">Passing Score (%)</label>
                  <input
                    type="number"
                    min={40}
                    max={100}
                    value={passingScorePct}
                    onChange={(e) => setPassingScorePct(parseInt(e.target.value) || 60)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={randomizeQuestionOrder}
                    onChange={(e) => setRandomizeQuestionOrder(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <div className="text-xs">
                    <div className="font-bold text-slate-800">Randomise Questions</div>
                    <div className="text-[11px] text-slate-500">Shuffle question sequence for every student</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={randomizeAnswerChoices}
                    onChange={(e) => setRandomizeAnswerChoices(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <div className="text-xs">
                    <div className="font-bold text-slate-800">Randomise Options</div>
                    <div className="text-[11px] text-slate-500">Shuffle answer choices per student</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowBacktracking}
                    onChange={(e) => setAllowBacktracking(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <div className="text-xs">
                    <div className="font-bold text-slate-800">Allow Backtracking</div>
                    <div className="text-[11px] text-slate-500">Students can return to previous questions</div>
                  </div>
                </label>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <div className="text-xs">
                    <div className="font-bold text-slate-800">Maximum Attempts</div>
                    <div className="text-[11px] text-slate-500">Number of allowed submission tries</div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-xl text-xs font-bold text-center"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 5: Review */}
          {currentStep === 5 && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold">
                Step 5: Blueprint Summary Review. Click "Save Blueprint" to store and generate assessments anytime!
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3 text-xs">
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Blueprint Title:</span>
                  <span className="font-extrabold text-slate-900">{title}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Subject & Grade:</span>
                  <span className="font-bold text-indigo-700">{subject} • {grade}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Lesson:</span>
                  <span className="font-semibold text-slate-800">{lesson || "All Lessons"}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Tags Filter:</span>
                  <span className="font-semibold text-indigo-800">
                    {selectedTags.length ? selectedTags.map(t => `#${t}`).join(", ") : "All Tags"}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Total Questions Requested:</span>
                  <span className="font-bold text-slate-900">{totalQuestionsRequested} ({mcqCount} MCQ, {trueFalseCount} TF, {shortAnswerCount} Short)</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Difficulty Distribution:</span>
                  <span className="font-semibold text-slate-800">{easyPct}% Easy / {mediumPct}% Med / {hardPct}% Hard</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Matching Bank Questions Available:</span>
                  <span className="font-extrabold text-emerald-600">{matchingQuestionsCount} questions in Question Bank</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handlePrevStep}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}

            {currentStep < 5 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" /> Save Blueprint
              </button>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
}
