import os
from ai_stats import AIStats

api_key = os.getenv("AI_STATS_API_KEY")
if not api_key:
	raise RuntimeError("Set AI_STATS_API_KEY")

client = AIStats(api_key=api_key)

response = client.responses.create({
	"model": "openai/gpt-5-nano",
	"input_items": [
		{"role": "user", "content": "Give me a short tagline."},
		{"role": "user", "content": "Make it about reliability."},
	],
})

print(response)
