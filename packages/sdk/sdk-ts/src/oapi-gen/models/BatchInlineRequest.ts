export interface BatchInlineRequest {
  body: {
    [key: string]: unknown;
  };
  custom_id?: string;
  method?: string;
  url?: string;
}
