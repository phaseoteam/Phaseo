export function ModelDiscoveryFeedback({ loading, error, retry, disabled = false }: { loading: boolean; error: string; retry: () => void; disabled?: boolean }) {
 if (loading) return <div className="model-discovery-feedback" role="status"><small>Loading models…</small></div>;
 if (!error) return null;
 return <div className="model-discovery-feedback"><small role="alert">{error}</small><button type="button" aria-label="Retry models" disabled={disabled} onClick={retry}>Retry</button></div>;
}
