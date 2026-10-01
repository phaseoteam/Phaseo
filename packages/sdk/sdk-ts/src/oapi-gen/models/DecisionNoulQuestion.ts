export interface DecisionNoulQuestion {
  criteria?: {
    false?: string;
    true?: string;
    [key: string]: unknown;
  };
  instructions:
    | string
    | {
        [key: string]: unknown;
      }
    | unknown[];
  type: "noul";
}
