---
title: Configuration et récupération de l’A2F
description: Comment activer et gérer l’accès à l’authentification multifacteur.
order: 2
updated: 2026-07-11
---

Activez l’A2F depuis `Settings -> Account` pour protéger vos clés API et vos opérations de facturation.

Configuration recommandée :

- Enregistrez d’abord une application d’authentification.
- Conservez une sauvegarde sécurisée de sa configuration avant de changer d’appareil.
- Effectuez une nouvelle connexion pour confirmer la configuration.

L’A2F Supabase ne renforce une session qu’après la validation d’un défi d’authentification. Cette application ne fournit pas de codes de récupération personnalisés, car ils ne permettent pas de créer la session AAL2 requise. Si vous perdez l’accès à votre application d’authentification, contactez l’assistance afin de récupérer votre compte en toute sécurité.

Vous pouvez également ajouter des clés d’accès depuis la page des paramètres d’A2F lorsqu’elles sont activées pour l’environnement actuel. Elles permettent une connexion sans mot de passe et ne remplacent pas le facteur d’authentification requis par l’A2F.
