import { Image } from "@raycast/api";

const PHASEO_ASSET_ORIGIN = "https://phaseo.app";

export function getOrganisationLogo(
  organisationId: string | null,
): Image.ImageLike | undefined {
  if (!organisationId) return undefined;

  const id = encodeURIComponent(organisationId);
  return {
    source: {
      light: `${PHASEO_ASSET_ORIGIN}/api/organisation-logo/${id}?theme=light`,
      dark: `${PHASEO_ASSET_ORIGIN}/api/organisation-logo/${id}?theme=dark`,
    },
  };
}
