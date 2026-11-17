import type { LearnCourse } from "../../types";

export const buildFeaturesCourse: LearnCourse = {
	slug: "build-real-features",
	title: "Crie recursos reais",
	summary:
		"Deixe os modelos chamarem as suas funções, retornarem JSON em um formato fixo e receberem imagens, arquivos e áudio como entrada.",
	level: "developer",
	format: "Qualquer linguagem",
	prerequisites: ["Faça sua primeira solicitação"],
	lessons: [
		{
			slug: "call-tools",
			title: "Chame ferramentas",
			summary: "Descreva as suas funções, execute as chamadas que o modelo pede e envie os resultados de volta até ele responder.",
			minutes: 10,
			body: `Descreva as suas funções em \`tools\`, e o modelo responde com uma chamada a uma delas, como uma consulta ao banco de dados, em vez de adivinhar. O modelo nunca executa nada sozinho: o seu app executa a função e envia o resultado de volta, e então o modelo escreve a resposta final.

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

No Chat Completions, a resposta tem \`finish_reason: "tool_calls"\` e uma lista \`tool_calls\` na mensagem do assistente, cada item com um \`id\`, o \`name\` da função e \`arguments\` como string JSON. Execute cada chamada e envie uma nova solicitação que repete a conversa, a mensagem do assistente sem alterações e uma mensagem \`role: "tool"\` por chamada, associada por \`tool_call_id\`. Envie \`tools\` de novo. O modelo responde ou chama outra ferramenta, e você repete o processo. Em \`/v1/responses\`, a chamada é um item \`function_call\` e o seu resultado é um item \`function_call_output\` com o mesmo \`call_id\`; em \`/v1/messages\`, são blocos \`tool_use\` e \`tool_result\`.

\`tool_choice\` controla se o modelo pode chamar ferramentas: \`none\` para só texto, \`auto\` (ou omita o campo) para deixar o modelo decidir, \`required\` para forçar uma chamada, ou um objeto que indica uma ferramenta. Defina \`parallel_tool_calls\` como \`false\` quando as suas ferramentas precisarem rodar uma de cada vez.

Trate cada chamada como entrada não confiável. Confira o nome da ferramenta em uma lista de permissão, rejeite nomes desconhecidos e valide os argumentos interpretados antes de executar qualquer coisa. Se a validação falhar, não execute a ferramenta: envie um erro curto como resultado da ferramenta e deixe o modelo tentar de novo. Com \`stream: true\`, junte todos os deltas dos argumentos antes de interpretá-los. As ferramentas cujo tipo começa com \`phaseo:\`, como \`phaseo:web_search\` ou \`phaseo:datetime\`, rodam do lado do Phaseo, então você recebe a resposta final sem escrever um executor. Essas ferramentas de servidor estão em **Beta**.`,
			quiz: {
				question: "O modelo retorna uma chamada para `delete_user` com `{\"id\": \"42\"}`. O seu app só define `get_weather`. O que o seu código deve fazer?",
				options: [
					"Executá-la, porque o modelo a escolheu com base na conversa",
					"Rejeitá-la como ferramenta desconhecida e enviar um erro curto como resultado da ferramenta",
					"Pedir ao Phaseo que a execute com um prefixo `phaseo:`",
				],
				answer: 1,
				explanation:
					"O guia de segurança diz para rejeitar nomes de ferramentas desconhecidos em vez de adivinhar o que o modelo quis dizer, e para enviar de volta um erro controlado em vez de executar qualquer coisa. As ferramentas `phaseo:` são um conjunto fixo oferecido pelo Phaseo, não uma forma de executar as suas próprias funções.",
			},
			scenario: {
				prompt:
					"O seu bot de suporte chama `get_order` e depois responde. O loop de um colega envia só a mensagem `role: \"tool\"` na nova solicitação, e o provedor a rejeita. O que está faltando?",
				answer:
					"A nova solicitação precisa repetir a conversa, depois a mensagem do assistente com os `tool_calls` sem alterações e depois uma mensagem `role: \"tool\"` por chamada, com o `tool_call_id` correspondente. Envie `tools` de novo também. Um resultado de ferramenta sem uma chamada antes dele não tem com o que ser associado.",
			},
			takeaway:
				"O modelo pede, o seu app valida e executa a chamada, e você envia o resultado de volta com o ID da chamada até o modelo dar uma resposta final.",
			links: [
				{ label: "Chamadas de ferramentas", href: "https://phaseo.app/docs/v1/guides/tool-calling" },
				{ label: "Padrões de chamadas de ferramentas", href: "https://phaseo.app/docs/v1/guides/tool-calling-patterns" },
				{ label: "Segurança nas chamadas de ferramentas", href: "https://phaseo.app/docs/v1/guides/tool-calling-safety" },
				{ label: "Ferramentas de servidor", href: "https://phaseo.app/docs/v1/guides/server-tools" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "get-structured-output",
			title: "Receba saídas estruturadas",
			summary: "Envie um JSON Schema para o modelo retornar JSON no seu formato e valide o resultado antes de usá-lo.",
			minutes: 8,
			body: `Envie um JSON Schema com a solicitação, e o modelo retorna JSON nesse formato em vez de texto livre. Use isso quando você quer dados de volta, como campos extraídos de um e-mail. Use chamadas de ferramentas quando você quer que o modelo peça ao seu app para fazer algo.

| \`type\` | O que você recebe |
| --- | --- |
| \`json_schema\` | JSON que segue o seu schema. Use este por padrão. |
| \`json_object\` | Algum objeto JSON válido, sem formato garantido. |
| \`text\` | Texto simples (o padrão). |

O formato vai em \`response_format\` no \`/v1/chat/completions\`, em \`text.format\` no \`/v1/responses\` e em \`output_config.format\` no \`/v1/messages\` (só \`json_schema\`).

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

O JSON volta como string no conteúdo da mensagem. Antes de interpretá-lo, verifique se houve recusa, conteúdo ausente ou um \`finish_reason\` diferente de \`stop\`. Depois valide o objeto interpretado, por exemplo com Zod. Se a validação falhar, tente de novo uma vez com o erro no prompt e então retorne uma falha segura. Cada nova tentativa é cobrada, e JSON válido ainda não prova que os valores estão corretos.

O Phaseo nunca descarta \`response_format\`. Ele só roteia uma solicitação \`json_schema\` para provedores que aceitam saídas estruturadas; se nenhum provedor do modelo aceitar, a solicitação falha com \`400 validation_error\`. As páginas de modelo indicam o suporte com \`structured_outputs\`, que é um indicador de capacidade, não um campo da solicitação.`,
			quiz: {
				question: "Você envia `response_format` com `json_schema` para um modelo cujos provedores não aceitam saídas estruturadas. O que acontece?",
				options: [
					"O Phaseo descarta `response_format` e retorna texto simples",
					"O Phaseo envia a solicitação mesmo assim e o modelo tenta adivinhar o formato",
					"A solicitação falha com `400 validation_error`",
				],
				answer: 2,
				explanation:
					"`response_format` nunca é descartado. O Phaseo só roteia uma solicitação com schema para provedores que aceitam saídas estruturadas e retorna 400 quando o modelo não tem nenhum.",
			},
			scenario: {
				prompt:
					"O seu leitor de faturas usa `json_schema` e, de vez em quando, a resposta falha na sua verificação com Zod porque `total` está ausente. O que o código deve fazer?",
				answer:
					"Primeiro confira se `finish_reason` é `stop`, já que uma resposta cortada não pode ser válida. Depois tente de novo uma vez com o erro de validação no prompt e, se falhar outra vez, retorne uma falha segura em vez de adivinhar. Acompanhe as falhas por modelo e por versão do schema para perceber quando uma mudança em qualquer um deles piora as coisas.",
			},
			takeaway:
				"Use `json_schema` para dados que você precisa em um formato fixo e sempre valide o resultado no seu próprio código antes de confiar nele.",
			links: [
				{ label: "Saídas estruturadas", href: "https://phaseo.app/docs/v1/guides/structured-outputs" },
				{ label: "Parâmetros: response_format", href: "https://phaseo.app/docs/v1/api-reference/parameters" },
				{ label: "Reparo de respostas para JSON", href: "https://phaseo.app/docs/v1/cookbook/response-healing-for-structured-json" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "send-images-and-audio",
			title: "Envie imagens e áudio",
			summary: "Adicione imagens, arquivos e áudio a uma solicitação, escolha o endpoint para a saída que você quer e encontre modelos que aceitam cada entrada.",
			minutes: 9,
			body: `Nos endpoints de texto, o \`content\` de uma mensagem pode ser uma lista de partes em vez de uma string. Uma parte de imagem aceita uma URL HTTP(S) ou uma URI \`data:\` em base64:

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

As outras partes de entrada seguem o mesmo padrão. \`input_audio\` envia \`data\` de áudio em base64 com um \`format\` como \`wav\` ou \`mp3\`. Uma parte \`file\` envia um documento, como um PDF, seja como data URL em base64 em \`file_data\`, seja como \`file_id\`. Um \`file_id\` só pode ser lido pela conta de provedor que o emitiu, então fixe esse provedor ou envie os dados.

Para outros tipos de saída, use o endpoint próprio:

| Você quer | Endpoint |
| --- | --- |
| Fala a partir de texto | \`/v1/audio/speech\` |
| Texto a partir de fala | \`/v1/audio/transcriptions\` (\`/v1/audio/translations\` para inglês) |
| Imagens | \`/v1/images/generations\`, \`/v1/images/edits\` |
| Texto e layout a partir da imagem de um documento | \`/v1/ocr\`, \`/v1/parse\` |

\`/v1/parse\` aceita uma imagem por solicitação e não aceita PDFs, então converta cada página em imagem antes.

Nem todo modelo aceita todo tipo de entrada. O Phaseo só roteia para provedores que aceitam as entradas da sua solicitação; se nenhum aceitar, você recebe \`400 unsupported_modalities\`. Confira antes: cada modelo em \`GET /v1/models\` lista \`modalities.input\`, e você pode filtrar com \`input_types=image\`. Na página [Modelos](https://phaseo.app/models), use os filtros de modalidades de entrada e saída.`,
			quiz: {
				question: "Você precisa de uma lista de modelos que aceitam imagens como entrada. Qual é a verificação confiável mais rápida?",
				options: [
					"Chamar `GET /v1/models?input_types=image`",
					"Enviar uma imagem para cada modelo e ver quais não dão erro",
					"Escolher qualquer modelo com \"vision\" no nome",
				],
				answer: 0,
				explanation:
					"`GET /v1/models` filtra por `input_types` (alias `input_modalities`), e cada modelo lista `modalities.input`. A página Modelos tem os mesmos filtros. Tentativa e erro custa dinheiro, e os nomes não dizem o que uma rota aceita.",
			},
			scenario: {
				prompt:
					"O seu recurso de recibos envia uma foto para um modelo só de texto e recebe `400 unsupported_modalities`. O gerente de produto pergunta se o Phaseo está fora do ar. O que você responde, e o que você muda?",
				answer:
					"O Phaseo não está fora do ar: nenhuma rota desse modelo aceita imagens como entrada. Escolha um modelo cujo `modalities.input` inclua `image` (filtre `GET /v1/models` com `input_types=image` ou use o filtro da página Modelos) e envie a mesma solicitação para ele.",
			},
			takeaway:
				"Envie imagens, áudio e arquivos como partes do conteúdo, use os endpoints próprios para fala, transcrição e imagens e confira as modalidades de entrada de um modelo antes de depender dele.",
			links: [
				{ label: "Multimodalidade", href: "https://phaseo.app/docs/v1/guides/multimodality" },
				{ label: "Listar modelos", href: "https://phaseo.app/docs/v1/api-reference/endpoint/models" },
				{ label: "Interpretar imagens de documentos", href: "https://phaseo.app/docs/v1/guides/document-parsing" },
				{ label: "Explorar modelos", href: "https://phaseo.app/docs/v1/exploring/models" },
			],
			updated: "2026-11-17",
		},
	],
};
