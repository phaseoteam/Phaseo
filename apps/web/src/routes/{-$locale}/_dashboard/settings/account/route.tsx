import { createFileRoute } from "@tanstack/react-router";

// Account sub-pages share the settings layout; the global settings tabs render their navigation.
export const Route = createFileRoute("/{-$locale}/_dashboard/settings/account")({});
