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
		developers: { title: "App-Entwickler", audience: "Für alle, die Phaseo aus ihrem eigenen Code aufrufen." },
		"agent-users": {
			title: "Nutzer von Coding-Agenten",
			audience: "Für alle, die mit Claude Code, Codex, Cursor oder einem anderen Coding-Agenten bauen.",
		},
		admins: { title: "Admins", audience: "Für alle, die Phaseo für ein Team einrichten. Ganz ohne Code." },
	},
};

export default translation;
