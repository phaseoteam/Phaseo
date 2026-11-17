import type { LearnCourse } from "../../types";

export const buildFeaturesCourse: LearnCourse = {
	slug: "build-real-features",
	title: "Créer de vraies fonctionnalités",
	summary:
		"Laissez les modèles appeler vos fonctions, renvoyer du JSON dans une forme fixe, et accepter des images, des fichiers et de l’audio en entrée.",
	level: "developer",
	format: "Tous langages",
	prerequisites: ["Envoyer votre première requête"],
	lessons: [
		{
			slug: "call-tools",
			title: "Appeler des outils",
			summary: "Décrivez vos fonctions, exécutez les appels demandés par le modèle et renvoyez les résultats jusqu’à ce qu’il réponde.",
			minutes: 10,
			body: `Décrivez vos fonctions dans \`tools\`, et le modèle répond par un appel à l’une d’elles, par exemple une recherche en base de données, au lieu de deviner. Le modèle n’exécute jamais rien lui-même : votre application exécute la fonction et renvoie le résultat, puis le modèle rédige la réponse finale.

\`\`\`bash
curl https://api.phaseo.app/v1/chat/completions \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "messages": [
      { "role": "user", "content": "What is the weather in London?" }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get current weather by city",
          "parameters": {
            "type": "object",
            "properties": {
              "city": { "type": "string" }
            },
            "required": ["city"]
          }
        }
      }
    ]
  }'
\`\`\`

Sur Chat Completions, la réponse a \`finish_reason: "tool_calls"\` et une liste \`tool_calls\` sur le message de l’assistant, chaque appel avec un \`id\`, un \`name\` de fonction et des \`arguments\` sous forme de chaîne JSON. Exécutez chaque appel, puis envoyez une requête de suivi qui reprend la conversation, le message de l’assistant sans modification, et un message \`role: "tool"\` par appel, associé par \`tool_call_id\`. Renvoyez aussi \`tools\`. Le modèle répond ou appelle un autre outil, et vous recommencez. Sur \`/v1/responses\`, l’appel est un élément \`function_call\` et votre résultat un élément \`function_call_output\` avec le même \`call_id\` ; sur \`/v1/messages\`, ce sont des blocs \`tool_use\` et \`tool_result\`.

\`tool_choice\` détermine si le modèle peut appeler des outils : \`none\` pour du texte seulement, \`auto\` (ou rien) pour laisser le modèle décider, \`required\` pour forcer un appel, ou un objet qui nomme un outil. Définissez \`parallel_tool_calls\` à \`false\` quand vos outils doivent s’exécuter un par un.

Traitez chaque appel comme une entrée non fiable. Vérifiez le nom de l’outil par rapport à une liste d’autorisation, rejetez les noms inconnus et validez les arguments analysés avant toute exécution. Si la validation échoue, n’exécutez pas l’outil : renvoyez une courte erreur comme résultat de l’outil et laissez le modèle réessayer. Avec \`stream: true\`, rassemblez tous les fragments d’arguments avant l’analyse. Les outils dont le type commence par \`phaseo:\`, comme \`phaseo:web_search\` ou \`phaseo:datetime\`, s’exécutent côté Phaseo : vous obtenez la réponse finale sans écrire d’exécuteur. Ces outils serveur sont en **Bêta**.`,
			quiz: {
				question: "Le modèle renvoie un appel à `delete_user` avec `{\"id\": \"42\"}`. Votre application ne définit que `get_weather`. Que doit faire votre code ?",
				options: [
					"L’exécuter, parce que le modèle l’a choisi d’après la conversation",
					"Le rejeter comme outil inconnu et renvoyer une courte erreur comme résultat de l’outil",
					"Demander à Phaseo de l’exécuter avec un préfixe `phaseo:`",
				],
				answer: 1,
				explanation:
					"Le guide de sécurité demande de rejeter les noms d’outils inconnus au lieu de deviner ce que voulait le modèle, et de renvoyer une erreur maîtrisée plutôt que d’exécuter quoi que ce soit. Les outils `phaseo:` sont un ensemble fixe fourni par Phaseo, pas un moyen d’exécuter vos propres fonctions.",
			},
			scenario: {
				prompt:
					"Votre bot d’assistance appelle `get_order` puis répond. La boucle d’un collègue n’envoie que le message `role: \"tool\"` dans la requête de suivi, et le fournisseur la rejette. Que manque-t-il ?",
				answer:
					"La requête de suivi doit reprendre la conversation, puis le message de l’assistant avec ses `tool_calls` sans modification, puis un message `role: \"tool\"` par appel avec le `tool_call_id` correspondant. Renvoyez aussi `tools`. Un résultat d’outil sans appel qui le précède ne correspond à rien.",
			},
			takeaway:
				"Le modèle demande, votre application valide et exécute l’appel, et vous renvoyez le résultat avec l’ID de l’appel jusqu’à ce que le modèle donne une réponse finale.",
			links: [
				{ label: "Appel d’outils", href: "https://phaseo.app/docs/v1/guides/tool-calling" },
				{ label: "Modèles d’appel d’outils", href: "https://phaseo.app/docs/v1/guides/tool-calling-patterns" },
				{ label: "Sécurité de l’appel d’outils", href: "https://phaseo.app/docs/v1/guides/tool-calling-safety" },
				{ label: "Outils serveur", href: "https://phaseo.app/docs/v1/guides/server-tools" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "get-structured-output",
			title: "Obtenir une sortie structurée",
			summary: "Envoyez un JSON Schema pour que le modèle renvoie du JSON dans votre forme, puis validez-le avant de l’utiliser.",
			minutes: 8,
			body: `Envoyez un JSON Schema avec la requête et le modèle renvoie du JSON dans cette forme au lieu de texte libre. Utilisez-le quand vous voulez récupérer des données, comme des champs extraits d’un e-mail. Utilisez l’appel d’outils quand vous voulez que le modèle demande à votre application de faire quelque chose.

| \`type\` | Ce que vous obtenez |
| --- | --- |
| \`json_schema\` | Du JSON conforme à votre schéma. À utiliser par défaut. |
| \`json_object\` | Un objet JSON valide, sans forme imposée. |
| \`text\` | Du texte brut (par défaut). |

Le format se place dans \`response_format\` sur \`/v1/chat/completions\`, dans \`text.format\` sur \`/v1/responses\` et dans \`output_config.format\` sur \`/v1/messages\` (\`json_schema\` uniquement).

\`\`\`json
{
  "model": "openai/gpt-6-astra",
  "messages": [
    { "role": "user", "content": "Return the city and weather for London." }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "weather",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "city": { "type": "string" },
          "weather": { "type": "string" }
        },
        "required": ["city", "weather"],
        "additionalProperties": false
      }
    }
  }
}
\`\`\`

Le JSON revient sous forme de chaîne dans le contenu du message. Avant de l’analyser, vérifiez qu’il n’y a pas de refus, de contenu manquant ou de \`finish_reason\` autre que \`stop\`. Validez ensuite l’objet analysé, par exemple avec Zod. Si la validation échoue, réessayez une fois avec l’erreur dans le prompt, puis renvoyez un échec maîtrisé. Chaque nouvelle tentative est facturée, et un JSON valide ne prouve pas que les valeurs sont justes.

Phaseo ne supprime jamais \`response_format\`. Il ne route une requête \`json_schema\` que vers des fournisseurs qui prennent en charge les sorties structurées ; si aucun fournisseur du modèle ne le fait, la requête échoue avec \`400 validation_error\`. Les pages de modèles signalent cette prise en charge avec \`structured_outputs\`, qui est un indicateur de capacité, pas un champ de requête.`,
			quiz: {
				question: "Vous envoyez `response_format` avec `json_schema` à un modèle dont les fournisseurs ne prennent pas en charge les sorties structurées. Que se passe-t-il ?",
				options: [
					"Phaseo supprime `response_format` et renvoie du texte brut",
					"Phaseo envoie quand même la requête et le modèle devine la forme",
					"La requête échoue avec `400 validation_error`",
				],
				answer: 2,
				explanation:
					"`response_format` n’est jamais supprimé. Phaseo ne route une requête avec schéma que vers des fournisseurs qui prennent en charge les sorties structurées, et renvoie une erreur 400 quand le modèle n’en a aucun.",
			},
			scenario: {
				prompt:
					"Votre analyseur de factures utilise `json_schema`, et de temps en temps la réponse échoue à votre vérification Zod parce que `total` manque. Que doit faire le code ?",
				answer:
					"Vérifiez d’abord que `finish_reason` vaut `stop`, car une réponse tronquée ne peut pas être valide. Réessayez ensuite une fois avec l’erreur de validation dans le prompt, et si cela échoue encore, renvoyez un échec maîtrisé au lieu de deviner. Suivez les échecs par modèle et par version de schéma pour remarquer quand l’un ou l’autre change les choses en pire.",
			},
			takeaway:
				"Utilisez `json_schema` pour les données dont vous avez besoin dans une forme fixe, et validez toujours le résultat dans votre propre code avant de lui faire confiance.",
			links: [
				{ label: "Sorties structurées", href: "https://phaseo.app/docs/v1/guides/structured-outputs" },
				{ label: "Paramètres : response_format", href: "https://phaseo.app/docs/v1/api-reference/parameters" },
				{ label: "Réparation des réponses JSON", href: "https://phaseo.app/docs/v1/cookbook/response-healing-for-structured-json" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "send-images-and-audio",
			title: "Envoyer des images et de l’audio",
			summary: "Ajoutez des images, des fichiers et de l’audio à une requête, choisissez l’endpoint selon la sortie voulue, et trouvez les modèles qui acceptent chaque type d’entrée.",
			minutes: 9,
			body: `Sur les endpoints de texte, le \`content\` d’un message peut être une liste de parties au lieu d’une chaîne. Une partie image accepte une URL HTTP(S) ou une URI \`data:\` en base64 :

\`\`\`json
{
  "model": "anthropic/claude-sonnet-5.5",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "What does this chart show?" },
        { "type": "image_url", "image_url": { "url": "https://example.com/chart.png" } }
      ]
    }
  ]
}
\`\`\`

Les autres parties d’entrée suivent le même principe. \`input_audio\` envoie des \`data\` audio en base64 avec un \`format\` comme \`wav\` ou \`mp3\`. Une partie \`file\` envoie un document comme un PDF, soit sous forme d’URL de données base64 dans \`file_data\`, soit sous forme de \`file_id\`. Un \`file_id\` ne peut être lu que par le compte fournisseur qui l’a émis : épinglez ce fournisseur ou envoyez plutôt les données.

Pour d’autres types de sortie, utilisez l’endpoint dédié :

| Vous voulez | Endpoint |
| --- | --- |
| De la parole à partir de texte | \`/v1/audio/speech\` |
| Du texte à partir de parole | \`/v1/audio/transcriptions\` (\`/v1/audio/translations\` pour l’anglais) |
| Des images | \`/v1/images/generations\`, \`/v1/images/edits\` |
| Le texte et la mise en page d’une image de document | \`/v1/ocr\`, \`/v1/parse\` |

\`/v1/parse\` accepte une image par requête et n’accepte pas les PDF : convertissez d’abord chaque page en image.

Tous les modèles n’acceptent pas toutes les entrées. Phaseo ne route que vers des fournisseurs qui acceptent les entrées de votre requête ; si aucun ne le fait, vous obtenez \`400 unsupported_modalities\`. Vérifiez d’abord : chaque modèle de \`GET /v1/models\` liste \`modalities.input\`, et vous pouvez filtrer avec \`input_types=image\`. Sur la page [Modèles](https://phaseo.app/models), utilisez les filtres de modalités d’entrée et de sortie.`,
			quiz: {
				question: "Vous avez besoin de la liste des modèles qui acceptent des images en entrée. Quelle est la vérification fiable la plus rapide ?",
				options: [
					"Appeler `GET /v1/models?input_types=image`",
					"Envoyer une image à chaque modèle et voir lesquels ne renvoient pas d’erreur",
					"Choisir n’importe quel modèle dont le nom contient « vision »",
				],
				answer: 0,
				explanation:
					"`GET /v1/models` filtre par `input_types` (alias `input_modalities`), et chaque modèle liste `modalities.input`. La page Modèles a les mêmes filtres. Procéder par essais coûte de l’argent, et les noms ne disent pas ce qu’une route accepte.",
			},
			scenario: {
				prompt:
					"Votre fonctionnalité de reçus envoie une photo à un modèle texte uniquement et obtient `400 unsupported_modalities`. Le chef de produit demande si Phaseo est en panne. Que lui répondez-vous, et que changez-vous ?",
				answer:
					"Phaseo n’est pas en panne : aucune route de ce modèle n’accepte d’image en entrée. Choisissez un modèle dont `modalities.input` inclut `image` (filtrez `GET /v1/models` avec `input_types=image`, ou utilisez le filtre de la page Modèles) et envoyez-lui la même requête.",
			},
			takeaway:
				"Envoyez images, audio et fichiers comme parties de contenu, utilisez les endpoints dédiés pour la parole, la transcription et les images, et vérifiez les modalités d’entrée d’un modèle avant de compter dessus.",
			links: [
				{ label: "Multimodalité", href: "https://phaseo.app/docs/v1/guides/multimodality" },
				{ label: "Lister les modèles", href: "https://phaseo.app/docs/v1/api-reference/endpoint/models" },
				{ label: "Analyser des images de documents", href: "https://phaseo.app/docs/v1/guides/document-parsing" },
				{ label: "Explorer les modèles", href: "https://phaseo.app/docs/v1/exploring/models" },
			],
			updated: "2026-11-17",
		},
	],
};
