# مراجعة المشروع والأمان — 7 نوفمبر 2026

> التقرير ده خط أساس قبل الإصلاح. تم تنفيذ إصلاحات R01–R15 لاحقًا بعد الموافقة؛ راجع `SECURITY-FIXES.md` للنتائج والاختبارات، و`PASSWORD-RECOVERY.md` لاستعادة كلمة المرور. إعدادات الجلسات والبنية التحتية المذكورة كملاحظات مش معناها إنها اتغيرت تلقائيًا.

المراجعة دي للكود الموجود في الـ workspace، وليست شهادة إن التطبيق خالي من الثغرات. لم أعدّل كود التطبيق أو dependencies أو إعدادات البيئة، ولم أنفذ migrations أو اختبارات على بيانات Neon الحقيقية. الملفات الجديدة فقط هي التقرير ده ونتيجة `npm audit` في `SECURITY-AUDIT.dependencies.json`.

شملت المراجعة الموديولات والراوترات والـ validation والـ middleware والـ utilities، وملفات قاعدة البيانات والـ schema والـ migrations، والـ manifest والـ lock والتوثيق وCollection Postman. استبعدت قراءة node_modules بالكامل؛ فحصت الإصدارات المثبتة وبعض ملفات المكتبات المرتبطة بالملاحظات. إعدادات `.env` اتفحصت كخصائص فقط بدون عرض أو نسخ أسرارها. قائمة ملفات النطاق موجودة في آخر التقرير، وعدم وجود finding بجوار ملف لا يعني ضمان أمانه.

## المشاكل مرتبة بالأولوية

### R01 — عالية: إصدار Multer المستخدم عليه تحذيرات تعطيل خدمة

المكان: `package.json` و`package-lock.json`، و`src/utils/multer-cloud.js:20` و`:41`، و`src/modules/teacher/teacher.router.js:34`.

الإصدار المثبت `2.1.1`. فحص npm رجّع advisories مرتبطة بمعالجة multipart، ومنها GHSA-wc9g-mqfw-jrwm. مسار تسجيل المدرس العام بيشغّل Multer قبل أي authentication، فالمكوّن قابل للوصول من مستخدم غير مسجل. نشرة المشرفين بتوضح إن طلب multipart مصمم بشكل معين ممكن يخرج باستثناء غير ممسوك ويوقف عملية Node. لم أنفذ الطلب التخريبي على السيرفر.

