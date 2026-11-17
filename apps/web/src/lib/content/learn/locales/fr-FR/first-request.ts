import type { LearnCourse } from "../../types";

export const firstRequestCourse: LearnCourse = {
	slug: "make-your-first-request",
	title: "Envoyer votre première requête",
	summary:
		"Envoyez une requête à l’API Phaseo, lisez ce qui revient, gérez les erreurs et diffusez la réponse en streaming.",
	level: "developer",
	format: "Tous langages",
	prerequisites: ["Qu’est-ce que Phaseo ?", "Savoir envoyer une requête HTTP dans n’importe quel langage"],
	lessons: [
		{
			slug: "make-a-request",
			title: "Envoyer une requête",
			summary: "Envoyez votre clé API, un ID de modèle et votre entrée à un seul endpoint compatible OpenAI.",
			minutes: 7,
			body: `Chaque requête part vers \`https://api.phaseo.app/v1\` et transporte votre clé API comme jeton bearer : \`Authorization: Bearer phaseo_v1_sk_...\`. Créez la clé dans **Paramètres -> Clés API**. Elle ne s’affiche qu’une fois : enregistrez-la dans une variable d’environnement comme \`PHASEO_API_KEY\` et gardez-la uniquement dans du code côté serveur.

\`POST /v1/responses\` est l’endpoint recommandé pour tout nouveau travail sur du texte. Vous envoyez un \`model\` et un \`input\` :

\`\`\`bash
curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "input": "Reply with: quickstart works"
  }'
\`\`\`

Vous utilisez déjà le SDK OpenAI officiel ? Changez trois choses : la clé API, l’URL de base et l’ID de modèle.

\`\`\`ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});

const response = await client.responses.create({
  model: "openai/gpt-6-astra",
  input: "Write one sentence about reliable model routing.",
});

console.log(response.output_text);
\`\`\`

Le code qui appelle Chat Completions fonctionne avec le même client : envoyez plutôt \`messages\` à \`client.chat.completions.create\`.

Les ID de modèles portent toujours le préfixe du fournisseur, comme \`openai/\`, \`anthropic/\` ou \`google/\`. Pour changer de modèle, modifiez seulement la chaîne \`model\` ; le reste de la requête ne change pas. Listez les ID valides avec \`GET /v1/models\` au lieu de les deviner. \`phaseo/free\` choisit un modèle gratuit disponible et fonctionne sans crédits, ce qui est pratique pour un premier test.`,
			quiz: {
				question: "Vous faites pointer le SDK OpenAI officiel vers Phaseo. Quelles modifications faut-il ?",
				options: [
					"La clé API, l’URL de base et l’ID de modèle",
					"Seulement l’URL de base ; le SDK continue d’utiliser votre clé OpenAI",
					"Un champ de requête propre à Phaseo qui nomme le fournisseur, plus l’URL de base",
				],
				answer: 0,
				explanation:
					"La documentation liste exactement trois modifications : votre clé API Phaseo, l’URL de base https://api.phaseo.app/v1 et un ID de modèle Phaseo avec son préfixe de fournisseur. Votre clé OpenAI ne fonctionne pas sur Phaseo, et le fournisseur fait partie de l’ID de modèle, pas d’un champ séparé.",
			},
			scenario: {
				prompt:
					"Votre application envoie `\"model\": \"gpt-6-astra\"` et la requête échoue avec une erreur 400. Un collègue pense que le modèle est en panne. Que vérifiez-vous d’abord ?",
				answer:
					"L’ID de modèle. Les ID de modèles Phaseo incluent le préfixe du fournisseur : il faut donc `openai/gpt-6-astra`. Une erreur 400 désigne le corps de la requête ou l’ID de modèle, pas une panne. Appelez `GET /v1/models` pour confirmer l’ID exact.",
			},
			takeaway:
				"Une URL de base, une clé bearer et un ID de modèle préfixé par le fournisseur suffisent, et changer de modèle revient à changer une chaîne.",
			links: [
				{ label: "Démarrage rapide", href: "https://phaseo.app/docs/v1/quickstart" },
				{ label: "SDK OpenAI", href: "https://phaseo.app/docs/v1/guides/integrations/openai-sdk" },
				{ label: "Créer une chat completion", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "read-the-response",
			title: "Lire la réponse",
			summary: "Trouvez la réponse, la raison de son arrêt, qui l’a servie et ce qu’elle a coûté.",
			minutes: 6,
			body: `Une réponse Chat Completions ressemble à ceci (valeurs données à titre d’exemple) :

\`\`\`json
{
  "id": "G-...",
  "object": "chat.completion",
  "model": "openai/gpt-6-astra",
  "provider": "openai",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "ok" },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 1,
    "total_tokens": 13,
    "cost": 0.000021
  }
}
\`\`\`

- **\`choices[].message.content\`** contient le texte de la réponse.
- **\`finish_reason\`** indique pourquoi le modèle s’est arrêté : \`stop\` (il a terminé), \`length\` (il a atteint la limite de jetons), \`tool_calls\` (il veut appeler un outil) ou \`content_filter\`.
- **\`model\`** nomme le modèle qui a répondu. Si un modèle de repli a servi la requête, c’est lui qui apparaît, pas celui que vous avez demandé.
- **\`provider\`** nomme le fournisseur qui l’a servie.
- **\`id\`** est l’ID de requête Phaseo. Journalisez-le : la requête apparaît dans **Paramètres -> Utilisation -> Journaux**, et l’assistance vous le demandera.

\`usage\` compte les jetons et ajoute \`cost\` : ce que la requête vous coûte en dollars américains, le montant prélevé sur vos crédits. Sur une requête BYOK, \`cost_details.upstream_inference_cost\` indique ce qui est facturé sur votre propre clé de fournisseur ; avec les crédits Phaseo, il vaut \`null\`.

Sur \`/v1/responses\`, la forme est différente : le texte se trouve dans \`output[].content[]\`, là où \`type\` vaut \`output_text\`, et \`usage\` utilise \`input_tokens\` et \`output_tokens\`.`,
			quiz: {
				question: "Une réponse Chat Completions revient avec `finish_reason: \"length\"`. Que s’est-il passé ?",
				options: [
					"Le fournisseur a échoué en cours de route et Phaseo a renvoyé ce qu’il avait",
					"Le modèle a atteint la limite de jetons, donc la réponse est peut-être tronquée",
					"Le modèle a terminé normalement et la réponse est complète",
				],
				answer: 1,
				explanation:
					"`length` signifie que le modèle s’est arrêté parce qu’il a atteint la limite de jetons. Une fin normale donne `stop`. Un fournisseur qui échoue en cours de route renvoie une erreur, pas une réponse partielle avec une raison de fin.",
			},
			scenario: {
				prompt:
					"La comptabilité demande combien a coûté la requête `G-01J...` d’hier, et quel fournisseur l’a exécutée. Où regardez-vous ?",
				answer:
					"Dans la réponse elle-même, `usage.cost` donne le montant en dollars américains et `provider` nomme le fournisseur qui l’a servie. Si vous n’avez pas journalisé le corps, ouvrez la requête par son ID dans **Paramètres -> Utilisation -> Journaux**.",
			},
			takeaway:
				"Lisez la réponse dans `choices`, vérifiez `finish_reason`, et journalisez `id`, `model`, `provider` et `usage.cost` à chaque appel.",
			links: [
				{ label: "Créer une chat completion", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
				{ label: "Créer une réponse", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
				{ label: "Démarrage rapide : lire la réponse", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "when-a-request-fails",
			title: "Quand une requête échoue",
			summary: "Orientez votre code selon le code d’erreur et le statut, et ne relancez que les erreurs qui peuvent réussir plus tard.",
			minutes: 8,
			body: `Chaque erreur Phaseo a le même corps JSON sur tous les endpoints. L’objet \`error\` a la forme que les SDK compatibles OpenAI lisent déjà :

\`\`\`json
{
  "error": {
    "code": "insufficient_funds",
    "message": "...",
    "type": "insufficient_quota",
    "param": null
  },
  "generation_id": "G-...",
  "status_code": 402
}
\`\`\`

Orientez votre code selon \`error.code\` et le statut HTTP, jamais selon le texte du message. Journalisez toujours \`generation_id\`.

| Statut | Code courant | Que faire |
| --- | --- | --- |
| \`400\` | \`validation_error\`, \`model_required\` | Corrigez la requête. \`error.param\` nomme le champ. |
| \`401\` | \`unauthorised\` | Vérifiez la clé et l’en-tête \`Authorization\`. |
| \`402\` | \`insufficient_funds\` | Ajoutez des crédits, ou utilisez \`phaseo/free\`. |
| \`403\` | \`guardrail_blocked\` | Modifiez la requête ou le garde-fou. |
| \`404\` | \`not_found\` | Vérifiez le chemin et l’ID. |
| \`410\` | \`model_retired\` | Passez à \`replacement_model\`. |
| \`429\` | \`rate_limit_exceeded\`, \`key_limit_exceeded\` | Attendez \`Retry-After\`, puis relancez. |
| \`5xx\` | \`upstream_error\`, \`gateway_error\` | Relancez avec un délai croissant. |

Ne relancez pas telles quelles les erreurs \`4xx\` autres que \`429\` : elles échoueront de nouveau. Pour \`429\`, attendez \`Retry-After\` (en secondes ou sous forme de date HTTP), ou utilisez un délai exponentiel avec une part d’aléatoire. Un \`key_limit_exceeded\` sans \`Retry-After\` ne se réinitialise pas tout seul : ne le relancez pas. Ne relancez les \`5xx\` que si répéter l’appel est sans risque, et fixez un nombre maximal de tentatives et une échéance globale.`,
			quiz: {
				question: "Votre requête renvoie `401` avec le code `unauthorised`. Que doit faire votre code ?",
				options: [
					"S’arrêter et vérifier la clé API et l’en-tête `Authorization: Bearer`",
					"Relancer avec un délai exponentiel jusqu’à ce que ça marche",
					"Attendre l’en-tête `Retry-After`, puis renvoyer la même requête",
				],
				answer: 0,
				explanation:
					"Une erreur 401 signifie que la clé est absente ou invalide. Relancer la même requête ne peut pas régler cela. Le délai croissant sert aux 429 et aux 5xx, et `Retry-After` accompagne les 429.",
			},
			scenario: {
				prompt:
					"Un script de traitement par lots envoie 500 requêtes dans une boucle. À mi-parcours, les réponses reviennent en `429` avec un en-tête `Retry-After: 20`. Que changez-vous ?",
				answer:
					"Faites respecter `Retry-After` par le script : faites une pause d’environ 20 secondes avant de relancer, et utilisez un délai exponentiel avec une part d’aléatoire quand l’en-tête manque. Vérifiez aussi `error.code` : `rate_limit_exceeded` se réinitialisera, mais un `key_limit_exceeded` sans `Retry-After` non, donc le relancer ne sert à rien.",
			},
			takeaway:
				"Orientez votre code selon `error.code` et le statut, corrigez les erreurs 4xx, et ne relancez que les 429 et les 5xx sans risque, avec un délai croissant.",
			links: [
				{ label: "Erreurs et débogage", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "Limites de débit", href: "https://phaseo.app/docs/v1/api-reference/limits" },
				{ label: "Démarrage rapide : dépannage", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "stream-it",
			title: "Diffuser en streaming",
			summary: "Affichez la réponse au fil de sa rédaction, et distinguez un flux terminé d’un flux interrompu.",
			minutes: 9,
			body: `Définissez \`"stream": true\` et Phaseo envoie la sortie sous forme de server-sent events (SSE) pendant que le modèle l’écrit :

\`\`\`bash
curl --no-buffer https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "input": "Say hello in one sentence.",
    "stream": true
  }'
\`\`\`

Vérifiez d’abord le statut HTTP. Une requête qui échoue avant le début du flux reçoit l’erreur JSON habituelle, pas un flux. Lisez ensuite les événements. Chaque endpoint a son propre format :

| Endpoint | Le texte arrive dans | Fin réussie | Fin en échec |
| --- | --- | --- | --- |
| Responses | \`response.output_text.delta\` | \`response.completed\` | \`response.failed\` ou \`error\` |
| Chat Completions | \`choices[].delta\` | un \`finish_reason\`, puis \`[DONE]\` | une trame \`error\` sans \`finish_reason\` |

Sur Chat Completions, un dernier fragment avec des \`choices\` vides transporte \`usage\`, y compris le \`cost\` de tout le flux, avant \`[DONE]\`. Seul Chat Completions envoie \`[DONE]\`. Un fragment réseau peut contenir la moitié d’un événement ou plusieurs événements : mettez en tampon jusqu’à ce qu’un événement soit complet avant de l’analyser, ou utilisez un utilitaire de flux du SDK.

Un flux n’est terminé que lorsque son événement de fin réussie arrive. Une connexion fermée ne signifie pas à elle seule que la réponse est complète. Si le flux échoue en cours de route, gardez le texte partiel marqué comme interrompu et proposez une nouvelle tentative ; Phaseo ne facture pas la sortie partielle d’un flux en échec.

Pour annuler, passez un \`AbortSignal\` (ou l’équivalent de votre client HTTP) et annulez quand l’utilisateur arrête. L’annulation ne garantit ni que le fournisseur s’arrête immédiatement, ni que la sortie déjà générée est gratuite.`,
			quiz: {
				question: "Votre flux Chat Completions a livré du texte, puis la connexion se ferme. Vous n’avez vu ni `finish_reason` ni `[DONE]`. Que faites-vous ?",
				options: [
					"Vous la considérez comme complète, parce que la connexion s’est fermée proprement",
					"Vous ajoutez la réponse de la nouvelle tentative à la suite du texte partiel",
					"Vous considérez la réponse comme interrompue et proposez une nouvelle tentative",
				],
				answer: 2,
				explanation:
					"Un flux n’est terminé que lorsque son événement de fin réussie arrive. Sans `finish_reason` ni `[DONE]`, la réponse est incomplète. Une nouvelle tentative peut produire un texte différent : affichez-la seule au lieu de l’ajouter à la suite.",
			},
			scenario: {
				prompt:
					"Les utilisateurs peuvent appuyer sur **Stop** dans l’interface de chat. Votre chef de produit pense que les réponses arrêtées ne coûtent rien. A-t-il raison ?",
				answer:
					"Non. Annulez la requête avec un `AbortSignal` pour que votre application arrête de lire, mais la documentation précise que l’annulation ne garantit ni que le fournisseur s’arrête immédiatement, ni que la sortie déjà générée est gratuite. Attendez-vous à ce que les réponses arrêtées soient facturées pour le travail déjà effectué.",
			},
			takeaway:
				"Attendez l’événement de fin réussie de l’endpoint, considérez tout le reste comme interrompu, et ne supposez pas qu’un flux annulé est gratuit.",
			links: [
				{ label: "Streaming", href: "https://phaseo.app/docs/v1/guides/streaming" },
				{ label: "Erreurs pendant un flux", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "Créer une réponse", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
			],
			updated: "2026-11-17",
		},
	],
};
