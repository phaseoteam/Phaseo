import { renderToStaticMarkup } from "react-dom/server";
import { UserUsageChip } from "./UserUsageChip";

jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
jest.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...props }: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a> }));

const props = { userId: "user-2", name: "Alice", avatarUrl: null, workspaceId: "workspace-1", currentUserId: "user-1" };

describe("workspace user chips", () => {
	it("makes another user's chip non-interactive for ordinary members", () => {
		const html = renderToStaticMarkup(<UserUsageChip {...props} />);
		expect(html).toContain("Alice"); expect(html).not.toContain("href="); expect(html).not.toContain("context-menu-trigger");
	});
	it("links the signed-in user's chip to their own profile without admin actions", () => {
		const html = renderToStaticMarkup(<UserUsageChip {...props} userId="user-1" />);
		expect(html).toContain('href="/settings/profile"'); expect(html).not.toContain("context-menu-trigger");
	});
	it("links an admin's other-user chip to the workspace profile and enables its context menu", () => {
		const html = renderToStaticMarkup(<UserUsageChip {...props} canViewWorkspaceUsers />);
		expect(html).toContain('href="/settings/workspaces/users/user-2?workspaceId=workspace-1"'); expect(html).toContain("context-menu-trigger");
	});
});
