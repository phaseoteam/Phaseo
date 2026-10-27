/**
 * One question the classifier answers about each request. The answer is written as a request label whose key is this dimension's key. If the caller already sent a label with that key, the dimension is skipped.
 */
export interface ClassifierDimension {
  allow_other?: boolean;
  description?: string | null;
  key: string;
  multiple?: boolean;
  name?: string;
  values: {
    description?: string | null;
    value: string;
  }[];
}
