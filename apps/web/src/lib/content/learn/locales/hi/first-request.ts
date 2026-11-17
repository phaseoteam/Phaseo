import type { LearnCourse } from "../../types";

export const firstRequestCourse: LearnCourse = {
	slug: "make-your-first-request",
	title: "अपना पहला अनुरोध भेजें",
	summary:
		"Phaseo API को अनुरोध भेजें, लौटकर आने वाला जवाब पढ़ें, त्रुटियाँ संभालें और जवाब स्ट्रीम करें।",
	level: "developer",
	format: "कोई भी भाषा",
	prerequisites: ["Phaseo क्या है?", "किसी भी भाषा में HTTP अनुरोध भेजने में सहजता"],
	lessons: [
		{
			slug: "make-a-request",
			title: "अनुरोध भेजें",
			summary: "अपनी API कुंजी, एक मॉडल ID और अपना इनपुट एक OpenAI-संगत एंडपॉइंट पर भेजें।",
			minutes: 7,
			body: `हर अनुरोध \`https://api.phaseo.app/v1\` पर जाता है और आपकी API कुंजी को bearer टोकन के रूप में ले जाता है: \`Authorization: Bearer phaseo_v1_sk_...\`। कुंजी **सेटिंग्स -> API कुंजियाँ** में बनाएँ। यह सिर्फ़ एक बार दिखती है, इसलिए इसे \`PHASEO_API_KEY\` जैसे एनवायरनमेंट वेरिएबल में रखें और सिर्फ़ सर्वर-साइड कोड में इस्तेमाल करें।

नए टेक्स्ट काम के लिए \`POST /v1/responses\` सुझाया गया एंडपॉइंट है। आप एक \`model\` और एक \`input\` भेजते हैं:

\`\`\`bash
curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "input": "Reply with: quickstart works"
  }'
\`\`\`

पहले से आधिकारिक OpenAI SDK इस्तेमाल कर रहे हैं? तीन चीज़ें बदलें: API कुंजी, बेस URL और मॉडल ID।

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

Chat Completions को कॉल करने वाला कोड इसी क्लाइंट के साथ काम करता है: बस \`messages\` को \`client.chat.completions.create\` पर भेजें।

मॉडल ID में हमेशा प्रदाता उपसर्ग होता है, जैसे \`openai/\`, \`anthropic/\` या \`google/\`। मॉडल बदलने के लिए सिर्फ़ \`model\` स्ट्रिंग बदलें; बाकी अनुरोध वैसा ही रहता है। अनुमान लगाने के बजाय \`GET /v1/models\` से मान्य ID की सूची लें। \`phaseo/free\` कोई उपलब्ध मुफ़्त मॉडल चुनता है और क्रेडिट के बिना काम करता है, जो पहले टेस्ट के लिए काम का है।`,
			quiz: {
				question: "आप आधिकारिक OpenAI SDK को Phaseo की ओर मोड़ते हैं। आपको कौन से बदलाव करने होंगे?",
				options: [
					"API कुंजी, बेस URL और मॉडल ID",
					"सिर्फ़ बेस URL; SDK आपकी OpenAI कुंजी इस्तेमाल करता रहता है",
					"प्रदाता का नाम बताने वाला Phaseo का एक खास अनुरोध फ़ील्ड, और बेस URL",
				],
				answer: 0,
				explanation:
					"दस्तावेज़ ठीक तीन बदलाव बताते हैं: आपकी Phaseo API कुंजी, बेस URL https://api.phaseo.app/v1 और प्रदाता उपसर्ग वाली Phaseo मॉडल ID। आपकी OpenAI कुंजी Phaseo पर काम नहीं करती, और प्रदाता मॉडल ID का हिस्सा है, अलग फ़ील्ड नहीं।",
			},
			scenario: {
				prompt:
					"आपका ऐप `\"model\": \"gpt-6-astra\"` भेजता है और अनुरोध 400 के साथ विफल होता है। एक साथी कहता है कि मॉडल डाउन होगा। आप पहले क्या जाँचेंगे?",
				answer:
					"मॉडल ID। Phaseo मॉडल ID में प्रदाता उपसर्ग होता है, इसलिए यह `openai/gpt-6-astra` होनी चाहिए। 400 अनुरोध बॉडी या मॉडल ID की ओर इशारा करता है, किसी आउटेज की ओर नहीं। सही ID पक्की करने के लिए `GET /v1/models` कॉल करें।",
			},
			takeaway:
				"एक बेस URL, एक bearer कुंजी और प्रदाता उपसर्ग वाली मॉडल ID ही काफ़ी है, और मॉडल बदलने का मतलब है एक स्ट्रिंग बदलना।",
			links: [
				{ label: "क्विकस्टार्ट", href: "https://phaseo.app/docs/v1/quickstart" },
				{ label: "OpenAI SDK", href: "https://phaseo.app/docs/v1/guides/integrations/openai-sdk" },
				{ label: "चैट कम्प्लीशन बनाएँ", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "read-the-response",
			title: "जवाब पढ़ें",
			summary: "जवाब ढूँढें, जानें कि वह क्यों रुका, किसने उसे चलाया और उसकी लागत क्या रही।",
			minutes: 6,
			body: `Chat Completions का जवाब ऐसा दिखता है (मान सिर्फ़ उदाहरण हैं):

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

- **\`choices[].message.content\`** में जवाब का टेक्स्ट होता है।
- **\`finish_reason\`** बताता है कि मॉडल क्यों रुका: \`stop\` (उसने पूरा कर लिया), \`length\` (वह टोकन सीमा तक पहुँच गया), \`tool_calls\` (वह कोई टूल कॉल करना चाहता है) या \`content_filter\`।
- **\`model\`** उस मॉडल का नाम बताता है जिसने जवाब दिया। अगर किसी फ़ॉलबैक मॉडल ने अनुरोध चलाया, तो यह फ़ॉलबैक होगा, वह नहीं जो आपने माँगा था।
- **\`provider\`** उस प्रदाता का नाम बताता है जिसने इसे चलाया।
- **\`id\`** Phaseo अनुरोध ID है। इसे लॉग करें: अनुरोध **सेटिंग्स -> उपयोग -> लॉग** में दिखता है, और सपोर्ट इसे माँगता है।

\`usage\` टोकन गिनता है और \`cost\` जोड़ता है: अनुरोध की आपकी लागत US डॉलर में, यानी आपके क्रेडिट से कटने वाली रकम। BYOK अनुरोध पर \`cost_details.upstream_inference_cost\` दिखाता है कि आपकी अपनी प्रदाता कुंजी पर कितना बिल बना; Phaseo क्रेडिट पर यह \`null\` होता है।

\`/v1/responses\` पर फ़ॉर्मैट अलग है: टेक्स्ट \`output[].content[]\` में होता है जहाँ \`type\` का मान \`output_text\` है, और \`usage\` में \`input_tokens\` और \`output_tokens\` होते हैं।`,
			quiz: {
				question: "Chat Completions का जवाब `finish_reason: \"length\"` के साथ लौटता है। क्या हुआ?",
				options: [
					"प्रदाता बीच में विफल हुआ और Phaseo ने जितना मिला उतना लौटा दिया",
					"मॉडल टोकन सीमा तक पहुँच गया, इसलिए जवाब कटा हुआ हो सकता है",
					"मॉडल ने सामान्य रूप से पूरा किया और जवाब पूरा है",
				],
				answer: 1,
				explanation:
					"`length` का मतलब है कि मॉडल टोकन सीमा तक पहुँचने की वजह से रुका। सामान्य अंत `stop` होता है। बीच में विफल होने वाला प्रदाता त्रुटि लौटाता है, finish reason वाला अधूरा जवाब नहीं।",
			},
			scenario: {
				prompt:
					"फ़ाइनेंस पूछता है कि कल के अनुरोध `G-01J...` की लागत क्या थी, और उसे किस प्रदाता ने चलाया। आप कहाँ देखेंगे?",
				answer:
					"जवाब में ही, `usage.cost` US डॉलर में शुल्क बताता है और `provider` बताता है कि इसे किसने चलाया। अगर आपने बॉडी लॉग नहीं की, तो **सेटिंग्स -> उपयोग -> लॉग** में ID से अनुरोध खोलें।",
			},
			takeaway:
				"जवाब `choices` से पढ़ें, `finish_reason` जाँचें, और हर कॉल के साथ `id`, `model`, `provider` और `usage.cost` लॉग करें।",
			links: [
				{ label: "चैट कम्प्लीशन बनाएँ", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
				{ label: "रिस्पॉन्स बनाएँ", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
				{ label: "क्विकस्टार्ट: जवाब पढ़ें", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "when-a-request-fails",
			title: "जब अनुरोध विफल हो",
			summary: "त्रुटि कोड और स्टेटस के आधार पर आगे बढ़ें, और सिर्फ़ उन त्रुटियों पर दोबारा कोशिश करें जो बाद में सफल हो सकती हैं।",
			minutes: 8,
			body: `हर Phaseo त्रुटि की JSON बॉडी हर एंडपॉइंट पर एक जैसी होती है। \`error\` ऑब्जेक्ट उसी फ़ॉर्मैट में है जिसे OpenAI-संगत SDK पहले से पढ़ते हैं:

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

\`error.code\` और HTTP स्टेटस के आधार पर फ़ैसला करें, संदेश के टेक्स्ट के आधार पर कभी नहीं। \`generation_id\` हमेशा लॉग करें।

| स्टेटस | आम कोड | क्या करें |
| --- | --- | --- |
| \`400\` | \`validation_error\`, \`model_required\` | अनुरोध ठीक करें। \`error.param\` फ़ील्ड का नाम बताता है। |
| \`401\` | \`unauthorised\` | कुंजी और \`Authorization\` हेडर जाँचें। |
| \`402\` | \`insufficient_funds\` | क्रेडिट जोड़ें, या \`phaseo/free\` इस्तेमाल करें। |
| \`403\` | \`guardrail_blocked\` | अनुरोध या गार्डरेल बदलें। |
| \`404\` | \`not_found\` | पाथ और ID जाँचें। |
| \`410\` | \`model_retired\` | \`replacement_model\` पर जाएँ। |
| \`429\` | \`rate_limit_exceeded\`, \`key_limit_exceeded\` | \`Retry-After\` तक रुकें, फिर दोबारा कोशिश करें। |
| \`5xx\` | \`upstream_error\`, \`gateway_error\` | backoff के साथ दोबारा कोशिश करें। |

\`429\` के अलावा \`4xx\` त्रुटियों पर बिना बदलाव दोबारा कोशिश न करें: वे फिर विफल होंगी। \`429\` के लिए \`Retry-After\` (सेकंड या HTTP तारीख) तक रुकें, या jitter के साथ exponential backoff इस्तेमाल करें। \`Retry-After\` के बिना आया \`key_limit_exceeded\` अपने आप रीसेट नहीं होगा, इसलिए उस पर दोबारा कोशिश न करें। \`5xx\` पर सिर्फ़ तब दोबारा कोशिश करें जब कॉल दोहराना सुरक्षित हो, और कोशिशों की सीमा और कुल समय-सीमा तय करें।`,
			quiz: {
				question: "आपका अनुरोध `unauthorised` कोड के साथ `401` लौटाता है। आपके कोड को क्या करना चाहिए?",
				options: [
					"रुकें और API कुंजी व `Authorization: Bearer` हेडर जाँचें",
					"सफल होने तक exponential backoff के साथ दोबारा कोशिश करें",
					"`Retry-After` हेडर तक रुकें, फिर वही अनुरोध दोबारा भेजें",
				],
				answer: 0,
				explanation:
					"401 का मतलब है कि कुंजी नहीं है या अमान्य है। वही अनुरोध दोहराने से यह ठीक नहीं होगा। backoff 429 और 5xx के लिए है, और `Retry-After` 429 के साथ आता है।",
			},
			scenario: {
				prompt:
					"एक बैच स्क्रिप्ट लूप में 500 अनुरोध भेजती है। आधे रास्ते में जवाब `Retry-After: 20` हेडर के साथ `429` के रूप में आने लगते हैं। आप क्या बदलेंगे?",
				answer:
					"स्क्रिप्ट से `Retry-After` का पालन करवाएँ: दोबारा कोशिश से पहले लगभग 20 सेकंड रुकें, और हेडर न हो तो jitter वाले exponential backoff पर जाएँ। `error.code` भी जाँचें: `rate_limit_exceeded` रीसेट हो जाएगा, लेकिन `Retry-After` के बिना `key_limit_exceeded` नहीं होगा, इसलिए उस पर दोबारा कोशिश बेकार है।",
			},
			takeaway:
				"`error.code` और स्टेटस के आधार पर फ़ैसला करें, 4xx त्रुटियाँ ठीक करें, और सिर्फ़ 429 और सुरक्षित 5xx त्रुटियों पर backoff के साथ दोबारा कोशिश करें।",
			links: [
				{ label: "त्रुटियाँ और डीबगिंग", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "दर सीमाएँ", href: "https://phaseo.app/docs/v1/api-reference/limits" },
				{ label: "क्विकस्टार्ट: समस्या हल करें", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "stream-it",
			title: "इसे स्ट्रीम करें",
			summary: "जवाब लिखे जाते समय दिखाएँ, और पूरी हुई स्ट्रीम को टूटी हुई स्ट्रीम से अलग पहचानें।",
			minutes: 9,
			body: `\`"stream": true\` सेट करें और मॉडल के लिखते समय Phaseo आउटपुट को server-sent events (SSE) के रूप में भेजता है:

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

पहले HTTP स्टेटस जाँचें। जो अनुरोध स्ट्रीम शुरू होने से पहले विफल होता है, उसे स्ट्रीम नहीं, सामान्य JSON त्रुटि मिलती है। फिर इवेंट पढ़ें। हर एंडपॉइंट का अपना फ़ॉर्मैट है:

| एंडपॉइंट | टेक्स्ट कहाँ आता है | सफल अंत | विफल अंत |
| --- | --- | --- | --- |
| Responses | \`response.output_text.delta\` | \`response.completed\` | \`response.failed\` या \`error\` |
| Chat Completions | \`choices[].delta\` | एक \`finish_reason\`, फिर \`[DONE]\` | बिना \`finish_reason\` वाला \`error\` फ़्रेम |

Chat Completions पर, \`[DONE]\` से पहले खाली \`choices\` वाला एक आख़िरी चंक \`usage\` लाता है, जिसमें पूरी स्ट्रीम की \`cost\` भी होती है। सिर्फ़ Chat Completions \`[DONE]\` भेजता है। एक नेटवर्क चंक में आधा इवेंट या कई इवेंट हो सकते हैं, इसलिए पार्स करने से पहले इवेंट पूरा होने तक बफ़र करें, या SDK का स्ट्रीम हेल्पर इस्तेमाल करें।

स्ट्रीम तभी पूरी मानी जाती है जब उसका सफल अंत इवेंट आ जाए। सिर्फ़ कनेक्शन बंद होने का मतलब यह नहीं कि जवाब पूरा है। अगर यह बीच में विफल हो, तो अधूरे टेक्स्ट को बाधित के रूप में चिह्नित करके रखें और दोबारा कोशिश का विकल्प दें; बीच में विफल हुई स्ट्रीम के अधूरे आउटपुट के लिए Phaseo शुल्क नहीं लेता।

रद्द करने के लिए \`AbortSignal\` (या आपके HTTP क्लाइंट का समकक्ष) पास करें और उपयोगकर्ता के रोकने पर abort करें। रद्द करने से यह गारंटी नहीं मिलती कि प्रदाता तुरंत रुक जाएगा, या पहले से जनरेट हुआ आउटपुट मुफ़्त होगा।`,
			quiz: {
				question: "आपकी Chat Completions स्ट्रीम ने टेक्स्ट भेजा, फिर कनेक्शन बंद हो गया। आपको कभी `finish_reason` या `[DONE]` नहीं मिला। आप क्या करेंगे?",
				options: [
					"इसे पूरा मानें, क्योंकि कनेक्शन ठीक से बंद हुआ",
					"दोबारा कोशिश से मिला अगला जवाब अधूरे टेक्स्ट के आगे जोड़ दें",
					"जवाब को बाधित मानें और दोबारा कोशिश का विकल्प दें",
				],
				answer: 2,
				explanation:
					"स्ट्रीम तभी पूरी होती है जब उसका सफल अंत इवेंट आता है। `finish_reason` और `[DONE]` के बिना जवाब अधूरा है। दोबारा कोशिश अलग टेक्स्ट दे सकती है, इसलिए उसे जोड़ने के बजाय अलग से दिखाएँ।",
			},
			scenario: {
				prompt:
					"उपयोगकर्ता आपके चैट UI में **Stop** दबा सकते हैं। आपके प्रोडक्ट मैनेजर मानते हैं कि रोके गए जवाबों की कोई लागत नहीं होती। क्या यह सही है?",
				answer:
					"नहीं। `AbortSignal` से अनुरोध abort करें ताकि आपका ऐप पढ़ना बंद कर दे, लेकिन दस्तावेज़ कहते हैं कि रद्द करने से यह गारंटी नहीं मिलती कि प्रदाता तुरंत रुकेगा, या जो आउटपुट वह पहले ही जनरेट कर चुका है वह मुफ़्त होगा। रोके गए जवाबों पर पहले से हो चुके काम का शुल्क लगने की उम्मीद रखें।",
			},
			takeaway:
				"एंडपॉइंट के सफल अंत इवेंट का इंतज़ार करें, बाकी सब को बाधित मानें, और यह न मानें कि रद्द की गई स्ट्रीम मुफ़्त है।",
			links: [
				{ label: "स्ट्रीमिंग", href: "https://phaseo.app/docs/v1/guides/streaming" },
				{ label: "स्ट्रीम के दौरान त्रुटियाँ", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "रिस्पॉन्स बनाएँ", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
			],
			updated: "2026-11-17",
		},
	],
};
