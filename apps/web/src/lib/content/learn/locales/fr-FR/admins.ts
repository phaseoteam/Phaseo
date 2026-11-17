import type { LearnCourse } from "../../types";

const DOCS = "https://phaseo.app/docs/v1";

export const adminsCourse: LearnCourse = {
	slug: "set-up-your-team",
	title: "Configurer Phaseo pour votre équipe",
	summary:
		"Faites entrer votre équipe dans un espace de travail, distribuez les clés en toute sécurité, plafonnez les dépenses, définissez garde-fous et routage, et voyez comment l’IA est utilisée. Sans code.",
	level: "admin",
	format: "Sans code",
	prerequisites: ["Qu’est-ce que Phaseo ?"],
	lessons: [
		{
			slug: "workspaces-and-members",
			title: "Espaces de travail et membres",
			summary:
				"Utilisez les espaces de travail pour séparer les équipes, invitez des personnes avec un code et donnez à chacune le bon rôle.",
			minutes: 7,
			body: `Un espace de travail possède ses propres clés API, paramètres de routage, préréglages, garde-fous et accès administrateur. Chaque compte commence avec un espace de travail personnel. Créez-en d’autres pour chaque équipe, produit ou environnement, par exemple pour tenir les clés de production à l’écart du développement. Les espaces de travail supplémentaires se débloquent après votre premier dépôt de crédits, et ils ne changent pas vos tarifs.

Chaque personne d’un espace de travail a l’un de ces trois rôles :

- **Propriétaire** : la personne à qui appartient l’espace de travail. Seul le propriétaire peut nommer un administrateur, changer les rôles ou retirer d’autres membres. Le propriétaire ne peut pas être retiré.
- **Administrateur** : gère les paramètres réservés aux administrateurs, comme les clés API, les budgets, les règles de dépenses et les garde-fous, et consulte le journal d’audit.
- **Membre** : utilise l’espace de travail et peut voir ses règles de dépenses, mais ne peut pas modifier les paramètres réservés au propriétaire et aux administrateurs.

Pour inviter quelqu’un, ouvrez **Paramètres → Membres** et sélectionnez **Créer une invitation**. Choisissez le rôle (Administrateur ou Membre), la durée de validité de l’invitation en jours et, si vous le souhaitez, un nombre maximal d’utilisations. Vous obtenez un code à partager. Votre collègue ouvre **Paramètres → Espaces de travail**, choisit **Vous avez obtenu un code d’invitation ?** et le saisit. Cela envoie une demande d’accès, qu’un propriétaire ou un administrateur approuve dans **Demandes d’accès**. Seul le propriétaire peut approuver quelqu’un comme administrateur.

Passez d’un espace de travail à l’autre avec le sélecteur d’espace de travail dans l’en-tête. Tout ce que vous voyez dans Paramètres, des clés à l’utilisation, appartient à l’espace de travail ouvert. Votre espace de travail personnel ne peut être ni renommé ni supprimé.`,
			quiz: {
				question: "Un administrateur veut faire entrer un nouveau collègue comme autre administrateur. Que se passe-t-il ?",
				options: [
					"L’administrateur crée une invitation avec le rôle Administrateur et approuve la demande d’accès.",
					"Seul le propriétaire de l’espace de travail peut inviter ou approuver quelqu’un comme administrateur.",
					"On ne peut pas inviter d’administrateurs ; chaque nouvelle personne rejoint l’espace comme propriétaire.",
				],
				answer: 1,
				explanation:
					"Nommer un administrateur relève du propriétaire. Un administrateur peut inviter des membres, mais une invitation avec le rôle Administrateur, son approbation et les changements de rôle ultérieurs exigent tous le propriétaire de l’espace de travail.",
			},
			scenario: {
				prompt:
					"Un prestataire a terminé son projet et vous voulez le retirer de l’espace de travail. Il a créé la clé API que votre bot d’assistance utilise encore. Que devez-vous vérifier d’abord ?",
				answer:
					"Retirer un membre révoque aussi les clés API qu’il a créées dans cet espace de travail : le bot d’assistance cesserait de fonctionner. Créez d’abord vous-même une clé de remplacement (ou faites une rotation de la sienne vers une nouvelle clé), basculez le bot dessus, puis demandez au propriétaire de retirer le prestataire dans Paramètres → Membres.",
			},
			takeaway:
				"Donnez à chaque équipe ou environnement son propre espace de travail, et réservez le rôle Administrateur aux quelques personnes qui gèrent les clés, les budgets et les garde-fous.",
			links: [
				{ label: "Guide des espaces de travail", href: `${DOCS}/guides/workspaces` },
				{ label: "Membres", href: "/settings/workspaces/members" },
				{ label: "Vos espaces de travail", href: "/settings/account/workspaces" },
				{ label: "Glossaire : rôles", href: `${DOCS}/glossary` },
			],
			updated: "2026-11-17",
		},
		{
			slug: "keys-for-a-team",
			title: "Des clés API pour une équipe",
			summary:
				"Donnez à chaque application et environnement sa propre clé limitée, utilisez des clés de gestion pour l’automatisation, et faites la rotation des clés sans interruption.",
			minutes: 8,
			body: `Les propriétaires et les administrateurs créent les clés API dans **Paramètres → Clés API**. Utilisez **une clé par application et par environnement**, pas une clé partagée par tout le monde. Vous pouvez alors voir l’utilisation de chaque clé, la limiter et la remplacer sans toucher au reste. Le secret ne s’affiche qu’une fois : il va directement dans votre gestionnaire de secrets.

Chaque clé peut avoir des limites quotidiennes, hebdomadaires ou mensuelles sur les requêtes et sur les dépenses. Elles sont vérifiées à chaque requête et se réinitialisent à minuit UTC, le lundi ou le 1er du mois. Quand une limite est atteinte, les requêtes avec cette clé sont refusées jusqu’à la réinitialisation de la période. **Sécurité des clés** liste les clés qui pourraient faire des dégâts en cas de fuite : sans limite de dépenses, sans expiration, inactives depuis 90 jours ou plus, ou utilisables depuis n’importe quelle adresse IP.

Pour l’automatisation, comme un script qui crée des clés ou lit l’utilisation, utilisez une **clé de gestion** depuis **Paramètres → Clés de gestion**. Les clés de gestion ne peuvent pas envoyer de requêtes de modèle. Choisissez un modèle : **Lecture**, **Écriture** (sans suppression) ou **Tous**, ou choisissez seulement les capacités dont vous avez besoin. Une clé de gestion ne peut jamais faire plus que ce que permet le rôle de la personne qui l’a créée.

Pour remplacer une clé, sélectionnez **Rotation**. Phaseo crée une clé de remplacement avec les mêmes limites et vous laisse choisir quand la clé actuelle expire : immédiatement, dans 1 heure, 24 heures ou 7 jours, à un moment que vous choisissez, ou jamais. Basculez vos applications sur la nouvelle clé avant l’expiration de l’ancienne. Vous pouvez aussi suspendre une clé et la réactiver plus tard, ou la supprimer définitivement. Une clé révoquée ne peut pas être réactivée.`,
			quiz: {
				question: "Votre équipe veut un script nocturne qui crée et supprime des clés API. Quel identifiant doit-il utiliser ?",
				options: [
					"Une clé API normale avec une limite de dépenses élevée.",
					"Une clé de gestion avec seulement les capacités de clés dont il a besoin.",
					"Une clé de gestion avec le modèle Tous, pour qu’il n’échoue jamais.",
				],
				answer: 1,
				explanation:
					"Seules les clés de gestion peuvent appeler les API d’administration, les clés API normales ne le peuvent pas. Donnez-lui l’ensemble de capacités le plus restreint qui fonctionne, et réservez Tous à l’automatisation d’administration de confiance.",
			},
			scenario: {
				prompt:
					"Un développeur vous signale que la clé API de production a été poussée dans un dépôt public il y a une heure. Que faites-vous ?",
				answer:
					"Faites immédiatement une rotation de la clé et choisissez de faire expirer la clé actuelle tout de suite. Placez le nouveau secret dans votre gestionnaire de secrets et mettez à jour l’application. Vérifiez ensuite les requêtes de la clé dans Paramètres → Journaux pour repérer tout ce que vous ne reconnaissez pas. D’abord la rotation, ensuite l’enquête.",
			},
			takeaway:
				"Une clé par application et par environnement, chacune avec une limite de dépenses, limite l’impact des fuites et rend la rotation indolore.",
			links: [
				{ label: "Authentification et clés", href: `${DOCS}/developers/authentication` },
				{ label: "Clés API de gestion", href: `${DOCS}/developers/management-api-keys` },
				{ label: "Clés API", href: "/settings/keys" },
				{ label: "Sécurité des clés", href: "/settings/security" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "bring-your-own-keys",
			title: "Apporter vos propres clés de fournisseur",
			summary:
				"Ajoutez les clés de vos propres comptes fournisseurs pour que Phaseo route les requêtes avec elles, et décidez quand les clés de fournisseur de Phaseo peuvent prendre le relais.",
			minutes: 8,
			body: `Avec **BYOK (Bring your own key)**, vous donnez à Phaseo une clé API issue de votre propre compte chez un fournisseur. Phaseo route et journalise toujours la requête, mais il appelle le fournisseur avec votre clé, et **votre fournisseur facture directement l’utilisation du modèle**. Ce sont les quotas, limites de débit, politique de données et accès aux modèles de votre compte fournisseur qui s’appliquent, pas la capacité partagée de Phaseo.

Les propriétaires et les administrateurs ajoutent des clés dans **Paramètres → Apportez votre propre clé**. Choisissez le fournisseur, sélectionnez **Configurer la clé du fournisseur** et collez la clé. Phaseo la chiffre (AES-256-GCM), la lie à l’espace de travail et au fournisseur, et ne l’affiche plus jamais. Limitez chaque clé aux modèles et aux clés API qui en ont besoin, au lieu de la laisser sur tous, et utilisez **Test** pour l’essayer dans Chat. Chaque modification d’une clé de fournisseur est enregistrée dans le journal d’audit de l’espace de travail.

Chaque clé de fournisseur est de l’un de deux types, et vous pouvez faire glisser les clés pour changer leur ordre :

- **Priorisé** : Phaseo les essaie en premier, de haut en bas.
- **Solution de repli** : elles ne prennent le relais que lorsque la route de Phaseo ne peut pas mener la requête à bien.

Si une clé priorisée échoue, le paramètre **Repli BYOK** de l’espace de travail détermine si la requête peut être relancée avec les clés de fournisseur de Phaseo, payées avec vos crédits. Il est activé par défaut. Désactivez-le si l’utilisation doit toujours passer uniquement par vos propres comptes fournisseurs. Les tâches par lots utilisent actuellement les clés de Phaseo, pas les vôtres.

**Ce que Phaseo facture :** aucuns frais de service pour les 250 000 premières requêtes BYOK terminées par espace de travail et par mois UTC, puis 2,5 % de ce que la requête aurait coûté aux prix du fournisseur. Les frais sont prélevés sur vos crédits : gardez au moins 1 $ disponible, ce qui couvre aussi un éventuel repli sur les clés de Phaseo. La page affiche les requêtes BYOK du mois et le nombre de requêtes sans frais restantes.`,
			quiz: {
				question:
					"Votre espace de travail a une clé OpenAI priorisée et le repli BYOK est désactivé. Le fournisseur rejette une requête faite avec votre clé. Que se passe-t-il ?",
				options: [
					"Phaseo relance avec ses propres clés de fournisseur et débite vos crédits.",
					"Phaseo facture des frais de 2,5 % et relance avec la même clé.",
					"La requête n’est pas relancée avec les clés de Phaseo, car le repli est désactivé.",
				],
				answer: 2,
				explanation:
					"Le repli BYOK détermine si une requête en échec sur une clé priorisée peut être relancée avec les clés de fournisseur de Phaseo. S’il est désactivé, l’utilisation passe uniquement par vos propres comptes fournisseurs.",
			},
			scenario: {
				prompt:
					"Votre entreprise a déjà un contrat d’engagement de dépenses avec un fournisseur, et la comptabilité veut que cette utilisation y soit facturée, pas sur les crédits Phaseo. Votre équipe envoie environ 400 000 requêtes par mois. Comment le configurer, et que facturera encore Phaseo ?",
				answer:
					"Ajoutez la clé du fournisseur comme clé priorisée dans Paramètres → Apportez votre propre clé, limitée aux modèles et aux clés API qui doivent l’utiliser. Désactivez le repli BYOK si aucune utilisation ne doit passer par les clés de Phaseo. Le fournisseur facture l’utilisation du modèle. Phaseo ne facture rien pour les 250 000 premières requêtes BYOK terminées du mois, puis 2,5 % du coût équivalent chez le fournisseur pour le reste, payés avec les crédits : gardez donc un petit solde.",
			},
			takeaway:
				"BYOK fait passer les requêtes par vos propres comptes fournisseurs ; le paramètre de repli détermine si les clés de Phaseo peuvent prendre le relais quand les vôtres échouent.",
			links: [
				{ label: "Points d’attention BYOK", href: `${DOCS}/guides/routing-and-fallbacks#byok-considerations` },
				{ label: "Forfaits et frais BYOK", href: `${DOCS}/exploring/subscription-plans` },
				{ label: "Apportez votre propre clé", href: "/settings/byok" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "budgets-and-spend-rules",
			title: "Budgets et règles de dépenses",
			summary:
				"Utilisez les crédits, les budgets et les limites de clés comme plafonds stricts, et les règles de dépenses comme alertes précoces.",
			minutes: 9,
			body: `Les modèles payants sont payés avec le solde de crédits de votre espace de travail. Vous le rechargez dans **Paramètres → Facturation et crédits**, qui propose aussi un simple e-mail en cas de solde bas. Les modèles gratuits ne nécessitent pas de crédits.

Phaseo propose deux types de plafonds stricts. Les deux sont vérifiés à chaque requête : les dépenses ne peuvent donc pas les dépasser.

- **Budgets d’espace de travail** dans **Paramètres → Budgets** : une limite quotidienne, hebdomadaire, mensuelle ou à vie pour tout l’espace de travail. La page affiche les dépenses à ce jour, la part utilisée et une projection.
- **Limites de clés** : des limites de requêtes et de dépenses sur une clé API.

Les **règles de dépenses** vous avertissent avant que vous atteigniez un plafond. Ouvrez **Paramètres → Notifications → Alertes de dépenses** et sélectionnez **Ajouter une alerte**. Une règle choisit quelles dépenses comptent (l’espace de travail, une clé, un membre, un département, un modèle ou un fournisseur), une période et des seuils. Elle peut alerter sur les dépenses, sur une part d’un budget, sur une prévision pour la période, sur un pic soudain ou sur un solde bas. Les membres peuvent voir les règles ; les propriétaires et les administrateurs les créent et les modifient.

Une règle peut aussi bloquer les requêtes une fois les dépenses au-delà d’une limite. Le blocage se fait au mieux : les règles s’appuient sur l’utilisation enregistrée quelques minutes après la fin des requêtes, donc les dépenses peuvent d’abord dépasser un peu la limite. Utilisez les budgets et les limites de clés pour des plafonds exacts, et les règles de blocage pour des périmètres plus larges, comme un membre. Les alertes de dépenses et le blocage sont encore en cours de déploiement ; tant qu’ils ne sont pas activés pour vous, les règles sont enregistrées mais pas exécutées.

Pour limiter la vitesse à laquelle quelqu’un envoie des requêtes, plutôt que ce qu’il dépense, utilisez **Paramètres → Limites de débit**. Une politique peut fixer des requêtes par minute, des jetons par minute ou des requêtes simultanées pour une clé, un membre, un département ou chacun de vos utilisateurs finaux. Les garde-fous ne plafonnent jamais les dépenses.`,
			quiz: {
				question: "Vous avez besoin d’un plafond mensuel pour tout l’espace de travail, vérifié à chaque requête. Qu’utilisez-vous ?",
				options: [
					"Un budget mensuel d’espace de travail.",
					"Une règle de dépenses avec l’action de blocage.",
					"Un garde-fou avec une limite de dépenses.",
				],
				answer: 0,
				explanation:
					"Les budgets d’espace de travail et les limites de clés sont vérifiés à chaque requête. Une règle de dépenses bloquante se déclenche quelques minutes après le dépassement de la limite, et les garde-fous n’ont aucune limite de dépenses.",
			},
			scenario: {
				prompt:
					"Un nouveau membre de l’équipe fait des essais avec de gros modèles. Vous voulez une alerte quand ses dépenses mensuelles atteignent 200 $, et que ses requêtes soient bloquées si elles atteignent 250 $. Comment le configurer ?",
				answer:
					"Ajoutez une règle de dépenses limitée à ce membre, avec une période mensuelle, un seuil d’alerte à 200 $ et l’action de blocage à 250 $. N’oubliez pas que le blocage intervient quelques minutes en retard. Si vous avez besoin d’un plafond exact, définissez aussi une limite de dépenses mensuelle sur les clés qu’il utilise.",
			},
			takeaway:
				"Les budgets et les limites de clés sont vos arrêts stricts ; les règles de dépenses sont l’alerte précoce placée devant eux.",
			links: [
				{ label: "Guide des alertes de dépenses", href: `${DOCS}/guides/spend-alerts` },
				{ label: "Limites de clés et budgets", href: `${DOCS}/api-reference/limits` },
				{ label: "Budgets", href: "/settings/budgets" },
				{ label: "Notifications", href: "/settings/notifications" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "guardrails",
			title: "Garde-fous",
			summary:
				"Contrôlez quels fournisseurs et modèles les clés peuvent atteindre, comment les données sont traitées, et ce qui est signalé, masqué ou bloqué.",
			minutes: 9,
			body: `Un garde-fou est un ensemble de règles pour le trafic API. Créez-en un dans **Paramètres → Garde-fous → Nouveau garde-corps**. Nommez-le d’après ce qu’il impose, par exemple « eu-models-pii-redact », pour pouvoir le réutiliser sur plusieurs clés. Un garde-fou peut définir :

- **Mode fournisseur** : autoriser tous les fournisseurs, seulement certains, ou tous sauf certains.
- **Mode modèle** : autoriser tous les modèles, ou seulement certains.
- **Traitement des données** : ZDR (Zero Data Retention) uniquement, et si les endpoints susceptibles d’entraîner des modèles sur les entrées restent éligibles.
- Des contrôles **Injection de prompt** et **Informations sensibles**, comme les adresses e-mail, les numéros de téléphone ou les numéros de carte. Chaque contrôle peut **Signaler**, **Masquer** ou **Bloquer**.

Utilisez l’aperçu pour tester une entrée inoffensive, une qui devrait être arrêtée et un vrai prompt avant d’enregistrer. Associez ensuite le garde-fou dans **Appliquer aux clés**, ou dans **Appliquer aux membres** pour couvrir toutes les clés que ces membres créent. Les membres ne peuvent ni modifier ni retirer un garde-fou qu’un propriétaire ou un administrateur leur a attribué.

Les règles de **Paramètres → Confidentialité** s’appliquent à chaque requête de l’espace de travail, et un garde-fou peut seulement les restreindre. Quand plusieurs garde-fous s’appliquent à la même clé, par exemple un sur la clé et un sur son créateur, tous comptent et le résultat le plus strict l’emporte. Un modèle doit être autorisé par chaque garde-fou, les fournisseurs bloqués s’additionnent, le ZDR est exigé dès qu’un garde-fou l’exige, et l’action la plus forte (Bloquer avant Masquer avant Signaler) s’applique.

Commencez petit : associez un nouveau garde-fou à une clé à faible risque, et vérifiez **Paramètres → Utilisation → Activité des garde-fous** et les journaux de requêtes avant de l’étendre. Un garde-fou désactivé conserve ses réglages mais n’est pas appliqué. Les garde-fous ne plafonnent pas les dépenses ; utilisez pour cela les budgets et les limites de clés.`,
			quiz: {
				question:
					"Le garde-fou propre à une clé autorise les modèles A et B. Le garde-fou de membre de son créateur n’autorise que le modèle B. Quels modèles la clé peut-elle utiliser ?",
				options: ["A et B", "Seulement B", "Aucun, car les garde-fous sont en conflit"],
				answer: 1,
				explanation:
					"Tous les garde-fous qui s’appliquent à une clé comptent, et le plus strict l’emporte. Un modèle doit être autorisé par chacun d’eux : il ne reste donc que B.",
			},
			scenario: {
				prompt:
					"Votre équipe juridique veut que les adresses e-mail et les numéros de téléphone soient retirés des prompts, et que seuls des fournisseurs ZDR soient utilisés. Vous ne voulez pas casser le bot d’assistance pendant le déploiement. Quel est votre plan ?",
				answer:
					"Créez un garde-fou avec ZDR uniquement et Informations sensibles sur Masquer pour l’e-mail et le téléphone. Testez-le dans l’aperçu avec un prompt inoffensif, un sensible et un réel. Associez-le d’abord à une clé de préproduction ou à faible risque, vérifiez l’Activité des garde-fous et les journaux, puis associez-le à la clé du bot d’assistance et aux autres clés qui en ont besoin.",
			},
			takeaway:
				"Les garde-fous se cumulent : chacun de ceux qui s’appliquent compte, alors créez de petites règles clairement nommées et déployez-les une clé à la fois.",
			links: [
				{ label: "Déployer des garde-fous", href: `${DOCS}/cookbook/guardrails-for-api-keys` },
				{ label: "Vue d’ensemble de l’API des garde-fous", href: `${DOCS}/api-reference/endpoint/guardrails` },
				{ label: "Garde-fous", href: "/settings/guardrails" },
				{ label: "Confidentialité", href: "/settings/privacy" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "routing-defaults-and-auto-routing",
			title: "Routage par défaut, préréglages et routage automatique",
			summary:
				"Définissez comment votre espace de travail choisit les fournisseurs, partagez des configurations avec les préréglages, et laissez le routage automatique choisir le modèle.",
			minutes: 8,
			body: `La plupart des modèles sont servis par plusieurs fournisseurs. Dans **Paramètres → Routage**, vous choisissez comment votre espace de travail les classe par défaut : **balanced** (par défaut, coût par réponse réussie), **price**, **latency** ou **throughput**. Une requête peut demander un autre mode, mais vos listes d’autorisation, garde-fous et plafonds de prix s’appliquent toujours. La même page propose des interrupteurs pour les fournisseurs bêta et alpha : les fournisseurs en préversion ne reçoivent du trafic que si vous l’activez.

Un **préréglage** enregistre le modèle, le prompt système, les paramètres et les règles de fournisseur d’une tâche sous un nom comme « @support-triage ». Créez des préréglages dans **Paramètres → Préréglages**. Les applications envoient le nom du préréglage à la place d’un modèle : vous pouvez ainsi changer le modèle ou le prompt à un seul endroit, sans redéploiement. Chaque **Publier une nouvelle version** conserve les précédentes. Faites pointer un label comme « production » vers une version, et ramenez-le en arrière pour annuler.

Le **routage automatique** laisse Phaseo choisir le modèle de chaque requête quand une application envoie « phaseo/auto ». Il est en [Alpha](https://phaseo.app/docs/v1/developers/feature-maturity) et s’active par espace de travail, sur demande. Dans **Paramètres → Routage → Routage automatique**, vous choisissez :

- un **objectif** : équilibre, qualité, coût ou latence ;
- un **profil de dépenses** : un plafond de prix strict (Économique, Standard, Premium, Tous les prix ou Personnalisé). Les modèles au-dessus ne sont jamais envisagés ;
- des motifs de modèles facultatifs pour restreindre le choix, et s’il faut basculer vers le modèle suivant en cas d’erreur.

Les requêtes ne peuvent pas modifier ces paramètres, et chaque candidat passe toujours par vos règles de confidentialité et vos garde-fous. Vérifiez la répartition des modèles sur votre propre travail, car les paramètres décident quels modèles sont éligibles, pas la qualité des réponses.`,
			quiz: {
				question: "Votre espace de travail utilise le routage automatique avec le profil de dépenses Économique. Que fait ce profil ?",
				options: [
					"Il fixe un plafond de prix strict : les modèles au-dessus ne sont jamais envisagés.",
					"C’est une préférence qu’une requête peut remplacer par son propre objectif.",
					"Il fait ignorer les garde-fous au routage automatique pour gagner du temps.",
				],
				answer: 0,
				explanation:
					"Les profils de dépenses sont des plafonds stricts sur les prix standard du texte. Les requêtes ne peuvent pas modifier l’objectif, le profil de dépenses ou les motifs de l’espace de travail, et chaque candidat passe toujours par vos garde-fous.",
			},
			scenario: {
				prompt:
					"Trois applications utilisent le même modèle et le même prompt système pour trier des tickets. Vous voulez essayer un modèle plus récent sans demander à chaque équipe de redéployer, et pouvoir annuler vite si les réponses se dégradent. Que mettez-vous en place ?",
				answer:
					"Créez un préréglage, par exemple @support-triage, et faites-le appeler par son nom par les applications. Publiez une nouvelle version avec le modèle plus récent et déplacez le label production vers elle. Si les réponses se dégradent, ramenez le label sur la version précédente.",
			},
			takeaway:
				"Définissez des valeurs par défaut sensées pour l’espace de travail, partagez les configurations via les préréglages, et traitez le routage automatique comme une Alpha à tester sur votre propre travail.",
			links: [
				{ label: "Routage et replis", href: `${DOCS}/guides/routing-and-fallbacks` },
				{ label: "Guide des préréglages", href: `${DOCS}/guides/presets` },
				{ label: "Guide du routage automatique", href: `${DOCS}/guides/auto-routing` },
				{ label: "Paramètres de routage", href: "/settings/routing" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "see-how-ai-is-used",
			title: "Voir comment l’IA est utilisée",
			summary:
				"Utilisez les pages d’utilisation, les journaux, les labels de requête, les classificateurs et le journal d’audit pour voir qui dépense quoi et qui a modifié quoi.",
			minutes: 7,
			body: `**Paramètres → Utilisation** affiche les dépenses et le trafic de l’espace de travail ouvert, avec les pages Vue d’ensemble, Tendances, Explorer, Géographie, Activité des garde-fous et Alertes. **Paramètres → Journaux** liste chaque requête, avec le modèle et le fournisseur qui l’ont servie, ainsi que les sessions, les vidéos, les lots et les sessions en temps réel.

Pour répartir les dépenses par équipe, fonctionnalité ou environnement, demandez à vos développeurs d’ajouter des **labels de requête**, comme team=support, à leurs requêtes. Vous pouvez ensuite filtrer les journaux et l’utilisation selon ces labels. Les labels ne sont pas envoyés aux fournisseurs. N’y mettez ni prompts, ni secrets, ni données personnelles.

Si vos applications ne connaissent pas la catégorie, un **classificateur de requêtes** peut ajouter des labels pour vous. Vous décrivez les catégories, comme le département ou le type de tâche, et choisissez un modèle qui étiquette chaque requête terminée. Il ne ralentit jamais la requête, et vous pouvez définir un taux d’échantillonnage et un budget mensuel. Les propriétaires et les administrateurs gèrent les classificateurs dans **Paramètres → Classificateurs**. Les classificateurs sont en **Bêta** et s’activent par espace de travail, sur demande ; tout le reste de cette leçon est disponible pour tous. Consultez la [maturité des fonctionnalités](https://phaseo.app/docs/v1/developers/feature-maturity) pour savoir ce que cela signifie.

Les journaux montrent le trafic qui a circulé. Le **journal d’audit** montre qui a modifié les contrôles qui l’encadrent. Ouvrez **Paramètres → Activité** pour voir qui a créé, fait tourner ou supprimé une clé, changé le rôle d’un membre, modifié un garde-fou, publié une version de préréglage ou levé un blocage de dépenses, et quand. Seuls les propriétaires et les administrateurs peuvent le consulter. Il ne stocke jamais de secrets ni de corps de requêtes.`,
			quiz: {
				question: "La limite de dépenses d’une clé a été relevée pendant la nuit et personne ne se souvient de l’avoir fait. Où regardez-vous ?",
				options: [
					"Paramètres → Journaux, filtré sur cette clé.",
					"Paramètres → Utilisation → Tendances.",
					"Paramètres → Activité, le journal d’audit de l’espace de travail.",
				],
				answer: 2,
				explanation:
					"Les journaux et l’utilisation montrent les requêtes exécutées. Les modifications des clés, des membres, des garde-fous et des autres contrôles sont enregistrées dans le journal d’audit, avec leur auteur et leur date.",
			},
			scenario: {
				prompt:
					"La comptabilité veut une répartition mensuelle des dépenses d’IA par département. Vos applications n’envoient aucun label, et les développeurs sont occupés pendant des semaines. Que pouvez-vous faire ?",
				answer:
					"Demandez l’activation des classificateurs de requêtes (ils sont en Bêta), puis créez-en un avec une dimension département, un taux d’échantillonnage et un budget mensuel. Ses réponses sont enregistrées comme labels de requête : vous pouvez donc filtrer l’utilisation par département. Quand les développeurs auront le temps, ils pourront ajouter leurs propres labels pour une attribution exacte.",
			},
			takeaway:
				"Les labels et les classificateurs expliquent où vont les dépenses ; le journal d’audit explique qui a modifié quoi.",
			links: [
				{ label: "Labels de requête", href: `${DOCS}/guides/request-labels` },
				{ label: "Classificateurs de requêtes", href: `${DOCS}/guides/request-classifiers` },
				{ label: "Journal d’audit de l’espace de travail", href: `${DOCS}/guides/workspace-audit-log` },
				{ label: "Utilisation", href: "/settings/usage/overview" },
			],
			updated: "2026-11-17",
		},
	],
};
