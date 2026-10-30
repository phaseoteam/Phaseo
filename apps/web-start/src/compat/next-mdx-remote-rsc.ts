// Workers cannot evaluate code at request time, so MDX must be compiled at
// build time (see PORTING.md). This stand-in only exists so unported callers
// fail loudly instead of breaking the build.
export async function compileMDX(_options: unknown): Promise<never> {
	throw new Error("compileMDX is not available on Workers: import the precompiled MDX module instead (PORTING.md, MDX).");
}
