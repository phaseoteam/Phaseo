// Purpose: Provider adapter module for CrofAI.
// Why: Keeps CrofAI as a first-class provider entry even while it reuses shared OpenAI-compatible transport.
// How: Exposes a dedicated adapter instance so future Crof-specific routing/debugging can evolve cleanly.

import { createOpenAICompatibleAdapter } from "../openai-compatible/index";

export const CrofAIAdapter = createOpenAICompatibleAdapter("crofai");
