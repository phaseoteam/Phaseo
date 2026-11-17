import type { LearnCourse } from "../../types";

export const agentsCourse: LearnCourse = {
	slug: "phaseo-in-your-coding-agent",
	title: "Phaseo mit deinem Coding-Agenten nutzen",
	summary:
		"Gib deinem Coding-Agenten die Phaseo-Skills, die Dokumentation und die Tools und lass dir Phaseo beibringen, während er dein Projekt baut.",
	level: "beginner",
	format: "Ohne Code",
	prerequisites: ["Was ist Phaseo?"],
	lessons: [
		{
			slug: "connect-your-agent",
			title: "Deinen Agenten verbinden",
			summary:
				"Gib deinem Agenten Phaseo-Skills und die Dokumentation, damit er korrekten Code schreibt, Live-Daten über MCP und Phaseo-Modelle über die CLI.",
			minutes: 8,
			body: `Coding-Agenten wie Claude Code, Codex und Cursor können auf drei getrennte Arten mit Phaseo arbeiten. Wähl die aus, die du brauchst.

**1. Bring ihm Phaseo bei.** Agent Skills sind Anleitungen, mit denen dein Agent korrekten Phaseo-Code schreibt. Sie decken das Gateway, die SDKs, Voreinstellungen, Routing und Migrationen ab. Installiere sie mit:

\`\`\`bash
npx skills add https://phaseo.app/docs
\`\`\`

Damit er während einer Sitzung die aktuelle Dokumentation lesen kann, füge den Docs-MCP-Server hinzu, \`https://phaseo.app/docs/mcp\`. Er liest nur die Dokumentation und greift nie auf dein Konto zu.

**2. Gib ihm Live-Daten von Phaseo.** Mit dem Phaseo-MCP-Server, \`https://mcp.phaseo.app/mcp\`, kann ein Agent Modelle, Preise, Anbieter, deine Credits, die Nutzung und Anfrageprotokolle nachschlagen. Er ist schreibgeschützt und gibt nie Prompts, Antworten oder geheime Werte zurück. Du meldest dich in deinem Browser bei Phaseo an. In Claude Code:

\`\`\`bash
claude mcp add --transport http phaseo https://mcp.phaseo.app/mcp
\`\`\`

Führe dann \`/mcp\` aus, wähle \`phaseo\` und dann **Authenticate**. Soll der Agent auch API-Schlüssel und Workspace-Einstellungen verwalten, verbinde dich mit \`https://mcp.phaseo.app/mcp?access=manage\` und entferne den Haken bei jeder Berechtigung, die du nicht willst.

**3. Lass den Agenten auf Phaseo-Modellen laufen.** Installiere die Phaseo CLI mit \`npm install -g @phaseo/cli\`, führe \`phaseo login\` aus und dann den Befehl für deinen Agenten, etwa \`phaseo claude-code\` oder \`phaseo codex\`. Die CLI richtet den Agenten auf Phaseo aus und erstellt für ihn einen eigenen API-Schlüssel mit einem monatlichen Ausgabenlimit von $100 und einer Laufzeit von 90 Tagen. Du bestätigst den Schlüssel in deinem Browser und kannst sein Limit unter **Einstellungen → API-Schlüssel** ändern.

In Claude Code oder Codex installiert das Phaseo-Plugin beide MCP-Server und die Skills in einem Schritt.`,
			quiz: {
				question:
					"Du verbindest deinen Agenten mit https://mcp.phaseo.app/mcp ohne ?access=manage. Was kann er tun?",
				options: [
					"Live-Daten von Phaseo lesen, etwa Modelle, Preise, Credits und Anfrageprotokolle.",
					"API-Schlüssel erstellen und Credits für deinen Workspace kaufen.",
					"Die Prompts und Antworten lesen, die in deinen Anfrageprotokollen gespeichert sind.",
				],
				answer: 0,
				explanation:
					"Die einfache URL ist schreibgeschützt. Für Änderungen brauchst du die Manage-URL, und selbst dann kann der MCP-Server keine Credits kaufen. Seine Tools geben nie Prompts, Antworten oder geheime Werte zurück.",
			},
			scenario: {
				prompt:
					"Du nutzt Codex. Codex soll Phaseo-Code schreiben, der der Dokumentation folgt, und Codex selbst soll über Phaseo auf Modellen laufen. Was richtest du ein?",
				answer:
					"Zwei getrennte Dinge. Für korrekten Code installierst du die Skills mit `npx skills add https://phaseo.app/docs` und fügst den Docs MCP hinzu, wenn er die aktuelle Dokumentation lesen soll. Damit Codex auf Phaseo läuft, installierst du die CLI, führst `phaseo login` und dann `phaseo codex` aus. Das erstellt einen Schlüssel für Codex mit einem monatlichen Limit von $100 und einer Laufzeit von 90 Tagen. Das Phaseo-Plugin für Codex kann die Skills und beide MCP-Server auf einmal installieren.",
			},
			takeaway:
				"Skills und der Docs MCP bringen deinem Agenten Phaseo bei, der Phaseo-MCP-Server gibt ihm Live-Daten, und die CLI lässt ihn auf Phaseo-Modellen laufen.",
			links: [
				{
					label: "CLI und MCP",
					href: "https://phaseo.app/docs/v1/developers/cli-and-mcp",
				},
				{
					label: "Coding-Agenten",
					href: "https://phaseo.app/docs/v1/guides/integrations/coding-assistants",
				},
				{
					label: "Coding-Agenten mit SKILL.md einrichten",
					href: "https://phaseo.app/docs/v1/cookbook/coding-agents-skill-md",
				},
				{
					label: "Phaseo aus einem Agenten verwalten",
					href: "https://phaseo.app/docs/v1/developers/manage-from-an-agent",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "learn-in-your-agent",
			title: "Phaseo in deinem Agenten lernen",
			summary:
				"Mach deinen Coding-Agenten zu einem Tutor, der dir Phaseo beibringt, während er etwas baut, das du wirklich brauchst.",
			minutes: 6,
			body: `\`https://phaseo.app/learn.md\` ist ein Kurs, der für deinen Coding-Agenten geschrieben ist. Füge dies in Claude Code, Codex, Cursor oder einen anderen Agenten ein, der URLs abrufen kann:

\`\`\`text
Fetch https://phaseo.app/learn.md and follow it. Teach me Phaseo while we build something I actually need.
\`\`\`

**Was als Nächstes passiert.** Der Agent fragt, was du bauen willst, welche Erfahrung du hast, welche Sprache und welches Framework du nutzt, welche Grenzen es gibt, etwa Budget oder Region, und woran du erkennst, dass es funktioniert. Daraus schreibt er eine Mission und schlägt dann die kleinste Version vor, die von Anfang bis Ende funktioniert. Ihr einigt euch auf den Plan, bevor er Code schreibt.

**So läuft jede Lektion ab.** Der Agent schreibt den Code; du triffst die Entscheidungen, etwa welches Modell, welcher Endpunkt und was passieren soll, wenn eine Anfrage fehlschlägt. Er erklärt eine Idee nach der anderen, fragt, bevor er eine Änderung schreibt, führt sie mit dir aus und stellt dir dann eine Frage, um zu prüfen, ob du es verstanden hast, bevor es weitergeht. Modell-IDs, Preise und Limits schlägt er nach, statt sie zu raten.

**Dein Fortschritt wird gespeichert**, und zwar in einem Ordner \`.phaseo-learn/\` in deinem Projekt: der Kurs selbst, deine Mission und dein Plan, Notizen dazu, wie du gern arbeitest, die genutzten Dokumentationsseiten und ein Eintrag pro Lektion. Starte eine neue Sitzung mit demselben Prompt, dann liest der Agent diese Dateien und macht dort weiter, wo du aufgehört hast. Er bietet an, den Ordner zu \`.gitignore\` hinzuzufügen; das entscheidest du.

Setze \`PHASEO_API_KEY\` selbst, bevor du startest. Der Kurs weist den Agenten an, dich nie zu bitten, einen Schlüssel in den Chat einzufügen.`,
			quiz: {
				question: "Wo speichert der Kurs deinen Fortschritt zwischen den Sitzungen?",
				options: [
					"In einem Ordner .phaseo-learn/ in deinem Projekt.",
					"In deinem Phaseo-Konto, unter Einstellungen.",
					"Nirgends: Jede Sitzung beginnt von vorn.",
				],
				answer: 0,
				explanation:
					"Der Agent speichert den Kurs, deine Mission, Notizen, Quellen und Lektionseinträge in `.phaseo-learn/` und liest sie zu Beginn jeder Sitzung.",
			},
			scenario: {
				prompt:
					"Mitten in einer Sitzung schreibt der Agent drei Dateien hintereinander, nachdem du nur „ok“ gesagt hast, und nennt einen Modellpreis aus dem Gedächtnis. Was solltest du tun?",
				answer:
					"Beides sind Zeichen, dass der Agent vom Kurs abgewichen ist. Bitte ihn, anzuhalten, `.phaseo-learn/COURSE.md` und `MISSION.md` erneut zu lesen und dir eine Kontrollfrage zu dem zu stellen, was er zuletzt gebaut hat. Bitte ihn, den Preis über `GET https://api.phaseo.app/v1/models` oder die Modellseite nachzuschlagen, statt ihn aus dem Gedächtnis zu nennen.",
			},
			takeaway:
				"Ein Prompt macht deinen Agenten zu einem Phaseo-Tutor, der dein Projekt mit dir baut und deinen Fortschritt in .phaseo-learn/ speichert.",
			links: [
				{ label: "Der Kurs für deinen Agenten", href: "https://phaseo.app/learn.md" },
				{
					label: "Schnellstart",
					href: "https://phaseo.app/docs/v1/quickstart",
				},
				{
					label: "Docs MCP",
					href: "https://phaseo.app/docs/v1/guides/integrations/docs-mcp",
				},
			],
			updated: "2026-11-17",
		},
	],
};
