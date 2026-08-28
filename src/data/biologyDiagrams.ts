/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BiologyDiagram {
  id: string;
  title: string;
  category: "Cell" | "Anatomy" | "Genetics" | "Organ Systems";
  svgDataUrl: string;
  description: string;
}

// SVG helper to create data URLs
function createSvgDataUrl(svgString: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgString.trim())}`;
}

export const BIOLOGY_DIAGRAMS: BiologyDiagram[] = [
  {
    id: "plant-cell",
    title: "Plant Cell Diagram",
    category: "Cell",
    description: "Illustration of plant cell organelles including cell wall, chloroplasts, central vacuole, and nucleus.",
    svgDataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
        <rect width="400" height="300" fill="#f0fdf4" rx="16"/>
        <!-- Wall & Membrane -->
        <rect x="30" y="30" width="340" height="240" rx="30" fill="#dcfce7" stroke="#16a34a" stroke-width="8"/>
        <rect x="40" y="40" width="320" height="220" rx="22" fill="#f0fdf4" stroke="#22c55e" stroke-width="3"/>
        <!-- Large Vacuole -->
        <ellipse cx="220" cy="150" rx="90" ry="60" fill="#bae6fd" stroke="#0284c7" stroke-width="3" opacity="0.8"/>
        <text x="220" y="155" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0369a1" text-anchor="middle">Central Vacuole</text>
        <!-- Nucleus -->
        <circle cx="90" cy="100" r="35" fill="#fbcfe8" stroke="#db2777" stroke-width="3"/>
        <circle cx="90" cy="100" r="14" fill="#9d174d"/>
        <text x="90" y="150" font-family="sans-serif" font-size="12" font-weight="bold" fill="#9d174d" text-anchor="middle">Nucleus</text>
        <!-- Chloroplasts -->
        <ellipse cx="300" cy="80" rx="22" ry="12" fill="#4ade80" stroke="#15803d" stroke-width="2"/>
        <ellipse cx="310" cy="210" rx="22" ry="12" fill="#4ade80" stroke="#15803d" stroke-width="2"/>
        <ellipse cx="100" cy="210" rx="22" ry="12" fill="#4ade80" stroke="#15803d" stroke-width="2"/>
        <text x="310" y="238" font-family="sans-serif" font-size="11" font-weight="bold" fill="#15803d" text-anchor="middle">Chloroplast</text>
        <!-- Cell Wall Label -->
        <text x="200" y="22" font-family="sans-serif" font-size="13" font-weight="bold" fill="#15803d" text-anchor="middle">Cell Wall Structure</text>
      </svg>
    `)
  },
  {
    id: "animal-cell",
    title: "Animal Cell Diagram",
    category: "Cell",
    description: "Illustration of animal cell organelles including plasma membrane, nucleus, mitochondria, and cytoplasm.",
    svgDataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
        <rect width="400" height="300" fill="#fdf2f8" rx="16"/>
        <!-- Membrane -->
        <ellipse cx="200" cy="150" rx="160" ry="110" fill="#fce7f3" stroke="#ec4899" stroke-width="5"/>
        <!-- Cytoplasm -->
        <text x="310" y="70" font-family="sans-serif" font-size="12" font-weight="bold" fill="#be185d">Cytoplasm</text>
        <!-- Nucleus -->
        <circle cx="180" cy="140" r="45" fill="#e0e7ff" stroke="#4338ca" stroke-width="3"/>
        <circle cx="180" cy="140" r="18" fill="#312e81"/>
        <text x="180" y="200" font-family="sans-serif" font-size="12" font-weight="bold" fill="#312e81" text-anchor="middle">Nucleus</text>
        <!-- Mitochondria -->
        <ellipse cx="80" cy="120" rx="25" ry="14" fill="#fca5a5" stroke="#b91c1c" stroke-width="2" transform="rotate(-20 80 120)"/>
        <ellipse cx="290" cy="180" rx="25" ry="14" fill="#fca5a5" stroke="#b91c1c" stroke-width="2" transform="rotate(15 290 180)"/>
        <text x="290" y="210" font-family="sans-serif" font-size="11" font-weight="bold" fill="#991b1b" text-anchor="middle">Mitochondria</text>
        <!-- Label -->
        <text x="200" y="26" font-family="sans-serif" font-size="14" font-weight="bold" fill="#be185d" text-anchor="middle">Animal Cell Structure</text>
      </svg>
    `)
  },
  {
    id: "human-heart",
    title: "Human Heart Structure",
    category: "Anatomy",
    description: "Anatomy of the human heart showing four chambers (Right/Left Atria and Ventricles).",
    svgDataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
        <rect width="400" height="300" fill="#fff1f2" rx="16"/>
        <!-- Heart Outline -->
        <path d="M 200 260 C 120 200 60 140 80 80 C 100 30 170 40 200 90 C 230 40 300 30 320 80 C 340 140 280 200 200 260 Z" fill="#fecdd3" stroke="#e11d48" stroke-width="6"/>
        <!-- Chambers Divider -->
        <line x1="200" y1="90" x2="200" y2="250" stroke="#be123c" stroke-width="4" stroke-dasharray="6,4"/>
        <line x1="100" y1="140" x2="300" y2="140" stroke="#be123c" stroke-width="3" stroke-dasharray="6,4"/>
        <!-- Labels -->
        <text x="140" y="110" font-family="sans-serif" font-size="12" font-weight="bold" fill="#9f1239" text-anchor="middle">Right Atrium</text>
        <text x="260" y="110" font-family="sans-serif" font-size="12" font-weight="bold" fill="#9f1239" text-anchor="middle">Left Atrium</text>
        <text x="140" y="190" font-family="sans-serif" font-size="12" font-weight="bold" fill="#881337" text-anchor="middle">Right Ventricle</text>
        <text x="260" y="190" font-family="sans-serif" font-size="12" font-weight="bold" fill="#881337" text-anchor="middle">Left Ventricle</text>
        <!-- Title -->
        <text x="200" y="24" font-family="sans-serif" font-size="14" font-weight="bold" fill="#be123c" text-anchor="middle">Human Heart Anatomy</text>
      </svg>
    `)
  },
  {
    id: "dna-helix",
    title: "DNA Double Helix Structure",
    category: "Genetics",
    description: "Double helix model showing nitrogenous base pairs (Adenine-Thymine, Cytosine-Guanine).",
    svgDataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
        <rect width="400" height="300" fill="#f0f9ff" rx="16"/>
        <!-- Double Helix Strands -->
        <path d="M 60 50 Q 130 150 200 50 T 340 50" fill="none" stroke="#0284c7" stroke-width="5"/>
        <path d="M 60 150 Q 130 50 200 150 T 340 150" fill="none" stroke="#2563eb" stroke-width="5"/>
        <!-- Base Pairs -->
        <line x1="80" y1="75" x2="80" y2="125" stroke="#16a34a" stroke-width="4"/>
        <line x1="130" y1="120" x2="130" y2="80" stroke="#dc2626" stroke-width="4"/>
        <line x1="170" y1="75" x2="170" y2="125" stroke="#f59e0b" stroke-width="4"/>
        <line x1="230" y1="120" x2="230" y2="80" stroke="#16a34a" stroke-width="4"/>
        <line x1="280" y1="75" x2="280" y2="125" stroke="#dc2626" stroke-width="4"/>
        <line x1="320" y1="110" x2="320" y2="90" stroke="#f59e0b" stroke-width="4"/>
        <!-- Legend -->
        <rect x="60" y="200" width="280" height="70" rx="12" fill="#ffffff" stroke="#bae6fd" stroke-width="2"/>
        <text x="200" y="222" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0369a1" text-anchor="middle">Complementary Base Pairs</text>
        <text x="130" y="250" font-family="sans-serif" font-size="11" font-weight="bold" fill="#16a34a">A - T (Adenine - Thymine)</text>
        <text x="250" y="250" font-family="sans-serif" font-size="11" font-weight="bold" fill="#dc2626">C - G (Cytosine - Guanine)</text>
        <text x="200" y="24" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1d4ed8" text-anchor="middle">DNA Double Helix Molecule</text>
      </svg>
    `)
  },
  {
    id: "chloroplast-photosynthesis",
    title: "Chloroplast & Photosynthesis",
    category: "Cell",
    description: "Chloroplast organelle structure showing thylakoid grana, stroma, and overall photosynthesis equation.",
    svgDataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
        <rect width="400" height="300" fill="#f0fdf4" rx="16"/>
        <!-- Chloroplast Oval -->
        <ellipse cx="200" cy="150" rx="160" ry="90" fill="#bbf7d0" stroke="#15803d" stroke-width="6"/>
        <!-- Grana Stacks -->
        <g transform="translate(100, 110)">
          <rect x="0" y="0" width="40" height="12" rx="4" fill="#16a34a"/>
          <rect x="0" y="16" width="40" height="12" rx="4" fill="#16a34a"/>
          <rect x="0" y="32" width="40" height="12" rx="4" fill="#16a34a"/>
          <text x="20" y="62" font-family="sans-serif" font-size="11" font-weight="bold" fill="#14532d" text-anchor="middle">Grana</text>
        </g>
        <g transform="translate(250, 110)">
          <rect x="0" y="0" width="40" height="12" rx="4" fill="#16a34a"/>
          <rect x="0" y="16" width="40" height="12" rx="4" fill="#16a34a"/>
          <rect x="0" y="32" width="40" height="12" rx="4" fill="#16a34a"/>
          <text x="20" y="62" font-family="sans-serif" font-size="11" font-weight="bold" fill="#14532d" text-anchor="middle">Grana</text>
        </g>
        <!-- Stroma -->
        <text x="200" y="155" font-family="sans-serif" font-size="13" font-weight="bold" fill="#166534" text-anchor="middle">Stroma Fluid</text>
        <!-- Equation -->
        <text x="200" y="265" font-family="sans-serif" font-size="11" font-weight="bold" fill="#14532d" text-anchor="middle">6CO₂ + 6H₂O ➔ C₆H₁₂O₆ + 6O₂</text>
        <text x="200" y="24" font-family="sans-serif" font-size="14" font-weight="bold" fill="#15803d" text-anchor="middle">Chloroplast Structure & Function</text>
      </svg>
    `)
  }
];
