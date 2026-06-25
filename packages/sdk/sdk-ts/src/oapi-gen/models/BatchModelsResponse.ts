export interface BatchModelsResponse {
  data?: {
    input_types?: string[];
    model?: string;
    name?: string;
    output_types?: string[];
    pricing?: {
      [key: string]: unknown;
    };
    providers?: {
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
    }[];
    status?: string;
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
  }[];
  object?: string;
}
