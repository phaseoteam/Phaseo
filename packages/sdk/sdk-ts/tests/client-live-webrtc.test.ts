import { describe, expect, test, vi } from "vitest";
import { connectLiveWebRTC } from "../src/index.js";

type Listener = (event: any) => void;

class FakeTarget {
	private listeners = new Map<string, Listener[]>();
	addEventListener(type: string, listener: Listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
	removeEventListener(type: string, listener: Listener) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener)); }
	emit(type: string, event: unknown = {}) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
}

class FakeDataChannel extends FakeTarget {
	readyState = "connecting";
	sent: unknown[] = [];
	constructor(readonly label: string) { super(); }
	send(data: string) { this.sent.push(JSON.parse(data)); }
	close() { this.readyState = "closed"; }
}

class FakePeerConnection extends FakeTarget {
	iceGatheringState = "gathering";
	localDescription: { type: string; sdp: string } | null = null;
	remoteDescription: { type: string; sdp: string } | null = null;
	tracks: unknown[] = [];
	channel: FakeDataChannel | null = null;
	closed = false;
	addTrack(track: unknown) { this.tracks.push(track); }
	createDataChannel(label: string) { this.channel = new FakeDataChannel(label); return this.channel; }
	async createOffer() { return { type: "offer", sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n" }; }
	async setLocalDescription(description: { type: string; sdp: string }) {
		this.localDescription = description;
		queueMicrotask(() => { this.iceGatheringState = "complete"; this.emit("icegatheringstatechange"); });
	}
	async setRemoteDescription(description: { type: string; sdp: string }) {
		this.remoteDescription = description;
		queueMicrotask(() => { this.channel!.readyState = "open"; this.channel!.emit("open"); });
	}
	close() { this.closed = true; }
}

const track = { kind: "audio", stop: vi.fn() };
const stream = { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;

function microphone() {
	const ownTrack = { kind: "audio", stopped: false, stop() { this.stopped = true; } };
	const ownStream = { getAudioTracks: () => [ownTrack], getTracks: () => [ownTrack] };
	vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => ownStream) } });
	return ownTrack;
}
const audioElement = {} as HTMLAudioElement;

describe("connectLiveWebRTC", () => {
	test("sends the offer to your server, applies the answer and passes data channel events on", async () => {
		const pc = new FakePeerConnection();
		const events: unknown[] = [];
		const createSession = vi.fn(async (sdp: string) => ({ id: "rt_test", transport: { type: "webrtc", sdp: `v=0\r\nanswer for ${sdp.length}` } }));
		const connection = await connectLiveWebRTC({ createSession, stream, audioElement,
			peerConnection: pc as unknown as RTCPeerConnection, onEvent: (event) => events.push(event) });
		expect(createSession).toHaveBeenCalledWith("v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n");
		expect(pc.tracks).toEqual([track]);
		expect(pc.channel?.label).toBe("oai-events");
		expect(pc.remoteDescription).toEqual({ type: "answer", sdp: expect.stringMatching(/^v=0/) });
		expect(connection.session.id).toBe("rt_test");
		pc.channel!.emit("message", { data: JSON.stringify({ type: "session.paused" }) });
		expect(events).toEqual([{ type: "session.paused" }]);
		vi.useFakeTimers();
		connection.close();
		expect(pc.channel!.sent).toEqual([{ type: "session.close" }]);
		vi.advanceTimersByTime(1_000);
		expect(pc.closed).toBe(true);
		vi.useRealTimers();
	});

	test("closes the peer connection when the server returns a relay session instead", async () => {
		const pc = new FakePeerConnection();
		await expect(connectLiveWebRTC({ stream, audioElement, peerConnection: pc as unknown as RTCPeerConnection,
			createSession: async () => ({ id: "rt_test", connect: { transport: "websocket", url: "/v1/live/sessions/rt_test/relay" } }) }))
			.rejects.toThrow("no WebRTC answer");
		expect(pc.closed).toBe(true);
		expect(track.stop).not.toHaveBeenCalled();
	});

	test("stops the microphone it opened when setup fails, including peer creation", async () => {
		const ownTrack = microphone();
		const pc = new FakePeerConnection();
		await expect(connectLiveWebRTC({ audioElement, peerConnection: pc as unknown as RTCPeerConnection,
			createSession: async () => { throw new Error("server said no"); } })).rejects.toThrow("server said no");
		expect(ownTrack.stopped).toBe(true);
		expect(pc.closed).toBe(true);

		const second = microphone();
		vi.stubGlobal("RTCPeerConnection", class { constructor() { throw new Error("no WebRTC here"); } });
		await expect(connectLiveWebRTC({ audioElement, createSession: vi.fn() })).rejects.toThrow("no WebRTC here");
		expect(second.stopped).toBe(true);
		vi.unstubAllGlobals();
	});

	test("stops the microphone it opened on close, never a stream the caller passed", async () => {
		const ownTrack = microphone();
		const pc = new FakePeerConnection();
		const createSession = async () => ({ id: "rt_test", transport: { type: "webrtc", sdp: "v=0\r\nanswer" } });
		const connection = await connectLiveWebRTC({ audioElement, createSession, peerConnection: pc as unknown as RTCPeerConnection });
		vi.useFakeTimers();
		connection.close();
		expect(ownTrack.stopped).toBe(true);
		vi.advanceTimersByTime(1_000);
		expect(pc.closed).toBe(true);
		vi.useRealTimers();
		vi.unstubAllGlobals();

		const callerPc = new FakePeerConnection();
		const callers = await connectLiveWebRTC({ stream, audioElement, createSession, peerConnection: callerPc as unknown as RTCPeerConnection });
		vi.useFakeTimers();
		callers.close();
		vi.advanceTimersByTime(1_000);
		expect(callerPc.closed).toBe(true);
		expect(track.stop).not.toHaveBeenCalled();
		vi.useRealTimers();
	});
});
