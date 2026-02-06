import os
from ai_stats import AIStats

api_key = os.getenv("AI_STATS_API_KEY")
if not api_key:
	raise RuntimeError("Set AI_STATS_API_KEY")

client = AIStats(api_key=api_key)

response = client.chat.completions.create({
	"model": "openai/gpt-5-nano",
	"messages": [{"role": "user", "content": "List two colors and their hex codes."}],
	"response_format": {
		"type": "json_schema",
		"schema": {
			"type": "object",
			"properties": {
				"colors": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"name": {"type": "string"},
							"hex": {"type": "string"},
						},
						"required": ["name", "hex"],
					},
				},
			},
			"required": ["colors"],
		},
	},
})

print(response)
