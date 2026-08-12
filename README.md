# APK Builder Hub

واجهة ويب ثابتة عربية لاكتشاف مشاريع **React Native / Expo** و**Flutter** و**Android Native** ثم إرسال طلب بناء APK إلى GitHub Actions في مستودع عام.

## طريقة العمل

تقرأ الصفحة ملف ZIP أو المجلد محليًا وتحدد نوع المشروع من ملفاته البنائية. بعد إدخال **Fine-grained Personal Access Token** محدود للمستودع، تُحمِّل المصدر وتكتب ملف Workflow وتشغّله. يعرض الموقع خطوات التنفيذ، ثم يستخرج ملف APK من مخرج GitHub Actions لتنزيله.

> لا تحفظ الصفحة رمز الوصول في قاعدة بيانات أو `localStorage`. يبقى في `sessionStorage` الخاص بعلامة التبويب الحالية، ولا يُرسل من التطبيق إلا إلى `api.github.com` وGitHub عند تنزيل مخرج البناء.

## إعداد رمز GitHub

أنشئ Fine-grained personal access token يقتصر على المستودع العام المراد البناء داخله، ثم امنحه الصلاحيات التالية:

| Repository permission | المستوى المطلوب | السبب |
|---|---:|---|
| Contents | Read and write | رفع أرشيف المصدر وملف Workflow. |
| Actions | Read and write | تشغيل Workflow وقراءة حالة التنفيذ ومخرجاته. |

## النشر المجاني عبر GitHub Pages

1. ارفع هذا المستودع إلى حسابك ثم افتح **Settings → Pages**.
2. اختر **GitHub Actions** كمصدر للنشر.
3. ادفع التغييرات إلى فرع `main`. ينفذ Workflow باسم `Publish GitHub Pages` ويعرض رابط الموقع في صفحة التنفيذ.

## ملاحظات البناء

ملف `.github/workflows/build-apk.yml` يتلقى نوع المشروع ومسار ZIP. يبني إصدار Release ثم يحتفظ بالـAPK كـArtifact لمدة سبعة أيام. يجب أن يحتوي المشروع المصدر على إعدادات بناء صالحة ومفاتيح توقيع Release المناسبة إذا كان يحتاج توقيعًا مخصصًا.

لا تضف كلمات مرور أو ملفات مفاتيح حساسة إلى المستودع العام. استخدم GitHub Actions secrets لإعدادات التوقيع الخاصة بمشروعك عند الحاجة.
