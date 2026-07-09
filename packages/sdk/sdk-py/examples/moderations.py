import os
from phaseo import Phaseo

api_key = os.getenv("PHASEO_API_KEY")
if not api_key:
	raise RuntimeError("Set PHASEO_API_KEY")

client = Phaseo(api_key=api_key)

response = client.generate_moderation({
	"model": "openai/omni-moderation",
	"input": "Please rate this message for safety.",
})

print(response)
