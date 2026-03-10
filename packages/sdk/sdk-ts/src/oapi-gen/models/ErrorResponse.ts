export interface ErrorResponse {
  description?: string;
  error:
    | string
    | {
        [key: string]: unknown;
      };
  message?: string;
  ok?: boolean;
  [key: string]: unknown;
}
