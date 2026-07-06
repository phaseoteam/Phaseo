import os
from phaseo import Phaseo

api_key = os.getenv("PHASEO_API_KEY")
if not api_key:
	raise RuntimeError("Set PHASEO_API_KEY")

client = Phaseo(api_key=api_key)

response = client.chat.completions.create({
	"model": "openai/gpt-5-nano",
	"messages": [{"role": "user", "content": "List two colors and hex codes."}],
	"response_format": {
		"type": "json_schema",
		"schema": {
			"type": "object",
			"additionalProperties": False,
			"properties": {
				"colors": {
					"type": "array",
					"items": {
						"type": "object",
						"additionalProperties": False,
						"properties": {
							"name": {"type": "string"},
							"hex": {"type": "string"},
						},
						"required": ["name", "hex"],
					},
				},
			},
			"required": ["colors"],
		},
	},
})

print(response)
