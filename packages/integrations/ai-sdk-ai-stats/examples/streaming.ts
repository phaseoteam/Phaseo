/**
 * Streaming Text Generation Example
 *
 * This example demonstrates streaming text generation with real-time output.
 *
 * Usage:
 *   AI_STATS_API_KEY=your_key tsx examples/streaming.ts
 */

import { aiStats } from '../src/index.js';
import { streamText } from 'ai';

async function main() {
  console.log('🚀 Streaming Text Generation Example\n');

  console.log('Streaming text with Anthropic Claude...\n');
  console.log('📝 Generated Text:\n');

  const result = streamText({
    model: aiStats('anthropic/claude-3-5-sonnet'),
    prompt: 'Write a short poem about TypeScript (4 lines max).',
  });

  // Stream the text as it's generated
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }

  console.log('\n');

  // Wait for usage stats
  const usageStats = await result.usage;
  console.log('\n📊 Usage:');
  console.log(`- Input tokens: ${usageStats.inputTokens}`);
  console.log(`- Output tokens: ${usageStats.outputTokens}`);
  console.log(`- Total tokens: ${usageStats.inputTokens + usageStats.outputTokens}`);

  console.log('\n🧭 Provider Metadata:');
  console.log(JSON.stringify(await result.providerMetadata, null, 2));
}

main().catch(console.error);
