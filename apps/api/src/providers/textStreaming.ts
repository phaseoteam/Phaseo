/** Trusted provider-model capability metadata, never a client request option. */
export type BufferedStreamingCapability = {
    supported: boolean;
    bufferedParity: boolean;
    preferStreamingForBufferedRequests: boolean;
};

/** Unknown parity preserves the provider's native buffered behavior. */
export function resolveTextExecutionStream(requestedStream: boolean, capabilityParams: unknown): boolean {
    if (requestedStream) return true;
    if (!capabilityParams || typeof capabilityParams !== "object" || Array.isArray(capabilityParams)) return false;
    const stream = (capabilityParams as Record<string, unknown>).stream;
    if (!stream || typeof stream !== "object" || Array.isArray(stream)) return false;
    const capability = stream as Partial<BufferedStreamingCapability>;
    return capability.supported === true && capability.bufferedParity === true
        && capability.preferStreamingForBufferedRequests === true;
}
