/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { X, Calendar, Clock, BookOpen, Users, Check, FileText, Send } from "lucide-react";
import { motion } from "motion/react";
import { HomeworkBlueprint, Quiz, Subject, BankQuestion, QuestionType, StudentGroup, DifficultyLevel } from "../types";
import { generateAssessmentCode } from "../lib/codeGenerator";
import { selectBlueprintQuestions, analyzeBlueprintPool } from "../lib/blueprintSelection";
import { pickQuestionImageFields } from "../lib/firebase";
import { GRADE_OPTIONS, DEFAULT_GRADE, resolveGroupOptions, withLegacyValues } from "../lib/classification";

interface QuizHomeworkAssignmentModalProps {
  isOpen: boolean;
  type: "quiz" | "homework";
  initialBlueprint: HomeworkBlueprint | null;
  blueprints: HomeworkBlueprint[];
  bankQuestions: BankQuestion[];
  /** The teacher's class groups, offered as "Assign To" labels. */
  groups: StudentGroup[];
  onClose: () => void;
  onAssign: (newQuiz: Quiz) => void;
}

export default function QuizHomeworkAssignmentModal({
  isOpen,
  type,
  initialBlueprint,
  blueprints,
  bankQuestions,
  groups,
  onClose,
  onAssign
}: QuizHomeworkAssignmentModalProps) {
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [assignTo, setAssignTo] = useState<string>(`${DEFAULT_GRADE} - All Students`);
  const [startDate, setStartDate] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [visibility, setVisibility] = useState<"published" | "draft" | "scheduled">("published");
  const [notes, setNotes] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  /**
   * "Assign To" is a descriptive label, not a query — it always was. The list is now derived from
   * the shared grade/group vocabularies, with the current value appended so a label carried over
   * from a blueprint (or written before this list changed) stays selected.
   */
  const assignToOptions = useMemo(
    () => withLegacyValues(
      [
        ...GRADE_OPTIONS.map((g) => `${g} - All Students`),
        // The teacher's own groups. Passing [] as the student list is right here: this picker
        // labels an assessment, so it should offer the current vocabulary, not names kept alive
        // only because some student still holds them.
        ...resolveGroupOptions(groups, [])
      ],
      [assignTo]
    ),
    [groups, assignTo]
  );

  useEffect(() => {
    const activeBp = initialBlueprint || (blueprints.length > 0 ? blueprints[0] : null);
    if (activeBp) {
      setSelectedBlueprintId(activeBp.id);
      setTitle(`${type === "quiz" ? "Quiz" : "Homework"}: ${activeBp.title}`);
      setAssignTo(`${activeBp.grade || DEFAULT_GRADE} - All Students`);
    } else {
      setSelectedBlueprintId("");
      setTitle(`${type === "quiz" ? "Interactive Quiz" : "Homework Assignment"}`);
      setAssignTo(`${DEFAULT_GRADE} - All Students`);
    }

    // Default dates
    const now = new Date();
    setStartDate(now.toISOString().slice(0, 16));
    const due = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    setDueDate(due.toISOString().slice(0, 16));
    setVisibility("published");
    setNotes("");
    setErrorMsg("");
  }, [initialBlueprint, isOpen, type, blueprints]);

  const activeBlueprint = blueprints.find(b => b.id === selectedBlueprintId) || initialBlueprint;

  /**
   * What this blueprint can actually draw from the bank right now.
   *
   * This is the SAME call selectBlueprintQuestions makes on submit, so the count shown here
   * and the pool the generator uses cannot disagree — the generator re-runs it rather than
   * trusting this value, which also catches a bank that changed while the modal was open.
   */
  const poolAnalysis = useMemo(
    () => (activeBlueprint ? analyzeBlueprintPool(activeBlueprint, bankQuestions) : null),
    [activeBlueprint, bankQuestions]
  );

  const handleBlueprintChange = (id: string) => {
    setSelectedBlueprintId(id);
    const bp = blueprints.find(b => b.id === id);
    if (bp) {
      setTitle(`${type === "quiz" ? "Quiz" : "Homework"}: ${bp.title}`);
      setAssignTo(`${bp.grade || DEFAULT_GRADE} - All Students`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Please enter an assessment title.");
      return;
    }

    if (!activeBlueprint) {
      setErrorMsg("Please select a valid Blueprint.");
      return;
    }

    /**
     * SAMPLING, not presentation order.
     *
     * selectBlueprintQuestions decides WHICH questions the assessment contains: it filters the
     * bank by every blueprint filter, converts the difficulty percentages into exact integer
     * quotas, and draws each quota from its own difficulty bucket. Randomness lives strictly
     * inside a bucket, so two assessments from one blueprint hold different questions but the
     * same difficulty counts. The resulting sequence becomes the assessment's canonical order,
     * which the teacher can edit and which every report is expressed in.
     *
     * It is NOT what varies the order between students — it cannot be, because it runs once here
     * and produces a single assessment document that everyone then receives. (Believing otherwise
     * is exactly why randomization appeared broken.) Per-student ordering is generated per attempt
     * from shareSettings.shuffleQuestions / shuffleOptions below — see lib/attemptPaper.ts.
     *
     * A blueprint the bank cannot satisfy is refused here rather than quietly filled from
     * elsewhere: the old fallback substituted arbitrary unfiltered bank questions whenever the
     * filters matched nothing, which is how off-blueprint questions reached students.
     */
    const selection = selectBlueprintQuestions(activeBlueprint, bankQuestions);
    if (!selection.ok) {
      setErrorMsg(selection.error);
      return;
    }
    const finalQuestions = selection.questions;

    const generatedCode = generateAssessmentCode(6);

    const newQuiz: Quiz = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: title.trim(),
      type,
      blueprintId: activeBlueprint.id,
      blueprintTitle: activeBlueprint.title,
      subject: activeBlueprint.subject,
      grade: activeBlueprint.grade || DEFAULT_GRADE,
      assignTo,
      startDate,
      dueDate,
      visibility,
      notes: notes.trim(),
      assessmentCode: generatedCode,
      shareSettings: {
        joinCode: generatedCode,
        assessmentCode: generatedCode,
        publicLinkEnabled: true,
        timeLimitMinutes: activeBlueprint.timeLimitMinutes || 0,
        shuffleQuestions: activeBlueprint.randomizeQuestionOrder || false,
        shuffleOptions: activeBlueprint.randomizeAnswerChoices || false,
        maxAttempts: 1,
        requireStudentName: true,
        requireGradeClass: true
      },
      questions: finalQuestions.map(q => ({
        id: q.id,
        type: q.type || QuestionType.MCQ,
        text: q.text,
        options: q.options,
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation,
        subject: q.subject,
        lesson: q.lesson,
        difficulty: q.difficulty,
        // Blueprint-generated quizzes/homework reuse the bank question id, so dropping the image
        // fields here did not just hide the figure — the subsequent merge-write blanked it on the
        // bank question too. Carrying the reference keeps both intact.
        ...pickQuestionImageFields(q)
      })),
      teacherName: activeBlueprint.teacherName || "Science Teacher",
      teacherWhatsApp: "01000000000",
      status: "active",
      createdAt: Date.now()
    };

    onAssign(newQuiz);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" dir="ltr">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl p-6 md:p-8 max-w-xl w-full space-y-5 shadow-2xl border border-slate-100 text-left my-8"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${type === "quiz" ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"}`}>
              {type === "quiz" ? <BookOpen className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Create {type === "quiz" ? "Quiz" : "Homework"} from Blueprint
              </h3>
              <p className="text-xs text-slate-500">Configure student assignment settings and schedule</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-bold flex items-start gap-2">
            {/* whitespace-pre-line keeps the per-difficulty shortage breakdown readable. */}
            <span aria-hidden="true">⚠️</span> <span className="whitespace-pre-line">{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Select Blueprint */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">Source Blueprint *</label>
            <select
              value={selectedBlueprintId}
              onChange={(e) => handleBlueprintChange(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 cursor-pointer"
            >
              {blueprints.length === 0 ? (
                <option value="">No Blueprints available (Create one first)</option>
              ) : (
                blueprints.map(bp => (
                  <option key={bp.id} value={bp.id}>
                    {bp.title} ({bp.subject} • {bp.grade})
                  </option>
                ))
              )}
            </select>
          </div>

          {/*
            Eligible pool panel. Values come from analyzeBlueprintPool — the same call the
            generator makes — so this is a preview of the real outcome, not an estimate.
          */}
          {poolAnalysis && (
            <div
              className={`p-3.5 rounded-2xl border space-y-2.5 ${
                poolAnalysis.error
                  ? "bg-rose-50 border-rose-200"
                  : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700">
                  Matching questions
                </span>
                <span
                  className={`text-sm font-black tabular-nums ${
                    poolAnalysis.error ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  {poolAnalysis.eligibleCount}
                </span>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Questions in the bank matching this Blueprint's filters
                {" "}({poolAnalysis.filters.subject}
                {poolAnalysis.filters.grade ? ` • ${poolAnalysis.filters.grade}` : ""}
                {poolAnalysis.filters.tags && poolAnalysis.filters.tags.length > 0
                  ? ` • ${poolAnalysis.filters.tags.join(", ")}`
                  : ""}
                ). This Blueprint needs {poolAnalysis.total}.
              </p>

              {/* Required vs available, per difficulty. */}
              {poolAnalysis.quotas && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { level: DifficultyLevel.Easy, label: "🟢 Easy" },
                    { level: DifficultyLevel.Medium, label: "🟡 Medium" },
                    { level: DifficultyLevel.Hard, label: "🔴 Hard" }
                  ].map(({ level, label }) => {
                    const required = poolAnalysis.quotas![level];
                    const available = poolAnalysis.availableByDifficulty[level];
                    const short = required > available;
                    return (
                      <div
                        key={level}
                        className={`px-2 py-1.5 rounded-xl border text-center ${
                          short ? "bg-rose-100 border-rose-300" : "bg-white border-slate-200"
                        }`}
                      >
                        <div className="text-[10px] font-bold text-slate-600">{label}</div>
                        <div
                          className={`text-[11px] font-black tabular-nums ${
                            short ? "text-rose-700" : "text-slate-800"
                          }`}
                        >
                          {required} / {available}
                        </div>
                        <div className="text-[9px] text-slate-400 font-semibold">need / have</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {poolAnalysis.error && (
                <p className="text-[11px] font-bold text-rose-800 whitespace-pre-line pt-0.5">
                  {poolAnalysis.error}
                </p>
              )}
            </div>
          )}

          {/* Title */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">Assessment Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Unit 1 Thermochemistry Homework #1"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Assign To & Visibility */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Assign To (Grade / Group)</label>
              <select
                value={assignTo}
                onChange={(e) => setAssignTo(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 cursor-pointer"
              >
                {assignToOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Visibility Status</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 cursor-pointer"
              >
                <option value="published">Published Immediately 🚀</option>
                <option value="scheduled">Scheduled for Start Date 📅</option>
                <option value="draft">Save as Draft 📝</option>
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Start Date & Time</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Due Date & Time</label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          {/* Teacher Notes */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">Teacher Instructions / Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Please complete before Friday's lab session..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {/*
              Blocked up front when the pool cannot satisfy the Blueprint. This is a
              convenience, not the guarantee: handleSubmit re-runs the selection and refuses
              on its own, so nothing depends on this button being disabled.
            */}
            <button
              type="submit"
              disabled={Boolean(poolAnalysis?.error)}
              title={poolAnalysis?.error ? "This Blueprint cannot be generated from the current Question Bank." : undefined}
              className={`px-5 py-2.5 font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-1.5 text-white ${
                poolAnalysis?.error
                  ? "bg-slate-300 cursor-not-allowed"
                  : type === "quiz"
                    ? "bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
                    : "bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
              }`}
            >
              <Send className="w-4 h-4" /> Assign {type === "quiz" ? "Quiz" : "Homework"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
