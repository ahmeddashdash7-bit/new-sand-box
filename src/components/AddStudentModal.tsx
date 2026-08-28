/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  X, 
  UserPlus, 
  Search, 
  Copy, 
  Check, 
  Edit3, 
  Trash2, 
  Phone, 
  GraduationCap, 
  Sparkles, 
  RefreshCw, 
  ShieldCheck, 
  Loader2,
  Users,
  KeyRound,
  FileSpreadsheet,
  AlertCircle,
  Plus,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { StudentRecord, StudentGroup, User } from "../types";
import {
  saveStudentToFirestore,
  deleteStudentFromFirestore,
  subscribeToFirestoreStudents,
  generateStudentCode,
  backfillStudentCodeMirrors,
  saveGroupToFirestore,
  deleteGroupFromFirestore,
  subscribeToFirestoreGroups,
  fetchGroupsFromFirestore,
  renameGroupAcrossStudents
} from "../lib/firebase";
import { normalizeStudentCode, STUDENT_CODE_LENGTH } from "../lib/codeGenerator";
import {
  GRADE_OPTIONS,
  DEFAULT_GRADE,
  NO_GROUP_VALUE,
  NO_GROUP_LABEL,
  ALL_FILTER,
  NO_GROUP_FILTER,
  MAX_GROUP_NAME_LENGTH,
  normalizeGroup,
  matchesGroupFilter,
  withLegacyValues,
  resolveGroupOptions,
  validateGroupName
} from "../lib/classification";

/**
 * Sentinel value for the "create a new group" row inside the group picker. It is never stored —
 * selecting it opens the inline name field instead of changing the student's group.
 */
const CREATE_GROUP_OPTION = "__create_group__";

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: User | null;
}

