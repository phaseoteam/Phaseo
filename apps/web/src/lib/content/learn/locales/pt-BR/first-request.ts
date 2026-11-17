import type { LearnCourse } from "../../types";

export const firstRequestCourse: LearnCourse = {
	slug: "make-your-first-request",
	title: "Faça sua primeira solicitação",
	summary:
		"Envie uma solicitação para a API do Phaseo, leia o que volta, trate erros e faça streaming da resposta.",
	level: "developer",
	format: "Qualquer linguagem",
	prerequisites: ["O que é o Phaseo?", "Saber fazer uma solicitação HTTP em qualquer linguagem"],
	lessons: [
		{
			slug: "make-a-request",
			title: "Faça uma solicitação",
			summary: "Envie sua chave de API, um ID de modelo e sua entrada para um endpoint compatível com OpenAI.",
			minutes: 7,
			body: `Toda solicitação vai para \`https://api.phaseo.app/v1\` e leva a sua chave de API como token bearer: \`Authorization: Bearer phaseo_v1_sk_...\`. Crie a chave em **Configurações -> Chaves de API**. Ela é exibida uma única vez, então guarde-a em uma variável de ambiente como \`PHASEO_API_KEY\` e use-a só em código no servidor.

\`POST /v1/responses\` é o endpoint recomendado para novos trabalhos com texto. Você envia um \`model\` e um \`input\`:

\`\`\`bash
curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "input": "Reply with: quickstart works"
  }'
\`\`\`

Já usa o SDK oficial da OpenAI? Mude três coisas: a chave de API, a URL base e o ID do modelo.

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

O código que chama Chat Completions funciona com o mesmo cliente: envie \`messages\` para \`client.chat.completions.create\`.

Os IDs de modelo sempre têm o prefixo do provedor, como \`openai/\`, \`anthropic/\` ou \`google/\`. Para trocar de modelo, mude só a string \`model\`; o resto da solicitação continua igual. Liste os IDs válidos com \`GET /v1/models\` em vez de adivinhar. \`phaseo/free\` escolhe um modelo gratuito disponível e funciona sem créditos, o que é prático para um primeiro teste.`,
			quiz: {
				question: "Você aponta o SDK oficial da OpenAI para o Phaseo. Quais mudanças são necessárias?",
				options: [
					"A chave de API, a URL base e o ID do modelo",
					"Só a URL base; o SDK continua usando a sua chave da OpenAI",
					"Um campo de solicitação exclusivo do Phaseo que indica o provedor, além da URL base",
				],
				answer: 0,
				explanation:
					"A documentação lista exatamente três mudanças: a sua chave de API do Phaseo, a URL base https://api.phaseo.app/v1 e um ID de modelo do Phaseo com o prefixo do provedor. A sua chave da OpenAI não funciona no Phaseo, e o provedor faz parte do ID do modelo, não é um campo separado.",
			},
			scenario: {
				prompt:
					"O seu app envia `\"model\": \"gpt-6-astra\"` e a solicitação falha com 400. Um colega diz que o modelo deve estar fora do ar. O que você confere primeiro?",
				answer:
					"O ID do modelo. Os IDs de modelo do Phaseo incluem o prefixo do provedor, então deveria ser `openai/gpt-6-astra`. Um 400 aponta para o corpo da solicitação ou para o ID do modelo, não para uma indisponibilidade. Chame `GET /v1/models` para confirmar o ID exato.",
			},
			takeaway:
				"Uma URL base, uma chave bearer e um ID de modelo com prefixo do provedor bastam, e trocar de modelo é mudar uma string.",
			links: [
				{ label: "Início rápido", href: "https://phaseo.app/docs/v1/quickstart" },
				{ label: "SDK da OpenAI", href: "https://phaseo.app/docs/v1/guides/integrations/openai-sdk" },
				{ label: "Criar um chat completion", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "read-the-response",
			title: "Leia a resposta",
			summary: "Encontre o texto da resposta, por que ela parou, quem a atendeu e quanto custou.",
			minutes: 6,
			body: `Uma resposta de Chat Completions tem esta forma (valores ilustrativos):

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

- **\`choices[].message.content\`** contém o texto da resposta.
- **\`finish_reason\`** diz por que o modelo parou: \`stop\` (terminou), \`length\` (atingiu o limite de tokens), \`tool_calls\` (quer chamar uma ferramenta) ou \`content_filter\`.
- **\`model\`** indica o modelo que respondeu. Se um modelo alternativo atendeu a solicitação, aparece o alternativo, não o que você pediu.
- **\`provider\`** indica o provedor que a atendeu.
- **\`id\`** é o ID de solicitação do Phaseo. Registre-o: a solicitação aparece em **Configurações -> Uso -> Registros**, e o suporte pede esse ID.

\`usage\` conta os tokens e adiciona \`cost\`: quanto a solicitação custa para você em dólares americanos, o valor descontado dos seus créditos. Em uma solicitação BYOK, \`cost_details.upstream_inference_cost\` mostra o que é cobrado na sua própria chave do provedor; com créditos do Phaseo, ele é \`null\`.

Em \`/v1/responses\` a forma é diferente: o texto fica em \`output[].content[]\`, onde \`type\` é \`output_text\`, e \`usage\` usa \`input_tokens\` e \`output_tokens\`.`,
			quiz: {
				question: "Uma resposta de Chat Completions volta com `finish_reason: \"length\"`. O que aconteceu?",
				options: [
					"O provedor falhou no meio e o Phaseo retornou o que já tinha",
					"O modelo atingiu o limite de tokens, então a resposta pode estar cortada",
					"O modelo terminou normalmente e a resposta está completa",
				],
				answer: 1,
				explanation:
					"`length` significa que o modelo parou porque atingiu o limite de tokens. Um término normal é `stop`. Um provedor que falha no meio retorna um erro, não uma resposta parcial com motivo de término.",
			},
			scenario: {
				prompt:
					"O financeiro quer saber quanto custou a solicitação `G-01J...` de ontem e qual provedor a executou. Onde você procura?",
				answer:
					"Na própria resposta, `usage.cost` traz o valor em dólares americanos e `provider` indica quem a atendeu. Se você não registrou o corpo, abra a solicitação pelo ID em **Configurações -> Uso -> Registros**.",
			},
			takeaway:
				"Leia a resposta em `choices`, confira `finish_reason` e registre `id`, `model`, `provider` e `usage.cost` em cada chamada.",
			links: [
				{ label: "Criar um chat completion", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
				{ label: "Criar uma resposta", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
				{ label: "Início rápido: leia a resposta", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "when-a-request-fails",
			title: "Quando uma solicitação falha",
			summary: "Decida pelo código de erro e pelo status, e repita só os erros que podem dar certo depois.",
			minutes: 8,
			body: `Todo erro do Phaseo tem o mesmo corpo JSON em todos os endpoints. O objeto \`error\` tem a forma que os SDKs compatíveis com OpenAI já leem:

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

Decida com base em \`error.code\` e no status HTTP, nunca no texto da mensagem. Sempre registre \`generation_id\`.

| Status | Código comum | O que fazer |
| --- | --- | --- |
| \`400\` | \`validation_error\`, \`model_required\` | Corrija a solicitação. \`error.param\` indica o campo. |
| \`401\` | \`unauthorised\` | Confira a chave e o cabeçalho \`Authorization\`. |
| \`402\` | \`insufficient_funds\` | Adicione créditos ou use \`phaseo/free\`. |
| \`403\` | \`guardrail_blocked\` | Mude a solicitação ou o guardrail. |
| \`404\` | \`not_found\` | Confira o caminho e o ID. |
| \`410\` | \`model_retired\` | Troque para \`replacement_model\`. |
| \`429\` | \`rate_limit_exceeded\`, \`key_limit_exceeded\` | Aguarde \`Retry-After\` e tente de novo. |
| \`5xx\` | \`upstream_error\`, \`gateway_error\` | Repita com backoff. |

Não repita sem mudanças os erros \`4xx\` além do \`429\`: eles falham de novo. Para \`429\`, aguarde \`Retry-After\` (segundos ou uma data HTTP) ou use backoff exponencial com jitter. Um \`key_limit_exceeded\` sem \`Retry-After\` não volta ao normal sozinho, então não o repita. Repita \`5xx\` só quando for seguro refazer a chamada, e defina um limite de tentativas e um prazo total.`,
			quiz: {
				question: "A sua solicitação retorna `401` com o código `unauthorised`. O que o seu código deve fazer?",
				options: [
					"Parar e conferir a chave de API e o cabeçalho `Authorization: Bearer`",
					"Repetir com backoff exponencial até dar certo",
					"Aguardar o cabeçalho `Retry-After` e enviar a mesma solicitação de novo",
				],
				answer: 0,
				explanation:
					"Um 401 significa que a chave está ausente ou é inválida. Repetir a mesma solicitação não resolve isso. O backoff é para 429 e 5xx, e o `Retry-After` vem com os 429.",
			},
			scenario: {
				prompt:
					"Um script em lote envia 500 solicitações em um loop. Na metade, as respostas começam a voltar como `429` com o cabeçalho `Retry-After: 20`. O que você muda?",
				answer:
					"Faça o script respeitar `Retry-After`: espere uns 20 segundos antes de tentar de novo e use backoff exponencial com jitter quando o cabeçalho não vier. Confira também `error.code`: `rate_limit_exceeded` volta ao normal, mas um `key_limit_exceeded` sem `Retry-After` não, então repeti-lo é inútil.",
			},
			takeaway:
				"Decida por `error.code` e pelo status, corrija os erros 4xx e repita com backoff só os 429 e os 5xx seguros.",
			links: [
				{ label: "Erros e depuração", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "Limites de taxa", href: "https://phaseo.app/docs/v1/api-reference/limits" },
				{ label: "Início rápido: resolva problemas", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "stream-it",
			title: "Faça streaming",
			summary: "Mostre a resposta enquanto ela é escrita e diferencie um stream concluído de um interrompido.",
			minutes: 9,
			body: `Defina \`"stream": true\` e o Phaseo envia a saída como server-sent events (SSE) enquanto o modelo a escreve:

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

Confira primeiro o status HTTP. Uma solicitação que falha antes de o stream começar recebe o erro JSON normal, não um stream. Depois leia os eventos. Cada endpoint tem o próprio formato:

| Endpoint | O texto chega em | Fim com sucesso | Fim com falha |
| --- | --- | --- | --- |
| Responses | \`response.output_text.delta\` | \`response.completed\` | \`response.failed\` ou \`error\` |
| Chat Completions | \`choices[].delta\` | um \`finish_reason\` e depois \`[DONE]\` | um frame \`error\` sem \`finish_reason\` |

No Chat Completions, um último chunk com \`choices\` vazio traz \`usage\`, incluindo o \`cost\` do stream inteiro, antes de \`[DONE]\`. Só o Chat Completions envia \`[DONE]\`. Um chunk de rede pode conter meio evento ou vários, então acumule os dados até um evento ficar completo antes de interpretá-lo, ou use um auxiliar de stream do SDK.

Um stream só está concluído quando chega o evento de fim com sucesso. Uma conexão fechada, por si só, não significa que a resposta está completa. Se ele falhar no meio, guarde o texto parcial marcado como interrompido e ofereça uma nova tentativa; o Phaseo não cobra a saída parcial de um stream que falha.

Para cancelar, passe um \`AbortSignal\` (ou o equivalente do seu cliente HTTP) e aborte quando o usuário parar. Cancelar não garante que o provedor pare na hora, nem que a saída já gerada seja gratuita.`,
			quiz: {
				question: "O seu stream de Chat Completions entregou texto e então a conexão fechou. Você não viu nenhum `finish_reason` nem `[DONE]`. O que você faz?",
				options: [
					"Considera a resposta completa, porque a conexão fechou sem erro",
					"Junta a resposta da nova tentativa ao texto parcial",
					"Trata a resposta como interrompida e oferece uma nova tentativa",
				],
				answer: 2,
				explanation:
					"Um stream só está concluído quando chega o evento de fim com sucesso. Sem `finish_reason` e `[DONE]`, a resposta está incompleta. Uma nova tentativa pode gerar outro texto, então mostre-a separadamente em vez de juntá-la ao texto parcial.",
			},
			scenario: {
				prompt:
					"Os usuários podem apertar **Parar** na interface do seu chat. O seu gerente de produto acha que as respostas interrompidas não custam nada. Ele está certo?",
				answer:
					"Não. Aborte a solicitação com um `AbortSignal` para o seu app parar de ler, mas a documentação diz que cancelar não garante que o provedor pare na hora, nem que a saída já gerada seja gratuita. Conte com a cobrança do trabalho já feito nas respostas interrompidas.",
			},
			takeaway:
				"Espere o evento de fim com sucesso do endpoint, trate qualquer outra coisa como interrompida e não assuma que um stream cancelado é gratuito.",
			links: [
				{ label: "Streaming", href: "https://phaseo.app/docs/v1/guides/streaming" },
				{ label: "Erros durante um stream", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "Criar uma resposta", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
			],
			updated: "2026-11-17",
		},
	],
};
