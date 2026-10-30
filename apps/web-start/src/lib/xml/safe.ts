import { XMLParser } from "fast-xml-parser";

const DEFAULT_MAX_XML_CHARS = 2_000_000;
const MAX_ENTITY_DECLARATIONS = 0;
const ENTITY_DECLARATION_REGEX = /<!ENTITY\s+/gi;

type XmlParserOptions = ConstructorParameters<typeof XMLParser>[0];

export function assertXmlEntityLimits(
	xml: string,
	maxXmlChars = DEFAULT_MAX_XML_CHARS
) {
	if (xml.length > maxXmlChars) {
		throw new Error(
			`XML payload exceeds max allowed size (${maxXmlChars} chars)`
		);
	}

	const entityDeclarations = xml.match(ENTITY_DECLARATION_REGEX)?.length ?? 0;
	if (entityDeclarations > MAX_ENTITY_DECLARATIONS) {
		throw new Error("XML entity declarations are not supported");
	}
}

export function createSafeXmlParser(options: XmlParserOptions = {}) {
	return new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "",
		trimValues: true,
		processEntities: false,
		...options,
	});
}

export function parseXmlWithLimits<T = unknown>(
	xml: string,
	options: XmlParserOptions = {},
	maxXmlChars = DEFAULT_MAX_XML_CHARS
) {
	assertXmlEntityLimits(xml, maxXmlChars);
	return createSafeXmlParser(options).parse(xml) as T;
}
