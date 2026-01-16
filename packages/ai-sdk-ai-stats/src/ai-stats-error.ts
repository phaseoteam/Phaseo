/**
 * Error handling utilities for AI Stats Gateway
 */

/**
 * Creates an error from a failed response
 */
export function createGatewayError(response: Response, message?: string): Error {
  const status = response.status;
  const statusText = response.statusText;

  const error = new Error(
    message ?? `Gateway request failed: ${status} ${statusText}`
  );

  // Attach response information
  (error as any).status = status;
  (error as any).statusText = statusText;
  (error as any).response = response;

  // Mark as retryable based on status code
  (error as any).isRetryable =
    status === 408 || // Request Timeout
    status === 429 || // Too Many Requests
    status >= 500;    // Server Errors

  return error;
}

/**
 * Checks if an error is retryable
 */
export function isRetryableError(error: any): boolean {
  if (typeof error === 'object' && error !== null) {
    if ('isRetryable' in error) {
      return error.isRetryable === true;
    }

    if ('status' in error) {
      const status = error.status;
      return status === 408 || status === 429 || status >= 500;
    }
  }

  return false;
}
