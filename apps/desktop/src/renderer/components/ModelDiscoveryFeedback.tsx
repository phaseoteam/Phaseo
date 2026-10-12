export function ModelDiscoveryFeedback({ loading, error }: { loading: boolean; error: string }) {
 if (loading) return <div className="model-discovery-feedback" role="status"><small>Loading models…</small></div>;
 if (!error) return null;
 return <div className="model-discovery-feedback"><small role="alert">{error}</small></div>;
}
