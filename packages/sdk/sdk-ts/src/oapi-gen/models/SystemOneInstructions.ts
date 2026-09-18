export type SystemOneInstructions =
  | string
  | {
      [key: string]: unknown;
    }
  | unknown[];
