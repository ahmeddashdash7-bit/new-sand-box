/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  X, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  FileCode, 
  HelpCircle, 
  Copy, 
  Sparkles, 
  ArrowRight, 
  RotateCcw, 
  ListChecks, 
  Check, 
  Layers, 
  Loader2,
  FileText
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { BankQuestion, Subject, QuestionType, DifficultyLevel } from "../types";
import { saveBankQuestionToFirestore } from "../lib/firebase";
import { DEFAULT_GRADE } from "../lib/classification";

interface BulkQuestionImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingQuestions: BankQuestion[];
  onImportSuccess: (importedQuestions: BankQuestion[]) => void;
  onShowToast: (msg: string, tone?: "success" | "error" | "info") => void;
}

type Step = "paste" | "preview" | "success";

interface ValidationReport {
  totalItemsParsed: number;
  mcqCount: number;
  trueFalseCount: number;
  duplicatesCount: number;
  errors: string[];
  validQuestions: BankQuestion[];
}

const SAMPLE_JSON_TEXT = JSON.stringify(
  [
    {
      "type": "mcq",
      "subject": "Chemistry",
      "grade": "1 Sec",
      "topic": "Atomic Structure",
      "difficulty": "Medium",
      "tags": ["chemistry", "atoms"],
      "question": "What is the subatomic particle with a negative electric charge?",
      "options": ["Proton", "Electron", "Neutron", "Positron"],
      "correctAnswer": 1,
      "explanation": "Electrons carry a negative fundamental electric charge and orbit the nucleus."
    },
    {
      "type": "true_false",
      "subject": "Physics",
      "grade": "2 Sec",
      "topic": "Thermodynamics",
      "difficulty": "Easy",
      "tags": ["physics", "thermodynamics"],
      "question": "Heat energy naturally flows from warmer objects to cooler objects.",
      "correctAnswer": true,
      "explanation": "The second law of thermodynamics governs spontaneous heat transfer."
    },
    {
      "type": "mcq",
      "subject": "Biology",
      "grade": "1 Sec",
      "topic": "Cell Biology",
      "difficulty": "Easy",
      "tags": ["biology", "cells"],
      "question": "Which organelle is known as the powerhouse of the cell?",
      "options": ["Nucleus", "Ribosome", "Mitochondria", "Golgi Apparatus"],
      "correctAnswer": 2,
      "explanation": "Mitochondria generate most of the chemical energy needed to power the cell."
    }
  ],
  null,
  2
);

