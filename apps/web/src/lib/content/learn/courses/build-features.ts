import type { LearnCourse } from "../types";

export const buildFeaturesCourse: LearnCourse = {
	slug: "build-real-features",
	title: "Build real features",
	summary:
		"Let models call your functions, return JSON in a fixed shape, and take images, files and audio as input.",
	level: "developer",
	format: "Any language",
	prerequisites: ["Make your first request"],
	lessons: [
		{
			slug: "call-tools",
			title: "Call tools",
			summary: "Describe your functions, run the calls the model asks for, and send the results back until it answers.",
			minutes: 10,
			body: `Describe your functions in \`tools\`, and the model answers with a call to one of them, such as a database lookup, instead of guessing. The model never runs anything itself: your app runs the function and sends the result back, and the model then writes the final answer.

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

On Chat Completions the reply has \`finish_reason: "tool_calls"\` and a \`tool_calls\` list on the assistant message, each with an \`id\`, a function \`name\` and \`arguments\` as a JSON string. Run each call, then send a follow-up request that repeats the conversation, the assistant message unchanged, and one \`role: "tool"\` message per call matched by \`tool_call_id\`. Send \`tools\` again. The model either answers or calls another tool, and you repeat. On \`/v1/responses\` the call is a \`function_call\` item and your result a \`function_call_output\` item with the same \`call_id\`; on \`/v1/messages\` they're \`tool_use\` and \`tool_result\` blocks.

\`tool_choice\` controls whether the model may call tools: \`none\` for text only, \`auto\` (or leave it out) to let the model decide, \`required\` to force a call, or an object naming one tool. Set \`parallel_tool_calls\` to \`false\` when your tools must run one at a time.

Treat every call as untrusted input. Check the tool name against an allowlist, reject unknown names, and validate the parsed arguments before anything runs. If validation fails, don't run the tool: send a short error as the tool result and let the model retry. With \`stream: true\`, collect every argument delta before you parse. Tools whose type starts with \`phaseo:\`, such as \`phaseo:web_search\` or \`phaseo:datetime\`, run on Phaseo's side, so you get the final answer without writing an executor. These server tools are in **Beta**.`,
			quiz: {
				question: "The model returns a call to `delete_user` with `{\"id\": \"42\"}`. Your app only defines `get_weather`. What should your code do?",
				options: [
					"Run it, because the model chose it from the conversation",
					"Reject it as an unknown tool and send a short error back as the tool result",
					"Ask Phaseo to run it with a `phaseo:` prefix",
				],
				answer: 1,
				explanation:
					"The safety guide says to reject unknown tool names instead of guessing what the model meant, and to send a controlled error back rather than run anything. `phaseo:` tools are a fixed set Phaseo provides, not a way to run your own functions.",
			},
			scenario: {
				prompt:
					"Your support bot calls `get_order` and then answers. A teammate's loop sends only the `role: \"tool\"` message in the follow-up request, and the provider rejects it. What's missing?",
				answer:
					"The follow-up must repeat the conversation, then the assistant message with its `tool_calls` unchanged, then one `role: \"tool\"` message per call with the matching `tool_call_id`. Send `tools` again too. A tool result with no call before it has nothing to match.",
			},
			takeaway:
				"The model asks, your app validates and runs the call, and you send the result back with the call's ID until the model gives a final answer.",
			links: [
				{ label: "Tool calling", href: "https://phaseo.app/docs/v1/guides/tool-calling" },
				{ label: "Tool calling patterns", href: "https://phaseo.app/docs/v1/guides/tool-calling-patterns" },
				{ label: "Tool calling safety", href: "https://phaseo.app/docs/v1/guides/tool-calling-safety" },
				{ label: "Server tools", href: "https://phaseo.app/docs/v1/guides/server-tools" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "get-structured-output",
			title: "Get structured output",
			summary: "Send a JSON Schema so the model returns JSON in your shape, then validate it before you use it.",
			minutes: 8,
			body: `Send a JSON Schema with the request and the model returns JSON in that shape instead of free text. Use it when you want data back, such as fields pulled from an email. Use tool calling when you want the model to ask your app to do something.

| \`type\` | What you get |
| --- | --- |
| \`json_schema\` | JSON that follows your schema. Use this by default. |
| \`json_object\` | Some valid JSON object, with no shape enforced. |
| \`text\` | Plain text (the default). |

The format goes in \`response_format\` on \`/v1/chat/completions\`, \`text.format\` on \`/v1/responses\` and \`output_config.format\` on \`/v1/messages\` (\`json_schema\` only).

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

The JSON comes back as a string in the message content. Before you parse it, check for a refusal, missing content or a \`finish_reason\` other than \`stop\`. Then validate the parsed object, for example with Zod. If validation fails, retry once with the error in the prompt, then return a safe failure. Each retry is charged, and valid JSON still isn't proof the values are correct.

Phaseo never drops \`response_format\`. It routes a \`json_schema\` request only to providers that support structured outputs; if none of the model's providers do, the request fails with \`400 validation_error\`. Model pages flag support with \`structured_outputs\`, which is a capability flag, not a request field.`,
			quiz: {
				question: "You send `response_format` with `json_schema` to a model whose providers don't support structured outputs. What happens?",
				options: [
					"Phaseo drops `response_format` and returns plain text",
					"Phaseo sends the request anyway and the model guesses the shape",
					"The request fails with `400 validation_error`",
				],
				answer: 2,
				explanation:
					"`response_format` is never dropped. Phaseo only routes a schema request to providers that support structured outputs, and returns a 400 when the model has none.",
			},
			scenario: {
				prompt:
					"Your invoice parser uses `json_schema`, and once in a while the reply fails your Zod check because `total` is missing. What should the code do?",
				answer:
					"First check that `finish_reason` is `stop`, since a truncated answer can't be valid. Then retry once with the validation error in the prompt, and if it fails again, return a safe failure instead of guessing. Track failures per model and schema version so you notice when either change makes things worse.",
			},
			takeaway:
				"Use `json_schema` for data you need in a fixed shape, and always validate the result in your own code before trusting it.",
			links: [
				{ label: "Structured outputs", href: "https://phaseo.app/docs/v1/guides/structured-outputs" },
				{ label: "Parameters: response_format", href: "https://phaseo.app/docs/v1/api-reference/parameters" },
				{ label: "Response healing for JSON", href: "https://phaseo.app/docs/v1/cookbook/response-healing-for-structured-json" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "send-images-and-audio",
			title: "Send images and audio",
			summary: "Add images, files and audio to a request, pick the endpoint for the output you want, and find models that accept each input.",
			minutes: 9,
			body: `On the text endpoints, a message's \`content\` can be a list of parts instead of a string. An image part takes an HTTP(S) URL or a base64 \`data:\` URI:

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

Other input parts follow the same pattern. \`input_audio\` sends base64 audio \`data\` with a \`format\` such as \`wav\` or \`mp3\`. A \`file\` part sends a document such as a PDF, either as a base64 data URL in \`file_data\` or as a \`file_id\`. A \`file_id\` can only be read by the provider account that issued it, so pin that provider or send the data instead.

For other kinds of output, use the endpoint for it:

| You want | Endpoint |
| --- | --- |
| Speech from text | \`/v1/audio/speech\` |
| Text from speech | \`/v1/audio/transcriptions\` (\`/v1/audio/translations\` for English) |
| Images | \`/v1/images/generations\`, \`/v1/images/edits\` |
| Text and layout from a document image | \`/v1/ocr\`, \`/v1/parse\` |

\`/v1/parse\` takes one image per request and doesn't accept PDFs, so convert each page to an image first.

Not every model takes every input. Phaseo routes only to providers that accept the inputs in your request; if none do, you get \`400 unsupported_modalities\`. Check first: each model in \`GET /v1/models\` lists \`modalities.input\`, and you can filter with \`input_types=image\`. On the [Models](https://phaseo.app/models) page, use the input and output modality filters.`,
			quiz: {
				question: "You need a list of models that accept image input. What's the quickest reliable check?",
				options: [
					"Call `GET /v1/models?input_types=image`",
					"Send an image to each model and see which ones don't error",
					"Pick any model whose name includes \"vision\"",
				],
				answer: 0,
				explanation:
					"`GET /v1/models` filters by `input_types` (alias `input_modalities`), and each model lists `modalities.input`. The Models page has the same filters. Trial and error costs money, and names don't tell you what a route accepts.",
			},
			scenario: {
				prompt:
					"Your receipts feature sends a photo to a text-only model and gets `400 unsupported_modalities`. The product manager asks whether Phaseo is down. What do you tell them, and what do you change?",
				answer:
					"Phaseo isn't down: no route for that model accepts image input. Pick a model whose `modalities.input` includes `image` (filter `GET /v1/models` with `input_types=image`, or use the Models page filter) and send the same request to it.",
			},
			takeaway:
				"Send images, audio and files as content parts, use the dedicated endpoints for speech, transcription and images, and check a model's input modalities before you rely on it.",
			links: [
				{ label: "Multimodality", href: "https://phaseo.app/docs/v1/guides/multimodality" },
				{ label: "List models", href: "https://phaseo.app/docs/v1/api-reference/endpoint/models" },
				{ label: "Parse document images", href: "https://phaseo.app/docs/v1/guides/document-parsing" },
				{ label: "Exploring models", href: "https://phaseo.app/docs/v1/exploring/models" },
			],
			updated: "2026-11-17",
		},
	],
};
