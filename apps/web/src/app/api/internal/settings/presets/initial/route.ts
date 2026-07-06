import { NextResponse } from "next/server";
import { fetchSettingsPresetsInitialData } from "@/lib/fetchers/internal/fetchSettingsPresetsInitialData";
export type { SettingsPresetsInitialData } from "@/lib/fetchers/internal/fetchSettingsPresetsInitialData";

export async function GET() {
	return NextResponse.json(await fetchSettingsPresetsInitialData());
}
