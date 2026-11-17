import type { LearnCourse } from "../../types";

export const routingCourse: LearnCourse = {
	slug: "routing-and-presets",
	title: "ルーティングとフォールバックを制御する",
	summary:
		"リクエストを処理するプロバイダーを選び、フォールバックモデルを追加し、共通の設定をプリセットに保存します。",
	level: "developer",
	format: "言語を問わない",
	prerequisites: ["最初のリクエストを送る"],
	lessons: [
		{
			slug: "route-across-providers",
			title: "プロバイダー間でルーティングする",
			summary: "プロバイダーを順位付け、制限、固定し、失敗したときのフォールバックモデルを指定します。",
			minutes: 10,
			body: `ほとんどのモデルは、複数のプロバイダーが提供しています。Phaseo はリクエストごとに、ルールで許可されたプロバイダーを残し、順位付けして、最適なものを呼び出します。そのプロバイダーが失敗した場合は、次のプロバイダーを試します。既定の順位付け \`balanced\` は、成功した回答あたりのコストを評価します。

これは \`provider\` オブジェクトで調整します（\`routing\` も別名として使えます）。

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

- \`order\` は優先する順番を指定します。\`only\` と \`ignore\` はプロバイダーを許可またはブロックします。
- \`sort\` は \`price\`、\`latency\`、\`throughput\` のいずれかで順位付けします。モデルのサフィックス \`:cheap\`、\`:fast\`、\`:nitro\` も同じ働きをし、\`sort\` より優先されます。
- \`max_price\` は価格の上限を設定します。\`required_execution_region\`、\`required_data_region\`、\`require_zero_data_retention\` は、データをどこでどう扱うかを制限します。

クロスプロバイダーのフォールバックなしで 1 つのプロバイダーに固定するには、\`baseten:thinking-machines/inkling-small\` のように、モデル ID の前にプロバイダーを付けます。リクエスト全体をリージョンでルーティングしたい場合は、テキストのリクエストを \`eu.api.phaseo.app\` または \`us.api.phaseo.app\` に送ってください。

ほかのモデルにフォールバックするには、\`models\` にそれらを指定します。Phaseo はまず \`model\` を試し、次に各エントリーを順番に試しますが、前のモデルが \`429\`、\`500\`、\`502\`、\`503\`、\`504\` で終わった場合に限ります。\`400\`、\`401\`、\`402\` などのエラーはすぐに返されます。各試行は別々のリクエストとして課金され、レスポンスの \`model\` フィールドには回答したモデルが示されます。ストリームがフォールバックするのは、最初のバイトが届く前だけです。`,
			quiz: {
				question: "`\"model\": \"openai/gpt-6-astra\"` と `\"models\": [\"anthropic/claude-sonnet-5.5\"]` を送りました。最初のモデルが `400 validation_error` を返します。どうなりますか？",
				options: [
					"Phaseo はすぐに 400 を返し、フォールバックは試さない",
					"Phaseo は `anthropic/claude-sonnet-5.5` でリクエストを再試行する",
					"Phaseo は同じモデルを別のプロバイダーで再試行し、その後フォールバックを試す",
				],
				answer: 0,
				explanation:
					"フォールバックモデルが試されるのは、429、500、502、503、504 の後だけです。400 はリクエスト自体の問題なので、すぐに返されます。別のモデルでも同じように拒否されるはずです。",
			},
			scenario: {
				prompt:
					"法務チームから、顧客のプロンプトはゼロデータ保持を満たすプロバイダーにだけ送ること、そして特定の 1 つのプロバイダーには決して送らないことを求められました。プロバイダーを 1 つに固定したくはありません。何を送りますか？",
				answer:
					"Phaseo がプロバイダー間でフォールバックできるようにモデル ID はそのままにし、`\"provider\": { \"require_zero_data_retention\": true, \"ignore\": [\"<provider-id>\"] }` を追加します。`provider:model` で固定すると、クロスプロバイダーのフォールバックが無効になってしまうので、ここでは使いません。",
			},
			takeaway:
				"プロバイダーの順位付けと制限には `provider` を、1 つに固定するには `provider:` プレフィックスを、再試行可能なエラーでほかのモデルにフォールバックするには `models` を使います。",
			links: [
				{ label: "ルーティングとフォールバック", href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks" },
				{ label: "プロバイダーのパラメーター", href: "https://phaseo.app/docs/v1/api-reference/parameters" },
				{ label: "プロバイダー指定のモデル ID", href: "https://phaseo.app/docs/v1/guides/provider-qualified-models" },
				{ label: "リージョンルーティング", href: "https://phaseo.app/docs/v1/guides/regional-routing" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "use-a-preset",
			title: "プリセットを使う",
			summary: "モデル、プロンプト、ルーティングルールを 1 つの名前で保存し、どのアプリからでも呼び出します。",
			minutes: 7,
			body: `プリセットは、1 つの用途に使うモデル、システムプロンプト、パラメーター、プロバイダーのルールを、\`@support-triage\` のような名前で保存したものです。呼び出す側は、その名前を \`model\` として送り、入力だけを渡します。Phaseo はプロバイダーを選ぶ前に残りを埋めます。プリセットは **設定 -> プリセット** で作成するか、管理キーを使って \`POST /v1/presets\` で作成します。

\`\`\`bash
curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "@support-triage",
    "input": "Customer says the invoice total is wrong."
  }'
\`\`\`

\`preset\` という別のフィールドはありません。\`@support-triage@v3\` でバージョンを指定するか、\`@support-triage@production\` でラベルに従うようにすれば、ラベルを移動するだけでロールバックできます。

リクエストとプリセットの両方が同じ項目を設定している場合は、次のルールで決まります。

- **パラメーターは空きを埋めます。** プリセットの既定値は、リクエストが省略したフィールドにだけ適用されます。リクエストの値が常に優先されます。
- **システムプロンプトは重なります。** プリセットのプロンプトが先に、その後にリクエスト自身のプロンプトが続きます。
- **リクエストのプロバイダー設定が優先されます。** リクエストの \`provider.order\` や \`provider.max_price\` は、そのフィールドについてプリセットの値を置き換えます。
- **許可リストは絞り込むだけで、広げることはありません。** プリセットの許可モデル以外のモデルは \`validation_error\` で失敗し、別のルートには回されません。`,
			quiz: {
				question: "プリセットで `temperature` を 0.2 に設定しています。リクエストが `\"model\": \"@support-triage\"` と `\"temperature\": 0.8` を送ります。どちらの値が使われますか？",
				options: [
					"0.2。プリセットはパラメーターを固定するため",
					"0.8。リクエストの値が常に優先されるため",
					"0.5。Phaseo が 2 つの値を平均するため",
				],
				answer: 1,
				explanation:
					"プリセットの既定のパラメーターは、リクエストが省略したフィールドだけを埋めます。リクエストが値を設定していれば、リクエストが優先されます。",
			},
			scenario: {
				prompt:
					"3 つのサービスが、コピー＆ペーストしたプロンプトとプロバイダーのルールで、同じサポート用モデルを呼び出しています。プロンプトの変更が 1 つのサービスにだけ反映され、ほかには反映されず、回答に差が出ています。再発を防ぐにはどうしますか？",
				answer:
					"共通のモデル、システムプロンプト、プロバイダーのルールを 1 つのプリセットにまとめ、すべてのサービスが `\"model\": \"@support-triage@production\"` を送るようにします。変更は新しいバージョンとして公開し、`production` ラベルを移動して展開します。ロールバックするときはラベルを戻します。",
			},
			takeaway:
				"共通の設定はプリセットにまとめ、`model` で名前を指定して呼び出し、必要な箇所ではリクエストの値でプリセットの既定値を上書きします。",
			links: [
				{ label: "プリセット", href: "https://phaseo.app/docs/v1/guides/presets" },
				{ label: "プロンプトテンプレート", href: "https://phaseo.app/docs/v1/guides/prompt-templates" },
				{ label: "ルーティングとフォールバック", href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks" },
			],
			updated: "2026-11-17",
		},
	],
};
