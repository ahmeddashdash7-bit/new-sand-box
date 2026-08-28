/**
 * Requirement 1 (Science is a separate subject) and Requirement 5 (group filtering) —
 * the parts that are pure logic and can be asserted rather than clicked.
 */

import { describe, it, expect } from "vitest";
import { Subject, StudentRecord, StudentResult, StudentGroup } from "../src/types";
import {
  ALL_FILTER,
  NO_GROUP_FILTER,
  matchesGroupFilter,
  resolveGroupOptions,
  resolveResultGroup,
  resolveSubjectFromTitle,
  FALLBACK_GROUP_OPTIONS
} from "../src/lib/classification";

describe("TEST A — Science and Integrated Science are separate subjects", () => {
  it("both exist, with distinct persisted values", () => {
    expect(Subject.Science).toBe("Science");
    expect(Subject.IntegratedScience).toBe("Integrated Science");
    expect(Subject.Science).not.toBe(Subject.IntegratedScience);
  });

  it("the pre-existing subjects are untouched", () => {
    // These strings are persisted verbatim in every existing Firestore document. If any of them
    // changes, existing questions/blueprints/assessments silently stop matching their subject.
    expect(Subject.Physics).toBe("Physics");
    expect(Subject.Chemistry).toBe("Chemistry");
    expect(Subject.Biology).toBe("Biology");
    expect(Subject.IntegratedScience).toBe("Integrated Science");
  });

  it("Science is additive: the enum still contains all four originals", () => {
    const values = Object.values(Subject);
    expect(values).toContain("Physics");
    expect(values).toContain("Chemistry");
    expect(values).toContain("Biology");
    expect(values).toContain("Integrated Science");
    expect(values).toContain("Science");
    expect(values).toHaveLength(5);
  });

  it("every picker driven by Object.values(Subject) offers exactly these five", () => {
    // The pickers in QuestionBankView / BankQuestionFormModal / BlueprintFormModal /
    // QuestionBankPickerModal / TeacherPanel / AnalyticsDashboardView all map Object.values(Subject).
    expect(Object.values(Subject)).toEqual([
      "Physics", "Chemistry", "Biology", "Integrated Science", "Science"
    ]);
  });

  /**
   * The one place free text is mapped onto the enum. "Integrated Science" contains the word
   * "science", so order decides whether the two subjects stay distinct on import.
   */
  it("bulk-import subject mapping keeps the two apart", () => {
    const map = (raw: string): Subject => {
      const rawSubj = String(raw || "").trim().toLowerCase();
      let subject = Subject.IntegratedScience;
      if (rawSubj.includes("chem")) subject = Subject.Chemistry;
      else if (rawSubj.includes("phys")) subject = Subject.Physics;
      else if (rawSubj.includes("bio")) subject = Subject.Biology;
      else if (rawSubj.includes("integ")) subject = Subject.IntegratedScience;
      else if (rawSubj.includes("science")) subject = Subject.Science;
      return subject;
    };

    expect(map("Integrated Science")).toBe(Subject.IntegratedScience);
    expect(map("integrated science")).toBe(Subject.IntegratedScience);
    expect(map("INTEGRATED SCIENCE")).toBe(Subject.IntegratedScience);
    expect(map("Integ. Sci")).toBe(Subject.IntegratedScience);
    expect(map("Science")).toBe(Subject.Science);
    expect(map("science")).toBe(Subject.Science);
    expect(map("Chemistry")).toBe(Subject.Chemistry);
    expect(map("Physics")).toBe(Subject.Physics);
    expect(map("Biology")).toBe(Subject.Biology);
  });

  /**
   * The last-resort title guess, for results that name no subject anywhere. It must never let the
   * "Science" inside "Integrated Science" win.
   */
  it("resolveSubjectFromTitle never reduces Integrated Science to Science", () => {
    expect(resolveSubjectFromTitle("Integrated Science — Unit 2")).toBe(Subject.IntegratedScience);
    expect(resolveSubjectFromTitle("integrated science unit 2")).toBe(Subject.IntegratedScience);
    expect(resolveSubjectFromTitle("INTEGRATED SCIENCE FINAL")).toBe(Subject.IntegratedScience);
    expect(resolveSubjectFromTitle("Mid-term: Integrated Science")).toBe(Subject.IntegratedScience);

    expect(resolveSubjectFromTitle("Science Quiz 1")).toBe(Subject.Science);
    expect(resolveSubjectFromTitle("science quiz 1")).toBe(Subject.Science);
    expect(resolveSubjectFromTitle("Weekly Science Test")).toBe(Subject.Science);

    expect(resolveSubjectFromTitle("Chemistry Quiz")).toBe(Subject.Chemistry);
    expect(resolveSubjectFromTitle("Physics Paper 2")).toBe(Subject.Physics);
    expect(resolveSubjectFromTitle("Biology Quiz 3")).toBe(Subject.Biology);

    // No subject named at all -> no guess. Inventing one is what attributed every result to
    // Integrated Science.
    expect(resolveSubjectFromTitle("Weekly Test 4")).toBeUndefined();
    expect(resolveSubjectFromTitle("")).toBeUndefined();
    expect(resolveSubjectFromTitle(undefined)).toBeUndefined();
  });

  /**
   * The full analytics resolver, in the order AnalyticsDashboardView applies it. Each result maps
   * to EXACTLY ONE subject, so nothing is double-counted across the two science subjects.
   */
  it("analytics attributes a result to exactly one subject, from real data first", () => {
    const quizSubjectById = new Map<string, Subject>([
      ["quiz-int", Subject.IntegratedScience],
      ["quiz-sci", Subject.Science]
    ]);
    const questionSubjectById = new Map<string, Subject>([["bq-sci", Subject.Science]]);

    const resolve = (r: Partial<StudentResult>): string | undefined =>
      r.quizSnapshot?.subject ||
      quizSubjectById.get(r.quizId!) ||
      (r.assessmentId ? quizSubjectById.get(r.assessmentId) : undefined) ||
      r.answers?.map((a) => questionSubjectById.get(a.questionId)).find(Boolean) ||
      resolveSubjectFromTitle(r.quizTitle);

    // 1. The assessment is authoritative even when the title says otherwise.
    const fromQuiz = { quizId: "quiz-int", quizTitle: "Integrated Science — Unit 2" };
    expect(resolve(fromQuiz)).toBe(Subject.IntegratedScience);
    expect(resolve(fromQuiz)).not.toBe(Subject.Science);

    // 2. A deleted assessment: fall back to the subject of the questions answered.
    const fromQuestions = {
      quizId: "quiz-gone", quizTitle: "Weekly Test 4",
      answers: [{ questionId: "bq-sci", studentAnswerIndex: 0, isCorrect: true }]
    };
    expect(resolve(fromQuestions)).toBe(Subject.Science);

    // 3. Nothing but the title left — still unique.
    expect(resolve({ quizId: "gone", quizTitle: "Integrated Science Revision" }))
      .toBe(Subject.IntegratedScience);
    expect(resolve({ quizId: "gone", quizTitle: "Science Revision" })).toBe(Subject.Science);

    // 4. A historical submission with no subject signal at all is attributed to NOBODY, rather
    //    than silently inflating one subject's average.
    expect(resolve({ quizId: "gone", quizTitle: "Weekly Test 4" })).toBeUndefined();
  });

  it("a single result is never counted under both science subjects", () => {
    const quizSubjectById = new Map<string, Subject>([["quiz-int", Subject.IntegratedScience]]);
    const resolve = (r: Partial<StudentResult>) =>
      quizSubjectById.get(r.quizId!) || resolveSubjectFromTitle(r.quizTitle);

    const results = [
      { quizId: "quiz-int", quizTitle: "Integrated Science — Unit 2" },
      { quizId: "quiz-x", quizTitle: "Science Quiz 1" }
    ];

    // Build the per-subject buckets the dashboard builds, and assert the totals partition.
    const counts = Object.values(Subject).map(
      (subj) => results.filter((r) => resolve(r) === subj).length
    );
    expect(counts.reduce((a, b) => a + b, 0)).toBe(results.length); // no double-counting
    expect(results.filter((r) => resolve(r) === Subject.Science)).toHaveLength(1);
    expect(results.filter((r) => resolve(r) === Subject.IntegratedScience)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

const students: StudentRecord[] = [
  { id: "std-1", name: "Sara Ali",  code: "AAAA", parentPhone: "2010", group: "Group A", createdAt: 1 },
  { id: "std-2", name: "Omar Nabil", code: "BBBB", parentPhone: "2011", group: "Group B", createdAt: 1 },
  { id: "std-3", name: "Lina Adel",  code: "CCCC", parentPhone: "2012", group: "Group A", createdAt: 1 },
  { id: "std-4", name: "Youssef Emad", code: "DDDD", parentPhone: "2013", createdAt: 1 } // no group
];

function result(over: Partial<StudentResult>): StudentResult {
  return {
    studentName: "Sara Ali", seatNumber: "N/A", quizId: "q1", quizTitle: "Biology Quiz 3",
    score: 18, totalQuestions: 20, answers: [], timeTakenSeconds: 100, submittedAt: 1, ...over
  };
}

describe("TEST G — group filtering of submissions", () => {
  it("resolves a result's group from the roster, by code first", () => {
    expect(resolveResultGroup(students, result({ studentCode: "AAAA" }))).toBe("Group A");
    expect(resolveResultGroup(students, result({ studentCode: "BBBB", studentName: "Omar Nabil" }))).toBe("Group B");
  });

  it("falls back through student id, seat number, then name", () => {
    expect(resolveResultGroup(students, result({ studentIdNumber: "std-2", studentName: "Omar Nabil" }))).toBe("Group B");
    expect(resolveResultGroup(students, result({ seatNumber: "CCCC", studentName: "Lina Adel" }))).toBe("Group A");
    expect(resolveResultGroup(students, result({ studentName: "Omar Nabil" }))).toBe("Group B");
  });

  it("prefers the code over a stale name match", () => {
    // The roster was renamed after the submission was recorded; the code still identifies them.
    const renamed = result({ studentCode: "BBBB", studentName: "Sara Ali" });
    expect(resolveResultGroup(students, renamed)).toBe("Group B");
  });

  it("returns undefined for an ungrouped or unknown student, and never throws", () => {
    expect(resolveResultGroup(students, result({ studentCode: "DDDD", studentName: "Youssef Emad" }))).toBeUndefined();
    expect(resolveResultGroup(students, result({ studentName: "Deleted Student" }))).toBeUndefined();
    expect(resolveResultGroup([], result({ studentCode: "AAAA" }))).toBeUndefined();
  });

  it("All Groups returns everyone; Group A and Group B partition correctly", () => {
    const rows = [
      result({ studentCode: "AAAA", studentName: "Sara Ali", score: 18 }),
      result({ studentCode: "BBBB", studentName: "Omar Nabil", score: 15 }),
      result({ studentCode: "CCCC", studentName: "Lina Adel", score: 19 }),
      result({ studentCode: "DDDD", studentName: "Youssef Emad", score: 12 })
    ];
    const apply = (filter: string) =>
      rows.filter((r) => matchesGroupFilter(resolveResultGroup(students, r), filter));

    expect(apply(ALL_FILTER)).toHaveLength(4);
    expect(apply("Group A").map((r) => r.studentName)).toEqual(["Sara Ali", "Lina Adel"]);
    expect(apply("Group B").map((r) => r.studentName)).toEqual(["Omar Nabil"]);
    expect(apply(NO_GROUP_FILTER).map((r) => r.studentName)).toEqual(["Youssef Emad"]);
  });

  it("TEST H — assessment AND group compose as an intersection", () => {
    const rows = [
      result({ studentCode: "AAAA", studentName: "Sara Ali", quizTitle: "Biology Quiz 3", score: 18 }),
      result({ studentCode: "CCCC", studentName: "Lina Adel", quizTitle: "Biology Quiz 3", score: 19 }),
      result({ studentCode: "BBBB", studentName: "Omar Nabil", quizTitle: "Biology Quiz 3", score: 15 }),
      result({ studentCode: "AAAA", studentName: "Sara Ali", quizTitle: "Physics Quiz 1", score: 11 })
    ];

    // This mirrors TeacherPanel's filteredResults predicate.
    const apply = (quizTitle: string, group: string) =>
      rows.filter(
        (r) =>
          (quizTitle === "all" || r.quizTitle === quizTitle) &&
          matchesGroupFilter(resolveResultGroup(students, r), group)
      );

    const groupAOnBiology = apply("Biology Quiz 3", "Group A");
    expect(groupAOnBiology.map((r) => `${r.studentName} ${r.score}/20`)).toEqual([
      "Sara Ali 18/20",
      "Lina Adel 19/20"
    ]);

    // Changing the group must not disturb the assessment filter, and vice versa.
    expect(apply("Biology Quiz 3", "Group B").map((r) => r.studentName)).toEqual(["Omar Nabil"]);
    expect(apply("Biology Quiz 3", ALL_FILTER)).toHaveLength(3);
    expect(apply("Physics Quiz 1", "Group A").map((r) => r.studentName)).toEqual(["Sara Ali"]);
    expect(apply("Physics Quiz 1", "Group B")).toHaveLength(0);
    expect(apply("all", "Group A")).toHaveLength(3);
  });

  it("offers the teacher's groups, and keeps a renamed/deleted group reachable", () => {
    const groups: StudentGroup[] = [{ id: "g1", name: "Group A", createdAt: 1 }];
    // "Group B" was deleted from the manager but two students still carry the label.
    const options = resolveGroupOptions(groups, students.map((s) => s.group));
    expect(options).toContain("Group A");
    expect(options).toContain("Group B");
  });

  it("with no teacher-created groups, the pre-groups fallback still appears", () => {
    expect(resolveGroupOptions([], [])).toEqual(FALLBACK_GROUP_OPTIONS);
  });
});

/**
 * TEST 14 — the CSV export consumes the SAME filtered dataset the table renders.
 *
 * Export used to iterate `studentResults` directly while the table filtered inline, so a teacher
 * who had narrowed to one quiz and one group still got a spreadsheet of everything. Both now read
 * one `filteredResults` memo; this reproduces that pipeline and the row builder over it.
 */
describe("TEST 14 — CSV export respects the active filters", () => {
  const rows = [
    result({ studentCode: "AAAA", studentName: "Sara Ali", quizTitle: "Biology Quiz 3", score: 18, attemptNumber: 1 }),
    result({ studentCode: "CCCC", studentName: "Lina Adel", quizTitle: "Biology Quiz 3", score: 19, attemptNumber: 1 }),
    result({ studentCode: "BBBB", studentName: "Omar Nabil", quizTitle: "Biology Quiz 3", score: 15, attemptNumber: 1 }),
    result({ studentCode: "AAAA", studentName: "Sara Ali", quizTitle: "Biology Quiz 3", score: 20, attemptNumber: 2 }),
    result({ studentCode: "AAAA", studentName: "Sara Ali", quizTitle: "Physics Quiz 1", score: 11, attemptNumber: 1 }),
    result({ studentCode: "DDDD", studentName: "Youssef Emad", quizTitle: "Biology Quiz 3", score: 12, attemptNumber: 1 })
  ];

  /** Mirrors TeacherPanel's filteredResults memo. */
  const filtered = (quizTitle: string, group: string, search = "") => {
    const term = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!term || r.studentName.toLowerCase().includes(term)) &&
        (quizTitle === "all" || r.quizTitle === quizTitle) &&
        matchesGroupFilter(resolveResultGroup(students, r), group)
    );
  };

  /** Mirrors the row builder in handleExportCSV. */
  const toCsvRows = (list: StudentResult[]) =>
    list.map((r) => [
      r.studentName,
      resolveResultGroup(students, r) || "No Group",
      Math.max(1, Number(r.attemptNumber) || 1),
      r.quizTitle,
      r.score
    ]);

  it("exports exactly the rows the table shows for assessment + Group A", () => {
    const csv = toCsvRows(filtered("Biology Quiz 3", "Group A"));
    expect(csv).toEqual([
      ["Sara Ali", "Group A", 1, "Biology Quiz 3", 18],
      ["Lina Adel", "Group A", 1, "Biology Quiz 3", 19],
      ["Sara Ali", "Group A", 2, "Biology Quiz 3", 20]
    ]);
    // Group B and the ungrouped student are excluded.
    expect(csv.some((r) => r[0] === "Omar Nabil")).toBe(false);
    expect(csv.some((r) => r[0] === "Youssef Emad")).toBe(false);
    // The other assessment is excluded.
    expect(csv.some((r) => r[3] === "Physics Quiz 1")).toBe(false);
  });

  it("carries BOTH attempts of a retaking student into the export, distinctly", () => {
    const csv = toCsvRows(filtered("Biology Quiz 3", "Group A"));
    const sara = csv.filter((r) => r[0] === "Sara Ali");
    expect(sara).toHaveLength(2);
    expect(sara.map((r) => r[2])).toEqual([1, 2]);      // attempt numbers
    expect(sara.map((r) => r[4])).toEqual([18, 20]);    // independent scores
  });

  it("switching group re-scopes the export without disturbing the assessment filter", () => {
    expect(toCsvRows(filtered("Biology Quiz 3", "Group B")).map((r) => r[0])).toEqual(["Omar Nabil"]);
    expect(toCsvRows(filtered("Biology Quiz 3", ALL_FILTER))).toHaveLength(5);
    expect(toCsvRows(filtered("Biology Quiz 3", NO_GROUP_FILTER)).map((r) => r[0])).toEqual(["Youssef Emad"]);
    expect(toCsvRows(filtered("all", "Group A"))).toHaveLength(4);
  });

  it("composes with the search box too", () => {
    const csv = toCsvRows(filtered("Biology Quiz 3", "Group A", "lina"));
    expect(csv.map((r) => r[0])).toEqual(["Lina Adel"]);
  });

  it("an ungrouped student is labelled, not dropped", () => {
    const csv = toCsvRows(filtered("Biology Quiz 3", ALL_FILTER));
    expect(csv.find((r) => r[0] === "Youssef Emad")?.[1]).toBe("No Group");
  });
});
