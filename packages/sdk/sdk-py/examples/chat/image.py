import os
from phaseo import Phaseo

api_key = os.getenv("PHASEO_API_KEY")
if not api_key:
	raise RuntimeError("Set PHASEO_API_KEY")

client = Phaseo(api_key=api_key)

response = client.chat.completions.create({
	"model": "openai/gpt-5-nano",
	"messages": [
		{
			"role": "user",
			"content": [
				{"type": "text", "text": "What is in this image?"},
				{
					"type": "image_url",
					"image_url": {
						"url": "https://raw.githubusercontent.com/github/explore/main/topics/python/python.png"
					},
				},
			],
		},
	],
})

print(response)
