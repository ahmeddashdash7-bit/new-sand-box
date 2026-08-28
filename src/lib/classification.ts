/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Grade + group vocabularies used by the teacher-facing pickers and filters.
 *
 * Grades stay a plain array: adding another academic year is a one-line change here and every
 * selector/filter picks it up. Values are persisted verbatim to Firestore (same contract as the
 * enums in types.ts), so edit an existing entry only if you intend to change what new documents
 * store.
 *
 * Groups are no longer a fixed list — the teacher creates them from the student manager and they
 * live in the `groups` collection. resolveGroupOptions() is what every picker calls; this module
 * still owns the *shape* of the vocabulary (sentinels, normalization, the legacy-value fallback)
 * so all three filters keep answering "is this student in the selected group?" identically.
 */

import { GradeLevel, StudentGroup, StudentRecord, StudentResult, Subject } from "../types";

/** The grade levels a teacher can choose from. Derived from GradeLevel so there is one source. */
export const GRADE_OPTIONS: string[] = Object.values(GradeLevel);

/** Default selection for new records. */
export const DEFAULT_GRADE: string = GRADE_OPTIONS[0];

/**
 * Groups offered before the teacher has created any of her own.
 *
 * Keeping this as the empty-collection fallback makes the switch to teacher-managed groups
 * behaviour-preserving: an account that has never opened the group manager sees exactly the two
 * options it saw before. The first group the teacher creates materializes these into the
 * collection (see AddStudentModal) so they are not lost.
 */
export const FALLBACK_GROUP_OPTIONS: string[] = ["Group A", "Group B"];

/** Longest group name the manager accepts. Keeps the pickers and roster badges readable. */
export const MAX_GROUP_NAME_LENGTH = 40;

/** Stored value for "this student has no group". Absent/empty are treated identically. */
export const NO_GROUP_VALUE = "";

/** Label used wherever the empty group is offered as a choice. */
export const NO_GROUP_LABEL = "No Group";

/** Filter sentinel meaning "don't filter". */
export const ALL_FILTER = "all";

/** Filter sentinel meaning "only records with no group". Not a stored value. */
export const NO_GROUP_FILTER = "__no_group__";

/** Trims a stored/typed group into its canonical form. Missing and blank both mean "no group". */
export function normalizeGroup(raw?: string | null): string {
  return (raw || "").trim();
}

/**
 * Group filter predicate shared by the student manager, the assignment roster and the dashboard,
 * so all three answer "is this student in the selected group?" the same way.
 */
export function matchesGroupFilter(group: string | undefined | null, filter: string): boolean {
  if (!filter || filter === ALL_FILTER) return true;
  const normalized = normalizeGroup(group);
  if (filter === NO_GROUP_FILTER) return !normalized;
  return normalized === filter;
}

/**
 * Returns `canonical` plus any value that exists in the data but is no longer offered.
 *
 * This is what keeps records written before a vocabulary change usable: a student stored as
 * "Grade 10" still shows up in the grade filter and still round-trips through the edit form
 * instead of being silently rewritten to the first option.
 */
export function withLegacyValues(canonical: string[], values: (string | undefined | null)[]): string[] {
  const extras: string[] = [];
  values.forEach((value) => {
    const clean = (value || "").trim();
    if (clean && !canonical.includes(clean) && !extras.includes(clean)) {
      extras.push(clean);
    }
  });
  return extras.length ? [...canonical, ...extras] : canonical;
}

/**
 * The group vocabulary a picker should offer.
 *
 * Teacher-created groups win. With none created yet the static fallback stands in, so the pickers
 * behave exactly as they did before groups became editable. Either way the result runs through
 * withLegacyValues, so a student holding a group that was since deleted or renamed stays
 * selectable instead of vanishing behind a filter that cannot reach them.
 */
export function resolveGroupOptions(
  groups: StudentGroup[],
  studentGroups: (string | undefined | null)[]
): string[] {
  const canonical = groups.length
    ? groups.map((g) => normalizeGroup(g.name)).filter(Boolean)
    : FALLBACK_GROUP_OPTIONS;
  return withLegacyValues(canonical, studentGroups);
}

