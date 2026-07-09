import os
from phaseo import Phaseo

api_key = os.getenv("PHASEO_API_KEY")
if not api_key:
	raise RuntimeError("Set PHASEO_API_KEY")

client = Phaseo(api_key=api_key)

response = client.generate_embedding({
	"model": "google/gemini-embedding-001",
	"input": "Vector search uses embeddings to compare meaning.",
})

print("embedding length:", len(response["data"][0]["embedding"]))
