import type { LearnCourse } from "../../types";

export const foundationsCourse: LearnCourse = {
	slug: "what-is-phaseo",
	title: "O que é o Phaseo?",
	summary:
		"Entenda o que o Phaseo faz, crie sua conta e sua primeira chave de API, conheça as páginas do painel que você mais vai usar e escolha um modelo.",
	level: "beginner",
	format: "Sem código",
	prerequisites: [],
	lessons: [
		{
			slug: "what-phaseo-is",
			title: "O que é o Phaseo",
			summary:
				"O Phaseo é um gateway: uma API e uma chave na frente de muitos modelos e dos provedores que os hospedam.",
			minutes: 6,
			body: `O Phaseo é um gateway de IA. Você envia todas as solicitações para uma única API, \`https://api.phaseo.app/v1\`, com uma única chave. O Phaseo repassa cada solicitação a um provedor que pode atendê-la e cobra o uso do seu espaço de trabalho. Você pode usar o formato da API Responses, Chat Completions ou Messages, o que o seu app já usar.

**Modelos e provedores são coisas diferentes.** Um modelo é o sistema que escreve a resposta. Um provedor hospeda o modelo e define o preço, a velocidade, a disponibilidade e os parâmetros aceitos. Um modelo pode ter vários provedores.

**Um ID de modelo identifica o modelo, não o provedor.** Os IDs têm o formato \`openai/gpt-6-astra\` ou \`anthropic/claude-sonnet-5.5\`: primeiro o laboratório, depois o modelo. \`phaseo/free\` escolhe um modelo gratuito disponível e funciona sem créditos. Se você precisa de um provedor específico, pode colocá-lo na frente do ID, por exemplo \`baseten:thinking-machines/inkling-small\`.

**Como uma solicitação é roteada:**

1. O Phaseo mantém só os provedores que as configurações do seu espaço de trabalho e a solicitação permitem.
2. Ele os classifica. O modo padrão, \`balanced\`, pondera preço, velocidade e confiabilidade.
3. Ele chama o primeiro provedor. Se esse provedor falhar, tenta o próximo.
4. Se todos os provedores falharem com um erro que pode ser repetido e você tiver listado modelos alternativos em \`models\`, ele tenta o próximo modelo.

As alternativas não garantem sucesso, então o seu app ainda deve repetir erros \`429\` e \`5xx\` com backoff. Mais um detalhe: o catálogo público lista alguns modelos que ainda não podem ser chamados. Confira se um modelo está **Ativo no Gateway** antes de usar o ID dele.`,
			quiz: {
				question:
					"Você chama um modelo hospedado por três provedores, e o provedor mais bem classificado retorna um erro. O que o Phaseo faz em seguida?",
				options: [
					"Tenta o próximo provedor elegível para o mesmo modelo.",
					"Retorna o erro na hora, porque você escolheu esse provedor.",
					"Troca para outro modelo escolhido por ele.",
				],
				answer: 0,
				explanation:
					"Quando um provedor falha, o Gateway tenta o próximo provedor elegível para o mesmo modelo. Ele só passa para outro modelo se você tiver listado modelos alternativos em `models` e todos os provedores tiverem falhado com um erro que pode ser repetido.",
			},
			scenario: {
				prompt:
					"Um colega encontrou um modelo na página Modelos do Phaseo e copiou o ID dele para uma solicitação. A solicitação falha, mas a página do modelo parece normal. Qual é o motivo mais provável, e como você confere?",
				answer:
					"O catálogo lista mais modelos do que o Gateway consegue chamar. O modelo pode estar como Em breve ou Inativo. Na página Modelos, o filtro de status do Gateway mostra por padrão os modelos Ativos no Gateway, e `GET /v1/models` retorna só os modelos que você pode chamar. Escolha um modelo que esteja Ativo no Gateway.",
			},
			takeaway:
				"Você escolhe o modelo; o Phaseo escolhe um provedor que o hospeda e recorre a outro quando um falha.",
			links: [
				{
					label: "Como o Phaseo funciona",
					href: "https://phaseo.app/docs/v1/developers/introduction",
				},
				{
					label: "Roteamento e alternativas",
					href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks",
				},
				{
					label: "Explorar modelos",
					href: "https://phaseo.app/docs/v1/exploring/models",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "create-an-account-and-key",
			title: "Crie uma conta e uma chave",
			summary:
				"Cadastre-se, entenda o que pertence a um espaço de trabalho e crie uma chave de API que fique fora do seu código.",
			minutes: 7,
			body: `Cadastre-se em phaseo.app com Google, GitHub, GitLab ou e-mail e senha. Toda conta começa com um espaço de trabalho pessoal, que basta para um projeto pequeno.

**O espaço de trabalho é a unidade dona das coisas.** Ele guarda suas chaves de API, configurações de roteamento, predefinições, guardrails e quem tem acesso de administração. As solicitações pagas usam o saldo de créditos do espaço de trabalho. Depois do seu primeiro depósito de créditos, você pode adicionar mais espaços de trabalho, por exemplo um por produto ou por ambiente. Espaços de trabalho extras não mudam os seus preços.

**Crie uma chave** em **Configurações → Chaves de API** e selecione **Criar chave**. Escolha o espaço de trabalho, dê um nome à chave e escolha uma predefinição:

- **Desenvolvimento**: um limite diário de gastos baixo para apps locais e protótipos.
- **Produção**: sem limites predefinidos. Adicione limites depois, se precisar.
- **CI**: um limite de solicitações para testes, avaliações e tarefas de lançamento.
- **Ambiente de testes**: um limite rigoroso para demonstrações, testes e experimentos compartilhados.

As chaves podem ter limites diários, semanais ou mensais de solicitações e de gastos. Quando um limite é atingido, as solicitações com essa chave retornam \`429\` com \`key_limit_exceeded\`.

**A chave é exibida uma única vez.** Copie-a e guarde-a em uma variável de ambiente:

\`\`\`bash
export PHASEO_API_KEY="phaseo_v1_sk_..."
\`\`\`

Trate-a como uma senha. Leia-a de \`PHASEO_API_KEY\` em código no servidor. Nunca a coloque no seu código, em um repositório, em um navegador ou app móvel, nem em um chat com uma pessoa ou um agente. Use uma chave por app e por ambiente, para poder trocar uma sem quebrar as outras, e exclua as chaves que você não usa mais.`,
			quiz: {
				question: "Onde a sua chave de API do Phaseo deve ficar?",
				options: [
					"Na variável de ambiente PHASEO_API_KEY, lida por código no servidor.",
					"No código do front-end, para o navegador chamar o Phaseo diretamente.",
					"Em uma mensagem de chat para o seu agente de programação, para ele terminar a configuração por você.",
				],
				answer: 0,
				explanation:
					"A documentação diz para manter as chaves em código no servidor e fora de navegadores, apps móveis, repositórios e chats. Qualquer pessoa com a chave pode gastar os créditos do seu espaço de trabalho.",
			},
			scenario: {
				prompt:
					"Você está criando um protótipo que chama um modelo pago em um loop. Você tem medo de que um bug gere uma conta alta durante a noite. O que dá para fazer ao criar a chave?",
				answer:
					"Escolha a predefinição Desenvolvimento ou Ambiente de testes, que definem um limite de gastos baixo, ou defina um limite diário de gastos na chave. Se o loop atingir o limite, as solicitações retornam 429 com key_limit_exceeded em vez de gastar mais. Use uma chave separada para produção.",
			},
			takeaway:
				"O espaço de trabalho é dono das chaves e dos créditos; crie uma chave por app e por ambiente e mantenha-a em PHASEO_API_KEY no servidor.",
			links: [
				{
					label: "Início rápido",
					href: "https://phaseo.app/docs/v1/quickstart",
				},
				{
					label: "Autenticação",
					href: "https://phaseo.app/docs/v1/developers/authentication",
				},
				{
					label: "Espaços de trabalho",
					href: "https://phaseo.app/docs/v1/guides/workspaces",
				},
				{ label: "Chaves de API", href: "/settings/keys" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "find-your-way-around",
			title: "Conheça o painel",
			summary:
				"Conheça as poucas páginas que você vai usar primeiro: modelos, chaves, faturamento, uso, registros e configurações do espaço de trabalho.",
			minutes: 6,
			body: `O painel tem muitas páginas, mas para começar você só precisa de algumas. A barra lateral de configurações as agrupa em **Geral** (sua conta e o faturamento), **Workspace**, **Observabilidade** e **Gateway**. As páginas dos três últimos grupos valem para o espaço de trabalho escolhido no cabeçalho, então confira qual é antes de mudar qualquer coisa.

**Antes de construir:**

- **Modelos** (\`/models\`): navegue pelos modelos, filtre pelo que eles fazem e abra um para ver os provedores, os preços e o desempenho dele. Um modelo com uma rota ativa mostra um início rápido com o ID a enviar. **Comparar** (\`/compare\`) coloca modelos lado a lado.
- **Chaves de API** (\`/settings/keys\`): crie, limite e exclua chaves. **Orçamentos** (\`/settings/budgets\`) limita os gastos do espaço de trabalho inteiro.

**Dinheiro:**

- **Faturamento → Faturamento e créditos** (\`/settings/credits\`): seu saldo, os gastos recentes e onde você compra créditos. As recargas pelo painel começam em $5, e o Phaseo cobra uma taxa de 5% da compra, com mínimo de $1.
- **Faturamento → Transações** (\`/settings/credits/transactions\`) lista cada compra.

**Depois de enviar solicitações:**

- **Uso** (\`/settings/usage/overview\`): como o seu espaço de trabalho está usando o Phaseo, com as páginas Visão geral, Tendências, Explorar e Alertas.
- **Registros** (\`/settings/usage/logs/requests\`): uma linha por solicitação, com uso, latência, custo e erros. É o primeiro lugar a olhar quando algo falha.

**Configurações do espaço de trabalho:** **Configurações** (\`/settings/workspaces/settings\`) para as configurações gerais e os membros do espaço de trabalho, **Privacidade** (\`/settings/privacy\`) para o que fica armazenado e **Roteamento** (\`/settings/routing\`) para a forma padrão de classificar os provedores.`,
			quiz: {
				question:
					"Uma solicitação falhou há uma hora. Onde você vê o custo, a latência e o erro dela?",
				options: [
					"Em Registros, no grupo Observabilidade da barra lateral de configurações.",
					"Em Faturamento → Transações.",
					"Na página Chaves de API.",
				],
				answer: 0,
				explanation:
					"Os registros de solicitações mostram uso, latência, custo e erros de cada solicitação. Transações só lista as compras de créditos, e a página Chaves de API gerencia as chaves.",
			},
			scenario: {
				prompt:
					"Seu saldo de créditos está caindo mais rápido do que você esperava, e você quer descobrir o motivo e evitar que isso aconteça de novo. Quais páginas você abre, e em que ordem?",
				answer:
					"Comece por Uso para ver quando os gastos subiram. Depois abra Registros para ver as solicitações por trás disso: qual modelo, quantos tokens, quanto cada uma custou. Quando souber a causa, defina um limite de gastos na chave em Chaves de API ou um orçamento do espaço de trabalho em Orçamentos.",
			},
			takeaway:
				"Modelos para escolher, Chaves de API para conectar, Faturamento para pagar, e Uso e Registros para ver o que aconteceu.",
			links: [
				{ label: "Modelos", href: "/models" },
				{ label: "Registros de solicitações", href: "/settings/usage/logs/requests" },
				{
					label: "Preços e faturamento",
					href: "https://phaseo.app/docs/v1/pricing/tiers",
				},
				{
					label: "Limites de chave e orçamentos",
					href: "https://phaseo.app/docs/v1/api-reference/limits",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "choose-a-model",
			title: "Escolha um modelo",
			summary:
				"Use a lista de Modelos, as páginas de modelo e o Comparar para encontrar alguns candidatos e teste-os com os seus próprios exemplos antes de decidir.",
			minutes: 8,
			body: `Comece em **Modelos** (\`/models\`). Por padrão, a página mostra só os modelos **Ativos no Gateway**, então tudo o que você vê pode ser chamado. Refine a lista com os filtros de **Endpoints** (como geração de texto ou embeddings), **Modalidades de entrada e saída** (texto, imagem, áudio, vídeo), **Recursos** (como chamadas de ferramentas ou raciocínio) e **Ano**. Com o login feito, **Disponíveis no meu workspace** oculta os modelos que as regras do seu espaço de trabalho bloqueiam. Você pode ordenar por mais recentes, mais populares, preço, tamanho do contexto, throughput ou latência.

**Abra um modelo para ver o que ele oferece.** A página mostra só as seções para as quais há dados:

- **Provedores**: cada rota de provedor com status, tamanho do contexto, preço, disponibilidade, política de dados e parâmetros aceitos.
- **Preços**: cada medidor em USD. Os preços de texto são por 1 milhão de tokens, com entrada e saída listadas separadamente, além da entrada em cache quando o provedor a oferece.
- **Desempenho** e **Disponibilidade**: latência, throughput e disponibilidade medidos no tráfego do Gateway, quando há tráfego suficiente.
- **Benchmarks**, **Sobre** (datas de lançamento, licença, família) e um início rápido com o ID do modelo a enviar.

**Separe dois ou três modelos.** **Comparar** (\`/compare\`) coloca os modelos lado a lado por preço, pontuações em benchmarks, contexto e recursos, e a **Calculadora de preços** (\`/tools/pricing-calculator\`) estima o custo de uma solicitação típica. Benchmarks e gráficos de velocidade são um ponto de partida, não um veredito. Teste os candidatos com exemplos reais do seu trabalho: curtos, típicos e longos. Teste primeiro o candidato mais barato e mais rápido e só passe para um modelo mais caro se as respostas não forem boas o bastante. Para um primeiro teste sem créditos, envie \`phaseo/free\`, que executa a solicitação em um modelo gratuito disponível (até 1.500 solicitações a modelos gratuitos por usuário por dia UTC).

**Os modelos não duram para sempre.** Os laboratórios descontinuam e aposentam modelos à medida que surgem versões mais novas. Um modelo aposentado continua funcionando enquanto algum provedor ainda o servir; depois, as solicitações falham com \`410 model_retired\`. A página do modelo mostra as datas de descontinuação e de aposentadoria e o substituto sugerido. O Phaseo mostra um aviso no seu painel quando um modelo que o seu espaço de trabalho usou nos últimos 90 dias vai ser aposentado em até 90 dias, e **Configurações → Uso → Alertas** lista todos os modelos afetados. Teste o substituto antes de trocar, porque modelos mais novos podem responder ao mesmo prompt de outro jeito.`,
			quiz: {
				question:
					"Dois modelos parecem parecidos na lista de Modelos. Um custa um quarto do preço do outro. O que você deve fazer primeiro?",
				options: [
					"Escolher o mais caro, porque um preço mais alto significa respostas melhores.",
					"Escolher o que tem a maior pontuação em benchmarks, sem testar.",
					"Testar o mais barato com exemplos reais do seu trabalho e só subir se as respostas dele não forem boas o bastante.",
				],
				answer: 2,
				explanation:
					"Preço e pontuação em benchmarks ajudam a separar candidatos, mas não provam como um modelo se sai com os seus prompts. Testar primeiro o modelo mais barato com os seus exemplos mostra se você precisa pagar mais.",
			},
			scenario: {
				prompt:
					"Um aviso no painel diz que um modelo usado pelo seu bot de suporte vai ser aposentado em 30 dias. O que você faz?",
				answer:
					"Abra Configurações → Uso → Alertas para ver o modelo afetado, as datas e o substituto sugerido. Confira na página do substituto o preço, o tamanho do contexto e os parâmetros aceitos, e teste-o com perguntas reais de suporte. Quando estiver satisfeito, troque o ID do modelo no seu app ou na predefinição antes que nenhum provedor sirva mais o modelo antigo e as solicitações comecem a falhar com 410.",
			},
			takeaway:
				"Separe candidatos com o catálogo, decida com os seus próprios exemplos e comece pelo modelo mais barato que dá conta do trabalho.",
			links: [
				{ label: "Modelos", href: "/models" },
				{
					label: "Explorar modelos",
					href: "https://phaseo.app/docs/v1/exploring/models",
				},
				{
					label: "Preços e desempenho",
					href: "https://phaseo.app/docs/v1/exploring/pricing-performance",
				},
				{
					label: "Aposentadoria de modelos",
					href: "https://phaseo.app/docs/v1/guides/model-retirement",
				},
			],
			updated: "2026-11-17",
		},
	],
};
