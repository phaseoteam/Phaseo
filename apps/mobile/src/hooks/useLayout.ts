import { useWindowDimensions } from "react-native";

/** T3 Code's split breakpoint: from 720 dp the app shows a sidebar and list/detail panes side by side. */
export const SPLIT_MIN_WIDTH = 720;
export const WIDE_MIN_WIDTH = 1024;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const split = width >= SPLIT_MIN_WIDTH && height >= 480;
  return {
    width,
    height,
    /** A permanent sidebar, and list/detail panes. */
    split,
    /** Room for a wider list pane and extra columns. */
    wide: split && width >= WIDE_MIN_WIDTH,
    /** The sidebar, which stays open beside everything else. */
    sidebarWidth: !split ? 0 : width >= WIDE_MIN_WIDTH ? 288 : 256,
    // Narrow enough that a section's list and its detail both still fit beside the sidebar.
    listWidth: !split ? width : width >= WIDE_MIN_WIDTH ? 340 : 280,
  };
}
