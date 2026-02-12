import type { DevToolsEntry } from "@/types";
import { safeJson } from "../../utils/format";

interface AudioViewProps {
  entry: DevToolsEntry;
}

export function AudioView({ entry }: AudioViewProps) {
  console.log("Rendering AudioView for entry:", entry);
  const isTranscription = entry?.type === "audio.transcriptions";
  const isTranslation = entry?.type === "audio.translations";
  const isSpeech = entry?.type === "audio.speech";
  const request = (entry?.request && typeof entry.request === "object") ? entry.request : {};

  return (
    <div className="space-y-6">
      {/* Input Text (for speech generation) */}
      {isSpeech && (request as any).input && (
        <section className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
          <h3 className="text-lg font-semibold mb-3">Input Text</h3>
          <div className="p-4 rounded-xl border border-border/60 bg-muted/60 whitespace-pre-wrap text-sm">
            {(request as any).input}
          </div>
        </section>
      )}

      {/* Transcription/Translation Result */}
      {(isTranscription || isTranslation) && entry.response?.text && (
        <section className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
          <h3 className="text-lg font-semibold mb-3">
            {isTranscription ? "Transcription" : "Translation"}
          </h3>
          <div className="p-4 rounded-xl border border-border/60 bg-muted/60 whitespace-pre-wrap text-sm">
            {entry.response.text}
          </div>
        </section>
      )}

      {/* Audio Player (if audio asset exists) */}
      {isSpeech && entry.response && (
        <section className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
          <h3 className="text-lg font-semibold mb-3">Generated Audio</h3>
          <div className="p-4 rounded-xl border border-border/60 bg-muted/60">
            <audio controls className="w-full">
              <source src={`/devtools-assets/audio/${entry.id}.mp3`} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
          </div>
        </section>
      )}

      {/* Request Parameters */}
      <details className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold">
          Request Parameters
        </summary>
        <pre className="text-xs p-4 bg-muted/60 rounded-xl overflow-x-auto mt-3 border border-border/60">
          {safeJson(
            {
              model: (request as any).model,
              voice: (request as any).voice,
              response_format: (request as any).response_format,
              speed: (request as any).speed,
              language: (request as any).language,
              ...Object.fromEntries(
                Object.entries(request).filter(
                  ([k]) => !["input", "file", "model"].includes(k)
                )
              )
            }
          )}
        </pre>
      </details>

      {/* Full Response */}
      {entry.response && (
        <details className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold">
            Full Response
          </summary>
          <pre className="text-xs p-4 bg-muted/60 rounded-xl overflow-x-auto mt-3 border border-border/60">
            {safeJson(entry.response)}
          </pre>
        </details>
      )}
    </div>
  );
}

