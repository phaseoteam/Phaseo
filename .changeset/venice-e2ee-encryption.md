---
"@phaseo/gateway-api": minor
---

Venice's end-to-end encrypted (E2EE) models now work through the `venice-e2ee` provider instead of failing with `venice_e2ee_encryption_not_implemented`. Before each request the gateway checks the model's TEE attestation (fresh 32-byte nonce, `verified: true`, matching nonce, no debug enclave), encrypts the content of every system, developer, user, assistant and tool message for that enclave, and decrypts the streamed answer, so Venice relays only ciphertext for conversation content. E2EE routes carry text only. Tool definitions and tool-call arguments are sent in plaintext because Venice's enclave does not decrypt them, reasoning echoed back in conversation history is not sent, and Venice turns off web search for these models.
