import { it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TeamsSettingsContainer from "./TeamsSettingsContainer";

vi.mock("@/i18n/react", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/(gateway)/settings/CreateTeamInviteDialog", () => ({ default: () => null }));
vi.mock("@/components/(gateway)/settings/SettingsPageHeader", () => ({ default: () => null }));
vi.mock("./TeamSettingsPanel", () => ({ default: () => null }));
vi.mock("./TeamsAccessPanel", () => ({ default: () => null }));
vi.mock("./members/TeamsMembers", () => ({ default: ({ canManageWorkspace }: { canManageWorkspace: boolean }) => <span>{canManageWorkspace ? "profile-access" : "restricted"}</span> }));

const props = { teams: [{ id: "workspace", name: "Workspace" }], membersByTeam: {}, requestsByTeam: {}, currentUserId: "owner", hideTitle: true };

it("preserves profile access for an owner without a membership row", () => {
	expect(renderToStaticMarkup(<TeamsSettingsContainer {...props} manageableTeamIds={["workspace"]} />)).toContain("profile-access");
});

it("does not grant profile access to a viewer without management permission", () => {
	expect(renderToStaticMarkup(<TeamsSettingsContainer {...props} manageableTeamIds={[]} />)).toContain("restricted");
});
