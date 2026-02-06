import os
from ai_stats import AIStats

api_key = os.getenv("AI_STATS_API_KEY")
if not api_key:
	raise RuntimeError("Set AI_STATS_API_KEY")

client = AIStats(api_key=api_key)

response = client.messages.create({
	"model": "openai/gpt-5-nano",
	"messages": [{"role": "user", "content": "What is 6 * 7?"}],
	"max_tokens": 64,
	"tools": [
		{
			"name": "multiply",
			"description": "Multiply two numbers",
			"input_schema": {
				"type": "object",
				"properties": {
					"a": {"type": "number"},
					"b": {"type": "number"},
				},
				"required": ["a", "b"],
			},
		},
	],
	"tool_choice": {"type": "tool", "name": "multiply"},
})

print(response)
