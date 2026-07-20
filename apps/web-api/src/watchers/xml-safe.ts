import { XMLParser } from "fast-xml-parser";

const DEFAULT_MAX_XML_CHARS = 2_000_000;
const ENTITY_DECLARATION_REGEX = /<!ENTITY\s+/gi;
type XmlParserOptions = ConstructorParameters<typeof XMLParser>[0];

export function parseXmlWithLimits<T = unknown>(
	xml: string,
	options: XmlParserOptions = {},
	maxXmlChars = DEFAULT_MAX_XML_CHARS,
) {
	if (xml.length > maxXmlChars) throw new Error(`XML payload exceeds max allowed size (${maxXmlChars} chars)`);
	if ((xml.match(ENTITY_DECLARATION_REGEX)?.length ?? 0) > 0) throw new Error("XML entity declarations are not supported");
	return new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "",
		trimValues: true,
		processEntities: false,
		...options,
	}).parse(xml) as T;
}
