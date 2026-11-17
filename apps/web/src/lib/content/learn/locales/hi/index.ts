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
		developers: { title: "ऐप डेवलपर", audience: "उन लोगों के लिए जो अपने कोड से Phaseo को कॉल करते हैं।" },
		"agent-users": {
			title: "कोडिंग एजेंट उपयोगकर्ता",
			audience: "उन लोगों के लिए जो Claude Code, Codex, Cursor या किसी दूसरे कोडिंग एजेंट के साथ बनाते हैं।",
		},
		admins: { title: "एडमिन", audience: "उन लोगों के लिए जो टीम के लिए Phaseo सेट अप करते हैं। कोड की ज़रूरत नहीं।" },
	},
};

export default translation;
