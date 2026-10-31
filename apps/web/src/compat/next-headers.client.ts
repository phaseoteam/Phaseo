// Browser stand-in for `next/headers`: reaching it means server-only code ran
// in the browser, which is a porting bug (wrap the caller in createServerFn).
function serverOnly(name: string): never {
	throw new Error(`next/headers ${name}() was called in the browser. Move the caller into a createServerFn handler.`);
}

export async function headers(): Promise<Headers> {
	return serverOnly("headers");
}

export async function cookies(): Promise<never> {
	return serverOnly("cookies");
}

export async function draftMode() {
	return { isEnabled: false, enable() {}, disable() {} };
}
