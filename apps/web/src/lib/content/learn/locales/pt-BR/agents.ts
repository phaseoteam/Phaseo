import type { LearnCourse } from "../../types";

export const agentsCourse: LearnCourse = {
	slug: "phaseo-in-your-coding-agent",
	title: "Use o Phaseo com o seu agente de programação",
	summary:
		"Dê ao seu agente de programação as skills, a documentação e as ferramentas do Phaseo e deixe que ele ensine o Phaseo a você enquanto constrói o seu projeto.",
	level: "beginner",
	format: "Sem código",
	prerequisites: ["O que é o Phaseo?"],
	lessons: [
		{
			slug: "connect-your-agent",
			title: "Conecte o seu agente",
			summary:
				"Dê ao seu agente as skills e a documentação do Phaseo para ele escrever código correto, dados ao vivo pelo MCP e modelos do Phaseo pela CLI.",
			minutes: 8,
			body: `Agentes de programação como Claude Code, Codex e Cursor podem trabalhar com o Phaseo de três formas diferentes. Escolha as que você precisa.

**1. Ensine o Phaseo ao agente.** As skills de agente são instruções que ajudam o seu agente a escrever código correto para o Phaseo. Elas cobrem o Gateway, os SDKs, as predefinições, o roteamento e as migrações. Instale-as com:

\`\`\`bash
npx skills add https://phaseo.app/docs
\`\`\`

Para que ele leia a documentação atual durante uma sessão, adicione o servidor Docs MCP, \`https://phaseo.app/docs/mcp\`. Ele só lê a documentação e nunca mexe na sua conta.

**2. Dê ao agente dados ao vivo do Phaseo.** O servidor MCP do Phaseo, \`https://mcp.phaseo.app/mcp\`, permite que um agente consulte modelos, preços, provedores, seus créditos, uso e registros de solicitações. Ele é somente leitura e nunca retorna prompts, respostas ou valores secretos. Você faz login com o Phaseo no navegador. No Claude Code:

\`\`\`bash
claude mcp add --transport http phaseo https://mcp.phaseo.app/mcp
\`\`\`

Depois execute \`/mcp\`, selecione \`phaseo\` e escolha **Authenticate**. Se você quiser que o agente também gerencie chaves de API e configurações do espaço de trabalho, conecte com \`https://mcp.phaseo.app/mcp?access=manage\` e desmarque as permissões que você não quer dar.

**3. Rode o agente com modelos do Phaseo.** Instale a CLI do Phaseo com \`npm install -g @phaseo/cli\`, execute \`phaseo login\` e depois o comando do seu agente, como \`phaseo claude-code\` ou \`phaseo codex\`. A CLI aponta o agente para o Phaseo e cria para ele uma chave de API própria, com limite de gastos de $100 por mês e validade de 90 dias. Você aprova a chave no navegador e pode mudar o limite dela em **Configurações → Chaves de API**.

No Claude Code ou no Codex, o plugin do Phaseo instala os dois servidores MCP e as skills de uma vez.`,
			quiz: {
				question:
					"Você conecta o seu agente a https://mcp.phaseo.app/mcp sem ?access=manage. O que ele pode fazer?",
				options: [
					"Ler dados ao vivo do Phaseo, como modelos, preços, créditos e registros de solicitações.",
					"Criar chaves de API e comprar créditos para o seu espaço de trabalho.",
					"Ler os prompts e as respostas guardados nos seus registros de solicitações.",
				],
				answer: 0,
				explanation:
					"A URL simples é somente leitura. Para fazer alterações é preciso a URL de gerenciamento, e mesmo assim o MCP não consegue comprar créditos. As ferramentas dele nunca retornam prompts, respostas ou valores secretos.",
			},
			scenario: {
				prompt:
					"Você usa o Codex. Quer que ele escreva código para o Phaseo seguindo a documentação, e também quer que o próprio Codex rode com modelos pelo Phaseo. O que você configura?",
				answer:
					"Duas coisas separadas. Para o código correto, instale as skills com `npx skills add https://phaseo.app/docs` e adicione o Docs MCP se quiser que ele leia a documentação ao vivo. Para rodar o Codex pelo Phaseo, instale a CLI, execute `phaseo login` e depois `phaseo codex`, que cria uma chave para o Codex com limite de $100 por mês e validade de 90 dias. O plugin do Phaseo para o Codex pode instalar as skills e os dois servidores MCP de uma vez.",
			},
			takeaway:
				"As skills e o Docs MCP ensinam o Phaseo ao seu agente, o MCP do Phaseo dá dados ao vivo a ele, e a CLI o faz rodar com modelos do Phaseo.",
			links: [
				{
					label: "CLI e MCP",
					href: "https://phaseo.app/docs/v1/developers/cli-and-mcp",
				},
				{
					label: "Agentes de programação",
					href: "https://phaseo.app/docs/v1/guides/integrations/coding-assistants",
				},
				{
					label: "Configure agentes de programação com SKILL.md",
					href: "https://phaseo.app/docs/v1/cookbook/coding-agents-skill-md",
				},
				{
					label: "Gerencie o Phaseo a partir de um agente",
					href: "https://phaseo.app/docs/v1/developers/manage-from-an-agent",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "learn-in-your-agent",
			title: "Aprenda o Phaseo no seu agente",
			summary:
				"Transforme o seu agente de programação em um tutor que ensina o Phaseo enquanto constrói algo de que você realmente precisa.",
			minutes: 6,
			body: `\`https://phaseo.app/learn.md\` é um curso escrito para o seu agente de programação. Cole isto no Claude Code, no Codex, no Cursor ou em qualquer agente que consiga buscar URLs:

\`\`\`text
Fetch https://phaseo.app/learn.md and follow it. Teach me Phaseo while we build something I actually need.
\`\`\`

**O que acontece em seguida.** O agente pergunta o que você quer construir, qual é a sua experiência, sua linguagem e seu framework, se há limites como orçamento ou região, e como você vai saber que funciona. Ele registra isso como uma missão e propõe a menor versão que funcione de ponta a ponta. Você aprova o plano antes que ele escreva qualquer código.

**Como cada lição funciona.** O agente escreve o código; você toma as decisões, como qual modelo, qual endpoint e o que fazer quando uma solicitação falha. Ele explica uma ideia por vez, pergunta antes de escrever uma alteração, executa com você e depois faz uma pergunta para conferir se você entendeu antes de seguir. Ele consulta IDs de modelos, preços e limites em vez de adivinhá-los.

**O seu progresso fica salvo** em uma pasta \`.phaseo-learn/\` no seu projeto: o curso em si, sua missão e seu plano, anotações sobre como você gosta de trabalhar, as páginas da documentação usadas e um registro por lição. Comece uma nova sessão com o mesmo prompt, e o agente lê esses arquivos e continua de onde você parou. Ele oferece adicionar a pasta ao \`.gitignore\`; a escolha é sua.

Defina \`PHASEO_API_KEY\` você mesmo antes de começar. O curso diz ao agente para nunca pedir que você cole uma chave no chat.`,
			quiz: {
				question: "Onde o curso guarda o seu progresso entre as sessões?",
				options: [
					"Em uma pasta .phaseo-learn/ no seu projeto.",
					"Na sua conta do Phaseo, em Configurações.",
					"Em lugar nenhum: cada sessão começa do início.",
				],
				answer: 0,
				explanation:
					"O agente salva o curso, sua missão, as anotações, os recursos e os registros das lições em `.phaseo-learn/` e os lê no início de cada sessão.",
			},
			scenario: {
				prompt:
					"No meio de uma sessão, o agente escreve três arquivos seguidos depois que você só disse \"ok\", e cita o preço de um modelo de memória. O que você deve fazer?",
				answer:
					"As duas coisas mostram que o agente se afastou do curso. Peça que ele pare, releia `.phaseo-learn/COURSE.md` e `MISSION.md` e faça a você uma pergunta de verificação sobre a última coisa que construiu. Peça que ele consulte o preço em `GET https://api.phaseo.app/v1/models` ou na página do modelo em vez de citá-lo de memória.",
			},
			takeaway:
				"Um prompt transforma o seu agente em um tutor do Phaseo que constrói o seu projeto com você e salva o seu progresso em .phaseo-learn/.",
			links: [
				{ label: "O curso para o seu agente", href: "https://phaseo.app/learn.md" },
				{
					label: "Início rápido",
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
