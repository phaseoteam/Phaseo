import type { LearnTranslation } from "../../index";
import { adminsCourse } from "./admins";
import { agentsCourse } from "./agents";
import { buildFeaturesCourse } from "./build-features";
import { conceptsCourse } from "./concepts";
import { firstRequestCourse } from "./first-request";
import { foundationsCourse } from "./foundations";
import { routingCourse } from "./routing";

const translation: LearnTranslation = {
	courses: [foundationsCourse, agentsCourse, firstRequestCourse, routingCourse, buildFeaturesCourse, adminsCourse, conceptsCourse],
	paths: {
		developers: { title: "Desenvolvedores de apps", audience: "Para quem chama o Phaseo a partir do próprio código." },
		"agent-users": {
			title: "Usuários de agentes de programação",
			audience: "Para quem desenvolve com Claude Code, Codex, Cursor ou outro agente de programação.",
		},
		admins: { title: "Administradores", audience: "Para quem configura o Phaseo para uma equipe. Sem código." },
	},
};

export default translation;
