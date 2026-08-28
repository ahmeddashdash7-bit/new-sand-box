/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Quiz, Subject, QuestionType, BankQuestion, HomeworkBlueprint, GradeLevel, DifficultyLevel } from "../types";

export const DEFAULT_BANK_QUESTIONS: BankQuestion[] = [
  {
    id: "bq-chem-1",
    type: QuestionType.MCQ,
    text: "What happens to the temperature of water when ammonium nitrate salt is dissolved in it, given that the dissolution process is endothermic?",
    options: [
      "The solution temperature increases",
      "The solution temperature decreases",
      "The temperature remains constant",
      "The temperature doubles immediately"
    ],
    correctAnswerIndex: 1,
    explanation: "Since dissolving ammonium nitrate is an endothermic process, it absorbs thermal energy from the surrounding water, causing the temperature of the solution to drop.",
    subject: Subject.Chemistry,
    grade: GradeLevel.Secondary1,
    lesson: "Unit 1: Thermochemistry",
    topic: "Endothermic Reactions",
    difficulty: DifficultyLevel.Medium,
    estimatedTimeMinutes: 2,
    tags: ["thermochemistry", "heat transfer", "enthalpy"],
    status: "active",
    createdBy: "Chemistry Teacher",
    createdAt: 1718910000000
  },
  {
    id: "bq-chem-2",
    type: QuestionType.MCQ,
    text: "Which of the following substances has the highest specific heat capacity?",
    options: [
      "1 gram of liquid water",
      "1 gram of iron",
      "1 gram of aluminum",
      "1 gram of water vapor"
    ],
    correctAnswerIndex: 0,
    explanation: "Liquid water possesses one of the highest known specific heat capacities (~4.18 J/g·°C).",
    subject: Subject.Chemistry,
    grade: GradeLevel.Secondary1,
    lesson: "Unit 1: Thermochemistry",
    topic: "Specific Heat",
    difficulty: DifficultyLevel.Easy,
    estimatedTimeMinutes: 1,
    tags: ["thermochemistry", "heat capacity", "water properties"],
    status: "active",
    createdBy: "Chemistry Teacher",
    createdAt: 1718910100000
  },
  {
    id: "bq-chem-3",
    type: QuestionType.TrueFalse,
    text: "In exothermic reactions, the heat content (enthalpy) of the reactants is greater than that of the products (ΔH is negative).",
    options: ["True", "False"],
    correctAnswerIndex: 0,
    explanation: "True, because the system releases energy into the surroundings.",
    subject: Subject.Chemistry,
    grade: GradeLevel.Secondary1,
    lesson: "Unit 1: Thermochemistry",
    topic: "Exothermic Reactions & Enthalpy",
    difficulty: DifficultyLevel.Hard,
    estimatedTimeMinutes: 2,
    tags: ["thermochemistry", "enthalpy"],
    status: "active",
    createdBy: "Chemistry Teacher",
    createdAt: 1718910200000
  },
  {
    id: "bq-phys-1",
    type: QuestionType.MCQ,
    text: "When an object moves along a uniform circular path, the direction of centripetal acceleration is always:",
    options: [
      "In the direction of tangential motion",
      "Opposite to the tangential motion",
      "Directed toward the center of the circular path",
      "Pointing radially outward from the center"
    ],
    correctAnswerIndex: 2,
    explanation: "Centripetal acceleration arises from the change in velocity direction and points toward the center.",
    subject: Subject.Physics,
    grade: GradeLevel.Secondary2,
    lesson: "Lesson 1: Circular Motion",
    topic: "Centripetal Acceleration",
    difficulty: DifficultyLevel.Medium,
    estimatedTimeMinutes: 2,
    tags: ["circular motion", "acceleration"],
    status: "active",
    createdBy: "Physics Teacher",
    createdAt: 1718910300000
  },
  {
    id: "bq-phys-2",
    type: QuestionType.TrueFalse,
    text: "The centripetal force required to keep a vehicle in a circular turn increases if the turn radius increases while mass and speed remain constant.",
    options: ["True", "False"],
    correctAnswerIndex: 1,
    explanation: "False, because centripetal force is inversely proportional to radius (F = mv² / r).",
    subject: Subject.Physics,
    grade: GradeLevel.Secondary2,
    lesson: "Lesson 1: Circular Motion",
    topic: "Centripetal Force",
    difficulty: DifficultyLevel.Hard,
    estimatedTimeMinutes: 2,
    tags: ["circular motion", "newton laws"],
    status: "active",
    createdBy: "Physics Teacher",
    createdAt: 1718910400000
  },
  {
    id: "bq-bio-1",
    type: QuestionType.MCQ,
    text: "Which reagent is used to test for reducing monosaccharides (like glucose) and turns from blue to brick-orange upon heating?",
    options: [
      "Benedict's Reagent",
      "Iodine Solution",
      "Biuret Reagent",
      "Sudan IV Solution"
    ],
    correctAnswerIndex: 0,
    explanation: "Benedict's reagent turns from blue to orange upon heating with reducing sugars.",
    subject: Subject.Biology,
    grade: GradeLevel.Secondary1,
    lesson: "Unit 1: Macromolecules",
    topic: "Carbohydrates & Reagents",
    difficulty: DifficultyLevel.Easy,
    estimatedTimeMinutes: 1,
    tags: ["biomolecules", "carbohydrates"],
    status: "active",
    createdBy: "Biology Teacher",
    createdAt: 1718910600000
  },
  {
    id: "bq-int-1",
    type: QuestionType.MCQ,
    text: "Producers (such as green plants) serve as the foundation of any ecosystem because they:",
    options: [
      "Decompose dead organisms and recycle nutrients",
      "Perform photosynthesis to convert light energy into stored chemical energy",
      "Only consume oxygen and release carbon dioxide",
      "Live parasitically on host organisms"
    ],
    correctAnswerIndex: 1,
    explanation: "Plants convert light energy into stored chemical energy via photosynthesis.",
    subject: Subject.IntegratedScience,
    grade: GradeLevel.Secondary1,
    lesson: "Unit 1: Ecosystems",
    topic: "Ecosystems & Photosynthesis",
    difficulty: DifficultyLevel.Easy,
    estimatedTimeMinutes: 1,
    tags: ["ecology", "photosynthesis"],
    status: "active",
    createdBy: "Integrated Science Teacher",
    createdAt: 1718910900000
  }
];

