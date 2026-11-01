import { drawerPan, drawerSwipe } from "./drawerSwipe";

describe("the sidebar drawer's swipe", () => {
  const phone = 412;

  it("starts anywhere on the screen, opens past half the drawer's width or with a fling, and otherwise snaps back", () => {
    expect(drawerSwipe(phone)).toEqual({ width: 356, swipeEdgeWidth: 412, swipeMinDistance: 178, swipeMinVelocity: 500 });
    expect(drawerSwipe(1000).width).toBe(360);
  });

  it("takes only clear drags: rightwards while closed, either way while open, never vertical ones", () => {
    expect(drawerPan({ open: false, leads: true })).toEqual({ activeOffsetX: 20, failOffsetY: [-12, 12], hitSlop: null });
    expect(drawerPan({ open: true, leads: true })).toEqual({ activeOffsetX: [-20, 20], failOffsetY: [-12, 12], hitSlop: null });
  });

  it("leaves the left edge to back on a detail, and closes from anywhere once open", () => {
    expect(drawerPan({ open: false, leads: false }).hitSlop).toEqual({ left: -24 });
    expect(drawerPan({ open: true, leads: false }).hitSlop).toBeNull();
  });
});
