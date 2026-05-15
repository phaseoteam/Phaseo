import { auth } from "@/lib/auth/server";
import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";

const handler = oauthProviderOpenIdConfigMetadata(auth);

export const GET = handler;