export const DEFAULT_BLUEPRINTS: HomeworkBlueprint[] = [
  {
    id: "bp-chem-101",
    title: "Thermochemistry & Physical Changes Homework Blueprint",
    subject: Subject.Chemistry,
    grade: GradeLevel.Secondary1,
    lesson: "Unit 1: Thermochemistry",
    topics: ["enthalpy", "reaction rate", "heat transfer"],
    tags: ["thermochemistry", "enthalpy"],
    questionMix: {
      mcqCount: 7,
      trueFalseCount: 3,
      shortAnswerCount: 0
    },
    totalQuestions: 10,
    difficultyDistribution: {
      easyCount: 3,
      mediumCount: 5,
      hardCount: 2,
      easyPct: 30,
      mediumPct: 50,
      hardPct: 20
    },
    allowedQuestionTypes: [QuestionType.MCQ, QuestionType.TrueFalse],
    timeLimitMinutes: 20,
    randomizeQuestionOrder: true,
    randomizeAnswerChoices: true,
    allowBacktracking: true,
    passingScorePct: 60,
    maxAttempts: 2,
    teacherName: "Chemistry Teacher",
    status: "active",
    createdAt: 1718910000000
  },
  {
    id: "bp-phys-201",
    title: "Circular Motion & Universal Gravitation Blueprint",
    subject: Subject.Physics,
    grade: GradeLevel.Secondary2,
    lesson: "Lesson 1: Circular Motion",
    topics: ["circular motion", "gravitation"],
    tags: ["newton laws", "circular motion"],
    questionMix: {
      mcqCount: 8,
      trueFalseCount: 0,
      shortAnswerCount: 0
    },
    totalQuestions: 8,
    difficultyDistribution: {
      easyCount: 2,
      mediumCount: 4,
      hardCount: 2,
      easyPct: 25,
      mediumPct: 50,
      hardPct: 25
    },
    allowedQuestionTypes: [QuestionType.MCQ],
    timeLimitMinutes: 15,
    randomizeQuestionOrder: true,
    randomizeAnswerChoices: true,
    allowBacktracking: true,
    passingScorePct: 70,
    maxAttempts: 3,
    teacherName: "Physics Teacher",
    status: "active",
    createdAt: 1718910100000
  }
];

