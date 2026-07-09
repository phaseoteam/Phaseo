/**
 * Phaseo SDK - Devtools Integration Example
 *
 * This example demonstrates how to enable devtools for debugging and monitoring
 * your Phaseo API usage. The devtools capture all requests and responses locally,
 * which can be viewed using the devtools viewer.
 */

import { Phaseo, createPhaseoDevtools } from "../src/index.js";

// Example 1: Basic devtools setup
// This will automatically enable devtools in development (NODE_ENV !== 'production')
const client1 = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY!,
  devtools: createPhaseoDevtools()
});

// Example 2: Custom configuration
const client2 = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY!,
  devtools: createPhaseoDevtools({
    // Store data in custom directory
    directory: './my-devtools-data',

    // Flush to disk every 2 seconds (default: 1000ms)
    flushIntervalMs: 2000,

    // Capture HTTP headers for debugging (default: false)
    captureHeaders: true,

    // Don't save binary assets (default: true)
    saveAssets: false,

    // Limit queue size before forcing flush (default: 1000)
    maxQueueSize: 500
  })
});

// Example 3: Conditional devtools (only in dev)
const isDev = process.env.NODE_ENV !== 'production';
const client3 = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY!,
  devtools: isDev ? createPhaseoDevtools() : undefined
});

// Now make some API calls - all will be captured automatically
async function main() {
  console.log('Making API calls with devtools enabled...\n');

  // Chat completion
  const response1 = await client1.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: 'Explain quantum computing in simple terms' }
    ]
  });
  console.log('Chat completion:', response1.choices[0].message.content?.substring(0, 100) + '...');

  // Streaming chat
  console.log('\nStreaming chat:');
  const stream = client1.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: 'Count to 5' }
    ],
    stream: true
  });

  for await (const chunk of stream as AsyncGenerator<string>) {
    process.stdout.write(chunk);
  }
  console.log('\n');

  // Embeddings
  const embeddings = await client1.generateEmbedding({
    model: 'text-embedding-3-small',
    input: ['Hello world', 'Goodbye world']
  });
  console.log('Embeddings:', embeddings.data.length, 'vectors generated');

  // Get models
  const models = await client1.getModels();
  console.log('Available models:', models.models.length);

  console.log('\n✅ All requests captured!');
  console.log('View them by running: npx @phaseo/devtools-viewer');
  console.log('Or with the standalone package: npx devtools-viewer');
}

// Run the example
if (process.env.PHASEO_API_KEY) {
  main().catch(console.error);
} else {
  console.error('Please set PHASEO_API_KEY environment variable');
  process.exit(1);
}
