/**
 * Structured Output Example
 *
 * This example demonstrates generating structured data using JSON schemas.
 *
 * Usage:
 *   AI_STATS_API_KEY=your_key tsx examples/structured-output.ts
 */

import { aiStats } from '../src/index.js';
import { generateObject } from 'ai';
import { z } from 'zod';

async function main() {
  console.log('🚀 Structured Output Example\n');

  console.log('Generating structured user profile...\n');

  const result = await generateObject({
    model: aiStats('openai/gpt-4o'),
    schema: z.object({
      name: z.string().describe('Full name'),
      age: z.number().describe('Age in years'),
      email: z.string().email().describe('Email address'),
      occupation: z.string().describe('Current occupation'),
      interests: z.array(z.string()).describe('List of interests or hobbies'),
      location: z.object({
        city: z.string(),
        country: z.string(),
      }),
    }),
    prompt: 'Generate a realistic user profile for a software engineer in their 30s.',
  });

  console.log('📦 Generated Object:');
  console.log(JSON.stringify(result.object, null, 2));

  console.log('\n📊 Usage:');
  console.log(`- Prompt tokens: ${result.usage.promptTokens}`);
  console.log(`- Completion tokens: ${result.usage.completionTokens}`);

  console.log('\n✅ Finish Reason:', result.finishReason);
}

main().catch(console.error);
