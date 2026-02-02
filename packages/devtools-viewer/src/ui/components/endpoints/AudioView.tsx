import type { DevToolsEntry } from "@ai-stats/devtools-core";

interface AudioViewProps {
  entry: DevToolsEntry;
}

export function AudioView({ entry }: AudioViewProps) {
  const isTranscription = entry.type === "audio.transcriptions";
  const isTranslation = entry.type === "audio.translations";
  const isSpeech = entry.type === "audio.speech";

  return (
    <div className="space-y-6">
      {/* Input Text (for speech generation) */}
      {isSpeech && entry.request.input && (
        <div>
          <h3 className="font-semibold mb-3">Input Text</h3>
          <div className="p-4 rounded border border-border bg-muted/30 whitespace-pre-wrap text-sm">
            {entry.request.input}
          </div>
        </div>
      )}

      {/* Transcription/Translation Result */}
      {(isTranscription || isTranslation) && entry.response?.text && (
        <div>
          <h3 className="font-semibold mb-3">
            {isTranscription ? "Transcription" : "Translation"}
          </h3>
          <div className="p-4 rounded border border-border bg-muted/30 whitespace-pre-wrap text-sm">
            {entry.response.text}
          </div>
        </div>
      )}

      {/* Audio Player (if audio asset exists) */}
      {isSpeech && entry.response && (
        <div>
          <h3 className="font-semibold mb-3">Generated Audio</h3>
          <div className="p-4 rounded border border-border bg-muted/30">
            <audio controls className="w-full">
              <source src={`/assets/audio/${entry.id}.mp3`} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
          </div>
        </div>
      )}

      {/* Request Parameters */}
      <details>
        <summary className="cursor-pointer font-semibold mb-3">
          Request Parameters
        </summary>
        <pre className="text-xs p-4 bg-muted/30 rounded overflow-x-auto mt-3">
          {JSON.stringify(
            {
              model: entry.request.model,
              voice: entry.request.voice,
              response_format: entry.request.response_format,
              speed: entry.request.speed,
              language: entry.request.language,
              ...Object.fromEntries(
                Object.entries(entry.request).filter(
                  ([k]) => !["input", "file", "model"].includes(k)
                )
              )
            },
            null,
            2
          )}
        </pre>
      </details>

      {/* Full Response */}
      {entry.response && (
        <details>
          <summary className="cursor-pointer font-semibold mb-3">
            Full Response
          </summary>
          <pre className="text-xs p-4 bg-muted/30 rounded overflow-x-auto mt-3">
            {JSON.stringify(entry.response, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
