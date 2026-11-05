import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, Square } from "lucide-react";
import { errorText } from "../app/workspace";
import { showToast } from "../components/ui/toast";
import { usePersistedState } from "../lib/persistedState";
import { useCommand } from "../lib/keybindings";
import type { ComposerEditor } from "./composerEditor";
import { ToolButton } from "./Composer";
import { defaultDictationModel, dictationModelKey } from "../lib/dictation";

/** A recording stops on its own after this long, so a forgotten microphone does not run up a bill. */
const MAX_RECORDING_MS = 5 * 60_000;

const recordingType = () => ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find(type => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) ?? "audio/webm";

/**
 * Speak instead of typing: the first press records from the microphone, the second stops and inserts what was said at
 * the caret. Transcribed through the person's Phaseo account by the dictation model, at its price.
 */
export function DictationButton({ editor, disabled, active = true }: { editor: ComposerEditor; disabled?: boolean; active?: boolean }) {
	const [model] = usePersistedState(dictationModelKey, defaultDictationModel);
	const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
	const recorder = useRef<MediaRecorder>(undefined), timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => { clearTimeout(timer.current); recorder.current?.stream.getTracks().forEach(track => track.stop()); }, []);
	const insert = (text: string) => { const current = editor.editor; if (!current || current.isDestroyed || !text) return; current.chain().focus().insertContent(`${text} `).run(); };
	const start = async () => {
		const api = window.phaseoDesktop?.workspace;
		if (!api?.transcribe) return;
		let stream: MediaStream;
		try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
		catch (reason) { showToast("error", "The microphone is not available", reason instanceof DOMException && reason.name === "NotAllowedError" ? "Allow Phaseo to use the microphone in your system's privacy settings." : errorText(reason)); return; }
		const type = recordingType(), chunks: Blob[] = [], media = new MediaRecorder(stream, { mimeType: type });
		media.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
		media.onstop = () => {
			clearTimeout(timer.current); stream.getTracks().forEach(track => track.stop()); recorder.current = undefined;
			const blob = new Blob(chunks, { type });
			if (!blob.size) { setState("idle"); return; }
			setState("transcribing");
			void blob.arrayBuffer().then(buffer => api.transcribe(new Uint8Array(buffer), type.split(";")[0], model)).then(insert, reason => showToast("error", "Could not transcribe that", errorText(reason))).finally(() => setState("idle"));
		};
		recorder.current = media; media.start(); setState("recording");
		timer.current = setTimeout(() => { if (media.state === "recording") media.stop(); }, MAX_RECORDING_MS);
	};
	const toggle = () => { if (state === "recording") recorder.current?.stop(); else if (state === "idle") void start(); };
	useCommand("composer.dictate", () => { if (disabled) return false; toggle(); }, active && !disabled);
	return <ToolButton label={state === "recording" ? "Stop and insert what you said" : state === "transcribing" ? "Transcribing…" : "Dictate"} active={state === "recording"} disabled={disabled || state === "transcribing"} onClick={toggle}>
		{state === "recording" ? <Square className="fill-current text-destructive" /> : state === "transcribing" ? <LoaderCircle className="animate-spin" /> : <Mic />}
	</ToolButton>;
}
