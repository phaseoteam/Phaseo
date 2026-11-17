import type { LearnCourse } from "../../types";

const DOCS = "https://phaseo.app/docs/v1";

export const adminsCourse: LearnCourse = {
	slug: "set-up-your-team",
	title: "Configure o Phaseo para a sua equipe",
	summary:
		"Traga a sua equipe para um espaço de trabalho, distribua chaves com segurança, limite os gastos, defina guardrails e roteamento e veja como a IA está sendo usada. Sem código.",
	level: "admin",
	format: "Sem código",
	prerequisites: ["O que é o Phaseo?"],
	lessons: [
		{
			slug: "workspaces-and-members",
			title: "Espaços de trabalho e membros",
			summary:
				"Use espaços de trabalho para separar equipes, convide pessoas com um código e dê a cada uma a função certa.",
			minutes: 7,
			body: `Um espaço de trabalho tem as próprias chaves de API, configurações de roteamento, predefinições, guardrails e acesso de administração. Toda conta começa com um espaço de trabalho pessoal. Crie outros para cada equipe, produto ou ambiente, por exemplo para manter as chaves de produção longe do desenvolvimento. Os espaços de trabalho extras são liberados depois do seu primeiro depósito de créditos e não mudam os seus preços.

Cada pessoa em um espaço de trabalho tem uma de três funções:

- **Proprietário**: a pessoa dona do espaço de trabalho. Só o proprietário pode tornar alguém administrador, mudar funções ou remover outros membros. O proprietário não pode ser removido.
- **Administrador**: gerencia as configurações exclusivas de administradores, como chaves de API, orçamentos, regras de gastos e guardrails, e lê o registro de auditoria.
- **Membro**: usa o espaço de trabalho e pode ver as regras de gastos dele, mas não pode alterar as configurações exclusivas de proprietários e administradores.

Para convidar alguém, abra **Configurações → Membros** e selecione **Criar convite**. Escolha a função (Administrador ou Membro), por quantos dias o convite vale e, se quiser, um número máximo de usos. Você recebe um código para compartilhar. A outra pessoa abre **Configurações → Espaços de trabalho**, escolhe **Tem um código de convite?** e o digita. Isso envia uma solicitação de entrada, que um proprietário ou administrador aprova em **Solicitações de entrada**. Só o proprietário pode aprovar alguém como administrador.

Alterne entre espaços de trabalho com o seletor no cabeçalho. Tudo o que você vê em Configurações, das chaves ao uso, pertence ao espaço de trabalho aberto. O seu espaço de trabalho pessoal não pode ser renomeado nem excluído.`,
			quiz: {
				question: "Um administrador quer trazer um novo colega como mais um administrador. O que acontece?",
				options: [
					"O administrador cria um convite com a função Administrador e aprova a solicitação de entrada.",
					"Só o proprietário do espaço de trabalho pode convidar ou aprovar alguém como administrador.",
					"Administradores não podem ser convidados; toda pessoa nova entra como proprietária.",
				],
				answer: 1,
				explanation:
					"Tornar alguém administrador é decisão do proprietário. Um administrador pode convidar membros, mas um convite com a função Administrador, a aprovação dele e as mudanças de função posteriores precisam do proprietário do espaço de trabalho.",
			},
			scenario: {
				prompt:
					"Um prestador de serviços terminou o projeto, e você quer tirá-lo do espaço de trabalho. Foi ele quem criou a chave de API que o seu bot de suporte ainda usa. O que você deve conferir primeiro?",
				answer:
					"Remover um membro também revoga as chaves de API que ele criou naquele espaço de trabalho, então o bot de suporte pararia de funcionar. Primeiro crie você mesmo uma chave substituta (ou rotacione a dele para uma chave nova), passe o bot para ela e depois peça ao proprietário que remova o prestador em Configurações → Membros.",
			},
			takeaway:
				"Dê a cada equipe ou ambiente o próprio espaço de trabalho e reserve a função Administrador para as poucas pessoas que gerenciam chaves, orçamentos e guardrails.",
			links: [
				{ label: "Guia de espaços de trabalho", href: `${DOCS}/guides/workspaces` },
				{ label: "Membros", href: "/settings/workspaces/members" },
				{ label: "Seus espaços de trabalho", href: "/settings/account/workspaces" },
				{ label: "Glossário: funções", href: `${DOCS}/glossary` },
			],
			updated: "2026-11-17",
		},
		{
			slug: "keys-for-a-team",
			title: "Chaves de API para uma equipe",
			summary:
				"Dê a cada app e ambiente a própria chave com limites, use chaves de gerenciamento para automação e rotacione chaves sem interrupção.",
			minutes: 8,
			body: `Proprietários e administradores criam chaves de API em **Configurações → Chaves de API**. Use **uma chave por app e por ambiente**, não uma chave compartilhada por todos. Assim você vê o uso de cada chave, define limites para ela e a substitui sem mexer em mais nada. O segredo é exibido uma única vez, então ele vai direto para o seu gerenciador de segredos.

Toda chave pode ter limites diários, semanais ou mensais de solicitações e de gastos. Eles são verificados a cada solicitação e reiniciam à meia-noite UTC, na segunda-feira ou no dia 1º do mês. Quando um limite é atingido, as solicitações com essa chave são recusadas até o período reiniciar. **Segurança das chaves** lista as chaves que poderiam causar danos se vazassem: sem limite de gastos, sem validade, sem uso há 90 dias ou mais, ou utilizáveis de qualquer endereço IP.

Para automação, como um script que cria chaves ou lê o uso, use uma **chave de gerenciamento** de **Configurações → Chaves de gerenciamento**. Chaves de gerenciamento não podem enviar solicitações a modelos. Escolha um modelo: **Leitura**, **Escrita** (sem exclusão) ou **Todos**, ou escolha só os recursos de que você precisa. Uma chave de gerenciamento nunca pode fazer mais do que a função da pessoa por trás dela permite.

Para substituir uma chave, selecione **Rotacionar**. O Phaseo cria uma substituta com os mesmos limites e deixa você escolher quando a chave atual expira: imediatamente, em 1 hora, 24 horas ou 7 dias, em um horário que você escolher, ou nunca. Passe os seus apps para a chave nova antes que a antiga expire. Você também pode pausar uma chave e retomá-la depois, ou excluí-la de vez. Uma chave revogada não pode ser reativada.`,
			quiz: {
				question: "A sua equipe quer um script noturno que cria e exclui chaves de API. Qual credencial ele deve usar?",
				options: [
					"Uma chave de API normal com um limite de gastos alto.",
					"Uma chave de gerenciamento só com os recursos de chaves de que ele precisa.",
					"Uma chave de gerenciamento com o modelo Todos, para nunca falhar.",
				],
				answer: 1,
				explanation:
					"Só chaves de gerenciamento podem chamar as APIs de administração; chaves de API normais não podem. Dê a ela o menor conjunto de recursos que funcione e reserve Todos para automações de administração confiáveis.",
			},
			scenario: {
				prompt:
					"Um desenvolvedor conta que a chave de API de produção foi enviada para um repositório público há uma hora. O que você faz?",
				answer:
					"Rotacione a chave na hora e escolha expirar a chave atual imediatamente. Coloque o novo segredo no seu gerenciador de segredos e atualize o app. Depois confira as solicitações da chave em Configurações → Registros em busca de algo que você não reconheça. Primeiro rotacione, depois investigue.",
			},
			takeaway:
				"Uma chave por app e por ambiente, cada uma com limite de gastos, deixa os vazamentos pequenos e a rotação tranquila.",
			links: [
				{ label: "Autenticação e chaves", href: `${DOCS}/developers/authentication` },
				{ label: "Chaves da API de gerenciamento", href: `${DOCS}/developers/management-api-keys` },
				{ label: "Chaves de API", href: "/settings/keys" },
				{ label: "Segurança das chaves", href: "/settings/security" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "bring-your-own-keys",
			title: "Traga suas próprias chaves de provedor",
			summary:
				"Adicione as chaves das suas próprias contas de provedor para o Phaseo rotear as solicitações com elas e decida quando as chaves de provedor do próprio Phaseo podem assumir.",
			minutes: 8,
			body: `Com **traga sua própria chave (BYOK)**, você dá ao Phaseo uma chave de API da sua própria conta em um provedor. O Phaseo continua roteando e registrando a solicitação, mas chama o provedor com a sua chave, e **o seu provedor cobra o uso do modelo** diretamente. Valem as cotas, os limites de taxa, a política de dados e o acesso a modelos da sua conta no provedor, não a capacidade compartilhada do Phaseo.

Proprietários e administradores adicionam chaves em **Configurações → Traga sua própria chave**. Escolha o provedor, selecione **Configurar chave do provedor** e cole a chave. O Phaseo a criptografa (AES-256-GCM), vincula-a ao espaço de trabalho e ao provedor e nunca mais a exibe. Restrinja cada chave aos modelos e às chaves de API que precisam dela, em vez de deixá-la disponível para todos, e use **Testar** para experimentá-la no Chat. Toda alteração em uma chave de provedor fica registrada no registro de auditoria do espaço de trabalho.

Cada chave de provedor é de um de dois tipos, e você pode arrastar as chaves para mudar a ordem:

- **Prioritário**: o Phaseo tenta estas primeiro, de cima para baixo.
- **Alternativa**: estas só assumem quando a rota do próprio Phaseo não consegue concluir a solicitação.

Se uma chave prioritária falhar, a configuração **Alternativa de BYOK** do espaço de trabalho decide se a solicitação pode ser repetida com as chaves de provedor do próprio Phaseo, pagas com os seus créditos. Ela vem ativada por padrão. Desative-a se o uso só puder passar pelas suas próprias contas de provedor. Os trabalhos em lote usam hoje as chaves do Phaseo, não as suas.

**O que o Phaseo cobra:** nenhuma taxa de serviço nas primeiras 250.000 solicitações BYOK concluídas por espaço de trabalho em cada mês UTC; depois, 2,5% do que a solicitação custaria pelos preços do provedor. A taxa sai dos seus créditos, então mantenha pelo menos $1 disponível, o que também cobre qualquer alternativa com as chaves do Phaseo. A página mostra as solicitações BYOK deste mês e quantas ainda estão isentas da taxa.`,
			quiz: {
				question:
					"O seu espaço de trabalho tem uma chave prioritária da OpenAI, e a Alternativa de BYOK está desativada. O provedor rejeita uma solicitação feita com a sua chave. O que acontece?",
				options: [
					"O Phaseo repete a solicitação com as próprias chaves de provedor e cobra dos seus créditos.",
					"O Phaseo cobra uma taxa de 2,5% e repete com a mesma chave.",
					"A solicitação não é repetida com as chaves do Phaseo, porque a alternativa está desativada.",
				],
				answer: 2,
				explanation:
					"A Alternativa de BYOK decide se uma solicitação que falhou em uma chave prioritária pode ser repetida com as chaves de provedor do próprio Phaseo. Com ela desativada, o uso só passa pelas suas próprias contas de provedor.",
			},
			scenario: {
				prompt:
					"A sua empresa já tem um contrato de gasto mínimo com um provedor, e o financeiro quer que esse uso seja cobrado lá, não nos créditos do Phaseo. A sua equipe envia cerca de 400.000 solicitações por mês. Como você configura isso, e o que o Phaseo ainda vai cobrar?",
				answer:
					"Adicione a chave do provedor como chave prioritária em Configurações → Traga sua própria chave, restrita aos modelos e às chaves de API que devem usá-la. Desative a Alternativa de BYOK se nenhum uso puder passar pelas chaves do Phaseo. O provedor cobra o uso do modelo. O Phaseo não cobra nada pelas primeiras 250.000 solicitações BYOK concluídas no mês e depois cobra 2,5% do custo equivalente no provedor para o restante, pago com créditos, então mantenha um saldo pequeno.",
			},
			takeaway:
				"O BYOK envia as solicitações pelas suas próprias contas de provedor; a configuração de alternativa decide se as chaves do Phaseo podem entrar quando as suas falham.",
			links: [
				{ label: "Considerações sobre BYOK", href: `${DOCS}/guides/routing-and-fallbacks#byok-considerations` },
				{ label: "Planos e taxas de BYOK", href: `${DOCS}/exploring/subscription-plans` },
				{ label: "Traga sua própria chave", href: "/settings/byok" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "budgets-and-spend-rules",
			title: "Orçamentos e regras de gastos",
			summary:
				"Use créditos, orçamentos e limites de chave como tetos rígidos e regras de gastos como avisos antecipados.",
			minutes: 9,
			body: `Os modelos pagos são pagos com o saldo de créditos do seu espaço de trabalho. Você o recarrega em **Configurações → Faturamento e créditos**, que também tem um e-mail simples de saldo baixo. Os modelos gratuitos não precisam de créditos.

O Phaseo tem dois tipos de teto rígido. Os dois são verificados a cada solicitação, então os gastos não conseguem passar deles:

- **Orçamentos do espaço de trabalho** em **Configurações → Orçamentos**: um limite diário, semanal, mensal ou total para o espaço de trabalho inteiro. A página mostra os gastos até agora, a parte já usada e uma projeção.
- **Limites de chave**: limites de solicitações e de gastos em uma chave de API.

As **regras de gastos** avisam você antes de chegar a um teto. Abra **Configurações → Notificações → Alertas de gastos** e selecione **Adicionar alerta**. Uma regra define de quem são os gastos que contam (o espaço de trabalho, uma chave, um membro, um departamento, um modelo ou um provedor), um período e os limites. Ela pode alertar sobre os gastos, sobre uma parte de um orçamento, sobre uma previsão para o período, sobre um pico repentino ou sobre saldo baixo. Os membros podem ver as regras; proprietários e administradores as criam e alteram.

Uma regra também pode bloquear solicitações quando os gastos passam de um limite. O bloqueio é feito no melhor esforço: as regras rodam sobre o uso registrado alguns minutos depois que as solicitações terminam, então os gastos podem passar um pouco do limite antes. Use orçamentos e limites de chave para tetos exatos, e regras de bloqueio para escopos mais amplos, como um membro. Os alertas de gastos e o bloqueio ainda estão sendo liberados; até serem ativados para você, as regras são salvas, mas não rodam.

Para limitar a velocidade com que alguém envia solicitações, e não quanto gasta, use **Configurações → Limites de taxa**. Uma política pode definir solicitações por minuto, tokens por minuto ou solicitações simultâneas para uma chave, um membro, um departamento ou cada um dos seus usuários finais. Os guardrails nunca limitam gastos.`,
			quiz: {
				question: "Você precisa de um teto mensal para o espaço de trabalho inteiro, verificado a cada solicitação. O que você usa?",
				options: [
					"Um orçamento mensal do espaço de trabalho.",
					"Uma regra de gastos com a ação de bloqueio.",
					"Um guardrail com limite de gastos.",
				],
				answer: 0,
				explanation:
					"Os orçamentos do espaço de trabalho e os limites de chave são verificados a cada solicitação. Uma regra de gastos com bloqueio começa a agir alguns minutos depois que o limite é ultrapassado, e os guardrails não têm nenhum limite de gastos.",
			},
			scenario: {
				prompt:
					"Uma pessoa nova na equipe está fazendo testes com modelos grandes. Você quer um aviso quando os gastos mensais dela chegarem a $200 e que as solicitações dela parem se chegarem a $250. Como você configura isso?",
				answer:
					"Adicione uma regra de gastos restrita a esse membro, com período mensal, um limite de alerta de $200 e a ação de bloqueio em $250. Lembre-se de que o bloqueio começa alguns minutos atrasado. Se você precisa de um teto exato, defina também um limite mensal de gastos nas chaves que a pessoa usa.",
			},
			takeaway:
				"Orçamentos e limites de chave são as suas paradas obrigatórias; as regras de gastos são o aviso antecipado na frente delas.",
			links: [
				{ label: "Guia de alertas de gastos", href: `${DOCS}/guides/spend-alerts` },
				{ label: "Limites de chave e orçamentos", href: `${DOCS}/api-reference/limits` },
				{ label: "Orçamentos", href: "/settings/budgets" },
				{ label: "Notificações", href: "/settings/notifications" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "guardrails",
			title: "Guardrails",
			summary:
				"Controle quais provedores e modelos as chaves podem acessar, como os dados são tratados e o que é sinalizado, ocultado ou bloqueado.",
			minutes: 9,
			body: `Um guardrail é um conjunto de regras para o tráfego da API. Crie um em **Configurações → Guardrails → Novo guardrail**. Dê a ele um nome que diga o que ele impõe, como "eu-models-pii-redact", para poder reutilizá-lo em várias chaves. Um guardrail pode definir:

- **Modo de provedores**: permitir todos os provedores, só os selecionados ou todos menos os selecionados.
- **Modo de modelos**: permitir todos os modelos ou só os selecionados.
- **Tratamento de dados**: só zero retenção de dados (ZDR) e se endpoints que podem treinar com as entradas continuam elegíveis.
- Verificações de **Injeção de prompt** e de **Informações sensíveis**, como endereços de e-mail, números de telefone ou números de cartão. Cada verificação pode **Sinalizar**, **Ocultar** ou **Bloquear**.

Use a prévia para testar uma entrada inofensiva, uma que deveria ser barrada e um prompt real antes de salvar. Depois associe o guardrail em **Aplicar para chaves**, ou em **Aplicar para membros** para cobrir todas as chaves que esses membros criarem. Os membros não podem editar nem remover um guardrail que um proprietário ou administrador atribuiu a eles.

As regras em **Configurações → Privacidade** valem para todas as solicitações do espaço de trabalho, e um guardrail só pode restringi-las. Quando vários guardrails se aplicam à mesma chave, por exemplo um na chave e outro em quem a criou, todos contam e o resultado mais rígido prevalece. Um modelo precisa ser permitido por todos os guardrails, os provedores bloqueados se somam, ZDR é exigido se qualquer guardrail exigir, e a ação mais forte (Bloquear acima de Ocultar acima de Sinalizar) é a usada.

Comece pequeno: associe um guardrail novo a uma chave de baixo risco e confira **Configurações → Uso → Atividade de guardrails** e os registros de solicitações antes de ampliá-lo. Um guardrail desativado mantém as configurações, mas não é aplicado. Os guardrails não limitam gastos; para isso, use orçamentos e limites de chave.`,
			quiz: {
				question:
					"O guardrail da própria chave permite os modelos A e B. O guardrail de membro de quem a criou permite só o modelo B. Quais modelos a chave pode usar?",
				options: ["A e B", "Só B", "Nenhum, porque os guardrails entram em conflito"],
				answer: 1,
				explanation:
					"Todos os guardrails que se aplicam a uma chave contam, e o mais rígido prevalece. Um modelo precisa ser permitido por todos eles, então só sobra o B.",
			},
			scenario: {
				prompt:
					"A sua equipe jurídica quer que endereços de e-mail e números de telefone sejam removidos dos prompts e que só sejam usados provedores com zero retenção de dados. Você não quer quebrar o bot de suporte durante a implantação. Qual é o seu plano?",
				answer:
					"Crie um guardrail com só ZDR e Informações sensíveis em Ocultar para e-mail e telefone. Teste-o na prévia com um prompt inofensivo, um sensível e um real. Associe-o primeiro a uma chave de staging ou de baixo risco, confira Atividade de guardrails e os registros e depois associe-o à chave do bot de suporte e às outras chaves que precisam dele.",
			},
			takeaway:
				"Os guardrails se acumulam: todos os que se aplicam contam, então crie políticas pequenas e com nomes claros e aplique-as uma chave de cada vez.",
			links: [
				{ label: "Implante guardrails", href: `${DOCS}/cookbook/guardrails-for-api-keys` },
				{ label: "Visão geral da API de guardrails", href: `${DOCS}/api-reference/endpoint/guardrails` },
				{ label: "Guardrails", href: "/settings/guardrails" },
				{ label: "Privacidade", href: "/settings/privacy" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "routing-defaults-and-auto-routing",
			title: "Padrões de roteamento, predefinições e Roteamento automático",
			summary:
				"Defina como o seu espaço de trabalho escolhe provedores, compartilhe configurações com predefinições e deixe o Roteamento automático escolher o modelo.",
			minutes: 8,
			body: `A maioria dos modelos é servida por vários provedores. Em **Configurações → Roteamento**, você escolhe como o seu espaço de trabalho os classifica por padrão: **Equilibrado** (o padrão, custo por resposta bem-sucedida), **Preço**, **Latência** ou **Taxa de transferência**. Uma solicitação individual pode pedir outro modo, mas as suas listas de permissão, guardrails e tetos de preço continuam valendo. A mesma página tem opções para provedores beta e alfa, para que provedores em prévia só recebam tráfego se você aceitar.

Uma **predefinição** salva o modelo, o prompt de sistema, os parâmetros e as regras de provedor de uma tarefa sob um nome como "@support-triage". Crie predefinições em **Configurações → Predefinições**. Os apps enviam o nome da predefinição em vez de um modelo, então você pode mudar o modelo ou o prompt em um só lugar, sem reimplantar. Cada **Publicar nova versão** mantém as anteriores. Aponte um rótulo como "production" para uma versão e mova-o de volta para desfazer.

O **Roteamento automático** deixa o Phaseo escolher o modelo de cada solicitação quando um app envia "phaseo/auto". Ele está em [Alfa](https://phaseo.app/docs/v1/developers/feature-maturity) e é ativado por espaço de trabalho, sob solicitação. Em **Configurações → Roteamento → Roteamento automático**, você escolhe:

- um **objetivo**: equilibrado, qualidade, custo ou latência;
- um **perfil de gastos**: um teto de preço rígido (Econômico, Padrão, Premium, Qualquer preço ou Personalizado). Modelos acima dele nunca são considerados;
- padrões de modelo opcionais para restringir a escolha e se deve recorrer ao próximo modelo em caso de erro.

As solicitações não podem mudar essas configurações, e todo candidato continua passando pelas suas regras de privacidade e guardrails. Confira a combinação de modelos com o seu próprio trabalho, porque as configurações decidem quais modelos são elegíveis, não quão boas são as respostas.`,
			quiz: {
				question: "O seu espaço de trabalho usa o Roteamento automático com o perfil de gastos Econômico. O que esse perfil faz?",
				options: [
					"Define um teto de preço rígido, então modelos acima dele nunca são considerados.",
					"É uma preferência que uma solicitação pode substituir com o próprio objetivo.",
					"Faz o Roteamento automático pular os guardrails para ganhar tempo.",
				],
				answer: 0,
				explanation:
					"Os perfis de gastos são tetos rígidos sobre os preços padrão de texto. As solicitações não podem mudar o objetivo, o perfil de gastos nem os padrões do espaço de trabalho, e todo candidato continua passando pelos seus guardrails.",
			},
			scenario: {
				prompt:
					"Três apps usam o mesmo modelo e o mesmo prompt de sistema para triagem de tickets. Você quer testar um modelo mais novo sem pedir que cada equipe reimplante, e desfazer rápido se as respostas piorarem. O que você configura?",
				answer:
					"Crie uma predefinição, por exemplo @support-triage, e faça os apps a chamarem pelo nome. Publique uma nova versão com o modelo mais novo e mova o rótulo production para ela. Se as respostas piorarem, mova o rótulo de volta para a versão anterior.",
			},
			takeaway:
				"Defina padrões sensatos para o espaço de trabalho, compartilhe configurações com predefinições e trate o Roteamento automático como um recurso Alfa que você testa com o seu próprio trabalho.",
			links: [
				{ label: "Roteamento e alternativas", href: `${DOCS}/guides/routing-and-fallbacks` },
				{ label: "Guia de predefinições", href: `${DOCS}/guides/presets` },
				{ label: "Guia de roteamento automático", href: `${DOCS}/guides/auto-routing` },
				{ label: "Configurações de roteamento", href: "/settings/routing" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "see-how-ai-is-used",
			title: "Veja como a IA é usada",
			summary:
				"Use as páginas de uso, os registros, os rótulos de solicitação, os classificadores e o registro de auditoria para ver quem gasta o quê e quem mudou o quê.",
			minutes: 7,
			body: `**Configurações → Uso** mostra os gastos e o tráfego do espaço de trabalho aberto, com as páginas Visão geral, Tendências, Explorar, Geografia, Atividade de guardrails e Alertas. **Configurações → Registros** lista cada solicitação, com o modelo e o provedor que a atenderam, além de sessões, vídeos, lotes e sessões em tempo real.

Para dividir os gastos por equipe, recurso ou ambiente, peça aos seus desenvolvedores que adicionem **rótulos de solicitação**, como team=support, às solicitações. Depois você pode filtrar os registros e o uso por esses rótulos. Os rótulos não são enviados aos provedores. Não coloque prompts, segredos nem dados pessoais neles.

Se os seus apps não sabem a categoria, um **classificador de solicitações** pode adicionar rótulos por você. Você descreve as categorias, como departamento ou tipo de tarefa, e escolhe um modelo que rotula cada solicitação concluída. Ele nunca deixa a solicitação mais lenta, e você pode definir uma taxa de amostragem e um orçamento mensal. Proprietários e administradores gerenciam os classificadores em **Configurações → Classificadores**. Os classificadores estão em **Beta** e são ativados por espaço de trabalho, sob solicitação; todo o resto desta lição está em disponibilidade geral. Veja [fases dos recursos](https://phaseo.app/docs/v1/developers/feature-maturity) para entender o que isso significa.

Os registros mostram o tráfego que rodou. O **registro de auditoria** mostra quem mudou os controles em volta dele. Abra **Configurações → Atividade** para ver quem criou, rotacionou ou excluiu uma chave, mudou a função de um membro, editou um guardrail, publicou uma versão de predefinição ou suspendeu um bloqueio de gastos, e quando. Só proprietários e administradores podem lê-lo. Ele nunca guarda segredos nem corpos de solicitação.`,
			quiz: {
				question: "O limite de gastos de uma chave foi aumentado durante a noite, e ninguém se lembra de ter feito isso. Onde você procura?",
				options: [
					"Em Configurações → Registros, filtrado por essa chave.",
					"Em Configurações → Uso → Tendências.",
					"Em Configurações → Atividade, o registro de auditoria do espaço de trabalho.",
				],
				answer: 2,
				explanation:
					"Os registros e o uso mostram as solicitações que rodaram. As mudanças em chaves, membros, guardrails e outros controles ficam no registro de auditoria, com quem as fez e quando.",
			},
			scenario: {
				prompt:
					"O financeiro quer uma divisão mensal dos gastos com IA por departamento. Os seus apps não enviam nenhum rótulo, e os desenvolvedores estão ocupados por semanas. O que você pode fazer?",
				answer:
					"Peça a ativação dos classificadores de solicitações (eles estão em Beta) e crie um com uma dimensão de departamento, uma taxa de amostragem e um orçamento mensal. As respostas dele são guardadas como rótulos de solicitação, então você pode filtrar o uso por departamento. Quando os desenvolvedores tiverem tempo, eles podem adicionar os próprios rótulos para uma atribuição exata.",
			},
			takeaway:
				"Os rótulos e os classificadores explicam para onde vão os gastos; o registro de auditoria explica quem mudou o quê.",
			links: [
				{ label: "Rótulos de solicitação", href: `${DOCS}/guides/request-labels` },
				{ label: "Classificadores de solicitações", href: `${DOCS}/guides/request-classifiers` },
				{ label: "Registro de auditoria do espaço de trabalho", href: `${DOCS}/guides/workspace-audit-log` },
				{ label: "Uso", href: "/settings/usage/overview" },
			],
			updated: "2026-11-17",
		},
	],
};
