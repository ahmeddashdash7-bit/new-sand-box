/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Quiz } from "../types";

/**
 * تقصير أسماء الحقول لتقليل حجم الـ JSON وضمان روابط قصيرة ومضغوطة
 */
function minifyQuiz(quiz: Quiz) {
  return {
    i: quiz.id,
    t: quiz.title,
    s: quiz.subject,
    g: quiz.grade,
    tn: quiz.teacherName,
    tw: quiz.teacherWhatsApp,
    q: quiz.questions.map(q => ({
      i: q.id,
      ty: q.type,
      tx: q.text,
      o: q.options,
      c: q.correctAnswerIndex,
      e: q.explanation || "",
      // Image reference travels with the encoded quiz so share links / QR codes keep figures.
      // Only the reference is carried (a Storage download URL), never image bytes.
      ...(q.imageUrl ? { iu: q.imageUrl, inm: q.imageName || "", iw: q.imageWidth, ih: q.imageHeight } : {})
    }))
  };
}

/**
 * استعادة أسماء الحقول الكاملة للاختبار
 */
function unminifyQuiz(minified: any): Quiz {
  return {
    id: minified.i || "quiz-" + Date.now(),
    title: minified.t || "",
    subject: minified.s || "العلوم المتكاملة",
    grade: minified.g || "الصف الأول الإعدادي",
    teacherName: minified.tn || "Dr. Ghada Abdelaal",
    teacherWhatsApp: minified.tw || "201000205897",
    createdAt: Date.now(),
    questions: (minified.q || []).map((q: any) => ({
      id: q.i || "q-" + Date.now(),
      type: q.ty,
      text: q.tx,
      options: q.o || [],
      correctAnswerIndex: q.c || 0,
      explanation: q.e || "",
      imageUrl: q.iu || undefined,
      imageName: q.inm || undefined,
      imageWidth: q.iw || undefined,
      imageHeight: q.ih || undefined
    }))
  };
}

/**
 * يرمز كائن الاختبار كـ سلسلة نصية مضغوطة وقصيرة جداً للاستخدام في الروابط (Short Hash)
 */
export function encodeQuiz(quiz: Quiz): string {
  try {
    const minified = minifyQuiz(quiz);
    const jsonStr = JSON.stringify(minified);
    const bytes = new TextEncoder().encode(jsonStr);
    const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
    const base64 = btoa(binString);
    // جعل الكود آمناً في الروابط بدعم الرموز القصيرة
    const shortCode = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    
    // حفظ نسخة في localStorage للمستعرض الحالي لسرعة الاستدعاء
    try {
      localStorage.setItem(`sq_${shortCode.slice(0, 16)}`, JSON.stringify(quiz));
    } catch (e) {
      // إهمال أخطاء التخزين المحلي
    }

    return shortCode;
  } catch (error) {
    console.error("خطأ أثناء ترميز الاختبار:", error);
    throw new Error("فشل ترميز بيانات الاختبار. تأكد من صحة الحقول.");
  }
}

/**
 * يفك ترميز السلسلة النصية ويعيد كائن الاختبار المعتمد
 */
export function decodeQuiz(code: string): Quiz | null {
  if (!code || !code.trim()) return null;

  try {
    const cleanCode = code.trim();

    // 1. محاولة الاستدعاء المباشر من التخزين المحلي إذا وُجد
    try {
      const cached = localStorage.getItem(`sq_${cleanCode.slice(0, 16)}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.title && Array.isArray(parsed.questions)) {
          return parsed;
        }
      }
    } catch (e) {
      // الاستمرار في فك التشفير القياسي
    }

    // 2. استعادة صيغة Base64
    let base64 = cleanCode.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const binString = atob(base64);
    const bytes = Uint8Array.from(binString, (char) => char.charCodeAt(0));
    const jsonStr = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(jsonStr);

    // إذا كان التنسيق مُصغراً (minified)
    if (parsed && parsed.t && Array.isArray(parsed.q)) {
      return unminifyQuiz(parsed);
    }

    // إذا كان التنسيق بالصيغة القديمة الكاملة
    if (parsed && parsed.title && Array.isArray(parsed.questions)) {
      return parsed as Quiz;
    }

    return null;
  } catch (error) {
    console.error("خطأ أثناء فك ترميز الاختبار:", error);
    return null;
  }
}

