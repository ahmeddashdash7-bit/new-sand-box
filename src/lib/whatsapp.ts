/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WhatsApp Helper Utilities for Student Assessment Reports
 */

import { TEACHER_NAME_AR } from "./teacher";

/**
 * Format raw phone number string into international digits format suitable for wa.me links
 * Strips non-digits, strips leading +, converts leading 0 to country code if applicable.
 */
export function formatPhoneForWhatsApp(rawPhone: string, defaultCountryCode = "20"): string {
  if (!rawPhone) return "";
  
  // Strip all non-digit characters
  let digits = rawPhone.replace(/\D/g, "");
  
  if (!digits) return "";

  // If number starts with 00 (e.g. 00201012345678), strip 00
  if (digits.startsWith("00")) {
    digits = digits.substring(2);
  }

  // If number starts with a single 0 (e.g. 01012345678 or 0501234567)
  if (digits.startsWith("0")) {
    // 11 digits starting with 01 -> Egyptian mobile (replace 0 with 20)
    if (digits.length === 11 && digits.startsWith("01")) {
      digits = defaultCountryCode + digits.substring(1);
    } 
    // 10 digits starting with 05 -> Saudi mobile (replace 0 with 966)
    else if (digits.length === 10 && digits.startsWith("05")) {
      digits = "966" + digits.substring(1);
    }
    // Generic leading zero replace with default country code
    else {
      digits = defaultCountryCode + digits.substring(1);
    }
  }

  return digits;
}

/**
 * Validates whether a phone number string can be formatted into a valid WhatsApp recipient
 */
export function validateWhatsAppPhone(rawPhone: string): { isValid: boolean; cleaned: string; error?: string } {
  if (!rawPhone || !rawPhone.trim()) {
    return {
      isValid: false,
      cleaned: "",
      error: "Parent phone number is missing. Please enter a valid mobile number with country code."
    };
  }

  const cleaned = formatPhoneForWhatsApp(rawPhone);

  if (cleaned.length < 8) {
    return {
      isValid: false,
      cleaned,
      error: "Phone number is too short (min 8 digits required with country code)."
    };
  }

  if (cleaned.length > 15) {
    return {
      isValid: false,
      cleaned,
      error: "Phone number is too long (max 15 digits allowed)."
    };
  }

  return {
    isValid: true,
    cleaned
  };
}

/**
 * Formats a performance rating label based on percentage score
 */
export function getPerformanceRating(percentage: number): string {
  if (percentage >= 90) return "Excellent with Honors 🏆";
  if (percentage >= 75) return "Very Good 🌟";
  if (percentage >= 65) return "Good 👏";
  if (percentage >= 50) return "Pass 👍";
  return "Needs Review 📚";
}

/**
 * WhatsApp Report Payload
 */
export interface WhatsAppReportPayload {
  studentName: string;
  grade?: string;
  quizTitle: string;
  score: number;
  totalQuestions: number;
  timeTakenSeconds?: number;
  submittedAt?: number;
  teacherNote?: string;
}

/**
 * Arabic performance label, used only inside the parent-facing WhatsApp message.
 * `getPerformanceRating` stays English (and keeps its emoji) because it is rendered in the
 * teacher-facing UI, not sent to a parent.
 *
 * DELIBERATELY EMOJI-FREE — see buildWhatsAppReportMessage.
 */
function getPerformanceRatingAr(percentage: number): string {
  if (percentage >= 90) return "ممتاز مع مرتبة الشرف";
  if (percentage >= 75) return "جيد جدًا";
  if (percentage >= 65) return "جيد";
  if (percentage >= 50) return "مقبول";
  return "يحتاج إلى مراجعة";
}

/**
 * A warm closing sentence matched to the level of the result.
 *
 * DELIBERATELY EMOJI-FREE — see buildWhatsAppReportMessage.
 */
