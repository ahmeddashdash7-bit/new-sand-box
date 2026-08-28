/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { X, Save, HelpCircle, Star, Tag as TagIcon, Clock, Check } from "lucide-react";
import { motion } from "motion/react";
import { BankQuestion, Subject, QuestionType, DifficultyLevel, QuestionStatus } from "../types";
import { normalizeTag, normalizeTags } from "../lib/tagUtils";
import { GRADE_OPTIONS, DEFAULT_GRADE, withLegacyValues } from "../lib/classification";
import QuestionImageUploader from "./QuestionImageUploader";

interface BankQuestionFormModalProps {
  isOpen: boolean;
  initialQuestion: BankQuestion | null;
  onClose: () => void;
  onSave: (question: BankQuestion) => void;
}

export default function BankQuestionFormModal({
  isOpen,
  initialQuestion,
  onClose,
  onSave
}: BankQuestionFormModalProps) {
  const [subject, setSubject] = useState<Subject>(Subject.IntegratedScience);
  const [grade, setGrade] = useState<string>(DEFAULT_GRADE);
  const [lesson, setLesson] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(DifficultyLevel.Medium);
  const [estimatedTimeMinutes, setEstimatedTimeMinutes] = useState<number>(2);
  const [status, setStatus] = useState<QuestionStatus>("active");
  const [isPriority, setIsPriority] = useState<boolean>(false);
  const [type, setType] = useState<QuestionType>(QuestionType.MCQ);
  const [text, setText] = useState<string>("");
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState<number>(0);
  const [explanation, setExplanation] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [imagePath, setImagePath] = useState<string | undefined>(undefined);
  const [imageProvider, setImageProvider] = useState<BankQuestion["imageProvider"]>(undefined);
  const [imageName, setImageName] = useState<string | undefined>(undefined);
  const [imageWidth, setImageWidth] = useState<number | undefined>(undefined);
  const [imageHeight, setImageHeight] = useState<number | undefined>(undefined);
  const [imageUploadedAt, setImageUploadedAt] = useState<number | undefined>(undefined);
  const [tagsInput, setTagsInput] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");

  /** Keeps a question saved under an older grade name selectable instead of silently rewritten. */
  const gradeOptions = useMemo(() => withLegacyValues(GRADE_OPTIONS, [grade]), [grade]);

  useEffect(() => {
    if (initialQuestion) {
      setSubject(initialQuestion.subject || Subject.IntegratedScience);
      setGrade(initialQuestion.grade || DEFAULT_GRADE);
      setLesson(initialQuestion.lesson || "");
      setTopic(initialQuestion.topic || "");
      setDifficulty(initialQuestion.difficulty || DifficultyLevel.Medium);
      setEstimatedTimeMinutes(initialQuestion.estimatedTimeMinutes || 2);
      setStatus(initialQuestion.status || "active");
      setIsPriority(!!initialQuestion.isPriority);
      setType(initialQuestion.type || QuestionType.MCQ);
      setText(initialQuestion.text || "");
      setOptions(initialQuestion.options?.length ? initialQuestion.options : ["", "", "", ""]);
      setCorrectAnswerIndex(initialQuestion.correctAnswerIndex ?? 0);
      setExplanation(initialQuestion.explanation || "");
      setImageUrl(initialQuestion.imageUrl);
      setImagePath(initialQuestion.imagePath);
      setImageProvider(initialQuestion.imageProvider);
      setImageName(initialQuestion.imageName);
      setImageWidth(initialQuestion.imageWidth);
      setImageHeight(initialQuestion.imageHeight);
      setImageUploadedAt(initialQuestion.imageUploadedAt);
      setTags(initialQuestion.tags || ["general"]);
      setTagsInput("");
    } else {
      setSubject(Subject.IntegratedScience);
      setGrade(DEFAULT_GRADE);
      setLesson("");
      setTopic("");
      setDifficulty(DifficultyLevel.Medium);
      setEstimatedTimeMinutes(2);
      setStatus("active");
      setIsPriority(false);
      setType(QuestionType.MCQ);
      setText("");
      setOptions(["", "", "", ""]);
      setCorrectAnswerIndex(0);
      setExplanation("");
      setImageUrl(undefined);
      setImagePath(undefined);
      setImageProvider(undefined);
      setImageName(undefined);
      setImageWidth(undefined);
      setImageHeight(undefined);
      setImageUploadedAt(undefined);
      setTags(["general"]);
      setTagsInput("");
    }
    setErrorMsg("");
  }, [initialQuestion, isOpen]);

  const handleTypeChange = (newType: QuestionType) => {
    setType(newType);
    if (newType === QuestionType.TrueFalse) {
      setOptions(["True", "False"]);
      setCorrectAnswerIndex(0);
    } else if (newType === QuestionType.ShortAnswer) {
      setOptions(["Short answer response text"]);
      setCorrectAnswerIndex(0);
    } else {
      setOptions(["", "", "", ""]);
      setCorrectAnswerIndex(0);
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    const updated = [...options];
    updated[index] = val;
    setOptions(updated);
  };

  const handleAddTag = () => {
    const clean = normalizeTag(tagsInput);
    if (clean && !tags.includes(clean)) {
      setTags(normalizeTags([...tags, clean]));
      setTagsInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!text.trim()) {
      setErrorMsg("Please enter the question text.");
      return;
    }

    if (type === QuestionType.MCQ) {
      for (let i = 0; i < options.length; i++) {
        if (!options[i].trim()) {
          setErrorMsg(`Option ${i + 1} cannot be empty.`);
          return;
        }
      }
    }

    const questionToSave: BankQuestion = {
      id: initialQuestion ? initialQuestion.id : "bq-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      subject,
      grade,
      lesson: lesson.trim() || "General Lesson",
      topic: topic.trim() || lesson.trim() || "General Topic",
      difficulty,
      estimatedTimeMinutes: Number(estimatedTimeMinutes) || 2,
      tags: normalizeTags(tags).length > 0 ? normalizeTags(tags) : ["general"],
      status,
      isPriority,
      type,
      text: text.trim(),
      options: type === QuestionType.ShortAnswer ? [options[0] || ""] : options.map(o => o.trim()),
      correctAnswerIndex,
      explanation: explanation.trim(),
      // "" (not undefined) is the explicit "no image / image removed" signal. The Firestore
      // writer treats undefined as "leave the stored image alone", so sending undefined here
      // would make image removal silently fail to persist.
      imageUrl: imageUrl || "",
      imagePath: imagePath || "",
      imageProvider: imageUrl ? imageProvider : undefined,
      imageName: imageName || undefined,
      imageWidth: imageWidth || undefined,
      imageHeight: imageHeight || undefined,
      imageUploadedAt: imageUploadedAt || undefined,
      createdBy: initialQuestion?.createdBy || "Science Teacher",
      createdAt: initialQuestion?.createdAt || Date.now()
    };

    onSave(questionToSave);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" dir="ltr">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl p-6 md:p-8 max-w-2xl w-full space-y-5 shadow-2xl border border-slate-100 text-left my-8"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                {initialQuestion ? "Edit Question in Bank" : "Add Question to Question Bank"}
              </h3>
              <p className="text-xs text-slate-500">Categorize by subject, grade, lesson, topic, and tags</p>
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
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-bold flex items-center gap-2">
            ⚠️ <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Subject, Grade, Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Subject</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value as Subject)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 cursor-pointer"
              >
                {Object.values(Subject).map((sub) => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Grade / Level</label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 cursor-pointer"
              >
                {gradeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
                <option value="General">General / All Grades</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as QuestionStatus)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 cursor-pointer"
              >
                <option value="active">Active ✅</option>
                <option value="draft">Draft 📝</option>
                <option value="archived">Archived 📦</option>
              </select>
            </div>
          </div>

          {/* Lesson & Topic */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Lesson</label>
              <input
                type="text"
                value={lesson}
                onChange={(e) => setLesson(e.target.value)}
                placeholder="e.g. Thermochemistry"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Topic / Concept</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Heat Capacity & Enthalpy"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          {/* Difficulty, Question Type, Est. Time */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 cursor-pointer"
              >
                <option value={DifficultyLevel.Easy}>🟢 Easy</option>
                <option value={DifficultyLevel.Medium}>🟡 Medium</option>
                <option value={DifficultyLevel.Hard}>🔴 Hard</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Question Type</label>
              <select
                value={type}
                onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 cursor-pointer"
              >
                <option value={QuestionType.MCQ}>Multiple Choice (MCQ)</option>
                <option value={QuestionType.TrueFalse}>True / False (TF)</option>
                <option value={QuestionType.ShortAnswer}>Short Answer</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Est. Time (Mins)</label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={estimatedTimeMinutes}
                  onChange={(e) => setEstimatedTimeMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
                <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>
          </div>

          {/* Tags Input & Chips */}
          <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <label className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
              <TagIcon className="w-3.5 h-3.5 text-indigo-600" /> Question Tags (Unlimited)
            </label>

            <div className="flex gap-2">
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Type tag (e.g., thermochemistry, genetics, reaction rate) and press Enter"
                className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                + Add Tag
              </button>
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200"
                  >
                    #{t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="hover:text-rose-600 transition-colors ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Question Text */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">Question Text</label>
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type the question prompt clearly..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 leading-relaxed font-sans"
              dir="ltr"
            />
          </div>

          {/* Question Image Attachment */}
          <QuestionImageUploader
            questionId={initialQuestion?.id}
            imageUrl={imageUrl}
            imagePath={imagePath}
            imageProvider={imageProvider}
            imageName={imageName}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            onChangeImage={(url, metadata) => {
              setImageUrl(url);
              setImagePath(metadata?.imagePath);
              setImageProvider(metadata?.imageProvider);
              setImageName(metadata?.imageName);
              setImageWidth(metadata?.imageWidth);
              setImageHeight(metadata?.imageHeight);
              setImageUploadedAt(metadata?.imageUploadedAt);
            }}
          />

          {/* Options & Correct Answer */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              {type === QuestionType.ShortAnswer ? "Expected Key / Sample Answer" : "Answer Options & Correct Choice"}
            </label>

            {type === QuestionType.ShortAnswer ? (
              <input
                type="text"
                value={options[0] || ""}
                onChange={(e) => handleOptionChange(0, e.target.value)}
                placeholder="Enter sample model answer or key phrases..."
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            ) : type === QuestionType.TrueFalse ? (
              <div className="grid grid-cols-2 gap-3" dir="ltr">
                {options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCorrectAnswerIndex(idx)}
                    className={`p-2.5 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                      correctAnswerIndex === idx
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-md"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {opt}
                    {correctAnswerIndex === idx && (
                      <span className="inline-flex items-center gap-1 ml-1">
                        (Correct <Check className="w-3 h-3" />)
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2" dir="ltr">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCorrectAnswerIndex(idx)}
                      className={`w-7 h-7 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                        correctAnswerIndex === idx
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                      }`}
                      title="Set as correct answer"
                    >
                      {correctAnswerIndex === idx ? <Check className="w-4 h-4" /> : idx + 1}
                    </button>

                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Option ${idx + 1}...`}
                      className={`w-full px-3.5 py-2 bg-slate-50 border rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 font-sans ${
                        correctAnswerIndex === idx ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200"
                      }`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Explanation */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">
              Scientific Explanation / Solution Feedback
            </label>
            <input
              type="text"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Explain why this answer is correct..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 font-sans"
              dir="ltr"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsPriority(!isPriority)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                isPriority
                  ? "bg-amber-400 text-slate-950 border-amber-400 shadow-sm"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${isPriority ? "fill-slate-950" : ""}`} />
              {isPriority ? "Priority ⭐" : "Mark Priority"}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" /> Save Question
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

