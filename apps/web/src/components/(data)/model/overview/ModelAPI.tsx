"use client";

import React from "react";
import { Settings } from "lucide-react";

export default function ModelApiComingSoon() {
	return (
		<div className="flex flex-col items-center justify-center h-64 text-center">
			<Settings size={36} className="text-muted-foreground mb-4" />
			<h2 className="text-2xl font-bold mb-2">
				API Gateway Information Coming Soon
			</h2>
			<p className="text-muted-foreground">
				We&apos;re working on getting the AI Stats Gateway up and running.
				<br />
				Stay tuned for updates!
			</p>
		</div>
	);
}
