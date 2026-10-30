// Next's router.refresh() re-renders every server component with fresh data.
// Here that means re-running route loaders and refetching cached queries.
type Invalidatable = { invalidate(): Promise<unknown> };
type QueryClientLike = { invalidateQueries(): Promise<unknown> };

export function refreshServerData(router?: Invalidatable): Promise<unknown> {
	const target = router ?? (globalThis as { __phaseoRouter?: Invalidatable }).__phaseoRouter;
	const queryClient = (globalThis as { __phaseoQueryClient?: QueryClientLike }).__phaseoQueryClient;
	return Promise.all([target?.invalidate(), queryClient?.invalidateQueries()]);
}
