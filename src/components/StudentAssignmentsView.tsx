/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { 
  Users, 
  Search, 
  Filter, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  FileText, 
  BookOpen, 
  BarChart2, 
  RefreshCw,
  Calendar,
  Layers,
  ChevronRight,
  Database,
  MinusCircle,
  UserCheck
} from "lucide-react";
import { motion } from "motion/react";
import { StudentAssignmentDocument, Quiz, StudentRecord, StudentGroup } from "../types";
import {
  ALL_FILTER,
  NO_GROUP_FILTER,
  NO_GROUP_LABEL,
  matchesGroupFilter,
  resolveGroupOptions
} from "../lib/classification";

interface StudentAssignmentsViewProps {
  assignments: StudentAssignmentDocument[];
  quizzes: Quiz[];
  /** The teacher's roster — the source of truth for who is expected to sit an assessment. */
  students: StudentRecord[];
  /** The teacher's class groups, managed from the student manager. */
  groups: StudentGroup[];
}

/** Roster status for one student on one assessment. "not_started" exists only as an absence. */
type RosterStatus = "not_started" | "in_progress" | "completed";

interface RosterRow {
  student: StudentRecord;
  status: RosterStatus;
  attempt: StudentAssignmentDocument | null;
}

export default function StudentAssignmentsView({ assignments, quizzes, students, groups }: StudentAssignmentsViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "assigned" | "in_progress" | "completed">("all");
  const [selectedQuizFilter, setSelectedQuizFilter] = useState<string>("all");
  const [rosterStatusFilter, setRosterStatusFilter] = useState<"all" | RosterStatus>("all");
  const [matchGradeOnly, setMatchGradeOnly] = useState(true);
  const [rosterGroupFilter, setRosterGroupFilter] = useState<string>(ALL_FILTER);

  /** The teacher's groups, plus any still on the roster but no longer offered, so nothing is unreachable. */
  const groupFilterOptions = useMemo(
    () => resolveGroupOptions(groups, students.map((s) => s.group)),
    [groups, students]
  );

  // Map quiz titles
  const quizMap = useMemo(() => {
    const map = new Map<string, string>();
    quizzes.forEach(q => map.set(q.id, q.title));
    return map;
  }, [quizzes]);

  // Filter assignments
  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => {
      const matchesSearch = 
        !searchTerm.trim() ||
        a.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.studentClass && a.studentClass.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (a.id && a.id.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = statusFilter === "all" || a.status === statusFilter;
      const matchesQuiz = selectedQuizFilter === "all" || a.assessmentId === selectedQuizFilter;

      return matchesSearch && matchesStatus && matchesQuiz;
    });
  }, [assignments, searchTerm, statusFilter, selectedQuizFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = assignments.length;
    const assigned = assignments.filter(a => a.status === "assigned").length;
    const inProgress = assignments.filter(a => a.status === "in_progress").length;
    const completed = assignments.filter(a => a.status === "completed").length;
    return { total, assigned, inProgress, completed };
  }, [assignments]);

  /** The assessment the roster is being computed for, or null while "All Assessments" is selected. */
  const selectedQuiz = useMemo(
    () => (selectedQuizFilter === "all" ? null : quizzes.find((q) => q.id === selectedQuizFilter) || null),
    [selectedQuizFilter, quizzes]
  );

  /**
   * Who has and has not entered the selected assessment.
   *
   * Derived entirely from data already streaming in through the existing onSnapshot
   * subscriptions, so it stays current on its own — nothing is ever marked by hand.
   *
   * Attempts are located by their student CODE rather than by matching names, so a student who
   * typed their name differently is still recognised. Attempts written before that id scheme
   * existed carry a random id and no code, so those fall back to a name match; without it an old
   * attempt would be misreported as Not Started.
   *
   * A student may now hold SEVERAL attempts at one assessment (a teacher-granted retake creates a
   * new document rather than reopening the old one), so this keeps the LATEST — otherwise a
   * student midway through a retake would be reported by their finished first attempt.
   */
  const roster = useMemo<RosterRow[]>(() => {
    if (!selectedQuiz) return [];

    const latestByCode = new Map<string, StudentAssignmentDocument>();
    const forQuiz = assignments.filter((a) => a.assessmentId === selectedQuiz.id);

    forQuiz.forEach((a) => {
      const code = (a.studentCode || "").trim().toUpperCase();
      if (!code) return;
      const current = latestByCode.get(code);
      if (!current || (Number(a.attemptNumber) || 1) >= (Number(current.attemptNumber) || 1)) {
        latestByCode.set(code, a);
      }
    });

    // Pre-code attempts: no studentCode to key on, so they are reachable only by name.
    const legacyForQuiz = forQuiz.filter((a) => !(a.studentCode || "").trim());

    const pool = matchGradeOnly && selectedQuiz.grade
      ? students.filter((s) => !s.grade || s.grade === selectedQuiz.grade)
      : students;

    return pool
      .map((student) => {
        const attempt =
          latestByCode.get((student.code || "").trim().toUpperCase()) ||
          legacyForQuiz.find(
            (a) => a.studentName?.trim().toLowerCase() === student.name.trim().toLowerCase()
          ) ||
          null;

        const status: RosterStatus =
          attempt?.status === "completed"
            ? "completed"
            : attempt
            ? "in_progress"
            : "not_started";

        return { student, status, attempt };
      })
      .sort((a, b) => {
        // Not Started first — it is the reason this table exists.
        const rank = { not_started: 0, in_progress: 1, completed: 2 };
        if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
        return a.student.name.localeCompare(b.student.name);
      });
  }, [selectedQuiz, assignments, students, matchGradeOnly]);

  const visibleRoster = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return roster.filter((row) => {
      const matchesStatus = rosterStatusFilter === "all" || row.status === rosterStatusFilter;
      const matchesGroup = matchesGroupFilter(row.student.group, rosterGroupFilter);
      const matchesSearch =
        !term ||
        row.student.name.toLowerCase().includes(term) ||
        (row.student.code || "").toLowerCase().includes(term) ||
        (row.student.grade || "").toLowerCase().includes(term) ||
        (row.student.group || "").toLowerCase().includes(term);
      return matchesStatus && matchesGroup && matchesSearch;
    });
  }, [roster, rosterStatusFilter, rosterGroupFilter, searchTerm]);

  const rosterStats = useMemo(() => ({
    total: roster.length,
    notStarted: roster.filter((r) => r.status === "not_started").length,
    inProgress: roster.filter((r) => r.status === "in_progress").length,
    completed: roster.filter((r) => r.status === "completed").length
  }), [roster]);

  const getRosterBadge = (status: RosterStatus) => {
    if (status === "completed") {
      return (
        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[11px] font-extrabold inline-flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Completed
        </span>
      );
    }
    if (status === "in_progress") {
      return (
        <span className="px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-[11px] font-extrabold inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          In Progress
        </span>
      );
    }
    // Muted on purpose: this is an absence of activity, not an alarm state.
    return (
      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-[11px] font-extrabold inline-flex items-center gap-1">
        <MinusCircle className="w-3.5 h-3.5 text-slate-400" />
        Not Started
      </span>
    );
  };

  const getStatusBadge = (status: "assigned" | "in_progress" | "completed") => {
    switch (status) {
      case "completed":
        return (
          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[11px] font-extrabold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Completed
          </span>
        );
      case "in_progress":
        return (
          <span className="px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-[11px] font-extrabold flex items-center gap-1 animate-pulse">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            In Progress
          </span>
        );
      case "assigned":
      default:
        return (
          <span className="px-2.5 py-1 bg-blue-100 text-blue-800 border border-blue-200 rounded-full text-[11px] font-extrabold flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 text-blue-600" />
            Assigned
          </span>
        );
    }
  };

  return (
    <div className="space-y-6" id="student-assignments-firestore-view" dir="ltr">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-950 via-slate-900 to-indigo-950 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 border border-teal-900/40">
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>

        <div className="relative z-10 space-y-2 text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold text-teal-300 border border-white/10">
            <Database className="w-3.5 h-3.5 text-teal-300" />
            Firestore Real-time Sync ⚡
          </div>
          <h2 className="text-xl md:text-2xl font-black">Student Assignments Log</h2>
          <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
            Live view of all individual student exam & homework sessions generated directly from assessments and blueprints stored in Firestore.
          </p>
        </div>

        {/* Live Counters */}
        <div className="relative z-10 shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-2 w-full md:w-auto">
          <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 text-center">
            <span className="text-[10px] text-slate-300 font-bold block">Total</span>
            <span className="text-lg font-black text-white">{stats.total}</span>
          </div>
          <div className="bg-blue-500/20 backdrop-blur-md p-3 rounded-2xl border border-blue-400/30 text-center">
            <span className="text-[10px] text-blue-200 font-bold block">Assigned</span>
            <span className="text-lg font-black text-blue-300">{stats.assigned}</span>
          </div>
          <div className="bg-amber-500/20 backdrop-blur-md p-3 rounded-2xl border border-amber-400/30 text-center">
            <span className="text-[10px] text-amber-200 font-bold block">Active</span>
            <span className="text-lg font-black text-amber-300">{stats.inProgress}</span>
          </div>
          <div className="bg-emerald-500/20 backdrop-blur-md p-3 rounded-2xl border border-emerald-400/30 text-center">
            <span className="text-[10px] text-emerald-200 font-bold block">Done</span>
            <span className="text-lg font-black text-emerald-300">{stats.completed}</span>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search student name, class, or assignment ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-teal-100 transition-all"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
            {(["all", "assigned", "in_progress", "completed"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg transition-all capitalize cursor-pointer ${
                  statusFilter === st ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {st === "in_progress" ? "In Progress" : st}
              </button>
            ))}
          </div>
        </div>

        {/* Quiz Filter */}
        <div className="shrink-0">
          <select
            value={selectedQuizFilter}
            onChange={(e) => setSelectedQuizFilter(e.target.value)}
            className="py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
          >
            <option value="all">All Assessments</option>
            {quizzes.map((q) => (
              <option key={q.id} value={q.id}>{q.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ================================================================
          Attendance roster — who has and has not entered this assessment.
          Only meaningful for a single assessment, so it appears once one is chosen.
      ================================================================= */}
      {selectedQuiz ? (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 md:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 text-left">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-teal-600" />
                Attendance — {selectedQuiz.title}
              </h3>
              <p className="text-[11px] text-slate-400 font-semibold">
                Live from your student roster. {rosterStats.notStarted} of {rosterStats.total} have not entered yet.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
                {([
                  ["all", `All ${rosterStats.total}`],
                  ["not_started", `Not Started ${rosterStats.notStarted}`],
                  ["in_progress", `In Progress ${rosterStats.inProgress}`],
                  ["completed", `Completed ${rosterStats.completed}`]
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setRosterStatusFilter(key)}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      rosterStatusFilter === key
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Group filter — display only, combines with the status filter and the search box */}
              <select
                value={rosterGroupFilter}
                onChange={(e) => setRosterGroupFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 focus:outline-none cursor-pointer"
                title="Filter the roster by student group"
              >
                <option value={ALL_FILTER}>All Groups</option>
                {groupFilterOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
                <option value={NO_GROUP_FILTER}>{NO_GROUP_LABEL}</option>
              </select>

              {selectedQuiz.grade && (
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={matchGradeOnly}
                    onChange={(e) => setMatchGradeOnly(e.target.checked)}
                    className="accent-teal-600 cursor-pointer"
                  />
                  {selectedQuiz.grade} only
                </label>
              )}
            </div>
          </div>

          {visibleRoster.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Users className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-600">
                {students.length === 0
                  ? "No students on the roster yet — add them in the Student Manager."
                  : "No students match this filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Grade</th>
                    <th className="py-3 px-4">Group</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {visibleRoster.map(({ student, status, attempt }) => {
                    const qCount = attempt?.questionIds?.length || selectedQuiz.questions?.length || 0;
                    const atQ = attempt?.currentProgress?.currentQuestionIndex || 0;

                    return (
                      <tr
                        key={student.id || student.code}
                        className={`transition-colors ${
                          status === "not_started" ? "bg-slate-50/40" : "hover:bg-slate-50/60"
                        }`}
                      >
                        <td className="py-3 px-4 font-bold text-slate-800">{student.name}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-500">{student.code || "—"}</td>
                        <td className="py-3 px-4 text-slate-500 font-semibold">{student.grade || "—"}</td>
                        <td className="py-3 px-4 text-slate-500 font-semibold">{student.group || "—"}</td>
                        <td className="py-3 px-4">{getRosterBadge(status)}</td>
                        <td className="py-3 px-4 text-slate-500 font-semibold">
                          {status === "not_started"
                            ? "—"
                            : status === "completed"
                            ? `${qCount} / ${qCount}`
                            : `Q ${atQ} / ${qCount}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm text-center space-y-1">
          <UserCheck className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-xs font-bold text-slate-600">
            Choose an assessment above to see who has not entered it yet.
          </p>
          <p className="text-[11px] text-slate-400 font-semibold">
            Attendance is per-assessment, so it needs one selected.
          </p>
        </div>
      )}

      {/* Assignments Table / Cards */}
      {filteredAssignments.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-3">
          <Users className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700">No Student Assignments Found</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            When students enter an assessment code, individual student assignment records are created in Firestore and tracked in real time.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Student Name & Class</th>
                  <th className="py-3.5 px-4">Assessment Title</th>
                  <th className="py-3.5 px-4">Questions Count</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Progress / Time Taken</th>
                  <th className="py-3.5 px-4">Assigned Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredAssignments.map((assignment) => {
                  const quizTitle = quizMap.get(assignment.assessmentId) || assignment.assessmentId || "Assessment";
                  const qCount = assignment.generatedQuestions?.length || assignment.questionIds?.length || 0;
                  const currentQIndex = assignment.currentProgress?.currentQuestionIndex || 0;
                  const timeTaken = assignment.currentProgress?.timeTaken || 0;

                  return (
                    <tr key={assignment.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Student Info */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <span className="font-bold text-slate-800 block">{assignment.studentName}</span>
                          <span className="text-[10px] font-semibold text-slate-400 block">
                            Class: {assignment.studentClass || "N/A"} • ID: {assignment.id.slice(-6)}
                          </span>
                        </div>
                      </td>

                      {/* Assessment Title */}
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-indigo-950 block">{quizTitle}</span>
                        <span className="text-[10px] text-slate-400 font-mono">Code: {assignment.assessmentId}</span>
                      </td>

                      {/* Questions */}
                      <td className="py-3.5 px-4 font-bold text-slate-700">
                        {qCount} Questions
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {getStatusBadge(assignment.status)}
                      </td>

                      {/* Progress */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1 max-w-[140px]">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                            <span>Q {currentQIndex} / {qCount}</span>
                            <span>{timeTaken ? `${Math.floor(timeTaken / 60)}m ${timeTaken % 60}s` : "0s"}</span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${
                                assignment.status === "completed" ? "bg-emerald-500" : "bg-teal-500"
                              }`}
                              style={{ width: `${qCount > 0 ? Math.min(100, (currentQIndex / qCount) * 100) : 0}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 text-slate-500 text-[11px] font-medium">
                        {new Date(assignment.createdAt || Date.now()).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
