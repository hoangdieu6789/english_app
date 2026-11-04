export const TASK_LABELS: Record<string, string> = {
  shadowing: "Shadowing",
  part1: "IELTS Part 1",
  part2: "IELTS Part 2",
  part3: "IELTS Part 3",
  full_test: "Full test",
};

export function taskLabel(taskType: string): string {
  return TASK_LABELS[taskType] ?? taskType;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
}
