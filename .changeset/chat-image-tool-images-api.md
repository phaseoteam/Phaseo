---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
---

Fix Chat's image tool for image models without a chat route: the `phaseo:image_generation` server tool now runs GPT Image, FLUX and other image models through the Images API, applying workspace and key model rules. Each tool image is priced on its own model's card and added to the request total, instead of being priced as the chat model's usage. The tool accepts `complexity`, `frame_count`, `frame_duration_ms` and an SVG author (`svg.model` or `svg_model`) for GPT Image 2.6. Chat adds GIF/SVG formats, complexity, frame settings and an SVG author picker, and shows the tool's images, including GIF and SVG, in the reply. Request details label tool image pricing lines.
