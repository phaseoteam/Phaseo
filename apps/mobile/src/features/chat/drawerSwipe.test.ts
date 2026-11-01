import { drawerPan, drawerSwipe } from "./drawerSwipe";

describe("the chat drawer's swipe", () => {
  const phone = 412;

  it("starts anywhere on the chat, opens past half the drawer's width or with a fling, and otherwise snaps back", () => {
    expect(drawerSwipe(phone)).toEqual({ width: 356, swipeEdgeWidth: 412, swipeMinDistance: 178, swipeMinVelocity: 500 });
    expect(drawerSwipe(1000).width).toBe(360);
  });

  it("takes only clear drags: rightwards while closed, either way while open, never vertical ones", () => {
    expect(drawerPan(false)).toEqual({ activeOffsetX: 20, failOffsetY: [-12, 12] });
    expect(drawerPan(true)).toEqual({ activeOffsetX: [-20, 20], failOffsetY: [-12, 12] });
  });
});
