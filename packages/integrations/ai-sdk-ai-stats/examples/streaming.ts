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

  const { textStream, usage } = await streamText({
    model: aiStats('anthropic/claude-3-5-sonnet'),
    prompt: 'Write a short poem about TypeScript (4 lines max).',
  });

  // Stream the text as it's generated
  for await (const chunk of textStream) {
    process.stdout.write(chunk);
  }

  console.log('\n');

  // Wait for usage stats
  const usageStats = await usage;
  console.log('\n📊 Usage:');
  console.log(`- Prompt tokens: ${usageStats.promptTokens}`);
  console.log(`- Completion tokens: ${usageStats.completionTokens}`);
  console.log(`- Total tokens: ${usageStats.promptTokens + usageStats.completionTokens}`);
}

main().catch(console.error);
