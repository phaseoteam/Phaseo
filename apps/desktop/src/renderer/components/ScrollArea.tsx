import { ScrollArea as Primitive } from "@base-ui/react/scroll-area";
import type { ReactNode, Ref, ComponentPropsWithoutRef } from "react";

// Same Base UI structure as the website's shadcn ScrollArea.
export function ScrollArea({ children, className = "", viewportClassName = "", viewportRef, viewportProps }: { children: ReactNode; className?: string; viewportClassName?: string; viewportRef?: Ref<HTMLDivElement>; viewportProps?: Omit<ComponentPropsWithoutRef<"div">, "children" | "className"> }) {
	return <Primitive.Root data-slot="scroll-area" className={`desktop-scroll-area ${className}`}>
		<Primitive.Viewport {...viewportProps} ref={viewportRef} data-slot="scroll-area-viewport" className={`desktop-scroll-viewport ${viewportClassName}`}>{children}</Primitive.Viewport>
		<Primitive.Scrollbar data-slot="scroll-area-scrollbar" orientation="vertical" className="desktop-scrollbar"><Primitive.Thumb data-slot="scroll-area-thumb" className="desktop-scroll-thumb" /></Primitive.Scrollbar>
		<Primitive.Corner />
	</Primitive.Root>;
}
