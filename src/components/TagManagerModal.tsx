/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { X, Tag as TagIcon, Plus, Edit2, Trash2, Merge, Search, Check } from "lucide-react";
import { motion } from "motion/react";
import { BankQuestion } from "../types";
import { normalizeTag, normalizeTags } from "../lib/tagUtils";

interface TagManagerModalProps {
  isOpen: boolean;
  bankQuestions: BankQuestion[];
  onClose: () => void;
  onUpdateQuestions: (updatedQuestions: BankQuestion[]) => void;
  onShowToast: (msg: string, tone?: "success" | "error" | "info") => void;
}

export default function TagManagerModal({
  isOpen,
  bankQuestions,
  onClose,
  onUpdateQuestions,
  onShowToast
}: TagManagerModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  
  // Merge State
  const [sourceTag, setSourceTag] = useState<string | null>(null);
  const [targetTag, setTargetTag] = useState<string>("");

  if (!isOpen) return null;

  // Calculate unique tags and counts
  const tagMap = new Map<string, number>();
  bankQuestions.forEach(q => {
    (q.tags || []).forEach(t => {
      const clean = t.trim().toLowerCase();
      if (clean) {
        tagMap.set(clean, (tagMap.get(clean) || 0) + 1);
      }
    });
  });

  const allTags = Array.from(tagMap.entries()).map(([name, count]) => ({ name, count }));
  const filteredTags = allTags.filter(t => t.name.includes(searchTerm.toLowerCase()));

  const handleCreateTag = () => {
    const clean = normalizeTag(newTagName);
    if (!clean) return;
    if (tagMap.has(clean)) {
      onShowToast(`Tag "#${clean}" already exists.`, "info");
      return;
    }
    onShowToast(`Tag "#${clean}" created! You can now assign it to questions.`, "success");
    setNewTagName("");
  };

  const handleRenameTag = (oldTag: string) => {
    const oldClean = normalizeTag(oldTag);
    const newClean = normalizeTag(renameValue);
    if (!newClean || newClean === oldClean) {
      setEditingTag(null);
      return;
    }

    const updated = bankQuestions.map(q => {
      if (!q.tags || !q.tags.some(t => normalizeTag(t) === oldClean)) return q;
      const newTags = q.tags.map(t => (normalizeTag(t) === oldClean ? newClean : t));
      return { ...q, tags: normalizeTags(newTags) };
    });

    onUpdateQuestions(updated);
    onShowToast(`Renamed tag "#${oldClean}" to "#${newClean}" across all questions ✨`, "success");
    setEditingTag(null);
  };

  const handleDeleteTag = (tagToDelete: string) => {
    const cleanDelete = normalizeTag(tagToDelete);
    if (!confirm(`Are you sure you want to remove tag "#${cleanDelete}" from all questions?`)) return;

    const updated = bankQuestions.map(q => {
      if (!q.tags || !q.tags.some(t => normalizeTag(t) === cleanDelete)) return q;
      return { ...q, tags: normalizeTags(q.tags.filter(t => normalizeTag(t) !== cleanDelete)) };
    });

    onUpdateQuestions(updated);
    onShowToast(`Tag "#${cleanDelete}" removed from questions 🗑️`, "info");
  };

  const handleMergeTags = () => {
    const cleanSource = normalizeTag(sourceTag || "");
    const cleanTarget = normalizeTag(targetTag || "");
    if (!cleanSource || !cleanTarget || cleanSource === cleanTarget) return;

    const updated = bankQuestions.map(q => {
      if (!q.tags || !q.tags.some(t => normalizeTag(t) === cleanSource)) return q;
      const filtered = q.tags.filter(t => normalizeTag(t) !== cleanSource);
      return { ...q, tags: normalizeTags([...filtered, cleanTarget]) };
    });

    onUpdateQuestions(updated);
    onShowToast(`Merged "#${cleanSource}" into "#${cleanTarget}" successfully!`, "success");
    setSourceTag(null);
    setTargetTag("");
  };

  function newSet(arr: string[]): string[] {
    return Array.from(new Set(arr));
  }

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" dir="ltr">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl p-6 md:p-8 max-w-xl w-full space-y-6 shadow-2xl border border-slate-100 text-left my-8"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <TagIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Manage Question Bank Tags</h3>
              <p className="text-xs text-slate-500">Create, rename, merge, and organize assessment tags</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Tag Input */}
        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
            placeholder="Create new tag (e.g. reaction rate, optics)..."
            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <button
            onClick={handleCreateTag}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" /> Add Tag
          </button>
        </div>

        {/* Search & Tag List */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search existing tags..."
              className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {filteredTags.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs">No tags found</div>
            ) : (
              filteredTags.map(({ name, count }) => (
                <div
                  key={name}
                  className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200/80 transition-colors"
                >
                  {editingTag === name ? (
                    <div className="flex items-center gap-2 flex-1 mr-2">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="flex-1 px-3 py-1 bg-white border border-indigo-300 rounded-xl text-xs font-bold outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => handleRenameTag(name)}
                        className="p-1.5 bg-emerald-600 text-white rounded-lg text-xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingTag(null)}
                        className="p-1.5 bg-slate-200 text-slate-600 rounded-lg text-xs"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-900 font-bold text-xs border border-indigo-200">
                        #{name}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                        {count} {count === 1 ? "question" : "questions"}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingTag(name);
                        setRenameValue(name);
                      }}
                      className="p-1.5 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-xl transition-colors cursor-pointer"
                      title="Rename Tag"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setSourceTag(name)}
                      className="p-1.5 hover:bg-amber-50 text-slate-400 hover:text-amber-600 rounded-xl transition-colors cursor-pointer"
                      title="Merge into another tag"
                    >
                      <Merge className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteTag(name)}
                      className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
                      title="Delete Tag"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Merge Panel */}
        {sourceTag && (
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 space-y-3">
            <div className="text-xs font-bold text-amber-900 flex items-center justify-between">
              <span>Merge tag <span className="underline">#{sourceTag}</span> into:</span>
              <button onClick={() => setSourceTag(null)} className="text-amber-700 hover:text-amber-900 text-xs">Cancel</button>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={targetTag}
                onChange={(e) => setTargetTag(e.target.value)}
                className="flex-1 px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-bold text-slate-800 outline-none cursor-pointer"
              >
                <option value="">Select target tag...</option>
                {allTags.filter(t => t.name !== sourceTag).map(t => (
                  <option key={t.name} value={t.name}>#{t.name} ({t.count} questions)</option>
                ))}
              </select>
              <button
                disabled={!targetTag}
                onClick={handleMergeTags}
                className="px-4 py-2 bg-amber-600 disabled:opacity-50 hover:bg-amber-700 text-white font-bold rounded-xl text-xs cursor-pointer"
              >
                Merge Tags
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end border-t border-slate-100 pt-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}