export const SAMPLE_QUIZZES: Quiz[] = [
  {
    id: "template-chemistry-1",
    title: "Thermochemistry & Chemical Bonding - 1 Sec",
    subject: Subject.Chemistry,
    grade: "1 Sec",
    teacherName: "Science Teacher",
    teacherWhatsApp: "201000205897",
    createdAt: 1718912345000,
    questions: [
      {
        id: "q-chem-1",
        type: QuestionType.MCQ,
        text: "What happens to the temperature of water when ammonium nitrate salt is dissolved in it, given that the dissolution process is endothermic?",
        options: [
          "The solution temperature increases",
          "The solution temperature decreases",
          "The temperature remains constant",
          "The temperature doubles immediately"
        ],
        correctAnswerIndex: 1,
        explanation: "Since dissolving ammonium nitrate is an endothermic process, it absorbs thermal energy from the surrounding water, causing the temperature of the solution to drop."
      },
      {
        id: "q-chem-2",
        type: QuestionType.MCQ,
        text: "Which of the following substances has the highest specific heat capacity?",
        options: [
          "1 gram of liquid water",
          "1 gram of iron",
          "1 gram of aluminum",
          "1 gram of water vapor"
        ],
        correctAnswerIndex: 0,
        explanation: "Liquid water possesses one of the highest known specific heat capacities (~4.18 J/g·°C), requiring more energy to raise its temperature compared to metals."
      },
      {
        id: "q-chem-3",
        type: QuestionType.TrueFalse,
        text: "In exothermic reactions, the heat content (enthalpy) of the reactants is greater than that of the products (ΔH is negative).",
        options: ["True", "False"],
        correctAnswerIndex: 0,
        explanation: "True, because energy is released from the system into the surroundings, leaving the products with lower total enthalpy than the reactants."
      },
      {
        id: "q-chem-4",
        type: QuestionType.MCQ,
        text: "A closed thermodynamic system allows the exchange of:",
        options: [
          "Matter only, but not energy",
          "Energy only, but not matter",
          "Both matter and energy with surroundings",
          "Neither matter nor energy"
        ],
        correctAnswerIndex: 1,
        explanation: "A closed system exchanges energy (as heat or work) with its surroundings across its boundary, but prevents the flow of matter."
      }
    ]
  },
  {
    id: "template-physics-1",
    title: "Circular Motion & Gravitation - 1 Sec",
    subject: Subject.Physics,
    grade: "1 Sec",
    teacherName: "Physics Teacher",
    teacherWhatsApp: "201000205897",
    createdAt: 1718912346000,
    questions: [
      {
        id: "q-phys-1",
        type: QuestionType.MCQ,
        text: "When an object moves along a uniform circular path, the direction of centripetal acceleration is always:",
        options: [
          "In the direction of tangential motion",
          "Opposite to the tangential motion",
          "Directed toward the center of the circular path",
          "Pointing radially outward from the center"
        ],
        correctAnswerIndex: 2,
        explanation: "Centripetal acceleration arises solely from the change in velocity direction and is constantly directed perpendicular to tangential velocity toward the center."
      },
      {
        id: "q-phys-2",
        type: QuestionType.TrueFalse,
        text: "The centripetal force required to keep a vehicle in a circular turn increases if the turn radius increases while mass and speed remain constant.",
        options: ["True", "False"],
        correctAnswerIndex: 1,
        explanation: "False, because centripetal force is inversely proportional to radius (F = mv² / r). Increasing radius reduces the required centripetal force."
      },
      {
        id: "q-phys-3",
        type: QuestionType.MCQ,
        text: "If the distance between the centers of two massive bodies is doubled, the mutual gravitational attraction force between them becomes:",
        options: [
          "Doubled",
          "Four times greater",
          "Halved",
          "One-fourth of original value"
        ],
        correctAnswerIndex: 3,
        explanation: "According to Newton's Law of Universal Gravitation, force is inversely proportional to the square of distance (1/r²). Doubling distance reduces force to 1/4."
      }
    ]
  },
  {
    id: "template-biology-1",
    title: "Biomolecules & Cell Biology - 1 Sec",
    subject: Subject.Biology,
    grade: "1 Sec",
    teacherName: "Biology Teacher",
    teacherWhatsApp: "201000205897",
    createdAt: 1718912347000,
    questions: [
      {
        id: "q-bio-1",
        type: QuestionType.MCQ,
        text: "Which reagent is used to test for reducing monosaccharides (like glucose) and turns from blue to brick-orange upon heating?",
        options: [
          "Benedict's Reagent",
          "Iodine Solution",
          "Biuret Reagent",
          "Sudan IV Solution"
        ],
        correctAnswerIndex: 0,
        explanation: "Benedict's reagent turns from clear blue to orange/red precipitate when heated with reducing sugars such as glucose."
      },
      {
        id: "q-bio-2",
        type: QuestionType.MCQ,
        text: "Which cellular organelle is primarily responsible for ATP energy synthesis during aerobic respiration?",
        options: [
          "Ribosomes",
          "Golgi Apparatus",
          "Mitochondria",
          "Chloroplasts"
        ],
        correctAnswerIndex: 2,
        explanation: "Mitochondria are known as the powerhouses of the cell, generating ATP molecules through cellular respiration."
      },
      {
        id: "q-bio-3",
        type: QuestionType.TrueFalse,
        text: "Proteins consist of repeating monomer units called fatty acids linked together by peptide bonds.",
        options: ["True", "False"],
        correctAnswerIndex: 1,
        explanation: "False, because proteins are made of amino acids linked by peptide bonds. Fatty acids are structural components of lipids."
      }
    ]
  },
  {
    id: "template-integrated-science-1",
    title: "Energy & Ecological Systems - Grade 7",
    subject: Subject.IntegratedScience,
    grade: "Grade 7",
    teacherName: "Integrated Science Teacher",
    teacherWhatsApp: "201000205897",
    createdAt: 1718912348000,
    questions: [
      {
        id: "q-int-1",
        type: QuestionType.MCQ,
        text: "Producers (such as green plants) serve as the foundation of any ecosystem because they:",
        options: [
          "Decompose dead organisms and recycle nutrients",
          "Perform photosynthesis to convert light energy into stored chemical energy",
          "Only consume oxygen and release carbon dioxide",
          "Live parasitically on host organisms"
        ],
        correctAnswerIndex: 1,
        explanation: "Plants are autotrophs that manufacture organic food molecules through photosynthesis, trapping solar energy into chemical bonds to sustain food webs."
      },
      {
        id: "q-int-2",
        type: QuestionType.TrueFalse,
        text: "Coal, petroleum, and natural gas are clean, renewable energy sources that produce no environmental pollution.",
        options: ["True", "False"],
        correctAnswerIndex: 1,
        explanation: "False, coal and oil are non-renewable fossil fuels that emit carbon dioxide upon combustion. Solar, wind, and hydro are clean renewable sources."
      }
    ]
  }
];
