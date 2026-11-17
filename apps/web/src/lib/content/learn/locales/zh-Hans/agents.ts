import type { LearnCourse } from "../../types";

export const agentsCourse: LearnCourse = {
	slug: "phaseo-in-your-coding-agent",
	title: "在编程智能体中使用 Phaseo",
	summary: "为你的编程智能体提供 Phaseo 的技能、文档和工具，然后让它一边构建你的项目，一边教你使用 Phaseo。",
	level: "beginner",
	format: "无需代码",
	prerequisites: ["Phaseo 是什么？"],
	lessons: [
		{
			slug: "connect-your-agent",
			title: "连接你的智能体",
			summary: "为智能体提供 Phaseo 技能和文档，让它写出正确的代码；通过 MCP 获取实时数据；通过 CLI 使用 Phaseo 上的模型。",
			minutes: 8,
			body: `Claude Code、Codex 和 Cursor 等编程智能体可以通过三种不同的方式与 Phaseo 配合。按需选择即可。

**1. 教它使用 Phaseo。** 智能体技能是一些说明，帮助你的智能体写出正确的 Phaseo 代码。它们涵盖 Gateway、SDK、预设、路由和迁移。用以下命令安装：

\`\`\`bash
npx skills add https://phaseo.app/docs
\`\`\`

如果想让它在会话中读取最新文档，可以添加文档 MCP 服务器 \`https://phaseo.app/docs/mcp\`。它只读取文档，从不接触你的账户。

**2. 为它提供 Phaseo 实时数据。** Phaseo MCP 服务器 \`https://mcp.phaseo.app/mcp\` 让智能体可以查询模型、价格、提供商、你的额度、用量和请求日志。它是只读的，从不返回提示词、响应或密钥值。你在浏览器中用 Phaseo 登录。在 Claude Code 中：

\`\`\`bash
claude mcp add --transport http phaseo https://mcp.phaseo.app/mcp
\`\`\`

然后运行 \`/mcp\`，选择 \`phaseo\`，再选择 **Authenticate**。如果你也想让智能体管理 API 密钥和工作区设置，请改用 \`https://mcp.phaseo.app/mcp?access=manage\` 连接，并取消勾选你不想授予的权限。

**3. 让智能体在 Phaseo 模型上运行。** 用 \`npm install -g @phaseo/cli\` 安装 Phaseo CLI，运行 \`phaseo login\`，然后运行你的智能体对应的命令，例如 \`phaseo claude-code\` 或 \`phaseo codex\`。CLI 会把智能体指向 Phaseo，并为它创建专用的 API 密钥，每月支出限制为 $100，有效期 90 天。你在浏览器中批准这个密钥，之后可以在 **设置 → API 密钥** 中更改它的限制。

在 Claude Code 或 Codex 上，Phaseo 插件可以一次性安装两个 MCP 服务器和这些技能。`,
			quiz: {
				question: "你在不带 ?access=manage 的情况下把智能体连接到 https://mcp.phaseo.app/mcp。它能做什么？",
				options: [
					"读取 Phaseo 的实时数据，例如模型、价格、额度和请求日志。",
					"为你的工作区创建 API 密钥并购买额度。",
					"读取请求日志中保存的提示词和响应。",
				],
				answer: 0,
				explanation:
					"不带参数的 URL 是只读的。要做更改需要使用 manage URL，即便如此，MCP 也不能购买额度。它的工具从不返回提示词、响应或密钥值。",
			},
			scenario: {
				prompt:
					"你在用 Codex。你希望它写出符合文档的 Phaseo 代码，同时也希望 Codex 本身通过 Phaseo 使用模型。你需要设置什么？",
				answer:
					"这是两件不同的事。为了写出正确的代码，用 `npx skills add https://phaseo.app/docs` 安装技能；如果想让它读取最新文档，再添加文档 MCP。要让 Codex 在 Phaseo 上运行，安装 CLI，运行 `phaseo login`，然后运行 `phaseo codex`，它会为 Codex 创建一个每月限额 $100、有效期 90 天的密钥。Codex 的 Phaseo 插件可以一次性安装技能和两个 MCP 服务器。",
			},
			takeaway: "技能和文档 MCP 教你的智能体使用 Phaseo，Phaseo MCP 为它提供实时数据，CLI 让它在 Phaseo 模型上运行。",
			links: [
				{
					label: "CLI 和 MCP",
					href: "https://phaseo.app/docs/v1/developers/cli-and-mcp",
				},
				{
					label: "编程智能体",
					href: "https://phaseo.app/docs/v1/guides/integrations/coding-assistants",
				},
				{
					label: "用 SKILL.md 设置编程智能体",
					href: "https://phaseo.app/docs/v1/cookbook/coding-agents-skill-md",
				},
				{
					label: "通过智能体管理 Phaseo",
					href: "https://phaseo.app/docs/v1/developers/manage-from-an-agent",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "learn-in-your-agent",
			title: "在智能体中学习 Phaseo",
			summary: "把你的编程智能体变成导师，让它在构建你真正需要的东西时教你使用 Phaseo。",
			minutes: 6,
			body: `\`https://phaseo.app/learn.md\` 是一门为你的编程智能体编写的课程。把下面这段话粘贴到 Claude Code、Codex、Cursor 或任何能获取 URL 的智能体中：

\`\`\`text
获取 https://phaseo.app/learn.md 并按其中的说明操作。在我们一起构建我真正需要的东西时，教我使用 Phaseo。
\`\`\`

**接下来会发生什么。** 智能体会问你想构建什么、你的经验、你使用的语言和框架、预算或区域等限制，以及你如何判断它能正常工作。它会把这些整理成一份任务说明，然后提出一个能端到端运行的最小版本。你同意计划之后，它才会开始写代码。

**每节课如何进行。** 智能体写代码；你做决定，例如用哪个模型、用哪个端点，以及请求失败时怎么办。它一次只讲一个概念，在写入更改前先征求你的同意，和你一起运行代码，然后问你一个问题确认你理解了，再继续下一步。它会去查询模型 ID、价格和限制，而不是靠猜。

**你的进度会保存** 在项目中的 \`.phaseo-learn/\` 文件夹里：课程本身、你的任务和计划、关于你工作偏好的笔记、用到的文档页面，以及每节课的一份记录。用同样的提示词开始新会话，智能体就会读取这些文件，从你上次停下的地方继续。它会提议把这个文件夹加入 \`.gitignore\`，加不加由你决定。

开始之前，请自己设置好 \`PHASEO_API_KEY\`。课程会要求智能体永远不要让你把密钥粘贴到聊天中。`,
			quiz: {
				question: "课程在会话之间把你的进度保存在哪里？",
				options: ["项目中的 .phaseo-learn/ 文件夹里。", "你的 Phaseo 账户中，在“设置”下。", "不保存：每次会话都从头开始。"],
				answer: 0,
				explanation: "智能体会把课程、你的任务、笔记、资料和每节课的记录保存在 `.phaseo-learn/` 中，并在每次会话开始时读取它们。",
			},
			scenario: {
				prompt: "会话进行到一半，你只说了一句“ok”，智能体就连续写了三个文件，还凭记忆报出了一个模型价格。你该怎么做？",
				answer:
					"这两点都说明智能体已经偏离了课程。让它停下来，重新阅读 `.phaseo-learn/COURSE.md` 和 `MISSION.md`，并就它最后构建的内容问你一个检查问题。让它通过 `GET https://api.phaseo.app/v1/models` 或模型页面查询价格，而不是凭记忆报价。",
			},
			takeaway: "一条提示词就能把你的智能体变成 Phaseo 导师，它和你一起构建项目，并把进度保存在 .phaseo-learn/ 中。",
			links: [
				{ label: "为你的智能体准备的课程", href: "https://phaseo.app/learn.md" },
				{
					label: "快速入门",
					href: "https://phaseo.app/docs/v1/quickstart",
				},
				{
					label: "文档 MCP",
					href: "https://phaseo.app/docs/v1/guides/integrations/docs-mcp",
				},
			],
			updated: "2026-11-17",
		},
	],
};
