import type { LearnCourse } from "../../types";

export const buildFeaturesCourse: LearnCourse = {
	slug: "build-real-features",
	title: "असली फ़ीचर बनाएँ",
	summary:
		"मॉडल को अपने फ़ंक्शन कॉल करने दें, तय ढाँचे में JSON लौटवाएँ, और इमेज, फ़ाइलें और ऑडियो को इनपुट के रूप में भेजें।",
	level: "developer",
	format: "कोई भी भाषा",
	prerequisites: ["अपना पहला अनुरोध भेजें"],
	lessons: [
		{
			slug: "call-tools",
			title: "टूल कॉल करें",
			summary: "अपने फ़ंक्शन का विवरण दें, मॉडल जो कॉल माँगे उन्हें चलाएँ, और जवाब मिलने तक नतीजे वापस भेजते रहें।",
			minutes: 10,
			body: `\`tools\` में अपने फ़ंक्शन का विवरण दें, और मॉडल अनुमान लगाने के बजाय उनमें से किसी एक को कॉल करके जवाब देता है, जैसे डेटाबेस में कुछ ढूँढना। मॉडल खुद कभी कुछ नहीं चलाता: आपका ऐप फ़ंक्शन चलाता है और नतीजा वापस भेजता है, फिर मॉडल अंतिम जवाब लिखता है।

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

Chat Completions पर जवाब में \`finish_reason: "tool_calls"\` होता है और assistant संदेश पर एक \`tool_calls\` सूची होती है, जिसमें हर कॉल का \`id\`, फ़ंक्शन का \`name\` और JSON स्ट्रिंग के रूप में \`arguments\` होते हैं। हर कॉल चलाएँ, फिर एक अगला अनुरोध भेजें जिसमें बातचीत दोहराई जाए, assistant संदेश बिना बदलाव के हो, और हर कॉल के लिए \`tool_call_id\` से मिलाया गया एक \`role: "tool"\` संदेश हो। \`tools\` दोबारा भेजें। मॉडल या तो जवाब देता है या कोई और टूल कॉल करता है, और आप यही दोहराते हैं। \`/v1/responses\` पर कॉल एक \`function_call\` आइटम होता है और आपका नतीजा उसी \`call_id\` वाला \`function_call_output\` आइटम; \`/v1/messages\` पर ये \`tool_use\` और \`tool_result\` ब्लॉक होते हैं।

\`tool_choice\` तय करता है कि मॉडल टूल कॉल कर सकता है या नहीं: सिर्फ़ टेक्स्ट के लिए \`none\`, मॉडल को फ़ैसला करने देने के लिए \`auto\` (या इसे छोड़ दें), कॉल ज़रूरी करने के लिए \`required\`, या किसी एक टूल का नाम बताने वाला ऑब्जेक्ट। जब आपके टूल एक-एक करके चलने चाहिए, तो \`parallel_tool_calls\` को \`false\` सेट करें।

हर कॉल को अविश्वसनीय इनपुट मानें। टूल का नाम एक अनुमति सूची से मिलाएँ, अनजान नाम अस्वीकार करें, और कुछ भी चलाने से पहले पार्स किए गए arguments की जाँच करें। जाँच विफल हो, तो टूल न चलाएँ: टूल नतीजे के रूप में एक छोटी त्रुटि भेजें और मॉडल को दोबारा कोशिश करने दें। \`stream: true\` के साथ, पार्स करने से पहले हर argument delta इकट्ठा करें। जिन टूल का type \`phaseo:\` से शुरू होता है, जैसे \`phaseo:web_search\` या \`phaseo:datetime\`, वे Phaseo की ओर चलते हैं, इसलिए आपको executor लिखे बिना अंतिम जवाब मिल जाता है। ये सर्वर टूल **बीटा** में हैं।`,
			quiz: {
				question: "मॉडल `{\"id\": \"42\"}` के साथ `delete_user` का कॉल लौटाता है। आपका ऐप सिर्फ़ `get_weather` परिभाषित करता है। आपके कोड को क्या करना चाहिए?",
				options: [
					"इसे चलाएँ, क्योंकि मॉडल ने इसे बातचीत से चुना",
					"इसे अनजान टूल मानकर अस्वीकार करें और टूल नतीजे के रूप में एक छोटी त्रुटि वापस भेजें",
					"Phaseo से इसे `phaseo:` उपसर्ग के साथ चलाने को कहें",
				],
				answer: 1,
				explanation:
					"सुरक्षा गाइड कहती है कि मॉडल का मतलब अनुमान लगाने के बजाय अनजान टूल नाम अस्वीकार करें, और कुछ चलाने के बजाय नियंत्रित त्रुटि वापस भेजें। `phaseo:` टूल Phaseo के दिए हुए तय टूल हैं, आपके अपने फ़ंक्शन चलाने का तरीका नहीं।",
			},
			scenario: {
				prompt:
					"आपका सपोर्ट बॉट `get_order` कॉल करता है और फिर जवाब देता है। एक साथी का लूप अगले अनुरोध में सिर्फ़ `role: \"tool\"` संदेश भेजता है, और प्रदाता उसे अस्वीकार कर देता है। क्या छूट रहा है?",
				answer:
					"अगले अनुरोध में पहले बातचीत दोहराई जानी चाहिए, फिर अपने `tool_calls` के साथ बिना बदलाव का assistant संदेश, फिर हर कॉल के लिए मिलते `tool_call_id` वाला एक `role: \"tool\"` संदेश। `tools` भी दोबारा भेजें। जिस टूल नतीजे से पहले कोई कॉल नहीं, उसे मिलाने के लिए कुछ नहीं होता।",
			},
			takeaway:
				"मॉडल माँगता है, आपका ऐप कॉल जाँचकर चलाता है, और मॉडल के अंतिम जवाब देने तक आप कॉल की ID के साथ नतीजा वापस भेजते हैं।",
			links: [
				{ label: "टूल कॉलिंग", href: "https://phaseo.app/docs/v1/guides/tool-calling" },
				{ label: "टूल कॉलिंग पैटर्न", href: "https://phaseo.app/docs/v1/guides/tool-calling-patterns" },
				{ label: "टूल कॉलिंग सुरक्षा", href: "https://phaseo.app/docs/v1/guides/tool-calling-safety" },
				{ label: "सर्वर टूल", href: "https://phaseo.app/docs/v1/guides/server-tools" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "get-structured-output",
			title: "संरचित आउटपुट पाएँ",
			summary: "JSON Schema भेजें ताकि मॉडल आपके ढाँचे में JSON लौटाए, फिर इस्तेमाल से पहले उसकी जाँच करें।",
			minutes: 8,
			body: `अनुरोध के साथ JSON Schema भेजें और मॉडल खुले टेक्स्ट के बजाय उसी ढाँचे में JSON लौटाता है। इसे तब इस्तेमाल करें जब आपको डेटा वापस चाहिए, जैसे किसी ईमेल से निकाले गए फ़ील्ड। जब आप चाहते हैं कि मॉडल आपके ऐप से कुछ करवाए, तब टूल कॉलिंग इस्तेमाल करें।

| \`type\` | आपको क्या मिलता है |
| --- | --- |
| \`json_schema\` | आपके schema के अनुसार JSON। डिफ़ॉल्ट रूप से यही इस्तेमाल करें। |
| \`json_object\` | कोई मान्य JSON ऑब्जेक्ट, बिना तय ढाँचे के। |
| \`text\` | सादा टेक्स्ट (डिफ़ॉल्ट)। |

फ़ॉर्मैट \`/v1/chat/completions\` पर \`response_format\` में, \`/v1/responses\` पर \`text.format\` में और \`/v1/messages\` पर \`output_config.format\` में जाता है (सिर्फ़ \`json_schema\`)।

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

JSON संदेश की content में स्ट्रिंग के रूप में आता है। पार्स करने से पहले जाँचें कि कहीं इनकार, गायब content या \`stop\` के अलावा कोई \`finish_reason\` तो नहीं। फिर पार्स किए गए ऑब्जेक्ट की जाँच करें, जैसे Zod से। जाँच विफल हो, तो प्रॉम्प्ट में त्रुटि के साथ एक बार दोबारा कोशिश करें, फिर एक सुरक्षित विफलता लौटाएँ। हर दोबारा कोशिश का शुल्क लगता है, और मान्य JSON होना यह साबित नहीं करता कि मान सही हैं।

Phaseo कभी \`response_format\` नहीं हटाता। वह \`json_schema\` अनुरोध को सिर्फ़ उन प्रदाताओं पर रूट करता है जो संरचित आउटपुट का समर्थन करते हैं; अगर मॉडल का कोई भी प्रदाता नहीं करता, तो अनुरोध \`400 validation_error\` के साथ विफल होता है। मॉडल पेज समर्थन को \`structured_outputs\` से दिखाते हैं, जो एक क्षमता फ़्लैग है, अनुरोध फ़ील्ड नहीं।`,
			quiz: {
				question: "आप `json_schema` के साथ `response_format` ऐसे मॉडल को भेजते हैं जिसके प्रदाता संरचित आउटपुट का समर्थन नहीं करते। क्या होता है?",
				options: [
					"Phaseo `response_format` हटा देता है और सादा टेक्स्ट लौटाता है",
					"Phaseo फिर भी अनुरोध भेजता है और मॉडल ढाँचे का अनुमान लगाता है",
					"अनुरोध `400 validation_error` के साथ विफल होता है",
				],
				answer: 2,
				explanation:
					"`response_format` कभी नहीं हटाया जाता। Phaseo schema वाले अनुरोध को सिर्फ़ संरचित आउटपुट का समर्थन करने वाले प्रदाताओं पर रूट करता है, और मॉडल के पास कोई न हो तो 400 लौटाता है।",
			},
			scenario: {
				prompt:
					"आपका इनवॉइस पार्सर `json_schema` इस्तेमाल करता है, और कभी-कभी जवाब आपकी Zod जाँच में विफल होता है क्योंकि `total` गायब होता है। कोड को क्या करना चाहिए?",
				answer:
					"पहले जाँचें कि `finish_reason` का मान `stop` है, क्योंकि कटा हुआ जवाब मान्य नहीं हो सकता। फिर प्रॉम्प्ट में जाँच की त्रुटि के साथ एक बार दोबारा कोशिश करें, और फिर विफल हो तो अनुमान लगाने के बजाय सुरक्षित विफलता लौटाएँ। हर मॉडल और schema वर्शन के हिसाब से विफलताओं को ट्रैक करें ताकि किसी के भी बदलने पर चीज़ें बिगड़ें तो आपको पता चले।",
			},
			takeaway:
				"तय ढाँचे में चाहिए डेटा के लिए `json_schema` इस्तेमाल करें, और नतीजे पर भरोसा करने से पहले हमेशा अपने कोड में उसकी जाँच करें।",
			links: [
				{ label: "संरचित आउटपुट", href: "https://phaseo.app/docs/v1/guides/structured-outputs" },
				{ label: "पैरामीटर: response_format", href: "https://phaseo.app/docs/v1/api-reference/parameters" },
				{ label: "JSON के लिए रिस्पॉन्स हीलिंग", href: "https://phaseo.app/docs/v1/cookbook/response-healing-for-structured-json" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "send-images-and-audio",
			title: "इमेज और ऑडियो भेजें",
			summary: "अनुरोध में इमेज, फ़ाइलें और ऑडियो जोड़ें, जो आउटपुट चाहिए उसके लिए एंडपॉइंट चुनें, और हर इनपुट स्वीकार करने वाले मॉडल ढूँढें।",
			minutes: 9,
			body: `टेक्स्ट एंडपॉइंट पर किसी संदेश की \`content\` स्ट्रिंग के बजाय हिस्सों की सूची हो सकती है। इमेज वाला हिस्सा एक HTTP(S) URL या base64 \`data:\` URI लेता है:

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

दूसरे इनपुट हिस्से भी इसी तरह काम करते हैं। \`input_audio\` base64 ऑडियो \`data\` को \`wav\` या \`mp3\` जैसे \`format\` के साथ भेजता है। \`file\` हिस्सा PDF जैसा कोई दस्तावेज़ भेजता है, या तो \`file_data\` में base64 data URL के रूप में या \`file_id\` के रूप में। \`file_id\` सिर्फ़ वही प्रदाता खाता पढ़ सकता है जिसने उसे जारी किया, इसलिए उस प्रदाता को पिन करें या उसकी जगह डेटा भेजें।

दूसरी तरह के आउटपुट के लिए उसका एंडपॉइंट इस्तेमाल करें:

| आपको चाहिए | एंडपॉइंट |
| --- | --- |
| टेक्स्ट से बोली | \`/v1/audio/speech\` |
| बोली से टेक्स्ट | \`/v1/audio/transcriptions\` (अंग्रेज़ी के लिए \`/v1/audio/translations\`) |
| इमेज | \`/v1/images/generations\`, \`/v1/images/edits\` |
| दस्तावेज़ की इमेज से टेक्स्ट और लेआउट | \`/v1/ocr\`, \`/v1/parse\` |

\`/v1/parse\` हर अनुरोध में एक इमेज लेता है और PDF स्वीकार नहीं करता, इसलिए पहले हर पेज को इमेज में बदलें।

हर मॉडल हर इनपुट नहीं लेता। Phaseo सिर्फ़ उन प्रदाताओं पर रूट करता है जो आपके अनुरोध के इनपुट स्वीकार करते हैं; कोई न करे, तो आपको \`400 unsupported_modalities\` मिलता है। पहले जाँच लें: \`GET /v1/models\` में हर मॉडल \`modalities.input\` बताता है, और आप \`input_types=image\` से फ़िल्टर कर सकते हैं। [मॉडल](https://phaseo.app/models) पेज पर इनपुट और आउटपुट मोडैलिटी फ़िल्टर इस्तेमाल करें।`,
			quiz: {
				question: "आपको इमेज इनपुट स्वीकार करने वाले मॉडल की सूची चाहिए। सबसे तेज़ भरोसेमंद जाँच क्या है?",
				options: [
					"`GET /v1/models?input_types=image` कॉल करें",
					"हर मॉडल को एक इमेज भेजें और देखें कि किसमें त्रुटि नहीं आती",
					"कोई भी मॉडल चुनें जिसके नाम में \"vision\" हो",
				],
				answer: 0,
				explanation:
					"`GET /v1/models` `input_types` (उपनाम `input_modalities`) से फ़िल्टर करता है, और हर मॉडल `modalities.input` बताता है। मॉडल पेज पर भी यही फ़िल्टर हैं। आज़माकर देखने में पैसे लगते हैं, और नाम से यह पता नहीं चलता कि कोई रूट क्या स्वीकार करता है।",
			},
			scenario: {
				prompt:
					"आपका रसीद वाला फ़ीचर एक फ़ोटो सिर्फ़-टेक्स्ट मॉडल को भेजता है और `400 unsupported_modalities` पाता है। प्रोडक्ट मैनेजर पूछते हैं कि क्या Phaseo डाउन है। आप उन्हें क्या बताएँगे, और क्या बदलेंगे?",
				answer:
					"Phaseo डाउन नहीं है: उस मॉडल का कोई रूट इमेज इनपुट स्वीकार नहीं करता। ऐसा मॉडल चुनें जिसके `modalities.input` में `image` हो (`GET /v1/models` को `input_types=image` से फ़िल्टर करें, या मॉडल पेज का फ़िल्टर इस्तेमाल करें) और वही अनुरोध उसे भेजें।",
			},
			takeaway:
				"इमेज, ऑडियो और फ़ाइलें content हिस्सों के रूप में भेजें, बोली, ट्रांसक्रिप्शन और इमेज के लिए खास एंडपॉइंट इस्तेमाल करें, और किसी मॉडल पर भरोसा करने से पहले उसकी इनपुट मोडैलिटी जाँचें।",
			links: [
				{ label: "मल्टीमोडैलिटी", href: "https://phaseo.app/docs/v1/guides/multimodality" },
				{ label: "मॉडल की सूची", href: "https://phaseo.app/docs/v1/api-reference/endpoint/models" },
				{ label: "दस्तावेज़ की इमेज पार्स करें", href: "https://phaseo.app/docs/v1/guides/document-parsing" },
				{ label: "मॉडल देखें", href: "https://phaseo.app/docs/v1/exploring/models" },
			],
			updated: "2026-11-17",
		},
	],
};
