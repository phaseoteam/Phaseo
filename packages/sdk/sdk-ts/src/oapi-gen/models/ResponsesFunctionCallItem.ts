export interface ResponsesFunctionCallItem {
  arguments: string;
  call_id?: string;
  name: string;
  type: "function_call";
}
