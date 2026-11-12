/**
 * A failed read's state: what was shown stays only while it is the same repository or pull request, so a failure on
 * another one shows its error instead of the last one's rows under the new name.
 */
export function failedRead<S extends { key: string; error: unknown; loading: boolean }>(current: S, key: string, empty: Omit<S, "key" | "error" | "loading">, error: S["error"]): S {
  return { ...(current.key === key ? current : { ...current, ...empty }), key, error, loading: false };
}
