import { Bot, ChartNoAxesColumn, Columns3, House, MessageSquare, Server, UserRound, type LucideIcon } from "lucide-react-native";

export type TabName = "home" | "models" | "providers" | "compare" | "chat" | "account";

export type NavItem = { name: TabName; href: "/" | "/models" | "/providers" | "/compare" | "/chat" | "/account"; label: string; icon: LucideIcon; phone: boolean };

/** Every tab must be declared here: Expo Router 58 only shows declared tabs. */
export const NAV_ITEMS: NavItem[] = [
  { name: "home", href: "/", label: "Home", icon: House, phone: true },
  { name: "models", href: "/models", label: "Models", icon: Bot, phone: true },
  { name: "providers", href: "/providers", label: "Providers", icon: Server, phone: true },
  { name: "compare", href: "/compare", label: "Compare", icon: Columns3, phone: false },
  { name: "chat", href: "/chat", label: "Chat", icon: MessageSquare, phone: true },
  { name: "account", href: "/account", label: "Account", icon: UserRound, phone: true },
];

/** Extra sidebar shortcuts into the account section on tablets. */
export const SIDEBAR_SHORTCUTS = [{ href: "/account/usage" as const, label: "Usage", icon: ChartNoAxesColumn }];
