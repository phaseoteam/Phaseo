/**
 * Tool Calling Example
 *
 * This example demonstrates function/tool calling with the AI Stats provider.
 *
 * Usage:
 *   AI_STATS_API_KEY=your_key tsx examples/tools.ts
 */

import { aiStats } from '../src/index.js';
import { generateText } from 'ai';
import { z } from 'zod';

async function main() {
  console.log('🚀 Tool Calling Example\n');

  console.log('Asking AI about weather using tool calling...\n');

  const result = await generateText({
    model: aiStats('openai/gpt-4o'),
    prompt: 'What is the weather like in San Francisco and London? Compare them.',
    tools: {
      getWeather: {
        description: 'Get the current weather for a city',
        parameters: z.object({
          city: z.string().describe('The city name'),
          unit: z.enum(['celsius', 'fahrenheit']).optional().describe('Temperature unit'),
        }),
        execute: async ({ city, unit = 'celsius' }) => {
          console.log(`🔧 Tool called: getWeather(${city}, ${unit})`);

          // Simulate API call
          const mockWeather: Record<string, any> = {
            'san francisco': { temp: 18, condition: 'Partly cloudy', humidity: 65 },
            'london': { temp: 12, condition: 'Rainy', humidity: 80 },
          };

          const weather = mockWeather[city.toLowerCase()] || {
            temp: 20,
            condition: 'Unknown',
            humidity: 50,
          };

          return {
            city,
            temperature: weather.temp,
            unit,
            condition: weather.condition,
            humidity: weather.humidity,
          };
        },
      },
    },
  });

  console.log('\n📝 AI Response:');
  console.log(result.text);

  console.log('\n📊 Usage:');
  console.log(`- Prompt tokens: ${result.usage.promptTokens}`);
  console.log(`- Completion tokens: ${result.usage.completionTokens}`);

  if (result.toolCalls && result.toolCalls.length > 0) {
    console.log('\n🔧 Tool Calls:');
    result.toolCalls.forEach((call, i) => {
      console.log(`  ${i + 1}. ${call.toolName}:`, JSON.stringify(call.args, null, 2));
    });
  }
}

main().catch(console.error);
