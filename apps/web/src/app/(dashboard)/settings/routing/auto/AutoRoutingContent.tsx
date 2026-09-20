"use client";
import { withPrivateSettings } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import AutoRoutingSettingsClient from "@/components/(gateway)/settings/routing/AutoRoutingSettingsClient";
export default withPrivateSettings("/api/account/settings/routing/auto", AutoRoutingSettingsClient);
