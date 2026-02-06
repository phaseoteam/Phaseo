/**
 * Parses Server-Sent Events (SSE) stream from AI Stats Gateway
 *
 * The gateway returns SSE in the following format:
 * ```
 * data: {"choices":[{"index":0,"delta":{"content":"Hello"}}]}
 * data: {"choices":[{"index":0,"delta":{"content":" world"}}]}
 * data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{...}}
 * [DONE]
 * ```
 */
export function parseSSEStream(
  response: Response
): ReadableStream<{ event?: string; data: any }> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      let buffer = '';
      let currentEvent: string | undefined;

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          // Decode chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete lines
          const lines = buffer.split('\n');

          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();

            // Skip empty lines
            if (!trimmed) {
              continue;
            }

            // Check for [DONE] marker
            if (trimmed === '[DONE]' || trimmed === 'data: [DONE]') {
              controller.close();
              return;
            }

            // Parse event: prefix
            if (trimmed.startsWith('event: ')) {
              currentEvent = trimmed.slice(7).trim() || undefined;
              continue;
            }

            // Parse data: prefix
            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6); // Remove 'data: ' prefix

              try {
                const data = JSON.parse(jsonStr);
                controller.enqueue({ event: currentEvent, data });
              } catch (error) {
                // Ignore malformed JSON chunks
                console.warn('Failed to parse SSE chunk:', jsonStr, error);
              }
            }
          }
        }

        // Process any remaining buffered data
        if (buffer.trim()) {
          const trimmed = buffer.trim();

          if (trimmed.startsWith('event: ')) {
            currentEvent = trimmed.slice(7).trim() || undefined;
          } else if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);

            try {
              const data = JSON.parse(jsonStr);
              controller.enqueue({ event: currentEvent, data });
            } catch (error) {
              console.warn('Failed to parse final SSE chunk:', jsonStr, error);
            }
          }
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}
