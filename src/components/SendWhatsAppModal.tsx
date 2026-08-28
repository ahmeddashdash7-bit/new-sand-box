/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  X, 
  MessageCircle, 
  Send, 
  Check, 
  Copy, 
  Phone, 
  User, 
  GraduationCap, 
  Award, 
  AlertCircle, 
  Sparkles, 
  ExternalLink,
  Clock,
  FileText,
  CheckCircle2,
  RefreshCw,
  RotateCcw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { StudentResult, StudentRecord, ReportDeliveryInfo } from "../types";
import { 
  validateWhatsAppPhone, 
  formatPhoneForWhatsApp, 
  buildWhatsAppReportMessage, 
  getPerformanceRating 
} from "../lib/whatsapp";
import { saveReportDeliveryLogToFirestore, markReportUnsentInFirestore } from "../lib/firebase";
import { DEFAULT_GRADE } from "../lib/classification";
import GhadaLogo from "./GhadaLogo";

interface SendWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: StudentResult | null;
  studentRecord?: StudentRecord | null;
  onToast?: (message: string, type: "success" | "error" | "info") => void;
}

export default function SendWhatsAppModal({
  isOpen,
  onClose,
  result,
  studentRecord,
  onToast
}: SendWhatsAppModalProps) {
  const [phone, setPhone] = useState<string>("");
  const [teacherNote, setTeacherNote] = useState<string>("");
  const [phoneError, setPhoneError] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [currentDelivery, setCurrentDelivery] = useState<ReportDeliveryInfo | null>(null);

  // Synchronize state when result or studentRecord changes
  useEffect(() => {
    if (result) {
      const initialPhone = 
        result.phoneNumber || 
        studentRecord?.parentPhone || 
        "";
      setPhone(initialPhone);
      setTeacherNote("");
      setPhoneError("");
      setCopied(false);
      setCurrentDelivery(result.reportDelivery || null);
    }
  }, [result, studentRecord]);

  if (!isOpen || !result) return null;

  const percentage = Math.round((result.score / Math.max(1, result.totalQuestions)) * 100);
  const gradeLabel = result.studentClass || studentRecord?.grade || DEFAULT_GRADE;

  // Build current live payload
  const reportPayload = {
    studentName: result.studentName || "Student",
    grade: gradeLabel,
    quizTitle: result.quizTitle || "Assessment",
    score: result.score,
    totalQuestions: result.totalQuestions,
    timeTakenSeconds: result.timeTakenSeconds,
    submittedAt: result.submittedAt,
    teacherNote: teacherNote
  };

  const previewMessage = buildWhatsAppReportMessage(reportPayload);
  const phoneValidation = validateWhatsAppPhone(phone);

  const isSentBefore = currentDelivery && (currentDelivery.status === "sent" || currentDelivery.status === "resent");

  const handleSend = async () => {
    if (!phoneValidation.isValid) {
      setPhoneError(phoneValidation.error || "Please enter a valid phone number with country code.");
      if (onToast) {
        onToast("Cannot mark as sent: Parent mobile number is missing or invalid. ⚠️", "error");
      }
      return;
    }

    setPhoneError("");
    setIsSaving(true);
    const cleaned = phoneValidation.cleaned;

    // Save send attempt log in Firestore
    const savedInfo = await saveReportDeliveryLogToFirestore({
      submissionId: result.id || result.submissionId,
      submittedAt: result.submittedAt,
      quizId: result.quizId,
      quizTitle: result.quizTitle,
      studentName: result.studentName,
      seatNumber: result.seatNumber,
      studentIdNumber: result.studentIdNumber,
      parentPhone: cleaned,
      teacherNote: teacherNote
    });

    setIsSaving(false);

    if (savedInfo) {
      setCurrentDelivery(savedInfo);
    }

    // Open WhatsApp URL
    const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(previewMessage)}`;
    window.open(url, "_blank");

    if (onToast) {
      onToast(
        isSentBefore 
          ? `Resent report to parent (+${cleaned}) & updated log in Firestore! 📱` 
          : `Sent report to parent (+${cleaned}) & saved send log in Firestore! 📱`, 
        "success"
      );
    }
    onClose();
  };

  const handleMarkUnsent = async () => {
    if (!confirm(`Are you sure you want to mark report for "${result.studentName}" as Unsent?`)) return;

    setIsSaving(true);
    await markReportUnsentInFirestore({
      submissionId: result.id || result.submissionId,
      submittedAt: result.submittedAt,
      quizId: result.quizId,
      studentName: result.studentName
    });
    setIsSaving(false);

    const unsentObj: ReportDeliveryInfo = {
      status: "unsent",
      sendCount: 0,
      parentPhone: ""
    };
    setCurrentDelivery(unsentObj);

    if (onToast) {
      onToast(`Delivery status for "${result.studentName}" reset to Unsent in Firestore ⚪`, "info");
    }
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(previewMessage);
    setCopied(true);
    if (onToast) {
      onToast("WhatsApp report summary copied to clipboard! 📋", "info");
    }
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-emerald-100 overflow-hidden text-slate-800 my-8"
        >
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 px-6 py-5 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20 shadow-inner">
                <MessageCircle className="w-6 h-6 text-emerald-200" />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                  Send Report via WhatsApp
                </h3>
                <p className="text-xs text-emerald-100 font-medium">
                  Direct parent notification with persistent delivery tracking
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Delivery Status Indicator Banner */}
            {isSentBefore ? (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200/90 rounded-2xl flex items-center justify-between text-xs shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-black text-emerald-900 text-xs block">
                      {currentDelivery?.status === "resent" ? "Resent to Parent" : "Sent to Parent"} ({currentDelivery?.sendCount || 1}x)
                    </span>
                    <span className="text-[11px] text-emerald-700 font-bold block">
                      Last sent: {currentDelivery?.lastSentAt ? new Date(currentDelivery.lastSentAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Previously"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleMarkUnsent}
                  disabled={isSaving}
                  className="px-2.5 py-1.5 bg-white hover:bg-rose-50 text-rose-700 font-extrabold border border-rose-200 rounded-xl text-[11px] transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Reset delivery status to Not Sent"
                >
                  <RotateCcw className="w-3 h-3 text-rose-500" />
                  <span>Mark Unsent</span>
                </button>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-2.5 text-xs text-slate-600">
                <div className="p-2 bg-slate-200 text-slate-600 rounded-xl">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-extrabold text-slate-800 text-xs block">Status: Not Sent</span>
                  <span className="text-[11px] text-slate-500 font-medium block">
                    No recorded WhatsApp send history for this student report yet.
                  </span>
                </div>
              </div>
            )}

            {/* Top Summary Card */}
            <div className="bg-gradient-to-br from-emerald-50/70 via-teal-50/40 to-slate-50 p-4 rounded-2xl border border-emerald-200/80 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                    {result.studentName ? result.studentName.charAt(0).toUpperCase() : "S"}
                  </div>
                  <div>
                    <span className="font-extrabold text-slate-900 text-sm block">
                      {result.studentName}
                    </span>
                    <span className="text-[11px] text-slate-500 font-bold block">
                      {gradeLabel}
                    </span>
                  </div>
                </div>

                <span className="px-3 py-1 bg-emerald-600 text-white font-black text-xs rounded-full shadow-xs">
                  {result.score} / {result.totalQuestions} ({percentage}%)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                  <span className="text-[10px] text-slate-400 font-bold block">Assessment</span>
                  <span className="font-bold text-slate-800 line-clamp-1">{result.quizTitle}</span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                  <span className="text-[10px] text-slate-400 font-bold block">Performance</span>
                  <span className="font-bold text-emerald-700">{getPerformanceRating(percentage)}</span>
                </div>
              </div>
            </div>

            {/* Parent Mobile Number Section */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-800 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-emerald-600" />
                  Parent Mobile Number <span className="text-rose-500">*</span>
                </span>
                {phoneValidation.isValid && (
                  <span className="text-[10px] text-emerald-600 font-black flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Ready (+{phoneValidation.cleaned})
                  </span>
                )}
              </label>

              <div className="relative">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setPhoneError("");
                  }}
                  placeholder="e.g. +20 101 234 5678 or 01012345678"
                  className={`w-full pl-4 pr-10 py-3 bg-slate-50 border rounded-xl text-slate-900 text-sm font-bold font-mono outline-none transition-all ${
                    phoneError || (!phoneValidation.isValid && phone.trim() !== "")
                      ? "border-rose-300 focus:ring-2 focus:ring-rose-200 bg-rose-50/30" 
                      : "border-slate-200 focus:bg-white focus:ring-2 focus:ring-emerald-200"
                  }`}
                />
              </div>

              {phoneError ? (
                <p className="text-[11px] text-rose-600 font-bold flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{phoneError}</span>
                </p>
              ) : !phoneValidation.isValid && phone.trim() === "" ? (
                <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200 font-semibold flex items-center gap-1.5 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  <span>Parent phone number missing. Report will not be marked as sent without a valid mobile number.</span>
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 font-medium">
                  Enter mobile number with country code (e.g., +20 for Egypt, +966 for Saudi Arabia).
                </p>
              )}
            </div>

            {/* Teacher Note (Optional) */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-600" />
                Add Short Teacher Note <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                rows={2}
                value={teacherNote}
                onChange={(e) => setTeacherNote(e.target.value)}
                placeholder="e.g. Ahmed showed brilliant understanding of photosynthesis! Keep it up."
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200 transition-all resize-none"
              />
            </div>

            {/* Message Preview Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" /> WhatsApp Message Preview
                </span>
                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied!" : "Copy Text"}</span>
                </button>
              </div>

              <div className="p-3.5 bg-emerald-950 text-emerald-100 rounded-xl text-[11px] font-mono whitespace-pre-wrap leading-relaxed border border-emerald-800 shadow-inner max-h-40 overflow-y-auto">
                {previewMessage}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSend}
                disabled={isSaving}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black rounded-xl text-xs flex items-center gap-2 transition-all shadow-md hover:shadow-lg cursor-pointer active:scale-98"
              >
                {isSaving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <MessageCircle className="w-4 h-4 fill-current" />
                )}
                <span>{isSentBefore ? "Resend via WhatsApp" : "Send via WhatsApp"}</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
