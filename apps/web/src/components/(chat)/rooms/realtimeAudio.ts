export type PcmChunk = { audio: string; durationMs: number; rms: number };

export function floatTo16BitPcmBase64(input: Float32Array): string {
	const bytes = new Uint8Array(input.length * 2);
	const view = new DataView(bytes.buffer);
	for (let i = 0; i < input.length; i++) {
		const sample = Math.max(-1, Math.min(1, input[i] ?? 0));
		view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
	}
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

export function calculateRms(input: Float32Array): number {
	if (!input.length) return 0;
	let squares = 0;
	for (const sample of input) squares += sample * sample;
	return Math.sqrt(squares / input.length);
}

export function createAudioBufferFromPcm16(context: AudioContext, base64: string, sampleRate = 24_000): AudioBuffer {
	const binary = atob(base64);
	if (binary.length % 2) throw new Error("Invalid PCM audio length.");
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	const view = new DataView(bytes.buffer);
	const buffer = context.createBuffer(1, bytes.length / 2, sampleRate);
	const channel = buffer.getChannelData(0);
	for (let i = 0; i < channel.length; i++) channel[i] = view.getInt16(i * 2, true) / 0x8000;
	return buffer;
}

/** resume() can remain pending when autoplay is blocked. Never open a paid session in that state. */
export async function ensureAudioRunning(context: AudioContext): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			context.state === "running" ? Promise.resolve() : context.resume(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("Audio could not start. Allow audio in this browser and try again.")), 5_000);
			}),
		]);
		if (context.state !== "running") throw new Error("Audio is not running. Check your browser audio permissions.");
	} finally {
		clearTimeout(timer);
	}
}

/** No audio is buffered: callers can discard preflight frames until the provider accepts the session. */
export function createPcmCapture(
	context: AudioContext,
	stream: MediaStream,
	onChunk: (chunk: PcmChunk) => void,
	onFailure: (error: Error) => void,
) {
	const source = context.createMediaStreamSource(stream);
	const processor = context.createScriptProcessor(4096, 1, 1);
	const monitor = context.createGain();
	monitor.gain.value = 0;
	let stopped = false;
	let receivedFrame = false;
	let lastFrameAt = performance.now();
	let resolveReady!: () => void;
	let rejectReady!: (error: Error) => void;
	const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
	const tracks = stream.getAudioTracks();
	const stop = () => {
		if (stopped) return;
		stopped = true;
		clearInterval(watchdog);
		processor.onaudioprocess = null;
		processor.disconnect(); source.disconnect(); monitor.disconnect();
		for (const track of tracks) track.removeEventListener("ended", ended);
		if (!receivedFrame) rejectReady(new Error("Microphone check cancelled."));
	};
	const fail = (error: Error) => {
		if (stopped) return;
		// Reject before cleanup so the useful failure, not cancellation, reaches the UI.
		rejectReady(error);
		stop();
		if (receivedFrame) onFailure(error);
	};
	const ended = () => fail(new Error("Microphone disconnected. The session was stopped."));
	const watchdog = setInterval(() => {
		if (context.state !== "running" || tracks.some((track) => track.readyState === "ended")) {
			fail(new Error("Audio capture stopped. Check your microphone and browser audio permissions."));
		} else if (performance.now() - lastFrameAt > 5_000) {
			fail(new Error("No microphone audio frames received. Check your microphone and try again."));
		}
	}, 1_000);
	for (const track of tracks) track.addEventListener("ended", ended);
	processor.onaudioprocess = (event) => {
		if (stopped) return;
		lastFrameAt = performance.now();
		const input = event.inputBuffer.getChannelData(0);
		try {
			onChunk({ audio: floatTo16BitPcmBase64(input), rms: calculateRms(input), durationMs: input.length / context.sampleRate * 1000 });
			receivedFrame = true;
			resolveReady();
		} catch (error) {
			fail(error instanceof Error ? error : new Error("Microphone audio could not be forwarded."));
		}
	};
	source.connect(processor); processor.connect(monitor); monitor.connect(context.destination);
	return { ready, stop };
}
