import { useCallback, useEffect, useRef, useState } from "react";
import { fetchChatWebApi } from "@/lib/web-api/client";
import { createPcmCapture, ensureAudioRunning } from "@/components/(chat)/rooms/realtimeAudio";

// Streaming transcription models (Mistral Voxtral Realtime) only take 16 kHz pcm16.
const LIVE_TRANSCRIPTION_SAMPLE_RATE = 16_000;
// After session.end the relay flushes the provider, sends the final text and settles the bill.
const FINISH_TIMEOUT_MS = 15_000;

type CapabilityModel = { modelId: string; capabilities?: string[] | null };

/** A realtime model that only turns speech into text, so it belongs in the Speech-to-text room. */
export function isLiveTranscriptionModel(model: CapabilityModel): boolean {
	const realtime = (model.capabilities ?? []).some(
		(capability) => capability.trim().toLowerCase() === "audio.realtime",
	);
	return realtime && /transcri/i.test(model.modelId);
}

export type LiveTranscriptionStatus = "idle" | "connecting" | "recording" | "finishing";

export type LiveTranscriptionResult = {
	text: string;
	sessionId: string | null;
	costUsd: number | null;
	audioSeconds: number | null;
	error: string | null;
};

export type LiveTranscriptionMessages = {
	microphoneDenied: string;
	sessionFailed: (status: number) => string;
	connectionLost: string;
};

type SessionResponse = {
	session_id?: string;
	id?: string;
	connect?: { url?: string; protocols?: string[] };
};

