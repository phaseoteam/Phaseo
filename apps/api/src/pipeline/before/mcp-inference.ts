// Workspace routing must not silently change an explicitly reviewed MCP run.
export function reviewedMcpRunMatches(
  requested: any,
  resolved: any,
  modelFallbacks?: string[],
): boolean {
  return (
    requested.model === resolved.model &&
    requested.max_completion_tokens === resolved.max_completion_tokens &&
    resolved.stream === false &&
    resolved.store === false &&
    JSON.stringify(requested.messages) === JSON.stringify(resolved.messages) &&
    JSON.stringify(requested.provider?.only) ===
      JSON.stringify(resolved.provider?.only) &&
    resolved.provider?.allow_fallbacks === false &&
    resolved.provider?.require_parameters === true &&
    !modelFallbacks?.length &&
    !resolved.routing?.model_fallbacks?.length
  );
}
