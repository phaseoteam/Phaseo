export interface ResponsesOutputItem {
  arguments?: string;
  call_id?: string;
  content?: {
    annotations?: {}[];
    b64_json?: string;
    image_url?: {
      url?: string;
    };
    mime_type?: string;
    text?: string;
    type?: "output_text" | "output_image";
    [key: string]: unknown;
  }[];
  id?: string;
  name?: string;
  role?: string;
  status?: string;
  type?: string;
  [key: string]: unknown;
}
