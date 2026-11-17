import type { LearnCourse } from "../../types";

export const conceptsCourse: LearnCourse = {
	slug: "how-language-models-work",
	title: "Comment fonctionnent les modèles de langage",
	summary:
		"Une introduction en langage simple aux modèles de langage : comment ils apprennent, comment fonctionnent les jetons et le contexte, et comment vérifier ce qu’ils vous disent.",
	level: "beginner",
	format: "Sans code",
	prerequisites: [],
	lessons: [
		{
			slug: "how-models-learn",
			title: "Comment les modèles apprennent",
			summary:
				"Un modèle de langage apprend des schémas à partir d’énormes quantités de texte, puis il est ajusté pour suivre des instructions.",
			minutes: 6,
			body: `Un modèle de langage est un programme qui lit du texte et écrit le texte le plus probable pour la suite. Il le fait un petit morceau à la fois. Posez-lui une question, et il écrit une réponse qui correspond aux schémas qu’il a appris.

**Les modèles apprennent en deux grandes étapes.** D’abord vient le **pré-entraînement** : le modèle lit une très grande quantité de texte, comme des livres, des sites web et du code, et apprend à prédire le mot suivant. C’est là qu’il acquiert la langue, des faits et des schémas de raisonnement. Ensuite vient l’**ajustement** : des personnes l’entraînent encore sur des exemples de bonnes réponses, pour qu’il suive les instructions et se comporte comme un assistant utile au lieu de simplement prolonger votre texte.

**Les modèles ont une date limite de connaissances.** L’entraînement s’arrête à une certaine date, et le modèle ne sait rien de ce qui s’est passé ensuite. Il ne fait pas de recherches de lui-même. Si vous avez besoin de faits récents, vous devez les lui fournir, par exemple en ajoutant un document à votre prompt ou en activant un outil de recherche web.

**Les modèles de raisonnement réfléchissent avant de répondre.** Ils consacrent d’abord des jetons supplémentaires à travailler le problème, puis rédigent la réponse. Cela aide sur les problèmes difficiles, comme les maths, le code ou la planification, mais prend plus de temps et coûte plus cher, car ces jetons de réflexion comptent comme de la sortie. Sur Phaseo, vous choisissez combien un modèle réfléchit avec \`reasoning.effort\` (ou \`reasoning_effort\` sur Chat Completions), de \`none\` à \`max\`. Un effort plus élevé aide sur les problèmes difficiles et coûte plus de temps et de jetons.

**Modèles à poids ouverts et modèles fermés.** Certains laboratoires publient les poids d’un modèle, c’est-à-dire les nombres appris pendant l’entraînement, ce qui permet à de nombreux fournisseurs de l’héberger. D’autres gardent les poids privés et ne servent le modèle que via leur propre API ou des partenaires choisis. Sur Phaseo, vous appelez les deux de la même façon. La page d’un modèle indique sa licence sous **À propos** et liste tous les fournisseurs qui l’hébergent.`,
			quiz: {
				question:
					"Vous interrogez un modèle sur un événement de la semaine dernière, et il donne une réponse ancienne ou inventée. Pourquoi ?",
				options: [
					"Le modèle est cassé et il faut un autre fournisseur.",
					"Votre effort de raisonnement était trop bas.",
					"Le modèle ne connaît que ce qui figurait dans ses données d’entraînement, jusqu’à sa date limite de connaissances.",
				],
				answer: 2,
				explanation:
					"Un modèle apprend à partir de textes collectés jusqu’à une certaine date. Il ne peut pas connaître les événements postérieurs, sauf si vous lui donnez cette information, par exemple dans votre prompt ou avec un outil de recherche web.",
			},
			scenario: {
				prompt:
					"Vous utilisez un modèle de raisonnement pour répondre à des questions simples de clients, comme les horaires d’ouverture. Les réponses sont justes mais lentes, et coûtent plus cher que prévu. Que pourriez-vous changer ?",
				answer:
					"Les questions simples demandent rarement beaucoup de réflexion. Baissez `reasoning.effort` (ou `reasoning_effort`), ou utilisez un modèle qui ne raisonne pas. Les jetons de réflexion comptent comme de la sortie : moins de réflexion signifie des réponses plus rapides et moins chères. Gardez un effort plus élevé pour les tâches difficiles.",
			},
			takeaway:
				"Un modèle prédit du texte à partir de ce qu’il a appris à l’entraînement, ne sait rien après sa date limite, et les modèles de raisonnement échangent du temps et des jetons contre de meilleures réponses sur les problèmes difficiles.",
			links: [
				{
					label: "Paramètres de raisonnement",
					href: "https://phaseo.app/docs/v1/api-reference/parameters#parameter-reasoning",
				},
				{
					label: "Explorer les modèles",
					href: "https://phaseo.app/docs/v1/exploring/models",
				},
				{ label: "Modèles", href: "https://phaseo.app/models" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "tokens-and-context",
			title: "Jetons et contexte",
			summary:
				"Les modèles lisent et écrivent des jetons, et chaque jeton envoyé ou reçu ajoute du temps et du coût.",
			minutes: 7,
			body: `Les modèles ne lisent pas les mots comme vous. Ils découpent le texte en **jetons** : des morceaux de mots, des mots courts entiers, des espaces et de la ponctuation. Un mot long peut compter plusieurs jetons. Tout se compte en jetons, des limites de ce qu’un modèle peut lire au prix que vous payez.

**La fenêtre de contexte est ce qu’un modèle peut lire en une fois.** Elle contient tout ce qui compose une requête : vos instructions, la conversation jusque-là, les documents ou résultats de recherche, les définitions d’outils, et la réponse que le modèle écrit. Chaque route de fournisseur a sa propre **longueur de contexte**, affichée sur la page du modèle.

**Les jetons d’entrée et de sortie sont comptés séparément :**

| Type | Ce qu’il comprend |
| --- | --- |
| Entrée | Instructions, vos messages, documents, définitions d’outils |
| Sortie | La réponse, plus la réflexion d’un modèle de raisonnement |

La sortie coûte généralement plus cher par jeton que l’entrée, car le modèle doit écrire chaque jeton de sortie un par un. Sur Phaseo, les prix du texte sont affichés en USD pour 1 million de jetons, avec des prix séparés pour l’entrée et la sortie. Le champ \`usage\` de chaque réponse indique combien de jetons elle a utilisés.

**Les limites de sortie arrêtent les réponses plus tôt.** Vous pouvez plafonner la sortie avec \`max_tokens\` (Chat Completions et Messages) ou \`max_output_tokens\` (Responses). Cela limite le coût et le temps d’attente. Mais si la limite est trop basse, la réponse est tronquée et se termine par \`finish_reason: "length"\`. Ce n’est pas une défaillance du modèle : augmentez la limite, ou baissez l’effort de raisonnement.

**La mise en cache des prompts rend l’entrée répétée moins chère.** Si le début de votre prompt reste identique d’une requête à l’autre, comme de longues instructions ou un document de référence, le fournisseur peut le lire depuis son cache. Ces jetons sont facturés au tarif réduit de lecture du cache, et le premier jeton arrive plus tôt. La plupart des fournisseurs mettent en cache les débuts répétés d’eux-mêmes ; Claude ne met en cache que ce que vous marquez avec \`cache_control\`.`,
			quiz: {
				question:
					"Une réponse s’arrête au milieu d’une phrase, et `finish_reason` vaut `\"length\"`. Que s’est-il passé ?",
				options: [
					"Le fournisseur a échoué, donc Phaseo aurait dû en essayer un autre.",
					"La réponse a atteint la limite de sortie, elle a donc été tronquée.",
					"Le prompt était trop long pour la fenêtre de contexte du modèle.",
				],
				answer: 1,
				explanation:
					"`finish_reason: \"length\"` signifie que la réponse a atteint la limite de sortie (`max_tokens` ou `max_output_tokens`). Augmentez la limite, ou baissez l’effort de raisonnement si un modèle de raisonnement l’a épuisée en réfléchissant.",
			},
			scenario: {
				prompt:
					"Votre bot d’assistance envoie le même document de politique de 20 pages au début de chaque requête, suivi de la question du client. Votre facture est surtout composée de jetons d’entrée. Que pouvez-vous faire ?",
				answer:
					"Gardez la politique au début du prompt, sans la modifier, pour que le fournisseur puisse la mettre en cache. L’entrée répétée est alors facturée au tarif de lecture du cache et les réponses commencent plus tôt. Sur Claude, marquez la fin de la politique avec `cache_control`. Vous pouvez aussi réduire le document aux parties utiles.",
			},
			takeaway:
				"Tout se compte en jetons : l’entrée et la sortie ont des prix séparés par million, les limites de sortie peuvent tronquer les réponses, et la mise en cache rend l’entrée répétée moins chère.",
			links: [
				{
					label: "Gestion du contexte et des jetons",
					href: "https://phaseo.app/docs/v1/guides/context-and-token-budgeting",
				},
				{
					label: "Mise en cache des prompts",
					href: "https://phaseo.app/docs/v1/guides/prompt-caching",
				},
				{
					label: "Tarifs et facturation",
					href: "https://phaseo.app/docs/v1/pricing/tiers",
				},
				{
					label: "Glossaire",
					href: "https://phaseo.app/docs/v1/glossary",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "check-the-output",
			title: "Vérifier la sortie",
			summary:
				"Les modèles peuvent paraître sûrs d’eux et se tromper : ancrez leurs réponses dans des sources et testez avant de vous y fier.",
			minutes: 7,
			body: `Un modèle écrit le texte le plus probable pour la suite. La plupart du temps, c’est aussi le bon. Mais quand il ne sait pas quelque chose, il peut quand même écrire une réponse fluide et assurée qui est fausse. C’est ce qu’on appelle une **hallucination**. Les faits, citations, liens et chiffres inventés en sont des exemples courants.

**Ancrez les réponses dans des données réelles, et vérifiez les sources.** Un modèle est bien plus fiable quand il a les faits sous les yeux. Mettez vos propres documents dans le prompt et demandez-lui de répondre uniquement à partir d’eux, en indiquant d’où vient chaque fait. Pour des informations récentes, ajoutez l’outil serveur \`phaseo:web_search\` (en Bêta) : le modèle cherche sur le web et rédige une réponse à partir des résultats, qui incluent des URL que vous pouvez ouvrir. Ouvrez-les vraiment, car un modèle peut aussi inventer un lien qui a l’air réel.

**Obtenez une forme fiable avec les sorties structurées.** Si votre code doit lire la réponse, envoyez un JSON Schema avec la requête. Le modèle renvoie alors du JSON dans cette forme au lieu de texte libre. Votre code doit quand même vérifier le résultat avant de l’utiliser, car la forme peut être juste alors que le contenu est faux.

**Baissez la température pour plus de cohérence.** \`temperature\` contrôle la part de variété que le modèle ajoute. Des valeurs plus basses donnent des réponses plus stables et reproductibles. Pour l’extraction, la classification et le JSON, la documentation suggère \`0.0\` à \`0.2\`.

**Testez sur de vrais exemples avant de livrer.** Rassemblez de vraies entrées, y compris des cas désordonnés et inhabituels, et vérifiez les réponses à la main. Recommencez chaque fois que vous changez le prompt ou le modèle.`,
			quiz: {
				question:
					"Votre application demande à un modèle l’année de fondation d’une entreprise, et la réponse doit être juste. Quelle est la meilleure approche ?",
				options: [
					"Ancrer la réponse dans une source fiable, comme des résultats de recherche web ou vos propres données, et vérifier la source.",
					"Régler `temperature` sur `0`, ce qui rend le modèle toujours exact.",
					"Demander au modèle son niveau de confiance, et le croire quand il se dit sûr.",
				],
				answer: 0,
				explanation:
					"Une température basse rend les réponses plus cohérentes, pas plus exactes, et un modèle peut paraître sûr tout en se trompant. C’est lui fournir une source fiable, et vérifier cette source, qui rend la réponse fiable.",
			},
			scenario: {
				prompt:
					"Vous avez créé un outil qui extrait le total, la date et le fournisseur des factures. En démo, tout fonctionnait, mais en production votre code plante parfois parce que le modèle répond par une phrase au lieu des champs. Que changez-vous ?",
				answer:
					"Utilisez les sorties structurées : envoyez un JSON Schema avec les champs nécessaires, pour que le modèle renvoie du JSON dans cette forme. Fixez une `temperature` basse, par exemple de `0.0` à `0.2`. Validez le JSON dans votre code avant de l’utiliser, et testez sur un ensemble de vraies factures, y compris des désordonnées, avant de livrer.",
			},
			takeaway:
				"Traitez les réponses des modèles comme des brouillons : ancrez-les dans de vraies sources, demandez une forme fixe, gardez une température basse pour la cohérence, et testez sur de vrais exemples.",
			links: [
				{
					label: "Outil serveur de recherche web",
					href: "https://phaseo.app/docs/v1/guides/server-tools/web-search",
				},
				{
					label: "Sorties structurées",
					href: "https://phaseo.app/docs/v1/guides/structured-outputs",
				},
				{
					label: "Paramètres d’inférence",
					href: "https://phaseo.app/docs/v1/guides/inference-parameters",
				},
			],
			updated: "2026-11-17",
		},
	],
};
