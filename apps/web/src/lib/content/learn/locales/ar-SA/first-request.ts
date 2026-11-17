import type { LearnCourse } from "../../types";

export const firstRequestCourse: LearnCourse = {
	slug: "make-your-first-request",
	title: "أرسل طلبك الأول",
	summary:
		"أرسل طلبًا إلى Phaseo API، واقرأ ما يعود، وتعامل مع الأخطاء، واستقبل الرد بالبث.",
	level: "developer",
	format: "أي لغة برمجة",
	prerequisites: ["ما هي Phaseo؟", "معرفة إرسال طلب HTTP بأي لغة"],
	lessons: [
		{
			slug: "make-a-request",
			title: "أرسل طلبًا",
			summary: "أرسل مفتاح API ومعرّف النموذج ومدخلاتك إلى نقطة نهاية واحدة متوافقة مع OpenAI.",
			minutes: 7,
			body: `كل طلب يذهب إلى \`https://api.phaseo.app/v1\` ويحمل مفتاح API كرمز bearer: \`Authorization: Bearer phaseo_v1_sk_...\`. أنشئ المفتاح من **الإعدادات ← مفاتيح API**. يُعرض مرة واحدة فقط، لذا احفظه في متغير بيئة مثل \`PHASEO_API_KEY\` وأبقِه في الكود الذي يعمل على الخادم فقط.

نقطة النهاية الموصى بها للعمل النصي الجديد هي \`POST /v1/responses\`. ترسل \`model\` و\`input\`:

\`\`\`bash
curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "input": "Reply with: quickstart works"
  }'
\`\`\`

هل تستخدم OpenAI SDK الرسمية أصلًا؟ غيّر ثلاثة أشياء: مفتاح API وعنوان URL الأساسي ومعرّف النموذج.

\`\`\`ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});

const response = await client.responses.create({
  model: "openai/gpt-6-astra",
  input: "Write one sentence about reliable model routing.",
});

console.log(response.output_text);
\`\`\`

الكود الذي يستدعي Chat Completions يعمل مع العميل نفسه: أرسل \`messages\` إلى \`client.chat.completions.create\` بدلًا من ذلك.

تحمل معرّفات النماذج دائمًا بادئة المزوّد، مثل \`openai/\` أو \`anthropic/\` أو \`google/\`. لتبديل النموذج، غيّر سلسلة \`model\` فقط، ويبقى باقي الطلب كما هو. اعرض المعرّفات الصالحة بـ \`GET /v1/models\` بدلًا من التخمين. يختار \`phaseo/free\` نموذجًا مجانيًا متاحًا ويعمل دون رصيد، وهذا يجعله مناسبًا لاختبار أول.`,
			quiz: {
				question: "توجّه OpenAI SDK الرسمية إلى Phaseo. ما مجموعة التغييرات التي تحتاجها؟",
				options: [
					"مفتاح API وعنوان URL الأساسي ومعرّف النموذج",
					"عنوان URL الأساسي فقط، وتبقى SDK تستخدم مفتاح OpenAI الخاص بك",
					"حقل طلب خاص بـ Phaseo يسمّي المزوّد، إضافة إلى عنوان URL الأساسي",
				],
				answer: 0,
				explanation:
					"يسرد التوثيق ثلاثة تغييرات بالضبط: مفتاح Phaseo API، وعنوان URL الأساسي https://api.phaseo.app/v1، ومعرّف نموذج Phaseo مع بادئة مزوّده. مفتاح OpenAI لا يعمل على Phaseo، والمزوّد جزء من معرّف النموذج، لا حقل منفصل.",
			},
			scenario: {
				prompt:
					"يرسل تطبيقك `\"model\": \"gpt-6-astra\"` ويفشل الطلب مع 400. يقول زميلك إن النموذج متوقف حتمًا. ما أول ما تتحقق منه؟",
				answer:
					"معرّف النموذج. معرّفات نماذج Phaseo تتضمن بادئة المزوّد، لذا يجب أن يكون `openai/gpt-6-astra`. يشير 400 إلى نص الطلب أو معرّف النموذج، لا إلى عطل. استدعِ `GET /v1/models` لتتأكد من المعرّف الدقيق.",
			},
			takeaway:
				"كل ما تحتاجه عنوان URL أساسي واحد ومفتاح bearer واحد ومعرّف نموذج ببادئة المزوّد، وتبديل النموذج يعني تغيير سلسلة واحدة.",
			links: [
				{ label: "البدء السريع", href: "https://phaseo.app/docs/v1/quickstart" },
				{ label: "OpenAI SDK", href: "https://phaseo.app/docs/v1/guides/integrations/openai-sdk" },
				{ label: "إنشاء Chat Completion", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "read-the-response",
			title: "اقرأ الاستجابة",
			summary: "اعثر على الرد، وسبب توقفه، ومن خدمه، وكم كلّف.",
			minutes: 6,
			body: `تبدو استجابة Chat Completions هكذا (القيم للتوضيح):

\`\`\`json
{
  "id": "G-...",
  "object": "chat.completion",
  "model": "openai/gpt-6-astra",
  "provider": "openai",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "ok" },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 1,
    "total_tokens": 13,
    "cost": 0.000021
  }
}
\`\`\`

- **\`choices[].message.content\`** يحمل نص الرد.
- **\`finish_reason\`** يقول لماذا توقف النموذج: \`stop\` (انتهى)، أو \`length\` (بلغ حد الرموز)، أو \`tool_calls\` (يريد استدعاء أداة) أو \`content_filter\`.
- **\`model\`** يسمّي النموذج الذي أجاب. إذا خدم نموذج بديل الطلب، فهذا هو البديل، لا النموذج الذي طلبته.
- **\`provider\`** يسمّي المزوّد الذي خدمه.
- **\`id\`** هو معرّف طلب Phaseo. سجّله: يظهر الطلب في **الإعدادات ← الاستخدام ← السجلات**، ويطلبه فريق الدعم.

يعدّ \`usage\` الرموز ويضيف \`cost\`: ما يكلّفك الطلب بالدولار الأمريكي، وهو المبلغ المخصوم من رصيدك. في طلب BYOK، يعرض \`cost_details.upstream_inference_cost\` ما يُحتسب على مفتاح المزوّد الخاص بك، وعلى رصيد Phaseo تكون قيمته \`null\`.

على \`/v1/responses\` يختلف الشكل: النص موجود في \`output[].content[]\` حيث يكون \`type\` هو \`output_text\`، ويستخدم \`usage\` الحقلين \`input_tokens\` و\`output_tokens\`.`,
			quiz: {
				question: "يعود رد Chat Completions مع `finish_reason: \"length\"`. ماذا حدث؟",
				options: [
					"فشل المزوّد في المنتصف وأعادت Phaseo ما كان لديها",
					"بلغ النموذج حد الرموز، لذا قد يكون الرد مقطوعًا",
					"انتهى النموذج بشكل طبيعي والرد مكتمل",
				],
				answer: 1,
				explanation:
					"تعني `length` أن النموذج توقف لأنه بلغ حد الرموز. الانتهاء الطبيعي هو `stop`. والمزوّد الذي يفشل في المنتصف يعيد خطأً، لا ردًا جزئيًا مع سبب انتهاء.",
			},
			scenario: {
				prompt:
					"يسأل فريق المالية كم كلّف طلب الأمس `G-01J...`، وأي مزوّد شغّله. أين تبحث؟",
				answer:
					"في الاستجابة نفسها، يعطي `usage.cost` المبلغ بالدولار الأمريكي ويسمّي `provider` من خدمه. إذا لم تسجّل النص، فافتح الطلب بمعرّفه من **الإعدادات ← الاستخدام ← السجلات**.",
			},
			takeaway:
				"اقرأ الرد من `choices`، وتحقّق من `finish_reason`، وسجّل `id` و`model` و`provider` و`usage.cost` مع كل استدعاء.",
			links: [
				{ label: "إنشاء Chat Completion", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
				{ label: "إنشاء استجابة", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
				{ label: "البدء السريع: اقرأ الرد", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "when-a-request-fails",
			title: "عندما يفشل طلب",
			summary: "تفرّع حسب رمز الخطأ والحالة، ولا تُعِد المحاولة إلا للأخطاء التي قد تنجح لاحقًا.",
			minutes: 8,
			body: `لكل أخطاء Phaseo نص JSON نفسه على كل نقاط النهاية. كائن \`error\` هو الشكل الذي تقرؤه حزم SDK المتوافقة مع OpenAI أصلًا:

\`\`\`json
{
  "error": {
    "code": "insufficient_funds",
    "message": "...",
    "type": "insufficient_quota",
    "param": null
  },
  "generation_id": "G-...",
  "status_code": 402
}
\`\`\`

تفرّع حسب \`error.code\` وحالة HTTP، لا حسب نص الرسالة أبدًا. وسجّل \`generation_id\` دائمًا.

| الحالة | الرمز الشائع | ماذا تفعل |
| --- | --- | --- |
| \`400\` | \`validation_error\`، \`model_required\` | أصلح الطلب. يسمّي \`error.param\` الحقل. |
| \`401\` | \`unauthorised\` | تحقّق من المفتاح ومن ترويسة \`Authorization\`. |
| \`402\` | \`insufficient_funds\` | أضف رصيدًا، أو استخدم \`phaseo/free\`. |
| \`403\` | \`guardrail_blocked\` | غيّر الطلب أو ضابط الحماية. |
| \`404\` | \`not_found\` | تحقّق من المسار والمعرّف. |
| \`410\` | \`model_retired\` | انتقل إلى \`replacement_model\`. |
| \`429\` | \`rate_limit_exceeded\`، \`key_limit_exceeded\` | انتظر \`Retry-After\`، ثم أعد المحاولة. |
| \`5xx\` | \`upstream_error\`، \`gateway_error\` | أعد المحاولة مع تأخير متزايد. |

لا تُعِد محاولة أخطاء \`4xx\` غير \`429\` دون تغيير، فهي ستفشل مجددًا. مع \`429\`، انتظر \`Retry-After\` (ثوانٍ أو تاريخ HTTP)، أو استخدم تأخيرًا أُسيًّا متزايدًا مع عشوائية. الخطأ \`key_limit_exceeded\` دون \`Retry-After\` لن يُعاد ضبطه من تلقاء نفسه، فلا تُعِد محاولته. ولا تُعِد محاولة \`5xx\` إلا إذا كان تكرار الاستدعاء آمنًا، وضع حدًا لعدد المحاولات ومهلة إجمالية.`,
			quiz: {
				question: "يعيد طلبك `401` مع الرمز `unauthorised`. ماذا يجب أن يفعل كودك؟",
				options: [
					"يتوقف ويتحقق من مفتاح API ومن ترويسة `Authorization: Bearer`",
					"يعيد المحاولة مع تأخير أُسّي متزايد حتى ينجح",
					"ينتظر ترويسة `Retry-After`، ثم يرسل الطلب نفسه مجددًا",
				],
				answer: 0,
				explanation:
					"يعني 401 أن المفتاح مفقود أو غير صالح. إعادة الطلب نفسه لا تصلح ذلك. التأخير المتزايد لأخطاء 429 و5xx، و`Retry-After` يأتي مع أخطاء 429.",
			},
			scenario: {
				prompt:
					"يرسل سكربت دفعات 500 طلب في حلقة. في منتصف الطريق، تبدأ الاستجابات بالعودة كـ `429` مع ترويسة `Retry-After: 20`. ماذا تغيّر؟",
				answer:
					"اجعل السكربت يحترم `Retry-After`: توقّف نحو 20 ثانية قبل إعادة المحاولة، وارجع إلى تأخير أُسّي متزايد مع عشوائية عندما تغيب الترويسة. وتحقّق من `error.code` أيضًا: `rate_limit_exceeded` سيُعاد ضبطه، أما `key_limit_exceeded` دون `Retry-After` فلن يُعاد، لذا لا فائدة من إعادة محاولته.",
			},
			takeaway:
				"تفرّع حسب `error.code` والحالة، وأصلح أخطاء 4xx، ولا تُعِد المحاولة إلا لأخطاء 429 و5xx الآمنة مع تأخير متزايد.",
			links: [
				{ label: "الأخطاء وتصحيحها", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "حدود المعدل", href: "https://phaseo.app/docs/v1/api-reference/limits" },
				{ label: "البدء السريع: استكشاف المشكلات", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "stream-it",
			title: "استقبل الرد بالبث",
			summary: "اعرض الرد أثناء كتابته، وميّز البث المكتمل من البث المنقطع.",
			minutes: 9,
			body: `اضبط \`"stream": true\` وسترسل Phaseo المخرجات كأحداث مرسلة من الخادم (SSE) أثناء كتابة النموذج لها:

\`\`\`bash
curl --no-buffer https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "input": "Say hello in one sentence.",
    "stream": true
  }'
\`\`\`

تحقّق من حالة HTTP أولًا. الطلب الذي يفشل قبل بدء البث يحصل على خطأ JSON العادي، لا على بث. ثم اقرأ الأحداث. لكل نقطة نهاية تنسيقها الخاص:

| نقطة النهاية | يصل النص في | النهاية الناجحة | نهاية الفشل |
| --- | --- | --- | --- |
| Responses | \`response.output_text.delta\` | \`response.completed\` | \`response.failed\` أو \`error\` |
| Chat Completions | \`choices[].delta\` | \`finish_reason\`، ثم \`[DONE]\` | إطار \`error\` دون \`finish_reason\` |

في Chat Completions، يحمل جزء أخير بقيمة \`choices\` فارغة الحقل \`usage\`، بما فيه \`cost\` للبث كله، قبل \`[DONE]\`. ولا يرسل \`[DONE]\` إلا Chat Completions. قد يحمل جزء الشبكة نصف حدث أو عدة أحداث، لذا خزّن البيانات مؤقتًا حتى يكتمل الحدث قبل تحليله، أو استخدم أداة بث من SDK.

لا يكتمل البث إلا عند وصول حدث نهايته الناجحة. إغلاق الاتصال وحده لا يعني أن الإجابة مكتملة. إذا فشل في المنتصف، فاحتفظ بالنص الجزئي مع وسمه كمنقطع واعرض إعادة المحاولة. لا تحتسب Phaseo المخرجات الجزئية لبث فشل.

للإلغاء، مرّر \`AbortSignal\` (أو ما يقابله في عميل HTTP لديك) وألغِ الطلب عندما يتوقف المستخدم. الإلغاء لا يضمن أن يتوقف المزوّد فورًا، ولا أن تكون المخرجات المولّدة بالفعل مجانية.`,
			quiz: {
				question: "أرسل بث Chat Completions نصًا، ثم أُغلق الاتصال. لم ترَ `finish_reason` ولا `[DONE]`. ماذا تفعل؟",
				options: [
					"تعتبره مكتملًا، لأن الاتصال أُغلق بشكل سليم",
					"تُلحق الإجابة التالية من إعادة المحاولة بالنص الجزئي",
					"تعتبر الإجابة منقطعة وتعرض إعادة المحاولة",
				],
				answer: 2,
				explanation:
					"لا يكتمل البث إلا عند وصول حدث نهايته الناجحة. دون `finish_reason` و`[DONE]`، تكون الإجابة غير مكتملة. وقد تنتج إعادة المحاولة نصًا مختلفًا، لذا اعرضه وحده بدلًا من إلحاقه.",
			},
			scenario: {
				prompt:
					"يستطيع المستخدمون الضغط على **إيقاف** في واجهة الدردشة لديك. يفترض مدير المنتج أن الردود الموقوفة لا تكلّف شيئًا. هل هذا صحيح؟",
				answer:
					"لا. ألغِ الطلب بـ `AbortSignal` كي يتوقف تطبيقك عن القراءة، لكن التوثيق يقول إن الإلغاء لا يضمن أن يتوقف المزوّد فورًا، ولا أن تكون المخرجات التي ولّدها بالفعل مجانية. توقّع أن تُحتسب الردود الموقوفة على العمل الذي أُنجز.",
			},
			takeaway:
				"انتظر حدث النهاية الناجحة لنقطة النهاية، واعتبر أي شيء آخر منقطعًا، ولا تفترض أن البث الملغى مجاني.",
			links: [
				{ label: "البث", href: "https://phaseo.app/docs/v1/guides/streaming" },
				{ label: "الأخطاء أثناء البث", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "إنشاء استجابة", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
			],
			updated: "2026-11-17",
		},
	],
};
