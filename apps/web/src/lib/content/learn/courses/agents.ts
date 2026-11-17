import type { LearnCourse } from "../types";

export const agentsCourse: LearnCourse = {
	slug: "phaseo-in-your-coding-agent",
	title: "Use Phaseo with your coding agent",
	summary:
		"Give your coding agent the Phaseo skills, docs and tools, then let it teach you Phaseo while it builds your project.",
	level: "beginner",
	format: "No code",
	prerequisites: ["What is Phaseo?"],
	lessons: [
		{
			slug: "connect-your-agent",
			title: "Connect your agent",
			summary:
				"Give your agent Phaseo skills and docs so it writes correct code, live data through MCP, and Phaseo models through the CLI.",
			minutes: 8,
			body: `Coding agents like Claude Code, Codex and Cursor can work with Phaseo in three separate ways. Pick the ones you need.

**1. Teach it Phaseo.** Agent skills are instructions that help your agent write correct Phaseo code. They cover the Gateway, the SDKs, presets, routing and migrations. Install them with:

\`\`\`bash
npx skills add https://phaseo.app/docs
\`\`\`

To let it read the current docs during a session, add the Docs MCP server, \`https://phaseo.app/docs/mcp\`. It only reads documentation and never touches your account.

**2. Give it live Phaseo data.** The Phaseo MCP server, \`https://mcp.phaseo.app/mcp\`, lets an agent look up models, prices, providers, your credits, usage and request logs. It is read-only, and it never returns prompts, responses or secret values. You sign in with Phaseo in your browser. In Claude Code:

\`\`\`bash
claude mcp add --transport http phaseo https://mcp.phaseo.app/mcp
\`\`\`

Then run \`/mcp\`, select \`phaseo\` and choose **Authenticate**. If you want the agent to manage API keys and workspace settings too, connect with \`https://mcp.phaseo.app/mcp?access=manage\` and untick any permission you don't want.

**3. Run the agent on Phaseo models.** Install the Phaseo CLI with \`npm install -g @phaseo/cli\`, run \`phaseo login\`, then the command for your agent, such as \`phaseo claude-code\` or \`phaseo codex\`. The CLI points the agent at Phaseo and creates it its own API key with a $100 monthly spend limit and a 90-day expiry. You approve the key in your browser, and you can change its limit under **Settings → API Keys**.

On Claude Code or Codex, the Phaseo plugin installs both MCP servers and the skills in one go.`,
			quiz: {
				question:
					"You connect your agent to https://mcp.phaseo.app/mcp without ?access=manage. What can it do?",
				options: [
					"Read live Phaseo data such as models, prices, credits and request logs.",
					"Create API keys and buy credits for your workspace.",
					"Read the prompts and responses stored in your request logs.",
				],
				answer: 0,
				explanation:
					"The plain URL is read-only. Changes need the manage URL, and even then the MCP can't buy credits. Its tools never return prompts, responses or secret values.",
			},
			scenario: {
				prompt:
					"You use Codex. You want it to write Phaseo code that follows the docs, and you also want Codex itself to run on models through Phaseo. What do you set up?",
				answer:
					"Two separate things. For correct code, install the skills with `npx skills add https://phaseo.app/docs`, and add the Docs MCP if you want it to read the live docs. To run Codex on Phaseo, install the CLI, run `phaseo login`, then `phaseo codex`, which creates a key for Codex with a $100 monthly limit and a 90-day expiry. The Phaseo plugin for Codex can install the skills and both MCP servers at once.",
			},
			takeaway:
				"Skills and the Docs MCP teach your agent Phaseo, the Phaseo MCP gives it live data, and the CLI runs it on Phaseo models.",
			links: [
				{
					label: "CLI and MCP",
					href: "https://phaseo.app/docs/v1/developers/cli-and-mcp",
				},
				{
					label: "Coding agents",
					href: "https://phaseo.app/docs/v1/guides/integrations/coding-assistants",
				},
				{
					label: "Set up coding agents with SKILL.md",
					href: "https://phaseo.app/docs/v1/cookbook/coding-agents-skill-md",
				},
				{
					label: "Manage Phaseo from an agent",
					href: "https://phaseo.app/docs/v1/developers/manage-from-an-agent",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "learn-in-your-agent",
			title: "Learn Phaseo in your agent",
			summary:
				"Turn your coding agent into a tutor that teaches you Phaseo while it builds something you actually need.",
			minutes: 6,
			body: `\`https://phaseo.app/learn.md\` is a course written for your coding agent. Paste this into Claude Code, Codex, Cursor or any agent that can fetch URLs:

\`\`\`text
Fetch https://phaseo.app/learn.md and follow it. Teach me Phaseo while we build something I actually need.
\`\`\`

**What happens next.** The agent asks what you want to build, your experience, your language and framework, any limits such as budget or region, and how you'll know it works. It writes this up as a mission, then proposes the smallest version that works end to end. You agree the plan before it writes any code.

**How each lesson runs.** The agent writes the code; you make the decisions, such as which model, which endpoint, and what to do when a request fails. It explains one idea at a time, asks before it writes a change, runs it with you, then asks you a question to check you understood before moving on. It looks up model IDs, prices and limits instead of guessing them.

**Your progress is saved** in a \`.phaseo-learn/\` folder in your project: the course itself, your mission and plan, notes on how you like to work, the docs pages used, and one record per lesson. Start a new session with the same prompt and the agent reads those files and picks up where you left off. It offers to add the folder to \`.gitignore\`; that's your choice.

Set \`PHASEO_API_KEY\` yourself before you start. The course tells the agent never to ask you to paste a key into the chat.`,
			quiz: {
				question: "Where does the course keep your progress between sessions?",
				options: [
					"In a .phaseo-learn/ folder in your project.",
					"In your Phaseo account, under Settings.",
					"Nowhere: each session starts from the beginning.",
				],
				answer: 0,
				explanation:
					"The agent saves the course, your mission, notes, resources and lesson records in `.phaseo-learn/`, and reads them at the start of each session.",
			},
			scenario: {
				prompt:
					"Halfway through a session, the agent writes three files in a row after you only said \"ok\", and quotes a model price from memory. What should you do?",
				answer:
					"Both are signs the agent has drifted from the course. Ask it to stop, re-read `.phaseo-learn/COURSE.md` and `MISSION.md`, and ask you a check question about the last thing it built. Ask it to look the price up from `GET https://api.phaseo.app/v1/models` or the model's page instead of quoting it from memory.",
			},
			takeaway:
				"One prompt turns your agent into a Phaseo tutor that builds your project with you and saves your progress in .phaseo-learn/.",
			links: [
				{ label: "The course for your agent", href: "https://phaseo.app/learn.md" },
				{
					label: "Quickstart",
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
