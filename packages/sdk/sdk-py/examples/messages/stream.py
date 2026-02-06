import os
from ai_stats import AIStats

api_key = os.getenv("AI_STATS_API_KEY")
if not api_key:
	raise RuntimeError("Set AI_STATS_API_KEY")

client = AIStats(api_key=api_key)

stream = client.messages.create({
	"model": "openai/gpt-5-nano",
	"messages": [{"role": "user", "content": "Write a short greeting."}],
	"max_tokens": 64,
	"stream": True,
})

for line in stream:
	if line == "data: [DONE]":
		break
	print(line)
