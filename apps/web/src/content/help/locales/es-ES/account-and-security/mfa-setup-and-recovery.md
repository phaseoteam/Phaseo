---
title: Configuración y recuperación de MFA
description: Cómo registrar y gestionar el acceso mediante autenticación multifactor.
order: 2
updated: 2026-07-11
---

Activa MFA desde `Settings -> Account` para proteger tus claves API y acciones de facturación.

Configuración recomendada:

- Registra primero una aplicación de autenticación.
- Guarda una copia segura de la configuración del autenticador antes de cambiar de dispositivo.
- Confirma un nuevo inicio de sesión después de la configuración.

Supabase MFA solo actualiza una sesión después de un desafío de autenticador verificado. Esta aplicación no emite códigos de recuperación personalizados porque no pueden crear la sesión AAL2 necesaria. Si pierdes el acceso a tu autenticador, contacta con soporte para recuperar la cuenta de forma segura.

También puedes añadir passkeys desde la página de configuración de MFA cuando estén habilitadas para el entorno actual. Permiten iniciar sesión sin contraseña y no sustituyen al factor de autenticación requerido por MFA.
