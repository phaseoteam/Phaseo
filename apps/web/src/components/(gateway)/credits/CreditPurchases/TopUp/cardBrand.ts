const CARD_BRAND_NAMES: Record<string, string> = {
	amex: "American Express",
	diners: "Diners Club",
	discover: "Discover",
	eftpos_au: "Eftpos Australia",
	interac: "Interac",
	jcb: "JCB",
	link: "Link",
	mastercard: "Mastercard",
	unionpay: "UnionPay",
	visa: "Visa",
};

export function formatCardBrand(value: unknown): string {
	const brand = String(value ?? "").trim();
	if (!brand) return "Card";
	return CARD_BRAND_NAMES[brand.toLowerCase()]
		?? brand.replace(/(^|[\s_-])([a-z])/g, (_, separator: string, letter: string) => `${separator === "_" ? " " : separator}${letter.toUpperCase()}`);
}
