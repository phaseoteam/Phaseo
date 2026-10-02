---
title: MFA einrichten und wiederherstellen
description: So richten Sie den Zugriff auf die Multi-Faktor-Authentifizierung ein und verwalten ihn.
order: 2
updated: 2026-07-11
---

Aktivieren Sie MFA unter `Einstellungen -> Konto`, um Ihre API-Schlüssel und Abrechnungsvorgänge zu schützen.

Empfohlene Einrichtung:

- Registrieren Sie zuerst eine Authenticator-App.
- Sichern Sie die Konfiguration Ihrer Authenticator-App, bevor Sie das Gerät wechseln.
- Bestätigen Sie nach der Einrichtung eine neue Anmeldung.

Supabase stuft eine Sitzung erst nach einer verifizierten Authenticator-Prüfung hoch. Diese Anwendung stellt keine eigenen Wiederherstellungscodes aus, da diese nicht die erforderliche AAL2-Sitzung erzeugen können. Wenn Sie den Zugriff auf Ihre Authenticator-App verlieren, wenden Sie sich an den Support, damit wir das Konto sicher wiederherstellen können.

Passkeys können ebenfalls auf der MFA-Einstellungsseite hinzugefügt werden, sobald sie für die aktuelle Umgebung aktiviert sind. Sie ermöglichen die Anmeldung ohne Passwort und ersetzen nicht den für MFA erforderlichen Authenticator-Faktor.
