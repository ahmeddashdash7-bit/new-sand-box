import { StudentResult, Quiz, Question, BankQuestion, StudentAssignmentDocument, QuestionType, Subject } from "../types";
import {
  getStudentAssignmentFromFirestore,
  fetchQuestionsByIdsFromFirestore,
  getAssessmentFromFirestore,
  pickQuestionImageFields
} from "./firebase";
import { getStoredBankQuestions } from "./questionBankStore";

/**
 * Reconstructs the exact assessment shown to a student for a submission using:
 * 1. Question Bank cache (or Firestore fallback)
 * 2. StudentAssignment document (for ordered questionIds & numeric optionPermutations)
 * 3. Submission metadata
 */
export async function reconstructAssessmentFromSubmission(
  submission: StudentResult,
  cachedBankQuestions?: BankQuestion[]
): Promise<Quiz> {
  // 1. Obtain Question Bank questions (use passed cache, or local store cache)
  let bankQuestions = cachedBankQuestions || [];
  if (!bankQuestions || bankQuestions.length === 0) {
    try {
      bankQuestions = await getStoredBankQuestions();
    } catch (e) {
      console.warn("Could not load question bank cache:", e);
    }
  }

  // Create lookup map for fast retrieval
  const bankMap = new Map<string, BankQuestion>();
  bankQuestions.forEach(q => bankMap.set(q.id, q));

  // 2. Fetch associated StudentAssignment document if studentAssignmentId is present
  let assignment: StudentAssignmentDocument | null = null;
  if (submission.studentAssignmentId) {
    try {
      assignment = await getStudentAssignmentFromFirestore(submission.studentAssignmentId);
    } catch (e) {
      console.warn("Error reading student assignment from Firestore:", e);
    }
  }

  // 3. Determine ordered list of question IDs
  let orderedQuestionIds: string[] = [];
  if (assignment?.questionIds && assignment.questionIds.length > 0) {
    orderedQuestionIds = assignment.questionIds;
  } else if (submission.answers && submission.answers.length > 0) {
    orderedQuestionIds = submission.answers.map(a => a.questionId).filter(Boolean);
  }

  // If missing, fallback to parent assessment document
  if (orderedQuestionIds.length === 0 && (submission.quizId || submission.assessmentId)) {
    const parentId = submission.quizId || submission.assessmentId;
    if (parentId) {
      try {
        const assessmentDoc = await getAssessmentFromFirestore(parentId);
        if (assessmentDoc?.questions) {
          orderedQuestionIds = assessmentDoc.questions.map(q => q.id);
        }
      } catch (e) {
        console.warn("Error fetching parent assessment from Firestore:", e);
      }
    }
  }

  // 4. Check for missing question IDs not present in bank cache
  const missingQuestionIds = orderedQuestionIds.filter(id => !bankMap.has(id));
  if (missingQuestionIds.length > 0) {
    try {
      const fetchedQuestions = await fetchQuestionsByIdsFromFirestore(missingQuestionIds);
      fetchedQuestions.forEach(q => bankMap.set(q.id, q as BankQuestion));
    } catch (e) {
      console.warn("Error fetching missing questions from Firestore:", e);
    }
  }

  // 5. Recreate exact questions and option order shown to student
  const reconstructedQuestions: Question[] = [];

  for (let idx = 0; idx < orderedQuestionIds.length; idx++) {
    const qId = orderedQuestionIds[idx];
    const baseQuestion = bankMap.get(qId);

    if (!baseQuestion) {
      // Fallback for missing question
      reconstructedQuestions.push({
        id: qId,
        text: `Question #${idx + 1} (${qId})`,
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswerIndex: 0,
        explanation: "Question content unavailable in question bank.",
        type: QuestionType.MCQ,
        subject: submission.quizSnapshot?.subject || Subject.Chemistry,
        grade: submission.quizSnapshot?.grade || "Grade 10",
        lesson: "General"
      });
      continue;
    }

    // Retrieve numeric optionPermutations from studentAssignment
    const optionPermutation = assignment?.optionPermutations?.[qId] || assignment?.optionPermutations?.[idx as any];

    let shownOptions = [...baseQuestion.options];
    let shownCorrectIndex = baseQuestion.correctAnswerIndex;

    if (
      optionPermutation &&
      Array.isArray(optionPermutation) &&
      optionPermutation.length === baseQuestion.options.length
    ) {
      // Reconstruct shown options using numeric permutation indexes e.g. [2, 0, 3, 1]
      shownOptions = optionPermutation.map(i => baseQuestion.options[i]);
      const newCorrectIdx = optionPermutation.indexOf(baseQuestion.correctAnswerIndex);
      shownCorrectIndex = newCorrectIdx >= 0 ? newCorrectIdx : baseQuestion.correctAnswerIndex;
    }

    reconstructedQuestions.push({
      id: baseQuestion.id,
      text: baseQuestion.text,
      options: shownOptions,
      correctAnswerIndex: shownCorrectIndex,
      explanation: baseQuestion.explanation || "",
      type: baseQuestion.type || QuestionType.MCQ,
      subject: baseQuestion.subject,
      grade: baseQuestion.grade,
      lesson: baseQuestion.lesson,
      topic: baseQuestion.topic,
      difficulty: baseQuestion.difficulty,
      // Carry the image reference through so printed/reviewed reports show the same figure
      // the student saw. Shuffling only permutes options, never the attached image.
      ...pickQuestionImageFields(baseQuestion)
    });
  }

  // 6. Return reconstructed Quiz object
  return {
    id: submission.quizId || submission.assessmentId || "quiz-report",
    title: submission.quizTitle || submission.quizSnapshot?.title || "Assessment Report",
    type: "quiz",
    subject: reconstructedQuestions[0]?.subject || submission.quizSnapshot?.subject || Subject.Chemistry,
    grade: reconstructedQuestions[0]?.grade || submission.quizSnapshot?.grade || "Grade 10",
    teacherName: submission.teacherName || submission.quizSnapshot?.teacherName || "Science Teacher",
    questions: reconstructedQuestions,
    createdAt: submission.submittedAt || Date.now()
  };
}
