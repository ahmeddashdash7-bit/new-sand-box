/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HomeworkBlueprint } from "../types";
import { 
  saveBlueprintToFirestore, 
  deleteBlueprintFromFirestore, 
  fetchBlueprintsFromFirestore 
} from "./firebase";

export const DEFAULT_BLUEPRINTS: HomeworkBlueprint[] = [];

export async function getStoredBlueprints(): Promise<HomeworkBlueprint[]> {
  try {
    const remote = await fetchBlueprintsFromFirestore();
    if (remote && remote.length > 0) {
      return remote;
    }
  } catch (err) {
    console.warn("Error loading blueprints from Firestore:", err);
  }
  return DEFAULT_BLUEPRINTS;
}

export async function saveBlueprint(blueprint: HomeworkBlueprint): Promise<boolean> {
  return await saveBlueprintToFirestore(blueprint);
}

export async function deleteBlueprint(id: string): Promise<boolean> {
  return await deleteBlueprintFromFirestore(id);
}

