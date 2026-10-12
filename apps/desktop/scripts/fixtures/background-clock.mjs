// Advance renderer timers without waiting ten real minutes or adding product controls.
const clocks = new WeakMap();

async function advance(owner, budget) {
	const client = owner.webContents.debugger;
	if (!client.isAttached()) client.attach("1.3");
	await new Promise((resolve, reject) => {
		const onMessage = (_event, method) => {
			if (method !== "Emulation.virtualTimeBudgetExpired") return;
			client.removeListener("message", onMessage); resolve();
		};
		client.on("message", onMessage);
		client.sendCommand("Emulation.setVirtualTimePolicy", { policy: "advance", budget, maxVirtualTimeTaskStarvationCount: 100 }).catch(error => { client.removeListener("message", onMessage); reject(error); });
	});
}

export async function advanceBackgroundRefresh(owner) {
	let clock = clocks.get(owner);
	if (!clock) {
		clock = { pending: Promise.resolve(), jumping: false };
		clocks.set(owner, clock);
		const timer = setInterval(() => {
			if (clock.jumping || owner.isDestroyed()) return;
			clock.pending = clock.pending.then(() => advance(owner, 20)).catch(() => undefined);
		}, 20);
		owner.once("closed", () => clearInterval(timer));
	}
	clock.jumping = true;
	await clock.pending;
	try { await advance(owner, 600_001); } finally { clock.jumping = false; }
}
