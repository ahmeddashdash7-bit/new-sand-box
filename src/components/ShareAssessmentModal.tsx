/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { X, Copy, Check, Share2, Link as LinkIcon, Hash, Calendar, Lock, ShieldCheck, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";
import { Quiz, AssessmentShareSettings } from "../types";
import { encodeQuiz } from "../lib/encoder";
import { normalizeAssessmentCode } from "../lib/codeGenerator";

interface ShareAssessmentModalProps {
  isOpen: boolean;
  quiz: Quiz | null;
  onClose: () => void;
  onUpdateSettings?: (quizId: string, settings: AssessmentShareSettings) => void;
}

export default function ShareAssessmentModal({
  isOpen,
  quiz,
  onClose,
  onUpdateSettings
}: ShareAssessmentModalProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Settings state
  const [publicLinkEnabled, setPublicLinkEnabled] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [requireStudentName, setRequireStudentName] = useState(true);
  const [requireGradeClass, setRequireGradeClass] = useState(true);
  const [requireStudentId, setRequireStudentId] = useState(false);
  /**
   * Randomization, per assessment. These two flags were stored and mirrored to students all along
   * but had no control anywhere — the only way to set them was to pick a blueprint that happened
   * to have them on, and this dialog then dropped them from the object it saved, so opening Share
   * and pressing Save silently turned randomization off. They are editable here now, and the save
   * below preserves everything it does not manage.
   */
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);

  useEffect(() => {
    if (!quiz) return;

    const settings = quiz.shareSettings || {};
    setPublicLinkEnabled(settings.publicLinkEnabled ?? true);
    setStartDate(settings.startDate || quiz.startDate || "");
    setDueDate(settings.dueDate || quiz.dueDate || "");
    setMaxAttempts(settings.maxAttempts ?? 1);
    setRequireStudentName(settings.requireStudentName ?? true);
    setRequireGradeClass(settings.requireGradeClass ?? true);
    setRequireStudentId(settings.requireStudentId ?? false);
    setShuffleQuestions(settings.shuffleQuestions ?? false);
    setShuffleOptions(settings.shuffleOptions ?? false);
  }, [quiz, isOpen]);

  if (!isOpen || !quiz) return null;

  // Only ever show a code that was actually stored with the assessment, in canonical form.
  // This used to fall back to a code derived from the quiz id (or the literal "AB7XQ2"), which
  // displayed a code that no student could ever join with.
  const storedCode =
    normalizeAssessmentCode(quiz.shareSettings?.joinCode) ||
    normalizeAssessmentCode(quiz.shareSettings?.assessmentCode) ||
    normalizeAssessmentCode(quiz.assessmentCode);

  const joinCode = storedCode || "";
  const baseUrl = window.location.origin + window.location.pathname;
  const publicUrl = joinCode ? `${baseUrl}?code=${joinCode}` : "";

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(publicUrl);
      } else {
        const input = document.createElement("input");
        input.value = publicUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (e) {
      console.error("Failed to copy link:", e);
    }
  };

  const handleCopyCode = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(joinCode);
      } else {
        const input = document.createElement("input");
        input.value = joinCode;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch (e) {
      console.error("Failed to copy code:", e);
    }
  };

  const handleSaveSettings = () => {
    if (onUpdateSettings) {
      /**
       * Spread the stored settings first so anything this dialog does not manage survives the
       * save. The object used to be built from scratch, so every field absent from it was reset
       * to its default by the writer downstream — which is how saving share settings came to
       * silently disable question and choice randomization on an assessment.
       */
      onUpdateSettings(quiz.id, {
        ...(quiz.shareSettings || {}),
        publicLinkEnabled,
        joinCode,
        startDate,
        dueDate,
        maxAttempts,
        requireStudentName,
        requireGradeClass,
        requireStudentId,
        shuffleQuestions,
        shuffleOptions
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" dir="ltr">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full space-y-6 shadow-2xl border border-slate-100 text-left my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Share Assessment</h3>
              <p className="text-xs text-slate-500">{quiz.title} • {quiz.grade}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Public Share Links Box */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-4">
          {/* URL Row */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <LinkIcon className="w-4 h-4 text-indigo-600" />
              Public Assessment Link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={publicUrl}
                placeholder="Publish this assessment to generate a link"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-700 outline-none truncate"
              />
              <button
                type="button"
                disabled={!publicUrl}
                onClick={handleCopyLink}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                  copiedLink
                    ? "bg-emerald-600 text-white"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? "Copied!" : "Copy Link"}</span>
              </button>
            </div>
          </div>

          {/* Join Code Row */}
          <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-emerald-600" />
              Direct Join Code
            </label>
            <div className="flex items-center gap-2">
              <div className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-black font-mono tracking-widest text-slate-900">
                {joinCode || (
                  <span className="text-xs font-bold font-sans tracking-normal text-amber-700">
                    No join code yet — publish this assessment to generate one.
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={!joinCode}
                onClick={handleCopyCode}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                  copiedCode
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-800 hover:bg-slate-900 text-white"
                }`}
              >
                {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCode ? "Copied!" : "Copy Code"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Share Settings Configurator */}
        <div className="space-y-4 pt-2">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
            Share & Access Settings
          </h4>

          {/* Toggles */}
          <div className="space-y-3 bg-white border border-slate-100 p-4 rounded-2xl">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Public Link Enabled</span>
                <span className="text-[11px] text-slate-400">Allow students to open and submit via direct link</span>
              </div>
              <input
                type="checkbox"
                checked={publicLinkEnabled}
                onChange={(e) => setPublicLinkEnabled(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Maximum Attempts</span>
                <span className="text-[11px] text-slate-400">Number of submissions allowed per student</span>
              </div>
              <select
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(Number(e.target.value))}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
              >
                <option value={1}>1 Attempt</option>
                <option value={2}>2 Attempts</option>
                <option value={3}>3 Attempts</option>
                <option value={999}>Unlimited</option>
              </select>
            </div>

            {/*
              Randomization. Independent of one another: either can be on without the other.
              Applied per student attempt, so two students sitting this assessment get different
              arrangements while each student's own order stays fixed across refreshes.
            */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Randomize Question Order</span>
                <span className="text-[11px] text-slate-400">Each student gets their own question order</span>
              </div>
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Randomize Answer Choices</span>
                <span className="text-[11px] text-slate-400">Shuffles multiple-choice options per student</span>
              </div>
              <input
                type="checkbox"
                checked={shuffleOptions}
                onChange={(e) => setShuffleOptions(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Require Student Name</span>
                <span className="text-[11px] text-slate-400">Student must provide full name before starting</span>
              </div>
              <input
                type="checkbox"
                checked={requireStudentName}
                onChange={(e) => setRequireStudentName(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Require Grade / Class</span>
                <span className="text-[11px] text-slate-400">Student must select or enter class group</span>
              </div>
              <input
                type="checkbox"
                checked={requireGradeClass}
                onChange={(e) => setRequireGradeClass(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Require Student ID (Optional)</span>
                <span className="text-[11px] text-slate-400">Toggle if seat/ID number is mandatory</span>
              </div>
              <input
                type="checkbox"
                checked={requireStudentId}
                onChange={(e) => setRequireStudentId(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 cursor-pointer"
              />
            </div>
          </div>

          {/* Schedule Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Start Date</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Due Date</label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSaveSettings}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Save & Close</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