/**
 * Last-resort subject guess from an assessment title, for results that carry no subject anywhere.
 *
 * LONGEST NAME WINS, and that is the whole point. "Integrated Science" contains "Science", so a
 * plain `title.includes(subject)` test matches a title like "Integrated Science — Unit 2" for BOTH
 * subjects: the result is counted twice and the two subjects stop being distinguishable in
 * reporting. Checking the longest subject name first makes the answer unique and always the more
 * specific of the two.
 *
 * Returns undefined when nothing matches — callers must not invent a subject, because attributing
 * an unknown result to an arbitrary subject is what made every submission look like Integrated
 * Science.
 */
export function resolveSubjectFromTitle(title: string | undefined | null): string | undefined {
  const haystack = (title || "").toLowerCase();
  if (!haystack) return undefined;

  return Object.values(Subject)
    .slice()
    .sort((a, b) => b.length - a.length)
    .find((name) => haystack.includes(name.toLowerCase()));
}

/**
 * Resolves the class group of the student behind a submission.
 *
 * Submissions do not store a group and still don't — the roster is the single source of truth, so
 * a student moved between groups is immediately reflected everywhere and no student data is
 * duplicated onto results. That does mean the submission has to be matched back to a roster entry,
 * which is what this does, most reliable identifier first:
 *
 *   1. studentCode  — the teacher-issued code the attempt was anchored to. Exact, survives a
 *                     renamed student, and is why it is tried first.
 *   2. student id   — carried on the submission as studentIdNumber.
 *   3. seat number  — legacy submissions put the code here.
 *   4. name         — last resort, for submissions predating codes entirely.
 *
 * Returns undefined when no roster entry matches (a deleted student, or an imported result). The
 * caller must treat that as "no group" rather than dropping the row.
 *
 * Shared by the submissions table and the analytics dashboard so both answer "which group is this
 * result in?" identically — they previously could not disagree only because there was one copy.
 */
export function resolveResultGroup(
  students: StudentRecord[],
  result: Pick<StudentResult, "studentCode" | "studentIdNumber" | "seatNumber" | "studentName">
): string | undefined {
  const code = (result.studentCode || "").trim().toUpperCase();
  const seat = (result.seatNumber || "").trim().toUpperCase();
  const idNumber = (result.studentIdNumber || "").trim();
  const name = (result.studentName || "").trim().toLowerCase();

  const match =
    (code ? students.find((s) => (s.code || "").trim().toUpperCase() === code) : undefined) ||
    (idNumber ? students.find((s) => s.id === idNumber) : undefined) ||
    (seat ? students.find((s) => (s.code || "").trim().toUpperCase() === seat) : undefined) ||
    (name ? students.find((s) => (s.name || "").trim().toLowerCase() === name) : undefined);

  return match?.group;
}

/**
 * Validates a group name typed into the manager. Returns an error message, or "" when the name is
 * usable. When renaming, the caller passes the *other* groups — a group is not its own duplicate.
 *
 * Group names are compared case-insensitively because they are what gets stored on students —
 * allowing both "Group A" and "group a" would silently split one cohort across two filters.
 */
export function validateGroupName(name: string, existing: StudentGroup[]): string {
  const clean = normalizeGroup(name);
  if (!clean) return "Group name is required.";
  if (clean.length > MAX_GROUP_NAME_LENGTH) {
    return `Group name must be ${MAX_GROUP_NAME_LENGTH} characters or fewer.`;
  }
  // Both sentinels are filter values, never stored — a group named after one would be unselectable.
  if (clean === NO_GROUP_FILTER || clean === ALL_FILTER) {
    return "That name is reserved. Please choose another.";
  }
  const clash = existing.some(
    (g) => normalizeGroup(g.name).toLowerCase() === clean.toLowerCase()
  );
  if (clash) return `"${clean}" already exists.`;
  return "";
}
