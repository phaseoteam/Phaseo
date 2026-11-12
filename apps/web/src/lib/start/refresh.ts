// Refresh server data: re-run route loaders and refetch active queries.
type Invalidatable = { invalidate(): Promise<unknown> };
type QueryClientLike = { invalidateQueries(): Promise<unknown> };

export function refreshServerData(router?: Invalidatable): Promise<unknown> {
	const target = router ?? (globalThis as { __phaseoRouter?: Invalidatable }).__phaseoRouter;
	const queryClient = (globalThis as { __phaseoQueryClient?: QueryClientLike }).__phaseoQueryClient;
	return Promise.all([target?.invalidate(), queryClient?.invalidateQueries()]);
}