function readSessionError(payload: unknown): string | null {
	if (!payload || typeof payload !== "object") return null;
	const record = payload as Record<string, unknown>;
	const nested = record.error && typeof record.error === "object" ? (record.error as Record<string, unknown>) : null;
	for (const value of [record.message, nested?.message, record.reason, record.error]) {
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return null;
}

function readEventError(event: Record<string, unknown>): string | null {
	const nested = event.error && typeof event.error === "object" ? (event.error as Record<string, unknown>) : null;
	for (const value of [nested?.message, event.message, event.reason, event.error]) {
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return null;
}

export function useLiveTranscription({
	onFinished,
	messages,
}: {
	onFinished: (result: LiveTranscriptionResult) => void;
	messages: LiveTranscriptionMessages;
}) {
	const [status, setStatus] = useState<LiveTranscriptionStatus>("idle");
	const [text, setText] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [startedAt, setStartedAt] = useState<number | null>(null);
	const textRef = useRef("");
	const finalTextRef = useRef<string | null>(null);
	const errorRef = useRef<string | null>(null);
	const sessionIdRef = useRef<string | null>(null);
	const socketRef = useRef<WebSocket | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const contextRef = useRef<AudioContext | null>(null);
	const captureRef = useRef<{ stop: () => void } | null>(null);
	const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const finishedRef = useRef(true);
	const onFinishedRef = useRef(onFinished);
	onFinishedRef.current = onFinished;

	const releaseAudio = useCallback(() => {
		captureRef.current?.stop();
		captureRef.current = null;
		for (const track of streamRef.current?.getTracks() ?? []) track.stop();
		streamRef.current = null;
		void contextRef.current?.close().catch(() => undefined);
		contextRef.current = null;
	}, []);

	const finish = useCallback(
		(result: { costUsd?: number | null; audioSeconds?: number | null } = {}) => {
			if (finishedRef.current) return;
			finishedRef.current = true;
			if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
			finishTimerRef.current = null;
			releaseAudio();
			const socket = socketRef.current;
			socketRef.current = null;
			if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000);
			setStatus("idle");
			setStartedAt(null);
			const finalText = (finalTextRef.current ?? textRef.current).trim();
			// Failures before a session exists (microphone, session request) only show in the composer.
			if (finalText || sessionIdRef.current) {
				onFinishedRef.current({
					text: finalText,
					sessionId: sessionIdRef.current,
					costUsd: result.costUsd ?? null,
					audioSeconds: result.audioSeconds ?? null,
					error: errorRef.current,
				});
			}
		},
		[releaseAudio],
	);

	const fail = useCallback(
		(message: string) => {
			errorRef.current = message;
			setError(message);
			finish();
		},
		[finish],
	);

	const start = useCallback(
		async ({ provider, model }: { provider: string; model: string }) => {
			if (!finishedRef.current) return;
			finishedRef.current = false;
			textRef.current = "";
			finalTextRef.current = null;
			errorRef.current = null;
			sessionIdRef.current = null;
			setText("");
			setError(null);
			setStatus("connecting");

			// Microphone and audio first: never open a paid session that can't receive audio.
			try {
				streamRef.current = await navigator.mediaDevices.getUserMedia({
					audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
				});
				contextRef.current = new AudioContext({ sampleRate: LIVE_TRANSCRIPTION_SAMPLE_RATE });
				await ensureAudioRunning(contextRef.current);
			} catch (cause) {
				const denied = cause instanceof DOMException && cause.name === "NotAllowedError";
				fail(denied || !(cause instanceof Error) ? messages.microphoneDenied : cause.message);
				return;
			}

			let session: SessionResponse;
			try {
				const response = await fetchChatWebApi("/api/chat/realtime/session", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ provider, model }),
				});
				const payload = await response.json().catch(() => null);
				if (!response.ok) {
					fail(readSessionError(payload) ?? messages.sessionFailed(response.status));
					return;
				}
				session = payload as SessionResponse;
			} catch {
				fail(messages.sessionFailed(0));
				return;
			}
			if (finishedRef.current) return;
			sessionIdRef.current = session.session_id ?? session.id ?? null;
			if (!session.connect?.url) {
				fail(messages.sessionFailed(502));
				return;
			}

			const socket = new WebSocket(session.connect.url, session.connect.protocols);
			socketRef.current = socket;
			socket.onmessage = (message) => {
				let event: Record<string, unknown>;
				try {
					event = JSON.parse(String(message.data)) as Record<string, unknown>;
				} catch {
					return;
				}
				const type = typeof event.type === "string" ? event.type : "";
				if (type === "relay.connected") {
					const context = contextRef.current;
					const stream = streamRef.current;
					if (!context || !stream) return;
					const capture = createPcmCapture(
						context,
						stream,
						(chunk) => {
							if (socket.readyState === WebSocket.OPEN) {
								socket.send(JSON.stringify({ type: "client.audio", audio: chunk.audio }));
							}
						},
						(captureError) => fail(captureError.message),
					);
					captureRef.current = capture;
					capture.ready.catch((captureError: Error) => {
						if (!finishedRef.current) fail(captureError.message);
					});
					setStatus("recording");
					setStartedAt(Date.now());
					return;
				}
				if (type === "transcription.text.delta" && typeof event.text === "string") {
					textRef.current += event.text;
					setText(textRef.current);
					return;
				}
				if (type === "transcription.done" || (!type && typeof event.text === "string")) {
					if (typeof event.text === "string") finalTextRef.current = event.text;
					return;
				}
				if (type === "session.ended") {
					const cost = event.cost && typeof event.cost === "object" ? (event.cost as Record<string, unknown>) : null;
					const usage = event.usage && typeof event.usage === "object" ? (event.usage as Record<string, unknown>) : null;
					finish({
						costUsd: typeof cost?.total_usd === "number" ? cost.total_usd : null,
						audioSeconds: typeof usage?.audio_seconds === "number" ? usage.audio_seconds : null,
					});
					return;
				}
				if (type === "error" || type === "relay.upstream_error") {
					const reason = readEventError(event) ?? messages.connectionLost;
					errorRef.current = reason;
					setError(reason);
				}
			};
			socket.onclose = (event) => {
				if (finishedRef.current) return;
				if (event.code !== 1000 && !errorRef.current) {
					errorRef.current = messages.connectionLost;
					setError(messages.connectionLost);
				}
				finish();
			};
		},
		[fail, finish, messages],
	);

	const stop = useCallback(() => {
		if (finishedRef.current) return;
		captureRef.current?.stop();
		captureRef.current = null;
		const socket = socketRef.current;
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			finish();
			return;
		}
		setStatus("finishing");
		socket.send(JSON.stringify({ type: "session.end" }));
		finishTimerRef.current = setTimeout(() => finish(), FINISH_TIMEOUT_MS);
	}, [finish]);

	// Leaving the room ends the session so the microphone and the bill stop with it.
	useEffect(
		() => () => {
			const socket = socketRef.current;
			if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "session.end" }));
			finishedRef.current = true;
			if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
			releaseAudio();
			socket?.close(1000);
		},
		[releaseAudio],
	);

	return { status, text, error, startedAt, start, stop };
}
