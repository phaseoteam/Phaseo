import type { LearnCourse } from "../../types";

export const buildFeaturesCourse: LearnCourse = {
	slug: "build-real-features",
	title: "构建真实功能",
	summary: "让模型调用你的函数，返回固定结构的 JSON，并接收图像、文件和音频作为输入。",
	level: "developer",
	format: "任意语言",
	prerequisites: ["发送你的第一个请求"],
	lessons: [
		{
			slug: "call-tools",
			title: "调用工具",
			summary: "描述你的函数，执行模型请求的调用，并把结果发回去，直到它给出回答。",
			minutes: 10,
			body: `在 \`tools\` 中描述你的函数，模型就会用对其中某个函数的调用来回答（例如一次数据库查询），而不是去猜。模型自己从不运行任何东西：由你的应用运行函数并把结果发回去，然后模型再写出最终回答。

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

在 Chat Completions 上，回复带有 \`finish_reason: "tool_calls"\`，助手消息上有一个 \`tool_calls\` 列表，每一项都包含 \`id\`、函数 \`name\` 和 JSON 字符串形式的 \`arguments\`。执行每个调用，然后发送一个后续请求：重复之前的对话、原样附上助手消息，并为每个调用附上一条 \`role: "tool"\` 消息，用 \`tool_call_id\` 对应。同时再次发送 \`tools\`。模型要么给出回答，要么调用另一个工具，你就重复这个过程。在 \`/v1/responses\` 上，调用是一个 \`function_call\` 项，你的结果是一个带有相同 \`call_id\` 的 \`function_call_output\` 项；在 \`/v1/messages\` 上，它们是 \`tool_use\` 和 \`tool_result\` 块。

\`tool_choice\` 控制模型是否可以调用工具：\`none\` 表示只输出文本，\`auto\`（或不设置）表示由模型决定，\`required\` 表示强制调用，也可以用一个对象指定某个工具。当你的工具必须一次只运行一个时，把 \`parallel_tool_calls\` 设为 \`false\`。

把每个调用都当作不可信的输入。根据允许列表检查工具名称，拒绝未知名称，并在运行任何东西之前验证解析后的参数。如果验证失败，不要运行工具：把一条简短的错误作为工具结果发回去，让模型重试。使用 \`stream: true\` 时，先收集完所有参数增量再解析。类型以 \`phaseo:\` 开头的工具（例如 \`phaseo:web_search\` 或 \`phaseo:datetime\`）在 Phaseo 端运行，所以你无需编写执行器就能拿到最终回答。这些服务器工具目前处于 **Beta** 阶段。`,
			quiz: {
				question: "模型返回了一个对 `delete_user` 的调用，参数为 `{\"id\": \"42\"}`。你的应用只定义了 `get_weather`。你的代码应该怎么做？",
				options: [
					"运行它，因为这是模型根据对话选择的",
					"作为未知工具拒绝它，并把一条简短的错误作为工具结果发回去",
					"让 Phaseo 用 `phaseo:` 前缀来运行它",
				],
				answer: 1,
				explanation:
					"安全指南要求拒绝未知的工具名称，而不是去猜模型的意图，并发回一条受控的错误，而不是运行任何东西。`phaseo:` 工具是 Phaseo 提供的一组固定工具，不是运行你自己函数的方式。",
			},
			scenario: {
				prompt:
					"你的客服机器人调用 `get_order`，然后给出回答。一位同事写的循环在后续请求中只发送了 `role: \"tool\"` 消息，结果被提供商拒绝了。缺了什么？",
				answer:
					"后续请求必须先重复之前的对话，然后原样附上带有 `tool_calls` 的助手消息，再为每个调用附上一条带有对应 `tool_call_id` 的 `role: \"tool\"` 消息。同时也要再次发送 `tools`。前面没有调用的工具结果无从对应。",
			},
			takeaway: "模型提出请求，你的应用验证并执行调用，然后带着调用 ID 把结果发回去，直到模型给出最终回答。",
			links: [
				{ label: "工具调用", href: "https://phaseo.app/docs/v1/guides/tool-calling" },
				{ label: "工具调用模式", href: "https://phaseo.app/docs/v1/guides/tool-calling-patterns" },
				{ label: "工具调用安全", href: "https://phaseo.app/docs/v1/guides/tool-calling-safety" },
				{ label: "服务器工具", href: "https://phaseo.app/docs/v1/guides/server-tools" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "get-structured-output",
			title: "获取结构化输出",
			summary: "发送一个 JSON Schema，让模型按你的结构返回 JSON，并在使用前先验证它。",
			minutes: 8,
			body: `随请求发送一个 JSON Schema，模型就会返回该结构的 JSON，而不是自由文本。当你想要拿回数据时使用它，例如从电子邮件中提取的字段。当你想让模型请求你的应用去做某件事时，使用工具调用。

| \`type\` | 你得到什么 |
| --- | --- |
| \`json_schema\` | 遵循你的 schema 的 JSON。默认使用这个。 |
| \`json_object\` | 某个有效的 JSON 对象，不强制结构。 |
| \`text\` | 纯文本（默认值）。 |

格式在 \`/v1/chat/completions\` 上放在 \`response_format\` 中，在 \`/v1/responses\` 上放在 \`text.format\` 中，在 \`/v1/messages\` 上放在 \`output_config.format\` 中（仅支持 \`json_schema\`）。

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

JSON 会以字符串形式出现在消息内容中。解析之前，先检查是否有拒绝回答、内容缺失，或 \`finish_reason\` 不是 \`stop\` 的情况。然后验证解析后的对象，例如使用 Zod。如果验证失败，把错误放进提示词重试一次，然后返回一个安全的失败结果。每次重试都会计费，而且有效的 JSON 也不能证明其中的值是正确的。

Phaseo 从不丢弃 \`response_format\`。它只会把 \`json_schema\` 请求路由到支持结构化输出的提供商；如果该模型的所有提供商都不支持，请求会以 \`400 validation_error\` 失败。模型页面用 \`structured_outputs\` 标示是否支持，这是一个能力标记，而不是请求字段。`,
			quiz: {
				question: "你向一个其提供商都不支持结构化输出的模型发送了带 `json_schema` 的 `response_format`。会发生什么？",
				options: [
					"Phaseo 丢弃 `response_format` 并返回纯文本",
					"Phaseo 照样发送请求，由模型去猜结构",
					"请求以 `400 validation_error` 失败",
				],
				answer: 2,
				explanation:
					"`response_format` 从不会被丢弃。Phaseo 只会把带 schema 的请求路由到支持结构化输出的提供商，如果该模型没有这样的提供商，就返回 400。",
			},
			scenario: {
				prompt: "你的发票解析器使用 `json_schema`，偶尔回复会因为缺少 `total` 而无法通过 Zod 检查。代码应该怎么做？",
				answer:
					"先检查 `finish_reason` 是否为 `stop`，因为被截断的回答不可能有效。然后把验证错误放进提示词重试一次，如果仍然失败，就返回一个安全的失败结果，而不是去猜。按模型和 schema 版本跟踪失败情况，这样当其中任何一个变化导致情况变差时你能及时发现。",
			},
			takeaway: "需要固定结构的数据时使用 `json_schema`，并且在信任结果之前始终用你自己的代码验证它。",
			links: [
				{ label: "结构化输出", href: "https://phaseo.app/docs/v1/guides/structured-outputs" },
				{ label: "参数：response_format", href: "https://phaseo.app/docs/v1/api-reference/parameters" },
				{ label: "修复 JSON 响应", href: "https://phaseo.app/docs/v1/cookbook/response-healing-for-structured-json" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "send-images-and-audio",
			title: "发送图像和音频",
			summary: "在请求中加入图像、文件和音频，为想要的输出选择合适的端点，并找到接受各类输入的模型。",
			minutes: 9,
			body: `在文本端点上，消息的 \`content\` 可以是一个由多个部分组成的列表，而不是一个字符串。图像部分接受 HTTP(S) URL 或 base64 \`data:\` URI：

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

其他输入部分遵循同样的模式。\`input_audio\` 发送 base64 音频 \`data\`，并带有 \`wav\` 或 \`mp3\` 等 \`format\`。\`file\` 部分用于发送 PDF 等文档，可以是 \`file_data\` 中的 base64 data URL，也可以是一个 \`file_id\`。\`file_id\` 只能被签发它的提供商账户读取，所以要么固定使用那个提供商，要么改为直接发送数据。

对于其他类型的输出，请使用对应的端点：

| 你想要 | 端点 |
| --- | --- |
| 从文本生成语音 | \`/v1/audio/speech\` |
| 从语音转写文本 | \`/v1/audio/transcriptions\`（翻译成英文用 \`/v1/audio/translations\`） |
| 图像 | \`/v1/images/generations\`、\`/v1/images/edits\` |
| 从文档图像中提取文本和版式 | \`/v1/ocr\`、\`/v1/parse\` |

\`/v1/parse\` 每个请求只接受一张图像，并且不接受 PDF，所以要先把每一页转换成图像。

并不是每个模型都接受所有输入。Phaseo 只会路由到能接受你请求中输入的提供商；如果没有这样的提供商，你会收到 \`400 unsupported_modalities\`。请先检查：\`GET /v1/models\` 中的每个模型都列出了 \`modalities.input\`，你可以用 \`input_types=image\` 进行筛选。在 [模型](https://phaseo.app/models) 页面上，使用输入和输出模态筛选器。`,
			quiz: {
				question: "你需要一份接受图像输入的模型列表。最快且可靠的检查方法是什么？",
				options: [
					"调用 `GET /v1/models?input_types=image`",
					"给每个模型发送一张图像，看哪些不报错",
					"随便挑一个名称中带有“vision”的模型",
				],
				answer: 0,
				explanation:
					"`GET /v1/models` 可以按 `input_types`（别名 `input_modalities`）筛选，每个模型都列出了 `modalities.input`。模型页面也有同样的筛选器。逐个试错要花钱，而名称并不能告诉你某条路由接受什么。",
			},
			scenario: {
				prompt:
					"你的收据功能把一张照片发送给一个纯文本模型，收到了 `400 unsupported_modalities`。产品经理问是不是 Phaseo 宕机了。你怎么回答，又要改什么？",
				answer:
					"Phaseo 没有宕机：该模型没有任何路由接受图像输入。选择一个 `modalities.input` 包含 `image` 的模型（用 `input_types=image` 筛选 `GET /v1/models`，或使用模型页面的筛选器），然后把同样的请求发送给它。",
			},
			takeaway: "把图像、音频和文件作为内容部分发送，语音、转写和图像使用专用端点，在依赖某个模型之前先检查它的输入模态。",
			links: [
				{ label: "多模态", href: "https://phaseo.app/docs/v1/guides/multimodality" },
				{ label: "列出模型", href: "https://phaseo.app/docs/v1/api-reference/endpoint/models" },
				{ label: "解析文档图像", href: "https://phaseo.app/docs/v1/guides/document-parsing" },
				{ label: "浏览模型", href: "https://phaseo.app/docs/v1/exploring/models" },
			],
			updated: "2026-11-17",
		},
	],
};
