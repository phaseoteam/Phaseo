import os
from ai_stats import AIStats

api_key = os.getenv("AI_STATS_API_KEY")
if not api_key:
	raise RuntimeError("Set AI_STATS_API_KEY")

client = AIStats(api_key=api_key)

response = client.generate_embedding({
	"model": "google/gemini-embedding-001",
	"input": "Vector search uses embeddings to compare meaning.",
})

print("embedding length:", len(response["data"][0]["embedding"]))
