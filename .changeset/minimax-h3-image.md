---
"@phaseo/gateway-api": patch
---

Support MiniMax H3-Image and H3-Image Highspeed for image generation and editing. Requests go to MiniMax's OpenAI-style image routes with up to 16 reference images, sizes up to 20 megapixels and token-based billing. Partial failures return the successful images, and a request whose outcome is unknown is never resubmitted, because MiniMax bills each attempt.
