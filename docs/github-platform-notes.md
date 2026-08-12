# ملاحظات منصة GitHub

هذه الملاحظات توثق القيود التي أثرت في تصميم النسخة القابلة للنشر من GitHub Pages.

| الموضوع | الخلاصة العملية | المرجع |
|---|---|---|
| GitHub Pages | يستضيف صفحات ثابتة؛ لا يوفر خادمًا لحماية أسرار OAuth أو معالجة رفع الملفات على الخادم. | [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) |
| OAuth من SPA | لا يدعم مسار OAuth التقليدي لـGitHub تبادل رمز الوصول من واجهة متصفح مستقلة عبر CORS؛ لذلك تستخدم هذه النسخة رمز وصول محدودًا للجلسة بدل ادعاء زر OAuth عامل. | [GitHub Community discussion](https://github.com/orgs/community/discussions/40077) |
| مخرجات Actions | يمكن حفظ ملفات البناء واسترجاعها بصيغة Artifacts من GitHub Actions. | [Store and share data](https://docs.github.com/en/actions/tutorials/store-and-share-data) |
| حجم الملفات | يدعم GitHub REST إنشاء/تحديث محتوى ملف حتى 100 ميغابايت، فيما يظل الحد الأقصى للملف داخل مستودع GitHub 100 ميغابايت. | [Repository contents API](https://docs.github.com/en/rest/repos/contents) و[About large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github) |
