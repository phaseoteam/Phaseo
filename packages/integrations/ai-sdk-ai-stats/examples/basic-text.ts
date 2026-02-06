/**
 * Basic Text Generation Example
 *
 * This example demonstrates simple text generation using the AI Stats provider.
 *
 * Usage:
 *   AI_STATS_API_KEY=your_key tsx examples/basic-text.ts
 */

import { aiStats } from '../src/index.js';
import { generateText } from 'ai';

async function main() {
  console.log('🚀 Basic Text Generation Example\n');

  // Generate text using OpenAI GPT-4o
  console.log('Generating text with OpenAI GPT-4o...');
  const result = await generateText({
    model: aiStats('openai/gpt-4o'),
    prompt: 'Explain quantum computing in simple terms, in 2-3 sentences.',
  });

  console.log('\n📝 Generated Text:');
  console.log(result.text);

  console.log('\n📊 Usage:');
  console.log(`- Prompt tokens: ${result.usage.promptTokens}`);
  console.log(`- Completion tokens: ${result.usage.completionTokens}`);
  console.log(`- Total tokens: ${result.usage.promptTokens + result.usage.completionTokens}`);

  console.log('\n✅ Finish Reason:', result.finishReason);
}

main().catch(console.error);