المقترح: تحديث مخطط ومختبر للمكتبة والـ lock بعد الموافقة؛ ما نعتمدش على error handler وحده. `2.3.0` بيعالج النشرة المذكورة تحديدًا، لكنه مش ضمان إنه بيعالج كل advisories الموجودة في نتيجة audit الحالية. [نشرة Multer الرسمية](https://github.com/expressjs/multer/security/advisories/GHSA-wc9g-mqfw-jrwm).

### R02 — عالية: body-parser المستخدم تحت Express عليه مسار DoS قابل للوصول

المكان: `src/bootStrap.js:30`، `package-lock.json`.

الإصدار المثبت `body-parser 2.2.2`، والتطبيق بيستخدم `express.json()` بإعداداته الافتراضية قبل الراوترات. النشرة GHSA-27r3-jxmh-p828 بتصف توقف العملية عند معالجة جسم مضغوط معيّن؛ النشرة تشمل الإصدار المثبت والإعداد المستخدم. مفيش authentication مطلوب للوصول للـ parser. لم أجرّب crash payload.

المقترح: تحديث dependency المتأثرة ضمن خطة تحديث Express والـ lock، أو دراسة تعطيل استقبال الأجسام المضغوطة لو مش مطلوبة. `2.4.0` هو الإصدار المصحح لهذه النشرة تحديدًا. [نشرة body-parser الرسمية](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828).

### R03 — عالية: رفع الملفات بدون حدود حجم أو عدد fields إجمالي

المكان: `src/utils/multer-cloud.js:20` و`:41`، ومسارات رفع الصور في `teacher.router.js` ورفع الدروس في `lesson.router.js`.

إعداد Multer مفيهوش `limits.fileSize` أو حدود `fields`/`parts`. الحد الموجود لعدد فيديوهات ومرفقات الدرس لا يحد حجم الملف أو عدد text fields. الرفع بيكتب على القرص المؤقت، ومسار signup عام. الطلبات الكبيرة أو المتكررة ممكن تستهلك القرص والاتصالات وتكلفة المعالجة. اتفحص غياب limits محليًا؛ لم أعمل stress test.

المقترح: حدود صريحة مناسبة لكل نوع ملف، وعدد fields/parts، وحدود عند الـ proxy، مع معالجة أخطاء تجاوز الحجم.

### R04 — عالية: الملفات المؤقتة بتفضل على القرص في طلبات مرفوضة

المكان: `src/modules/teacher/teacher.router.js:36` قبل `isValid`، `src/modules/lesson/lesson.router.js`، وearly returns في controllers.

Multer بيحفظ الملف قبل Joi وقبل بعض فحوص الملكية ووجود الحساب. تنظيف الملفات موجود بعد دخول مسار upload، لكن لو الطلب اترفض قبل المسار ده الملف ما بيتحذفش. اتأكدت باختبار HTTP محلي: ملف صغير بامتداد صورة مع بيانات signup ناقصة رجّع 400 والملف فضل موجود. ملف الاختبار المؤقت اتنضف بعد التحقق. الـ MIME كمان بيتاخد من تصريح العميل؛ ده لوحده مش إثبات RCE لأن Cloudinary ممكن يرفض المحتوى لاحقًا.

المقترح: تنظيف مضمون لكل ملفات الطلب عند فشل validation أو business checks أو أي خطأ بعد Multer. لازم يشمل المسارات العامة والمحمية، مع تنظيف الملفات السحابية لو رفعها نجح وفشلت معاملة قاعدة البيانات.

### R05 — عالية عند غياب حماية خارجية: محاولات الدخول والتسجيل غير محدودة داخل التطبيق

المكان: `src/modules/auth/auth.router.js:39`، `auth.controller.js:88`، و`teacher.router.js:34`، و`src/bootStrap.js`.

مفيش rate limiting أو تأخير تصاعدي أو قفل مؤقت في مسار login، ولا حماية مماثلة للتسجيل. محاولات التخمين وتوليد حسابات كتير متاحة على مستوى الكود، وكل محاولة لحساب موجود بتستهلك bcrypt. لم أفحص WAF أو reverse proxy؛ ممكن يكون عندك حماية خارجية مش ظاهرة هنا.

المقترح: سياسة واضحة للمحاولات حسب الحساب ومصدر الطلب، وحدود للتسجيل والرفع، مع مراعاة إعدادات الـ proxy قبل الاعتماد على IP.

### R06 — عالية: حماية آخر سوبر أدمن لا تصمد أمام التزامن

المكان: `src/modules/user/user.controller.js:145` و`:163`.

عدد السوبر أدمن النشطين بيتحسب قبل الـ transaction. لو فيه اتنين، طلبان متزامنان ممكن كل واحد فيهم يقرأ العدد 2 ثم يوقف حساب مختلف، والنتيجة صفر سوبر أدمن نشط. شروط update الحالية بتحمي تحديث نفس الحساب، لكنها مش بتحمي شرط العدد العام. أثبتت محاكاة للكود الحالي النتيجة دي؛ لم أوقف أي حساب حقيقي.

المقترح: وضع فحص الشرط والتعديل تحت ضمان تزامن واحد، مثل transaction مناسبة مع lock/Serializable ومعالجة التعارضات، واختبار الحالة على PostgreSQL.

### R07 — متوسطة: قبول كلمات مرور أطول من حد bcrypt الفعلي

المكان: `src/utils/generalFields.js:14`، `src/modules/auth/auth.controller.js:48` و`:88`، ومسارات إنشاء المدرس والأدمن والـ seed.

الـ validation مفيهوش حد بالبايت، وbcrypt بيستخدم أول 72 بايت. اتأكدت محليًا إن كلمتين مختلفتين، الاثنين مقبولين بالـ validation وبيشتركوا في أول 72 بايت، ينجحوا مع نفس الـ hash. ده لا يعني كسر كل كلمات المرور، لكنه معناه إن الجزء بعد الحد مش بيزود حماية وقد لا يطابق توقع المستخدم، خصوصًا مع Unicode.

المقترح: سياسة صريحة للحد بالبايت عند إنشاء الحساب؛ لازم نراعي الحسابات الموجودة قبل تغيير validation الـ login عشان ما نقفلهاش بالخطأ. لا تغيّر خوارزمية التخزين أو تعمل pre-hash صامت.

### R08 — متوسطة: تعديلان متزامنان لمرفقات درس يضيّعوا تحديثًا ناجحًا

المكان: `src/modules/lesson/lesson.controller.js:153` و`:164`.

المرفقات الجديدة بتتركب على نسخة الدرس المقروءة قبل upload وقبل transaction. لو طلبان قرأوا نفس النسخة ورفع كل واحد ملفًا، آخر كتابة تستبدل قائمة الأول، رغم إن الطلبين ممكن ينجحوا. اتأكدت بالمحاكاة إن ملفًا واحدًا فقط فضل في القائمة بعد طلبين ناجحين. الملف المستبعد ممكن يفضل على Cloudinary بلا مرجع.

المقترح: قراءة ودمج القائمة تحت ضمان تزامن مناسب، أو optimistic concurrency، مع الحفاظ على cleanup للرفع الفاشل.

### R09 — متوسطة: مهمة حذف الفيديو القديم ممكن تمسح مرجع فيديو جديد

المكان: `src/modules/lesson/lesson.utils.js:94` و`:105`.

المهمة بتقرأ فيديو منتهي، وتحذفه من Cloudinary، وبعدها تصفر حقل `video` باستخدام id الدرس فقط. لو المدرس استبدل الفيديو ومدّ الموعد أثناء العملية، التحديث الأخير يصفّر مرجع الفيديو الجديد. اتأكدت من التسلسل بالمحاكاة.

المقترح: التحديث النهائي يبقى مشروطًا بنفس نسخة الفيديو وشرط انتهاء الصلاحية اللي اتقرت، مع تنسيق مسار الاستبدال والحذف. مش مجرد زيادة timeout.

### R10 — متوسطة: رابط الميديا ممكن يفضل صالحًا بعد انتهاء نافذة الدرس

المكان: `src/modules/lesson/lesson-access.controller.js:14`، ومدة session في `learning.controller.js`.

انتهاء الرابط بيتحدد بمدة الميديا و`session.expiresAt`، لكنه مش بيتقيد بـ `lesson.availableUntil`. في محاكاة درس فاضله 10 ثواني وجلسة فاضلها 120 ثانية، صلاحية الرابط تجاوزت انتهاء الدرس بـ110 ثواني. فحص heartbeat بعد انتهاء الدرس مش بيبطل رابط تم إصداره بالفعل.

المقترح: تقييد صلاحية الرابط بأقرب موعد صالح يشمل نهاية الدرس. ده تجاوز زمني محدود بصلاحية الرابط، مش فتح دائم للمحتوى ولا دليل على تخطي الشراء.

### R11 — متوسطة: بعض الفشل بعد commit بيرجع خطأ رغم حفظ التغيير

المكان: `src/modules/lesson/lesson.controller.js:184` و`:191`، و`src/modules/teacher/teacher.controller.js:99` و`:131` و`:192` و`:292`.

تعديل الدرس بيعمل commit، ثم يعدل اسم المنتج ويحذف الفيديو السابق خارج transaction. لو خطوة لاحقة فشلت، العميل ممكن ياخد 500 رغم إن الدرس اتعدل؛ اسم المنتج ممكن يفضل قديم. في مسارات المدرس، مزامنة الكورسات بعد commit ممكن تفشل بعد حفظ الحساب/التخصصات، والصورة المرفوعة قبل المعاملة ممكن تفضل بلا مرجع لو المعاملة فشلت.

المقترح: جمع تغييرات قاعدة البيانات المرتبطة في transaction واحدة حيث ينفع، وتعويض أو retry واضح لعمليات Cloudinary. لازم نفرق بين فشل الحفظ وفشل التنظيف بعده.

### R12 — متوسطة: بعض validators تسمح بقيم قاعدة البيانات لا تقبلها

المكان: `src/utils/generalFields.js:8` و`:10` و`:11`، `src/modules/lesson/lesson.validation.js:7`، `product.validation.js` و`academic.validation.js`، وحدود الأعمدة في `prisma/schema.prisma`.

اسم حساب بطول 256 حرفًا بيعدي Joi رغم إن العمود VARCHAR(255)، ونفس الفكرة في phone وبعض أسماء الكتالوج/المنتجات. قواعد price وannouncedLessonCount لا تقيد PostgreSQL Int من فوق. كمان regex التاريخ تقبل تاريخًا زي `2026-99-99T12:00:00Z`، ومقارنة `Invalid Date` لا ترفضه. اتأكدت محليًا من قبول الاسم والتاريخ غير الصالح؛ النتيجة المتوقعة بعد الوصول لـPrisma خطأ بدل رفض واضح 400.

المقترح: مطابقة حدود وأنواع Joi مع الأعمدة، والتحقق من تاريخ حقيقي قبل المقارنة والتحويل، بما في ذلك صحة اليوم بالنسبة للشهر.

### R13 — منخفضة: error handler بيحوّل أخطاء عميل معروفة إلى 500

المكان: `src/utils/appError.js:14`، `src/middleware/asyncHandler.js`، `src/modules/question/question.controller.js:113`.

غير AppError، الـ handler بيحافظ فقط على status 400. اختبار HTTP محلي لجسم JSON أكبر من الحد رجّع 500 بدل 413. أخطاء Multer المعروفة كمان مش متترجمة لرسالة/status مناسبة. حذف سؤال مستخدم في assessment بيصطدم بـFK Restrict، لكن P2003 مش متعالج، فيظهر كخطأ داخلي بدل conflict مفهوم. عدم السماح بالحذف هنا حماية بيانات؛ المشكلة في دلالة الرد، مش في وجود الـFK.

المقترح: mapping محدد للأخطاء المعروفة والآمنة، مع الحفاظ على إخفاء تفاصيل الأخطاء الداخلية، من غير تمرير أي err.status عشوائي.

### R14 — متوسطة: SSE والتوزيع ممكن يضاعفوا ضغط قاعدة البيانات بدون سقف

المكان: `src/modules/notification/notification.controller.js:26` و`:56`، و`notification.utils.js:22` و`:43`، وعمليات نشر المحتوى التي تستدعي fanout داخل transaction.

كل اتصال SSE مستقل بيعيد فحص التوكن والمستخدم والجهاز ثم يجري list وcount وunread count كل 3 ثواني تقريبًا. مفيش سقف اتصالات لكل مستخدم. بالتالي حساب واحد يقدر يفتح اتصالات كتير ويستهلك موارد DB. التوزيع بيجمع المستلمين كلهم في الذاكرة، والـbatching بيجزّأ inserts فقط؛ لا يقسم transaction كلها. درس مجاني يعلن لكل الطلبة ممكن يطول transaction ويعطل نشر الدرس عند كبر العدد. لم أنفذ load test؛ حجم المشكلة الفعلي محتاج قياس.

المقترح: حدود اتصالات ومعدل طلبات، ثم قياس حمل فعلي قبل اختيار تجميع polling أو إشارات مشتركة أو معالجة fanout على دفعات بآلية موثوقة. راجع maxWait وtimeout للعمليات الكبيرة؛ تغيير المعمارية محتاج موافقة.

### R15 — متوسطة: خطأ ثابت في محاولة واحدة ممكن يعطل بقية التسليمات التلقائية

المكان: `src/modules/attempt/attempt.utils.js:146` و`:153`.

الحلقة بتتجاوز بعض تعارضات التزامن فقط؛ أي خطأ آخر بيرجع من المهمة كلها. لو أول محاولة في الدفعة عندها خطأ بيانات ثابت، بقية المحاولات لا تعالج، وفي الدورة التالية ممكن تتكرر نفس البداية. المحاكاة أكدت إن المحاولة الثانية لم يتم الوصول لها بعد خطأ الأولى. فشل معاملة إغلاق التقييمات قبل الحلقة كمان بيوقف الدورة كلها، بما فيها الإشعارات المرتبطة.

المقترح: معالجة فشل كل عنصر بشكل واضح مع تسجيل id ومتابعة باقي الدفعة، وretry/backoff مناسب، من غير إخفاء الأخطاء أو اعتماد إعادة محاولة غير محدودة لنفس العنصر.

## مخاطر وملاحظات محتاجة قرار أو تحقق من بيئة النشر

- **C01 — JWT:** إعداد البيئة الحالي يسمح بتوكن بدون انتهاء، والمفتاح أقل من 32 بايت. الكود يرفض المفتاح الغائب فقط. الطول وحده لا يثبت ضعف entropy أو إمكانية تخمين المفتاح، لكن المفتاح القوي العشوائي ومدة جلسة محددة محتاجين قرار قبل الإنتاج. logout وsessionVersion وإيقاف الحساب بيبطلوا التوكنات بالفعل. لم أنسخ قيمة المفتاح ولم أحاول تخمينه. لو هيتغيّر المفتاح، ده هيخرج الجلسات الحالية ويحتاج تنسيق.
- **C02 — هوية الجهاز:** `src/modules/user/device.utils.js:5` بيشتق الهوية من IP وUser-Agent. جهازان وراء نفس NAT وبنفس UA ممكن يتعاملوا كجهاز واحد، وتغيير الشبكة ممكن يتعامل كجهاز جديد. خلف reverse proxy، من غير trust proxy مضبوط، عناوين كل المستخدمين ممكن تبقى عنوان الـproxy. دي مش هوية جهاز موثوقة، وليست إثباتًا إن JWT مكسور. لو القاعدة المقصودة منع أجهزة فعلية متعددة، محتاجة تصميم أوضح.
- **C03 — باقي نتيجة npm audit:** فيه 24 حزمة متأثرة إجمالًا: 1 Critical و21 High و2 Moderate. دي أعداد حزم، مش 24 ثغرة مستقلة مثبتة في endpoints. مثلًا `proxy-addr 2.0.7` عنده Critical متعلق بإعداد trust subnet معين؛ لم أجد هذا الإعداد في التطبيق، فلا أعتبره exploit مثبت هنا. بعض مشاكل Joi تحتاج features غير مستخدمة، وAxios/Mongoose/Puppeteer مش ظاهر لهم استخدام في المسارات الحالية، وOTP/Nodemailer مش موصلين بمسار مستخدم حاليًا. لازم نحدد reachability قبل ترتيب تحديثاتهم. [نشرة proxy-addr الرسمية](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h). التفاصيل والنطاقات لكل حزمة محفوظة في ملف audit.
- **C04 — الاختبارات:** `package.json` فيه npm test شكلي بيرجع فشل، ومفيش suite دائمة تغطي الصلاحيات والتزامن والدفع. اختبارات المحاكاة مفيدة لكنها لا تثبت locking أو rollback على PostgreSQL. محتاجين suite قابلة للإعادة على قاعدة معزولة قبل الإنتاج.
- **C05 — نقاط تشغيلية:** CLIENT_ORIGIN حاليًا مفتوح، وBOOTSTRAP_SUPER_ADMIN مفعّل؛ الـseed لسه يحتاج تشغيل صريح وبيمنع إنشاء سوبر أدمن آخر لما يكون موجود. راجع الإعدادين عند النشر. CORS المفتوح وحده مش bypass للتوكن. TLS termination، headers الأمنية، WAF، حدود الـproxy، صلاحيات مستخدم PostgreSQL والنسخ الاحتياطية لم يمكن التحقق منها من هذا المشروع.
- **C06 — نصوص عامة:** comments وتعليمات الدفع والـbio محفوظة كنصوص. لم أجد frontend هنا لتقييم طريقة عرضها؛ لا أعتبرها XSS مثبتة من استجابة JSON وحدها. يلزم عرض النصوص بترميز مناسب في الفرونت وعدم إدراجها كـHTML غير موثوق.

## نقاط اتحققت منها ولم أسجلها كثغرة

- صلاحيات الإنشاء الإداري والتقييم والتعديل على settings محددة في الراوترات، وفحص ملكية الإشعارات موجود.
- الطالب لا يختار studentId في التقييم؛ يلزم order approved لنفس المدرس، وDB تمنع تكرار التقييم لكل طالب ومدرس.
- بيانات كلمات المرور والجلسات مستبعدة من الردود العامة للحسابات؛ public teacher profile الحالي يستخدم select محدد ولا يعرض العمولة.
- مسار مراجعة الطلب يستخدم conditional updates، ومعاملة تجمع الدفع والصلاحية والقيد المالي. الـmigration فيها partial unique index يمنع الطلبات المتزامنة غير المرفوضة لنفس الطالب والمنتج؛ لذلك لم أسجل تكرار الطلبات كثغرة.
- الـledger فيه trigger يمنع UPDATE/DELETE/TRUNCATE وقيود amounts وidempotency، والصرف يستخدم Serializable. SQL التقارير يمرر القيم كـparameters وأسماء الأعمدة من allowlist؛ لم أجد SQL injection في المسارات المقروءة.
- مفاتيح settings المسموحة محددة، والعمولة تفضل في مصدرها الحالي. ما فيش API لكتابة secrets أو أسماء environment variables عشوائية.
- إجابات assessments الصحيحة مستبعدة من صيغة ردود الطالب، والأسئلة snapshot مستقلة عن تعديل بنك الأسئلة. صلاحيات المدرس مقيدة بملكيته.
- ملفات db/models الحالية مجرد re-exports متوافقة مع Prisma، وليست موديلات Mongoose ثانية. وجود mongoose dependency لا يعني إنها قاعدة البيانات المستخدمة.
- Collection Postman الموجودة لا تحتوي قيم passwords أو tokens محفوظة وقت الفحص. `.gitignore` يستبعد config، لكن لا يوجد Git repository متاح للتحقق من أي تسريب تاريخي.

## الفحوصات اللي اتنفذت فعلًا

1. `node --check` نجح لكل 108 ملف JavaScript ضمن src وdb وملفات التشغيل/config الأساسية.
2. `prisma validate` نجح. لم أشغّل migrate deploy أو db push أو أغيّر schema أثناء المراجعة.
3. `npm.cmd audit --json` اكتمل ورجع exit code 1 بسبب advisories؛ النتيجة محفوظة كما هي. `package.json` والـlock متطابقان في dependencies المباشرة وقت الفحص. لم أشغّل audit fix أو install.
4. اختبار bcrypt حقيقي محلي لكلمتين تشتركان في أول 72 بايت أثبت قبول الاثنين لنفس hash.
5. اختبارات Joi محلية أثبتت قبول اسم أطول من العمود وتاريخ غير صالح.
6. اختبار HTTP محلي أثبت ترك ملف upload بعد رفض validation، وتحويل 413 إلى 500. تم حذف ملف fixture المؤقت المعروف فقط بعد الاختبار.
7. محاكاة functions الفعلية مع mocked DB/Cloudinary أثبتت تزامن إيقاف آخر سوبر أدمن، وضياع مرفق، وتصفير مرجع فيديو جديد، وتعطّل بقية دفعة attempts بعد خطأ الأول.
8. محاكاة إصدار رابط ميديا أثبتت عدم تقييد expires_at بنهاية الدرس.
9. راجعت نشرات المكتبات الأساسية من repositories الرسمية. لم أشغّل payloads توقف السيرفر، أو brute force، أو stress test، ولم أكتب بيانات حقيقية على Neon أو Cloudinary.

## ترتيب الإصلاح المقترح — لم يطبق

ابدأ بـR01–R05: الـdependencies القابلة للوصول، حدود الرفع وتنظيفه وحماية محاولات الدخول. بعدها R06 وحالات تزامن الدروس R08–R09. ثم كلمات المرور، انتهاء الميديا، اتساق العمليات، الـvalidation والأخطاء. وقبل زيادة المستخدمين عالج حدود SSE وعزل أخطاء الـworkers، وأضف اختبارات PostgreSQL للتزامن. أي تحديث dependencies أو تغيير سياسة جلسات أو API أو قاعدة بيانات محتاج موافقتك، والمراجعة دي لم تنفذ أي إصلاح.

## قائمة الملفات داخل نطاق المراجعة

القائمة التالية جرد للملفات التي شملها الفحص، وليست قائمة ملفات مضمونة الأمان. الأرقام R/C تشير للملاحظات المرتبطة؛ الملفات بدون رقم مذكور لم أسجل عليها finding منفصل.

| ????? | ????????? ???????? |
| --- | --- |
| `.gitignore` | ?? ???? ?????? ?????? ????? |
| `AGENTS.md` | ?? ???? ?????? ?????? ????? |
| `NOTIFICATIONS.md` | ?? ???? ?????? ?????? ????? |
| `Noldg-Notifications.postman_collection.json` | ?? ???? ?????? ?????? ????? |
| `RATINGS.md` | ?? ???? ?????? ?????? ????? |
| `SETTINGS.md` | ?? ???? ?????? ?????? ????? |
| `db/connection.js` | ?? ???? ?????? ?????? ????? |
| `db/index.js` | ?? ???? ?????? ?????? ????? |
| `db/models/auth.model.js` | ?? ???? ?????? ?????? ????? |
| `db/models/course.model.js` | ?? ???? ?????? ?????? ????? |
| `db/models/device.model.js` | ?? ???? ?????? ?????? ????? |
| `db/models/lesson.model.js` | ?? ???? ?????? ?????? ????? |
| `db/models/platform-settings.model.js` | ?? ???? ?????? ?????? ????? |
| `db/models/product-access.model.js` | ?? ???? ?????? ?????? ????? |
| `db/models/product.model.js` | ?? ???? ?????? ?????? ????? |
| `db/models/study-track.model.js` | ?? ???? ?????? ?????? ????? |
| `db/models/subject.model.js` | ?? ???? ?????? ?????? ????? |
| `db/models/teacher-profile.model.js` | ?? ???? ?????? ?????? ????? |
| `db/models/track-subject.model.js` | ?? ???? ?????? ?????? ????? |
| `db/models/user.model.js` | ?? ???? ?????? ?????? ????? |
| `db/prisma.js` | ?? ???? ?????? ?????? ????? |
| `db/seedSuperAdmin.js` | R07, C05 |
| `index.js` | ?? ???? ?????? ?????? ????? |
| `package-lock.json` | R01, R02, C03 |
| `package.json` | R01, R02, C03, C04 |
| `prisma.config.js` | ?? ???? ?????? ?????? ????? |
| `prisma/migrations/20261104000000_init/migration.sql` | ?? ???? ?????? ?????? ????? |
| `prisma/migrations/20261105000000_orders_manual_payments/migration.sql` | ?? ???? ?????? ?????? ????? |
| `prisma/migrations/20261105010000_entitlements/migration.sql` | ?? ???? ?????? ?????? ????? |
| `prisma/migrations/20261105020000_append_only_ledger/migration.sql` | ?? ???? ?????? ?????? ????? |
| `prisma/migrations/20261105030000_learning/migration.sql` | ?? ???? ?????? ?????? ????? |
| `prisma/migrations/20261105040000_questions/migration.sql` | ?? ???? ?????? ?????? ????? |
| `prisma/migrations/20261106000000_assessments/migration.sql` | ?? ???? ?????? ?????? ????? |
| `prisma/migrations/20261106010000_notifications/migration.sql` | ?? ???? ?????? ?????? ????? |
| `prisma/migrations/20261106020000_teacher_ratings/migration.sql` | ?? ???? ?????? ?????? ????? |
| `prisma/migrations/20261106030000_public_settings/migration.sql` | ?? ???? ?????? ?????? ????? |
| `prisma/migrations/migration_lock.toml` | ?? ???? ?????? ?????? ????? |
| `prisma/schema.prisma` | R12; ?????? ???????? ??????? |
| `src/bootStrap.js` | R02, R05, C05 |
| `src/middleware/asyncHandler.js` | R13 |
| `src/middleware/authentication.js` | ?? ???? ?????? ?????? ????? |
| `src/middleware/autheraization.js` | ?? ???? ?????? ?????? ????? |
| `src/middleware/vaildation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/academic/academic.controller.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/academic/academic.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/academic/academic.validation.js` | R12 |
| `src/modules/assessment/assessment.controller.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/assessment/assessment.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/assessment/assessment.utils.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/assessment/assessment.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/attempt/attempt.controller.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/attempt/attempt.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/attempt/attempt.utils.js` | R15 |
| `src/modules/attempt/attempt.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/auth/auth.controller.js` | R05, R07, C01 |
| `src/modules/auth/auth.router.js` | R05 |
| `src/modules/auth/auth.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/course/course.controller.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/course/course.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/course/course.utils.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/course/course.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/entitlement/entitlement.controller.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/entitlement/entitlement.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/entitlement/entitlement.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/grading/grading.controller.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/grading/grading.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/grading/grading.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/index.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/learning/learning.controller.js` | R10 |
| `src/modules/learning/learning.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/learning/learning.utils.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/learning/learning.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/ledger/ledger.controller.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/ledger/ledger.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/ledger/ledger.utils.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/ledger/ledger.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/lesson/lesson-access.controller.js` | R10 |
| `src/modules/lesson/lesson-access.utils.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/lesson/lesson.controller.js` | R04, R08, R11, R14 |
| `src/modules/lesson/lesson.router.js` | R03, R04 |
| `src/modules/lesson/lesson.utils.js` | R09 |
| `src/modules/lesson/lesson.validation.js` | R12 |
| `src/modules/notification/notification.controller.js` | R14 |
| `src/modules/notification/notification.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/notification/notification.utils.js` | R14 |
| `src/modules/notification/notification.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/order-approval/order-approval.controller.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/order-approval/order-approval.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/order-approval/order-approval.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/order/order.controller.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/order/order.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/order/order.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/payment/payment.controller.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/payment/payment.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/payment/payment.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/product/product.controller.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/product/product.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/product/product.utils.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/product/product.validation.js` | R12 |
| `src/modules/question/question.controller.js` | R13 |
| `src/modules/question/question.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/question/question.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/rating/rating.controller.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/rating/rating.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/rating/rating.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/settings/settings.controller.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/settings/settings.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/settings/settings.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/teacher/teacher.controller.js` | R04, R07, R11 |
| `src/modules/teacher/teacher.router.js` | R01, R03, R04, R05 |
| `src/modules/teacher/teacher.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/user/device.utils.js` | C02 |
| `src/modules/user/user.controller.js` | R06, R07 |
| `src/modules/user/user.router.js` | ?? ???? ?????? ?????? ????? |
| `src/modules/user/user.validation.js` | ?? ???? ?????? ?????? ????? |
| `src/utils/OTP.js` | ?? ???? ?????? ?????? ????? |
| `src/utils/api-serializer.js` | ?? ???? ?????? ?????? ????? |
| `src/utils/apiFeatures.js` | ?? ???? ?????? ?????? ????? |
| `src/utils/appError.js` | R13 |
| `src/utils/cloud.js` | ?? ???? ?????? ?????? ????? |
| `src/utils/constant/enum.js` | ?? ???? ?????? ?????? ????? |
| `src/utils/constant/messages.js` | ?? ???? ?????? ?????? ????? |
| `src/utils/file-functions.js` | ?? ???? ?????? ?????? ????? |
| `src/utils/generalFields.js` | R07, R12 |
| `src/utils/multer-cloud.js` | R01, R03, R04 |
| `src/utils/multer.js` | ?? ???? ?????? ?????? ????? |
| `src/utils/sendEmail.js` | ?? ???? ?????? ?????? ????? |
| `src/utils/token.js` | C01 |

`config/.env`: ??? flags ?????? ?????? ???? ????? ?????? ?? ???? ?? ???????.

## ??? npm ???? ????? advisories

??? ????? ??? npm ??? ?????? ?????? ????????? ?? ??????? ????? ????? ??????? ?? ????. ???? JSON ??? via/range/fixAvailable.

| ?????? | ??????? ?? audit | dependency ?????? |
| --- | --- | --- |
| `@puppeteer/browsers` | high | ?? |
| `axios` | high | ??? |
| `basic-ftp` | high | ?? |
| `body-parser` | high | ?? |
| `chromium-bidi` | high | ?? |
| `extract-zip` | high | ?? |
| `follow-redirects` | high | ?? |
| `form-data` | high | ?? |
| `get-uri` | high | ?? |
| `ip-address` | high | ?? |
| `joi` | high | ??? |
| `js-yaml` | high | ?? |
| `mongoose` | moderate | ??? |
| `multer` | high | ??? |
| `nanoid` | high | ??? |
| `nodemailer` | high | ??? |
| `pac-proxy-agent` | high | ?? |
| `proxy-addr` | critical | ?? |
| `proxy-agent` | high | ?? |
| `puppeteer` | high | ??? |
| `puppeteer-core` | high | ??? |
| `qs` | moderate | ?? |
| `ws` | high | ?? |
| `zod` | high | ?? |
