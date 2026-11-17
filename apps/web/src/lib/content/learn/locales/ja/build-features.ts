import type { LearnCourse } from "../../types";

export const buildFeaturesCourse: LearnCourse = {
	slug: "build-real-features",
	title: "実用的な機能を作る",
	summary:
		"モデルに自分の関数を呼び出させ、決まった形の JSON を返させ、画像、ファイル、音声を入力として渡します。",
	level: "developer",
	format: "言語を問わない",
	prerequisites: ["最初のリクエストを送る"],
	lessons: [
		{
			slug: "call-tools",
			title: "ツールを呼び出す",
			summary: "関数を記述し、モデルが求める呼び出しを実行して、モデルが回答するまで結果を返します。",
			minutes: 10,
			body: `\`tools\` に関数を記述すると、モデルは推測する代わりに、データベースの検索などその関数の 1 つを呼び出す形で応答します。モデル自身は何も実行しません。アプリが関数を実行して結果を返し、それを受けてモデルが最終的な回答を書きます。

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

Chat Completions では、返答に \`finish_reason: "tool_calls"\` があり、アシスタントのメッセージに \`tool_calls\` のリストが入ります。それぞれに \`id\`、関数の \`name\`、JSON 文字列の \`arguments\` があります。各呼び出しを実行したら、会話、変更しないままのアシスタントのメッセージ、そして呼び出しごとに \`tool_call_id\` で対応付けた \`role: "tool"\` メッセージを 1 つずつ含めて、次のリクエストを送ります。\`tools\` ももう一度送ります。モデルは回答するか別のツールを呼び出すので、それを繰り返します。\`/v1/responses\` では、呼び出しは \`function_call\` アイテム、結果は同じ \`call_id\` を持つ \`function_call_output\` アイテムです。\`/v1/messages\` では \`tool_use\` ブロックと \`tool_result\` ブロックです。

\`tool_choice\` は、モデルがツールを呼び出せるかを制御します。テキストだけなら \`none\`、モデルに任せるなら \`auto\`（または省略）、呼び出しを強制するなら \`required\`、特定のツールを指定するならオブジェクトを使います。ツールを 1 つずつ実行する必要がある場合は、\`parallel_tool_calls\` を \`false\` にします。

すべての呼び出しを信頼できない入力として扱ってください。ツール名を許可リストと照合し、未知の名前は拒否し、何かを実行する前に解析した引数を検証します。検証に失敗したらツールは実行せず、短いエラーをツールの結果として返し、モデルに再試行させます。\`stream: true\` の場合は、解析する前にすべての引数のデルタを集めてください。\`phaseo:web_search\` や \`phaseo:datetime\` のように、type が \`phaseo:\` で始まるツールは Phaseo 側で実行されるので、実行処理を書かなくても最終的な回答が得られます。これらのサーバーツールは **ベータ** です。`,
			quiz: {
				question: "モデルが `{\"id\": \"42\"}` で `delete_user` の呼び出しを返しました。アプリで定義しているのは `get_weather` だけです。コードはどうすべきですか？",
				options: [
					"モデルが会話から選んだものなので、実行する",
					"未知のツールとして拒否し、短いエラーをツールの結果として返す",
					"`phaseo:` プレフィックスを付けて Phaseo に実行してもらう",
				],
				answer: 1,
				explanation:
					"安全ガイドでは、モデルの意図を推測せずに未知のツール名を拒否し、何も実行せずに制御されたエラーを返すよう説明しています。`phaseo:` ツールは Phaseo が提供する決まったセットで、自分の関数を実行する手段ではありません。",
			},
			scenario: {
				prompt:
					"サポートボットは `get_order` を呼び出してから回答します。チームメイトのループは、次のリクエストで `role: \"tool\"` メッセージだけを送っており、プロバイダーに拒否されます。何が足りませんか？",
				answer:
					"次のリクエストでは、会話を繰り返し、続いて `tool_calls` を変更しないままのアシスタントのメッセージ、さらに呼び出しごとに対応する `tool_call_id` を持つ `role: \"tool\"` メッセージを 1 つずつ送る必要があります。`tools` ももう一度送ってください。前に呼び出しのないツールの結果には、対応付ける相手がありません。",
			},
			takeaway:
				"モデルが求め、アプリが呼び出しを検証して実行し、モデルが最終的な回答を出すまで、呼び出しの ID とともに結果を返します。",
			links: [
				{ label: "ツール呼び出し", href: "https://phaseo.app/docs/v1/guides/tool-calling" },
				{ label: "ツール呼び出しのパターン", href: "https://phaseo.app/docs/v1/guides/tool-calling-patterns" },
				{ label: "ツール呼び出しの安全性", href: "https://phaseo.app/docs/v1/guides/tool-calling-safety" },
				{ label: "サーバーツール", href: "https://phaseo.app/docs/v1/guides/server-tools" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "get-structured-output",
			title: "構造化出力を得る",
			summary: "JSON Schema を送ってモデルに決まった形の JSON を返させ、使う前に検証します。",
			minutes: 8,
			body: `リクエストに JSON Schema を付けて送ると、モデルは自由なテキストではなく、その形の JSON を返します。メールから項目を抜き出すなど、データを受け取りたいときに使います。モデルにアプリへ何かを依頼させたいときは、ツール呼び出しを使います。

| \`type\` | 得られるもの |
| --- | --- |
| \`json_schema\` | スキーマに従った JSON。基本はこれを使います。 |
| \`json_object\` | 形は強制されない、有効な JSON オブジェクト。 |
| \`text\` | プレーンテキスト（既定）。 |

形式は、\`/v1/chat/completions\` では \`response_format\`、\`/v1/responses\` では \`text.format\`、\`/v1/messages\` では \`output_config.format\`（\`json_schema\` のみ）に指定します。

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

JSON は、メッセージの content に文字列として返ってきます。解析する前に、拒否、content の欠落、\`stop\` 以外の \`finish_reason\` がないかを確認します。次に、Zod などで解析したオブジェクトを検証します。検証に失敗したら、エラーをプロンプトに含めて 1 回だけ再試行し、それでもだめなら安全な失敗を返します。再試行のたびに課金されます。また、有効な JSON だからといって、値が正しいとは限りません。

Phaseo は \`response_format\` を決して取り除きません。\`json_schema\` のリクエストは、構造化出力に対応したプロバイダーにだけルーティングします。モデルのどのプロバイダーも対応していない場合、リクエストは \`400 validation_error\` で失敗します。モデルページでは、対応状況が \`structured_outputs\` で示されます。これはケイパビリティのフラグで、リクエストのフィールドではありません。`,
			quiz: {
				question: "構造化出力に対応していないプロバイダーしかないモデルに、`json_schema` を指定した `response_format` を送りました。どうなりますか？",
				options: [
					"Phaseo は `response_format` を取り除き、プレーンテキストを返す",
					"Phaseo はそのままリクエストを送り、モデルが形を推測する",
					"リクエストは `400 validation_error` で失敗する",
				],
				answer: 2,
				explanation:
					"`response_format` が取り除かれることはありません。Phaseo はスキーマ付きのリクエストを構造化出力に対応したプロバイダーにだけルーティングし、モデルに対応プロバイダーがない場合は 400 を返します。",
			},
			scenario: {
				prompt:
					"請求書のパーサーは `json_schema` を使っていますが、ときどき `total` が欠けていて Zod のチェックに失敗します。コードはどうすべきですか？",
				answer:
					"途中で切れた回答は有効になりえないので、まず `finish_reason` が `stop` であることを確認します。次に、検証エラーをプロンプトに含めて 1 回だけ再試行し、再び失敗したら推測せずに安全な失敗を返します。モデルとスキーマのバージョンごとに失敗を記録すれば、どちらかの変更で状況が悪化したときに気づけます。",
			},
			takeaway:
				"決まった形で必要なデータには `json_schema` を使い、信頼する前に必ず自分のコードで結果を検証します。",
			links: [
				{ label: "構造化出力", href: "https://phaseo.app/docs/v1/guides/structured-outputs" },
				{ label: "パラメーター：response_format", href: "https://phaseo.app/docs/v1/api-reference/parameters" },
				{ label: "JSON の応答の修復", href: "https://phaseo.app/docs/v1/cookbook/response-healing-for-structured-json" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "send-images-and-audio",
			title: "画像と音声を送る",
			summary: "リクエストに画像、ファイル、音声を加え、欲しい出力に合ったエンドポイントを選び、各入力を受け付けるモデルを見つけます。",
			minutes: 9,
			body: `テキストのエンドポイントでは、メッセージの \`content\` を文字列ではなくパーツのリストにできます。画像のパーツには、HTTP(S) の URL か base64 の \`data:\` URI を指定します。

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

ほかの入力パーツも同じパターンです。\`input_audio\` は、base64 の音声 \`data\` を \`wav\` や \`mp3\` などの \`format\` とともに送ります。\`file\` パーツは PDF などのドキュメントを、\`file_data\` の base64 データ URL か \`file_id\` として送ります。\`file_id\` を読めるのは発行したプロバイダーのアカウントだけなので、そのプロバイダーに固定するか、データそのものを送ってください。

ほかの種類の出力には、専用のエンドポイントを使います。

| 欲しいもの | エンドポイント |
| --- | --- |
| テキストから音声 | \`/v1/audio/speech\` |
| 音声からテキスト | \`/v1/audio/transcriptions\`（英語への翻訳は \`/v1/audio/translations\`） |
| 画像 | \`/v1/images/generations\`、\`/v1/images/edits\` |
| ドキュメント画像からテキストとレイアウト | \`/v1/ocr\`、\`/v1/parse\` |

\`/v1/parse\` はリクエストごとに画像を 1 枚受け付け、PDF には対応していないので、先に各ページを画像に変換してください。

すべてのモデルがすべての入力を受け付けるわけではありません。Phaseo は、リクエストの入力を受け付けるプロバイダーにだけルーティングし、該当するものがなければ \`400 unsupported_modalities\` を返します。先に確認しましょう。\`GET /v1/models\` の各モデルには \`modalities.input\` が含まれ、\`input_types=image\` で絞り込めます。[モデル](https://phaseo.app/models) ページでは、入力と出力のモダリティのフィルターを使います。`,
			quiz: {
				question: "画像入力を受け付けるモデルの一覧が必要です。最も手早く確実な確認方法はどれですか？",
				options: [
					"`GET /v1/models?input_types=image` を呼び出す",
					"各モデルに画像を送り、エラーにならないものを確かめる",
					"名前に \"vision\" が含まれるモデルをどれか選ぶ",
				],
				answer: 0,
				explanation:
					"`GET /v1/models` は `input_types`（別名 `input_modalities`）で絞り込め、各モデルに `modalities.input` が含まれます。モデルページにも同じフィルターがあります。試行錯誤にはお金がかかり、名前からはルートが何を受け付けるかはわかりません。",
			},
			scenario: {
				prompt:
					"レシート機能がテキスト専用のモデルに写真を送り、`400 unsupported_modalities` が返ってきます。プロダクトマネージャーに Phaseo が落ちているのかと聞かれました。どう答え、何を変えますか？",
				answer:
					"Phaseo は落ちていません。そのモデルには画像入力を受け付けるルートがないだけです。`modalities.input` に `image` を含むモデルを選び（`GET /v1/models` を `input_types=image` で絞り込むか、モデルページのフィルターを使います）、同じリクエストをそのモデルに送ります。",
			},
			takeaway:
				"画像、音声、ファイルはコンテンツのパーツとして送り、音声合成、文字起こし、画像には専用のエンドポイントを使い、モデルに頼る前に入力のモダリティを確認します。",
			links: [
				{ label: "マルチモーダル", href: "https://phaseo.app/docs/v1/guides/multimodality" },
				{ label: "モデルを一覧する", href: "https://phaseo.app/docs/v1/api-reference/endpoint/models" },
				{ label: "ドキュメント画像を解析する", href: "https://phaseo.app/docs/v1/guides/document-parsing" },
				{ label: "モデルを探す", href: "https://phaseo.app/docs/v1/exploring/models" },
			],
			updated: "2026-11-17",
		},
	],
};
