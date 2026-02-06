import os
from ai_stats import AIStats

api_key = os.getenv("AI_STATS_API_KEY")
if not api_key:
	raise RuntimeError("Set AI_STATS_API_KEY")

client = AIStats(api_key=api_key)

response = client.chat.completions.create({
	"model": "openai/gpt-5-nano",
	"messages": [{"role": "user", "content": "What is 6 * 7?"}],
	"tools": [
		{
			"type": "function",
			"function": {
				"name": "multiply",
				"description": "Multiply two numbers",
				"parameters": {
					"type": "object",
					"properties": {
						"a": {"type": "number"},
						"b": {"type": "number"},
					},
					"required": ["a", "b"],
				},
			},
		},
	],
	"tool_choice": "auto",
})

print(response)
