import type { GatewayStreamError } from "@core/stream-error";
import type { EncodedStreamFrame, StreamProtocol } from "./encode";

/** Encode a failure after commitment, never a successful terminal sentinel. */
export function encodeStreamFailure(protocol: StreamProtocol, error: GatewayStreamError, sequenceNumber: number): EncodedStreamFrame {
    if (protocol === "openai.responses") return {
        eventName: "error", frame: { type: "error", code: error.code, message: error.message, param: null, sequence_number: sequenceNumber },
    };
    if (protocol === "anthropic.messages") return {
        eventName: "error", frame: { type: "error", error: { type: "api_error", message: error.message } },
    };
    return { frame: { error: { type: "server_error", code: error.code, message: error.message, param: null } } };
}
