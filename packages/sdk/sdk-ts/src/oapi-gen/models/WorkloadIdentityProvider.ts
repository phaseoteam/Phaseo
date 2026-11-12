/**
 * The platform that issues the OIDC tokens. Use custom for any other OIDC issuer, such as a Kubernetes cluster or a self-managed GitLab instance.
 */
export type WorkloadIdentityProvider =
  | "vercel"
  | "github_actions"
  | "gitlab"
  | "google_cloud"
  | "buildkite"
  | "circleci"
  | "aws"
  | "custom";
