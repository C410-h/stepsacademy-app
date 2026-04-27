import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Display name for a teacher: strips any existing "Professor/Profa./Prof."
 * prefix and re-applies a consistent "Prof. " so the actual stored name
 * doesn't need the title baked in.
 */
export function formatTeacherName(name: string | null | undefined): string {
  if (!name) return "";
  const cleaned = name.replace(/^(Profa?\.?\s+|Professora?\s+)/i, "").trim();
  return `Prof. ${cleaned}`;
}
