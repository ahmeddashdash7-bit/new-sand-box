import { describe, it, expect } from "vitest";
import { buildWhatsAppReportMessage } from "../src/lib/whatsapp";
import { TEACHER_NAME_AR } from "../src/lib/teacher";

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}\u{2300}-\u{23FF}\u{2190}-\u{21FF}]/u;

describe("WhatsApp report message", () => {
  const base = {
    studentName: "أحمد محمد",
    grade: "2 Sec",
    quizTitle: "Biology Quiz 3",
    score: 18,
    totalQuestions: 20,
    timeTakenSeconds: 754,
    submittedAt: Date.parse("2026-08-22T10:00:00Z")
  };

  it("contains no emoji at any performance band, with or without a note", () => {
    for (const score of [20, 18, 14, 11, 4]) {
      for (const teacherNote of ["", "ممتاز، واصل"]) {
        const msg = buildWhatsAppReportMessage({ ...base, score, teacherNote });
        expect(EMOJI.test(msg), `band ${score} note="${teacherNote}"`).toBe(false);
      }
    }
  });

  it("keeps every report field", () => {
    const msg = buildWhatsAppReportMessage({ ...base, teacherNote: "ملاحظة" });
    expect(msg).toContain("أحمد محمد");
    expect(msg).toContain("Biology Quiz 3");
    expect(msg).toContain("2 Sec");
    expect(msg).toContain("18 من 20");
    expect(msg).toContain("90%");
    expect(msg).toContain("ممتاز مع مرتبة الشرف");
    expect(msg).toContain("ملاحظة");
    expect(msg).toContain(TEACHER_NAME_AR);
  });

  it("has no orphaned punctuation or doubled spaces left by removing emoji", () => {
    const msg = buildWhatsAppReportMessage({ ...base, teacherNote: "" });
    expect(msg).not.toMatch(/  +/);
    expect(msg).not.toMatch(/ \n/);
    expect(msg).not.toMatch(/^\s*[:،-]/m);
  });
});
