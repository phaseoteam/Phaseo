import NoFooterStyle from "@/components/layout/NoFooterStyle";

export default function ModelsLayout({ children }: LayoutProps<"/models">) {
	return (
		<>
			<NoFooterStyle />
			<div className="flex flex-1 flex-col">
				<div className="flex flex-1 flex-col">
					{children}
				</div>
			</div>
		</>
	);
}
