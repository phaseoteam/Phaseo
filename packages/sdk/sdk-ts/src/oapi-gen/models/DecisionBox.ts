/**
 * Edges as fractions of image dimensions from the top-left corner. top must be less than bottom; left must be less than right.
 */
export interface DecisionBox {
  bottom: number;
  left: number;
  right: number;
  top: number;
}
