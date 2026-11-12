export interface WorkspaceNotificationDestinationResponse {
  data: {
    created_at?: string | null;
    has_signing_secret?: boolean;
    id: string;
    name: string;
    signing_secret?: string;
    signing_secret_rotated_at?: string | null;
    status: "active" | "disabled";
    target_preview: string;
    type:
      | "email"
      | "discord"
      | "discord_webhook"
      | "slack"
      | "microsoft_teams"
      | "custom_webhook";
    updated_at?: string | null;
  };
}
