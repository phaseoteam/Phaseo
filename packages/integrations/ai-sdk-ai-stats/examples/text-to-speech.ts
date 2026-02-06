/**
 * Text-to-Speech Example
 *
 * This example demonstrates generating speech from text using the AI Stats provider.
 *
 * Usage:
 *   AI_STATS_API_KEY=your_key tsx examples/text-to-speech.ts
 */

import { aiStats } from '../src/index.js';
import { speak } from 'ai';
import { writeFileSync } from 'fs';

async function main() {
  console.log('🚀 Text-to-Speech Example\n');

  const textToSpeak = 'Hello! This is a demonstration of text to speech using the AI Stats Gateway. The quick brown fox jumps over the lazy dog.';

  console.log('Generating speech with OpenAI TTS...');
  console.log(`Text: "${textToSpeak}"\n`);

  const result = await speak({
    model: aiStats.speechModel('openai/tts-1'),
    text: textToSpeak,
    voice: 'alloy', // Options: alloy, echo, fable, onyx, nova, shimmer
    speed: 1.0, // 0.25 to 4.0
    outputFormat: 'mp3', // mp3, opus, aac, flac, wav, pcm
  });

  console.log('🔊 Speech Generated:');
  console.log(`- Audio format: ${result.format}`);
  console.log(`- Audio size: ${result.audio.length} bytes`);

  // Save to file
  const outputPath = './output-speech.mp3';
  writeFileSync(outputPath, result.audio);
  console.log(`- Saved to: ${outputPath}`);

  if (result.warnings && result.warnings.length > 0) {
    console.log(`- Warnings: ${result.warnings.join(', ')}`);
  }

  // Generate with different voice
  console.log('\n\nGenerating with different voice (nova)...');
  const result2 = await speak({
    model: aiStats.speechModel('openai/tts-1-hd'), // HD quality
    text: 'This is using the Nova voice with high definition quality.',
    voice: 'nova',
    outputFormat: 'mp3',
  });

  const outputPath2 = './output-speech-nova.mp3';
  writeFileSync(outputPath2, result2.audio);
  console.log(`🔊 Saved HD speech to: ${outputPath2}`);

  console.log('\n✅ Text-to-speech example complete!');
  console.log('\nYou can now play the generated audio files.');
}

main().catch(console.error);
