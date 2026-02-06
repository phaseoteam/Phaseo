import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

type ErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

/**
 * Creates a standard error handler for AI Stats Gateway API calls
 */
export const createAIStatsErrorHandler = () =>
  createJsonErrorResponseHandler<ErrorResponse>({
    // Cast to any because we don't have a proper schema type available
    // The error handler will still work for parsing JSON error responses
    errorSchema: {} as any,
    errorToMessage: (error: ErrorResponse) => error.error?.message ?? 'Unknown error',
    isRetryable: (response: Response) => {
      const status = response.status;
      return status === 408 || status === 429 || status >= 500;
    },
  });
