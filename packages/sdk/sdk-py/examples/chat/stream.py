import os
from phaseo import Phaseo

api_key = os.getenv("PHASEO_API_KEY")
if not api_key:
	raise RuntimeError("Set PHASEO_API_KEY")

client = Phaseo(api_key=api_key)

stream = client.chat.completions.create({
	"model": "openai/gpt-5-nano",
	"messages": [{"role": "user", "content": "Write a short greeting."}],
	"stream": True,
})

for line in stream:
	if line == "data: [DONE]":
		break
	print(line)
