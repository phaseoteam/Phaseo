import { Select } from "../components/Select";
import type { ThemePreference } from "../types";

export function AppearanceSettings({ theme, onThemeChange }: { theme: ThemePreference; onThemeChange: (theme: ThemePreference) => void }) {
	return <div className="page settings-page"><section className="page-heading"><h1>Appearance</h1></section><section className="panel"><div className="panel-heading"><h2>Theme</h2></div><div className="settings-fields"><label className="setting-row"><span><strong>Colour theme</strong></span><Select label="Colour theme" value={theme} onValueChange={value => onThemeChange(value as ThemePreference)} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} /></label></div></section></div>;
}
