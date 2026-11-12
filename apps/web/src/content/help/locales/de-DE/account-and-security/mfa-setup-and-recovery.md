---
title: MFA einrichten und wiederherstellen
description: So richtest du den Zugriff auf die Multi-Faktor-Authentifizierung ein und verwaltest ihn.
order: 2
updated: 2026-07-11
---

Aktiviere MFA unter `Einstellungen -> Konto`, um deine API-Schlüssel und Abrechnungsvorgänge zu schützen.

Empfohlene Einrichtung:

- Registriere zuerst eine Authenticator-App.
- Sichere die Konfiguration deiner Authenticator-App, bevor du das Gerät wechselst.
- Bestätige nach der Einrichtung eine neue Anmeldung.

Supabase stuft eine Sitzung erst nach einer verifizierten Authenticator-Prüfung hoch. Diese Anwendung stellt keine eigenen Wiederherstellungscodes aus, da diese nicht die erforderliche AAL2-Sitzung erzeugen können. Wenn du den Zugriff auf deine Authenticator-App verlierst, wende dich an den Support, damit wir das Konto sicher wiederherstellen können.

Passkeys können ebenfalls auf der MFA-Einstellungsseite hinzugefügt werden, sobald sie für die aktuelle Umgebung aktiviert sind. Sie ermöglichen die Anmeldung ohne Passwort und ersetzen nicht den für MFA erforderlichen Authenticator-Faktor.
