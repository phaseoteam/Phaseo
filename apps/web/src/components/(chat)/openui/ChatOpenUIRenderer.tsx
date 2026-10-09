"use client";

import { useCallback, useRef, useState } from "react";
import {
  BuiltinActionType,
  Renderer,
  type OpenUIError,
  type ParseResult,
} from "@openuidev/react-lang";
import {
  openuiLibrary,
  OpenUIActionContext,
  isValidOpenUIResult,
} from "./openuiLibrary";

export type ChatOpenUIRendererProps = {
  source: string;
  isStreaming: boolean;
  disabled: boolean;
  initialState?: Record<string, unknown>;
  onStateChange?: (state: Record<string, unknown>) => void;
  onSubmit?: (prompt: string) => void;
};

export function ChatOpenUIRenderer({
  source,
  isStreaming,
  disabled,
  initialState,
  onStateChange,
  onSubmit,
}: ChatOpenUIRendererProps) {
  const [errors, setErrors] = useState<OpenUIError[]>([]);
  const [hasRoot, setHasRoot] = useState(true);
  const lastState = useRef(JSON.stringify(initialState ?? {}));
  const handleState = useCallback(
    (state: Record<string, unknown>) => {
      const serialized = JSON.stringify(state);
      if (
        !isStreaming &&
        !disabled &&
        serialized !== lastState.current &&
        serialized.length <= 16_000
      ) {
        lastState.current = serialized;
        onStateChange?.(state);
      }
    },
    [isStreaming, disabled, onStateChange],
  );
  const handleParse = useCallback((result: ParseResult | null) => {
    setHasRoot(isValidOpenUIResult(result));
  }, []);
  const failed = !isStreaming && (errors.length > 0 || !hasRoot);
  return (
    <div className="not-prose min-w-0 space-y-3" data-openui-answer>
      {failed && (
        <p role="status" className="text-sm text-muted-foreground">
          This interactive answer could not be fully rendered. Try regenerating
          the response.
        </p>
      )}
      <OpenUIActionContext.Provider
        value={{ disabled: disabled || isStreaming || failed || !onSubmit }}
      >
        <Renderer
          response={source}
          library={openuiLibrary}
          isStreaming={isStreaming}
          initialState={initialState}
          onStateUpdate={handleState}
          onError={setErrors}
          onParseResult={handleParse}
          publishObservability={false}
          onAction={(event) => {
            if (
              !disabled &&
              !isStreaming &&
              !failed &&
              event.type === BuiltinActionType.ContinueConversation &&
              event.humanFriendlyMessage.trim()
            )
              onSubmit?.(event.humanFriendlyMessage.slice(0, 2400));
          }}
        />
      </OpenUIActionContext.Provider>
    </div>
  );
}
