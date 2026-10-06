import { renderToStaticMarkup } from "react-dom/server";
import OtherInfo from "./OtherInfo";

jest.mock("next-intl/server", () => ({
	getLocale: async () => "en-GB",
	getTranslations: async () => (key: string) => key,
}));

jest.mock("@/components/display/DisplayValue", () => ({
	DisplayNumber: ({ value }: { value: number }) => <span>{value}</span>,
}));

test("renders total and active parameters alongside training tokens and license", async () => {
	const html = renderToStaticMarkup(await OtherInfo({
		details: [
			{ detail_name: "parameter_count", detail_value: 501_000_000_000 },
			{ detail_name: "active_parameter_count", detail_value: 23_000_000_000 },
			{ detail_name: "training_tokens", detail_value: 23_800_000_000_000 },
			{ detail_name: "license", detail_value: "Apache 2.0 (planned)" },
		],
	}));
	expect(html).toContain("501000000000");
	expect(html).toContain("activeParameters");
	expect(html).toContain("23000000000");
	expect(html).toContain("23800000000000");
	expect(html).toContain("Apache 2.0 (planned)");
});

test("omits active parameters when the model does not report them", async () => {
	const html = renderToStaticMarkup(await OtherInfo({
		details: [{ detail_name: "parameter_count", detail_value: 7_000_000_000 }],
	}));
	expect(html).not.toContain("activeParameters");
});
