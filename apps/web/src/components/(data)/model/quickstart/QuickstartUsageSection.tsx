import CodeBlock from "@/components/(data)/model/quickstart/CodeBlock";
import {
	getInstallationCode,
	INSTALLABLE_LANGUAGES,
} from "./quickstartSdkConfig";

type QuickstartUsageSectionProps = {
	compactMode: boolean;
	selectedLanguage: string;
	supportsStreaming: boolean;
	streamingEnabled: boolean;
	streamingDiff: string;
	curlQuickstart: string;
	typescriptSdkUsage: string | null;
	aiSdkUsage: string | null;
	agentSdkTsUsage: string | null;
	agentSdkPythonUsage: string | null;
	agentSdkGoUsage: string | null;
	agentSdkCsharpUsage: string | null;
	agentSdkPhpUsage: string | null;
	agentSdkRubyUsage: string | null;
	pythonSdkUsage: string | null;
	goSdkUsage: string;
	csharpSdkUsage: string;
	phpSdkUsage: string;
	rubySdkUsage: string;
	nodeFetchQuickstart: string;
	nodeFetchStreamingQuickstart: string;
	pythonRequestsQuickstart: string;
	pythonRequestsStreamingQuickstart: string;
	openaiPythonUsage: string | null;
	openaiNodeUsage: string | null;
	anthropicPythonUsage: string | null;
	anthropicNodeUsage: string | null;
};

export function QuickstartUsageSection({
	compactMode,
	selectedLanguage,
	supportsStreaming,
	streamingEnabled,
	streamingDiff,
	curlQuickstart,
	typescriptSdkUsage,
	aiSdkUsage,
	agentSdkTsUsage,
	agentSdkPythonUsage,
	agentSdkGoUsage,
	agentSdkCsharpUsage,
	agentSdkPhpUsage,
	agentSdkRubyUsage,
	pythonSdkUsage,
	goSdkUsage,
	csharpSdkUsage,
	phpSdkUsage,
	rubySdkUsage,
	nodeFetchQuickstart,
	nodeFetchStreamingQuickstart,
	pythonRequestsQuickstart,
	pythonRequestsStreamingQuickstart,
	openaiPythonUsage,
	openaiNodeUsage,
	anthropicPythonUsage,
	anthropicNodeUsage,
}: QuickstartUsageSectionProps) {
	const shouldStream = supportsStreaming && streamingEnabled;
	const compactCode = true;

	return (
		<div className={compactMode ? "space-y-2" : "space-y-3"}>
			{compactMode ? null : (
				<h3 className="text-base font-semibold">3) Send your first request</h3>
			)}
			{INSTALLABLE_LANGUAGES.has(selectedLanguage) && (
				<div className="space-y-2">
					{compactMode ? null : (
						<h4 className="text-sm font-medium">Installation</h4>
					)}
					<CodeBlock
						code={getInstallationCode(selectedLanguage)}
						lang="bash"
						label="bash"
						compact={compactCode}
					/>
				</div>
			)}
			{supportsStreaming && streamingEnabled ? (
				<div className="space-y-2">
					{compactMode ? null : (
						<h4 className="text-sm font-medium">Streaming change</h4>
					)}
					<CodeBlock
						code={streamingDiff}
						lang="diff"
						label="diff"
						compact={compactCode}
					/>
				</div>
			) : null}
			<div className="space-y-2">
				{compactMode ? null : (
					<h4 className="text-sm font-medium">
						{INSTALLABLE_LANGUAGES.has(selectedLanguage) ? "Usage" : "Code"}
					</h4>
				)}
				{selectedLanguage === "curl" && (
					<CodeBlock
						code={curlQuickstart}
						lang="bash"
						label="bash"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "typescript-sdk" && typescriptSdkUsage && (
					<CodeBlock
						code={typescriptSdkUsage}
						lang="ts"
						label="ts"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "ai-sdk" && aiSdkUsage && (
					<CodeBlock
						code={aiSdkUsage}
						lang="ts"
						label="ts"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "agent-sdk-ts" && agentSdkTsUsage && (
					<CodeBlock
						code={agentSdkTsUsage}
						lang="ts"
						label="ts"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "agent-sdk-python" && agentSdkPythonUsage && (
					<CodeBlock
						code={agentSdkPythonUsage}
						lang="python"
						label="python"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "agent-sdk-go" && agentSdkGoUsage && (
					<CodeBlock
						code={agentSdkGoUsage}
						lang="go"
						label="go"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "agent-sdk-csharp" && agentSdkCsharpUsage && (
					<CodeBlock
						code={agentSdkCsharpUsage}
						lang="csharp"
						label="csharp"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "agent-sdk-php" && agentSdkPhpUsage && (
					<CodeBlock
						code={agentSdkPhpUsage}
						lang="php"
						label="php"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "agent-sdk-ruby" && agentSdkRubyUsage && (
					<CodeBlock
						code={agentSdkRubyUsage}
						lang="ruby"
						label="ruby"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "python-sdk" && pythonSdkUsage && (
					<CodeBlock
						code={pythonSdkUsage}
						lang="python"
						label="python"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "go-sdk" && (
					<CodeBlock
						code={goSdkUsage}
						lang="go"
						label="go"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "csharp-sdk" && (
					<CodeBlock
						code={csharpSdkUsage}
						lang="csharp"
						label="csharp"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "php-sdk" && (
					<CodeBlock
						code={phpSdkUsage}
						lang="php"
						label="php"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "ruby-sdk" && (
					<CodeBlock
						code={rubySdkUsage}
						lang="ruby"
						label="ruby"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "node-fetch" && (
					<CodeBlock
						code={shouldStream ? nodeFetchStreamingQuickstart : nodeFetchQuickstart}
						lang="ts"
						label="ts"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "python-requests" && (
					<CodeBlock
						code={
							shouldStream
								? pythonRequestsStreamingQuickstart
								: pythonRequestsQuickstart
						}
						lang="python"
						label="python"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "openai-python" && openaiPythonUsage && (
					<CodeBlock
						code={openaiPythonUsage}
						lang="python"
						label="python"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "openai-node" && openaiNodeUsage && (
					<CodeBlock
						code={openaiNodeUsage}
						lang="ts"
						label="ts"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "anthropic-python" && anthropicPythonUsage && (
					<CodeBlock
						code={anthropicPythonUsage}
						lang="python"
						label="python"
						compact={compactCode}
					/>
				)}
				{selectedLanguage === "anthropic-node" && anthropicNodeUsage && (
					<CodeBlock
						code={anthropicNodeUsage}
						lang="ts"
						label="ts"
						compact={compactCode}
					/>
				)}
			</div>
		</div>
	);
}
