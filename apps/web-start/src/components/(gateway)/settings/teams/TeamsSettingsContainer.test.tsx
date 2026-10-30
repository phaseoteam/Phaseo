import { renderToStaticMarkup } from "react-dom/server";
import TeamsSettingsContainer from "./TeamsSettingsContainer";

jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
jest.mock("@/components/(gateway)/settings/CreateTeamInviteDialog", () => () => null);
jest.mock("@/components/(gateway)/settings/SettingsPageHeader", () => () => null);
jest.mock("./TeamSettingsPanel", () => () => null);
jest.mock("./TeamsAccessPanel", () => () => null);
jest.mock("./members/TeamsMembers", () => ({ __esModule: true, default: ({ canManageWorkspace }: { canManageWorkspace: boolean }) => <span>{canManageWorkspace ? "profile-access" : "restricted"}</span> }));

const props = { teams: [{ id: "workspace", name: "Workspace" }], membersByTeam: {}, requestsByTeam: {}, currentUserId: "owner", hideTitle: true };

it("preserves profile access for an owner without a membership row", () => {
	expect(renderToStaticMarkup(<TeamsSettingsContainer {...props} manageableTeamIds={["workspace"]} />)).toContain("profile-access");
});

it("does not grant profile access to a viewer without management permission", () => {
	expect(renderToStaticMarkup(<TeamsSettingsContainer {...props} manageableTeamIds={[]} />)).toContain("restricted");
});
