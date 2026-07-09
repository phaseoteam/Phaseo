import os
from phaseo import Phaseo

api_key = os.getenv("PHASEO_API_KEY")
if not api_key:
	raise RuntimeError("Set PHASEO_API_KEY")

client = Phaseo(api_key=api_key)

response = client.responses.create({
	"model": "openai/gpt-5-nano",
	"input": "Write a one-sentence summary of why testing matters.",
})

print(response)
