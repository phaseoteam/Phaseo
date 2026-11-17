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
		developers: { title: "Développeurs d’applications", audience: "Pour les personnes qui appellent Phaseo depuis leur propre code." },
		"agent-users": {
			title: "Utilisateurs d’agents de programmation",
			audience: "Pour les personnes qui développent avec Claude Code, Codex, Cursor ou un autre agent de programmation.",
		},
		admins: { title: "Administrateurs", audience: "Pour les personnes qui configurent Phaseo pour une équipe. Sans code." },
	},
};

export default translation;
