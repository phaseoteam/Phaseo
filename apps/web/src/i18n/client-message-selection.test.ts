import { getPublicMessages } from "./messages";
import { selectClientMessages } from "./client-message-selection";
import generatedScopes from "./generated-client-scopes.json";

jest.mock("server-only", () => ({}), { virtual: true });

const scopes = Object.keys(generatedScopes).map(signature => JSON.parse(signature) as string[]);

describe("public client message selection", () => {
	it("reuses the same tree for equivalent namespace orders", async () => {
		const messages = await getPublicMessages("es-ES");
		const scope = scopes.find(scope => scope.length > 1)!;
		expect(selectClientMessages(messages, [...scope].reverse())).toBe(selectClientMessages(messages, scope));
	});

	it("keeps locales and scopes isolated", async () => {
		const english = await getPublicMessages("en-GB");
		const spanish = await getPublicMessages("es-ES");
		const first = selectClientMessages(english, scopes[0]!);
		expect(selectClientMessages(spanish, scopes[0]!)).not.toBe(first);
		expect(selectClientMessages(english, scopes[1]!)).not.toBe(first);
	});

	it("selects a new tree for a replacement source dictionary", async () => {
		const messages = await getPublicMessages("en-GB");
		expect(selectClientMessages({ ...messages }, scopes[0]!)).toEqual(selectClientMessages(messages, scopes[0]!));
		expect(selectClientMessages({ ...messages }, scopes[0]!)).not.toBe(selectClientMessages(messages, scopes[0]!));
	});
});
