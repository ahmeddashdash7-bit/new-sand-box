/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { motion } from "motion/react";

interface GhadaLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
}

export default function GhadaLogo({ className = "", size = "md", showText = true }: GhadaLogoProps) {
  // تحديد الحجم
  const sizeMap = {
    sm: { box: "w-10 h-10", svg: 40, text: "text-xs" },
    md: { box: "w-16 h-16", svg: 64, text: "text-sm" },
    lg: { box: "w-24 h-24", svg: 96, text: "text-base" },
    xl: { box: "w-36 h-36 md:w-44 md:h-44", svg: 160, text: "text-lg" }
  };

  const currentSize = sizeMap[size];

  return (
    <div className={`flex flex-col items-center justify-center text-center select-none ${className}`} id="science-garden-logo-container">
      {/* الشعار المدمج بصيغة Inline SVG النقي 100% لخيار العرض على الويب والطباعة للـ PDF */}
      <div className={`relative ${currentSize.box} flex items-center justify-center transition-all duration-300 hover:scale-105`} id="science-garden-badge">
        
        {/* هالة خلفية ناعمة لتوهج حديقة العلوم */}
        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/20 via-teal-400/20 to-amber-500/20 rounded-full blur-md animate-pulse"></div>

        {/* أيقونة Inline SVG فائقة الوضوح لموضوع حديقة العلوم (ورقة شجر + ذرة وعناصر كيمياء) */}
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full drop-shadow-md relative z-10"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* التدرج الأخضر الطبيعي للورقة */}
            <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor="#059669" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>

            {/* التدرج الذهبي للذرة والعلوم */}
            <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>

            {/* التدرج الأزرق للنواة والكيمياء */}
            <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>
          </defs>

          {/* الخلفية الدائرية مع حدود الشعار */}
          <circle cx="50" cy="50" r="46" fill="#ffffff" stroke="url(#goldGrad)" strokeWidth="3" />
          <circle cx="50" cy="50" r="42" fill="#f0fdf4" opacity="0.6" />

          {/* ورقة حديقة العلوم المركزية (Science Garden Leaf) */}
          <path
            d="M50 18 C30 30 25 55 50 82 C75 55 70 30 50 18 Z"
            fill="url(#leafGrad)"
            opacity="0.95"
          />

          {/* العرق الأوسط للورقة */}
          <path
            d="M50 25 Q50 50 50 78"
            stroke="#ecfdf5"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* مدارات الذرة العلمية الالتفافية (Atom Orbit Lines) */}
          <ellipse
            cx="50"
            cy="50"
            rx="34"
            ry="13"
            stroke="url(#goldGrad)"
            strokeWidth="2.2"
            transform="rotate(-30 50 50)"
          />
          <ellipse
            cx="50"
            cy="50"
            rx="34"
            ry="13"
            stroke="url(#blueGrad)"
            strokeWidth="2.2"
            transform="rotate(30 50 50)"
          />

          {/* الإلكترونات والنواة المضيئة */}
          <circle cx="50" cy="50" r="5" fill="url(#goldGrad)" />
          <circle cx="22" cy="36" r="3.5" fill="#0284c7" />
          <circle cx="78" cy="64" r="3.5" fill="#d97706" />
          <circle cx="68" cy="28" r="3" fill="#10b981" />

          {/* أزهار/نجوم المتفوقين الصغيرة */}
          <path d="M50 10 L52 14 L56 14 L53 17 L54 21 L50 18 L46 21 L47 17 L44 14 L48 14 Z" fill="url(#goldGrad)" />
        </svg>
      </div>

      {/* Edulink Title */}
      {showText && (
        <motion.div 
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-2 space-y-1"
        >
          <h2 className="text-sm md:text-base font-black text-slate-800 tracking-tight dark:text-white" id="science-garden-title-text">
            Edulink 🧪🌱
          </h2>
          <p className="text-[10px] text-emerald-800 font-extrabold bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-3 py-0.5 rounded-full inline-block tracking-wide shadow-sm" id="science-garden-subtitle-badge">
            Interactive Science Learning & Assessment Platform
          </p>
        </motion.div>
      )}
    </div>
  );
}

