/**
 * Multi-Provider Example
 *
 * This example demonstrates using multiple AI providers through the gateway.
 *
 * Usage:
 *   AI_STATS_API_KEY=your_key tsx examples/multi-provider.ts
 */

import { aiStats } from '../src/index.js';
import { generateText } from 'ai';

async function main() {
  console.log('🚀 Multi-Provider Example\n');

  const prompt = 'Write a haiku about programming.';

  const providers = [
    { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o' },
    { id: 'anthropic/claude-3-5-sonnet', name: 'Anthropic Claude 3.5 Sonnet' },
    { id: 'google/gemini-2.5-pro-latest', name: 'Google Gemini 2.5 Pro' },
  ];

  console.log(`Prompt: "${prompt}"\n`);

  for (const provider of providers) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🤖 ${provider.name}`);
    console.log('='.repeat(60));

    try {
      const result = await generateText({
        model: aiStats(provider.id),
        prompt,
      });

      console.log('\n📝 Response:');
      console.log(result.text);

      console.log('\n📊 Usage:');
      console.log(`- Tokens: ${result.usage.promptTokens + result.usage.completionTokens}`);
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}`);
    }
  }

  console.log(`\n${'='.repeat(60)}\n`);
  console.log('✅ Multi-provider comparison complete!');
}

main().catch(console.error);
