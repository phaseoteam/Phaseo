export interface ModerationCategoryScores {
  harassment?: number;
  "harassment/threatening"?: number;
  hate?: number;
  "hate/threatening"?: number;
  "self-harm"?: number;
  "self-harm/instructions"?: number;
  "self-harm/intent"?: number;
  sexual?: number;
  "sexual/minors"?: number;
  violence?: number;
  "violence/graphic"?: number;
}
