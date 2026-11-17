import type { LearnCourse } from "../../types";

export const agentsCourse: LearnCourse = {
	slug: "phaseo-in-your-coding-agent",
	title: "Utiliser Phaseo avec votre agent de programmation",
	summary:
		"Donnez à votre agent de programmation les compétences, la documentation et les outils Phaseo, puis laissez-le vous apprendre Phaseo pendant qu’il construit votre projet.",
	level: "beginner",
	format: "Sans code",
	prerequisites: ["Qu’est-ce que Phaseo ?"],
	lessons: [
		{
			slug: "connect-your-agent",
			title: "Connecter votre agent",
			summary:
				"Donnez à votre agent les compétences et la documentation Phaseo pour qu’il écrive du code correct, des données en direct via MCP, et les modèles Phaseo via la CLI.",
			minutes: 8,
			body: `Les agents de programmation comme Claude Code, Codex et Cursor peuvent travailler avec Phaseo de trois façons distinctes. Choisissez celles dont vous avez besoin.

**1. Lui apprendre Phaseo.** Les compétences d’agent sont des instructions qui aident votre agent à écrire du code Phaseo correct. Elles couvrent le Gateway, les SDK, les préréglages, le routage et les migrations. Installez-les avec :

\`\`\`bash
npx skills add https://phaseo.app/docs
\`\`\`

Pour qu’il lise la documentation à jour pendant une session, ajoutez le serveur Docs MCP, \`https://phaseo.app/docs/mcp\`. Il lit uniquement la documentation et ne touche jamais à votre compte.

**2. Lui donner les données Phaseo en direct.** Le serveur MCP Phaseo, \`https://mcp.phaseo.app/mcp\`, permet à un agent de consulter les modèles, les prix, les fournisseurs, vos crédits, votre utilisation et vos journaux de requêtes. Il est en lecture seule et ne renvoie jamais de prompts, de réponses ni de valeurs secrètes. Vous vous connectez avec Phaseo dans votre navigateur. Dans Claude Code :

\`\`\`bash
claude mcp add --transport http phaseo https://mcp.phaseo.app/mcp
\`\`\`

Lancez ensuite \`/mcp\`, sélectionnez \`phaseo\` et choisissez **Authenticate**. Si vous voulez aussi que l’agent gère les clés API et les paramètres de l’espace de travail, connectez-vous avec \`https://mcp.phaseo.app/mcp?access=manage\` et décochez les permissions dont vous ne voulez pas.

**3. Faire tourner l’agent sur les modèles Phaseo.** Installez la CLI Phaseo avec \`npm install -g @phaseo/cli\`, lancez \`phaseo login\`, puis la commande de votre agent, comme \`phaseo claude-code\` ou \`phaseo codex\`. La CLI fait pointer l’agent vers Phaseo et lui crée sa propre clé API, avec une limite de dépenses mensuelle de 100 $ et une expiration à 90 jours. Vous approuvez la clé dans votre navigateur, et vous pouvez modifier sa limite dans **Paramètres → Clés API**.

Sur Claude Code ou Codex, le plugin Phaseo installe les deux serveurs MCP et les compétences en une seule fois.`,
			quiz: {
				question:
					"Vous connectez votre agent à https://mcp.phaseo.app/mcp sans ?access=manage. Que peut-il faire ?",
				options: [
					"Lire les données Phaseo en direct, comme les modèles, les prix, les crédits et les journaux de requêtes.",
					"Créer des clés API et acheter des crédits pour votre espace de travail.",
					"Lire les prompts et les réponses stockés dans vos journaux de requêtes.",
				],
				answer: 0,
				explanation:
					"L’URL simple est en lecture seule. Les modifications exigent l’URL manage, et même dans ce cas le MCP ne peut pas acheter de crédits. Ses outils ne renvoient jamais de prompts, de réponses ni de valeurs secrètes.",
			},
			scenario: {
				prompt:
					"Vous utilisez Codex. Vous voulez qu’il écrive du code Phaseo conforme à la documentation, et vous voulez aussi que Codex lui-même tourne sur des modèles via Phaseo. Que configurez-vous ?",
				answer:
					"Deux choses distinctes. Pour un code correct, installez les compétences avec `npx skills add https://phaseo.app/docs`, et ajoutez le Docs MCP si vous voulez qu’il lise la documentation à jour. Pour faire tourner Codex sur Phaseo, installez la CLI, lancez `phaseo login`, puis `phaseo codex`, qui crée une clé pour Codex avec une limite mensuelle de 100 $ et une expiration à 90 jours. Le plugin Phaseo pour Codex peut installer les compétences et les deux serveurs MCP en une fois.",
			},
			takeaway:
				"Les compétences et le Docs MCP apprennent Phaseo à votre agent, le MCP Phaseo lui donne les données en direct, et la CLI le fait tourner sur les modèles Phaseo.",
			links: [
				{
					label: "CLI et MCP",
					href: "https://phaseo.app/docs/v1/developers/cli-and-mcp",
				},
				{
					label: "Agents de programmation",
					href: "https://phaseo.app/docs/v1/guides/integrations/coding-assistants",
				},
				{
					label: "Configurer les agents de programmation avec SKILL.md",
					href: "https://phaseo.app/docs/v1/cookbook/coding-agents-skill-md",
				},
				{
					label: "Gérer Phaseo depuis un agent",
					href: "https://phaseo.app/docs/v1/developers/manage-from-an-agent",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "learn-in-your-agent",
			title: "Apprendre Phaseo dans votre agent",
			summary:
				"Transformez votre agent de programmation en tuteur qui vous apprend Phaseo pendant qu’il construit quelque chose dont vous avez vraiment besoin.",
			minutes: 6,
			body: `\`https://phaseo.app/learn.md\` est un cours écrit pour votre agent de programmation. Collez ceci dans Claude Code, Codex, Cursor ou tout agent capable de récupérer des URL :

\`\`\`text
Récupère https://phaseo.app/learn.md et suis ses instructions. Apprends-moi Phaseo pendant que nous construisons quelque chose dont j’ai vraiment besoin.
\`\`\`

**Ce qui se passe ensuite.** L’agent vous demande ce que vous voulez construire, votre expérience, votre langage et votre framework, vos contraintes éventuelles comme le budget ou la région, et comment vous saurez que cela fonctionne. Il en fait une mission, puis propose la plus petite version qui fonctionne de bout en bout. Vous validez le plan avant qu’il écrive la moindre ligne de code.

**Comment se déroule chaque leçon.** L’agent écrit le code ; vous prenez les décisions, comme le choix du modèle, de l’endpoint, et de ce qu’il faut faire quand une requête échoue. Il explique une idée à la fois, demande avant d’écrire une modification, l’exécute avec vous, puis vous pose une question pour vérifier que vous avez compris avant de continuer. Il consulte les ID de modèles, les prix et les limites au lieu de les deviner.

**Votre progression est enregistrée** dans un dossier \`.phaseo-learn/\` de votre projet : le cours lui-même, votre mission et votre plan, des notes sur votre façon de travailler, les pages de documentation utilisées et un compte rendu par leçon. Ouvrez une nouvelle session avec le même prompt : l’agent lit ces fichiers et reprend là où vous vous étiez arrêté. Il propose d’ajouter le dossier à \`.gitignore\` ; c’est à vous de choisir.

Définissez \`PHASEO_API_KEY\` vous-même avant de commencer. Le cours interdit à l’agent de vous demander de coller une clé dans la conversation.`,
			quiz: {
				question: "Où le cours conserve-t-il votre progression d’une session à l’autre ?",
				options: [
					"Dans un dossier .phaseo-learn/ de votre projet.",
					"Dans votre compte Phaseo, sous Paramètres.",
					"Nulle part : chaque session repart du début.",
				],
				answer: 0,
				explanation:
					"L’agent enregistre le cours, votre mission, vos notes, les ressources et les comptes rendus de leçons dans `.phaseo-learn/`, et les relit au début de chaque session.",
			},
			scenario: {
				prompt:
					"En pleine session, l’agent écrit trois fichiers d’affilée alors que vous avez seulement répondu « ok », et cite le prix d’un modèle de mémoire. Que devez-vous faire ?",
				answer:
					"Ce sont deux signes que l’agent s’est écarté du cours. Demandez-lui de s’arrêter, de relire `.phaseo-learn/COURSE.md` et `MISSION.md`, et de vous poser une question de vérification sur la dernière chose qu’il a construite. Demandez-lui de chercher le prix via `GET https://api.phaseo.app/v1/models` ou sur la page du modèle au lieu de le citer de mémoire.",
			},
			takeaway:
				"Un seul prompt transforme votre agent en tuteur Phaseo qui construit votre projet avec vous et enregistre votre progression dans .phaseo-learn/.",
			links: [
				{ label: "Le cours pour votre agent", href: "https://phaseo.app/learn.md" },
				{
					label: "Démarrage rapide",
					href: "https://phaseo.app/docs/v1/quickstart",
				},
				{
					label: "Docs MCP",
					href: "https://phaseo.app/docs/v1/guides/integrations/docs-mcp",
				},
			],
			updated: "2026-11-17",
		},
	],
};
