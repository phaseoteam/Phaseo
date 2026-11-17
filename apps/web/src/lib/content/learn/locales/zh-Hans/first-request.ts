import type { LearnCourse } from "../../types";

export const firstRequestCourse: LearnCourse = {
	slug: "make-your-first-request",
	title: "发送你的第一个请求",
	summary: "向 Phaseo API 发送请求，读取返回结果，处理错误，并以流式方式接收回复。",
	level: "developer",
	format: "任意语言",
	prerequisites: ["Phaseo 是什么？", "能用任意一种语言发送 HTTP 请求"],
	lessons: [
		{
			slug: "make-a-request",
			title: "发送请求",
			summary: "把你的 API 密钥、模型 ID 和输入发送到一个兼容 OpenAI 的端点。",
			minutes: 7,
			body: `每个请求都发送到 \`https://api.phaseo.app/v1\`，并把你的 API 密钥作为 bearer 令牌携带：\`Authorization: Bearer phaseo_v1_sk_...\`。在 **设置 -> API 密钥** 下创建密钥。它只显示一次，所以请把它保存在 \`PHASEO_API_KEY\` 等环境变量中，并只在服务端代码中使用。

\`POST /v1/responses\` 是新文本工作的推荐端点。你发送一个 \`model\` 和一个 \`input\`：

\`\`\`bash
curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "input": "Reply with: quickstart works"
  }'
\`\`\`

已经在用 OpenAI 官方 SDK？只需改三处：API 密钥、基础 URL 和模型 ID。

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

调用 Chat Completions 的代码也可以使用同一个客户端：改为把 \`messages\` 发送给 \`client.chat.completions.create\` 即可。

模型 ID 总是带有提供商前缀，例如 \`openai/\`、\`anthropic/\` 或 \`google/\`。要切换模型，只需更改 \`model\` 字符串，请求的其余部分保持不变。用 \`GET /v1/models\` 列出有效的 ID，不要靠猜。\`phaseo/free\` 会选择一个可用的免费模型，无需额度即可使用，很适合做第一次测试。`,
			quiz: {
				question: "你把 OpenAI 官方 SDK 指向 Phaseo。需要做哪些更改？",
				options: [
					"API 密钥、基础 URL 和模型 ID",
					"只改基础 URL；SDK 继续使用你的 OpenAI 密钥",
					"一个用于指定提供商的 Phaseo 专用请求字段，外加基础 URL",
				],
				answer: 0,
				explanation:
					"文档列出的正好是三处更改：你的 Phaseo API 密钥、基础 URL https://api.phaseo.app/v1，以及带提供商前缀的 Phaseo 模型 ID。你的 OpenAI 密钥在 Phaseo 上不起作用，而提供商是模型 ID 的一部分，不是单独的字段。",
			},
			scenario: {
				prompt:
					"你的应用发送了 `\"model\": \"gpt-6-astra\"`，请求以 400 失败。一位同事说这个模型肯定宕机了。你首先检查什么？",
				answer:
					"检查模型 ID。Phaseo 的模型 ID 包含提供商前缀，所以应该是 `openai/gpt-6-astra`。400 说明问题出在请求体或模型 ID 上，而不是服务中断。调用 `GET /v1/models` 确认准确的 ID。",
			},
			takeaway: "一个基础 URL、一个 bearer 密钥和一个带提供商前缀的模型 ID 就够了，切换模型只需改一个字符串。",
			links: [
				{ label: "快速入门", href: "https://phaseo.app/docs/v1/quickstart" },
				{ label: "OpenAI SDK", href: "https://phaseo.app/docs/v1/guides/integrations/openai-sdk" },
				{ label: "创建聊天补全", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "read-the-response",
			title: "读取响应",
			summary: "找到回复内容、停止原因、由谁处理以及花了多少钱。",
			minutes: 6,
			body: `Chat Completions 的响应如下所示（数值仅作示例）：

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

- **\`choices[].message.content\`** 包含回复文本。
- **\`finish_reason\`** 说明模型为什么停止：\`stop\`（正常结束）、\`length\`（达到 token 上限）、\`tool_calls\`（它想调用工具）或 \`content_filter\`。
- **\`model\`** 是作答的模型。如果请求由回退模型处理，这里显示的是回退模型，而不是你请求的那个。
- **\`provider\`** 是处理该请求的提供商。
- **\`id\`** 是 Phaseo 请求 ID。请把它记录到日志中：该请求会出现在 **设置 -> 用量 -> 日志** 下，联系支持时也会被要求提供它。

\`usage\` 统计 token 数量，并附带 \`cost\`：该请求以美元计的费用，也就是从你的额度中扣除的金额。在 BYOK 请求中，\`cost_details.upstream_inference_cost\` 显示你自己的提供商密钥被收取的费用；使用 Phaseo 额度时它为 \`null\`。

在 \`/v1/responses\` 上，结构有所不同：文本位于 \`output[].content[]\` 中 \`type\` 为 \`output_text\` 的项里，\`usage\` 使用 \`input_tokens\` 和 \`output_tokens\`。`,
			quiz: {
				question: "Chat Completions 的回复带有 `finish_reason: \"length\"`。发生了什么？",
				options: [
					"提供商中途失败，Phaseo 返回了已有的部分",
					"模型达到了 token 上限，所以回复可能被截断",
					"模型正常结束，回复是完整的",
				],
				answer: 1,
				explanation:
					"`length` 表示模型因达到 token 上限而停止。正常结束是 `stop`。中途失败的提供商会返回错误，而不是带停止原因的部分回复。",
			},
			scenario: {
				prompt: "财务部门问昨天的请求 `G-01J...` 花了多少钱、由哪个提供商处理。你去哪里查？",
				answer:
					"在响应本身中，`usage.cost` 给出以美元计的费用，`provider` 指出由谁处理。如果你没有记录响应体，可以在 **设置 -> 用量 -> 日志** 下按 ID 打开该请求。",
			},
			takeaway: "从 `choices` 中读取回复，检查 `finish_reason`，并在每次调用时记录 `id`、`model`、`provider` 和 `usage.cost`。",
			links: [
				{ label: "创建聊天补全", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
				{ label: "创建响应", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
				{ label: "快速入门：读取回复", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "when-a-request-fails",
			title: "请求失败时",
			summary: "根据错误代码和状态码分别处理，只重试那些稍后可能成功的错误。",
			minutes: 8,
			body: `Phaseo 的所有错误在每个端点上都使用相同的 JSON 响应体。\`error\` 对象的结构就是兼容 OpenAI 的 SDK 已经能读取的格式：

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

根据 \`error.code\` 和 HTTP 状态码分别处理，永远不要依据消息文本。始终记录 \`generation_id\`。

| 状态码 | 常见代码 | 怎么做 |
| --- | --- | --- |
| \`400\` | \`validation_error\`、\`model_required\` | 修正请求。\`error.param\` 会指出是哪个字段。 |
| \`401\` | \`unauthorised\` | 检查密钥和 \`Authorization\` 请求头。 |
| \`402\` | \`insufficient_funds\` | 充值额度，或使用 \`phaseo/free\`。 |
| \`403\` | \`guardrail_blocked\` | 修改请求或护栏。 |
| \`404\` | \`not_found\` | 检查路径和 ID。 |
| \`410\` | \`model_retired\` | 切换到 \`replacement_model\`。 |
| \`429\` | \`rate_limit_exceeded\`、\`key_limit_exceeded\` | 等待 \`Retry-After\` 后重试。 |
| \`5xx\` | \`upstream_error\`、\`gateway_error\` | 退避重试。 |

除 \`429\` 外，不要原样重试 \`4xx\` 错误：它们还会失败。对于 \`429\`，等待 \`Retry-After\`（秒数或 HTTP 日期），或使用带抖动的指数退避。没有 \`Retry-After\` 的 \`key_limit_exceeded\` 不会自行重置，所以不要重试它。只有在重复调用是安全的情况下才重试 \`5xx\`，并设置尝试次数上限和总截止时间。`,
			quiz: {
				question: "你的请求返回 `401`，代码为 `unauthorised`。你的代码应该怎么做？",
				options: [
					"停下来，检查 API 密钥和 `Authorization: Bearer` 请求头",
					"用指数退避重试，直到成功",
					"等待 `Retry-After` 请求头，然后再次发送同一个请求",
				],
				answer: 0,
				explanation:
					"401 表示密钥缺失或无效。重试同一个请求无法解决这个问题。退避适用于 429 和 5xx，而 `Retry-After` 是随 429 一起返回的。",
			},
			scenario: {
				prompt:
					"一个批处理脚本在循环中发送 500 个请求。进行到一半时，响应开始返回 `429`，并带有 `Retry-After: 20` 请求头。你要改什么？",
				answer:
					"让脚本遵守 `Retry-After`：重试前暂停大约 20 秒；如果没有这个请求头，就退回到带抖动的指数退避。同时检查 `error.code`：`rate_limit_exceeded` 会重置，但没有 `Retry-After` 的 `key_limit_exceeded` 不会，重试它毫无意义。",
			},
			takeaway: "根据 `error.code` 和状态码分别处理，修正 4xx 错误，只对 429 和可安全重试的 5xx 错误做退避重试。",
			links: [
				{ label: "错误和调试", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "速率限制", href: "https://phaseo.app/docs/v1/api-reference/limits" },
				{ label: "快速入门：排查问题", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "stream-it",
			title: "流式传输",
			summary: "在回复生成的同时显示它，并区分正常结束的流和中断的流。",
			minutes: 9,
			body: `设置 \`"stream": true\`，Phaseo 就会在模型生成输出的同时，以服务器发送事件（SSE）的形式发送输出：

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

先检查 HTTP 状态码。在流开始之前就失败的请求会收到普通的 JSON 错误，而不是流。然后读取事件。每个端点有自己的格式：

| 端点 | 文本所在位置 | 成功结束 | 失败结束 |
| --- | --- | --- | --- |
| Responses | \`response.output_text.delta\` | \`response.completed\` | \`response.failed\` 或 \`error\` |
| Chat Completions | \`choices[].delta\` | 一个 \`finish_reason\`，然后是 \`[DONE]\` | 一个没有 \`finish_reason\` 的 \`error\` 帧 |

在 Chat Completions 上，\`[DONE]\` 之前会有一个 \`choices\` 为空的最终数据块，其中带有 \`usage\`，包括整个流的 \`cost\`。只有 Chat Completions 会发送 \`[DONE]\`。一个网络数据块可能只包含半个事件，也可能包含多个事件，所以要先缓冲到事件完整后再解析，或者使用 SDK 的流辅助工具。

只有收到成功结束事件，流才算完成。仅仅是连接关闭并不代表回答已经完整。如果中途失败，保留已有的部分文本并标记为已中断，同时提供重试；对于失败的流，Phaseo 不会对已生成的部分输出收费。

要取消，请传入一个 \`AbortSignal\`（或你的 HTTP 客户端中的等价物），并在用户停止时中止。取消并不能保证提供商立即停止，也不能保证已经生成的输出免费。`,
			quiz: {
				question: "你的 Chat Completions 流已经传来了一些文本，然后连接关闭了。你始终没有看到 `finish_reason` 或 `[DONE]`。你该怎么做？",
				options: [
					"视为已完成，因为连接是正常关闭的",
					"把下一次重试得到的回答追加到这段部分文本后面",
					"把回答视为已中断，并提供重试",
				],
				answer: 2,
				explanation:
					"只有收到成功结束事件，流才算完成。没有 `finish_reason` 和 `[DONE]`，回答就不完整。重试可能产生不同的文本，所以应单独显示，而不是追加。",
			},
			scenario: {
				prompt: "用户可以在你的聊天界面中点击 **停止**。你的产品经理认为被停止的回复不花钱。这样对吗？",
				answer:
					"不对。用 `AbortSignal` 中止请求，你的应用就会停止读取，但文档说明取消并不能保证提供商立即停止，也不能保证它已经生成的输出免费。被停止的回复应预期会为已完成的工作计费。",
			},
			takeaway: "等待端点的成功结束事件，其他情况都视为中断，也不要以为取消的流是免费的。",
			links: [
				{ label: "流式传输", href: "https://phaseo.app/docs/v1/guides/streaming" },
				{ label: "流式传输中的错误", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "创建响应", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
			],
			updated: "2026-11-17",
		},
	],
};
