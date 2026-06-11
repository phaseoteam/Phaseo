export interface BatchModelProviderCapability {
  id?: string;
  supported_parameters?: string[];
  supported_parameters_detail?: {
    [key: string]: {
      [key: string]: unknown;
    };
  };
  supported_params?: string[];
  supported_params_detail?: {
    [key: string]: {
      [key: string]: unknown;
    };
  };
}
