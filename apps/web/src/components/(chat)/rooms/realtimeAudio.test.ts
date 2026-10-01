import { calculateRms, createAudioBufferFromPcm16, createPcmCapture, ensureAudioRunning, floatTo16BitPcmBase64 } from "./realtimeAudio";

function fixture() {
	const node = () => ({ connect: jest.fn(), disconnect: jest.fn() });
	const processor = { ...node(), onaudioprocess: null as ((event: unknown) => void) | null };
	const track = Object.assign(new EventTarget(), { readyState: "live" });
	const context = {
		state: "running", sampleRate: 24_000,
		resume: jest.fn(async () => { context.state = "running"; }),
		createMediaStreamSource: jest.fn(node), createScriptProcessor: jest.fn(() => processor),
		createGain: jest.fn(() => ({ ...node(), gain: { value: 1 } })), destination: {},
		createBuffer: jest.fn((_channels: number, length: number) => {
			const data = new Float32Array(length);
			return { getChannelData: () => data };
		}),
	};
	const stream = { getAudioTracks: () => [track] };
	return { context: context as unknown as AudioContext, stream: stream as unknown as MediaStream, processor, track,
		frame: (samples = new Float32Array(4096).fill(0.25)) => processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => samples } }) };
}

afterEach(() => jest.useRealTimers());

it("encodes clipped signed little-endian PCM and decodes provider audio", () => {
	const { context } = fixture();
	const audio = floatTo16BitPcmBase64(new Float32Array([-2, -0.5, 0, 0.5, 2]));
	expect([...Buffer.from(audio, "base64")]).toEqual([0, 128, 0, 192, 0, 0, 255, 63, 255, 127]);
	const decoded = createAudioBufferFromPcm16(context, audio).getChannelData(0);
	expect(decoded[0]).toBe(-1); expect(decoded[3]).toBeCloseTo(0.5, 4);
	expect(() => createAudioBufferFromPcm16(context, "AA==")).toThrow("Invalid PCM");
	expect(calculateRms(new Float32Array())).toBe(0);
});

it("resumes a suspended context before reporting audio ready", async () => {
	const { context } = fixture();
	Object.assign(context, { state: "suspended" });
	await ensureAudioRunning(context);
	expect(context.resume).toHaveBeenCalledTimes(1);
	expect(context.state).toBe("running");
});

it("times out blocked autoplay instead of opening a paid session", async () => {
	jest.useFakeTimers();
	const { context } = fixture();
	Object.assign(context, { state: "suspended", resume: () => new Promise(() => {}) });
	const assertion = expect(ensureAudioRunning(context)).rejects.toThrow("Audio could not start");
	await jest.advanceTimersByTimeAsync(5_000);
	await assertion;
	expect(jest.getTimerCount()).toBe(0);
});

it("waits for real frames and forwards PCM with accurate duration and level", async () => {
	const { context, stream, frame } = fixture();
	const chunks = jest.fn(); const failure = jest.fn();
	const capture = createPcmCapture(context, stream, chunks, failure);
	const ready = jest.fn(); void capture.ready.then(ready);
	await Promise.resolve(); expect(ready).not.toHaveBeenCalled();
	frame(); await capture.ready;
	expect(chunks).toHaveBeenCalledWith(expect.objectContaining({ rms: 0.25, durationMs: 4096 / 24 }));
	expect(Buffer.from(chunks.mock.calls[0][0].audio, "base64")).toHaveLength(8192);
	capture.stop(); frame(); expect(chunks).toHaveBeenCalledTimes(1); expect(failure).not.toHaveBeenCalled();
});

it("rejects missing input before the billable connection starts", async () => {
	jest.useFakeTimers();
	const { context, stream } = fixture();
	const failure = jest.fn(); const capture = createPcmCapture(context, stream, jest.fn(), failure);
	const assertion = expect(capture.ready).rejects.toThrow("No microphone audio frames");
	await jest.advanceTimersByTimeAsync(6_000); await assertion;
	expect(failure).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
});

it.each(["suspended", "stalled", "ended"])("stops established capture when %s", async (reason) => {
	jest.useFakeTimers();
	const { context, stream, frame, track, processor } = fixture();
	const failure = jest.fn(); const capture = createPcmCapture(context, stream, jest.fn(), failure);
	frame(); await capture.ready;
	if (reason === "suspended") Object.assign(context, { state: "suspended" });
	if (reason === "ended") track.dispatchEvent(new Event("ended"));
	await jest.advanceTimersByTimeAsync(6_000);
	expect(failure).toHaveBeenCalledTimes(1); expect(processor.onaudioprocess).toBeNull(); expect(jest.getTimerCount()).toBe(0);
});

it("treats silence as valid capture, not a reason to terminate", async () => {
	const { context, stream, frame } = fixture();
	const chunks = jest.fn(); const capture = createPcmCapture(context, stream, chunks, jest.fn());
	frame(new Float32Array(4096)); await capture.ready;
	expect(chunks).toHaveBeenCalledWith(expect.objectContaining({ rms: 0 })); capture.stop();
});
