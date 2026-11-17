import type { LearnCourse } from "../../types";

const DOCS = "https://phaseo.app/docs/v1";

export const adminsCourse: LearnCourse = {
	slug: "set-up-your-team",
	title: "Phaseo für dein Team einrichten",
	summary:
		"Hol dein Team in einen Workspace, gib Schlüssel sicher aus, begrenze Ausgaben, richte Guardrails und Routing ein und sieh, wie AI genutzt wird. Ganz ohne Code.",
	level: "admin",
	format: "Ohne Code",
	prerequisites: ["Was ist Phaseo?"],
	lessons: [
		{
			slug: "workspaces-and-members",
			title: "Workspaces und Mitglieder",
			summary:
				"Trenne Teams mit Workspaces, lade Personen mit einem Code ein und gib jeder Person die richtige Rolle.",
			minutes: 7,
			body: `Ein Workspace hat seine eigenen API-Schlüssel, Routing-Einstellungen, Voreinstellungen, Guardrails und seinen eigenen Admin-Zugang. Jedes Konto startet mit einem persönlichen Workspace. Lege weitere für jedes Team, Produkt oder jede Umgebung an, zum Beispiel um Produktionsschlüssel von der Entwicklung fernzuhalten. Zusätzliche Workspaces werden nach deiner ersten Credit-Einzahlung freigeschaltet und ändern deine Preise nicht.

Jede Person in einem Workspace hat eine von drei Rollen:

- **Inhaber**: die Person, der der Workspace gehört. Nur der Inhaber kann jemanden zum Admin machen, Rollen ändern oder andere Mitglieder entfernen. Der Inhaber selbst kann nicht entfernt werden.
- **Admin**: verwaltet die Einstellungen, die nur Admins vorbehalten sind, etwa API-Schlüssel, Budgets, Ausgabenregeln und Guardrails, und liest das Auditprotokoll.
- **Mitglied**: nutzt den Workspace und kann seine Ausgabenregeln sehen, aber keine Einstellungen ändern, die Inhabern und Admins vorbehalten sind.

Um jemanden einzuladen, öffne **Einstellungen → Mitglieder** und wähle **Einladung erstellen**. Wähle die Rolle (Admin oder Mitglied), wie viele Tage die Einladung gilt und, wenn du willst, eine Höchstzahl an Nutzungen. Du bekommst einen Code zum Teilen. Deine Teamkollegin öffnet **Einstellungen → Arbeitsbereiche**, wählt **Du hast einen Einladungscode?** und gibt ihn ein. Das sendet eine Beitrittsanfrage, die ein Inhaber oder Admin unter **Beitrittsanfragen** bestätigt. Nur der Inhaber kann jemanden als Admin bestätigen.

Wechsle zwischen Workspaces mit dem Workspace-Umschalter in der Kopfzeile. Alles, was du in den Einstellungen siehst, von Schlüsseln bis zur Nutzung, gehört zum gerade geöffneten Workspace. Deinen persönlichen Workspace kannst du weder umbenennen noch löschen.`,
			quiz: {
				question: "Ein Admin will eine neue Kollegin als weiteren Admin hinzufügen. Was passiert?",
				options: [
					"Der Admin erstellt eine Einladung mit der Rolle Admin und bestätigt die Beitrittsanfrage.",
					"Nur der Inhaber des Workspace kann jemanden als Admin einladen oder bestätigen.",
					"Admins können nicht eingeladen werden; jede neue Person tritt als Inhaber bei.",
				],
				answer: 1,
				explanation:
					"Wer Admin wird, entscheidet der Inhaber. Ein Admin kann Mitglieder einladen, aber eine Einladung mit der Rolle Admin, ihre Bestätigung und spätere Rollenänderungen brauchen alle den Inhaber des Workspace.",
			},
			scenario: {
				prompt:
					"Ein externer Mitarbeiter hat sein Projekt beendet, und du willst ihn aus dem Workspace entfernen. Er hat den API-Schlüssel eingerichtet, den dein Support-Bot noch nutzt. Was solltest du zuerst prüfen?",
				answer:
					"Wenn du ein Mitglied entfernst, werden auch die API-Schlüssel widerrufen, die es in diesem Workspace erstellt hat, und der Support-Bot würde nicht mehr funktionieren. Erstelle zuerst selbst einen Ersatzschlüssel (oder rotiere seinen in einen neuen Schlüssel), stelle den Bot darauf um und bitte dann den Inhaber, den externen Mitarbeiter unter Einstellungen → Mitglieder zu entfernen.",
			},
			takeaway:
				"Gib jedem Team und jeder Umgebung einen eigenen Workspace und behalte die Admin-Rolle den wenigen Personen vor, die Schlüssel, Budgets und Guardrails verwalten.",
			links: [
				{ label: "Leitfaden zu Workspaces", href: `${DOCS}/guides/workspaces` },
				{ label: "Mitglieder", href: "/settings/workspaces/members" },
				{ label: "Deine Workspaces", href: "/settings/account/workspaces" },
				{ label: "Glossar: Rollen", href: `${DOCS}/glossary` },
			],
			updated: "2026-11-17",
		},
		{
			slug: "keys-for-a-team",
			title: "API-Schlüssel für ein Team",
			summary:
				"Gib jeder App und Umgebung einen eigenen, begrenzten Schlüssel, nutze Management-Schlüssel für Automatisierung und rotiere Schlüssel ohne Ausfallzeit.",
			minutes: 8,
			body: `Inhaber und Admins erstellen API-Schlüssel unter **Einstellungen → API-Schlüssel**. Nutze **einen Schlüssel pro App und Umgebung**, nicht einen gemeinsamen Schlüssel für alle. Dann siehst du die Nutzung jedes Schlüssels, kannst ihn begrenzen und ersetzen, ohne etwas anderes anzufassen. Das Geheimnis wird nur einmal angezeigt, es kommt also direkt in deinen Secrets-Manager.

Jeder Schlüssel kann tägliche, wöchentliche oder monatliche Limits für Anfragen und Ausgaben haben. Sie werden bei jeder Anfrage geprüft und um Mitternacht UTC, am Montag oder am Monatsersten zurückgesetzt. Ist ein Limit erreicht, werden Anfragen mit diesem Schlüssel abgelehnt, bis der Zeitraum zurückgesetzt wird. **Schlüsselsicherheit** listet Schlüssel, die Schaden anrichten könnten, wenn sie durchsickern: ohne Ausgabenlimit, ohne Ablaufdatum, seit 90 Tagen oder länger ungenutzt oder von jeder IP-Adresse aus nutzbar.

Für Automatisierung, etwa ein Skript, das Schlüssel erstellt oder die Nutzung liest, nimmst du einen **Management-Schlüssel** aus **Einstellungen → Verwaltungsschlüssel**. Management-Schlüssel können keine Modellanfragen senden. Wähle eine Vorlage: **Lesen**, **Schreiben** (ohne Löschen) oder **Alle**, oder wähle nur die Funktionen, die du brauchst. Ein Management-Schlüssel kann nie mehr, als die Rolle der Person dahinter erlaubt.

Um einen Schlüssel zu ersetzen, wähle **Rotieren**. Phaseo erstellt einen Ersatz mit denselben Limits und lässt dich wählen, wann der aktuelle Schlüssel abläuft: sofort, in 1 Stunde, 24 Stunden oder 7 Tagen, zu einem Zeitpunkt deiner Wahl oder nie. Stelle deine Apps auf den neuen Schlüssel um, bevor der alte abläuft. Du kannst einen Schlüssel auch pausieren und später fortsetzen oder ihn endgültig löschen. Ein widerrufener Schlüssel lässt sich nicht wieder einschalten.`,
			quiz: {
				question: "Dein Team will ein nächtliches Skript, das API-Schlüssel erstellt und löscht. Welche Zugangsdaten sollte es nutzen?",
				options: [
					"Einen normalen API-Schlüssel mit hohem Ausgabenlimit.",
					"Einen Management-Schlüssel mit nur den Schlüssel-Funktionen, die es braucht.",
					"Einen Management-Schlüssel mit der Vorlage Alle, damit es nie fehlschlägt.",
				],
				answer: 1,
				explanation:
					"Nur Management-Schlüssel können die Verwaltungs-APIs aufrufen, normale API-Schlüssel nicht. Gib dem Skript den kleinsten Satz an Funktionen, der funktioniert, und behalte Alle für vertrauenswürdige Admin-Automatisierung vor.",
			},
			scenario: {
				prompt:
					"Ein Entwickler sagt dir, dass der Produktions-API-Schlüssel vor einer Stunde in ein öffentliches Repository gepusht wurde. Was tust du?",
				answer:
					"Rotiere den Schlüssel sofort und lass den aktuellen Schlüssel sofort ablaufen. Lege das neue Geheimnis in deinen Secrets-Manager und aktualisiere die App. Prüfe dann die Anfragen des Schlüssels in Einstellungen → Protokolle auf alles, was du nicht kennst. Erst rotieren, dann untersuchen.",
			},
			takeaway:
				"Ein Schlüssel pro App und Umgebung, jeder mit Ausgabenlimit, hält Lecks klein und macht Rotation schmerzlos.",
			links: [
				{ label: "Authentifizierung und Schlüssel", href: `${DOCS}/developers/authentication` },
				{ label: "Management-API-Schlüssel", href: `${DOCS}/developers/management-api-keys` },
				{ label: "API-Schlüssel", href: "/settings/keys" },
				{ label: "Schlüsselsicherheit", href: "/settings/security" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "bring-your-own-keys",
			title: "Eigene Anbieterschlüssel verwenden",
			summary:
				"Füge die Schlüssel deiner eigenen Anbieterkonten hinzu, damit Phaseo Anfragen damit routet, und lege fest, wann Phaseos eigene Anbieterschlüssel übernehmen dürfen.",
			minutes: 8,
			body: `Mit **Bring your own key (BYOK)** gibst du Phaseo einen API-Schlüssel aus deinem eigenen Konto bei einem Anbieter. Phaseo routet und protokolliert die Anfrage weiterhin, ruft den Anbieter aber mit deinem Schlüssel auf, und **dein Anbieter rechnet die Modellnutzung direkt ab**. Es gelten die Kontingente, Ratenlimits, Datenrichtlinie und der Modellzugang deines Anbieterkontos, nicht die gemeinsame Kapazität von Phaseo.

Inhaber und Admins fügen Schlüssel unter **Einstellungen → Eigenen Schlüssel verwenden** hinzu. Wähle den Anbieter, dann **Anbieterschlüssel festlegen**, und füge den Schlüssel ein. Phaseo verschlüsselt ihn (AES-256-GCM), bindet ihn an Workspace und Anbieter und zeigt ihn nie wieder an. Beschränke jeden Schlüssel auf die Modelle und API-Schlüssel, die ihn brauchen, statt ihn für alle freizugeben, und nutze **Testen**, um ihn im Chat auszuprobieren. Jede Änderung an einem Anbieterschlüssel wird im Auditprotokoll des Workspace erfasst.

Jeder Anbieterschlüssel ist eine von zwei Arten, und du kannst Schlüssel ziehen, um ihre Reihenfolge zu ändern:

- **Priorisiert**: Phaseo versucht diese zuerst, von oben nach unten.
- **Rückfalloption**: Diese übernehmen nur, wenn Phaseos eigene Route die Anfrage nicht abschließen kann.

Schlägt ein priorisierter Schlüssel fehl, entscheidet die Workspace-Einstellung **BYOK-Fallback**, ob die Anfrage mit Phaseos eigenen Anbieterschlüsseln wiederholt werden darf, bezahlt aus deinen Credits. Sie ist standardmäßig eingeschaltet. Schalte sie aus, wenn die Nutzung ausschließlich über deine eigenen Anbieterkonten laufen darf. Batch-Aufträge nutzen derzeit Phaseos Schlüssel, nicht deine.

**Was Phaseo berechnet:** keine Servicegebühr für die ersten 250.000 abgeschlossenen BYOK-Anfragen pro Workspace und UTC-Monat, danach 2,5 % dessen, was die Anfrage zu Anbieterpreisen gekostet hätte. Die Gebühr wird von deinen Credits abgezogen. Halte also mindestens $1 verfügbar; das deckt auch ein Fallback auf Phaseos Schlüssel ab. Die Seite zeigt die BYOK-Anfragen dieses Monats und wie viele gebührenfreie noch übrig sind.`,
			quiz: {
				question:
					"Dein Workspace hat einen priorisierten OpenAI-Schlüssel, und das BYOK-Fallback ist ausgeschaltet. Der Anbieter lehnt eine Anfrage mit deinem Schlüssel ab. Was passiert?",
				options: [
					"Phaseo wiederholt sie mit seinen eigenen Anbieterschlüsseln und belastet deine Credits.",
					"Phaseo berechnet eine Gebühr von 2,5 % und wiederholt sie mit demselben Schlüssel.",
					"Die Anfrage wird nicht mit Phaseos Schlüsseln wiederholt, weil das Fallback ausgeschaltet ist.",
				],
				answer: 2,
				explanation:
					"Das BYOK-Fallback entscheidet, ob eine fehlgeschlagene Anfrage mit einem priorisierten Schlüssel mit Phaseos eigenen Anbieterschlüsseln wiederholt werden darf. Ist es ausgeschaltet, läuft die Nutzung nur über deine eigenen Anbieterkonten.",
			},
			scenario: {
				prompt:
					"Dein Unternehmen hat bereits einen Vertrag mit fester Abnahmemenge bei einem Anbieter, und die Buchhaltung will, dass die Nutzung dort abgerechnet wird, nicht über Phaseo-Credits. Dein Team sendet etwa 400.000 Anfragen pro Monat. Wie richtest du das ein, und was berechnet Phaseo trotzdem?",
				answer:
					"Füge den Anbieterschlüssel unter Einstellungen → Eigenen Schlüssel verwenden als priorisierten Schlüssel hinzu, beschränkt auf die Modelle und API-Schlüssel, die ihn nutzen sollen. Schalte das BYOK-Fallback aus, wenn keine Nutzung über Phaseos Schlüssel laufen darf. Der Anbieter rechnet die Modellnutzung ab. Phaseo berechnet für die ersten 250.000 abgeschlossenen BYOK-Anfragen des Monats nichts und für den Rest 2,5 % der Kosten zu Anbieterpreisen, bezahlt aus Credits. Halte also ein kleines Guthaben bereit.",
			},
			takeaway:
				"BYOK sendet Anfragen über deine eigenen Anbieterkonten; die Fallback-Einstellung entscheidet, ob Phaseos Schlüssel einspringen dürfen, wenn deine fehlschlagen.",
			links: [
				{ label: "Hinweise zu BYOK", href: `${DOCS}/guides/routing-and-fallbacks#byok-considerations` },
				{ label: "Pläne und BYOK-Gebühren", href: `${DOCS}/exploring/subscription-plans` },
				{ label: "Eigenen Schlüssel verwenden", href: "/settings/byok" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "budgets-and-spend-rules",
			title: "Budgets und Ausgabenregeln",
			summary:
				"Nutze Credits, Budgets und Schlüssellimits als feste Obergrenzen und Ausgabenregeln als Frühwarnung.",
			minutes: 9,
			body: `Kostenpflichtige Modelle werden aus dem Credit-Guthaben deines Workspace bezahlt. Du lädst es unter **Einstellungen → Abrechnung und Guthaben** auf; dort gibt es auch eine einfache E-Mail bei niedrigem Guthaben. Kostenlose Modelle brauchen keine Credits.

Phaseo hat zwei Arten fester Obergrenzen. Beide werden bei jeder Anfrage geprüft, die Ausgaben können sie also nicht überschreiten:

- **Workspace-Budgets** unter **Einstellungen → Budgets**: ein tägliches, wöchentliches, monatliches oder Gesamtlimit für den ganzen Workspace. Die Seite zeigt die bisherigen Ausgaben, den verbrauchten Anteil und eine Prognose.
- **Schlüssellimits**: Limits für Anfragen und Ausgaben eines einzelnen API-Schlüssels.

**Ausgabenregeln** warnen dich, bevor du eine Obergrenze erreichst. Öffne **Einstellungen → Benachrichtigungen → Ausgabenwarnungen** und wähle **Warnung hinzufügen**. Eine Regel legt fest, wessen Ausgaben zählen (der Workspace, ein Schlüssel, ein Mitglied, eine Abteilung, ein Modell oder ein Anbieter), einen Zeitraum und Schwellenwerte. Sie kann bei Ausgaben warnen, bei einem Anteil eines Budgets, bei einer Prognose für den Zeitraum, bei einem plötzlichen Anstieg oder bei niedrigem Guthaben. Mitglieder können Regeln sehen; Inhaber und Admins erstellen und ändern sie.

Eine Regel kann auch Anfragen blockieren, sobald die Ausgaben ein Limit überschreiten. Das Blockieren erfolgt nach bestem Bemühen: Regeln laufen auf erfasster Nutzung, ein paar Minuten nachdem Anfragen abgeschlossen sind. Die Ausgaben können das Limit also zuerst etwas überschreiten. Nutze Budgets und Schlüssellimits für exakte Obergrenzen und blockierende Regeln für breitere Bereiche wie ein einzelnes Mitglied. Ausgabenwarnungen und das Blockieren werden noch schrittweise eingeführt; bis sie für dich eingeschaltet sind, werden Regeln gespeichert, aber nicht ausgeführt.

Um zu begrenzen, wie schnell jemand Anfragen senden kann, statt wie viel er ausgibt, nutze **Einstellungen → Ratenlimits**. Eine Richtlinie kann Anfragen pro Minute, Tokens pro Minute oder gleichzeitige Anfragen für einen Schlüssel, ein Mitglied, eine Abteilung oder jeden deiner Endnutzer festlegen. Guardrails begrenzen nie Ausgaben.`,
			quiz: {
				question: "Du brauchst eine monatliche Obergrenze für den ganzen Workspace, die bei jeder Anfrage geprüft wird. Was nutzt du?",
				options: [
					"Ein monatliches Workspace-Budget.",
					"Eine Ausgabenregel mit der Aktion Blockieren.",
					"Eine Guardrail mit einem Ausgabenlimit.",
				],
				answer: 0,
				explanation:
					"Workspace-Budgets und Schlüssellimits werden bei jeder Anfrage geprüft. Eine blockierende Ausgabenregel greift erst ein paar Minuten nach Überschreiten des Limits, und Guardrails haben gar keine Ausgabenlimits.",
			},
			scenario: {
				prompt:
					"Ein neues Teammitglied experimentiert mit großen Modellen. Du willst eine Warnung, wenn seine monatlichen Ausgaben $200 erreichen, und seine Anfragen sollen gestoppt werden, wenn sie $250 erreichen. Wie richtest du das ein?",
				answer:
					"Füge eine Ausgabenregel für dieses Mitglied hinzu, mit monatlichem Zeitraum, einer Warnschwelle von $200 und der Aktion Blockieren bei $250. Denk daran, dass die Blockierung ein paar Minuten später greift. Brauchst du eine exakte Obergrenze, setze zusätzlich ein monatliches Ausgabenlimit für die Schlüssel, die es nutzt.",
			},
			takeaway:
				"Budgets und Schlüssellimits sind deine festen Stopps; Ausgabenregeln sind die Frühwarnung davor.",
			links: [
				{ label: "Leitfaden zu Ausgabenwarnungen", href: `${DOCS}/guides/spend-alerts` },
				{ label: "Schlüssellimits und Budgets", href: `${DOCS}/api-reference/limits` },
				{ label: "Budgets", href: "/settings/budgets" },
				{ label: "Benachrichtigungen", href: "/settings/notifications" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "guardrails",
			title: "Guardrails",
			summary:
				"Lege fest, welche Anbieter und Modelle Schlüssel erreichen, wie Daten verarbeitet werden und was markiert, geschwärzt oder blockiert wird.",
			minutes: 9,
			body: `Eine Guardrail ist ein Satz von Regeln für API-Traffic. Erstelle eine unter **Einstellungen → Leitplanken → Neue Leitplanke**. Benenne sie nach dem, was sie durchsetzt, etwa "eu-models-pii-redact", damit du sie für mehrere Schlüssel wiederverwenden kannst. Eine Guardrail kann Folgendes festlegen:

- **Anbietermodus**: alle Anbieter erlauben, nur ausgewählte oder alle außer ausgewählten.
- **Modellmodus**: alle Modelle erlauben oder nur ausgewählte.
- **Datenverarbeitung**: nur Zero Data Retention (ZDR), und ob Endpunkte, die mit Eingaben trainieren dürfen, zulässig bleiben.
- Prüfungen auf **Prompt-Injection** und **Sensible Daten**, etwa E-Mail-Adressen, Telefonnummern oder Kartennummern. Jede Prüfung kann **Markieren**, **Schwärzen** oder **Blockieren**.

Teste in der Vorschau vor dem Speichern eine harmlose Eingabe, eine, die gestoppt werden sollte, und einen echten Prompt. Hänge die Guardrail dann unter **Auf Schlüssel anwenden** an oder unter **Auf Mitglieder anwenden**, um jeden Schlüssel abzudecken, den diese Mitglieder erstellen. Mitglieder können eine Guardrail, die ein Inhaber oder Admin ihnen zugewiesen hat, weder bearbeiten noch entfernen.

Regeln unter **Einstellungen → Datenschutz** gelten für jede Anfrage im Workspace, und eine Guardrail kann sie nur weiter einschränken. Gelten mehrere Guardrails für denselben Schlüssel, zum Beispiel eine am Schlüssel und eine an der Person, die ihn erstellt hat, zählen alle, und das strengste Ergebnis gewinnt. Ein Modell muss von jeder Guardrail erlaubt sein, blockierte Anbieter werden addiert, ZDR ist Pflicht, sobald eine Guardrail es verlangt, und die stärkste Aktion wird genutzt (Blockieren vor Schwärzen vor Markieren).

Fang klein an: Hänge eine neue Guardrail an einen Schlüssel mit geringem Risiko und prüfe **Einstellungen → Nutzung → Leitplanken-Aktivität** und die Anfrageprotokolle, bevor du sie ausweitest. Eine ausgeschaltete Guardrail behält ihre Einstellungen, wird aber nicht durchgesetzt. Guardrails begrenzen keine Ausgaben; dafür gibt es Budgets und Schlüssellimits.`,
			quiz: {
				question:
					"Die eigene Guardrail eines Schlüssels erlaubt die Modelle A und B. Die Mitglieds-Guardrail der Person, die ihn erstellt hat, erlaubt nur Modell B. Welche Modelle kann der Schlüssel nutzen?",
				options: ["A und B", "Nur B", "Keines, weil sich die Guardrails widersprechen"],
				answer: 1,
				explanation:
					"Alle Guardrails, die für einen Schlüssel gelten, zählen, und die strengste gewinnt. Ein Modell muss von jeder erlaubt sein, also bleibt nur B übrig.",
			},
			scenario: {
				prompt:
					"Deine Rechtsabteilung will, dass E-Mail-Adressen und Telefonnummern aus Prompts entfernt werden und nur Anbieter mit Zero Data Retention zum Einsatz kommen. Du willst den Support-Bot während der Einführung nicht lahmlegen. Wie gehst du vor?",
				answer:
					"Erstelle eine Guardrail mit „nur ZDR“ und „Sensible Daten“ auf Schwärzen für E-Mail und Telefon. Teste sie in der Vorschau mit einem harmlosen, einem sensiblen und einem echten Prompt. Hänge sie zuerst an einen Staging-Schlüssel oder einen Schlüssel mit geringem Risiko, prüfe die Leitplanken-Aktivität und die Protokolle und hänge sie dann an den Schlüssel des Support-Bots und die anderen Schlüssel, die sie brauchen.",
			},
			takeaway:
				"Guardrails addieren sich: Jede, die gilt, zählt. Baue also kleine, klar benannte Richtlinien und führe sie Schlüssel für Schlüssel ein.",
			links: [
				{ label: "Guardrails einführen", href: `${DOCS}/cookbook/guardrails-for-api-keys` },
				{ label: "Überblick über die Guardrails-API", href: `${DOCS}/api-reference/endpoint/guardrails` },
				{ label: "Leitplanken", href: "/settings/guardrails" },
				{ label: "Datenschutz", href: "/settings/privacy" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "routing-defaults-and-auto-routing",
			title: "Routing-Standards, Voreinstellungen und Auto Routing",
			summary:
				"Lege fest, wie dein Workspace Anbieter auswählt, teile Konfigurationen mit Voreinstellungen und lass Auto Routing das Modell wählen.",
			minutes: 8,
			body: `Die meisten Modelle werden von mehreren Anbietern bedient. Unter **Einstellungen → Routing** legst du fest, wie dein Workspace sie standardmäßig reiht: **Ausgewogen** (der Standard, Kosten pro erfolgreicher Antwort), **Preis**, **Latenz** oder **Durchsatz**. Eine einzelne Anfrage kann einen anderen Modus verlangen, aber deine Zulassungslisten, Guardrails und Preisobergrenzen gelten weiterhin. Dieselbe Seite hat Schalter für Beta- und Alpha-Anbieter, damit Vorschau-Anbieter nur dann Traffic bekommen, wenn du dich dafür entscheidest.

Eine **Voreinstellung** speichert Modell, Systemprompt, Parameter und Anbieterregeln für eine Aufgabe unter einem Namen wie "@support-triage". Erstelle Voreinstellungen unter **Einstellungen → Voreinstellungen**. Apps senden statt eines Modells den Namen der Voreinstellung, sodass du Modell oder Prompt an einer Stelle ändern kannst, ohne neu zu deployen. Jedes **Neue Version veröffentlichen** behält die früheren Versionen. Lass ein Label wie "production" auf eine Version zeigen und verschiebe es zurück, um zurückzurollen.

Mit **Auto Routing** wählt Phaseo das Modell für jede Anfrage, wenn eine App "phaseo/auto" sendet. Es ist in der [Alpha](https://phaseo.app/docs/v1/developers/feature-maturity) und wird auf Anfrage pro Workspace eingeschaltet. Unter **Einstellungen → Routing → Automatisches Routing** wählst du:

- ein **Ziel**: Ausgewogen, Qualität, Kosten oder Latenz;
- ein **Ausgabenprofil**: eine feste Preisobergrenze (Sparsam, Standard, Premium, Jeder Preis oder Benutzerdefiniert). Modelle darüber werden nie berücksichtigt;
- optionale Modellmuster, um die Auswahl einzugrenzen, und ob bei Fehlern auf das nächste Modell ausgewichen wird.

Anfragen können diese Einstellungen nicht ändern, und jeder Kandidat durchläuft weiterhin deine Datenschutzregeln und Guardrails. Prüfe die Modellmischung anhand deiner eigenen Arbeit, denn die Einstellungen entscheiden, welche Modelle infrage kommen, nicht, wie gut die Antworten sind.`,
			quiz: {
				question: "Dein Workspace nutzt Auto Routing mit dem Ausgabenprofil Sparsam. Was bewirkt dieses Profil?",
				options: [
					"Es setzt eine feste Preisobergrenze, sodass Modelle darüber nie berücksichtigt werden.",
					"Es ist eine Präferenz, die eine Anfrage mit ihrem eigenen Ziel überschreiben kann.",
					"Es lässt Auto Routing Guardrails überspringen, um Zeit zu sparen.",
				],
				answer: 0,
				explanation:
					"Ausgabenprofile sind feste Obergrenzen für Standard-Textpreise. Anfragen können Ziel, Ausgabenprofil und Muster des Workspace nicht ändern, und jeder Kandidat durchläuft weiterhin deine Guardrails.",
			},
			scenario: {
				prompt:
					"Drei Apps nutzen dasselbe Modell und denselben Systemprompt für die Ticket-Triage. Du willst ein neueres Modell ausprobieren, ohne jedes Team um ein neues Deployment zu bitten, und es schnell rückgängig machen können, falls die Antworten schlechter werden. Was richtest du ein?",
				answer:
					"Erstelle eine Voreinstellung, zum Beispiel @support-triage, und lass die Apps sie über ihren Namen aufrufen. Veröffentliche eine neue Version mit dem neueren Modell und verschiebe das Label production darauf. Werden die Antworten schlechter, verschiebst du das Label zurück auf die frühere Version.",
			},
			takeaway:
				"Setze sinnvolle Workspace-Standards, teile Konfigurationen über Voreinstellungen und behandle Auto Routing als Alpha, das du an deiner eigenen Arbeit testest.",
			links: [
				{ label: "Routing und Fallbacks", href: `${DOCS}/guides/routing-and-fallbacks` },
				{ label: "Leitfaden zu Voreinstellungen", href: `${DOCS}/guides/presets` },
				{ label: "Leitfaden zu Auto Routing", href: `${DOCS}/guides/auto-routing` },
				{ label: "Routing-Einstellungen", href: "/settings/routing" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "see-how-ai-is-used",
			title: "Sehen, wie AI genutzt wird",
			summary:
				"Nutze Nutzungsseiten, Protokolle, Anfragekennzeichnungen, Klassifikatoren und das Auditprotokoll, um zu sehen, wer was ausgibt und wer was geändert hat.",
			minutes: 7,
			body: `**Einstellungen → Nutzung** zeigt Ausgaben und Traffic für den geöffneten Workspace, mit den Seiten Übersicht, Trends, Erkunden, Geografie, Leitplanken-Aktivität und Warnungen. **Einstellungen → Protokolle** listet jede Anfrage mit dem Modell und dem Anbieter, die sie bedient haben, dazu Sitzungen, Videos, Batches und Echtzeitsitzungen.

Um Ausgaben nach Team, Funktion oder Umgebung aufzuteilen, bitte deine Entwickler, ihren Anfragen **Anfragekennzeichnungen** wie team=support hinzuzufügen. Dann kannst du Protokolle und Nutzung nach diesen Kennzeichnungen filtern. Kennzeichnungen werden nicht an Anbieter gesendet. Schreib keine Prompts, Geheimnisse oder personenbezogenen Daten hinein.

Wenn deine Apps die Kategorie nicht kennen, kann ein **Anfrage-Klassifikator** Kennzeichnungen für dich ergänzen. Du beschreibst die Kategorien, etwa Abteilung oder Aufgabentyp, und wählst ein Modell, das jede abgeschlossene Anfrage kennzeichnet. Es verlangsamt die Anfrage nie, und du kannst eine Stichprobenrate und ein monatliches Budget festlegen. Inhaber und Admins verwalten Klassifikatoren unter **Einstellungen → Klassifikatoren**. Klassifikatoren sind in der **Beta** und werden auf Anfrage pro Workspace eingeschaltet; alles andere in dieser Lektion ist allgemein verfügbar. Was das bedeutet, erfährst du unter [Funktionsreife](https://phaseo.app/docs/v1/developers/feature-maturity).

Protokolle zeigen, welcher Traffic gelaufen ist. Das **Auditprotokoll** zeigt, wer die Steuerungen drumherum geändert hat. Öffne **Einstellungen → Aktivität**, um zu sehen, wer einen Schlüssel erstellt, rotiert oder gelöscht, die Rolle eines Mitglieds geändert, eine Guardrail bearbeitet, eine Version einer Voreinstellung veröffentlicht oder eine Ausgabensperre aufgehoben hat, und wann. Nur Inhaber und Admins können es lesen. Es speichert nie Geheimnisse oder Anfrageinhalte.`,
			quiz: {
				question: "Das Ausgabenlimit eines Schlüssels wurde über Nacht erhöht, und niemand erinnert sich daran. Wo schaust du nach?",
				options: [
					"Einstellungen → Protokolle, gefiltert auf diesen Schlüssel.",
					"Einstellungen → Nutzung → Trends.",
					"Einstellungen → Aktivität, das Auditprotokoll des Workspace.",
				],
				answer: 2,
				explanation:
					"Protokolle und Nutzung zeigen die Anfragen, die gelaufen sind. Änderungen an Schlüsseln, Mitgliedern, Guardrails und anderen Steuerungen werden im Auditprotokoll erfasst, mit der Person, die sie vorgenommen hat, und dem Zeitpunkt.",
			},
			scenario: {
				prompt:
					"Die Buchhaltung will eine monatliche Aufteilung der AI-Ausgaben nach Abteilung. Deine Apps senden keine Kennzeichnungen, und die Entwickler sind wochenlang ausgelastet. Was kannst du tun?",
				answer:
					"Lass Anfrage-Klassifikatoren einschalten (sie sind in der Beta) und erstelle dann einen mit der Dimension Abteilung, einer Stichprobenrate und einem monatlichen Budget. Seine Antworten werden als Anfragekennzeichnungen gespeichert, sodass du die Nutzung nach Abteilung filtern kannst. Wenn die Entwickler Zeit haben, können sie eigene Kennzeichnungen für eine exakte Zuordnung ergänzen.",
			},
			takeaway:
				"Kennzeichnungen und Klassifikatoren erklären, wohin die Ausgaben gehen; das Auditprotokoll erklärt, wer was geändert hat.",
			links: [
				{ label: "Anfragekennzeichnungen", href: `${DOCS}/guides/request-labels` },
				{ label: "Anfrage-Klassifikatoren", href: `${DOCS}/guides/request-classifiers` },
				{ label: "Auditprotokoll des Workspace", href: `${DOCS}/guides/workspace-audit-log` },
				{ label: "Nutzung", href: "/settings/usage/overview" },
			],
			updated: "2026-11-17",
		},
	],
};
