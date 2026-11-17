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
		developers: { title: "Desarrolladores de aplicaciones", audience: "Para quienes llaman a Phaseo desde su propio código." },
		"agent-users": {
			title: "Usuarios de agentes de programación",
			audience: "Para quienes crean con Claude Code, Codex, Cursor u otro agente de programación.",
		},
		admins: { title: "Administradores", audience: "Para quienes configuran Phaseo para un equipo. Sin código." },
	},
};

export default translation;
