import type { LearnCourse } from "../../types";

export const agentsCourse: LearnCourse = {
	slug: "phaseo-in-your-coding-agent",
	title: "コーディングエージェントで Phaseo を使う",
	summary:
		"コーディングエージェントに Phaseo のスキル、ドキュメント、ツールを渡し、プロジェクトを作りながら Phaseo を教えてもらいます。",
	level: "beginner",
	format: "コード不要",
	prerequisites: ["Phaseo とは？"],
	lessons: [
		{
			slug: "connect-your-agent",
			title: "エージェントを接続する",
			summary:
				"正しいコードを書けるように Phaseo のスキルとドキュメントを、MCP でライブデータを、CLI で Phaseo のモデルをエージェントに渡します。",
			minutes: 8,
			body: `Claude Code、Codex、Cursor などのコーディングエージェントは、3 つの別々の方法で Phaseo と連携できます。必要なものを選んでください。

**1. Phaseo を教える。** エージェントスキルは、エージェントが正しい Phaseo のコードを書けるようにする指示です。Gateway、SDK、プリセット、ルーティング、移行を扱います。次のコマンドでインストールします。

\`\`\`bash
npx skills add https://phaseo.app/docs
\`\`\`

セッション中に最新のドキュメントを読めるようにするには、Docs MCP サーバー \`https://phaseo.app/docs/mcp\` を追加します。ドキュメントを読むだけで、アカウントには一切触れません。

**2. Phaseo のライブデータを渡す。** Phaseo MCP サーバー \`https://mcp.phaseo.app/mcp\` を使うと、エージェントがモデル、価格、プロバイダー、クレジット、使用量、リクエストログを調べられます。読み取り専用で、プロンプト、レスポンス、シークレットの値は決して返しません。ブラウザーで Phaseo にサインインします。Claude Code の場合：

\`\`\`bash
claude mcp add --transport http phaseo https://mcp.phaseo.app/mcp
\`\`\`

次に \`/mcp\` を実行し、\`phaseo\` を選んで **Authenticate** を選びます。エージェントに API キーやワークスペースの設定も管理させたい場合は、\`https://mcp.phaseo.app/mcp?access=manage\` で接続し、不要な権限のチェックを外します。

**3. Phaseo のモデルでエージェントを動かす。** \`npm install -g @phaseo/cli\` で Phaseo CLI をインストールし、\`phaseo login\` を実行してから、\`phaseo claude-code\` や \`phaseo codex\` など、使うエージェント用のコマンドを実行します。CLI はエージェントの接続先を Phaseo にし、月 $100 の支出上限と 90 日の有効期限が付いた専用の API キーを作成します。キーはブラウザーで承認し、上限は **設定 → APIキー** で変更できます。

Claude Code または Codex では、Phaseo プラグインが両方の MCP サーバーとスキルをまとめてインストールします。`,
			quiz: {
				question:
					"?access=manage を付けずに https://mcp.phaseo.app/mcp にエージェントを接続しました。エージェントは何ができますか？",
				options: [
					"モデル、価格、クレジット、リクエストログなど、Phaseo のライブデータを読めます。",
					"ワークスペースの API キーを作成し、クレジットを購入できます。",
					"リクエストログに保存されたプロンプトとレスポンスを読めます。",
				],
				answer: 0,
				explanation:
					"通常の URL は読み取り専用です。変更には manage の URL が必要で、その場合でも MCP はクレジットを購入できません。ツールがプロンプト、レスポンス、シークレットの値を返すことはありません。",
			},
			scenario: {
				prompt:
					"Codex を使っています。ドキュメントに沿った Phaseo のコードを書かせたいうえに、Codex 自体も Phaseo 経由のモデルで動かしたいと考えています。何を設定しますか？",
				answer:
					"2 つの別々の設定です。正しいコードのためには、`npx skills add https://phaseo.app/docs` でスキルをインストールし、最新のドキュメントを読ませたい場合は Docs MCP を追加します。Codex を Phaseo で動かすには、CLI をインストールして `phaseo login`、続けて `phaseo codex` を実行します。これで月 $100 の上限と 90 日の有効期限が付いた Codex 用のキーが作成されます。Codex 用の Phaseo プラグインを使えば、スキルと両方の MCP サーバーを一度にインストールできます。",
			},
			takeaway:
				"スキルと Docs MCP はエージェントに Phaseo を教え、Phaseo MCP はライブデータを渡し、CLI は Phaseo のモデルでエージェントを動かします。",
			links: [
				{
					label: "CLI と MCP",
					href: "https://phaseo.app/docs/v1/developers/cli-and-mcp",
				},
				{
					label: "コーディングエージェント",
					href: "https://phaseo.app/docs/v1/guides/integrations/coding-assistants",
				},
				{
					label: "SKILL.md でコーディングエージェントを設定する",
					href: "https://phaseo.app/docs/v1/cookbook/coding-agents-skill-md",
				},
				{
					label: "エージェントから Phaseo を管理する",
					href: "https://phaseo.app/docs/v1/developers/manage-from-an-agent",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "learn-in-your-agent",
			title: "エージェントで Phaseo を学ぶ",
			summary:
				"コーディングエージェントを、本当に必要なものを作りながら Phaseo を教えてくれる先生にします。",
			minutes: 6,
			body: `\`https://phaseo.app/learn.md\` は、コーディングエージェント向けに書かれたコースです。これを Claude Code、Codex、Cursor など、URL を取得できるエージェントに貼り付けてください。

\`\`\`text
Fetch https://phaseo.app/learn.md and follow it. Teach me Phaseo while we build something I actually need.
\`\`\`

**この後の流れ。** エージェントは、何を作りたいか、あなたの経験、言語とフレームワーク、予算や地域などの制約、そして動いたとどう判断するかを尋ねます。それをミッションとしてまとめ、端から端まで動く最小のバージョンを提案します。コードを書く前に、あなたが計画に同意します。

**各レッスンの進め方。** コードを書くのはエージェントで、決めるのはあなたです。たとえば、どのモデルを使うか、どのエンドポイントを使うか、リクエストが失敗したらどうするかです。エージェントは一度に 1 つの考え方を説明し、変更を書く前に確認し、あなたと一緒に実行してから、理解できたかを確かめる質問をして次に進みます。モデル ID、価格、上限は推測せずに調べます。

**進捗は保存されます。** 保存先はプロジェクト内の \`.phaseo-learn/\` フォルダーです。コース本体、ミッションと計画、あなたの作業スタイルに関するメモ、使ったドキュメントのページ、レッスンごとの記録が入ります。同じプロンプトで新しいセッションを始めると、エージェントはそれらのファイルを読んで、前回の続きから再開します。フォルダーを \`.gitignore\` に追加するかどうかを提案してくるので、どうするかはあなたが決めてください。

始める前に、\`PHASEO_API_KEY\` を自分で設定しておいてください。コースは、チャットにキーを貼り付けるよう決して求めないようエージェントに指示しています。`,
			quiz: {
				question: "コースは、セッション間の進捗をどこに保存しますか？",
				options: [
					"プロジェクト内の .phaseo-learn/ フォルダー。",
					"Phaseo アカウントの「設定」。",
					"どこにも保存しません。セッションは毎回最初から始まります。",
				],
				answer: 0,
				explanation:
					"エージェントはコース、ミッション、メモ、参照資料、レッスンの記録を `.phaseo-learn/` に保存し、各セッションの開始時にそれらを読みます。",
			},
			scenario: {
				prompt:
					"セッションの途中で、あなたが「ok」と言っただけなのに、エージェントが 3 つのファイルを続けて書き、モデルの価格を記憶から答えました。どうすべきですか？",
				answer:
					"どちらも、エージェントがコースから外れているサインです。いったん止めて、`.phaseo-learn/COURSE.md` と `MISSION.md` を読み直し、最後に作ったものについて確認の質問をするよう頼みます。価格は記憶から答えるのではなく、`GET https://api.phaseo.app/v1/models` かモデルのページで調べるよう頼んでください。",
			},
			takeaway:
				"1 つのプロンプトで、エージェントがあなたと一緒にプロジェクトを作りながら Phaseo を教える先生になり、進捗を .phaseo-learn/ に保存します。",
			links: [
				{ label: "エージェント向けのコース", href: "https://phaseo.app/learn.md" },
				{
					label: "クイックスタート",
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
