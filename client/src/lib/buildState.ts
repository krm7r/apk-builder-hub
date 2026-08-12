import type { GithubRun, GithubStep } from "@/lib/github";

export function buildProgress(run: GithubRun | null, steps: GithubStep[]) {
  if (!run) return 0;
  if (run.status === "completed") return 100;
  if (!steps.length) return 8;
  const completed = steps.filter((step) => step.status === "completed").length;
  return Math.max(8, Math.round((completed / steps.length) * 100));
}

export function buildFailureAdvice(run: GithubRun | null) {
  if (!run || run.conclusion !== "failure") return null;
  return {
    title: "لم يكتمل البناء",
    detail: "افتح سجل GitHub الكامل لتحديد الخطوة المتوقفة. الأسباب الأكثر شيوعًا هي غياب ملفات الاعتماد، أو تعارض Gradle/Java، أو إعداد Release مخصص داخل المشروع.",
  };
}
