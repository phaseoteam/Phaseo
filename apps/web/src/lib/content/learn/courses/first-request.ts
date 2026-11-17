import type { LearnCourse } from "../types";

export const firstRequestCourse: LearnCourse = {
	slug: "make-your-first-request",
	title: "Make your first request",
	summary:
		"Send a request to the Phaseo API, read what comes back, handle errors and stream the reply.",
	level: "developer",
	format: "Any language",
	prerequisites: ["What is Phaseo?", "Comfortable making an HTTP request in any language"],
	lessons: [
		{
			slug: "make-a-request",
			title: "Make a request",
			summary: "Send your API key, a model ID and your input to one OpenAI-compatible endpoint.",
			minutes: 7,
			body: `Every request goes to \`https://api.phaseo.app/v1\` and carries your API key as a bearer token: \`Authorization: Bearer phaseo_v1_sk_...\`. Create the key under **Settings -> API Keys**. It's shown once, so store it in an environment variable such as \`PHASEO_API_KEY\` and keep it in server-side code only.

\`POST /v1/responses\` is the recommended endpoint for new text work. You send a \`model\` and an \`input\`:

\`\`\`bash
curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "input": "Reply with: quickstart works"
  }'
\`\`\`

Already using the official OpenAI SDK? Change three things: the API key, the base URL and the model ID.

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

Code that calls Chat Completions works with the same client: send \`messages\` to \`client.chat.completions.create\` instead.

Model IDs always carry the provider prefix, such as \`openai/\`, \`anthropic/\` or \`google/\`. To switch models, change only the \`model\` string; the rest of the request stays the same. List valid IDs with \`GET /v1/models\` rather than guessing. \`phaseo/free\` picks an available free model and works without credits, which makes it handy for a first test.`,
			quiz: {
				question: "You point the official OpenAI SDK at Phaseo. Which set of changes do you need?",
				options: [
					"The API key, the base URL and the model ID",
					"Only the base URL; the SDK keeps using your OpenAI key",
					"A Phaseo-only request field that names the provider, plus the base URL",
				],
				answer: 0,
				explanation:
					"The docs list exactly three changes: your Phaseo API key, the base URL https://api.phaseo.app/v1 and a Phaseo model ID with its provider prefix. Your OpenAI key doesn't work on Phaseo, and the provider is part of the model ID, not a separate field.",
			},
			scenario: {
				prompt:
					"Your app sends `\"model\": \"gpt-6-astra\"` and the request fails with a 400. A teammate says the model must be down. What do you check first?",
				answer:
					"The model ID. Phaseo model IDs include the provider prefix, so it should be `openai/gpt-6-astra`. A 400 points at the request body or the model ID, not an outage. Call `GET /v1/models` to confirm the exact ID.",
			},
			takeaway:
				"One base URL, one bearer key and a provider-prefixed model ID are all you need, and switching models means changing one string.",
			links: [
				{ label: "Quickstart", href: "https://phaseo.app/docs/v1/quickstart" },
				{ label: "OpenAI SDK", href: "https://phaseo.app/docs/v1/guides/integrations/openai-sdk" },
				{ label: "Create a chat completion", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "read-the-response",
			title: "Read the response",
			summary: "Find the reply, why it stopped, who served it and what it cost.",
			minutes: 6,
			body: `A Chat Completions response looks like this (values illustrative):

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

- **\`choices[].message.content\`** holds the reply text.
- **\`finish_reason\`** says why the model stopped: \`stop\` (it finished), \`length\` (it hit the token limit), \`tool_calls\` (it wants to call a tool) or \`content_filter\`.
- **\`model\`** names the model that answered. If a fallback model served the request, this is the fallback, not the one you asked for.
- **\`provider\`** names the provider that served it.
- **\`id\`** is the Phaseo request ID. Log it: the request appears under **Settings -> Usage -> Logs**, and support asks for it.

\`usage\` counts tokens and adds \`cost\`: what the request costs you in US dollars, the amount taken from your credits. On a BYOK request, \`cost_details.upstream_inference_cost\` shows what your own provider key is billed; on Phaseo credits it's \`null\`.

On \`/v1/responses\` the shape is different: the text is in \`output[].content[]\` where \`type\` is \`output_text\`, and \`usage\` uses \`input_tokens\` and \`output_tokens\`.`,
			quiz: {
				question: "A Chat Completions reply comes back with `finish_reason: \"length\"`. What happened?",
				options: [
					"The provider failed partway and Phaseo returned what it had",
					"The model hit the token limit, so the reply may be cut off",
					"The model finished normally and the reply is complete",
				],
				answer: 1,
				explanation:
					"`length` means the model stopped because it reached the token limit. A normal finish is `stop`. A provider that fails partway returns an error, not a partial reply with a finish reason.",
			},
			scenario: {
				prompt:
					"Finance asks what yesterday's request `G-01J...` cost, and which provider ran it. Where do you look?",
				answer:
					"In the response itself, `usage.cost` gives the charge in US dollars and `provider` names who served it. If you didn't log the body, open the request by its ID under **Settings -> Usage -> Logs**.",
			},
			takeaway:
				"Read the reply from `choices`, check `finish_reason`, and log `id`, `model`, `provider` and `usage.cost` with every call.",
			links: [
				{ label: "Create a chat completion", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
				{ label: "Create a response", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
				{ label: "Quickstart: read the reply", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "when-a-request-fails",
			title: "When a request fails",
			summary: "Branch on the error code and status, and retry only the errors that can succeed later.",
			minutes: 8,
			body: `Every Phaseo error has the same JSON body on every endpoint. The \`error\` object is the shape OpenAI-compatible SDKs already read:

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

Branch on \`error.code\` and the HTTP status, never on the message text. Always log \`generation_id\`.

| Status | Common code | What to do |
| --- | --- | --- |
| \`400\` | \`validation_error\`, \`model_required\` | Fix the request. \`error.param\` names the field. |
| \`401\` | \`unauthorised\` | Check the key and the \`Authorization\` header. |
| \`402\` | \`insufficient_funds\` | Add credits, or use \`phaseo/free\`. |
| \`403\` | \`guardrail_blocked\` | Change the request or the guardrail. |
| \`404\` | \`not_found\` | Check the path and ID. |
| \`410\` | \`model_retired\` | Switch to \`replacement_model\`. |
| \`429\` | \`rate_limit_exceeded\`, \`key_limit_exceeded\` | Wait for \`Retry-After\`, then retry. |
| \`5xx\` | \`upstream_error\`, \`gateway_error\` | Retry with backoff. |

Don't retry \`4xx\` errors other than \`429\` unchanged: they fail again. For \`429\`, wait for \`Retry-After\` (seconds or an HTTP date), or use exponential backoff with jitter. A \`key_limit_exceeded\` with no \`Retry-After\` won't reset on its own, so don't retry it. Retry \`5xx\` only when repeating the call is safe, and set an attempt limit and an overall deadline.`,
			quiz: {
				question: "Your request returns `401` with code `unauthorised`. What should your code do?",
				options: [
					"Stop and check the API key and the `Authorization: Bearer` header",
					"Retry with exponential backoff until it succeeds",
					"Wait for the `Retry-After` header, then send the same request again",
				],
				answer: 0,
				explanation:
					"A 401 means the key is missing or invalid. Retrying the same request can't fix that. Backoff is for 429 and 5xx, and `Retry-After` comes with 429s.",
			},
			scenario: {
				prompt:
					"A batch script sends 500 requests in a loop. Halfway through, responses start coming back as `429` with a `Retry-After: 20` header. What do you change?",
				answer:
					"Make the script honour `Retry-After`: pause about 20 seconds before retrying, and fall back to jittered exponential backoff when the header is missing. Check `error.code` too: `rate_limit_exceeded` will reset, but a `key_limit_exceeded` without `Retry-After` won't, so retrying it is pointless.",
			},
			takeaway:
				"Branch on `error.code` and status, fix 4xx errors, and retry only 429 and safe 5xx errors with backoff.",
			links: [
				{ label: "Errors and debugging", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "Rate limits", href: "https://phaseo.app/docs/v1/api-reference/limits" },
				{ label: "Quickstart: troubleshoot", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "stream-it",
			title: "Stream it",
			summary: "Show the reply as it's written, and tell a finished stream from a broken one.",
			minutes: 9,
			body: `Set \`"stream": true\` and Phaseo sends the output as server-sent events (SSE) while the model writes it:

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

Check the HTTP status first. A request that fails before the stream starts gets the normal JSON error, not a stream. Then read events. Each endpoint has its own format:

| Endpoint | Text arrives in | Successful end | Failure end |
| --- | --- | --- | --- |
| Responses | \`response.output_text.delta\` | \`response.completed\` | \`response.failed\` or \`error\` |
| Chat Completions | \`choices[].delta\` | a \`finish_reason\`, then \`[DONE]\` | an \`error\` frame with no \`finish_reason\` |

On Chat Completions, a final chunk with empty \`choices\` carries \`usage\`, including \`cost\` for the whole stream, before \`[DONE]\`. Only Chat Completions sends \`[DONE]\`. A network chunk can hold half an event or several, so buffer until an event is complete before you parse it, or use an SDK stream helper.

A stream is finished only when its successful end event arrives. A closed connection on its own doesn't mean the answer is complete. If it fails partway, keep the partial text marked as interrupted and offer a retry; Phaseo doesn't charge for the partial output of a stream that fails.

To cancel, pass an \`AbortSignal\` (or your HTTP client's equivalent) and abort when the user stops. Cancelling doesn't guarantee the provider stops at once, or that output already generated is free.`,
			quiz: {
				question: "Your Chat Completions stream has delivered text, then the connection closes. You never saw a `finish_reason` or `[DONE]`. What do you do?",
				options: [
					"Treat it as complete, because the connection closed cleanly",
					"Append the next retried answer to the partial text",
					"Treat the answer as interrupted and offer a retry",
				],
				answer: 2,
				explanation:
					"A stream is finished only when its successful end event arrives. Without a `finish_reason` and `[DONE]`, the answer is incomplete. A retry can produce different text, so show it on its own rather than appending it.",
			},
			scenario: {
				prompt:
					"Users can press **Stop** in your chat UI. Your product manager assumes stopped replies cost nothing. Is that right?",
				answer:
					"No. Abort the request with an `AbortSignal` so your app stops reading, but the docs say cancelling doesn't guarantee the provider stops at once, or that output it already generated is free. Expect stopped replies to be charged for work already done.",
			},
			takeaway:
				"Wait for the endpoint's successful end event, treat anything else as interrupted, and don't assume a cancelled stream is free.",
			links: [
				{ label: "Streaming", href: "https://phaseo.app/docs/v1/guides/streaming" },
				{ label: "Errors during a stream", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "Create a response", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
			],
			updated: "2026-11-17",
		},
	],
};
