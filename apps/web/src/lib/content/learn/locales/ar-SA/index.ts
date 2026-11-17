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
		developers: { title: "مطوّرو التطبيقات", audience: "لمن يستدعي Phaseo من كوده الخاص." },
		"agent-users": {
			title: "مستخدمو وكلاء البرمجة",
			audience: "لمن يبني باستخدام Claude Code أو Codex أو Cursor أو أي وكيل برمجة آخر.",
		},
		admins: { title: "المسؤولون", audience: "لمن يُعدّ Phaseo لفريق. دون الحاجة إلى كود." },
	},
};

export default translation;
