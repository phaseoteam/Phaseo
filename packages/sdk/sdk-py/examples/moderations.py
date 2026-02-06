import os
from ai_stats import AIStats

api_key = os.getenv("AI_STATS_API_KEY")
if not api_key:
	raise RuntimeError("Set AI_STATS_API_KEY")

client = AIStats(api_key=api_key)

response = client.generate_moderation({
	"model": "openai/omni-moderation",
	"input": "Please rate this message for safety.",
})

print(response)
