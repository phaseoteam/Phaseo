// Build a no-network browser check for playwright-cli run-code --filename.
// Uses the production audio module; never loads the app, credentials, billing or OpenAI.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const appRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(appRoot, "src/components/(chat)/rooms/realtimeAudio.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const html = `<!doctype html><button id="start">Run offline audio check</button><pre id="result">Ready</pre>
<script>window.audioModule = {}; ((exports) => {${compiled}})(window.audioModule);
document.querySelector('#start').onclick = async () => {
 const { createPcmCapture, ensureAudioRunning, createAudioBufferFromPcm16, calculateRms } = window.audioModule;
 const input = new AudioContext({sampleRate:24000}); const output = new AudioContext({sampleRate:24000});
 let capture; let oscillator; let socket;
 const result = window.audioResult = {preflightFrames:0, sentFrames:0, receivedAudio:0, playbackEnded:false, failure:null};
 try {
  await Promise.all([ensureAudioRunning(input), ensureAudioRunning(output)]);
  const destination = input.createMediaStreamDestination();
  oscillator = input.createOscillator(); oscillator.frequency.value = 440;
  const gain = input.createGain(); gain.gain.value = 0.2;
  oscillator.connect(gain); gain.connect(destination); oscillator.start();
  let accepted = false; let lastChunk;
  capture = createPcmCapture(input, destination.stream, chunk => {
   lastChunk = chunk;
   if (!accepted) {result.preflightFrames++;return;}
   if (socket.readyState === WebSocket.OPEN) {socket.send(JSON.stringify({type:'client.audio', audio:chunk.audio, rms:chunk.rms}));result.sentFrames++;}
  }, error => {result.failure = error.message;});
  await capture.ready;
  result.inputState = input.state; result.outputState = output.state;
  result.inputRms = lastChunk.rms; result.durationMs = lastChunk.durationMs;
  socket = new WebSocket('ws://localhost:3101/offline-realtime-relay');
  await new Promise((resolve,reject) => {
   const timeout = setTimeout(() => reject(new Error('Offline round trip timed out')), 5000);
   socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.type === 'session.started') {accepted = true;return;}
    if (message.type !== 'session.output_audio.delta') return;
    result.receivedAudio++;
    const buffer = createAudioBufferFromPcm16(output, message.delta);
    result.outputRms = calculateRms(buffer.getChannelData(0));
    const player = output.createBufferSource(); player.buffer = buffer; player.connect(output.destination);
    player.onended = () => {clearTimeout(timeout);result.playbackEnded = true;player.disconnect();resolve();};
    player.start();
   };
  });
  // Also verify that losing the audio clock invokes the production failure handler.
  await input.suspend();
  await new Promise(resolve => setTimeout(resolve, 1200));
  result.stallDetected = !!result.failure;
 } catch(error) {result.error = String(error);}
 finally {capture?.stop();socket?.close();oscillator?.stop();await Promise.all([input.close(),output.close()]);}
 result.done = true; document.querySelector('#result').textContent = JSON.stringify(result,null,2);
};</script>`;
const code = `async (page) => {
 const unexpectedRequests = [];
 await page.route('**/*', route => {
  if (route.request().url() === 'http://localhost:3101/offline-audio-check') return route.fulfill({contentType:'text/html',body:${JSON.stringify(html)}});
  unexpectedRequests.push(route.request().url()); return route.abort();
 });
 let receivedFrames = 0;
 await page.routeWebSocket('**/*', socket => {
  if (socket.url() !== 'ws://localhost:3101/offline-realtime-relay') throw new Error('Unexpected WebSocket');
  socket.send(JSON.stringify({type:'session.started'}));
  socket.onMessage(raw => {
   const message = JSON.parse(String(raw));
   if (message.type !== 'client.audio' || message.rms <= 0) throw new Error('Invalid microphone frame');
   if (++receivedFrames === 1) socket.send(JSON.stringify({type:'session.output_audio.delta',delta:message.audio}));
  });
 });
 await page.goto('http://localhost:3101/offline-audio-check');
 console.log(await page.locator('body').ariaSnapshot());
 await page.getByRole('button',{name:'Run offline audio check'}).click();
 await page.waitForFunction(() => window.audioResult?.done, {timeout:15000});
 const result = await page.evaluate(() => window.audioResult);
 console.log(JSON.stringify({result,receivedFrames,unexpectedRequests}));
 if (result.error || !result.playbackEnded || !result.stallDetected || result.preflightFrames < 1 || receivedFrames < 1 || result.inputRms < 0.05 || result.outputRms < 0.05 || unexpectedRequests.length) throw new Error('Offline audio smoke failed');
}`;
const output = path.join(appRoot, "output/playwright/realtime-audio-smoke.js");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, code);
console.log(output);
