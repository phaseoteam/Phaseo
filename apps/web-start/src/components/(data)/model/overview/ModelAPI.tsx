"use client";

import React from "react";
import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";

export default function ModelApiComingSoon() {
	const t = useTranslations("Catalogue.models");
	return (
		<div className="flex flex-col items-center justify-center h-64 text-center">
			<Settings size={36} className="text-muted-foreground mb-4" />
			<h2 className="text-2xl font-bold mb-2">
				{t("apiGatewayComingSoonTitle")}
			</h2>
			<p className="text-muted-foreground">
				{t("phaseoGatewayInProgress")}
				<br />
				{t("stayTuned")}
			</p>
		</div>
	);
}
