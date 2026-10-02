---
title: Configuração e recuperação de MFA
description: Como cadastrar e gerenciar o acesso à autenticação multifator.
order: 2
updated: 2026-07-11
---

Ative o MFA em `Settings -> Account` para proteger suas chaves de API e ações de cobrança.

Configuração recomendada:

- Cadastre primeiro um aplicativo autenticador.
- Mantenha um backup seguro da configuração do autenticador antes de trocar de dispositivo.
- Confirme um novo login após a configuração.

O MFA do Supabase só eleva uma sessão após um desafio de autenticador verificado. Este aplicativo não emite códigos de recuperação personalizados, pois eles não podem criar a sessão AAL2 necessária. Se você perder o acesso ao autenticador, entre em contato com o suporte para recuperar a conta com segurança.

As chaves de acesso também podem ser adicionadas na página de configurações de MFA quando estiverem habilitadas para o ambiente atual. Elas permitem login sem senha e não substituem o fator autenticador exigido pelo MFA.
