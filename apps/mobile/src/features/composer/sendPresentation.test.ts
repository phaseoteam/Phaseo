import { resolveSendPresentation } from "./sendPresentation";

const idle = { editingQueuedMessage: false, running: false, canSteer: false, followUpBehavior: "queue", deliveryDeferred: false } as const;

describe("resolveSendPresentation", () => {
  it("sends when nothing runs, and queues behind messages already waiting", () => {
    expect(resolveSendPresentation(idle)).toMatchObject({ label: "Send", icon: "send", action: null, alternate: null });
    expect(resolveSendPresentation({ ...idle, deliveryDeferred: true })).toMatchObject({ label: "Queue", icon: "outbox" });
  });

  it("never promises steering an agent that can't be steered", () => {
    const presentation = resolveSendPresentation({ ...idle, running: true, canSteer: false, followUpBehavior: "steer" });
    expect(presentation).toEqual({ label: "Queue", icon: "queue", action: "queue", alternate: null });
  });

  it("steers a running turn by default where it can, with queue on the long press", () => {
    expect(resolveSendPresentation({ ...idle, running: true, canSteer: true, followUpBehavior: "steer" })).toEqual({ label: "Steer", icon: "steer", action: "steer", alternate: "queue" });
    expect(resolveSendPresentation({ ...idle, running: true, canSteer: true, followUpBehavior: "queue" })).toMatchObject({ action: "queue", alternate: "steer" });
  });

  it("updates the queued message being edited, whatever is running", () => {
    expect(resolveSendPresentation({ ...idle, editingQueuedMessage: true, running: true, canSteer: true })).toEqual({ label: "Update queued message", icon: "update", action: null, alternate: null });
  });
});
