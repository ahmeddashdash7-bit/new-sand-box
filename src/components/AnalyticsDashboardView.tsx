/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { 
  Users, 
  CheckCircle2, 
  TrendingUp, 
  Award, 
  Clock, 
  AlertTriangle, 
  Lightbulb, 
  BookOpen, 
  Target, 
  BarChart3, 
  Sparkles, 
  HelpCircle,
  Medal,
  ChevronRight,
  Filter,
  TrendingDown,
  Layers,
  GraduationCap,
  Calendar,
  FileText
} from "lucide-react";
import { motion } from "motion/react";
import { StudentResult, HomeworkBlueprint, BankQuestion, Quiz, Subject, DifficultyLevel, Question, StudentRecord, StudentGroup } from "../types";
import {
  ALL_FILTER,
  NO_GROUP_FILTER,
  NO_GROUP_LABEL,
  matchesGroupFilter,
  resolveGroupOptions,
  resolveResultGroup,
  resolveSubjectFromTitle
} from "../lib/classification";

interface AnalyticsDashboardViewProps {
  studentResults: StudentResult[];
  blueprints: HomeworkBlueprint[];
  bankQuestions: BankQuestion[];
  quizzes: Quiz[];
  /** Teacher roster, used only to resolve each result's group for the group filter. */
  students?: StudentRecord[];
  /** The teacher's class groups, managed from the student manager. */
  groups?: StudentGroup[];
}

/**
 * Ensures internal document or question IDs (e.g. bq-1785...) are NEVER displayed to teachers.
 * Returns a human-readable question title, topic name, or clean fallback.
 */
function sanitizeTitleOrTopic(idOrText?: string, topic?: string, lesson?: string, subject?: string): string {
  if (topic && topic.trim() && !topic.toLowerCase().startsWith("bq-") && !topic.toLowerCase().startsWith("q-")) {
    return topic.trim();
  }
  if (lesson && lesson.trim() && !lesson.toLowerCase().startsWith("bq-") && !lesson.toLowerCase().startsWith("q-")) {
    return lesson.trim();
  }
  if (idOrText && idOrText.trim()) {
    const text = idOrText.trim();
    // Check if text looks like a raw ID
    if (/^(bq-|q-|doc-|sub-|ast-)[a-z0-9_-]+/i.test(text) || (!text.includes(" ") && text.length > 12)) {
      return subject ? `${subject} Core Concept` : "Science Concept";
    }
    return text;
  }
  return subject ? `${subject} Concept` : "Science Core Topic";
}