export default function BulkQuestionImportModal({
  isOpen,
  onClose,
  existingQuestions,
  onImportSuccess,
  onShowToast
}: BulkQuestionImportModalProps) {
  const [step, setStep] = useState<Step>("paste");
  const [jsonText, setJsonText] = useState<string>("");
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  if (!isOpen) return null;

  // Reset state when closing or starting fresh
  const handleReset = () => {
    setStep("paste");
    setJsonText("");
    setReport(null);
    setIsSaving(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // Step 1 -> Validate JSON
  const handleValidate = () => {
    if (!jsonText.trim()) {
      onShowToast("Please paste JSON question content first.", "error");
      return;
    }

    let parsedData: any;
    try {
      parsedData = JSON.parse(jsonText.trim());
    } catch (err: any) {
      setReport({
        totalItemsParsed: 0,
        mcqCount: 0,
        trueFalseCount: 0,
        duplicatesCount: 0,
        errors: [`Syntax Error in JSON format: ${err.message}`],
        validQuestions: []
      });
      setStep("preview");
      return;
    }

    if (!Array.isArray(parsedData)) {
      setReport({
        totalItemsParsed: 0,
        mcqCount: 0,
        trueFalseCount: 0,
        duplicatesCount: 0,
        errors: ["JSON must contain an array of question objects e.g. [...]"],
        validQuestions: []
      });
      setStep("preview");
      return;
    }

    // Build lookup set for existing question text normalization
    const existingNormalizedSet = new Set<string>();
    existingQuestions.forEach(q => {
      if (q.text) {
        existingNormalizedSet.add(q.text.trim().toLowerCase());
      }
    });

    const batchNormalizedSet = new Set<string>();
    const validQuestions: BankQuestion[] = [];
    const errors: string[] = [];

    let mcqCount = 0;
    let trueFalseCount = 0;
    let duplicatesCount = 0;

    parsedData.forEach((item: any, idx: number) => {
      const qNum = idx + 1;

      if (!item || typeof item !== "object") {
        errors.push(`Question #${qNum}: Item is not a valid JSON object.`);
        return;
      }

      // 1. Validate Type
      const rawType = String(item.type || "").toLowerCase().trim();
      let questionType: QuestionType | null = null;
      if (rawType === "mcq") {
        questionType = QuestionType.MCQ;
      } else if (rawType === "true_false" || rawType === "tf" || rawType === "truefalse") {
        questionType = QuestionType.TrueFalse;
      } else {
        errors.push(`Question #${qNum}: Unsupported type "${item.type}". Type must be "mcq" or "true_false".`);
        return;
      }

      // 2. Validate Question Text
      const qText = typeof item.question === "string" ? item.question.trim() : typeof item.text === "string" ? item.text.trim() : "";
      if (!qText) {
        errors.push(`Question #${qNum}: Question text ("question") is required and cannot be empty.`);
        return;
      }

      // 3. Duplicate Detection & Text Normalization
      const normalizedText = qText.toLowerCase();
      if (existingNormalizedSet.has(normalizedText) || batchNormalizedSet.has(normalizedText)) {
        duplicatesCount++;
        errors.push(`Question #${qNum}: Duplicate question skipped ("${qText.substring(0, 45)}...")`);
        return;
      }

      // 4. Type-Specific Validation
      let options: string[] = [];
      let correctAnswerIndex = 0;

      if (questionType === QuestionType.MCQ) {
        // Must have exactly four options
        if (!Array.isArray(item.options) || item.options.length !== 4) {
          errors.push(`Question #${qNum}: MCQ questions must contain an "options" array with exactly four items.`);
          return;
        }

        const validOptions = item.options.map((o: any) => String(o || "").trim());
        if (validOptions.some((o: string) => !o)) {
          errors.push(`Question #${qNum}: MCQ options cannot be blank strings.`);
          return;
        }
        options = validOptions;

        // Correct Answer (0 to 3)
        const parsedIdx = typeof item.correctAnswer === "number" ? item.correctAnswer : parseInt(String(item.correctAnswer), 10);
        if (isNaN(parsedIdx) || parsedIdx < 0 || parsedIdx > 3) {
          errors.push(`Question #${qNum}: MCQ "correctAnswer" index must be an integer between 0 and 3.`);
          return;
        }
        correctAnswerIndex = parsedIdx;
      } else if (questionType === QuestionType.TrueFalse) {
        options = ["True", "False"];

        // Correct Answer (boolean true/false or "true"/"false" or 0/1)
        if (item.correctAnswer === true || item.correctAnswer === "true" || item.correctAnswer === "True" || item.correctAnswer === 0) {
          correctAnswerIndex = 0; // True
        } else if (item.correctAnswer === false || item.correctAnswer === "false" || item.correctAnswer === "False" || item.correctAnswer === 1) {
          correctAnswerIndex = 1; // False
        } else {
          errors.push(`Question #${qNum}: True/False "correctAnswer" must be a boolean (true or false).`);
          return;
        }
      }

      /**
       * 5. Subject Mapping
       *
       * ORDER MATTERS. "Science" and "Integrated Science" are two different subjects, and the
       * name of one contains the name of the other, so "integ" must be tested BEFORE "science" or
       * every Integrated Science row would import as plain Science.
       *
       * Note the behaviour change this encodes: a cell reading "Science" used to fall through to
       * Integrated Science, because that was the only science-like subject there was. It now maps
       * to Science, which is what a sheet saying "Science" means now that the subject exists.
       * "Integrated Science" (and anything containing "integ") is unaffected.
       */
      let subject = Subject.IntegratedScience;
      const rawSubj = String(item.subject || "").trim().toLowerCase();
      if (rawSubj.includes("chem")) subject = Subject.Chemistry;
      else if (rawSubj.includes("phys")) subject = Subject.Physics;
      else if (rawSubj.includes("bio")) subject = Subject.Biology;
      else if (rawSubj.includes("integ")) subject = Subject.IntegratedScience;
      else if (rawSubj.includes("science")) subject = Subject.Science;

      // 6. Difficulty Mapping
      let difficulty = DifficultyLevel.Medium;
      const rawDiff = String(item.difficulty || "").trim().toLowerCase();
      if (rawDiff.includes("easy")) difficulty = DifficultyLevel.Easy;
      else if (rawDiff.includes("hard")) difficulty = DifficultyLevel.Hard;

      // Add to valid items & track duplicate
      batchNormalizedSet.add(normalizedText);

      const mappedBankQuestion: BankQuestion = {
        id: "bq-imp-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7) + "-" + idx,
        type: questionType,
        text: qText,
        options,
        correctAnswerIndex,
        explanation: typeof item.explanation === "string" ? item.explanation.trim() : "",
        subject,
        grade: typeof item.grade === "string" && item.grade.trim() ? item.grade.trim() : DEFAULT_GRADE,
        lesson: typeof item.topic === "string" && item.topic.trim() ? item.topic.trim() : "General",
        topic: typeof item.topic === "string" && item.topic.trim() ? item.topic.trim() : "General",
        difficulty,
        estimatedTimeMinutes: 2,
        tags: Array.isArray(item.tags) 
          ? item.tags.map((t: any) => String(t).trim()).filter(Boolean)
          : [subject.toLowerCase()],
        status: "active",
        createdAt: Date.now(),
        createdBy: "Bulk Import"
      };

      if (questionType === QuestionType.MCQ) mcqCount++;
      else trueFalseCount++;

      validQuestions.push(mappedBankQuestion);
    });

    setReport({
      totalItemsParsed: parsedData.length,
      mcqCount,
      trueFalseCount,
      duplicatesCount,
      errors,
      validQuestions
    });

    setStep("preview");
  };

  // Step 2 -> Execute Import to Firestore & Parent Store
  const handleExecuteImport = async () => {
    if (!report || report.validQuestions.length === 0) return;

    setIsSaving(true);
    try {
      // Save each question to Firestore questions collection
      await Promise.all(
        report.validQuestions.map((q) => saveBankQuestionToFirestore(q))
      );

      // Trigger parent callback to update local state
      onImportSuccess(report.validQuestions);

      setIsSaving(false);
      setStep("success");
      onShowToast(`Successfully imported ${report.validQuestions.length} questions into Question Bank! 🎉`, "success");
    } catch (err) {
      console.error("Error batch saving bank questions:", err);
      setIsSaving(false);
      onShowToast("An error occurred while saving questions to Firestore.", "error");
    }
  };

  const handlePasteSample = () => {
    setJsonText(SAMPLE_JSON_TEXT);
    onShowToast("Loaded sample JSON format!", "info");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-8"
        dir="ltr"
      >
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-5 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-400/20 text-amber-300 rounded-2xl border border-amber-400/30">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">Bulk Question Importer</h3>
              <p className="text-xs text-slate-300">
                Import JSON questions directly into the Centralized Question Bank
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Step Indicator Header */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200/80 flex items-center justify-between text-xs font-bold text-slate-500">
          <div className={`flex items-center gap-2 ${step === "paste" ? "text-indigo-600 font-extrabold" : "text-emerald-700"}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${step === "paste" ? "bg-indigo-600 text-white" : "bg-emerald-100 text-emerald-800"}`}>
              1
            </span>
            <span>Paste JSON</span>
          </div>

          <ArrowRight className="w-4 h-4 text-slate-300" />

          <div className={`flex items-center gap-2 ${step === "preview" ? "text-indigo-600 font-extrabold" : step === "success" ? "text-emerald-700" : "text-slate-400"}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${step === "preview" ? "bg-indigo-600 text-white" : step === "success" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-500"}`}>
              2
            </span>
            <span>Validate & Preview</span>
          </div>

          <ArrowRight className="w-4 h-4 text-slate-300" />

          <div className={`flex items-center gap-2 ${step === "success" ? "text-emerald-700 font-extrabold" : "text-slate-400"}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${step === "success" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"}`}>
              3
            </span>
            <span>Summary</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
          
          {/* STEP 1: PASTE JSON */}
          {step === "paste" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <label className="text-xs font-extrabold text-slate-700 flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-indigo-600" />
                  Paste Question Array (JSON Format):
                </label>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePasteSample}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    Load Sample JSON
                  </button>

                  {jsonText && (
                    <button
                      onClick={() => setJsonText("")}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Textarea */}
              <div className="relative">
                <textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  placeholder={`[\n  {\n    "type": "mcq",\n    "question": "Sample Question Text...",\n    "options": ["Option A", "Option B", "Option C", "Option D"],\n    "correctAnswer": 0,\n    "subject": "Chemistry",\n    "grade": "1 Sec",\n    "topic": "Atomic Structure",\n    "difficulty": "Medium",\n    "explanation": "..."\n  }\n]`}
                  className="w-full h-80 p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-2xl border border-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none leading-relaxed"
                />
              </div>

              {/* Schema Documentation Helper */}
              <div className="bg-amber-50/80 border border-amber-200/80 p-4 rounded-2xl space-y-2 text-xs text-amber-900">
                <div className="font-extrabold flex items-center gap-2 text-amber-950">
                  <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  Supported Question Schemas
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-mono bg-white p-3 rounded-xl border border-amber-200/60">
                  <div>
                    <span className="font-bold font-sans text-indigo-700 block mb-1">1. Multiple Choice (mcq)</span>
                    <pre className="text-slate-600 whitespace-pre-wrap">{`{
  "type": "mcq",
  "question": "...",
  "options": ["A", "B", "C", "D"],
  "correctAnswer": 0..3,
  "subject": "Physics",
  "grade": "1 Sec",
  "topic": "Forces",
  "difficulty": "Medium"
}`}</pre>
                  </div>

                  <div>
                    <span className="font-bold font-sans text-indigo-700 block mb-1">2. True / False (true_false)</span>
                    <pre className="text-slate-600 whitespace-pre-wrap">{`{
  "type": "true_false",
  "question": "...",
  "correctAnswer": true / false,
  "subject": "Biology",
  "grade": "2 Sec",
  "topic": "Genetics",
  "difficulty": "Easy"
}`}</pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: VALIDATE & PREVIEW */}
          {step === "preview" && report && (
            <div className="space-y-6">
              
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Parsed</span>
                  <span className="text-xl font-black text-slate-800">{report.totalItemsParsed}</span>
                </div>

                <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 text-center">
                  <span className="text-[10px] text-emerald-700 font-bold block uppercase">MCQs</span>
                  <span className="text-xl font-black text-emerald-950">{report.mcqCount}</span>
                </div>

                <div className="bg-blue-50 p-3.5 rounded-2xl border border-blue-200 text-center">
                  <span className="text-[10px] text-blue-700 font-bold block uppercase">True / False</span>
                  <span className="text-xl font-black text-blue-950">{report.trueFalseCount}</span>
                </div>

                <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 text-center">
                  <span className="text-[10px] text-amber-700 font-bold block uppercase">Duplicates</span>
                  <span className="text-xl font-black text-amber-950">{report.duplicatesCount}</span>
                </div>

                <div className="bg-rose-50 p-3.5 rounded-2xl border border-rose-200 text-center col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-rose-700 font-bold block uppercase">Errors</span>
                  <span className="text-xl font-black text-rose-950">{report.errors.length}</span>
                </div>
              </div>

              {/* Errors Section (if any) */}
              {report.errors.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    Validation Errors / Warnings ({report.errors.length}):
                  </div>
                  <ul className="max-h-36 overflow-y-auto space-y-1 text-[11px] text-rose-700 list-disc pl-5 font-mono">
                    {report.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview First 5 Parsed Questions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-800 flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-indigo-600" />
                    Preview of Valid Questions (First 5 of {report.validQuestions.length})
                  </h4>
                  <span className="text-[11px] font-bold text-slate-400">Ready to Import</span>
                </div>

                {report.validQuestions.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 p-8 rounded-2xl text-center text-slate-400 text-xs">
                    No valid non-duplicate questions found in the provided JSON text. Please check the JSON format and fix any errors.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {report.validQuestions.slice(0, 5).map((q, idx) => (
                      <div key={q.id || idx} className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-[10px]">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-slate-900">{q.text}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-md font-bold text-[10px]">
                              {q.type === QuestionType.MCQ ? "MCQ" : "True / False"}
                            </span>
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md font-bold text-[10px]">
                              {q.subject}
                            </span>
                          </div>
                        </div>

                        {/* Options preview */}
                        <div className="grid grid-cols-2 gap-1.5 pl-7 text-[11px]">
                          {q.options.map((opt, oIdx) => {
                            const isCorrect = oIdx === q.correctAnswerIndex;
                            return (
                              <div 
                                key={oIdx} 
                                className={`p-1.5 rounded-lg border flex items-center gap-1.5 ${
                                  isCorrect 
                                    ? "bg-emerald-100 text-emerald-900 border-emerald-300 font-bold" 
                                    : "bg-white text-slate-600 border-slate-200"
                                }`}
                              >
                                <span className="text-[10px] opacity-60">
                                  {String.fromCharCode(65 + oIdx)})
                                </span>
                                <span className="truncate">{opt}</span>
                                {isCorrect && <Check className="w-3.5 h-3.5 text-emerald-700 ml-auto shrink-0" />}
                              </div>
                            );
                          })}
                        </div>

                        {q.explanation && (
                          <div className="pl-7 text-[10px] italic text-slate-500">
                            💡 Explanation: {q.explanation}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: SUCCESS SUMMARY */}
          {step === "success" && report && (
            <div className="text-center py-8 space-y-6">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-black text-slate-900">Bulk Import Complete! 🎉</h3>
                <p className="text-xs text-slate-500">
                  {report.validQuestions.length} new questions have been successfully added to your Question Bank.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Total Added</span>
                  <span className="text-xl font-black text-slate-900">{report.validQuestions.length}</span>
                </div>

                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200">
                  <span className="text-[10px] font-bold text-emerald-700 block uppercase">MCQs</span>
                  <span className="text-xl font-black text-emerald-950">{report.mcqCount}</span>
                </div>

                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-200">
                  <span className="text-[10px] font-bold text-blue-700 block uppercase">True / False</span>
                  <span className="text-xl font-black text-blue-950">{report.trueFalseCount}</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer Controls */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
          
          {step === "paste" && (
            <>
              <button
                onClick={handleClose}
                className="px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-300 text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                onClick={handleValidate}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Validate JSON
              </button>
            </>
          )}

          {step === "preview" && (
            <>
              <button
                onClick={() => setStep("paste")}
                className="px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-300 text-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Back / Edit JSON
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleClose}
                  className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-600 font-bold rounded-xl text-xs border border-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  onClick={handleExecuteImport}
                  disabled={isSaving || !report || report.validQuestions.length === 0}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black rounded-xl text-xs transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importing Questions...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Import {report?.validQuestions.length || 0} Questions
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {step === "success" && (
            <div className="w-full flex justify-end">
              <button
                onClick={handleClose}
                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs transition-all shadow-lg cursor-pointer"
              >
                Done / Return to Question Bank
              </button>
            </div>
          )}

        </div>
      </motion.div>
    </div>
  );
}
