/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  Bold, 
  Italic, 
  Underline, 
  Atom, 
  Calculator, 
  Zap, 
  Dna, 
  Image as ImageIcon, 
  Sparkles, 
  CheckCircle2, 
  X,
  Highlighter
} from "lucide-react";
import { BIOLOGY_DIAGRAMS, BiologyDiagram } from "../data/biologyDiagrams";

interface ScientificNotationToolbarProps {
  onInsertSymbol: (symbol: string) => void;
  onSelectBiologyDiagram?: (diagram: BiologyDiagram) => void;
  onImageSelected?: (imageUrl: string) => void;
}

export default function ScientificNotationToolbar({
  onInsertSymbol,
  onSelectBiologyDiagram,
  onImageSelected
}: ScientificNotationToolbarProps) {
  const [activeCategory, setActiveCategory] = useState<"text" | "chem" | "math" | "physics" | "biology">("chem");
  const [showDiagramModal, setShowDiagramModal] = useState(false);

  // Chemical notation presets
  const chemSubscripts = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];
  const chemCharges = ["⁺", "⁻", "²⁺", "³⁺", "²⁻", "³⁻"];
  const chemArrows = ["➔", "⇌", "↑", "↓", "Δ"];
  const chemFormulas = [
    "H₂O",
    "CO₂",
    "O₂",
    "C₆H₁₂O₆",
    "NaCl",
    "HCl",
    "H₂SO₄",
    "CaCO₃",
    "Fe³⁺",
    "NH₃"
  ];

  // Mathematical notation presets
  const mathSymbols = [
    "π", "θ", "α", "β", "Δ", "√", "∫", "∑", 
    "±", "≠", "≈", "≤", "≥", "∞", "x²", "xⁿ", "½", "(أ/ب)"
  ];

  // Physics units & symbols
  const physicsNotation = [
    "Ω", "μ", "λ", "F⃗", "v⃗", "a⃗", "E", 
    "m/s²", "N", "J", "W", "V", "Hz", "g = 9.8 m/s²", "ρ", "τ"
  ];

  return (
    <div className="bg-slate-900 text-white p-3 rounded-2xl space-y-2 border border-slate-800 shadow-md text-right dir-rtl">
      {/* Category Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-800 pb-2 text-xs font-bold">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveCategory("text")}
            className={`px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
              activeCategory === "text" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Bold className="w-3.5 h-3.5" />
            <span>تنسيق</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory("chem")}
            className={`px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
              activeCategory === "chem" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Atom className="w-3.5 h-3.5 text-purple-300" />
            <span>كيمياء 🧪</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory("math")}
            className={`px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
              activeCategory === "math" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Calculator className="w-3.5 h-3.5 text-blue-300" />
            <span>رياضيات 📐</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory("physics")}
            className={`px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
              activeCategory === "physics" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>فيزياء ⚡</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveCategory("biology");
              setShowDiagramModal(true);
            }}
            className={`px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
              activeCategory === "biology" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Dna className="w-3.5 h-3.5 text-emerald-300" />
            <span>أحياء ورسوم 🧬</span>
          </button>
        </div>

        <span className="text-[10px] text-slate-400 font-semibold hidden sm:inline">
          انقر لإدراج الرمز مباشرة في نص السؤال
        </span>
      </div>

      {/* Buttons toolbar depending on selected category */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {/* Text Formatting */}
        {activeCategory === "text" && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => onInsertSymbol("**غليظ**")}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold cursor-pointer"
              title="خط غليظ"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onInsertSymbol("*مائل*")}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg italic cursor-pointer"
              title="خط مائل"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onInsertSymbol("<u>مسطر</u>")}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg underline cursor-pointer"
              title="تحته خط"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onInsertSymbol("<mark>تظليل</mark>")}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg cursor-pointer"
              title="تظليل ملون"
            >
              <Highlighter className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Chemical Equations */}
        {activeCategory === "chem" && (
          <div className="space-y-1.5 w-full">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-purple-300 font-bold ml-1">أرقام سفلية:</span>
              {chemSubscripts.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onInsertSymbol(s)}
                  className="px-2 py-0.5 bg-purple-950/80 hover:bg-purple-900 border border-purple-800 text-purple-200 rounded-lg font-mono text-xs cursor-pointer"
                >
                  {s}
                </button>
              ))}
              <span className="text-[10px] text-purple-300 font-bold mr-2 ml-1">شحنات أسهم:</span>
              {[...chemCharges, ...chemArrows].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onInsertSymbol(` ${c} `)}
                  className="px-2 py-0.5 bg-purple-950/80 hover:bg-purple-900 border border-purple-800 text-purple-200 rounded-lg font-mono text-xs cursor-pointer"
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80">
              <span className="text-[10px] text-slate-400 font-bold">صيغ جاهزة:</span>
              {chemFormulas.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onInsertSymbol(` ${f} `)}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-purple-900 text-slate-200 hover:text-purple-200 rounded-lg font-mono text-[11px] border border-slate-700 cursor-pointer"
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Math Formulas */}
        {activeCategory === "math" && (
          <div className="flex flex-wrap items-center gap-1.5 w-full">
            {mathSymbols.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onInsertSymbol(` ${m} `)}
                className="px-2.5 py-1 bg-blue-950/80 hover:bg-blue-900 border border-blue-800 text-blue-200 rounded-lg font-mono text-xs font-bold cursor-pointer"
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {/* Physics Notation */}
        {activeCategory === "physics" && (
          <div className="flex flex-wrap items-center gap-1.5 w-full">
            {physicsNotation.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onInsertSymbol(` ${p} `)}
                className="px-2.5 py-1 bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-200 rounded-lg font-mono text-xs font-bold cursor-pointer"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Biology Diagrams Preset Modal trigger */}
        {activeCategory === "biology" && (
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-emerald-300 font-bold">
              مكتبة الرسومات البيولوجية والمخططات التوضيحية
            </span>
            <button
              type="button"
              onClick={() => setShowDiagramModal(true)}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <Dna className="w-3.5 h-3.5" />
              <span>عرض المخططات الجاهزة 🧬</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal for Selecting Biology Diagrams */}
      {showDiagramModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto text-right text-slate-800">
          <div className="bg-white rounded-3xl p-6 max-w-3xl w-full my-8 space-y-5 border border-slate-100 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Dna className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-800">رسومات ومخططات الأحياء والعلوم</h3>
                  <p className="text-xs text-slate-400">اختر المخطط المناسب ليتم ربطه بالسؤال تلقائياً كصورة توضيحية</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDiagramModal(false)}
                className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {BIOLOGY_DIAGRAMS.map((diagram) => (
                <div
                  key={diagram.id}
                  onClick={() => {
                    if (onSelectBiologyDiagram) {
                      onSelectBiologyDiagram(diagram);
                    }
                    if (onImageSelected) {
                      onImageSelected(diagram.svgDataUrl);
                    }
                    setShowDiagramModal(false);
                  }}
                  className="bg-slate-50 border border-slate-200 rounded-2xl p-3 hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer space-y-2 group flex flex-col justify-between"
                >
                  <div className="w-full h-36 bg-white rounded-xl overflow-hidden p-1 border border-slate-100 flex items-center justify-center">
                    <img 
                      src={diagram.svgDataUrl} 
                      alt={diagram.title} 
                      className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform" 
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800 group-hover:text-emerald-700 transition-colors">
                      {diagram.title}
                    </h4>
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                      {diagram.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="w-full py-1.5 bg-emerald-50 text-emerald-800 font-extrabold rounded-xl text-[11px] group-hover:bg-emerald-600 group-hover:text-white transition-all cursor-pointer"
                  >
                    إدراج المخطط بالسؤال 📌
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
