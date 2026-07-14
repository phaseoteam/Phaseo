import os
from phaseo import Phaseo

api_key = os.getenv("PHASEO_API_KEY")
if not api_key:
	raise RuntimeError("Set PHASEO_API_KEY")

client = Phaseo(api_key=api_key)

response = client.messages.create({
	"model": "openai/gpt-5-nano",
	"messages": [{"role": "user", "content": "Say hi in one sentence."}],
	"max_tokens": 64,
})

print(response)