export default function AddStudentModal({
  isOpen,
  onClose,
  currentUser
}: AddStudentModalProps) {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  /** Ensures the studentCodes backfill runs at most once per mount. */
  const backfilledRef = useRef(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Group manager. Rows are addressed by groupKey() rather than id, because the built-in defaults
  // are offered before they have ever been saved and so have no id yet.
  const [showGroupManager, setShowGroupManager] = useState<boolean>(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState<boolean>(false);
  const [newGroupName, setNewGroupName] = useState<string>("");
  const [renamingGroupKey, setRenamingGroupKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");
  const [confirmDeleteGroupKey, setConfirmDeleteGroupKey] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string>("");
  const [isGroupBusy, setIsGroupBusy] = useState<boolean>(false);
  
  // Form fields
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState<string>("");
  const [parentPhone, setParentPhone] = useState<string>("");
  const [grade, setGrade] = useState<string>(DEFAULT_GRADE);
  const [group, setGroup] = useState<string>(NO_GROUP_VALUE);
  const [code, setCode] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>("");

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterGrade, setFilterGrade] = useState<string>(ALL_FILTER);
  const [filterGroup, setFilterGroup] = useState<string>(ALL_FILTER);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Set of existing codes to prevent duplicate code generation
  const existingCodesSet = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.code && s.id !== editingId) {
        set.add(s.code.toUpperCase());
      }
    });
    return set;
  }, [students, editingId]);

  /**
   * Option lists for the two filters. Any grade/group still stored on a student but no longer
   * offered (records created before the vocabulary changed) is appended so those students stay
   * reachable instead of disappearing behind a filter that cannot select them.
   */
  const gradeFilterOptions = useMemo(
    () => withLegacyValues(GRADE_OPTIONS, students.map((s) => s.grade)),
    [students]
  );
  const groupFilterOptions = useMemo(
    () => resolveGroupOptions(groups, students.map((s) => s.group)),
    [groups, students]
  );

  /** Same idea for the edit form: never silently rewrite a legacy value just by opening it. */
  const gradeFormOptions = useMemo(() => withLegacyValues(GRADE_OPTIONS, [grade]), [grade]);
  const groupFormOptions = useMemo(() => resolveGroupOptions(groups, [group]), [groups, group]);

  /** How many students each offered group currently holds. Drives the manager's delete warning. */
  const studentCountByGroup = useMemo(() => {
    const counts = new Map<string, number>();
    students.forEach((s) => {
      const name = normalizeGroup(s.group);
      if (!name) return;
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return counts;
  }, [students]);

  /**
   * The teacher's group list, for both the manager rows and the duplicate check.
   *
   * Once she has saved groups, this is exactly those — deliberately NOT including names kept alive
   * only because a student still holds them, or a group she just deleted would reappear here and
   * look like the delete had failed. (Those names do stay in the filters, which is the point of
   * withLegacyValues.) Before then it is the built-in defaults, as unsaved rows so they can still
   * be renamed and deleted; the first such edit materializes the whole list.
   */
  const manageableGroups = useMemo<StudentGroup[]>(() => {
    const rows = groups.length
      ? [...groups]
      : groupFilterOptions.map((name) => ({ id: "", name, createdAt: 0 }));
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [groups, groupFilterOptions]);

  // Subscribe to real-time Firestore student updates
  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    const unsubscribe = subscribeToFirestoreStudents((updatedStudents) => {
      setStudents(updatedStudents || []);
      setIsLoading(false);

      /**
       * Backfill studentCodes mirrors for students created before that collection existed.
       * Runs here because this is the only screen with both the full student list and teacher
       * permissions. Idempotent — it skips codes that already have a mirror.
       */
      if (!backfilledRef.current && updatedStudents?.length) {
        backfilledRef.current = true;
        backfillStudentCodeMirrors(updatedStudents).catch(() => {
          /* non-fatal: joining still falls back to the legacy lookup */
        });
      }
    });

    return () => unsubscribe();
  }, [isOpen]);

  // Subscribe to the teacher's group vocabulary. An empty collection is normal, not an error —
  // resolveGroupOptions falls back to the pre-groups list until she creates her first one.
  useEffect(() => {
    if (!isOpen) return;
    // Reopening the manager should not resume a half-finished create/rename from last time.
    setIsCreatingGroup(false);
    setNewGroupName("");
    setRenamingGroupKey(null);
    setRenameValue("");
    setConfirmDeleteGroupKey(null);
    setGroupError("");

    const unsubscribe = subscribeToFirestoreGroups((updatedGroups) => {
      setGroups(updatedGroups || []);
    });
    return () => unsubscribe();
  }, [isOpen]);

  // Generate initial code when opening modal or adding fresh student
  useEffect(() => {
    if (isOpen && !editingId && !code) {
      setCode(generateStudentCode(existingCodesSet));
    }
  }, [isOpen, editingId, existingCodesSet]);

  if (!isOpen) return null;

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const handleRegenerateCode = () => {
    const newCode = generateStudentCode(existingCodesSet);
    setCode(newCode);
    showNotification(`Generated new random code: ${newCode}`);
  };

  const makeGroupId = () => `grp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  /**
   * Turns the names the pickers are currently offering into real group records.
   *
   * Runs once, immediately before the first group the teacher creates. Without it, creating
   * "Saturday 5pm" would replace the fallback list outright and quietly drop "Group A"/"Group B"
   * from every picker — students would keep the label but it would stop being offered.
   */
  const materializeOfferedGroups = async () => {
    const now = Date.now();
    for (let i = 0; i < groupFilterOptions.length; i += 1) {
      const name = groupFilterOptions[i];
      await saveGroupToFirestore({ id: makeGroupId(), name, createdAt: now + i });
    }
  };

  /** Stable row identity. Defaults have no id until they are saved, so fall back to the name. */
  const groupKey = (g: StudentGroup) => g.id || `name:${normalizeGroup(g.name).toLowerCase()}`;

  /**
   * Resolves a manager row to a saved record, saving the whole offered list first if this is the
   * teacher's first edit. Without this, renaming or deleting a built-in default would have nothing
   * to act on.
   */
  const ensureGroupRecord = async (g: StudentGroup): Promise<StudentGroup | null> => {
    if (g.id) return g;
    await materializeOfferedGroups();
    const saved = await fetchGroupsFromFirestore();
    const target = normalizeGroup(g.name).toLowerCase();
    return saved.find((s) => normalizeGroup(s.name).toLowerCase() === target) || null;
  };

  const handleCancelCreateGroup = () => {
    setIsCreatingGroup(false);
    setNewGroupName("");
    setGroupError("");
  };

  const handleCreateGroup = async () => {
    const error = validateGroupName(newGroupName, manageableGroups);
    if (error) {
      setGroupError(error);
      return;
    }

    const clean = normalizeGroup(newGroupName);
    setIsGroupBusy(true);
    setGroupError("");

    if (groups.length === 0) {
      await materializeOfferedGroups();
    }
    const ok = await saveGroupToFirestore({ id: makeGroupId(), name: clean, createdAt: Date.now() });

    setIsGroupBusy(false);
    if (!ok) {
      setGroupError("Could not save the group. Please check your connection and try again.");
      return;
    }

    // Select the group that was just created — creating one is almost always followed by using it.
    setGroup(clean);
    setIsCreatingGroup(false);
    setNewGroupName("");
    showNotification(`Created group "${clean}"`);
  };

  const handleStartRename = (g: StudentGroup) => {
    setRenamingGroupKey(groupKey(g));
    setRenameValue(g.name);
    setConfirmDeleteGroupKey(null);
    setGroupError("");
  };

  const handleCancelRename = () => {
    setRenamingGroupKey(null);
    setRenameValue("");
    setGroupError("");
  };

  /**
   * Renaming has to cascade: students store the group name, not its id, so the record and every
   * student holding the old name are updated together or the group would appear to lose members.
   */
  const handleRenameGroup = async (g: StudentGroup) => {
    // A group is not its own duplicate, so validate against the other rows.
    const others = manageableGroups.filter((k) => groupKey(k) !== groupKey(g));
    const error = validateGroupName(renameValue, others);
    if (error) {
      setGroupError(error);
      return;
    }

    const clean = normalizeGroup(renameValue);
    const previous = normalizeGroup(g.name);
    if (clean === previous) {
      handleCancelRename();
      return;
    }

    setIsGroupBusy(true);
    setGroupError("");

    const record = await ensureGroupRecord(g);
    if (!record) {
      setIsGroupBusy(false);
      setGroupError("Could not rename the group. Please check your connection and try again.");
      return;
    }

    const ok = await saveGroupToFirestore({ ...record, name: clean });
    if (!ok) {
      setIsGroupBusy(false);
      setGroupError("Could not rename the group. Please check your connection and try again.");
      return;
    }
    const moved = await renameGroupAcrossStudents(previous, clean);
    setIsGroupBusy(false);

    // Keep any selection pointing at the old name in step, so nothing silently empties out.
    if (normalizeGroup(group) === previous) setGroup(clean);
    if (filterGroup === previous) setFilterGroup(clean);

    handleCancelRename();
    showNotification(
      moved > 0
        ? `Renamed to "${clean}" — ${moved} student${moved === 1 ? "" : "s"} updated`
        : `Renamed to "${clean}"`
    );
  };

  /**
   * Deletes the group record only. Students keep the name they already have and stay reachable
   * through withLegacyValues — the name simply stops being offered for new students.
   */
  const handleDeleteGroup = async (g: StudentGroup) => {
    setIsGroupBusy(true);
    setGroupError("");

    // Deleting a built-in default saves the rest of the list first, so the others survive.
    const record = await ensureGroupRecord(g);
    if (!record) {
      setIsGroupBusy(false);
      setGroupError("Could not delete the group. Please check your connection and try again.");
      return;
    }

    const ok = await deleteGroupFromFirestore(record.id);
    setIsGroupBusy(false);

    if (!ok) {
      setGroupError("Could not delete the group. Please check your connection and try again.");
      return;
    }

    setConfirmDeleteGroupKey(null);
    const held = studentCountByGroup.get(normalizeGroup(g.name)) || 0;

    // With no student left holding the name it also leaves the filter list, so a filter still
    // pointing at it would silently show an empty roster. Fall back to "All Groups".
    if (held === 0 && filterGroup === normalizeGroup(g.name)) {
      setFilterGroup(ALL_FILTER);
    }

    showNotification(
      held > 0
        ? `Deleted "${g.name}" — ${held} student${held === 1 ? "" : "s"} keep the label`
        : `Deleted "${g.name}"`
    );
  };

  const handleResetForm = () => {
    setEditingId(null);
    setName("");
    setParentPhone("");
    setGrade(DEFAULT_GRADE);
    setGroup(NO_GROUP_VALUE);
    setCode(generateStudentCode(existingCodesSet));
    setFormError("");
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const cleanName = name.trim();
    const cleanPhone = parentPhone.trim();
    const cleanCode = normalizeStudentCode(code) || "";

    if (!cleanName) {
      setFormError("Student Full Name is required.");
      return;
    }

    if (!cleanPhone) {
      setFormError("Parent's Mobile Number is required.");
      return;
    }

    // Newly generated codes are STUDENT_CODE_LENGTH characters; codes issued at length 3 stay valid.
    if (!cleanCode) {
      setFormError(`Student Code must be ${STUDENT_CODE_LENGTH} characters (e.g. ${generateStudentCode()}).`);
      return;
    }

    // Check code uniqueness
    const duplicate = students.find(
      (s) => s.code.toUpperCase() === cleanCode && s.id !== editingId
    );
    if (duplicate) {
      setFormError(`Code "${cleanCode}" is already assigned to student "${duplicate.name}". Please generate a unique code.`);
      return;
    }

    setIsSaving(true);

    const studentRecord: StudentRecord = {
      id: editingId || "std-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      name: cleanName,
      code: cleanCode,
      parentPhone: cleanPhone,
      grade,
      group: normalizeGroup(group),
      createdAt: editingId
        ? (students.find(s => s.id === editingId)?.createdAt || Date.now()) 
        : Date.now(),
      updatedAt: Date.now(),
      createdBy: currentUser?.fullName || "Teacher"
    };

    const success = await saveStudentToFirestore(studentRecord);
    setIsSaving(false);

    if (success) {
      showNotification(
        editingId 
          ? `Updated student details for ${cleanName}!` 
          : `Added new student ${cleanName} with code [ ${cleanCode} ]!`
      );
      handleResetForm();
    } else {
      setFormError("Failed to save student record to Firebase. Please try again.");
    }
  };

  const handleEdit = (student: StudentRecord) => {
    setEditingId(student.id);
    setName(student.name);
    setParentPhone(student.parentPhone);
    setGrade(student.grade || DEFAULT_GRADE);
    setGroup(normalizeGroup(student.group));
    setCode(student.code);
    setFormError("");
  };

  const handleDelete = async (student: StudentRecord) => {
    if (window.confirm(`Are you sure you want to delete student "${student.name}" (${student.code})?`)) {
      const success = await deleteStudentFromFirestore(student.id);
      if (success) {
        showNotification(`Deleted student ${student.name}`);
        if (editingId === student.id) {
          handleResetForm();
        }
      }
    }
  };

  const handleCopyCode = (id: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedCodeId(id);
    showNotification(`Copied student code: ${val}`);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const handleCopyPhone = (id: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedPhoneId(id);
    showNotification(`Copied phone number: ${val}`);
    setTimeout(() => setCopiedPhoneId(null), 2000);
  };

  // Filter students list
  const filteredStudents = students.filter((s) => {
    const matchesSearch = 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.parentPhone.includes(searchQuery);

    const matchesGrade = filterGrade === ALL_FILTER || s.grade === filterGrade;
    const matchesGroup = matchesGroupFilter(s.group, filterGroup);
    return matchesSearch && matchesGrade && matchesGroup;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto" id="add-student-modal-container">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-6 max-h-[90vh]"
        dir="ltr"
      >
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 px-6 py-5 text-white flex items-center justify-between border-b border-emerald-800/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-400/20 text-emerald-300 rounded-2xl border border-emerald-400/30">
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight">Student Manager & Access Codes</h3>
                <span className="px-2.5 py-0.5 bg-emerald-400/20 text-emerald-300 rounded-full text-[10px] font-bold border border-emerald-400/30">
                  Firebase Synced
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Add students, auto-generate unique access codes, manage parent mobile numbers, and edit details.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
            title="Close Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toast Notification Header Banner */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-emerald-600 text-white px-6 py-2.5 text-xs font-bold flex items-center justify-between shrink-0 shadow-inner"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-200 animate-spin" />
                <span>{toastMessage}</span>
              </div>
              <button 
                onClick={() => setToastMessage(null)}
                className="text-emerald-200 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal Main Content Grid */}
        <div className="p-6 overflow-y-auto flex-grow grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50/50">
          
          {/* LEFT COLUMN: Add / Edit Student Form (5 cols) */}
          <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
            <form onSubmit={handleSaveStudent} className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  {editingId ? (
                    <>
                      <Edit3 className="w-4 h-4 text-amber-600" />
                      Edit Student Details
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 text-emerald-600" />
                      Add New Student
                    </>
                  )}
                </h4>
                {editingId && (
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="text-[11px] text-slate-500 hover:text-slate-800 font-bold underline cursor-pointer"
                  >
                    + Add New Instead
                  </button>
                )}
              </div>

              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Student Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Student Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ahmed Hassan"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  required
                />
              </div>

              {/* Parent's Mobile Number */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  Parent's Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                  placeholder="e.g. +20 101 234 5678"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 font-mono"
                  required
                />
              </div>

              {/* Grade / Class Selection */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                  Grade Level / Academic Year
                </label>
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                >
                  {gradeFormOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              {/* Group (optional classification) */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-teal-600" />
                  Group <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <select
                  value={group}
                  onChange={(e) => {
                    // The create row is an action, not a value — leave the student's group alone.
                    if (e.target.value === CREATE_GROUP_OPTION) {
                      setIsCreatingGroup(true);
                      setGroupError("");
                      return;
                    }
                    setGroup(e.target.value);
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                >
                  <option value={NO_GROUP_VALUE}>{NO_GROUP_LABEL}</option>
                  {groupFormOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                  <option value={CREATE_GROUP_OPTION}>+ Create new group…</option>
                </select>

                {isCreatingGroup && (
                  <div className="mt-2 p-2.5 bg-teal-50/70 border border-teal-200 rounded-xl space-y-2">
                    <input
                      type="text"
                      autoFocus
                      value={newGroupName}
                      maxLength={MAX_GROUP_NAME_LENGTH}
                      onChange={(e) => {
                        setNewGroupName(e.target.value);
                        if (groupError) setGroupError("");
                      }}
                      onKeyDown={(e) => {
                        // The picker lives inside the student form — Enter must not submit it.
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (!isGroupBusy) handleCreateGroup();
                        }
                        if (e.key === "Escape") handleCancelCreateGroup();
                      }}
                      placeholder="e.g. Saturday 5pm"
                      className="w-full px-3 py-2 bg-white border border-teal-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCreateGroup}
                        disabled={isGroupBusy}
                        className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[11px] font-extrabold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {isGroupBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        Create
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelCreateGroup}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {groupError && !showGroupManager && (
                  <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" />
                    {groupError}
                  </p>
                )}

                {/*
                  Rename / delete, directly under the picker they apply to. Every offered group
                  gets a row — including the built-in defaults, which have no saved record until
                  the first edit (see ensureGroupRecord).
                */}
                <div className="mt-2 border border-slate-200 rounded-xl bg-slate-50/70 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setShowGroupManager((prev) => !prev);
                      setGroupError("");
                      setConfirmDeleteGroupKey(null);
                      handleCancelRename();
                    }}
                    className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <span className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1.5">
                      <Edit3 className="w-3 h-3 text-teal-600" />
                      Rename or delete groups ({manageableGroups.length})
                    </span>
                    {showGroupManager
                      ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                      : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                  </button>

                  {showGroupManager && (
                    <div className="px-3 pb-3 pt-2.5 space-y-2 border-t border-slate-200">
                      {groups.length === 0 && (
                        <p className="text-[10px] text-slate-500 font-medium leading-snug">
                          These are the built-in defaults. Renaming or deleting one saves your
                          group list for the first time — the others are kept.
                        </p>
                      )}

                      {manageableGroups.map((g) => {
                        const key = groupKey(g);
                        const held = studentCountByGroup.get(normalizeGroup(g.name)) || 0;
                        const isRenaming = renamingGroupKey === key;
                        const isConfirmingDelete = confirmDeleteGroupKey === key;

                        return (
                          <div key={key} className="bg-white border border-slate-200 rounded-lg p-2 space-y-2">
                            {isRenaming ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  autoFocus
                                  value={renameValue}
                                  maxLength={MAX_GROUP_NAME_LENGTH}
                                  onChange={(e) => {
                                    setRenameValue(e.target.value);
                                    if (groupError) setGroupError("");
                                  }}
                                  onKeyDown={(e) => {
                                    // Still inside the student form — Enter must not submit it.
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      if (!isGroupBusy) handleRenameGroup(g);
                                    }
                                    if (e.key === "Escape") handleCancelRename();
                                  }}
                                  className="flex-grow min-w-0 px-2 py-1.5 bg-slate-50 border border-teal-300 rounded-lg text-[11px] font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRenameGroup(g)}
                                  disabled={isGroupBusy}
                                  title="Save new name"
                                  className="p-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                                >
                                  {isGroupBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelRename}
                                  title="Cancel"
                                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors cursor-pointer shrink-0"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <span className="text-[11px] font-extrabold text-slate-800 block truncate">{g.name}</span>
                                  <span className="text-[10px] text-slate-500 font-bold">
                                    {held} student{held === 1 ? "" : "s"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleStartRename(g)}
                                    title="Rename group"
                                    className="p-1.5 bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setConfirmDeleteGroupKey(key);
                                      handleCancelRename();
                                    }}
                                    title="Delete group"
                                    className="p-1.5 bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            )}

                            {isConfirmingDelete && (
                              <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 space-y-2">
                                <p className="text-[10px] font-bold text-rose-800 leading-snug">
                                  {held > 0
                                    ? `${held} student${held === 1 ? " is" : "s are"} in this group. They keep the "${g.name}" label and stay in your filters, but it will no longer be offered for new students.`
                                    : `Delete "${g.name}"? No students are using it.`}
                                </p>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteGroup(g)}
                                    disabled={isGroupBusy}
                                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-extrabold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  >
                                    {isGroupBusy ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Trash2 className="w-2.5 h-2.5" />}
                                    Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteGroupKey(null)}
                                    className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {groupError && (
                        <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {groupError}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Unique Var-Char Student Code — length comes from STUDENT_CODE_LENGTH */}
              <div className="space-y-1.5 bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200/80">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-emerald-700" />
                    Unique Student Code ({STUDENT_CODE_LENGTH} Var-Char)
                  </label>
                  <button
                    type="button"
                    onClick={handleRegenerateCode}
                    className="px-2 py-1 bg-white hover:bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-extrabold border border-emerald-300 transition-colors flex items-center gap-1 cursor-pointer"
                    title="Generate a new random access code"
                  >
                    <RefreshCw className="w-3 h-3 text-emerald-600" />
                    Randomize
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={8}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="X7KM"
                    className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-center text-lg font-black tracking-widest text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase font-mono shadow-sm"
                    required
                  />
                  <div className="text-center px-3 py-1.5 bg-white rounded-xl border border-emerald-200 shrink-0">
                    <span className="text-[10px] text-emerald-700 font-bold block">Status</span>
                    <span className="text-[11px] font-black text-emerald-800">
                      {normalizeStudentCode(code) && !existingCodesSet.has(normalizeStudentCode(code) as string)
                        ? "✓ Valid"
                        : "Invalid"}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-emerald-700/80 font-medium leading-tight">
                  Auto-generated unguessable access code saved to Firebase for student login.
                </p>
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-700 hover:to-indigo-700 text-white font-black rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving to Firebase...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      {editingId ? "Update Student Record" : "Add Student to Firebase"}
                    </>
                  )}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div className="bg-slate-100/70 p-3 rounded-xl border border-slate-200/60 text-[11px] text-slate-600 space-y-1">
              <span className="font-extrabold text-slate-800 block">💡 Quick Tip</span>
              <p>
                Each student is synced instantly in Firestore. You can copy student codes or mobile numbers anytime using the copy buttons on the right.
              </p>
            </div>
          </div>

          {/* RIGHT COLUMN: Registered Students Table & Controls (7 cols) */}
          <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col space-y-4">
            
            {/* Table Header & Search Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-600" />
                  Registered Students ({filteredStudents.length})
                </h4>
                <p className="text-[11px] text-slate-500 font-medium">
                  Real-time list of student accounts, codes, and parent contacts.
                </p>
              </div>

              {/* Grade & Group Filters — combined (both must match) */}
              <div className="flex items-center gap-2">
                <select
                  value={filterGrade}
                  onChange={(e) => setFilterGrade(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value={ALL_FILTER}>All Grades</option>
                  {gradeFilterOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>

                <select
                  value={filterGroup}
                  onChange={(e) => setFilterGroup(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value={ALL_FILTER}>All Groups</option>
                  {groupFilterOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                  <option value={NO_GROUP_FILTER}>{NO_GROUP_LABEL}</option>
                </select>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by student name, access code, or parent phone..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>


            {/* Students List Table */}
            <div className="flex-grow overflow-y-auto min-h-[300px] border border-slate-200/80 rounded-xl bg-slate-50/50">
              {isLoading ? (
                <div className="p-12 text-center space-y-3">
                  <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
                  <p className="text-xs text-slate-500 font-bold">Syncing students from Firebase...</p>
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="p-12 text-center space-y-3 text-slate-400">
                  <Users className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-xs font-bold">No students found.</p>
                  <p className="text-[11px] text-slate-400">Use the form on the left to add your first student record!</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200/80">
                  {filteredStudents.map((std) => {
                    const isEditingThis = editingId === std.id;
                    return (
                      <div
                        key={std.id}
                        className={`p-3.5 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                          isEditingThis ? "bg-amber-50/70 border-l-4 border-amber-500" : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        {/* Student Info */}
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-xs text-slate-900 truncate">
                              {std.name}
                            </span>
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-md text-[10px] border border-indigo-100">
                              {std.grade || DEFAULT_GRADE}
                            </span>
                            {normalizeGroup(std.group) && (
                              <span className="px-2 py-0.5 bg-teal-50 text-teal-700 font-bold rounded-md text-[10px] border border-teal-100">
                                {normalizeGroup(std.group)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                            <span className="flex items-center gap-1 font-mono text-slate-700">
                              <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                              {std.parentPhone}
                              <button
                                onClick={() => handleCopyPhone(std.id, std.parentPhone)}
                                className="p-1 hover:text-emerald-700 text-slate-400 transition-colors"
                                title="Copy parent phone number"
                              >
                                {copiedPhoneId === std.id ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </span>
                          </div>
                        </div>

                        {/* Student Code Badge & Actions */}
                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
                          {/* Code Pill */}
                          <div className="flex items-center gap-1 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-300 px-3 py-1.5 rounded-xl shadow-xs">
                            <KeyRound className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                            <span className="font-mono text-xs font-black text-emerald-950 tracking-wider">
                              {std.code}
                            </span>
                            <button
                              onClick={() => handleCopyCode(std.id, std.code)}
                              className="ml-1 p-1 bg-white hover:bg-emerald-100 text-emerald-800 rounded-md border border-emerald-200 text-[10px] transition-colors cursor-pointer"
                              title="Copy student code"
                            >
                              {copiedCodeId === std.id ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3 text-emerald-700" />
                              )}
                            </button>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEdit(std)}
                              className="p-1.5 bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                              title="Edit Student Info"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleDelete(std)}
                              className="p-1.5 bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-800 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                              title="Delete Student Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Footer Info */}
            <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500 font-bold border-t border-slate-100">
              <span>Total Synced Students: {students.length}</span>
              <span className="text-emerald-700 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Live Firestore Synchronization Active
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-500 font-semibold hidden sm:block">
            Student codes are unique access keys stored securely in your Firebase project.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer ml-auto"
          >
            Done / Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