export default function AnalyticsDashboardView({
  studentResults,
  blueprints,
  bankQuestions,
  quizzes,
  students = [],
  groups = []
}: AnalyticsDashboardViewProps) {
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>(ALL_FILTER);

  const groupFilterOptions = useMemo(
    () => resolveGroupOptions(groups, students.map((s) => s.group)),
    [groups, students]
  );

  /**
   * Resolves the group of the student behind a submission. Submissions never stored a group (and
   * still don't — nothing about how results are recorded changed), so the roster is consulted.
   *
   * The matching logic now lives in lib/classification alongside matchesGroupFilter, shared with
   * the submissions table so both screens group a result identically. Behaviour is unchanged
   * except that the student access code is tried before the older id/seat/name fallbacks.
   */
  const resolveGroupOf = useMemo(() => {
    return (result: StudentResult): string | undefined => resolveResultGroup(students, result);
  }, [students]);

  /** Question id -> its bank subject. Used to attribute a result that names no subject itself. */
  const questionSubjectById = useMemo(() => {
    const map = new Map<string, Subject>();
    (bankQuestions || []).forEach((q) => {
      if (q?.id && q.subject) map.set(q.id, q.subject);
    });
    return map;
  }, [bankQuestions]);

  /** Assessment id -> its declared subject. The authoritative answer for any submission. */
  const quizSubjectById = useMemo(() => {
    const map = new Map<string, Subject>();
    (quizzes || []).forEach((q) => {
      if (q?.id && q.subject) map.set(q.id, q.subject);
    });
    return map;
  }, [quizzes]);

  /**
   * Which subject a submission belongs to.
   *
   * This used to be `quizTitle.toLowerCase().includes(subject)` with a `quizSnapshot?.subject`
   * preference in front of it. Both halves were wrong in practice:
   *
   *  - `quizSnapshot` is NEVER persisted (saveSubmissionToFirestore does not write it), so every
   *    submission read back from Firestore falls through to the title guess. The exact-match
   *    branch was effectively dead.
   *  - A title guess cannot separate "Science" from "Integrated Science", because one name
   *    contains the other. "Integrated Science — Unit 2" matched both, so a single result was
   *    counted under two subjects and the teacher's two subjects blurred together.
   *
   * So resolution now walks real data first, in descending order of authority, and only guesses
   * from the title as a genuine last resort — where longest-name-wins keeps the answer unique.
   */
  const resolveResultSubject = useMemo(() => {
    return (r: StudentResult): string | undefined =>
      r.quizSnapshot?.subject ||
      quizSubjectById.get(r.quizId) ||
      (r.assessmentId ? quizSubjectById.get(r.assessmentId) : undefined) ||
      // The questions actually answered still name their own subject in the bank.
      r.answers?.map((a) => questionSubjectById.get(a.questionId)).find(Boolean) ||
      resolveSubjectFromTitle(r.quizTitle);
  }, [quizSubjectById, questionSubjectById]);

  // Filter student results by selected subject, then by selected group. Every downstream
  // statistic already derives from filteredResults, so the group filter simply narrows the
  // same student list the dashboard has always used — no calculation was altered.
  const filteredResults = useMemo(() => {
    const bySubject =
      selectedSubjectFilter === "all"
        ? studentResults
        : studentResults.filter((r) => resolveResultSubject(r) === selectedSubjectFilter);

    if (selectedGroupFilter === ALL_FILTER) return bySubject;
    return bySubject.filter((r) => matchesGroupFilter(resolveGroupOf(r), selectedGroupFilter));
  }, [studentResults, selectedSubjectFilter, selectedGroupFilter, resolveGroupOf, resolveResultSubject]);

  // Quick lookup maps for Questions & Bank Questions
  const questionLookup = useMemo(() => {
    const map = new Map<string, { text: string; subject: Subject; difficulty: DifficultyLevel; topic?: string; lesson?: string; options?: string[]; correctAnswerIndex?: number }>();

    bankQuestions.forEach(q => {
      map.set(q.id, {
        text: q.text,
        subject: q.subject,
        difficulty: q.difficulty,
        topic: q.topic,
        lesson: q.lesson,
        options: q.options,
        correctAnswerIndex: q.correctAnswerIndex
      });
      map.set(q.text.trim(), {
        text: q.text,
        subject: q.subject,
        difficulty: q.difficulty,
        topic: q.topic,
        lesson: q.lesson,
        options: q.options,
        correctAnswerIndex: q.correctAnswerIndex
      });
    });

    quizzes.forEach(qz => {
      qz.questions.forEach(q => {
        map.set(q.id, {
          text: q.text,
          subject: q.subject || qz.subject,
          difficulty: q.difficulty || DifficultyLevel.Medium,
          topic: q.topic,
          lesson: q.lesson,
          options: q.options,
          correctAnswerIndex: q.correctAnswerIndex
        });
        map.set(q.text.trim(), {
          text: q.text,
          subject: q.subject || qz.subject,
          difficulty: q.difficulty || DifficultyLevel.Medium,
          topic: q.topic,
          lesson: q.lesson,
          options: q.options,
          correctAnswerIndex: q.correctAnswerIndex
        });
      });
    });

    return map;
  }, [bankQuestions, quizzes]);

  // SECTION 1 — Classroom Overview Metrics
  const overviewStats = useMemo(() => {
    const uniqueStudentsSet = new Set(filteredResults.map((r) => r.studentName.trim().toLowerCase()));
    const activeStudents = uniqueStudentsSet.size;

    const homeworkResults = filteredResults.filter(
      (r) => r.quizId.startsWith("hw-") || r.quizTitle.toLowerCase().includes("homework") || r.quizTitle.toLowerCase().includes("blueprint")
    );

    const expectedHomeworks = Math.max(1, blueprints.length * Math.max(1, activeStudents));
    const homeworkCompletionPct = Math.min(100, Math.round((homeworkResults.length / expectedHomeworks) * 100));

    const overallPercentages = filteredResults.map((r) => (r.score / Math.max(1, r.totalQuestions)) * 100);
    const averageGrade = overallPercentages.length > 0
      ? Math.round(overallPercentages.reduce((a, b) => a + b, 0) / overallPercentages.length)
      : 0;

    const passingCount = filteredResults.filter((r) => (r.score / Math.max(1, r.totalQuestions)) >= 0.5).length;
    const passRate = filteredResults.length > 0
      ? Math.round((passingCount / filteredResults.length) * 100)
      : 0;

    const totalSeconds = filteredResults.reduce((sum, r) => sum + (r.timeTakenSeconds || (r.timeSpentMinutes ? r.timeSpentMinutes * 60 : 300)), 0);
    const avgSeconds = filteredResults.length > 0 ? Math.round(totalSeconds / filteredResults.length) : 0;
    const avgSubmissionTime = avgSeconds >= 60 
      ? `${Math.floor(avgSeconds / 60)}m ${avgSeconds % 60}s` 
      : `${avgSeconds}s`;

    return {
      activeStudents,
      homeworkCompletionPct,
      averageGrade,
      passRate,
      avgSubmissionTime,
      totalSubmissions: filteredResults.length
    };
  }, [filteredResults, blueprints]);

  // SECTION 2 — Teaching Insights
  const teachingInsights = useMemo(() => {
    // Subject Averages
    // Seeded from the enum so a newly added subject (e.g. Science, which is distinct from
    // Integrated Science) is never silently missing from the breakdown.
    const subjectScoresMap: Record<string, { totalPct: number; count: number }> = {};
    Object.values(Subject).forEach((s) => {
      subjectScoresMap[s] = { totalPct: 0, count: 0 };
    });

    filteredResults.forEach((r) => {
      /**
       * Resolved from real data, not defaulted.
       *
       * This read `r.quizSnapshot?.subject || Subject.IntegratedScience`, and since quizSnapshot is
       * never persisted, EVERY submission was attributed to Integrated Science — so "most
       * difficult subject" and "best performing subject" were computed from a single bucket that
       * happened to be named after one of the teacher's real subjects. A result whose subject
       * genuinely cannot be determined is now skipped rather than assigned to someone else's.
       */
      const subj = resolveResultSubject(r);
      if (!subj) return;
      const pct = (r.score / Math.max(1, r.totalQuestions)) * 100;
      if (!subjectScoresMap[subj]) {
        subjectScoresMap[subj] = { totalPct: 0, count: 0 };
      }
      subjectScoresMap[subj].totalPct += pct;
      subjectScoresMap[subj].count += 1;
    });

    const subjectAverages = Object.entries(subjectScoresMap)
      .filter(([_, data]) => data.count > 0)
      .map(([subj, data]) => ({
        subject: subj,
        avg: Math.round(data.totalPct / data.count)
      }))
      .sort((a, b) => a.avg - b.avg);

    const mostDifficultSubject = subjectAverages.length > 0 
      ? `${subjectAverages[0].subject} (${subjectAverages[0].avg}% Avg)` 
      : "None identified yet";

    const bestPerformingSubject = subjectAverages.length > 0 
      ? `${subjectAverages[subjectAverages.length - 1].subject} (${subjectAverages[subjectAverages.length - 1].avg}% Avg)` 
      : "None identified yet";

    // Students needing attention count
    const studentMap = new Map<string, { name: string; totalScoreSum: number; count: number }>();
    filteredResults.forEach((r) => {
      const name = r.studentName.trim();
      const pct = (r.score / Math.max(1, r.totalQuestions)) * 100;
      const existing = studentMap.get(name) || { name, totalScoreSum: 0, count: 0 };
      existing.totalScoreSum += pct;
      existing.count += 1;
      studentMap.set(name, existing);
    });

    let studentsNeedingAttentionCount = 0;
    studentMap.forEach((s) => {
      const avg = s.totalScoreSum / Math.max(1, s.count);
      if (avg < 60 || s.count < blueprints.length) {
        studentsNeedingAttentionCount++;
      }
    });

    // Missing Submissions
    const totalExpectedHW = Math.max(0, blueprints.length * Math.max(1, overviewStats.activeStudents));
    const hwResultsCount = filteredResults.filter((r) => r.quizId.startsWith("hw-") || r.quizTitle.toLowerCase().includes("homework")).length;
    const missingSubmissionsCount = Math.max(0, totalExpectedHW - hwResultsCount);

    // Improvement Trend
    let improvementTrend = "+3.5% vs previous cycle";
    if (filteredResults.length >= 4) {
      const sortedByDate = [...filteredResults].sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
      const mid = Math.floor(sortedByDate.length / 2);
      const firstHalf = sortedByDate.slice(0, mid);
      const secondHalf = sortedByDate.slice(mid);

      const firstAvg = firstHalf.reduce((acc, r) => acc + (r.score / Math.max(1, r.totalQuestions)) * 100, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((acc, r) => acc + (r.score / Math.max(1, r.totalQuestions)) * 100, 0) / secondHalf.length;

      const diff = Math.round(secondAvg - firstAvg);
      improvementTrend = diff >= 0 ? `+${diff}% vs previous cycle` : `${diff}% vs previous cycle`;
    }

    // Difficulty level causing most mistakes
    const difficultyErrorMap: Record<string, { total: number; wrong: number }> = {
      [DifficultyLevel.Easy]: { total: 0, wrong: 0 },
      [DifficultyLevel.Medium]: { total: 0, wrong: 0 },
      [DifficultyLevel.Hard]: { total: 0, wrong: 0 }
    };

    filteredResults.forEach((r) => {
      r.answers?.forEach((ans) => {
        const info = questionLookup.get(ans.questionId);
        const diff = info?.difficulty || DifficultyLevel.Medium;
        difficultyErrorMap[diff].total += 1;
        if (!ans.isCorrect) {
          difficultyErrorMap[diff].wrong += 1;
        }
      });
    });

    let difficultyCausingMostMistakes = "Hard Questions";
    let highestErrorRate = -1;

    Object.entries(difficultyErrorMap).forEach(([diff, data]) => {
      if (data.total > 0) {
        const errRate = data.wrong / data.total;
        if (errRate > highestErrorRate) {
          highestErrorRate = errRate;
          difficultyCausingMostMistakes = `${diff} Questions (${Math.round(errRate * 100)}% Error Rate)`;
        }
      }
    });

    return {
      mostDifficultSubject,
      bestPerformingSubject,
      studentsNeedingAttentionCount,
      missingSubmissionsCount,
      improvementTrend,
      difficultyCausingMostMistakes
    };
  }, [filteredResults, blueprints, overviewStats, questionLookup]);

  // SECTION 3 — Students Needing Attention
  const studentsNeedingAttention = useMemo(() => {
    const studentDataMap = new Map<string, {
      studentName: string;
      scores: number[];
      completedHomeworks: number;
      totalSubmissions: number;
      lastScore: number;
    }>();

    filteredResults.forEach((r) => {
      const name = r.studentName.trim();
      const pct = Math.round((r.score / Math.max(1, r.totalQuestions)) * 100);
      const isHW = r.quizId.startsWith("hw-") || r.quizTitle.toLowerCase().includes("homework");

      const existing = studentDataMap.get(name) || {
        studentName: name,
        scores: [],
        completedHomeworks: 0,
        totalSubmissions: 0,
        lastScore: pct
      };

      existing.scores.push(pct);
      existing.totalSubmissions += 1;
      if (isHW) existing.completedHomeworks += 1;
      existing.lastScore = pct;

      studentDataMap.set(name, existing);
    });

    const list: Array<{
      studentName: string;
      averageScore: number;
      completionRate: number;
      reason: string;
    }> = [];

    const totalAssignedHW = Math.max(1, blueprints.length);

    studentDataMap.forEach((data) => {
      const avgScore = Math.round(data.scores.reduce((a, b) => a + b, 0) / Math.max(1, data.scores.length));
      const completionRate = Math.min(100, Math.round((data.completedHomeworks / totalAssignedHW) * 100));

      const reasons: string[] = [];

      if (avgScore < 50) {
        reasons.push(`Low Average Score (${avgScore}%)`);
      } else if (avgScore < 60) {
        reasons.push(`Borderline Pass Rate (${avgScore}%)`);
      }

      if (data.completedHomeworks < totalAssignedHW) {
        const missing = totalAssignedHW - data.completedHomeworks;
        reasons.push(`Missing ${missing} Homework${missing > 1 ? "s" : ""}`);
      }

      if (data.scores.length >= 2) {
        const lastTwo = data.scores.slice(-2);
        if (lastTwo.every((s) => s < 50)) {
          reasons.push("Consecutive Low Scores");
        }
      }

      if (reasons.length > 0) {
        list.push({
          studentName: data.studentName,
          averageScore: avgScore,
          completionRate,
          reason: reasons.join(" • ")
        });
      }
    });

    return list.sort((a, b) => a.averageScore - b.averageScore).slice(0, 8);
  }, [filteredResults, blueprints]);

  // SECTION 4 — Subject Performance
  const subjectPerformance = useMemo(() => {
    // Derived from the enum so every subject gets a card, including ones added later.
    const subjects = Object.values(Subject);

    return subjects.map((subj) => {
      /**
       * Exactly one subject per result — see resolveResultSubject. The previous test was
       * `quizTitle.includes(subject)`, which cannot separate "Science" from "Integrated Science"
       * because one name contains the other: a single "Integrated Science" result was counted on
       * both cards, inflating each and making the two subjects indistinguishable.
       */
      const subjResults = filteredResults.filter((r) => resolveResultSubject(r) === subj);

      const totalSubmissions = subjResults.length;
      let avgScore = 0;

      if (totalSubmissions > 0) {
        const sum = subjResults.reduce((acc, r) => acc + ((r.score / Math.max(1, r.totalQuestions)) * 100), 0);
        avgScore = Math.round(sum / totalSubmissions);
      } else {
        // Fallback default calculation from question bank accuracy if no explicit submissions
        let bankCorrect = 0;
        let bankTotal = 0;

        filteredResults.forEach((r) => {
          r.answers?.forEach((ans) => {
            const info = questionLookup.get(ans.questionId);
            if (info?.subject === subj) {
              bankTotal++;
              if (ans.isCorrect) bankCorrect++;
            }
          });
        });

        if (bankTotal > 0) {
          avgScore = Math.round((bankCorrect / bankTotal) * 100);
        }
      }

      let status = "Needs Attention";
      let statusColor = "text-amber-700 bg-amber-50 border-amber-200";

      if (avgScore >= 75) {
        status = "Strong Understanding";
        statusColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
      } else if (avgScore >= 60) {
        status = "On Track";
        statusColor = "text-indigo-700 bg-indigo-50 border-indigo-200";
      }

      return {
        subject: subj,
        avgScore,
        totalSubmissions,
        status,
        statusColor
      };
    });
  }, [filteredResults, questionLookup]);

  // SECTION 5 — Weakest Topics (NEVER display internal IDs e.g. bq-1785...)
  const weakestTopics = useMemo(() => {
    const topicMap = new Map<string, {
      topicName: string;
      subject: string;
      difficulty: string;
      totalAsked: number;
      correctCount: number;
    }>();

    filteredResults.forEach((res) => {
      const snapshotQuestions = res.quizSnapshot?.questions || [];
      const snapMap = new Map<string, Question>(snapshotQuestions.map((q) => [q.id, q]));

      res.answers?.forEach((ans) => {
        const qObj = snapMap.get(ans.questionId);
        const info = questionLookup.get(ans.questionId);

        const rawText = qObj?.text || info?.text || "";
        const topic = qObj?.topic || info?.topic;
        const lesson = qObj?.lesson || info?.lesson;
        const subject = qObj?.subject || info?.subject || res.quizSnapshot?.subject || Subject.IntegratedScience;
        const difficulty = qObj?.difficulty || info?.difficulty || DifficultyLevel.Medium;

        // Ensure clean topic name without raw IDs
        const cleanName = sanitizeTitleOrTopic(rawText, topic, lesson, subject);

        const existing = topicMap.get(cleanName) || {
          topicName: cleanName,
          subject,
          difficulty,
          totalAsked: 0,
          correctCount: 0
        };

        existing.totalAsked += 1;
        if (ans.isCorrect) {
          existing.correctCount += 1;
        }

        topicMap.set(cleanName, existing);
      });
    });

    const list = Array.from(topicMap.values()).map((t) => {
      const accuracy = t.totalAsked > 0 ? Math.round((t.correctCount / t.totalAsked) * 100) : 0;
      return {
        ...t,
        accuracyPercentage: accuracy
      };
    });

    // Sort from weakest to strongest
    return list
      .filter((t) => t.totalAsked >= 1)
      .sort((a, b) => a.accuracyPercentage - b.accuracyPercentage || b.totalAsked - a.totalAsked)
      .slice(0, 8);
  }, [filteredResults, questionLookup]);

  // SECTION 6 — Recent Assessments
  const recentAssessments = useMemo(() => {
    const assessmentMap = new Map<string, {
      id: string;
      name: string;
      totalScorePctSum: number;
      submissionCount: number;
      lastSubmittedAt: number;
    }>();

    filteredResults.forEach((r) => {
      const key = r.quizId || r.quizTitle;
      const pct = (r.score / Math.max(1, r.totalQuestions)) * 100;
      const date = r.submittedAt || Date.now();

      const existing = assessmentMap.get(key) || {
        id: key,
        name: r.quizTitle || "Science Assessment",
        totalScorePctSum: 0,
        submissionCount: 0,
        lastSubmittedAt: date
      };

      existing.totalScorePctSum += pct;
      existing.submissionCount += 1;
      if (date > existing.lastSubmittedAt) {
        existing.lastSubmittedAt = date;
      }

      assessmentMap.set(key, existing);
    });

    const activeStudents = Math.max(1, overviewStats.activeStudents);

    return Array.from(assessmentMap.values())
      .map((a) => {
        const avgScore = Math.round(a.totalScorePctSum / Math.max(1, a.submissionCount));
        const completionPct = Math.min(100, Math.round((a.submissionCount / activeStudents) * 100));
        const formattedDate = new Date(a.lastSubmittedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        });

        return {
          ...a,
          avgScore,
          completionPct,
          formattedDate
        };
      })
      .sort((a, b) => b.lastSubmittedAt - a.lastSubmittedAt)
      .slice(0, 6);
  }, [filteredResults, overviewStats.activeStudents]);

  // SECTION 7 — Student Leaderboard
  const studentRankings = useMemo(() => {
    const map = new Map<string, {
      studentName: string;
      seatNumber: string;
      totalCompleted: number;
      totalScorePctSum: number;
    }>();

    filteredResults.forEach((r) => {
      const key = r.studentName.trim().toLowerCase();
      const pct = (r.score / Math.max(1, r.totalQuestions)) * 100;

      const existing = map.get(key) || {
        studentName: r.studentName,
        seatNumber: r.seatNumber || "—",
        totalCompleted: 0,
        totalScorePctSum: 0
      };

      existing.totalCompleted += 1;
      existing.totalScorePctSum += pct;

      map.set(key, existing);
    });

    return Array.from(map.values())
      .map((s) => ({
        ...s,
        avgScore: Math.round(s.totalScorePctSum / Math.max(1, s.totalCompleted))
      }))
      .sort((a, b) => b.avgScore - a.avgScore || b.totalCompleted - a.totalCompleted)
      .slice(0, 10);
  }, [filteredResults]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12" id="analytics-dashboard-main-view" dir="ltr">
      
      {/* Top Header & Subject Filter Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border border-slate-800">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>

        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold text-indigo-300 border border-white/10">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Classroom Analytics & Pedagogical Dashboard
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">Teaching & Assessment Insights</h2>
          <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
            Actionable educational analysis focusing on learning outcomes, topic mastery, and targeted student support.
          </p>
        </div>

        {/* Subject Selector */}
        <div className="relative z-10 shrink-0 w-full sm:w-auto">
          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
              Filter Classroom View:
            </label>
            <select
              value={selectedSubjectFilter}
              onChange={(e) => setSelectedSubjectFilter(e.target.value)}
              className="w-full sm:w-52 py-2 px-3 bg-slate-900 text-white rounded-xl text-xs font-bold outline-none border border-slate-700 cursor-pointer hover:border-slate-500 transition-colors"
            >
              <option value="all">All Subjects</option>
              {Object.values(Subject).map((sub) => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>

            <select
              value={selectedGroupFilter}
              onChange={(e) => setSelectedGroupFilter(e.target.value)}
              className="w-full sm:w-52 py-2 px-3 bg-slate-900 text-white rounded-xl text-xs font-bold outline-none border border-slate-700 cursor-pointer hover:border-slate-500 transition-colors"
              title="Filter every dashboard view by student group"
            >
              <option value={ALL_FILTER}>All Groups</option>
              {groupFilterOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
              <option value={NO_GROUP_FILTER}>{NO_GROUP_LABEL}</option>
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1 — Classroom Overview */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            Classroom Overview
          </h3>
          <span className="text-xs font-bold text-slate-400">Key Educational Indicators</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Active Students */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Active Students</span>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900">{overviewStats.activeStudents}</div>
            <p className="text-[10px] text-slate-400 font-medium">Participating in coursework</p>
          </div>

          {/* Homework Completion % */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Homework Completion</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-950">{overviewStats.homeworkCompletionPct}%</div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${overviewStats.homeworkCompletionPct}%` }}
              ></div>
            </div>
          </div>

          {/* Average Grade */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Average Grade</span>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-amber-950">{overviewStats.averageGrade}%</div>
            <p className="text-[10px] text-slate-400 font-medium">Across {overviewStats.totalSubmissions} submissions</p>
          </div>

          {/* Pass Rate */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Pass Rate</span>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <Award className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-blue-950">{overviewStats.passRate}%</div>
            <p className="text-[10px] text-slate-400 font-medium">Scores ≥ 50% threshold</p>
          </div>

          {/* Average Submission Time */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all space-y-2 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Avg Submission Time</span>
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-purple-950">{overviewStats.avgSubmissionTime}</div>
            <p className="text-[10px] text-slate-400 font-medium">Average time per task</p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2 — Teaching Insights */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            Teaching Insights
          </h3>
          <span className="text-xs font-bold text-slate-400">Classroom Diagnoses & Highlights</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Most Difficult Subject */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider">Most Difficult Subject</span>
            </div>
            <p className="text-lg font-black text-slate-800">{teachingInsights.mostDifficultSubject}</p>
            <p className="text-[11px] text-slate-500">Requires additional review sessions and focused practice.</p>
          </div>

          {/* Best Performing Subject */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-emerald-600">
              <Award className="w-4 h-4 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider">Best Performing Subject</span>
            </div>
            <p className="text-lg font-black text-slate-800">{teachingInsights.bestPerformingSubject}</p>
            <p className="text-[11px] text-slate-500">Highest mastery rate among active students.</p>
          </div>

          {/* Students Needing Attention */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-amber-600">
              <Users className="w-4 h-4 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider">Students Needing Support</span>
            </div>
            <p className="text-lg font-black text-slate-800">{teachingInsights.studentsNeedingAttentionCount} Students</p>
            <p className="text-[11px] text-slate-500">Low scores or incomplete homework assignments.</p>
          </div>

          {/* Missing Submissions */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-indigo-600">
              <FileText className="w-4 h-4 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider">Missing Submissions</span>
            </div>
            <p className="text-lg font-black text-slate-800">{teachingInsights.missingSubmissionsCount} Pending</p>
            <p className="text-[11px] text-slate-500">Outstanding homework assignments across class rosters.</p>
          </div>

          {/* Improvement Trend */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-blue-600">
              <TrendingUp className="w-4 h-4 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider">Improvement Trend</span>
            </div>
            <p className="text-lg font-black text-slate-800">{teachingInsights.improvementTrend}</p>
            <p className="text-[11px] text-slate-500">Comparison between recent and earlier assessment runs.</p>
          </div>

          {/* Difficulty Level Causing Mistakes */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-purple-600">
              <Target className="w-4 h-4 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider">Main Error Source</span>
            </div>
            <p className="text-lg font-black text-slate-800">{teachingInsights.difficultyCausingMostMistakes}</p>
            <p className="text-[11px] text-slate-500">Question difficulty category producing most incorrect choices.</p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3 — Students Needing Attention */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            Students Needing Attention
          </h3>
          <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100">
            Early Intervention Focus 🎯
          </span>
        </div>

        {studentsNeedingAttention.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-200/80 text-center text-slate-400 text-xs">
            🎉 All active students are performing well with no identified risk flags.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {studentsNeedingAttention.map((student) => (
              <div 
                key={student.studentName}
                className="bg-white p-5 rounded-2xl border border-rose-100 shadow-sm space-y-3 relative overflow-hidden"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <span className="font-extrabold text-slate-900 text-sm">{student.studentName}</span>
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                    Needs Review
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 p-2 rounded-xl text-center">
                    <span className="text-[10px] text-slate-400 font-bold block">Average</span>
                    <span className="font-black text-slate-900 text-sm">{student.averageScore}%</span>
                  </div>

                  <div className="bg-slate-50 p-2 rounded-xl text-center">
                    <span className="text-[10px] text-slate-400 font-bold block">Completion</span>
                    <span className="font-black text-slate-900 text-sm">{student.completionRate}%</span>
                  </div>
                </div>

                <div className="text-[11px] font-semibold text-rose-700 bg-rose-50/80 p-2 rounded-xl border border-rose-100 leading-tight">
                  ⚠️ {student.reason}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 4 — Subject Performance */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            Subject Performance
          </h3>
          <span className="text-xs font-bold text-slate-400">Curriculum Mastery Breakdown</span>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {subjectPerformance.map((item) => (
              <div key={item.subject} className="space-y-2 bg-slate-50/60 p-4 rounded-xl border border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{item.subject}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${item.statusColor}`}>
                      {item.status}
                    </span>
                  </div>
                  <span className="font-black text-slate-900 text-sm">{item.avgScore}%</span>
                </div>

                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${item.avgScore}%` }}
                  ></div>
                </div>

                <div className="flex justify-between text-[11px] text-slate-400 font-medium pt-1">
                  <span>Submissions: {item.totalSubmissions}</span>
                  <span>Target: 70%+</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 5 — Weakest Topics (Zero internal IDs e.g. bq-1785...) */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-rose-600" />
            Weakest Topics & Concepts
          </h3>
          <span className="text-xs font-bold text-slate-400">Sorted by Lowest Correct Rate</span>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          {weakestTopics.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No topic weakness data recorded yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {weakestTopics.map((topic, idx) => (
                <div 
                  key={idx}
                  className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/70 space-y-2.5 hover:bg-slate-100/80 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-slate-900 text-xs leading-snug line-clamp-2">
                      {topic.topicName}
                    </span>
                    <span className="text-[10px] font-black bg-rose-100 text-rose-800 px-2 py-0.5 rounded-md shrink-0">
                      {topic.accuracyPercentage}% Correct
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 pt-1 border-t border-slate-200/60">
                    <span>{topic.subject}</span>
                    <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                      {topic.difficulty}
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-400 font-medium">
                    Asked {topic.totalAsked} times in assessments
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 6 — Recent Assessments */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            Recent Assessments
          </h3>
          <span className="text-xs font-bold text-slate-400">Quizzes & Homework Run History</span>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          {recentAssessments.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No assessment runs recorded yet.</p>
          ) : (
            <div className="space-y-2.5">
              {recentAssessments.map((item) => (
                <div 
                  key={item.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 bg-slate-50/70 hover:bg-slate-100/70 rounded-xl border border-slate-100 transition-all text-xs gap-3"
                >
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900 text-sm block">{item.name}</span>
                    <span className="text-[10px] text-slate-400 font-medium block">
                      Last Submission: {item.formattedDate}
                    </span>
                  </div>

                  <div className="flex items-center gap-6 text-right self-end sm:self-auto">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Avg Score</span>
                      <span className="font-black text-indigo-950 text-sm">{item.avgScore}%</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Submissions</span>
                      <span className="font-bold text-slate-800 text-xs">{item.submissionCount}</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Completion</span>
                      <span className="font-bold text-emerald-700 text-xs">{item.completionPct}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 7 — Student Leaderboard */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <Medal className="w-5 h-5 text-amber-500" />
            Student Leaderboard
          </h3>
          <span className="text-xs font-bold text-slate-400">Ranked by Average Score</span>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          {studentRankings.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No student rankings available yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {studentRankings.map((student, rankIdx) => {
                let badgeBg = "bg-slate-100 text-slate-600";
                let badgeText = `#${rankIdx + 1}`;
                if (rankIdx === 0) {
                  badgeBg = "bg-amber-400 text-slate-950 font-black shadow-sm";
                  badgeText = "🥇 #1";
                } else if (rankIdx === 1) {
                  badgeBg = "bg-slate-300 text-slate-900 font-bold";
                  badgeText = "🥈 #2";
                } else if (rankIdx === 2) {
                  badgeBg = "bg-amber-700 text-white font-bold";
                  badgeText = "🥉 #3";
                }

                return (
                  <div
                    key={student.studentName}
                    className="flex items-center justify-between p-3.5 bg-slate-50/80 hover:bg-slate-100/80 rounded-xl border border-slate-200/70 transition-all text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-lg text-[11px] ${badgeBg}`}>
                        {badgeText}
                      </span>
                      <div>
                        <span className="font-extrabold text-slate-900 block text-sm">{student.studentName}</span>
                        <span className="text-[10px] text-slate-400">Seat / Group: {student.seatNumber}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-black text-indigo-950 text-sm block">{student.avgScore}%</span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {student.totalCompleted} tasks completed
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
