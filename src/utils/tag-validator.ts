import { Tag } from "../types/index.js";

export const REQUIRED_TAGS = ["Environment", "Owner", "Project"];

export function validateTags(tags: Tag[] | undefined): {
  compliant: boolean;
  missingTags: string[];
} {
  if (!tags || tags.length === 0) {
    return {
      compliant: false,
      missingTags: [...REQUIRED_TAGS],
    };
  }

  const missingTags: string[] = [];
  for (const req of REQUIRED_TAGS) {
    const hasTag = tags.some((t) => t.Key && t.Key.toLowerCase() === req.toLowerCase() && t.Value && t.Value.trim() !== "");
    if (!hasTag) {
      missingTags.push(req);
    }
  }

  return {
    compliant: missingTags.length === 0,
    missingTags,
  };
}

export function formatRecordToTags(tagsRecord?: Record<string, string>): Tag[] {
  if (!tagsRecord) return [];
  return Object.entries(tagsRecord).map(([Key, Value]) => ({
    Key,
    Value,
  }));
}
