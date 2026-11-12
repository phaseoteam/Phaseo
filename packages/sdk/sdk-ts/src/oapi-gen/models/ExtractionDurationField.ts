export interface ExtractionDurationField {
  decimals?: number;
  instructions?: string;
  integer?: boolean;
  type: "duration";
  unit?:
    "seconds" | "minutes" | "hours" | "days" | "weeks" | "months" | "years";
}
