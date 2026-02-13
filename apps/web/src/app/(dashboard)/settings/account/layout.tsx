import * as React from "react";

import AccountTopTabs from "@/components/(gateway)/settings/account/AccountTopTabs";

export default function AccountLayout(props: { children: React.ReactNode }) {
	return (
		<div className="space-y-4">
			<AccountTopTabs />
			{props.children}
		</div>
	);
}

