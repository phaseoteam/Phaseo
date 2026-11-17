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
		developers: { title: "アプリ開発者", audience: "自分のコードから Phaseo を呼び出す人向けです。" },
		"agent-users": {
			title: "コーディングエージェントのユーザー",
			audience: "Claude Code、Codex、Cursor などのコーディングエージェントで開発する人向けです。",
		},
		admins: { title: "管理者", audience: "チームのために Phaseo を設定する人向けです。コードは不要です。" },
	},
};

export default translation;
