"use client";

import { Card, CardContent } from "@/components/ui/card";
import ModelCombobox from "./ModelCombobox";
import type { CompareModelOption } from "./types";
import { useTranslations } from "next-intl";

export default function MainCard({
	selectedOptions,
	selected,
	setSelected,
}: {
	selectedOptions: CompareModelOption[];
	selected: string[];
	setSelected: (ids: string[]) => void;
}) {
	const t = useTranslations("Catalogue.compare");
	return (
		<Card className="w-full max-w-4xl p-8">
			<CardContent>
				<h2 className="text-2xl font-bold mb-4 text-center">
					{t("miniTitle")}
				</h2>
				<div className="flex justify-center mb-4">
					<ModelCombobox
						selectedOptions={selectedOptions}
						selected={selected}
						setSelected={setSelected}
					/>
				</div>
			</CardContent>
		</Card>
	);
}
