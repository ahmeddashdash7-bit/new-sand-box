/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BankQuestion } from "../types";
import { 
  saveBankQuestionToFirestore, 
  deleteBankQuestionFromFirestore, 
  fetchBankQuestionsFromFirestore 
} from "./firebase";
import { DEFAULT_BANK_QUESTIONS } from "../data/templates"; // or local constants

export { DEFAULT_BANK_QUESTIONS };

export async function getStoredBankQuestions(): Promise<BankQuestion[]> {
  try {
    const remote = await fetchBankQuestionsFromFirestore();
    if (remote && remote.length > 0) {
      return remote;
    }
  } catch (err) {
    console.warn("Error loading bank questions from Firestore:", err);
  }
  return DEFAULT_BANK_QUESTIONS;
}

export async function saveBankQuestion(question: BankQuestion): Promise<boolean> {
  return await saveBankQuestionToFirestore(question);
}

export async function deleteBankQuestion(id: string): Promise<boolean> {
  return await deleteBankQuestionFromFirestore(id);
}

