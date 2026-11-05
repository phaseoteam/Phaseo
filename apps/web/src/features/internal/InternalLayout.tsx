import { Outlet } from "@tanstack/react-router";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
export { getInternalLayoutMetadata } from "./internalLayoutMetadata";


export default function InternalLayout() {
	return <Outlet />;
}