function getClosingNoteAr(percentage: number): string {
  if (percentage >= 90) return "أداء متميز يستحق كل التقدير، وأسأل الله دوام التوفيق.";
  if (percentage >= 75) return "أداء جيد جدًا، ومع قليل من المتابعة سيصل إلى التميز بإذن الله.";
  if (percentage >= 65) return "أداء جيد، وأتمنى المزيد من المراجعة المنزلية لرفع المستوى.";
  if (percentage >= 50) return "النتيجة مقبولة، وأرجو متابعة حضرتكم في المراجعة اليومية.";
  return "المستوى يحتاج إلى مراجعة إضافية، وسأكون سعيدة بالتعاون مع حضرتكم لتحسين المستوى.";
}

/**
 * Builds the parent-facing WhatsApp report text (Arabic).
 *
 * PLAIN TEXT, NO EMOJI — by explicit teacher request. Every report field is unchanged (student
 * name, assessment, grade, score, percentage, rating, duration, date, optional teacher note,
 * closing, signature); only the decorative characters are gone. The emoji used to double as the
 * line labels, so the field names now carry that job alone and the closing sentences terminate
 * with a full stop instead of a pictogram. The `*...*` around the student name is WhatsApp's bold
 * marker, not decoration — keep it.
 *
 * If you add a line here, do not reintroduce an emoji: this string is the whole deliverable.
 */
export function buildWhatsAppReportMessage(data: WhatsAppReportPayload): string {
  const total = Math.max(1, data.totalQuestions);
  const percentage = Math.round((data.score / total) * 100);
  const rating = getPerformanceRatingAr(percentage);

  // Arabic counts do not use one plural form: 3–10 take the broken plural, 11+ the singular.
  // Getting this wrong is what makes a translated message read as machine-written.
  const arabicCount = (n: number, one: string, two: string, few: string, many: string) => {
    if (n === 1) return one;
    if (n === 2) return two;
    if (n >= 3 && n <= 10) return `${n} ${few}`;
    return `${n} ${many}`;
  };

  const formatTime = (secs?: number) => {
    if (!secs) return "غير متاح";
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    const minsText = arabicCount(mins, "دقيقة واحدة", "دقيقتان", "دقائق", "دقيقة");
    const secsText = arabicCount(remainingSecs, "ثانية واحدة", "ثانيتان", "ثوانٍ", "ثانية");
    if (mins === 0) return secsText;
    if (remainingSecs === 0) return minsText;
    return `${minsText} و ${secsText}`;
  };

  const dateSource = data.submittedAt ? new Date(data.submittedAt) : new Date();
  // Latin digits keep the date readable next to the rest of the numbers in the message.
  const dateStr = dateSource.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });

  let text = `السلام عليكم ورحمة الله وبركاته\n`;
  text += `معكم ${TEACHER_NAME_AR}\n\n`;
  text += `يسعدني أن أشارك حضرتكم تقرير أداء الطالب/الطالبة *${data.studentName}* في التقييم الأخير.\n\n`;
  text += `التقييم: ${data.quizTitle}\n`;
  if (data.grade) {
    text += `الصف: ${data.grade}\n`;
  }
  text += `الدرجة: ${data.score} من ${data.totalQuestions} (${percentage}%)\n`;
  text += `التقدير: ${rating}\n`;
  text += `زمن الحل: ${formatTime(data.timeTakenSeconds)}\n`;
  text += `التاريخ: ${dateStr}\n`;

  if (data.teacherNote && data.teacherNote.trim()) {
    text += `\nملاحظة المعلمة:\n"${data.teacherNote.trim()}"\n`;
  }

  text += `\n${getClosingNoteAr(percentage)}\n`;
  text += `\nوأنا تحت أمر حضرتكم لأي استفسار، وشكرًا لمتابعتكم ودعمكم المستمر.\n\n`;
  text += `مع خالص تحياتي،\n${TEACHER_NAME_AR}`;

  return text;
}

/**
 * Opens WhatsApp Web or mobile app with prefilled message
 */
export function openWhatsAppReport(phone: string, data: WhatsAppReportPayload): boolean {
  const validation = validateWhatsAppPhone(phone);
  if (!validation.isValid) {
    return false;
  }

  const message = buildWhatsAppReportMessage(data);
  const url = `https://wa.me/${validation.cleaned}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
  return true;
}
