/**
 * Basic Text Generation Example
 *
 * This example demonstrates simple text generation using the Phaseo provider.
 *
 * Usage:
 *   PHASEO_API_KEY=your_key tsx examples/basic-text.ts
 */

import { phaseo } from '../src/index.js';
import { generateText } from 'ai';

async function main() {
  console.log('🚀 Basic Text Generation Example\n');

  // Generate text using OpenAI GPT-4o
  console.log('Generating text with OpenAI GPT-4o...');
  const result = await generateText({
    model: phaseo('openai/gpt-4o'),
    prompt: 'Explain quantum computing in simple terms, in 2-3 sentences.',
  });

  console.log('\n📝 Generated Text:');
  console.log(result.text);

  console.log('\n📊 Usage:');
  console.log(`- Input tokens: ${result.usage.inputTokens}`);
  console.log(`- Output tokens: ${result.usage.outputTokens}`);
  console.log(`- Total tokens: ${result.usage.inputTokens + result.usage.outputTokens}`);

  console.log('\n🧭 Provider Metadata:');
  console.log(JSON.stringify(result.providerMetadata ?? {}, null, 2));

  console.log('\n✅ Finish Reason:', result.finishReason);
}

main().catch(console.error);
