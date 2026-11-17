import type { LearnCourse } from "../../types";

export const routingCourse: LearnCourse = {
	slug: "routing-and-presets",
	title: "Controle o roteamento e as alternativas",
	summary:
		"Escolha quais provedores atendem as suas solicitações, adicione modelos alternativos e salve configurações compartilhadas em uma predefinição.",
	level: "developer",
	format: "Qualquer linguagem",
	prerequisites: ["Faça sua primeira solicitação"],
	lessons: [
		{
			slug: "route-across-providers",
			title: "Roteie entre provedores",
			summary: "Classifique, limite ou fixe provedores e liste modelos alternativos para quando eles falharem.",
			minutes: 10,
			body: `A maioria dos modelos é servida por vários provedores. Para cada solicitação, o Phaseo mantém os provedores que as suas regras permitem, classifica-os e chama o melhor. Se esse provedor falhar, ele tenta o próximo. A classificação padrão, \`balanced\`, pondera o custo por resposta bem-sucedida.

Ajuste isso com o objeto \`provider\` (\`routing\` é aceito como alias):

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

- \`order\` define uma ordem de preferência; \`only\` e \`ignore\` permitem ou bloqueiam provedores.
- \`sort\` classifica por \`price\`, \`latency\` ou \`throughput\`. Os sufixos de modelo \`:cheap\`, \`:fast\` e \`:nitro\` fazem o mesmo e têm prioridade sobre \`sort\`.
- \`max_price\` define tetos de preço; \`required_execution_region\`, \`required_data_region\` e \`require_zero_data_retention\` limitam onde e como os dados são tratados.

Para fixar um provedor, sem alternativa entre provedores, coloque-o na frente do ID do modelo: \`baseten:thinking-machines/inkling-small\`. Para roteamento regional da solicitação inteira, envie as solicitações de texto para \`eu.api.phaseo.app\` ou \`us.api.phaseo.app\`.

Para recorrer a outros modelos, liste-os em \`models\`. O Phaseo tenta \`model\` primeiro e depois cada item na ordem, mas só depois que o modelo anterior termina com \`429\`, \`500\`, \`502\`, \`503\` ou \`504\`. Erros como \`400\`, \`401\` ou \`402\` retornam na hora. Cada tentativa é cobrada como uma solicitação própria, e o campo \`model\` da resposta indica o modelo que respondeu. Um stream só recorre a uma alternativa antes do primeiro byte.`,
			quiz: {
				question: "Você envia `\"model\": \"openai/gpt-6-astra\"` com `\"models\": [\"anthropic/claude-sonnet-5.5\"]`. O primeiro modelo retorna `400 validation_error`. O que acontece?",
				options: [
					"O Phaseo retorna o 400 na hora e não tenta a alternativa",
					"O Phaseo repete a solicitação em `anthropic/claude-sonnet-5.5`",
					"O Phaseo repete o mesmo modelo em outro provedor e depois tenta a alternativa",
				],
				answer: 0,
				explanation:
					"Os modelos alternativos só são tentados depois de um 429, 500, 502, 503 ou 504. Um 400 é um problema da própria solicitação, então ele retorna na hora; outro modelo também a rejeitaria.",
			},
			scenario: {
				prompt:
					"A sua equipe jurídica diz que os prompts dos clientes só podem ir para provedores com zero retenção de dados, e que o app nunca pode usar um provedor específico. Você não quer fixar um único provedor. O que você envia?",
				answer:
					"Mantenha o ID do modelo simples para que o Phaseo ainda possa recorrer a outros provedores e adicione `\"provider\": { \"require_zero_data_retention\": true, \"ignore\": [\"<provider-id>\"] }`. Fixar com `provider:model` desativaria a alternativa entre provedores, e você não quer isso.",
			},
			takeaway:
				"Use `provider` para classificar e limitar provedores, um prefixo `provider:` para fixar um deles e `models` para recorrer a outros modelos em erros que podem ser repetidos.",
			links: [
				{ label: "Roteamento e alternativas", href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks" },
				{ label: "Parâmetros de provedor", href: "https://phaseo.app/docs/v1/api-reference/parameters" },
				{ label: "IDs de modelo qualificados por provedor", href: "https://phaseo.app/docs/v1/guides/provider-qualified-models" },
				{ label: "Roteamento regional", href: "https://phaseo.app/docs/v1/guides/regional-routing" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "use-a-preset",
			title: "Use uma predefinição",
			summary: "Salve um modelo, um prompt e regras de roteamento sob um nome e chame-o de qualquer app.",
			minutes: 7,
			body: `Uma predefinição guarda o modelo, o prompt de sistema, os parâmetros e as regras de provedor de uma tarefa sob um nome como \`@support-triage\`. Quem chama envia esse nome como \`model\` e só a entrada. O Phaseo completa o resto antes de escolher um provedor. Crie predefinições em **Configurações -> Predefinições** ou com \`POST /v1/presets\` e uma chave de gerenciamento.

\`\`\`bash
curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "@support-triage",
    "input": "Customer says the invoice total is wrong."
  }'
\`\`\`

Não existe um campo \`preset\` separado. Indique uma versão com \`@support-triage@v3\` ou siga um rótulo com \`@support-triage@production\`, para poder voltar atrás movendo o rótulo.

Quando a solicitação e a predefinição definem a mesma coisa, estas regras decidem:

- **Os parâmetros preenchem lacunas.** Os padrões da predefinição só valem para os campos que a solicitação não envia. Um valor na solicitação sempre prevalece.
- **Os prompts de sistema se somam.** O prompt da predefinição vem primeiro, depois o da própria solicitação.
- **As configurações de provedor da solicitação prevalecem.** \`provider.order\` ou \`provider.max_price\` na solicitação substitui o valor da predefinição para esse campo.
- **As listas de permissão restringem, nunca ampliam.** Um modelo fora dos modelos permitidos pela predefinição falha com \`validation_error\`; ele não é redirecionado.`,
			quiz: {
				question: "A sua predefinição define `temperature` como 0.2. Uma solicitação envia `\"model\": \"@support-triage\"` com `\"temperature\": 0.8`. Qual valor é usado?",
				options: [
					"0.2, porque a predefinição bloqueia os parâmetros dela",
					"0.8, porque um valor na solicitação sempre prevalece",
					"0.5, porque o Phaseo tira a média dos dois valores",
				],
				answer: 1,
				explanation:
					"Os parâmetros padrão de uma predefinição só preenchem os campos que a solicitação não envia. Quando a solicitação define um valor, a solicitação prevalece.",
			},
			scenario: {
				prompt:
					"Três serviços chamam o mesmo modelo de suporte com prompts e regras de provedor copiados e colados. Uma mudança de prompt foi para um serviço, mas não para os outros, e agora as respostas são diferentes. Como você evita que isso aconteça de novo?",
				answer:
					"Mova o modelo, o prompt de sistema e as regras de provedor compartilhados para uma única predefinição e faça todos os serviços enviarem `\"model\": \"@support-triage@production\"`. Publique as mudanças como novas versões e mova o rótulo `production` para lançá-las, ou mova-o de volta para desfazer.",
			},
			takeaway:
				"Coloque as configurações compartilhadas em uma predefinição, chame-a pelo nome em `model` e deixe os valores da solicitação substituírem os padrões da predefinição quando precisar.",
			links: [
				{ label: "Predefinições", href: "https://phaseo.app/docs/v1/guides/presets" },
				{ label: "Templates de prompt", href: "https://phaseo.app/docs/v1/guides/prompt-templates" },
				{ label: "Roteamento e alternativas", href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks" },
			],
			updated: "2026-11-17",
		},
	],
};
