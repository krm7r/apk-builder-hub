import type { GithubRun, GithubStep } from "@/lib/github";

export function buildProgress(run: GithubRun | null, steps: GithubStep[]) {
  if (!run) return 0;
  if (run.status === "completed") return 100;
  if (!steps.length) return 8;
  const completed = steps.filter((step) => step.status === "completed").length;
  return Math.max(8, Math.round((completed / steps.length) * 100));
}

export function buildFailureAdvice(run: GithubRun | null, rawLogs = "") {
  if (!run || run.conclusion !== "failure") return null;

  const missingFile = rawLogs.match(/ENOENT: no such file or directory, open ['"]([^'"]+)['"]/i);
  if (missingFile?.[1]) {
    return {
      title: "ملف مطلوب في إعداد Expo غير موجود",
      detail: `يشير إعداد المشروع إلى ${missingFile[1]}، لكنه غير موجود داخل ZIP. أضف الملف إلى المسار نفسه أو حدّث قيمة icon / adaptiveIcon في app.json أو app.config.*، ثم ارفع الأرشيف من جديد.`,
    };
  }

  if (/gradlew:\s*permission denied/i.test(rawLogs)) {
    return {
      title: "ملف Gradle غير قابل للتنفيذ",
      detail: "فقد ملف gradlew صلاحية التنفيذ داخل الأرشيف. أعدنا تفعيلها تلقائيًا في Workflow؛ شغّل البناء من جديد. إن ظل الخطأ ظاهرًا، نفّذ chmod +x android/gradlew قبل ضغط مشروعك.",
    };
  }

  return {
    title: "لم يكتمل البناء",
    detail: "افتح سجل GitHub الكامل لتحديد الخطوة المتوقفة. الأسباب الأكثر شيوعًا هي غياب ملفات الاعتماد، أو تعارض Gradle/Java، أو إعداد Release مخصص داخل المشروع.",
  };
}
