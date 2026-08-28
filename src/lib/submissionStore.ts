import { StudentResult } from "../types";
import { 
  saveSubmissionToFirestore, 
  deleteSubmissionFromFirestore, 
  clearSubmissionsFromFirestore,
  fetchAllSubmissionsFromFirestore 
} from "./firebase";

export async function getStoredSubmissions(): Promise<StudentResult[]> {
  try {
    return await fetchAllSubmissionsFromFirestore();
  } catch (err) {
    console.error("Error fetching submissions from Firestore:", err);
    return [];
  }
}

export async function saveSubmission(newResult: StudentResult): Promise<boolean> {
  try {
    const success = await saveSubmissionToFirestore(newResult);
    window.dispatchEvent(new Event("student_result_submitted"));
    return success;
  } catch (err) {
    console.error("Error saving submission to Firestore:", err);
    return false;
  }
}

export async function deleteSubmission(submittedAt: number): Promise<boolean> {
  try {
    return await deleteSubmissionFromFirestore(submittedAt);
  } catch (err) {
    console.error("Error deleting submission from Firestore:", err);
    return false;
  }
}

export async function clearAllSubmissions(): Promise<boolean> {
  try {
    return await clearSubmissionsFromFirestore();
  } catch (err) {
    console.error("Error clearing submissions from Firestore:", err);
    return false;
  }
}

export function encodeResultCode(result: StudentResult): string {
  try {
    const payload = {
      sid: result.studentId,
      susr: result.studentUsername,
      n: result.studentName,
      s: result.seatNumber,
      qId: result.quizId,
      t: result.quizTitle,
      sc: result.score,
      tot: result.totalQuestions,
      tm: result.timeTakenSeconds,
      dt: result.submittedAt,
      ans: result.answers,
      snap: result.quizSnapshot
    };
    const jsonStr = JSON.stringify(payload);
    return btoa(encodeURIComponent(jsonStr));
  } catch (e) {
    console.error("Failed to encode result code:", e);
    return "";
  }
}

export function decodeResultCode(code: string): StudentResult | null {
  try {
    const cleanCode = code.trim().replace(/\s+/g, "");
    const decodedStr = decodeURIComponent(atob(cleanCode));
    const data = JSON.parse(decodedStr);

    if (data && data.n && data.t && data.sc !== undefined) {
      return {
        studentId: data.sid,
        studentUsername: data.susr,
        studentName: data.n,
        seatNumber: data.s || "N/A",
        quizId: data.qId || "imported",
        quizTitle: data.t,
        quizSnapshot: data.snap,
        score: Number(data.sc),
        totalQuestions: Number(data.tot || 10),
        answers: data.ans || [],
        timeTakenSeconds: Number(data.tm || 0),
        submittedAt: Number(data.dt || Date.now())
      };
    }
  } catch (e) {
    console.error("Invalid or corrupted result code:", e);
  }
  return null;
}

export async function importSubmissionCode(code: string): Promise<{ success: boolean; message: string; result?: StudentResult }> {
  const result = decodeResultCode(code);
  if (!result) {
    return { success: false, message: "Invalid or corrupted result code. Please make sure to copy the code completely." };
  }

  const saved = await saveSubmission(result);
  if (saved) {
    return { success: true, message: `Successfully imported student result for (${result.studentName})!`, result };
  } else {
    return { success: false, message: "Failed to save imported result to Firestore." };
  }
}

