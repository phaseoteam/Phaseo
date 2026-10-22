// Stand-in for the Workers runtime module in tests on Node (see vitest.config.ts).

export class DurableObject<Env = unknown> {
	protected ctx: DurableObjectState;
	protected env: Env;
	constructor(ctx: DurableObjectState, env: Env) {
		this.ctx = ctx;
		this.env = env;
	}
}
