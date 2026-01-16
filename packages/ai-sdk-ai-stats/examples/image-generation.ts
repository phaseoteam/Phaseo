/**
 * Image Generation Example
 *
 * This example demonstrates generating images using the AI Stats provider.
 *
 * Usage:
 *   AI_STATS_API_KEY=your_key tsx examples/image-generation.ts
 */

import { aiStats } from '../src/index.js';
import { generateImage } from 'ai';

async function main() {
  console.log('🚀 Image Generation Example\n');

  // Generate a single image
  console.log('Generating image with DALL-E 3...');
  const result = await generateImage({
    model: aiStats.imageModel('openai/dall-e-3'),
    prompt: 'A serene landscape with mountains and a lake at sunset, digital art style',
    n: 1,
    size: '1024x1024',
  });

  console.log('\n🖼️  Image Generated:');
  console.log(`- Number of images: ${result.images.length}`);

  if (result.images[0].url) {
    console.log(`- Image URL: ${result.images[0].url}`);
  } else if (result.images[0].base64) {
    console.log(`- Base64 image: ${result.images[0].base64.substring(0, 50)}...`);
  }

  if (result.warnings && result.warnings.length > 0) {
    console.log(`- Warnings: ${result.warnings.join(', ')}`);
  }

  // Generate multiple images (if model supports it)
  console.log('\n\nGenerating multiple images with DALL-E 2...');
  const multiResult = await generateImage({
    model: aiStats.imageModel('openai/dall-e-2'),
    prompt: 'A cute robot playing with a cat, cartoon style',
    n: 2,
    size: '512x512',
  });

  console.log('\n🖼️  Multiple Images Generated:');
  console.log(`- Number of images: ${multiResult.images.length}`);
  multiResult.images.forEach((img, i) => {
    if (img.url) {
      console.log(`  ${i + 1}. ${img.url}`);
    }
  });

  console.log('\n✅ Image generation example complete!');
}

main().catch(console.error);
