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
		developers: { title: "应用开发者", audience: "适合在自己的代码中调用 Phaseo 的人。" },
		"agent-users": { title: "编程智能体用户", audience: "适合使用 Claude Code、Codex、Cursor 或其他编程智能体进行开发的人。" },
		admins: { title: "管理员", audience: "适合为团队设置 Phaseo 的人。无需代码。" },
	},
};

export default translation;
