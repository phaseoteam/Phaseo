export interface ExtractionListField {
  decimals?: number;
  instructions?: string;
  items: "text" | "number" | "date";
  type: "list";
}
