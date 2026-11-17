---
"@phaseo/gateway-api": minor
---

Venice's end-to-end encrypted (E2EE) models now work through the `venice-e2ee` provider instead of failing with `venice_e2ee_encryption_not_implemented`. Before each request the gateway checks the model's TEE attestation (fresh 32-byte nonce, `verified: true`, matching nonce, no debug enclave), encrypts every system, developer and user message for that enclave, and decrypts the streamed answer, so Venice only relays ciphertext. E2EE routes carry text only; tool definitions and assistant and tool turns are sent as Venice's protocol requires, and Venice turns off web search for these models.
