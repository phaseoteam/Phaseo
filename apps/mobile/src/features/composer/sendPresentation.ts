/** What a message sent while a turn runs does: wait for the turn to end, or reach the running turn now. */
export type FollowUpAction = "queue" | "steer";

export type SendIcon = "send" | "outbox" | "update" | "queue" | "steer";

export type SendPresentation = {
  label: string;
  icon: SendIcon;
  /** What a tap does while a turn runs; null when nothing runs. */
  action: FollowUpAction | null;
  /** What a long press offers instead; null when there's no choice. */
  alternate: FollowUpAction | null;
};

const ACTION_LABEL: Record<FollowUpAction, string> = { queue: "Queue", steer: "Steer" };
export const FOLLOW_UP_TITLE: Record<FollowUpAction, string> = { queue: "Queue", steer: "Steer now" };
export const FOLLOW_UP_SUBTITLE: Record<FollowUpAction, string> = { queue: "Send after the current turn", steer: "Reach the turn that's running now" };

/**
 * The send button's label, icon and long-press choice. A message typed while a turn runs steers it (when the agent can
 * be steered and that's the preference) or queues behind it; one typed while earlier messages wait joins them.
 */
export function resolveSendPresentation(input: { editingQueuedMessage: boolean; running: boolean; canSteer: boolean; followUpBehavior: FollowUpAction; deliveryDeferred: boolean }): SendPresentation {
  if (input.editingQueuedMessage) return { label: "Update queued message", icon: "update", action: null, alternate: null };
  if (!input.running) return input.deliveryDeferred ? { label: "Queue", icon: "outbox", action: null, alternate: null } : { label: "Send", icon: "send", action: null, alternate: null };
  const action: FollowUpAction = input.canSteer ? input.followUpBehavior : "queue";
  return {
    label: ACTION_LABEL[action],
    icon: action,
    action,
    alternate: input.canSteer ? (action === "steer" ? "queue" : "steer") : null,
  };
}
