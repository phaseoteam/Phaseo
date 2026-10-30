import CatalogNotFoundState from "@/components/(data)/CatalogNotFoundState";

interface ModelNotFoundStateProps {
	modelId?: string;
}

export default function ModelNotFoundState({ modelId }: ModelNotFoundStateProps) {
	return <CatalogNotFoundState resourceType="model" resourceId={modelId} />;
}
