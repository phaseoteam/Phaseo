import type { LearnCourse } from "../../types";

export const firstRequestCourse: LearnCourse = {
	slug: "make-your-first-request",
	title: "最初のリクエストを送る",
	summary:
		"Phaseo API にリクエストを送り、返ってきた内容を読み、エラーに対処し、返答をストリーミングします。",
	level: "developer",
	format: "言語を問わない",
	prerequisites: ["Phaseo とは？", "いずれかの言語で HTTP リクエストを送れること"],
	lessons: [
		{
			slug: "make-a-request",
			title: "リクエストを送る",
			summary: "API キー、モデル ID、入力を、1 つの OpenAI 互換エンドポイントに送ります。",
			minutes: 7,
			body: `すべてのリクエストは \`https://api.phaseo.app/v1\` に送り、API キーをベアラートークンとして付けます：\`Authorization: Bearer phaseo_v1_sk_...\`。キーは **設定 -> APIキー** で作成します。一度しか表示されないので、\`PHASEO_API_KEY\` などの環境変数に保存し、サーバー側のコードでだけ使ってください。

新しいテキスト処理には \`POST /v1/responses\` をおすすめします。\`model\` と \`input\` を送ります。

\`\`\`bash
curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "input": "Reply with: quickstart works"
  }'
\`\`\`

すでに OpenAI 公式 SDK を使っていますか？ 変更するのは 3 つだけです。API キー、ベース URL、モデル ID です。

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

Chat Completions を呼び出すコードも、同じクライアントで動きます。代わりに \`client.chat.completions.create\` に \`messages\` を送ってください。

モデル ID には、\`openai/\`、\`anthropic/\`、\`google/\` のように必ずプロバイダーのプレフィックスが付きます。モデルを切り替えるときは \`model\` の文字列だけを変え、リクエストのほかの部分はそのままです。有効な ID は推測せず、\`GET /v1/models\` で一覧を取得してください。\`phaseo/free\` は利用可能な無料モデルを選び、クレジットなしで動作するので、最初のテストに便利です。`,
			quiz: {
				question: "OpenAI 公式 SDK の接続先を Phaseo にします。必要な変更はどれですか？",
				options: [
					"API キー、ベース URL、モデル ID",
					"ベース URL だけ。SDK は OpenAI のキーをそのまま使います",
					"プロバイダーを指定する Phaseo 専用のリクエストフィールドと、ベース URL",
				],
				answer: 0,
				explanation:
					"ドキュメントに書かれている変更はちょうど 3 つです。Phaseo の API キー、ベース URL https://api.phaseo.app/v1、そしてプロバイダーのプレフィックス付きの Phaseo モデル ID です。OpenAI のキーは Phaseo では使えません。また、プロバイダーは別のフィールドではなくモデル ID の一部です。",
			},
			scenario: {
				prompt:
					"アプリが `\"model\": \"gpt-6-astra\"` を送ると、リクエストが 400 で失敗します。チームメイトはモデルが停止しているに違いないと言います。最初に何を確認しますか？",
				answer:
					"モデル ID です。Phaseo のモデル ID にはプロバイダーのプレフィックスが含まれるので、`openai/gpt-6-astra` が正しい形です。400 は障害ではなく、リクエスト本文かモデル ID の問題を示しています。`GET /v1/models` を呼び出して、正確な ID を確認してください。",
			},
			takeaway:
				"必要なのは、1 つのベース URL、1 つのベアラーキー、プロバイダーのプレフィックス付きのモデル ID だけです。モデルの切り替えは文字列を 1 つ変えるだけです。",
			links: [
				{ label: "クイックスタート", href: "https://phaseo.app/docs/v1/quickstart" },
				{ label: "OpenAI SDK", href: "https://phaseo.app/docs/v1/guides/integrations/openai-sdk" },
				{ label: "Chat Completion を作成する", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "read-the-response",
			title: "レスポンスを読む",
			summary: "返答、停止した理由、処理したプロバイダー、かかった費用を見つけます。",
			minutes: 6,
			body: `Chat Completions のレスポンスは次のようになります（値は例です）。

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

- **\`choices[].message.content\`** に返答のテキストが入ります。
- **\`finish_reason\`** はモデルが停止した理由を示します：\`stop\`（完了した）、\`length\`（トークンの上限に達した）、\`tool_calls\`（ツールを呼び出したい）、\`content_filter\` のいずれかです。
- **\`model\`** は回答したモデルを示します。フォールバックモデルがリクエストを処理した場合は、リクエストしたモデルではなくフォールバックモデルになります。
- **\`provider\`** は処理したプロバイダーを示します。
- **\`id\`** は Phaseo のリクエスト ID です。ログに記録してください。リクエストは **設定 -> 使用量 -> ログ** に表示され、サポートに問い合わせるときにも求められます。

\`usage\` はトークン数を数え、\`cost\` を加えます。これはリクエストにかかった米ドル建ての費用で、クレジットから差し引かれる額です。BYOK のリクエストでは、\`cost_details.upstream_inference_cost\` に自分のプロバイダーキーへの請求額が表示されます。Phaseo のクレジットを使う場合は \`null\` です。

\`/v1/responses\` では形が異なります。テキストは \`output[].content[]\` のうち \`type\` が \`output_text\` の要素に入り、\`usage\` は \`input_tokens\` と \`output_tokens\` を使います。`,
			quiz: {
				question: "Chat Completions の返答が `finish_reason: \"length\"` で返ってきました。何が起きましたか？",
				options: [
					"プロバイダーが途中で失敗し、Phaseo がそこまでの内容を返した",
					"モデルがトークンの上限に達したので、返答が途中で切れている可能性がある",
					"モデルが正常に完了し、返答はすべて揃っている",
				],
				answer: 1,
				explanation:
					"`length` は、モデルがトークンの上限に達して停止したことを意味します。正常な完了は `stop` です。途中で失敗したプロバイダーはエラーを返し、finish reason 付きの途中の返答は返しません。",
			},
			scenario: {
				prompt:
					"経理から、昨日のリクエスト `G-01J...` の費用と、どのプロバイダーが処理したかを聞かれました。どこを見ますか？",
				answer:
					"レスポンス自体では、`usage.cost` が米ドル建ての請求額を、`provider` が処理したプロバイダーを示します。本文をログに残していない場合は、**設定 -> 使用量 -> ログ** でその ID のリクエストを開いてください。",
			},
			takeaway:
				"返答は `choices` から読み、`finish_reason` を確認し、呼び出しのたびに `id`、`model`、`provider`、`usage.cost` をログに記録します。",
			links: [
				{ label: "Chat Completion を作成する", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
				{ label: "レスポンスを作成する", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
				{ label: "クイックスタート：返答を読む", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "when-a-request-fails",
			title: "リクエストが失敗したとき",
			summary: "エラーコードとステータスで分岐し、後で成功する可能性のあるエラーだけを再試行します。",
			minutes: 8,
			body: `Phaseo のエラーは、どのエンドポイントでも同じ JSON 本文を返します。\`error\` オブジェクトは、OpenAI 互換の SDK がすでに読み取れる形です。

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

分岐には \`error.code\` と HTTP ステータスを使い、メッセージの文言は使わないでください。\`generation_id\` は必ずログに記録します。

| ステータス | よくあるコード | 対処 |
| --- | --- | --- |
| \`400\` | \`validation_error\`、\`model_required\` | リクエストを修正します。\`error.param\` が対象のフィールドを示します。 |
| \`401\` | \`unauthorised\` | キーと \`Authorization\` ヘッダーを確認します。 |
| \`402\` | \`insufficient_funds\` | クレジットを追加するか、\`phaseo/free\` を使います。 |
| \`403\` | \`guardrail_blocked\` | リクエストかガードレールを変更します。 |
| \`404\` | \`not_found\` | パスと ID を確認します。 |
| \`410\` | \`model_retired\` | \`replacement_model\` に切り替えます。 |
| \`429\` | \`rate_limit_exceeded\`、\`key_limit_exceeded\` | \`Retry-After\` の分だけ待ってから再試行します。 |
| \`5xx\` | \`upstream_error\`、\`gateway_error\` | バックオフ付きで再試行します。 |

\`429\` 以外の \`4xx\` エラーは、そのまま再試行しないでください。また失敗します。\`429\` の場合は \`Retry-After\`（秒数または HTTP の日付）の分だけ待つか、ジッター付きの指数バックオフを使います。\`Retry-After\` のない \`key_limit_exceeded\` は自然には解除されないので、再試行しないでください。\`5xx\` は、呼び出しを繰り返しても安全な場合にだけ再試行し、試行回数の上限と全体の期限を設定します。`,
			quiz: {
				question: "リクエストが `401`、コード `unauthorised` を返しました。コードはどうすべきですか？",
				options: [
					"処理を止めて、API キーと `Authorization: Bearer` ヘッダーを確認する",
					"成功するまで指数バックオフで再試行する",
					"`Retry-After` ヘッダーの分だけ待ってから、同じリクエストをもう一度送る",
				],
				answer: 0,
				explanation:
					"401 は、キーがないか無効であることを意味します。同じリクエストを再試行しても直りません。バックオフは 429 と 5xx のためのもので、`Retry-After` は 429 に付いてきます。",
			},
			scenario: {
				prompt:
					"バッチスクリプトがループで 500 件のリクエストを送ります。途中から、レスポンスが `Retry-After: 20` ヘッダー付きの `429` で返ってくるようになりました。何を変えますか？",
				answer:
					"スクリプトが `Retry-After` に従うようにします。再試行の前に約 20 秒待ち、ヘッダーがない場合はジッター付きの指数バックオフを使います。`error.code` も確認してください。`rate_limit_exceeded` は解除されますが、`Retry-After` のない `key_limit_exceeded` は解除されないので、再試行しても意味がありません。",
			},
			takeaway:
				"`error.code` とステータスで分岐し、4xx エラーは修正し、再試行は 429 と安全な 5xx エラーだけにバックオフ付きで行います。",
			links: [
				{ label: "エラーとデバッグ", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "レート制限", href: "https://phaseo.app/docs/v1/api-reference/limits" },
				{ label: "クイックスタート：トラブルシューティング", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "stream-it",
			title: "ストリーミングする",
			summary: "返答を書かれるそばから表示し、完了したストリームと途切れたストリームを見分けます。",
			minutes: 9,
			body: `\`"stream": true\` を設定すると、Phaseo はモデルが書いている間に、出力を Server-Sent Events（SSE）として送ります。

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

まず HTTP ステータスを確認します。ストリームが始まる前に失敗したリクエストには、ストリームではなく通常の JSON エラーが返ります。次にイベントを読みます。形式はエンドポイントごとに異なります。

| エンドポイント | テキストが届く場所 | 正常な終了 | 失敗による終了 |
| --- | --- | --- | --- |
| Responses | \`response.output_text.delta\` | \`response.completed\` | \`response.failed\` または \`error\` |
| Chat Completions | \`choices[].delta\` | \`finish_reason\` の後に \`[DONE]\` | \`finish_reason\` のない \`error\` フレーム |

Chat Completions では、\`[DONE]\` の前に、\`choices\` が空の最後のチャンクが \`usage\` を運びます。これにはストリーム全体の \`cost\` も含まれます。\`[DONE]\` を送るのは Chat Completions だけです。ネットワークのチャンクには、イベントの半分や複数のイベントが入っていることがあるので、イベントが揃うまでバッファーしてから解析するか、SDK のストリームヘルパーを使ってください。

ストリームが完了したと言えるのは、正常な終了イベントが届いたときだけです。接続が閉じただけでは、回答が揃ったことにはなりません。途中で失敗した場合は、途中までのテキストを中断扱いとして残し、再試行を提案します。失敗したストリームの途中までの出力に、Phaseo は課金しません。

キャンセルするには、\`AbortSignal\`（または HTTP クライアントの同等の仕組み）を渡し、ユーザーが停止したときに中止します。キャンセルしても、プロバイダーがすぐに止まることや、すでに生成された出力が無料になることは保証されません。`,
			quiz: {
				question: "Chat Completions のストリームでテキストが届いた後、接続が閉じました。`finish_reason` も `[DONE]` も見ていません。どうしますか？",
				options: [
					"接続が正常に閉じたので、完了として扱う",
					"再試行で得た次の回答を、途中までのテキストに付け足す",
					"回答を中断扱いにして、再試行を提案する",
				],
				answer: 2,
				explanation:
					"ストリームが完了したと言えるのは、正常な終了イベントが届いたときだけです。`finish_reason` と `[DONE]` がなければ、回答は不完全です。再試行では別のテキストが返ることがあるので、付け足さずに単独で表示してください。",
			},
			scenario: {
				prompt:
					"チャット UI では、ユーザーが **停止** を押せます。プロダクトマネージャーは、停止した返答には費用がかからないと思っています。正しいですか？",
				answer:
					"いいえ。`AbortSignal` でリクエストを中止すればアプリは読み取りをやめますが、ドキュメントにあるとおり、キャンセルしてもプロバイダーがすぐに止まることや、すでに生成された出力が無料になることは保証されません。停止した返答にも、すでに行われた処理の分は課金されると考えてください。",
			},
			takeaway:
				"エンドポイントの正常な終了イベントを待ち、それ以外は中断として扱い、キャンセルしたストリームが無料だとは考えないでください。",
			links: [
				{ label: "ストリーミング", href: "https://phaseo.app/docs/v1/guides/streaming" },
				{ label: "ストリーム中のエラー", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "レスポンスを作成する", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
			],
			updated: "2026-11-17",
		},
	],
};
