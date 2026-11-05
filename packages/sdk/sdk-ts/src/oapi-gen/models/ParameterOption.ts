export interface ParameterOption {
  description?: string;
  label?: string;
  value: string | number | boolean;
  [key: string]: unknown;
}
