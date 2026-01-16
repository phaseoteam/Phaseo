/**
 * Embeddings Example
 *
 * This example demonstrates generating embeddings using the AI Stats provider.
 *
 * Usage:
 *   AI_STATS_API_KEY=your_key tsx examples/embeddings.ts
 */

import { aiStats } from '../src/index.js';
import { embed, embedMany } from 'ai';

async function main() {
  console.log('🚀 Embeddings Example\n');

  // Single embedding
  console.log('Generating single embedding...');
  const singleResult = await embed({
    model: aiStats.textEmbeddingModel('openai/text-embedding-3-small'),
    value: 'Hello, world!',
  });

  console.log('\n📊 Single Embedding:');
  console.log(`- Dimension: ${singleResult.embedding.length}`);
  console.log(`- First 5 values: [${singleResult.embedding.slice(0, 5).join(', ')}...]`);
  console.log(`- Tokens used: ${singleResult.usage?.tokens ?? 'N/A'}`);

  // Batch embeddings
  console.log('\n\nGenerating batch embeddings...');
  const batchResult = await embedMany({
    model: aiStats.textEmbeddingModel('openai/text-embedding-3-small'),
    values: [
      'Artificial intelligence is transforming technology',
      'Machine learning enables computers to learn from data',
      'The weather is nice today',
    ],
  });

  console.log('\n📊 Batch Embeddings:');
  console.log(`- Number of embeddings: ${batchResult.embeddings.length}`);
  console.log(`- Dimension: ${batchResult.embeddings[0].length}`);
  console.log(`- Total tokens used: ${batchResult.usage?.tokens ?? 'N/A'}`);

  // Compute similarity between first two (AI-related) and last (weather)
  const cosineSimilarity = (a: number[], b: number[]) => {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magA * magB);
  };

  const sim1_2 = cosineSimilarity(batchResult.embeddings[0], batchResult.embeddings[1]);
  const sim1_3 = cosineSimilarity(batchResult.embeddings[0], batchResult.embeddings[2]);

  console.log('\n🔍 Similarity Scores (Cosine):');
  console.log(`- AI text 1 vs AI text 2: ${sim1_2.toFixed(4)} (should be high)`);
  console.log(`- AI text 1 vs Weather text: ${sim1_3.toFixed(4)} (should be lower)`);

  console.log('\n✅ Embeddings example complete!');
}

main().catch(console.error);
