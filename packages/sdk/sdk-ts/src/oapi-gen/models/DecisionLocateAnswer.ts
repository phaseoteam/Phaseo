export interface DecisionLocateAnswer {
  name: string | null;
  spans: {
    end: number;
    score: number;
    start: number;
    text: string;
  }[];
  type: "locate";
}
