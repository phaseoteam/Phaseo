import type { LearnCourse } from "../../types";

export const buildFeaturesCourse: LearnCourse = {
	slug: "build-real-features",
	title: "ابنِ ميزات حقيقية",
	summary:
		"دع النماذج تستدعي دوالك، وتعيد JSON بشكل ثابت، وتستقبل الصور والملفات والصوت كمدخلات.",
	level: "developer",
	format: "أي لغة برمجة",
	prerequisites: ["أرسل طلبك الأول"],
	lessons: [
		{
			slug: "call-tools",
			title: "استدعِ الأدوات",
			summary: "صِف دوالك، وشغّل الاستدعاءات التي يطلبها النموذج، وأعد النتائج إليه حتى يجيب.",
			minutes: 10,
			body: `صِف دوالك في \`tools\`، وسيجيب النموذج باستدعاء لإحداها، مثل بحث في قاعدة بيانات، بدلًا من التخمين. النموذج لا يشغّل أي شيء بنفسه: تطبيقك يشغّل الدالة ويعيد النتيجة، ثم يكتب النموذج الإجابة النهائية.

\`\`\`bash
curl https://api.phaseo.app/v1/chat/completions \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "messages": [
      { "role": "user", "content": "What is the weather in London?" }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get current weather by city",
          "parameters": {
            "type": "object",
            "properties": {
              "city": { "type": "string" }
            },
            "required": ["city"]
          }
        }
      }
    ]
  }'
\`\`\`

في Chat Completions يحمل الرد \`finish_reason: "tool_calls"\` وقائمة \`tool_calls\` في رسالة المساعد، لكل منها \`id\` و\`name\` للدالة و\`arguments\` كسلسلة JSON. شغّل كل استدعاء، ثم أرسل طلب متابعة يكرر المحادثة، ورسالة المساعد دون تغيير، ورسالة \`role: "tool"\` واحدة لكل استدعاء مطابقة عبر \`tool_call_id\`. أرسل \`tools\` مرة أخرى. سيجيب النموذج أو يستدعي أداة أخرى، فتكرر. على \`/v1/responses\` يكون الاستدعاء عنصر \`function_call\` ونتيجتك عنصر \`function_call_output\` بقيمة \`call_id\` نفسها، وعلى \`/v1/messages\` تكونان كتلتَي \`tool_use\` و\`tool_result\`.

يتحكم \`tool_choice\` في ما إذا كان يجوز للنموذج استدعاء الأدوات: \`none\` للنص فقط، و\`auto\` (أو اتركه) ليقرر النموذج، و\`required\` لفرض استدعاء، أو كائن يسمّي أداة واحدة. اضبط \`parallel_tool_calls\` على \`false\` عندما يجب أن تعمل أدواتك واحدة تلو الأخرى.

تعامل مع كل استدعاء كمدخلات غير موثوقة. قارن اسم الأداة بقائمة سماح، وارفض الأسماء غير المعروفة، وتحقّق من الوسائط بعد تحليلها قبل تشغيل أي شيء. إذا فشل التحقق، فلا تشغّل الأداة: أرسل خطأً قصيرًا كنتيجة الأداة ودع النموذج يعيد المحاولة. مع \`stream: true\`، اجمع كل أجزاء الوسائط قبل التحليل. الأدوات التي يبدأ نوعها بـ \`phaseo:\`، مثل \`phaseo:web_search\` أو \`phaseo:datetime\`، تعمل لدى Phaseo، فتحصل على الإجابة النهائية دون أن تكتب منفّذًا. أدوات الخادم هذه في مرحلة **تجريبي**.`,
			quiz: {
				question: "يعيد النموذج استدعاءً لـ `delete_user` مع `{\"id\": \"42\"}`. تطبيقك لا يعرّف إلا `get_weather`. ماذا يجب أن يفعل كودك؟",
				options: [
					"يشغّله، لأن النموذج اختاره من المحادثة",
					"يرفضه كأداة غير معروفة ويعيد خطأً قصيرًا كنتيجة الأداة",
					"يطلب من Phaseo تشغيله ببادئة `phaseo:`",
				],
				answer: 1,
				explanation:
					"يقول دليل الأمان أن ترفض أسماء الأدوات غير المعروفة بدلًا من تخمين ما قصده النموذج، وأن تعيد خطأً مضبوطًا بدلًا من تشغيل أي شيء. أدوات `phaseo:` مجموعة ثابتة تقدّمها Phaseo، وليست طريقة لتشغيل دوالك الخاصة.",
			},
			scenario: {
				prompt:
					"يستدعي روبوت الدعم لديك `get_order` ثم يجيب. حلقة كتبها زميلك ترسل رسالة `role: \"tool\"` وحدها في طلب المتابعة، فيرفضها المزوّد. ما الناقص؟",
				answer:
					"يجب أن يكرر طلب المتابعة المحادثة، ثم رسالة المساعد مع `tool_calls` دون تغيير، ثم رسالة `role: \"tool\"` واحدة لكل استدعاء مع `tool_call_id` المطابق. وأرسل `tools` مرة أخرى أيضًا. نتيجة أداة لا يسبقها استدعاء لا تجد ما تطابقه.",
			},
			takeaway:
				"النموذج يطلب، وتطبيقك يتحقق من الاستدعاء ويشغّله، وتعيد النتيجة بمعرّف الاستدعاء حتى يعطي النموذج إجابة نهائية.",
			links: [
				{ label: "استدعاء الأدوات", href: "https://phaseo.app/docs/v1/guides/tool-calling" },
				{ label: "أنماط استدعاء الأدوات", href: "https://phaseo.app/docs/v1/guides/tool-calling-patterns" },
				{ label: "أمان استدعاء الأدوات", href: "https://phaseo.app/docs/v1/guides/tool-calling-safety" },
				{ label: "أدوات الخادم", href: "https://phaseo.app/docs/v1/guides/server-tools" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "get-structured-output",
			title: "احصل على مخرجات منظّمة",
			summary: "أرسل JSON Schema كي يعيد النموذج JSON بالشكل الذي تريده، ثم تحقّق منه قبل استخدامه.",
			minutes: 8,
			body: `أرسل JSON Schema مع الطلب وسيعيد النموذج JSON بهذا الشكل بدلًا من نص حر. استخدمه عندما تريد بيانات، مثل حقول مستخرجة من بريد إلكتروني. واستخدم استدعاء الأدوات عندما تريد أن يطلب النموذج من تطبيقك فعل شيء.

| \`type\` | ما تحصل عليه |
| --- | --- |
| \`json_schema\` | JSON يتبع مخططك. استخدمه افتراضيًا. |
| \`json_object\` | كائن JSON صالح ما، دون فرض شكل. |
| \`text\` | نص عادي (الافتراضي). |

يوضع التنسيق في \`response_format\` على \`/v1/chat/completions\`، و\`text.format\` على \`/v1/responses\`، و\`output_config.format\` على \`/v1/messages\` (\`json_schema\` فقط).

\`\`\`json
{
  "model": "openai/gpt-6-astra",
  "messages": [
    { "role": "user", "content": "Return the city and weather for London." }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "weather",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "city": { "type": "string" },
          "weather": { "type": "string" }
        },
        "required": ["city", "weather"],
        "additionalProperties": false
      }
    }
  }
}
\`\`\`

يعود JSON كسلسلة نصية في محتوى الرسالة. قبل تحليله، تحقّق من وجود رفض أو محتوى مفقود أو \`finish_reason\` غير \`stop\`. ثم تحقّق من الكائن بعد تحليله، مثلًا باستخدام Zod. إذا فشل التحقق، أعد المحاولة مرة واحدة مع الخطأ في الموجّه، ثم أعد فشلًا آمنًا. كل إعادة محاولة تُحتسب، وJSON الصالح لا يثبت أن القيم صحيحة.

لا تُسقط Phaseo الحقل \`response_format\` أبدًا. فهي توجّه طلب \`json_schema\` فقط إلى المزوّدين الذين يدعمون المخرجات المنظّمة، وإذا لم يدعمها أي من مزوّدي النموذج، يفشل الطلب مع \`400 validation_error\`. تشير صفحات النماذج إلى الدعم بـ \`structured_outputs\`، وهي علامة قدرة، لا حقل في الطلب.`,
			quiz: {
				question: "ترسل `response_format` مع `json_schema` إلى نموذج لا يدعم مزوّدوه المخرجات المنظّمة. ماذا يحدث؟",
				options: [
					"تُسقط Phaseo `response_format` وتعيد نصًا عاديًا",
					"ترسل Phaseo الطلب على أي حال ويخمّن النموذج الشكل",
					"يفشل الطلب مع `400 validation_error`",
				],
				answer: 2,
				explanation:
					"لا يُسقط `response_format` أبدًا. توجّه Phaseo طلب المخطط فقط إلى المزوّدين الذين يدعمون المخرجات المنظّمة، وتعيد 400 عندما لا يملك النموذج أيًا منهم.",
			},
			scenario: {
				prompt:
					"يستخدم محلّل الفواتير لديك `json_schema`، ومن حين لآخر يفشل الرد في فحص Zod لأن `total` مفقود. ماذا يجب أن يفعل الكود؟",
				answer:
					"تحقّق أولًا من أن `finish_reason` هو `stop`، لأن الإجابة المقطوعة لا يمكن أن تكون صالحة. ثم أعد المحاولة مرة واحدة مع خطأ التحقق في الموجّه، وإذا فشلت مجددًا، فأعد فشلًا آمنًا بدلًا من التخمين. تتبّع حالات الفشل لكل نموذج وإصدار مخطط كي تلاحظ متى يزيد أيّ تغيير منهما الأمر سوءًا.",
			},
			takeaway:
				"استخدم `json_schema` للبيانات التي تحتاجها بشكل ثابت، وتحقّق دائمًا من النتيجة في كودك قبل أن تثق بها.",
			links: [
				{ label: "المخرجات المنظّمة", href: "https://phaseo.app/docs/v1/guides/structured-outputs" },
				{ label: "المعاملات: response_format", href: "https://phaseo.app/docs/v1/api-reference/parameters" },
				{ label: "إصلاح الردود لـ JSON", href: "https://phaseo.app/docs/v1/cookbook/response-healing-for-structured-json" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "send-images-and-audio",
			title: "أرسل الصور والصوت",
			summary: "أضف صورًا وملفات وصوتًا إلى طلب، واختر نقطة النهاية المناسبة للمخرجات التي تريدها، واعثر على النماذج التي تقبل كل نوع من المدخلات.",
			minutes: 9,
			body: `في نقاط النهاية النصية، يمكن أن يكون \`content\` في الرسالة قائمة أجزاء بدلًا من سلسلة نصية. يقبل جزء الصورة عنوان URL من نوع HTTP(S) أو URI من نوع \`data:\` بترميز base64:

\`\`\`json
{
  "model": "anthropic/claude-sonnet-5.5",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "What does this chart show?" },
        { "type": "image_url", "image_url": { "url": "https://example.com/chart.png" } }
      ]
    }
  ]
}
\`\`\`

تتبع أجزاء الإدخال الأخرى النمط نفسه. يرسل \`input_audio\` صوتًا بترميز base64 في \`data\` مع \`format\` مثل \`wav\` أو \`mp3\`. ويرسل جزء \`file\` مستندًا مثل PDF، إما كعنوان data URL بترميز base64 في \`file_data\` أو كـ \`file_id\`. لا يمكن قراءة \`file_id\` إلا من حساب المزوّد الذي أصدره، لذا ثبّت ذلك المزوّد أو أرسل البيانات بدلًا منه.

للأنواع الأخرى من المخرجات، استخدم نقطة النهاية الخاصة بها:

| ما تريده | نقطة النهاية |
| --- | --- |
| كلام من نص | \`/v1/audio/speech\` |
| نص من كلام | \`/v1/audio/transcriptions\` (\`/v1/audio/translations\` للإنجليزية) |
| الصور | \`/v1/images/generations\`، \`/v1/images/edits\` |
| النص والتخطيط من صورة مستند | \`/v1/ocr\`، \`/v1/parse\` |

يقبل \`/v1/parse\` صورة واحدة لكل طلب ولا يقبل ملفات PDF، لذا حوّل كل صفحة إلى صورة أولًا.

ليس كل نموذج يقبل كل نوع من المدخلات. توجّه Phaseo الطلب فقط إلى المزوّدين الذين يقبلون المدخلات في طلبك، وإذا لم يقبلها أي منهم، تحصل على \`400 unsupported_modalities\`. تحقّق أولًا: كل نموذج في \`GET /v1/models\` يسرد \`modalities.input\`، ويمكنك التصفية بـ \`input_types=image\`. وفي صفحة [النماذج](https://phaseo.app/models)، استخدم فلاتر أنماط الإدخال والإخراج.`,
			quiz: {
				question: "تحتاج إلى قائمة بالنماذج التي تقبل الصور كمدخلات. ما أسرع طريقة موثوقة للتحقق؟",
				options: [
					"استدعاء `GET /v1/models?input_types=image`",
					"إرسال صورة إلى كل نموذج ورؤية أيها لا يعيد خطأً",
					"اختيار أي نموذج يتضمن اسمه \"vision\"",
				],
				answer: 0,
				explanation:
					"يصفّي `GET /v1/models` حسب `input_types` (واسمه البديل `input_modalities`)، ويسرد كل نموذج `modalities.input`. وصفحة النماذج فيها الفلاتر نفسها. التجربة والخطأ تكلّف مالًا، والأسماء لا تخبرك بما يقبله المسار.",
			},
			scenario: {
				prompt:
					"ترسل ميزة الإيصالات لديك صورة إلى نموذج نصي فقط وتحصل على `400 unsupported_modalities`. يسأل مدير المنتج هل Phaseo متوقفة. ماذا تقول له، وماذا تغيّر؟",
				answer:
					"لا، Phaseo ليست متوقفة: لا يوجد مسار لذلك النموذج يقبل الصور كمدخلات. اختر نموذجًا يتضمن `modalities.input` فيه `image` (صفِّ `GET /v1/models` بـ `input_types=image`، أو استخدم فلتر صفحة النماذج) وأرسل الطلب نفسه إليه.",
			},
			takeaway:
				"أرسل الصور والصوت والملفات كأجزاء محتوى، واستخدم نقاط النهاية المخصصة للكلام والتفريغ النصي والصور، وتحقّق من أنماط إدخال النموذج قبل أن تعتمد عليه.",
			links: [
				{ label: "تعدد الوسائط", href: "https://phaseo.app/docs/v1/guides/multimodality" },
				{ label: "عرض النماذج", href: "https://phaseo.app/docs/v1/api-reference/endpoint/models" },
				{ label: "تحليل صور المستندات", href: "https://phaseo.app/docs/v1/guides/document-parsing" },
				{ label: "استكشاف النماذج", href: "https://phaseo.app/docs/v1/exploring/models" },
			],
			updated: "2026-11-17",
		},
	],
};
