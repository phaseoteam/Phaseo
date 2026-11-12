---
"@phaseo/gateway-api": patch
---

Deliver images, video, audio and documents to every text route in the form the provider documents.

- Claude on Vertex AI and Bedrock: image and PDF URLs are downloaded and sent as base64, as those platforms require. Images must be JPEG, PNG, GIF or WebP and at most 5 MB. Files API uploads return a clear 400 there and are routed only to Claude API, Claude Platform on AWS and Foundry routes.
- Video goes to OpenAI-compatible hosts as the `video_url` part they document (Responses: `input_video` with a string `video_url`).
- Image `detail` is kept on `/v1/responses` input and on base64 images, so `low` is billed as low detail. `original` is sent where the provider documents it, and as `high` elsewhere.
- Gemini receives YouTube links as `file_data.file_uri` instead of the downloaded web page.
- `/v1/responses` decodes `input_image` with `file_id`, top-level `input_file` items, and Gemini-shaped `inlineData` / `fileData` parts instead of sending "[object Object]" text.
- `/v1/messages` images with `source.type: "file"` reach Claude as Files API references, and PDF `document` blocks reach other providers as their own file parts.
- Routing sends documents only to routes that read files and counts images in tool results. `/v1/messages` `document` blocks with no file form (such as a `content` source holding images) go only to Claude routes.
- Uploaded file ids go only to the provider that issued them, recognised by its documented id format (OpenAI and Azure `file-…`, Anthropic `file_…`, xAI `file_` and a UUID, Gemini `files/…`, Mistral UUIDs). When routes in more than one account could hold the file, the route using your own provider key is chosen; otherwise the request returns a 400 (`reason: "file_id_provider_required"`) asking you to pin the provider with `provider.only`.
- Gemini `fileData` audio and video uploads (`files/…`) stay Files API references and are routed only to Google AI Studio.
- A document URL that answers with plain text, Markdown or CSV is downloaded once rather than twice.
- Mistral receives documents as `document_url` (or its own file ids) and audio as its base64 string.
- Audio given by URL is downloaded and sent as base64 `input_audio`, except to hosts that document an audio URL part.
