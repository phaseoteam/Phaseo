import type { LearnCourse } from "../../types";

export const conceptsCourse: LearnCourse = {
	slug: "how-language-models-work",
	title: "Como os modelos de linguagem funcionam",
	summary:
		"Uma introdução em linguagem simples aos modelos de linguagem: como eles aprendem, como funcionam os tokens e o contexto e como conferir o que eles dizem.",
	level: "beginner",
	format: "Sem código",
	prerequisites: [],
	lessons: [
		{
			slug: "how-models-learn",
			title: "Como os modelos aprendem",
			summary:
				"Um modelo de linguagem aprende padrões a partir de enormes quantidades de texto e depois é ajustado para seguir instruções.",
			minutes: 6,
			body: `Um modelo de linguagem é um programa que lê texto e escreve o texto que tem mais chance de vir em seguida. Ele faz isso um pedacinho de cada vez. Faça uma pergunta, e ele escreve uma resposta que se encaixa nos padrões que aprendeu.

**Os modelos aprendem em duas etapas principais.** Primeiro vem o **pré-treinamento**: o modelo lê uma quantidade enorme de texto, como livros, sites e código, e aprende a prever a próxima palavra. É aí que ele absorve a língua, os fatos e os padrões de raciocínio. Depois vem o **ajuste**: pessoas o treinam mais com exemplos de boas respostas, para que ele siga instruções e se comporte como um assistente útil em vez de só continuar o seu texto.

**Os modelos têm uma data de corte de conhecimento.** O treinamento para em uma certa data, e o modelo não sabe nada do que aconteceu depois dela. Ele não pesquisa nada por conta própria. Se você precisa de fatos recentes, tem que fornecê-los ao modelo, por exemplo adicionando um documento ao prompt ou ativando uma ferramenta de busca na web.

**Os modelos de raciocínio pensam antes de responder.** Eles gastam tokens extras trabalhando no problema primeiro e depois escrevem a resposta. Isso ajuda em problemas difíceis, como matemática, código ou planejamento, mas demora mais e custa mais, porque esses tokens de raciocínio contam como saída. No Phaseo, você escolhe quanto um modelo pensa com \`reasoning.effort\` (ou \`reasoning_effort\` no Chat Completions), de \`none\` a \`max\`. Um esforço maior ajuda em problemas difíceis e custa mais tempo e tokens.

**Modelos de pesos abertos e modelos fechados.** Alguns laboratórios publicam os pesos de um modelo, os números que ele aprendeu no treinamento, para que muitos provedores possam hospedá-lo. Outros mantêm os pesos privados e só oferecem o modelo pela própria API ou por parceiros escolhidos. No Phaseo, você chama os dois tipos do mesmo jeito. A página de um modelo mostra a licença em **Sobre** e lista todos os provedores que o hospedam.`,
			quiz: {
				question:
					"Você pergunta a um modelo sobre algo que aconteceu na semana passada, e ele dá uma resposta desatualizada ou inventada. Por quê?",
				options: [
					"O modelo está com defeito e precisa de outro provedor.",
					"O seu esforço de raciocínio estava baixo demais.",
					"O modelo só sabe o que estava nos dados de treinamento, até a data de corte de conhecimento.",
				],
				answer: 2,
				explanation:
					"Um modelo aprende com textos coletados até uma certa data. Ele não tem como saber de eventos posteriores, a menos que você forneça essa informação, por exemplo no prompt ou com uma ferramenta de busca na web.",
			},
			scenario: {
				prompt:
					"Você usa um modelo de raciocínio para responder perguntas simples de clientes, como o horário de funcionamento. As respostas estão corretas, mas são lentas e custam mais do que você esperava. O que dá para mudar?",
				answer:
					"Perguntas simples raramente precisam de muito raciocínio. Diminua `reasoning.effort` (ou `reasoning_effort`) ou use um modelo que não raciocina. Os tokens de raciocínio contam como saída, então menos raciocínio significa respostas mais rápidas e mais baratas. Deixe o esforço maior para tarefas difíceis.",
			},
			takeaway:
				"Um modelo prevê texto a partir do que aprendeu no treinamento, não sabe nada depois da data de corte, e os modelos de raciocínio trocam tempo e tokens por respostas melhores em problemas difíceis.",
			links: [
				{
					label: "Parâmetros de raciocínio",
					href: "https://phaseo.app/docs/v1/api-reference/parameters#parameter-reasoning",
				},
				{
					label: "Explorar modelos",
					href: "https://phaseo.app/docs/v1/exploring/models",
				},
				{ label: "Modelos", href: "https://phaseo.app/models" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "tokens-and-context",
			title: "Tokens e contexto",
			summary:
				"Os modelos leem e escrevem tokens, e cada token que você envia ou recebe aumenta o tempo e o custo.",
			minutes: 7,
			body: `Os modelos não leem palavras como você. Eles dividem o texto em **tokens**: pedaços curtos de palavras, palavras curtas inteiras, espaços e pontuação. Uma palavra longa pode virar vários tokens. Tudo é contado em tokens, dos limites do que um modelo consegue ler até o preço que você paga.

**A janela de contexto é quanto um modelo consegue ler de uma vez.** Ela inclui tudo o que há em uma solicitação: suas instruções, a conversa até ali, documentos ou resultados de busca, definições de ferramentas e a resposta que o modelo escreve. Cada rota de provedor tem o próprio **tamanho do contexto**, mostrado na página do modelo.

**Os tokens de entrada e de saída são contados separadamente:**

| Tipo | O que inclui |
| --- | --- |
| Entrada | Instruções, suas mensagens, documentos, definições de ferramentas |
| Saída | A resposta, mais o raciocínio de um modelo de raciocínio |

A saída normalmente custa mais por token do que a entrada, porque o modelo precisa escrever cada token de saída um de cada vez. No Phaseo, os preços de texto aparecem em USD por 1 milhão de tokens, com preços separados para entrada e saída. O campo \`usage\` de cada resposta informa quantos tokens ela usou.

**Os limites de saída encerram respostas antes da hora.** Você pode limitar a saída com \`max_tokens\` (Chat Completions e Messages) ou \`max_output_tokens\` (Responses). Isso reduz o custo e o tempo de espera. Mas, se o limite for pequeno demais, a resposta é cortada e termina com \`finish_reason: "length"\`. Isso não é uma falha do modelo: aumente o limite ou diminua o esforço de raciocínio.

**O cache de prompts deixa a entrada repetida mais barata.** Se o início do seu prompt continua igual entre solicitações, como instruções longas ou um documento de referência, o provedor pode lê-lo do cache. Esses tokens são cobrados pela tarifa menor de leitura de cache, e o primeiro token chega mais cedo. A maioria dos provedores guarda em cache os inícios repetidos por conta própria; o Claude só guarda em cache o que você marca com \`cache_control\`.`,
			quiz: {
				question:
					"Uma resposta para no meio de uma frase, e `finish_reason` é `\"length\"`. O que aconteceu?",
				options: [
					"O provedor falhou, então o Phaseo deveria ter tentado outro.",
					"A resposta atingiu o limite de saída e foi cortada.",
					"O prompt era longo demais para a janela de contexto do modelo.",
				],
				answer: 1,
				explanation:
					"`finish_reason: \"length\"` significa que a resposta atingiu o limite de saída (`max_tokens` ou `max_output_tokens`). Aumente o limite ou diminua o esforço de raciocínio, se um modelo de raciocínio o gastou pensando.",
			},
			scenario: {
				prompt:
					"O seu bot de suporte envia o mesmo documento de política de 20 páginas no início de cada solicitação, seguido da pergunta do cliente. A maior parte da sua conta é de tokens de entrada. O que você pode fazer?",
				answer:
					"Mantenha a política no início do prompt, sem alterações, para que o provedor possa guardá-la em cache. A entrada repetida passa a ser cobrada pela tarifa de leitura de cache, e as respostas começam mais cedo. No Claude, marque o fim da política com `cache_control`. Você também pode reduzir o documento às partes que importam.",
			},
			takeaway:
				"Tudo é contado em tokens: entrada e saída têm preços separados por milhão, os limites de saída podem cortar respostas, e o cache deixa a entrada repetida mais barata.",
			links: [
				{
					label: "Contexto e orçamento de tokens",
					href: "https://phaseo.app/docs/v1/guides/context-and-token-budgeting",
				},
				{
					label: "Cache de prompts",
					href: "https://phaseo.app/docs/v1/guides/prompt-caching",
				},
				{
					label: "Preços e faturamento",
					href: "https://phaseo.app/docs/v1/pricing/tiers",
				},
				{
					label: "Glossário",
					href: "https://phaseo.app/docs/v1/glossary",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "check-the-output",
			title: "Confira a saída",
			summary:
				"Os modelos podem parecer seguros e ainda assim estar errados, então baseie as respostas em fontes reais e teste antes de confiar nelas.",
			minutes: 7,
			body: `Um modelo escreve o texto que tem mais chance de vir em seguida. Na maioria das vezes, isso também está correto. Mas, quando não sabe algo, ele ainda pode escrever uma resposta fluente e confiante que está errada. Isso se chama **alucinação**. Fatos, citações, links e números inventados são exemplos comuns.

**Baseie as respostas em dados reais e confira as fontes.** Um modelo é muito mais confiável quando os fatos estão na frente dele. Coloque os seus próprios documentos no prompt e peça que ele responda só com base neles e diga de onde vem cada fato. Para informações atuais, adicione a ferramenta de servidor \`phaseo:web_search\` (em Beta): o modelo pesquisa na web e escreve uma resposta a partir dos resultados, que incluem URLs que você pode abrir. Abra-as mesmo, porque um modelo também pode inventar um link que parece real.

**Garanta um formato confiável com saídas estruturadas.** Se o seu código precisa ler a resposta, envie um JSON Schema com a solicitação. O modelo então retorna JSON nesse formato em vez de texto livre. O seu código ainda deve conferir o resultado antes de usá-lo, porque o formato pode estar certo e o conteúdo, errado.

**Diminua a temperatura para ter consistência.** \`temperature\` controla quanta variação o modelo acrescenta. Valores mais baixos dão respostas mais estáveis e repetíveis. Para extração, classificação e JSON, a documentação sugere de \`0.0\` a \`0.2\`.

**Teste com exemplos reais antes de lançar.** Reúna entradas reais, inclusive as bagunçadas e incomuns, e confira as respostas manualmente. Repita isso sempre que mudar o prompt ou o modelo.`,
			quiz: {
				question:
					"O seu app pergunta a um modelo o ano de fundação de uma empresa, e a resposta precisa estar certa. Qual é a melhor abordagem?",
				options: [
					"Basear a resposta em uma fonte confiável, como resultados de busca na web ou os seus próprios dados, e conferir a fonte.",
					"Definir `temperature` como `0`, o que faz o modelo sempre acertar.",
					"Pedir ao modelo que diga o quanto está confiante e acreditar quando ele diz que tem certeza.",
				],
				answer: 0,
				explanation:
					"Uma temperatura baixa deixa as respostas mais consistentes, não mais corretas, e um modelo pode parecer seguro mesmo errando. Dar a ele uma fonte confiável, e conferir essa fonte, é o que torna a resposta confiável.",
			},
			scenario: {
				prompt:
					"Você criou uma ferramenta que extrai o total, a data e o fornecedor de faturas. Na demonstração funcionou, mas em produção o seu código às vezes quebra porque o modelo responde com uma frase em vez dos campos. O que você muda?",
				answer:
					"Use saídas estruturadas: envie um JSON Schema com os campos de que você precisa, para que o modelo retorne JSON nesse formato. Defina uma `temperature` baixa, como de `0.0` a `0.2`. Valide o JSON no seu código antes de usá-lo e teste com um conjunto de faturas reais, inclusive as bagunçadas, antes de lançar.",
			},
			takeaway:
				"Trate as respostas dos modelos como rascunhos: baseie-as em fontes reais, peça um formato fixo, mantenha a temperatura baixa para ter consistência e teste com exemplos reais.",
			links: [
				{
					label: "Ferramenta de servidor de busca na web",
					href: "https://phaseo.app/docs/v1/guides/server-tools/web-search",
				},
				{
					label: "Saídas estruturadas",
					href: "https://phaseo.app/docs/v1/guides/structured-outputs",
				},
				{
					label: "Parâmetros de inferência",
					href: "https://phaseo.app/docs/v1/guides/inference-parameters",
				},
			],
			updated: "2026-11-17",
		},
	],
};
