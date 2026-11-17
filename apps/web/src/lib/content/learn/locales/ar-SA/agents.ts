import type { LearnCourse } from "../../types";

export const agentsCourse: LearnCourse = {
	slug: "phaseo-in-your-coding-agent",
	title: "استخدم Phaseo مع وكيل البرمجة",
	summary:
		"زوّد وكيل البرمجة بمهارات Phaseo وتوثيقها وأدواتها، ثم دعه يعلّمك Phaseo بينما يبني مشروعك.",
	level: "beginner",
	format: "بدون كود",
	prerequisites: ["ما هي Phaseo؟"],
	lessons: [
		{
			slug: "connect-your-agent",
			title: "اربط وكيلك",
			summary:
				"زوّد وكيلك بمهارات Phaseo وتوثيقها كي يكتب كودًا صحيحًا، وببيانات حية عبر MCP، وبنماذج Phaseo عبر CLI.",
			minutes: 8,
			body: `يمكن لوكلاء البرمجة مثل Claude Code وCodex وCursor العمل مع Phaseo بثلاث طرق منفصلة. اختر ما تحتاجه منها.

**1. علّمه Phaseo.** مهارات الوكلاء تعليمات تساعد وكيلك على كتابة كود Phaseo صحيح. وتغطي Gateway وحزم SDK والإعدادات المسبقة والتوجيه وعمليات الترحيل. ثبّتها بالأمر:

\`\`\`bash
npx skills add https://phaseo.app/docs
\`\`\`

ولتسمح له بقراءة التوثيق الحالي أثناء الجلسة، أضف خادم Docs MCP، \`https://phaseo.app/docs/mcp\`. فهو يقرأ التوثيق فقط ولا يلمس حسابك أبدًا.

**2. زوّده ببيانات Phaseo الحية.** يتيح خادم Phaseo MCP، \`https://mcp.phaseo.app/mcp\`، للوكيل البحث عن النماذج والأسعار والمزوّدين ورصيدك واستخدامك وسجلات طلباتك. وهو للقراءة فقط، ولا يعيد أبدًا الموجّهات أو الاستجابات أو القيم السرية. تسجّل الدخول عبر Phaseo في متصفحك. في Claude Code:

\`\`\`bash
claude mcp add --transport http phaseo https://mcp.phaseo.app/mcp
\`\`\`

ثم شغّل \`/mcp\`، واختر \`phaseo\` ثم **Authenticate**. وإذا أردت أن يدير الوكيل مفاتيح API وإعدادات مساحة العمل أيضًا، فاتصل عبر \`https://mcp.phaseo.app/mcp?access=manage\` وألغِ تحديد أي صلاحية لا تريدها.

**3. شغّل الوكيل على نماذج Phaseo.** ثبّت Phaseo CLI بالأمر \`npm install -g @phaseo/cli\`، وشغّل \`phaseo login\`، ثم الأمر الخاص بوكيلك، مثل \`phaseo claude-code\` أو \`phaseo codex\`. يوجّه CLI الوكيل إلى Phaseo وينشئ له مفتاح API خاصًا به بحد إنفاق شهري قدره 100 دولار وصلاحية 90 يومًا. توافق على المفتاح في متصفحك، ويمكنك تغيير حده من **الإعدادات ← مفاتيح API**.

في Claude Code أو Codex، تثبّت إضافة Phaseo خادمَي MCP والمهارات دفعة واحدة.`,
			quiz: {
				question:
					"تربط وكيلك بـ https://mcp.phaseo.app/mcp دون ?access=manage. ماذا يستطيع أن يفعل؟",
				options: [
					"قراءة بيانات Phaseo الحية مثل النماذج والأسعار والرصيد وسجلات الطلبات.",
					"إنشاء مفاتيح API وشراء رصيد لمساحة عملك.",
					"قراءة الموجّهات والاستجابات المخزّنة في سجلات طلباتك.",
				],
				answer: 0,
				explanation:
					"العنوان العادي للقراءة فقط. التغييرات تحتاج إلى عنوان الإدارة، وحتى حينها لا يستطيع MCP شراء الرصيد. ولا تعيد أدواته أبدًا الموجّهات أو الاستجابات أو القيم السرية.",
			},
			scenario: {
				prompt:
					"تستخدم Codex. تريده أن يكتب كود Phaseo يتبع التوثيق، وتريد أيضًا أن يعمل Codex نفسه على نماذج عبر Phaseo. ماذا تُعدّ؟",
				answer:
					"أمرين منفصلين. لكود صحيح، ثبّت المهارات بالأمر `npx skills add https://phaseo.app/docs`، وأضف Docs MCP إن أردت أن يقرأ التوثيق الحي. ولتشغيل Codex على Phaseo، ثبّت CLI، وشغّل `phaseo login`، ثم `phaseo codex`، الذي ينشئ مفتاحًا لـ Codex بحد شهري قدره 100 دولار وصلاحية 90 يومًا. ويمكن لإضافة Phaseo لـ Codex تثبيت المهارات وخادمَي MCP دفعة واحدة.",
			},
			takeaway:
				"المهارات وDocs MCP تعلّم وكيلك Phaseo، وPhaseo MCP يزوّده بالبيانات الحية، وCLI يشغّله على نماذج Phaseo.",
			links: [
				{
					label: "CLI وMCP",
					href: "https://phaseo.app/docs/v1/developers/cli-and-mcp",
				},
				{
					label: "وكلاء البرمجة",
					href: "https://phaseo.app/docs/v1/guides/integrations/coding-assistants",
				},
				{
					label: "إعداد وكلاء البرمجة باستخدام SKILL.md",
					href: "https://phaseo.app/docs/v1/cookbook/coding-agents-skill-md",
				},
				{
					label: "إدارة Phaseo من وكيل",
					href: "https://phaseo.app/docs/v1/developers/manage-from-an-agent",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "learn-in-your-agent",
			title: "تعلّم Phaseo داخل وكيلك",
			summary:
				"حوّل وكيل البرمجة إلى معلّم يعلّمك Phaseo بينما يبني شيئًا تحتاجه فعلًا.",
			minutes: 6,
			body: `الملف \`https://phaseo.app/learn.md\` دورة مكتوبة لوكيل البرمجة. الصق هذا في Claude Code أو Codex أو Cursor أو أي وكيل يمكنه جلب عناوين URL:

\`\`\`text
Fetch https://phaseo.app/learn.md and follow it. Teach me Phaseo while we build something I actually need.
\`\`\`

**ما الذي يحدث بعد ذلك.** يسألك الوكيل عمّا تريد بناءه، وعن خبرتك، ولغتك وإطار العمل، وأي قيود مثل الميزانية أو المنطقة، وكيف ستعرف أنه يعمل. يكتب ذلك كمهمة، ثم يقترح أصغر نسخة تعمل من البداية إلى النهاية. توافق على الخطة قبل أن يكتب أي كود.

**كيف يسير كل درس.** يكتب الوكيل الكود، وتتخذ أنت القرارات، مثل أي نموذج وأي نقطة نهاية وماذا تفعل عندما يفشل طلب. يشرح فكرة واحدة في كل مرة، ويسأل قبل أن يكتب أي تغيير، ويشغّله معك، ثم يطرح عليك سؤالًا ليتأكد من فهمك قبل أن ينتقل. ويبحث عن معرّفات النماذج والأسعار والحدود بدلًا من تخمينها.

**يُحفظ تقدّمك** في مجلد \`.phaseo-learn/\` داخل مشروعك: الدورة نفسها، ومهمتك وخطتك، وملاحظات عن طريقة عملك المفضلة، وصفحات التوثيق المستخدمة، وسجل لكل درس. ابدأ جلسة جديدة بالتعليمات نفسها، وسيقرأ الوكيل هذه الملفات ويكمل من حيث توقفت. ويعرض إضافة المجلد إلى \`.gitignore\`، والقرار لك.

اضبط \`PHASEO_API_KEY\` بنفسك قبل أن تبدأ. تطلب الدورة من الوكيل ألا يطلب منك أبدًا لصق مفتاح في المحادثة.`,
			quiz: {
				question: "أين تحفظ الدورة تقدّمك بين الجلسات؟",
				options: [
					"في مجلد .phaseo-learn/ داخل مشروعك.",
					"في حسابك على Phaseo، ضمن الإعدادات.",
					"لا مكان: كل جلسة تبدأ من البداية.",
				],
				answer: 0,
				explanation:
					"يحفظ الوكيل الدورة ومهمتك وملاحظاتك والموارد وسجلات الدروس في `.phaseo-learn/`، ويقرؤها في بداية كل جلسة.",
			},
			scenario: {
				prompt:
					"في منتصف الجلسة، يكتب الوكيل ثلاثة ملفات متتالية بعد أن قلت \"ok\" فقط، ويذكر سعر نموذج من الذاكرة. ماذا تفعل؟",
				answer:
					"كلاهما علامة على أن الوكيل ابتعد عن الدورة. اطلب منه التوقف، وإعادة قراءة `.phaseo-learn/COURSE.md` و`MISSION.md`، وأن يطرح عليك سؤال تحقق عن آخر شيء بناه. واطلب منه أن يبحث عن السعر من `GET https://api.phaseo.app/v1/models` أو من صفحة النموذج بدلًا من ذكره من الذاكرة.",
			},
			takeaway:
				"تعليمات واحدة تحوّل وكيلك إلى معلّم Phaseo يبني مشروعك معك ويحفظ تقدّمك في .phaseo-learn/.",
			links: [
				{ label: "الدورة الخاصة بوكيلك", href: "https://phaseo.app/learn.md" },
				{
					label: "البدء السريع",
					href: "https://phaseo.app/docs/v1/quickstart",
				},
				{
					label: "Docs MCP",
					href: "https://phaseo.app/docs/v1/guides/integrations/docs-mcp",
				},
			],
			updated: "2026-11-17",
		},
	],
};
