import os
from ai_stats import AIStats

api_key = os.getenv("AI_STATS_API_KEY")
if not api_key:
	raise RuntimeError("Set AI_STATS_API_KEY")

client = AIStats(api_key=api_key)

response = client.responses.create({
	"model": "openai/gpt-5-nano",
	"input": "Write a one-sentence summary of why testing matters.",
})

print(response)
