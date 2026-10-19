/**
 * File input, such as a PDF. Set file_data to a base64 data URL, or file_id to a file uploaded to the provider that serves the request.
 */
export interface FileContentPart {
  cache_control?: {
    scope?: string;
    ttl?: string;
    type?: string;
    [key: string]: unknown;
  };
  file: {
    file_data?: string;
    file_id?: string;
    filename?: string;
  };
  type: "file";
}
