import type { LearnCourse } from "../../types";

export const foundationsCourse: LearnCourse = {
	slug: "what-is-phaseo",
	title: "Qu’est-ce que Phaseo ?",
	summary:
		"Découvrez ce que fait Phaseo, configurez votre compte et votre première clé API, repérez les pages du tableau de bord que vous utiliserez le plus et choisissez un modèle.",
	level: "beginner",
	format: "Sans code",
	prerequisites: [],
	lessons: [
		{
			slug: "what-phaseo-is",
			title: "Ce qu’est Phaseo",
			summary:
				"Phaseo est une passerelle : une seule API et une seule clé devant de nombreux modèles et les fournisseurs qui les hébergent.",
			minutes: 6,
			body: `Phaseo est une passerelle d’IA. Vous envoyez chaque requête à une seule API, \`https://api.phaseo.app/v1\`, avec une seule clé. Phaseo transmet chaque requête à un fournisseur capable de la traiter et la facture à votre espace de travail. Vous pouvez utiliser le format Responses, Chat Completions ou Messages, celui que votre application parle déjà.

**Les modèles et les fournisseurs sont deux choses différentes.** Un modèle est le système qui rédige la réponse. Un fournisseur héberge le modèle et en fixe le prix, la vitesse, la disponibilité et les paramètres pris en charge. Un même modèle peut avoir plusieurs fournisseurs.

**Un ID de modèle désigne le modèle, pas le fournisseur.** Les ID ressemblent à \`openai/gpt-6-astra\` ou \`anthropic/claude-sonnet-5.5\` : le laboratoire, puis le modèle. \`phaseo/free\` choisit un modèle gratuit disponible et fonctionne sans crédits. Si vous avez besoin d’un fournisseur précis, vous pouvez le placer devant l’ID, par exemple \`baseten:thinking-machines/inkling-small\`.

**Comment une requête est routée :**

1. Phaseo ne garde que les fournisseurs autorisés par les paramètres de votre espace de travail et par la requête.
2. Il les classe. Le mode par défaut, \`balanced\`, pondère le prix, la vitesse et la fiabilité.
3. Il appelle le premier fournisseur. Si celui-ci échoue, il essaie le suivant.
4. Si tous les fournisseurs échouent avec une erreur relançable et que vous avez listé des modèles de repli dans \`models\`, il essaie le modèle suivant.

Les replis ne garantissent pas le succès : votre application doit toujours relancer les erreurs \`429\` et \`5xx\` avec un délai croissant. Autre point : le catalogue public liste certains modèles qui ne sont pas encore appelables. Vérifiez qu’un modèle est **Actif sur Gateway** avant d’utiliser son ID.`,
			quiz: {
				question:
					"Vous appelez un modèle hébergé par trois fournisseurs, et le fournisseur classé premier renvoie une erreur. Que fait Phaseo ensuite ?",
				options: [
					"Il essaie le fournisseur éligible suivant pour le même modèle.",
					"Il renvoie l’erreur immédiatement, parce que vous avez choisi ce fournisseur.",
					"Il passe à un autre modèle qu’il choisit pour vous.",
				],
				answer: 0,
				explanation:
					"Quand un fournisseur échoue, le Gateway essaie le fournisseur éligible suivant pour le même modèle. Il ne passe à un autre modèle que si vous avez listé des modèles de repli dans `models` et que tous les fournisseurs ont échoué avec une erreur relançable.",
			},
			scenario: {
				prompt:
					"Un collègue a trouvé un modèle sur la page Modèles de Phaseo et a copié son ID dans une requête. La requête échoue, mais la page du modèle semble normale. Quelle est la cause la plus probable, et comment la vérifier ?",
				answer:
					"Le catalogue liste plus de modèles que le Gateway ne peut en appeler. Le modèle est peut-être Bientôt disponible ou Inactif. Sur la page Modèles, le filtre État Gateway affiche par défaut les modèles Actif sur Gateway, et `GET /v1/models` ne renvoie que les modèles que vous pouvez appeler. Choisissez un modèle Actif sur Gateway.",
			},
			takeaway:
				"Vous choisissez le modèle ; Phaseo choisit un fournisseur qui l’héberge et bascule vers un autre si l’un échoue.",
			links: [
				{
					label: "Fonctionnement de Phaseo",
					href: "https://phaseo.app/docs/v1/developers/introduction",
				},
				{
					label: "Routage et replis",
					href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks",
				},
				{
					label: "Explorer les modèles",
					href: "https://phaseo.app/docs/v1/exploring/models",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "create-an-account-and-key",
			title: "Créer un compte et une clé",
			summary:
				"Inscrivez-vous, découvrez ce que possède un espace de travail et créez une clé API que vous gardez hors de votre code.",
			minutes: 7,
			body: `Inscrivez-vous sur phaseo.app avec Google, GitHub, GitLab, ou une adresse e-mail et un mot de passe. Chaque compte commence avec un espace de travail personnel, qui suffit pour un petit projet.

**L’espace de travail est l’unité qui possède les ressources.** Il contient vos clés API, vos paramètres de routage, vos préréglages, vos garde-fous et la liste des personnes qui ont un accès administrateur. Les requêtes payantes utilisent le solde de crédits de l’espace de travail. Après votre premier dépôt de crédits, vous pouvez ajouter d’autres espaces de travail, par exemple un par produit ou par environnement. Les espaces de travail supplémentaires ne changent pas vos tarifs.

**Créez une clé** dans **Paramètres → Clés API**, puis sélectionnez **Créer une clé**. Choisissez l’espace de travail, donnez un nom à la clé et choisissez un préréglage :

- **Développement** : un plafond de dépenses quotidien bas pour les applications locales et les prototypes.
- **Production** : aucun plafond prédéfini. Ajoutez des limites plus tard si besoin.
- **CI** : un plafond de requêtes pour les tests, les évaluations et les tâches de release.
- **Environnement de test** : un plafond serré pour les démos, les essais et les expériences partagées.

Les clés peuvent avoir des limites de requêtes et de dépenses quotidiennes, hebdomadaires ou mensuelles. Une fois une limite atteinte, les requêtes avec cette clé renvoient \`429\` avec \`key_limit_exceeded\`.

**La clé ne s’affiche qu’une seule fois.** Copiez-la et enregistrez-la comme variable d’environnement :

\`\`\`bash
export PHASEO_API_KEY="phaseo_v1_sk_..."
\`\`\`

Traitez-la comme un mot de passe. Lisez-la depuis \`PHASEO_API_KEY\` dans du code côté serveur. Ne la mettez jamais dans votre code, dans un dépôt, dans une application web ou mobile, ni dans une conversation avec une personne ou un agent. Utilisez une clé par application et par environnement, pour pouvoir en remplacer une sans casser les autres, et supprimez les clés que vous n’utilisez plus.`,
			quiz: {
				question: "Où votre clé API Phaseo doit-elle se trouver ?",
				options: [
					"Dans la variable d’environnement PHASEO_API_KEY, lue par du code côté serveur.",
					"Dans votre code front-end, pour que le navigateur puisse appeler Phaseo directement.",
					"Dans un message à votre agent de programmation, pour qu’il termine la configuration à votre place.",
				],
				answer: 0,
				explanation:
					"La documentation demande de garder les clés dans du code côté serveur, hors des navigateurs, des applications mobiles, des dépôts et des conversations. Toute personne qui a la clé peut dépenser les crédits de votre espace de travail.",
			},
			scenario: {
				prompt:
					"Vous construisez un prototype qui appelle un modèle payant dans une boucle. Vous craignez qu’un bug fasse grimper la facture pendant la nuit. Que pouvez-vous faire en créant la clé ?",
				answer:
					"Choisissez le préréglage Développement ou Environnement de test, qui fixent un plafond de dépenses bas, ou définissez une limite de dépenses quotidienne sur la clé. Si la boucle atteint la limite, les requêtes renvoient 429 avec key_limit_exceeded au lieu de dépenser davantage. Utilisez une clé distincte pour la production.",
			},
			takeaway:
				"Votre espace de travail possède les clés et les crédits ; créez une clé par application et par environnement, et gardez-la dans PHASEO_API_KEY sur le serveur.",
			links: [
				{
					label: "Démarrage rapide",
					href: "https://phaseo.app/docs/v1/quickstart",
				},
				{
					label: "Authentification",
					href: "https://phaseo.app/docs/v1/developers/authentication",
				},
				{
					label: "Espaces de travail",
					href: "https://phaseo.app/docs/v1/guides/workspaces",
				},
				{ label: "Clés API", href: "/settings/keys" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "find-your-way-around",
			title: "Se repérer",
			summary:
				"Découvrez les quelques pages que vous utiliserez en premier : modèles, clés, facturation, utilisation, journaux et paramètres de l’espace de travail.",
			minutes: 6,
			body: `Le tableau de bord compte de nombreuses pages, mais quelques-unes suffisent pour commencer. La barre latérale des paramètres les regroupe en **Général** (votre compte et la facturation), **Espace de travail**, **Observabilité** et **Gateway**. Les pages des trois dernières sections s’appliquent à l’espace de travail choisi dans l’en-tête : vérifiez-le avant de modifier quoi que ce soit.

**Avant de développer :**

- **Modèles** (\`/models\`) : parcourez les modèles, filtrez-les selon ce qu’ils savent faire et ouvrez-en un pour voir ses fournisseurs, ses prix et ses performances. Un modèle avec une route active affiche un démarrage rapide avec l’ID à envoyer. **Comparer** (\`/compare\`) place des modèles côte à côte.
- **Clés API** (\`/settings/keys\`) : créez, limitez et supprimez des clés. **Budgets** (\`/settings/budgets\`) plafonne les dépenses de tout l’espace de travail.

**L’argent :**

- **Facturation → Facturation et crédits** (\`/settings/credits\`) : votre solde, vos dépenses récentes et l’endroit où acheter des crédits. Les recharges depuis le tableau de bord commencent à 5 $, et Phaseo ajoute des frais de 5 % de l’achat, avec un minimum de 1 $.
- **Facturation → Transactions** (\`/settings/credits/transactions\`) liste chaque achat.

**Après avoir envoyé des requêtes :**

- **Utilisation** (\`/settings/usage/overview\`) : comment votre espace de travail utilise Phaseo, avec les pages Vue d’ensemble, Tendances, Explorer et Alertes.
- **Journaux** (\`/settings/usage/logs/requests\`) : une ligne par requête, avec son utilisation, sa latence, son coût et ses erreurs. C’est le premier endroit où regarder quand quelque chose échoue.

**Paramètres de l’espace de travail :** **Paramètres** (\`/settings/workspaces/settings\`) pour les réglages généraux et les membres de l’espace de travail, **Confidentialité** (\`/settings/privacy\`) pour ce qui est stocké, et **Routage** (\`/settings/routing\`) pour la façon dont les fournisseurs sont classés par défaut.`,
			quiz: {
				question:
					"Une requête a échoué il y a une heure. Où voyez-vous son coût, sa latence et son erreur ?",
				options: [
					"Dans Journaux, sous Observabilité dans la barre latérale des paramètres.",
					"Dans Facturation → Transactions.",
					"Sur la page Clés API.",
				],
				answer: 0,
				explanation:
					"Les journaux de requêtes affichent l’utilisation, la latence, le coût et les erreurs de chaque requête. Transactions liste seulement les achats de crédits, et la page Clés API sert à gérer les clés.",
			},
			scenario: {
				prompt:
					"Votre solde de crédits baisse plus vite que prévu, et vous voulez comprendre pourquoi et éviter que cela se reproduise. Quelles pages ouvrez-vous, et dans quel ordre ?",
				answer:
					"Commencez par Utilisation pour voir quand les dépenses ont augmenté. Ouvrez ensuite Journaux pour examiner les requêtes concernées : quel modèle, combien de jetons, ce que chacune a coûté. Une fois la cause trouvée, définissez une limite de dépenses sur la clé dans Clés API ou un budget d’espace de travail dans Budgets.",
			},
			takeaway:
				"Modèles pour choisir, Clés API pour se connecter, Facturation pour payer, Utilisation et Journaux pour voir ce qui s’est passé.",
			links: [
				{ label: "Modèles", href: "/models" },
				{ label: "Journaux de requêtes", href: "/settings/usage/logs/requests" },
				{
					label: "Tarifs et facturation",
					href: "https://phaseo.app/docs/v1/pricing/tiers",
				},
				{
					label: "Limites de clés et budgets",
					href: "https://phaseo.app/docs/v1/api-reference/limits",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "choose-a-model",
			title: "Choisir un modèle",
			summary:
				"Utilisez la liste des modèles, les pages de modèles et Comparer pour trouver quelques candidats, puis testez-les sur vos propres exemples avant de vous engager.",
			minutes: 8,
			body: `Commencez par **Modèles** (\`/models\`). Par défaut, la page n’affiche que les modèles **Actif sur Gateway** : tout ce que vous voyez peut donc être appelé. Affinez la liste avec les filtres **Points de terminaison** (par exemple génération de texte ou embeddings), **Modalités d’entrée et de sortie** (texte, image, audio, vidéo), **Fonctionnalités** (par exemple appel d’outils ou raisonnement) et **Année**. Une fois connecté, **Utilisables dans mon espace de travail** masque les modèles bloqués par les règles de votre espace de travail. Vous pouvez trier par nouveauté, popularité, prix, longueur de contexte, débit ou latence.

**Ouvrez un modèle pour voir ce qu’il propose.** Sa page n’affiche que les sections pour lesquelles il existe des données :

- **Fournisseurs** : chaque route de fournisseur avec son état, sa longueur de contexte, son prix, sa disponibilité, sa politique de données et ses paramètres pris en charge.
- **Tarifs** : chaque compteur en USD. Les prix du texte sont exprimés pour 1 million de jetons, avec l’entrée et la sortie listées séparément, plus l’entrée en cache quand un fournisseur la propose.
- **Performances** et **Disponibilité** : latence, débit et disponibilité mesurés sur le trafic du Gateway, quand il y en a assez.
- **Évaluations**, **À propos** (dates de sortie, licence, famille) et un démarrage rapide avec l’ID de modèle à envoyer.

**Retenez deux ou trois modèles.** **Comparer** (\`/compare\`) les place côte à côte sur le prix, les scores d’évaluation, le contexte et les fonctionnalités, et le **Calculateur de tarifs** (\`/tools/pricing-calculator\`) estime le coût d’une requête type. Les évaluations et les graphiques de vitesse sont un point de départ, pas un verdict. Testez votre sélection sur de vrais exemples tirés de votre travail : des courts, des typiques et des longs. Essayez d’abord le candidat le moins cher et le plus rapide, et ne passez à un modèle plus cher que si ses réponses ne suffisent pas. Pour un premier test sans crédits, envoyez \`phaseo/free\`, qui exécute votre requête sur un modèle gratuit disponible (jusqu’à 1 500 requêtes de modèles gratuits par utilisateur et par jour UTC).

**Les modèles ne durent pas éternellement.** Les laboratoires déprécient et retirent des modèles à mesure que de nouveaux arrivent. Un modèle retiré continue de fonctionner tant qu’un fournisseur le sert encore, puis les requêtes échouent avec \`410 model_retired\`. La page du modèle affiche ses dates de dépréciation et de retrait, ainsi que le remplaçant suggéré. Phaseo affiche un avis sur votre tableau de bord quand un modèle utilisé par votre espace de travail au cours des 90 derniers jours sera retiré dans les 90 jours, et **Paramètres → Utilisation → Alertes** liste tous les modèles concernés. Testez le remplaçant avant de basculer, car un modèle plus récent peut répondre différemment au même prompt.`,
			quiz: {
				question:
					"Deux modèles se ressemblent dans la liste des modèles. L’un coûte le quart du prix de l’autre. Que faites-vous d’abord ?",
				options: [
					"Vous choisissez le plus cher, parce qu’un prix plus élevé signifie de meilleures réponses.",
					"Vous choisissez celui qui a le meilleur score d’évaluation, sans tester.",
					"Vous testez le moins cher sur de vrais exemples de votre travail, et vous ne montez en gamme que si ses réponses ne suffisent pas.",
				],
				answer: 2,
				explanation:
					"Le prix et les scores d’évaluation aident à présélectionner, mais ils ne prouvent pas comment un modèle se comporte sur vos prompts. Tester d’abord le modèle le moins cher sur vos propres exemples vous dit si vous devez payer plus.",
			},
			scenario: {
				prompt:
					"Un avis du tableau de bord indique qu’un modèle utilisé par votre bot d’assistance sera retiré dans 30 jours. Que faites-vous ?",
				answer:
					"Ouvrez Paramètres → Utilisation → Alertes pour voir le modèle concerné, ses dates et le remplaçant suggéré. Consultez la page du remplaçant pour son prix, sa longueur de contexte et ses paramètres pris en charge, puis testez-le sur de vraies questions d’assistance. Une fois satisfait, changez l’ID de modèle dans votre application ou votre préréglage avant qu’aucun fournisseur ne serve plus l’ancien modèle et que les requêtes échouent avec 410.",
			},
			takeaway:
				"Présélectionnez avec le catalogue, décidez avec vos propres exemples, et commencez par le modèle le moins cher qui fait le travail.",
			links: [
				{ label: "Modèles", href: "/models" },
				{
					label: "Explorer les modèles",
					href: "https://phaseo.app/docs/v1/exploring/models",
				},
				{
					label: "Tarifs et performances",
					href: "https://phaseo.app/docs/v1/exploring/pricing-performance",
				},
				{
					label: "Retrait des modèles",
					href: "https://phaseo.app/docs/v1/guides/model-retirement",
				},
			],
			updated: "2026-11-17",
		},
	],
};
