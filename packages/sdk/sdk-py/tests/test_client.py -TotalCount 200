import unittest

import httpx

from ai_stats import AIStats, AIStatsError


class AIStatsClientTests(unittest.IsolatedAsyncioTestCase):
	async def test_chat_completions_returns_payload(self) -> None:
		payload = {
			"nativeResponseId": "resp_123",
			"created": 1_723_000_000,
			"model": "openai/gpt-4o-mini",
			"provider": "openai",
			"choices": [
				{
					"index": 0,
					"message": {"role": "assistant", "content": "hi"},
					"finish_reason": "stop",
				}
			],
		}

		def handler(request: httpx.Request) -> httpx.Response:
			self.assertEqual(request.url.path, "/v1/chat/completions")
			return httpx.Response(200, json=payload)

		client = AIStats(
			base_url="https://example.test",
			api_key="sk_test_123",
			transport=httpx.MockTransport(handler),
		)

		async with client:
			response = await client.chat_completions(
				{"model": payload["model"], "messages": [{"role": "user", "content": "hi"}]}
			)

		self.assertEqual(response["choices"][0]["message"]["content"], "hi")

	async def test_stream_chat_completions_yields_frames(self) -> None:
		content = b'data: {"choices":[{"index":0,"delta":{"content":"chunk"}}]}\n\n'

		def handler(_: httpx.Request) -> httpx.Response:
			return httpx.Response(
				200,
				headers={"Content-Type": "text/event-stream"},
				content=content,
			)

		client = AIStats(
			base_url="https://example.test",
			api_key="sk_test_123",
			transport=httpx.MockTransport(handler),
		)

		async with client:
			chunks = []
			async for chunk in client.stream_chat_completions(
				model="openai/gpt-4o-mini",
				messages=[{"role": "user", "content": "stream"}],
			):
				delta = chunk["choices"][0]["delta"]
				chunks.append(delta.get("content"))

		self.assertEqual(chunks, ["chunk"])

	async def test_errors_raise_enriched_exception(self) -> None:
		def handler(_: httpx.Request) -> httpx.Response:
			return httpx.Response(
				400,
				json={"error": "bad_request", "message": "nope"},
				headers={"X-Gateway-Error-Attribution": "user", "X-Gateway-Request-Id": "req_123"},
			)

		client = AIStats(
			base_url="https://example.test",
			api_key="sk_test_123",
			transport=httpx.MockTransport(handler),
		)

		async with client:
			with self.assertRaises(AIStatsError) as ctx:
				await client.chat_completions(
					{"model": "openai/gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]}
				)

		self.assertEqual(ctx.exception.status, 400)
		self.assertEqual(ctx.exception.code, "bad_request")
		self.assertEqual(ctx.exception.request_id, "req_123")


if __name__ == "__main__":
	unittest.main()
