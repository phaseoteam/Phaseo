export interface CacheControl {
  scope?: string;
  ttl?: string;
  type?: string;
  [key: string]: unknown;
}
