import { createContext, useContext, type ReactNode } from "react";

export type SidebarDrawer = { open(): void; close(): void; button: ReactNode };

export const SidebarDrawerContext = createContext<SidebarDrawer | null>(null);

/** The phone drawer's controls; null on split layouts, where the sidebar never hides, and outside the app's screens. */
export const useSidebarDrawer = () => useContext(SidebarDrawerContext);

/** The header button that opens the drawer, with how many computer threads need you; undefined where there's no drawer. */
export const useSidebarButton = () => useContext(SidebarDrawerContext)?.button;
