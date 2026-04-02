export type SpawnAgentId = "builder" | "research" | "ops";

export type SpawnCloudId = "aws" | "gcp" | "azure";

export type SpawnSizeId = "small" | "medium" | "large";

export type SpawnAgentManifestEntry = {
	id: SpawnAgentId;
	label: string;
	description: string;
	supportedClouds: SpawnCloudId[];
};

export type SpawnCloudManifestEntry = {
	id: SpawnCloudId;
	label: string;
	description: string;
};

export type SpawnSizeManifestEntry = {
	id: SpawnSizeId;
	label: string;
	description: string;
};

export type SpawnMatrixEntry = {
	agentId: SpawnAgentId;
	cloudId: SpawnCloudId;
	models: string[];
	regions: string[];
	sizes: SpawnSizeManifestEntry[];
	defaults: {
		model: string;
		region: string;
		size: SpawnSizeId;
	};
};

export type SpawnManifest = {
	cliBinary: string;
	runWithoutInstallScriptUrl: string;
	defaultAgentId: SpawnAgentId;
	defaultCloudId: SpawnCloudId;
	agents: SpawnAgentManifestEntry[];
	clouds: SpawnCloudManifestEntry[];
	matrix: SpawnMatrixEntry[];
};

export const SPAWN_MANIFEST: SpawnManifest = {
	cliBinary: "spawn",
	runWithoutInstallScriptUrl:
		"https://raw.githubusercontent.com/AI-Stats/AI-Stats/main/scripts/spawn/bootstrap.sh",
	defaultAgentId: "builder",
	defaultCloudId: "aws",
	agents: [
		{
			id: "builder",
			label: "Builder Agent",
			description: "General software and product implementation workloads.",
			supportedClouds: ["aws", "gcp", "azure"],
		},
		{
			id: "research",
			label: "Research Agent",
			description: "Long-context research, synthesis, and planning sessions.",
			supportedClouds: ["aws", "gcp"],
		},
		{
			id: "ops",
			label: "Ops Agent",
			description: "CI, automation, and reliability-focused operational tasks.",
			supportedClouds: ["aws", "azure"],
		},
	],
	clouds: [
		{
			id: "aws",
			label: "AWS",
			description: "EC2, VPC, and IAM resources in your AWS account.",
		},
		{
			id: "gcp",
			label: "Google Cloud",
			description: "Compute Engine and IAM resources in your GCP project.",
		},
		{
			id: "azure",
			label: "Azure",
			description: "VM and networking resources in your Azure subscription.",
		},
	],
	matrix: [
		{
			agentId: "builder",
			cloudId: "aws",
			models: ["openai/gpt-5.4", "anthropic/claude-opus-4.6", "google/gemini-3.1-pro-preview"],
			regions: ["us-east-1", "us-west-2", "eu-west-1"],
			sizes: [
				{ id: "small", label: "Small", description: "2 vCPU / 8 GB RAM" },
				{ id: "medium", label: "Medium", description: "4 vCPU / 16 GB RAM" },
				{ id: "large", label: "Large", description: "8 vCPU / 32 GB RAM" },
			],
			defaults: {
				model: "openai/gpt-5.4",
				region: "us-east-1",
				size: "medium",
			},
		},
		{
			agentId: "builder",
			cloudId: "gcp",
			models: ["openai/gpt-5.4", "google/gemini-3.1-pro-preview", "anthropic/claude-opus-4.6"],
			regions: ["us-central1", "us-east4", "europe-west4"],
			sizes: [
				{ id: "small", label: "Small", description: "2 vCPU / 8 GB RAM" },
				{ id: "medium", label: "Medium", description: "4 vCPU / 16 GB RAM" },
				{ id: "large", label: "Large", description: "8 vCPU / 32 GB RAM" },
			],
			defaults: {
				model: "openai/gpt-5.4",
				region: "us-central1",
				size: "medium",
			},
		},
		{
			agentId: "builder",
			cloudId: "azure",
			models: ["openai/gpt-5.4", "anthropic/claude-opus-4.6"],
			regions: ["eastus", "westus3", "westeurope"],
			sizes: [
				{ id: "small", label: "Small", description: "2 vCPU / 8 GB RAM" },
				{ id: "medium", label: "Medium", description: "4 vCPU / 16 GB RAM" },
				{ id: "large", label: "Large", description: "8 vCPU / 32 GB RAM" },
			],
			defaults: {
				model: "openai/gpt-5.4",
				region: "eastus",
				size: "medium",
			},
		},
		{
			agentId: "research",
			cloudId: "aws",
			models: ["anthropic/claude-opus-4.6", "openai/gpt-5.4", "google/gemini-3.1-pro-preview"],
			regions: ["us-east-1", "us-west-2", "eu-central-1"],
			sizes: [
				{ id: "small", label: "Small", description: "4 vCPU / 16 GB RAM" },
				{ id: "medium", label: "Medium", description: "8 vCPU / 32 GB RAM" },
				{ id: "large", label: "Large", description: "16 vCPU / 64 GB RAM" },
			],
			defaults: {
				model: "anthropic/claude-opus-4.6",
				region: "us-east-1",
				size: "medium",
			},
		},
		{
			agentId: "research",
			cloudId: "gcp",
			models: ["google/gemini-3.1-pro-preview", "openai/gpt-5.4", "anthropic/claude-opus-4.6"],
			regions: ["us-central1", "europe-west1", "asia-southeast1"],
			sizes: [
				{ id: "small", label: "Small", description: "4 vCPU / 16 GB RAM" },
				{ id: "medium", label: "Medium", description: "8 vCPU / 32 GB RAM" },
				{ id: "large", label: "Large", description: "16 vCPU / 64 GB RAM" },
			],
			defaults: {
				model: "google/gemini-3.1-pro-preview",
				region: "us-central1",
				size: "medium",
			},
		},
		{
			agentId: "ops",
			cloudId: "aws",
			models: ["openai/gpt-5.4", "anthropic/claude-opus-4.6"],
			regions: ["us-east-1", "us-west-2", "eu-west-1"],
			sizes: [
				{ id: "small", label: "Small", description: "2 vCPU / 8 GB RAM" },
				{ id: "medium", label: "Medium", description: "4 vCPU / 16 GB RAM" },
				{ id: "large", label: "Large", description: "8 vCPU / 32 GB RAM" },
			],
			defaults: {
				model: "openai/gpt-5.4",
				region: "us-east-1",
				size: "small",
			},
		},
		{
			agentId: "ops",
			cloudId: "azure",
			models: ["openai/gpt-5.4", "anthropic/claude-opus-4.6"],
			regions: ["eastus", "westeurope"],
			sizes: [
				{ id: "small", label: "Small", description: "2 vCPU / 8 GB RAM" },
				{ id: "medium", label: "Medium", description: "4 vCPU / 16 GB RAM" },
				{ id: "large", label: "Large", description: "8 vCPU / 32 GB RAM" },
			],
			defaults: {
				model: "openai/gpt-5.4",
				region: "eastus",
				size: "small",
			},
		},
	],
};

export function getSpawnMatrixEntry(agentId: SpawnAgentId, cloudId: SpawnCloudId) {
	return SPAWN_MANIFEST.matrix.find(
		(entry) => entry.agentId === agentId && entry.cloudId === cloudId,
	);
}

export function getDefaultSpawnMatrixEntry() {
	return (
		getSpawnMatrixEntry(SPAWN_MANIFEST.defaultAgentId, SPAWN_MANIFEST.defaultCloudId) ??
		SPAWN_MANIFEST.matrix[0]
	);
}
