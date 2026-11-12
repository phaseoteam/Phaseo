/**
 * When every parameter in if has one of its listed values, the other fields replace the parameter's own.
 */
export interface ParameterRule {
  default?: string | number | boolean;
  if: {
    [key: string]: (string | number | boolean)[];
  };
  max?: number;
  message?: string;
  min?: number;
  step?: number;
  supported?: boolean;
  values?: (string | number | boolean)[];
}
