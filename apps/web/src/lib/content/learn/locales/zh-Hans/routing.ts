import type { LearnCourse } from "../../types";

export const routingCourse: LearnCourse = {
	slug: "routing-and-presets",
	title: "控制路由和回退",
	summary: "选择由哪些提供商处理你的请求，添加回退模型，并把共享设置保存在预设中。",
	level: "developer",
	format: "任意语言",
	prerequisites: ["发送你的第一个请求"],
	lessons: [
		{
			slug: "route-across-providers",
			title: "在提供商之间路由",
			summary: "对提供商进行排序、限制或固定，并列出它们失败时使用的回退模型。",
			minutes: 10,
			body: `大多数模型由多个提供商提供。对于每个请求，Phaseo 会保留你的规则允许的提供商，对它们排序，然后调用最佳的那个。如果它失败，就尝试下一个。默认排序方式 \`balanced\` 以每个成功回答的成本为依据。

用 \`provider\` 对象调整这一过程（也可以使用别名 \`routing\`）：

\`\`\`json
{
  "model": "openai/gpt-5.6-luna",
  "input": "Summarize this changelog.",
  "provider": {
    "order": ["openai", "azure"],
    "sort": "latency",
    "require_zero_data_retention": true
  }
}
\`\`\`

- \`order\` 设置优先顺序；\`only\` 和 \`ignore\` 用于允许或屏蔽提供商。
- \`sort\` 按 \`price\`、\`latency\` 或 \`throughput\` 排序。模型后缀 \`:cheap\`、\`:fast\` 和 \`:nitro\` 作用相同，并且优先于 \`sort\`。
- \`max_price\` 设置价格上限；\`required_execution_region\`、\`required_data_region\` 和 \`require_zero_data_retention\` 限制数据在哪里、以何种方式被处理。

要固定使用某一个提供商且不在提供商之间回退，把它放在模型 ID 前面：\`baseten:thinking-machines/inkling-small\`。如果要让整个请求按区域路由，改为把文本请求发送到 \`eu.api.phaseo.app\` 或 \`us.api.phaseo.app\`。

要回退到其他模型，把它们列在 \`models\` 中。Phaseo 先尝试 \`model\`，然后按顺序尝试每一项，但只有在前一个模型以 \`429\`、\`500\`、\`502\`、\`503\` 或 \`504\` 结束时才会这样做。\`400\`、\`401\` 或 \`402\` 等错误会直接返回。每次尝试都作为单独的请求计费，响应中的 \`model\` 字段会指出作答的模型。流只在发出第一个字节之前才会回退。`,
			quiz: {
				question:
					"你发送了 `\"model\": \"openai/gpt-6-astra\"` 和 `\"models\": [\"anthropic/claude-sonnet-5.5\"]`。第一个模型返回 `400 validation_error`。会发生什么？",
				options: [
					"Phaseo 直接返回 400，不会尝试回退模型",
					"Phaseo 在 `anthropic/claude-sonnet-5.5` 上重试该请求",
					"Phaseo 先在另一个提供商上重试同一模型，然后再尝试回退模型",
				],
				answer: 0,
				explanation:
					"只有在 429、500、502、503 或 504 之后才会尝试回退模型。400 是请求本身的问题，所以会立即返回；换一个模型同样会拒绝它。",
			},
			scenario: {
				prompt:
					"法务团队要求客户的提示词只能发送给满足零数据保留的提供商，并且应用绝不能使用某个特定的提供商。你不想固定使用单一提供商。你应该发送什么？",
				answer:
					"保留普通的模型 ID，这样 Phaseo 仍能在提供商之间回退，并添加 `\"provider\": { \"require_zero_data_retention\": true, \"ignore\": [\"<provider-id>\"] }`。用 `provider:model` 固定提供商会关闭跨提供商回退，这不是你想要的。",
			},
			takeaway: "用 `provider` 对提供商排序和限制，用 `provider:` 前缀固定某个提供商，用 `models` 在可重试错误时回退到其他模型。",
			links: [
				{ label: "路由和回退", href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks" },
				{ label: "提供商参数", href: "https://phaseo.app/docs/v1/api-reference/parameters" },
				{ label: "带提供商限定的模型 ID", href: "https://phaseo.app/docs/v1/guides/provider-qualified-models" },
				{ label: "区域路由", href: "https://phaseo.app/docs/v1/guides/regional-routing" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "use-a-preset",
			title: "使用预设",
			summary: "把模型、提示词和路由规则保存在一个名称下，并在任何应用中调用它。",
			minutes: 7,
			body: `预设会把某项任务的模型、系统提示词、参数和提供商规则保存在一个名称下，例如 \`@support-triage\`。调用方把这个名称作为 \`model\` 发送，只需附上输入。Phaseo 会在选择提供商之前补齐其余内容。在 **设置 -> 预设** 下创建预设，或使用管理密钥调用 \`POST /v1/presets\` 创建。

\`\`\`bash
curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "@support-triage",
    "input": "Customer says the invoice total is wrong."
  }'
\`\`\`

没有单独的 \`preset\` 字段。用 \`@support-triage@v3\` 指定某个版本，或用 \`@support-triage@production\` 跟随某个标签，这样移动标签就能回滚。

当请求和预设都设置了同一项内容时，按以下规则处理：

- **参数用于补缺。** 预设的默认值只作用于请求中没有提供的字段。请求中的值始终优先。
- **系统提示词会叠加。** 预设的提示词在前，然后是请求自己的提示词。
- **请求中的提供商设置优先。** 请求中的 \`provider.order\` 或 \`provider.max_price\` 会替换预设中该字段的值。
- **允许列表只会收窄，不会放宽。** 不在预设允许模型范围内的模型会以 \`validation_error\` 失败，不会被改路由。`,
			quiz: {
				question: "你的预设把 `temperature` 设为 0.2。一个请求发送了 `\"model\": \"@support-triage\"` 和 `\"temperature\": 0.8`。使用哪个值？",
				options: [
					"0.2，因为预设会锁定它的参数",
					"0.8，因为请求中的值始终优先",
					"0.5，因为 Phaseo 会取两个值的平均",
				],
				answer: 1,
				explanation: "预设的默认参数只会补齐请求中没有提供的字段。当请求设置了某个值时，以请求为准。",
			},
			scenario: {
				prompt:
					"三个服务用复制粘贴的提示词和提供商规则调用同一个客服模型。一次提示词修改只发布到了其中一个服务，现在它们的回答不一致。如何防止这种情况再次发生？",
				answer:
					"把共享的模型、系统提示词和提供商规则移到一个预设中，让每个服务都发送 `\"model\": \"@support-triage@production\"`。把更改发布为新版本，移动 `production` 标签来上线，或把它移回去来回滚。",
			},
			takeaway: "把共享设置放进预设，在 `model` 中按名称调用它，需要时让请求中的值覆盖预设的默认值。",
			links: [
				{ label: "预设", href: "https://phaseo.app/docs/v1/guides/presets" },
				{ label: "提示词模板", href: "https://phaseo.app/docs/v1/guides/prompt-templates" },
				{ label: "路由和回退", href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks" },
			],
			updated: "2026-11-17",
		},
	],
};
