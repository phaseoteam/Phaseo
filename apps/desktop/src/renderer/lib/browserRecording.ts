import { useSyncExternalStore } from "react";
import { chooseBrowserRecordingMimeType, type BrowserRecording } from "../../shared/browser";

/** A recording saved on this computer, and the page it shows. */
export type SavedBrowserRecording = BrowserRecording & { tabId: string; url: string };
type Active = { recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; url: string; stopped: Promise<void> };

// Recordings outlive the surface that started them, so switching tabs or floating the page keeps recording.
const active = new Map<string, Active>();
const listeners = new Set<() => void>();
const changed = () => { for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useBrowserRecording(tabId: string | undefined) { return useSyncExternalStore(subscribe, () => Boolean(tabId && active.has(tabId))); }
export const isBrowserRecording = (tabId: string) => active.has(tabId);

/** Bits per second scaled with the captured pixels, within T3 Code's bounds. */
export function recordingBitrate(width = 1920, height = 1080, frameRate = 30) { return Math.round(Math.min(50_000_000, Math.max(2_500_000, width * height * frameRate * 0.05))); }

/** Records a tab's page, not the window around it, through the tab's own capture stream. */
export async function startBrowserRecording(tabId: string, url: string) {
	const api = window.phaseoDesktop;
	if (!api) throw new Error("Recording needs the desktop app.");
	if (active.has(tabId)) return;
	const mimeType = chooseBrowserRecordingMimeType(type => MediaRecorder.isTypeSupported(type));
	if (!mimeType) throw new Error("This computer cannot record video.");
	const source = await api.browserRecordingSource(tabId);
	// Chromium's tab capture takes these legacy constraints; the standard types do not describe them.
	const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: source } } } as unknown as MediaStreamConstraints);
	const settings = stream.getVideoTracks()[0]?.getSettings();
	const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: recordingBitrate(settings?.width, settings?.height, settings?.frameRate) });
	const chunks: Blob[] = [];
	recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
	const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
	// A page that closes ends its stream, which stops the recording too.
	stream.getVideoTracks()[0]?.addEventListener("ended", () => { if (recorder.state !== "inactive") recorder.stop(); });
	recorder.start(1000);
	active.set(tabId, { recorder, stream, chunks, url, stopped });
	changed();
}

/** Stops a tab's recording and saves it; undefined when it was not recording. */
export async function stopBrowserRecording(tabId: string): Promise<SavedBrowserRecording | undefined> {
	const current = active.get(tabId);
	if (!current) return;
	try {
		if (current.recorder.state !== "inactive") current.recorder.stop();
		await current.stopped;
	} finally {
		for (const track of current.stream.getTracks()) track.stop();
		active.delete(tabId); changed();
	}
	const mimeType = current.recorder.mimeType || current.chunks.find(chunk => chunk.type)?.type;
	if (!mimeType || !current.chunks.length) throw new Error("Nothing was recorded.");
	const blob = new Blob(current.chunks, { type: mimeType });
	const saved = await window.phaseoDesktop!.browserRecordingSave(mimeType, new Uint8Array(await blob.arrayBuffer()));
	return { ...saved, tabId, url: current.url };
}

/** Answers an agent's request to start or stop recording one of its chat's tabs, through the same recorder the person uses. */
export function answerAgentRecordings() {
	const api = window.phaseoDesktop;
	if (!api?.onBrowserAgentRecord) return;
	api.onBrowserAgentRecord(request => {
		const work = request.action === "start" ? startBrowserRecording(request.tabId, request.url).then(() => undefined) : stopBrowserRecording(request.tabId);
		void work.then(saved => api.browserAgentRecorded(request.requestId, saved ? { path: saved.path, mimeType: saved.mimeType, size: saved.size } : undefined), (error: unknown) => api.browserAgentRecorded(request.requestId, undefined, error instanceof Error ? error.message : "Recording failed."));
	});
}

/** The file manager's name, for the reveal action. */
export function revealLabel(platform: string) { const value = platform.toLowerCase(); return value.includes("darwin") || value.includes("mac") ? "Reveal in Finder" : value.includes("win") ? "Reveal in File Explorer" : "Reveal in Files"; }
