/**
 * Ordered answers for input/array requests, or a named map for legacy state/map requests.
 */
export type DecisionCreateResponse =
  | {
      answers: (
        | {
            name: string | null;
            probability: number;
            type: "predicate";
          }
        | {
            choice: string | boolean;
            confidence: number;
            name: string | null;
            probabilities: {
              probability: number;
              value: string | boolean;
            }[];
            type: "choice";
          }
        | {
            confidence: number;
            name: string | null;
            probabilities: {
              label: string;
              probability: number;
              value: number;
            }[];
            score: number;
            type: "score";
          }
        | {
            name: string | null;
            type: "refusal";
          }
      )[];
      meta?: {
        [key: string]: unknown;
      };
      model: string;
      request_id?: string | null;
      usage: {
        input_tokens?: number;
        input_tokens_details?: {
          cache_write_tokens?: number;
          cached_tokens?: number;
        };
        output_tokens?: number;
        output_tokens_details?: {
          reasoning_tokens?: number;
        };
        total_tokens?: number;
      };
    }
  | {
      answers?: {
        [key: string]: unknown;
      };
      meta?: {
        [key: string]: unknown;
      };
      model?: string;
      request_id?: string | null;
      usage?: {
        input_tokens?: number;
        input_tokens_details?: {
          cache_write_tokens?: number;
          cached_tokens?: number;
        };
        output_tokens?: number;
        output_tokens_details?: {
          reasoning_tokens?: number;
        };
        total_tokens?: number;
      };
    };
