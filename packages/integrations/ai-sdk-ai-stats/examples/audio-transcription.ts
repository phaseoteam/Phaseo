/**
 * Audio Transcription Example
 *
 * This example demonstrates transcribing audio to text using the AI Stats provider.
 *
 * Usage:
 *   AI_STATS_API_KEY=your_key tsx examples/audio-transcription.ts
 */

import { aiStats } from '../src/index.js';
import { transcribe } from 'ai';
import { readFileSync } from 'fs';

async function main() {
  console.log('🚀 Audio Transcription Example\n');

  // For this example, you'll need an audio file
  // You can replace this with your own audio file path
  const audioFilePath = './audio-sample.mp3'; // Replace with actual audio file

  try {
    // Read audio file
    const audioData = readFileSync(audioFilePath);

    console.log('Transcribing audio with Whisper...');
    const result = await transcribe({
      model: aiStats.transcriptionModel('openai/whisper-1'),
      audioData: new Blob([audioData], { type: 'audio/mp3' }),
      language: 'en', // Optional: specify language
    });

    console.log('\n📝 Transcription:');
    console.log(result.text);

    if (result.segments) {
      console.log('\n⏱️  Segments:');
      result.segments.forEach((segment, i) => {
        console.log(`  ${i + 1}. [${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s]: ${segment.text}`);
      });
    }

    if (result.language) {
      console.log(`\n🌐 Detected Language: ${result.language}`);
    }

    if (result.duration) {
      console.log(`⏱️  Duration: ${result.duration.toFixed(2)}s`);
    }

    console.log('\n✅ Transcription example complete!');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.error('❌ Audio file not found. Please provide a valid audio file path.');
      console.log('\nTo test this example:');
      console.log('1. Place an audio file (MP3, WAV, etc.) in the examples directory');
      console.log('2. Update the audioFilePath variable in this file');
      console.log('3. Run the example again');
    } else {
      throw error;
    }
  }
}

main().catch(console.error);
