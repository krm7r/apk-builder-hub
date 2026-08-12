export type ProjectKind = "expo" | "react-native" | "flutter" | "android-native";

export type DetectionResult = {
  kind: ProjectKind | null;
  label: string;
  detail: string;
  markers: string[];
};

const labels: Record<ProjectKind, string> = {
  expo: "Expo",
  "react-native": "React Native",
  flutter: "Flutter",
  "android-native": "Android Native",
};

export function detectProjectFromNames(fileNames: string[]): DetectionResult {
  const names = fileNames.map((name) => name.toLowerCase().replace(/^\/+/, ""));
  const has = (needle: string) => names.some((name) => name === needle || name.endsWith(`/${needle}`));
  const hasContaining = (needle: string) => names.some((name) => name.includes(needle));

  if (has("pubspec.yaml")) {
    return {
      kind: "flutter",
      label: labels.flutter,
      detail: "تم العثور على ملف pubspec.yaml الخاص بمشاريع Flutter.",
      markers: ["pubspec.yaml"],
    };
  }

  if (has("app.json") || has("app.config.js") || has("app.config.ts")) {
    return {
      kind: "expo",
      label: labels.expo,
      detail: "تم العثور على ملف إعداد Expo.",
      markers: ["app.json أو app.config.*"],
    };
  }

  if (
    hasContaining("react-native") ||
    (has("package.json") && (has("android/build.gradle") || has("android/build.gradle.kts")))
  ) {
    return {
      kind: "react-native",
      label: labels["react-native"],
      detail: "تم العثور على بنية Android مرتبطة بمشروع JavaScript/TypeScript.",
      markers: ["package.json", "android/build.gradle"],
    };
  }

  if (has("settings.gradle") || has("settings.gradle.kts") || has("build.gradle") || has("build.gradle.kts")) {
    return {
      kind: "android-native",
      label: labels["android-native"],
      detail: "تم العثور على ملفات Gradle الخاصة بمشروع Android Native.",
      markers: ["settings.gradle أو build.gradle"],
    };
  }

  return {
    kind: null,
    label: "لم يُكشف النوع",
    detail: "لم نجد علامة تعريف مدعومة. تأكد من أن المجلد الجذر للمشروع أو ملف ZIP يحتوي ملفات الإعداد الأساسية.",
    markers: [],
  };
}

export function projectLabel(kind: ProjectKind) {
  return labels[kind];
}
