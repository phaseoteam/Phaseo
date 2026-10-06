export interface DecisionPredicateAnswer {
  name: string | null;
  probability: number;
  type: "predicate";
}
