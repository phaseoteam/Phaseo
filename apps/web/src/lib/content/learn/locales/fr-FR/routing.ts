import type { LearnCourse } from "../../types";

export const routingCourse: LearnCourse = {
	slug: "routing-and-presets",
	title: "Maîtriser le routage et les replis",
	summary:
		"Choisissez les fournisseurs qui servent vos requêtes, ajoutez des modèles de repli et enregistrez des paramètres partagés dans un préréglage.",
	level: "developer",
	format: "Tous langages",
	prerequisites: ["Envoyer votre première requête"],
	lessons: [
		{
			slug: "route-across-providers",
			title: "Router entre les fournisseurs",
			summary: "Classez, limitez ou épinglez des fournisseurs, et listez des modèles de repli pour les cas d’échec.",
			minutes: 10,
			body: `La plupart des modèles sont servis par plusieurs fournisseurs. Pour chaque requête, Phaseo garde les fournisseurs autorisés par vos règles, les classe et appelle le meilleur. Si ce fournisseur échoue, il essaie le suivant. Le classement par défaut, \`balanced\`, pondère le coût par réponse réussie.

Ajustez ce comportement avec l’objet \`provider\` (\`routing\` est accepté comme alias) :

\`\`\`json
{
  "model": "openai/gpt-5.6-luna",
  "input": "Summarize this changelog.",
  "provider": {
    "order": ["openai", "azure"],
    "sort": "latency",
    "require_zero_data_retention": true
  }
}
\`\`\`

- \`order\` définit un ordre de préférence ; \`only\` et \`ignore\` autorisent ou bloquent des fournisseurs.
- \`sort\` classe par \`price\`, \`latency\` ou \`throughput\`. Les suffixes de modèle \`:cheap\`, \`:fast\` et \`:nitro\` font la même chose et l’emportent sur \`sort\`.
- \`max_price\` fixe des plafonds de prix ; \`required_execution_region\`, \`required_data_region\` et \`require_zero_data_retention\` limitent où et comment les données sont traitées.

Pour épingler un seul fournisseur sans repli vers d’autres fournisseurs, placez-le devant l’ID de modèle : \`baseten:thinking-machines/inkling-small\`. Pour un routage régional de toute la requête, envoyez plutôt les requêtes de texte à \`eu.api.phaseo.app\` ou \`us.api.phaseo.app\`.

Pour basculer vers d’autres modèles, listez-les dans \`models\`. Phaseo essaie d’abord \`model\`, puis chaque entrée dans l’ordre, mais seulement si le modèle précédent se termine par \`429\`, \`500\`, \`502\`, \`503\` ou \`504\`. Les erreurs comme \`400\`, \`401\` ou \`402\` sont renvoyées immédiatement. Chaque tentative est facturée comme une requête distincte, et le champ \`model\` de la réponse nomme le modèle qui a répondu. Un flux ne bascule qu’avant son premier octet.`,
			quiz: {
				question: "Vous envoyez `\"model\": \"openai/gpt-6-astra\"` avec `\"models\": [\"anthropic/claude-sonnet-5.5\"]`. Le premier modèle renvoie `400 validation_error`. Que se passe-t-il ?",
				options: [
					"Phaseo renvoie immédiatement l’erreur 400 et n’essaie pas le repli",
					"Phaseo relance la requête sur `anthropic/claude-sonnet-5.5`",
					"Phaseo relance le même modèle chez un autre fournisseur, puis le repli",
				],
				answer: 0,
				explanation:
					"Les modèles de repli ne sont essayés qu’après une erreur 429, 500, 502, 503 ou 504. Une erreur 400 vient de la requête elle-même : elle est renvoyée immédiatement, car un autre modèle la rejetterait aussi.",
			},
			scenario: {
				prompt:
					"Votre équipe juridique exige que les prompts des clients n’aillent qu’à des fournisseurs qui respectent le ZDR (Zero Data Retention), et que l’application ne touche jamais un fournisseur en particulier. Vous ne voulez pas épingler un seul fournisseur. Qu’envoyez-vous ?",
				answer:
					"Gardez l’ID de modèle simple pour que Phaseo puisse toujours basculer d’un fournisseur à l’autre, et ajoutez `\"provider\": { \"require_zero_data_retention\": true, \"ignore\": [\"<provider-id>\"] }`. Épingler avec `provider:model` désactiverait le repli entre fournisseurs, ce que vous ne voulez pas.",
			},
			takeaway:
				"Utilisez `provider` pour classer et limiter les fournisseurs, un préfixe `provider:` pour en épingler un, et `models` pour basculer vers d’autres modèles en cas d’erreur relançable.",
			links: [
				{ label: "Routage et replis", href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks" },
				{ label: "Paramètres de fournisseur", href: "https://phaseo.app/docs/v1/api-reference/parameters" },
				{ label: "ID de modèles qualifiés par fournisseur", href: "https://phaseo.app/docs/v1/guides/provider-qualified-models" },
				{ label: "Routage régional", href: "https://phaseo.app/docs/v1/guides/regional-routing" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "use-a-preset",
			title: "Utiliser un préréglage",
			summary: "Enregistrez un modèle, un prompt et des règles de routage sous un seul nom, et appelez-le depuis n’importe quelle application.",
			minutes: 7,
			body: `Un préréglage stocke le modèle, le prompt système, les paramètres et les règles de fournisseur d’une tâche sous un nom comme \`@support-triage\`. Les appelants envoient ce nom comme \`model\`, avec seulement l’entrée. Phaseo complète le reste avant de choisir un fournisseur. Créez des préréglages dans **Paramètres -> Préréglages**, ou avec \`POST /v1/presets\` et une clé de gestion.

\`\`\`bash
curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "@support-triage",
    "input": "Customer says the invoice total is wrong."
  }'
\`\`\`

Il n’y a pas de champ \`preset\` séparé. Désignez une version avec \`@support-triage@v3\`, ou suivez un label avec \`@support-triage@production\` : vous pourrez revenir en arrière en déplaçant le label.

Quand la requête et le préréglage définissent tous deux une valeur, ces règles tranchent :

- **Les paramètres comblent les vides.** Les valeurs par défaut d’un préréglage ne s’appliquent qu’aux champs que la requête omet. Une valeur dans la requête l’emporte toujours.
- **Les prompts système s’empilent.** Le prompt du préréglage passe en premier, puis celui de la requête.
- **Les paramètres de fournisseur de la requête l’emportent.** \`provider.order\` ou \`provider.max_price\` dans la requête remplace la valeur du préréglage pour ce champ.
- **Les listes d’autorisation restreignent, sans jamais élargir.** Un modèle hors des modèles autorisés par le préréglage échoue avec \`validation_error\` ; il n’est pas redirigé.`,
			quiz: {
				question: "Votre préréglage fixe `temperature` à 0.2. Une requête envoie `\"model\": \"@support-triage\"` avec `\"temperature\": 0.8`. Quelle valeur est utilisée ?",
				options: [
					"0.2, parce que le préréglage verrouille ses paramètres",
					"0.8, parce qu’une valeur dans la requête l’emporte toujours",
					"0.5, parce que Phaseo fait la moyenne des deux valeurs",
				],
				answer: 1,
				explanation:
					"Les paramètres par défaut d’un préréglage ne remplissent que les champs qu’une requête omet. Quand la requête définit une valeur, c’est elle qui l’emporte.",
			},
			scenario: {
				prompt:
					"Trois services appellent le même modèle d’assistance avec des prompts et des règles de fournisseur copiés-collés. Une modification de prompt a été déployée sur un service mais pas sur les autres, et les réponses diffèrent maintenant. Comment éviter que cela se reproduise ?",
				answer:
					"Regroupez le modèle, le prompt système et les règles de fournisseur partagés dans un seul préréglage, et faites envoyer `\"model\": \"@support-triage@production\"` par chaque service. Publiez les modifications sous forme de nouvelles versions et déplacez le label `production` pour les déployer, ou remettez-le en place pour revenir en arrière.",
			},
			takeaway:
				"Placez les paramètres partagés dans un préréglage, appelez-le par son nom dans `model`, et laissez les valeurs de la requête remplacer les valeurs par défaut du préréglage quand il le faut.",
			links: [
				{ label: "Préréglages", href: "https://phaseo.app/docs/v1/guides/presets" },
				{ label: "Modèles de prompts", href: "https://phaseo.app/docs/v1/guides/prompt-templates" },
				{ label: "Routage et replis", href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks" },
			],
			updated: "2026-11-17",
		},
	],
};
