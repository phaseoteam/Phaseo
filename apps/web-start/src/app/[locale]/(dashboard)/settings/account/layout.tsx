import * as React from "react";

export default function AccountLayout(props: { children: React.ReactNode }) {
	// Sub-tabs for Account are rendered by the global Settings top tabs.
	return <>{props.children}</>;
}

