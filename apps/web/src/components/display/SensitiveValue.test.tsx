import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SensitiveValue } from "./SensitiveValue";
import { Input } from "@/components/ui/input";
import { useDisplayPreferences } from "@/components/providers/DisplayPreferencesProvider";
import { obfuscatedPlaceholder } from "@/lib/obfuscation";

jest.mock("react", () => ({
	...jest.requireActual("react"),
	useState: jest.fn(jest.requireActual("react").useState),
}));
jest.mock("@/components/providers/DisplayPreferencesProvider", () => ({
	useDisplayPreferences: jest.fn(),
}));
jest.mock("next-intl", () => ({
	useTranslations: () => (key: string, values?: { label?: string }) => `${key}${values?.label ? ` ${values.label}` : ""}`,
}));

function setMasking(enabled: boolean, ready = true) {
	jest.mocked(useDisplayPreferences).mockReturnValue({
		isSensitiveDataReady: ready,
		preferences: { maskSensitiveData: enabled },
	} as ReturnType<typeof useDisplayPreferences>);
}

describe("SensitiveValue", () => {
	const email = "person@example.com";
	beforeEach(() => setMasking(true));
	afterEach(() => jest.restoreAllMocks());

	it("keeps server-rendered values scrambled before account preferences load", () => {
		setMasking(false, false);
		const html = renderToStaticMarkup(<div data-obfuscate-pii="true"><SensitiveValue inline>{email}</SensitiveValue><SensitiveValue><Input value={email} readOnly /></SensitiveValue></div>);
		expect(html).not.toContain(email);
		expect(html).toContain(obfuscatedPlaceholder(email));
		expect(html).toContain('data-pii-hidden="true"');
	});

	it("scrambles text before blurring, without the original in hidden markup", () => {
		const html = renderToStaticMarkup(<SensitiveValue inline label="email address">{email}</SensitiveValue>);
		expect(html).not.toContain(email);
		expect(html).toContain(obfuscatedPlaceholder(email));
		expect(html).toContain('data-pii-hidden="true"');
		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain('inert=""');
		expect(html).toContain("sensitiveValues.reveal");
	});

	it("preserves the original content when masking is disabled", () => {
		setMasking(false);
		const html = renderToStaticMarkup(<SensitiveValue inline>{email}</SensitiveValue>);
		expect(html).toContain(email);
		expect(html).not.toContain("<button");
		expect(html).not.toContain("data-pii-hidden");
	});

	it("masks input values without blurring field borders or the reveal button", () => {
		const html = renderToStaticMarkup(<SensitiveValue label="email address"><Input value={email} type="email" onChange={() => {}} /></SensitiveValue>);
		expect(html).not.toContain(email);
		expect(html).toContain(obfuscatedPlaceholder(email));
		expect(html).toContain('type="text"');
		expect(html).toContain("readOnly");
		expect(html).toContain('inert=""');
		expect(html).toContain("text-shadow");
		expect(html).not.toContain("data-pii-hidden");
	});

	it("masks default input values and text nested in fragments", () => {
		const html = renderToStaticMarkup(<SensitiveValue><><span>{email}</span><input defaultValue={email} /></></SensitiveValue>);
		expect(html).not.toContain(email);
		expect(html).toContain(obfuscatedPlaceholder(email));
	});

	it("allows payment selectors to mask values without nested buttons", () => {
		const html = renderToStaticMarkup(<button><SensitiveValue inline reveal={false} label="card number">****4242</SensitiveValue></button>);
		expect(html.match(/<button/g)).toHaveLength(1);
		expect(html).not.toContain("4242");
	});

	it("restores the original editable input and callback when revealed", () => {
		const onChange = jest.fn();
		const frame = SensitiveValue({ children: <Input value={email} type="email" onChange={onChange} /> });
		jest.mocked(React.useState).mockReturnValueOnce([true, jest.fn()]);
		const renderContent = frame.type as (props: typeof frame.props) => React.ReactElement;
		const content = renderContent(frame.props);
		const html = renderToStaticMarkup(content);
		expect(html).toContain(email);
		expect(html).toContain('type="email"');
		expect(html).not.toContain("readOnly");
		expect(html).not.toContain('inert=""');
		expect(html).toContain("sensitiveValues.mask");
	});

	it("remounts reveal state when the global masking preference changes", () => {
		const masked = SensitiveValue({ children: email });
		setMasking(false);
		const visible = SensitiveValue({ children: email });
		expect(masked.key).not.toBe(visible.key);
	});
});
