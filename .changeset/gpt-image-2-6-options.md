---
"@phaseo/gateway-api": minor
"@phaseo/sdk": patch
---

Support GPT Image 2.6 request options on the Images API: `complexity`, animated GIF output (`output_format: "gif"` with `frame_count` and `frame_duration_ms`), SVG output (`output_format: "svg"` with `svg.model`, the OpenAI model that writes the SVG), and markup-guided edits (`markup`). SVG requests also bill the author model's tokens at its Phaseo text price and return OpenAI's `svg_usage`.
