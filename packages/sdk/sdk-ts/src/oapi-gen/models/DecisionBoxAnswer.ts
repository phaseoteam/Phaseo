export interface DecisionBoxAnswer {
  box: {
    bottom: number;
    left: number;
    right: number;
    top: number;
  };
  confidence: number;
  name: string | null;
  type: "box";
}
