import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Clock,
  Download,
  FileCode,
  FileCode2,
  Globe,
  KeyRound,
  ShieldOff,
  Terminal,
  Timer,
  Upload,
  Wrench,
  Zap
} from "lucide-react";
import type { DevToolsEntry } from "@ai-stats/devtools-core";
import { ChatCompletionView } from "./endpoints/ChatCompletionView";
import { ImageGenerationView } from "./endpoints/ImageGenerationView";
import { AudioView } from "./endpoints/AudioView";
import { GenericView } from "./endpoints/GenericView";

interface GenerationDetailProps {
  id: string;
}

export function GenerationDetail({ id }: GenerationDetailProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["generation", id],
    queryFn: async () => {
      console.log(`Fetching generation ${id}...`);
      const res = await fetch(`/api/generations/${id}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Failed to fetch generation ${id}:`, errorText);
        throw new Error(`Failed to fetch generation: ${res.status} ${errorText}`);
      }
      const data = await res.json() as DevToolsEntry;
      console.log(`Loaded generation ${id}:`, data);
      return data;
    }
  });

  // IMPORTANT: All hooks must be called before any conditional returns!
  // This useMemo must stay here, even though we check loading/error below
  const usageSummary = useMemo(() => {
    if (!data?.metadata?.usage) return [];
    const usage = data.metadata.usage;
    return [
      usage.prompt_tokens !== undefined && {
        label: "Prompt Tokens",
        value: usage.prompt_tokens.toLocaleString()
      },
      usage.completion_tokens !== undefined && {
        label: "Completion Tokens",
        value: usage.completion_tokens.toLocaleString()
      },
      usage.total_tokens !== undefined && {
        label: "Total Tokens",
        value: usage.total_tokens.toLocaleString()
      }
    ].filter(Boolean) as Array<{ label: string; value: string }>;
  }, [data?.metadata?.usage]);

  // NOW it's safe to do conditional returns
  if (isLoading) {
    return (
      <div className="p-6 text-muted-foreground">Loading generation...</div>
    );
  }

  if (error || !data) {
    console.error("Error displaying generation:", error);
    return (
      <div className="p-6 text-destructive">
        <div className="text-lg font-semibold mb-2">Failed to load generation</div>
        <div className="text-sm">
          {error instanceof Error ? error.message : "Unknown error"}
        </div>
      </div>
    );
  }

  // Render different UI based on endpoint type
  const renderContent = () => {
    switch (data.type) {
      case "chat.completions":
      case "responses":
        return <ChatCompletionView entry={data} />;

      case "images.generations":
      case "images.edits":
        return <ImageGenerationView entry={data} />;

      case "audio.speech":
      case "audio.transcriptions":
      case "audio.translations":
        return <AudioView entry={data} />;

      default:
        return <GenericView entry={data} />;
    }
  };

  // Quick actions
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      console.log(`Copied ${label} to clipboard`);
      // TODO: Add toast notification
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const copyAsCurl = () => {
    // Generate curl command
    const request = data.request as any;
    let curl = `curl -X POST 'https://api.ai-stats.com/v1/${data.type.replace('.', '/')}' \\\n`;
    curl += `  -H 'Authorization: Bearer YOUR_API_KEY' \\\n`;
    curl += `  -H 'Content-Type: application/json' \\\n`;
    curl += `  -d '${JSON.stringify(request, null, 2).replace(/\n/g, '\n  ')}'`;
    copyToClipboard(curl, 'curl command');
  };

  const copyAsCode = (lang: 'python' | 'typescript' | 'curl') => {
    const request = data.request as any;
    let code = '';

    if (lang === 'python') {
      code = `from ai_stats import Client\n\n`;
      code += `client = Client(api_key="YOUR_API_KEY")\n\n`;
      code += `response = client.${data.type.replace('.', '_')}(\n`;
      code += Object.entries(request || {})
        .map(([k, v]) => `    ${k}=${JSON.stringify(v)}`)
        .join(',\n');
      code += `\n)`;
    } else if (lang === 'typescript') {
      code = `import { AIStats } from '@ai-stats/sdk';\n\n`;
      code += `const client = new AIStats({ apiKey: 'YOUR_API_KEY' });\n\n`;
      code += `const response = await client.${data.type.replace('.', '.')}(${JSON.stringify(request, null, 2)});`;
    } else {
      copyAsCurl();
      return;
    }

    copyToClipboard(code, `${lang} code`);
  };

  const copyGenerationId = () => {
    copyToClipboard(data.id, 'Generation ID');
  };

  const copyRequestJson = () => {
    copyToClipboard(JSON.stringify(data.request, null, 2), 'Request JSON');
  };

  const copyResponseJson = () => {
    copyToClipboard(JSON.stringify(data.response, null, 2), 'Response JSON');
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header Section */}
      <section className="rounded-2xl border border-border/60 bg-background/80 p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  {data.type}
                </div>
                <h2 className="text-2xl font-semibold mt-1">{data.metadata.model || "Unknown Model"}</h2>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  data.error
                    ? "bg-destructive/10 text-destructive"
                    : "bg-emerald-500/10 text-emerald-600"
                }`}
              >
                {data.error ? "Error" : "Success"}
              </span>
              {data.metadata.stream && (
                <span className="rounded-full border border-border/60 bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
                  Streaming
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{new Date(data.timestamp).toLocaleString()}</span>
              <span>•</span>
              <button
                onClick={copyGenerationId}
                className="hover:text-foreground transition flex items-center gap-1"
                title="Click to copy"
              >
                <span>ID: {data.id.slice(0, 8)}...</span>
                <Clipboard className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          <MetricCard label="Provider" value={data.metadata.provider || "N/A"} />
          <MetricCard label="Duration" value={`${data.duration_ms}ms`} />
          <MetricCard
            label="Cost"
            value={
              typeof data.metadata.cost?.total_cost === "number"
                ? `$${data.metadata.cost.total_cost.toFixed(6)}`
                : "N/A"
            }
          />
          {data.metadata.usage?.total_tokens !== undefined && (
            <MetricCard label="Total Tokens" value={data.metadata.usage.total_tokens.toLocaleString()} />
          )}
          <MetricCard
            label="SDK"
            value={`${data.metadata.sdk}${data.metadata.sdk_version ? ' v' + data.metadata.sdk_version : ''}`}
          />
        </div>

        {/* Token Breakdown with Visualization */}
        {usageSummary.length > 0 && (
          <div className="mt-6">
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">
              Token Usage
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-4">
              {usageSummary.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-border/60 bg-muted/60 p-3 text-sm"
                >
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className="text-base font-semibold">{item.value}</div>
                </div>
              ))}
            </div>
            {/* Visual Token Breakdown */}
            {data.metadata.usage && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <div className="flex-1 h-6 rounded-full overflow-hidden bg-muted/60 flex">
                    {data.metadata.usage.prompt_tokens && data.metadata.usage.total_tokens && (
                      <div
                        className="bg-blue-500/60 flex items-center justify-center text-[10px] font-medium"
                        style={{
                          width: `${(data.metadata.usage.prompt_tokens / data.metadata.usage.total_tokens) * 100}%`
                        }}
                        title={`Prompt: ${data.metadata.usage.prompt_tokens} tokens`}
                      >
                        {data.metadata.usage.prompt_tokens > 0 && (
                          <span className="text-white px-2">Input</span>
                        )}
                      </div>
                    )}
                    {data.metadata.usage.completion_tokens && data.metadata.usage.total_tokens && (
                      <div
                        className="bg-emerald-500/60 flex items-center justify-center text-[10px] font-medium"
                        style={{
                          width: `${(data.metadata.usage.completion_tokens / data.metadata.usage.total_tokens) * 100}%`
                        }}
                        title={`Completion: ${data.metadata.usage.completion_tokens} tokens`}
                      >
                        {data.metadata.usage.completion_tokens > 0 && (
                          <span className="text-white px-2">Output</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {data.metadata.usage.total_tokens?.toLocaleString()} total
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cost Breakdown */}
        {data.metadata.cost && typeof data.metadata.cost.total_cost === 'number' && (
          <div className="mt-6">
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">
              Cost Analysis
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/60 p-4">
              <div className="flex items-baseline gap-2 mb-4">
                <div className="text-3xl font-bold">${data.metadata.cost.total_cost.toFixed(6)}</div>
                <div className="text-xs text-muted-foreground">total cost</div>
              </div>
              {data.metadata.usage && (
                <div className="grid grid-cols-2 gap-4 text-xs">
                  {data.metadata.usage.prompt_tokens && (
                    <div>
                      <div className="text-muted-foreground">Input Cost</div>
                      <div className="font-semibold">
                        ${((data.metadata.cost.total_cost * (data.metadata.usage.prompt_tokens / (data.metadata.usage.total_tokens || 1))) || 0).toFixed(6)}
                      </div>
                      <div className="text-muted-foreground text-[10px]">
                        ~${((data.metadata.cost.total_cost * (data.metadata.usage.prompt_tokens / (data.metadata.usage.total_tokens || 1))) / data.metadata.usage.prompt_tokens * 1000000 || 0).toFixed(2)}/MTok
                      </div>
                    </div>
                  )}
                  {data.metadata.usage.completion_tokens && (
                    <div>
                      <div className="text-muted-foreground">Output Cost</div>
                      <div className="font-semibold">
                        ${((data.metadata.cost.total_cost * (data.metadata.usage.completion_tokens / (data.metadata.usage.total_tokens || 1))) || 0).toFixed(6)}
                      </div>
                      <div className="text-muted-foreground text-[10px]">
                        ~${((data.metadata.cost.total_cost * (data.metadata.usage.completion_tokens / (data.metadata.usage.total_tokens || 1))) / data.metadata.usage.completion_tokens * 1000000 || 0).toFixed(2)}/MTok
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Performance Insights */}
        <div className="mt-6">
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">
            Performance
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border/60 bg-muted/60 p-3">
              <div className="text-xs text-muted-foreground">Latency</div>
              <div className="text-lg font-semibold">{data.duration_ms}ms</div>
              <div className="text-[10px] text-muted-foreground">
                {data.duration_ms < 1000 ? (
                  <span className="inline-flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    Fast
                  </span>
                ) : data.duration_ms < 5000 ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Good
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    Slow
                  </span>
                )}
              </div>
            </div>
            {data.metadata.usage?.total_tokens && data.duration_ms && (
              <div className="rounded-xl border border-border/60 bg-muted/60 p-3">
                <div className="text-xs text-muted-foreground">Throughput</div>
                <div className="text-lg font-semibold">
                  {((data.metadata.usage.total_tokens / data.duration_ms) * 1000).toFixed(0)}
                </div>
                <div className="text-[10px] text-muted-foreground">tokens/sec</div>
              </div>
            )}
            {data.metadata.cost?.total_cost && data.metadata.usage?.total_tokens && (
              <div className="rounded-xl border border-border/60 bg-muted/60 p-3">
                <div className="text-xs text-muted-foreground">Efficiency</div>
                <div className="text-lg font-semibold">
                  ${((data.metadata.cost.total_cost / data.metadata.usage.total_tokens) * 1000).toFixed(4)}
                </div>
                <div className="text-[10px] text-muted-foreground">per 1K tokens</div>
              </div>
            )}
            <div className="rounded-xl border border-border/60 bg-muted/60 p-3">
              <div className="text-xs text-muted-foreground">Request Size</div>
              <div className="text-lg font-semibold">
                {(JSON.stringify(data.request).length / 1024).toFixed(1)}KB
              </div>
              <div className="text-[10px] text-muted-foreground">
                {data.response ? `↓ ${(JSON.stringify(data.response).length / 1024).toFixed(1)}KB` : 'No response'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {data.error && (
        <ErrorDetails error={data.error} metadata={data.metadata} />
      )}

      {renderContent()}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-3 text-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold truncate">{value}</div>
    </div>
  );
}

interface ErrorDetailsProps {
  error: { message: string; stack?: string };
  metadata: DevToolsEntry['metadata'];
}

function ErrorDetails({ error, metadata }: ErrorDetailsProps) {
  const errorMessage = error.message;

  // Parse common error patterns
  const getErrorGuidance = () => {
    // 401 Unauthorized
    if (errorMessage.includes('401') || errorMessage.toLowerCase().includes('unauthorized')) {
      if (errorMessage.includes('invalid_key_format')) {
        return {
          type: 'Authentication Error',
          icon: KeyRound,
          problem: 'Your API key format is invalid',
          solutions: [
            'Check that your API key starts with the correct prefix (e.g., "sk-" for OpenAI)',
            'Ensure there are no extra spaces or newlines in your key',
            'Verify you\'re using the correct key for the provider',
            'Generate a new API key from your provider dashboard'
          ],
          docs: 'https://docs.ai-stats.com/errors/invalid-key'
        };
      }
      return {
        type: 'Authentication Error',
        icon: KeyRound,
        problem: 'Authentication failed - your API key may be missing or invalid',
        solutions: [
          'Check that your API key is set correctly in environment variables',
          'Verify the key hasn\'t expired or been revoked',
          'Ensure you have the correct API key for this provider',
          'Check if the key has the required permissions'
        ],
        docs: 'https://docs.ai-stats.com/errors/authentication'
      };
    }

    // 403 Forbidden
    if (errorMessage.includes('403') || errorMessage.toLowerCase().includes('forbidden')) {
      return {
        type: 'Permission Error',
        icon: ShieldOff,
        problem: 'You don\'t have permission to access this resource',
        solutions: [
          'Check if your API key has the required permissions',
          'Verify your account has access to this model or feature',
          'Some models require special access - check provider documentation',
          'Contact your provider to upgrade your plan if needed'
        ],
        docs: 'https://docs.ai-stats.com/errors/permissions'
      };
    }

    // 429 Rate Limit
    if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit')) {
      return {
        type: 'Rate Limit Exceeded',
        icon: Timer,
        problem: 'You\'ve exceeded the rate limit for this API',
        solutions: [
          'Wait a few moments before retrying',
          'Implement exponential backoff in your code',
          'Consider upgrading your API plan for higher limits',
          'Reduce the frequency of your requests'
        ],
        docs: 'https://docs.ai-stats.com/errors/rate-limits'
      };
    }

    // 500 Server Error
    if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
      return {
        type: 'Server Error',
        icon: Wrench,
        problem: 'The API server encountered an error',
        solutions: [
          'This is usually temporary - try again in a few moments',
          'Check the provider\'s status page for ongoing issues',
          'If the error persists, contact the provider support',
          'Implement retry logic with exponential backoff'
        ],
        docs: 'https://docs.ai-stats.com/errors/server-errors'
      };
    }

    // Timeout
    if (errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('timed out')) {
      return {
        type: 'Request Timeout',
        icon: Clock,
        problem: 'The request took too long to complete',
        solutions: [
          'Try reducing the max_tokens parameter',
          'The model may be under heavy load - try again later',
          'Increase your timeout setting if possible',
          'Consider using streaming for long responses'
        ],
        docs: 'https://docs.ai-stats.com/errors/timeouts'
      };
    }

    // Network errors
    if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('econnrefused')) {
      return {
        type: 'Network Error',
        icon: Globe,
        problem: 'Unable to reach the API server',
        solutions: [
          'Check your internet connection',
          'Verify the API endpoint URL is correct',
          'Check if there\'s a firewall blocking the request',
          'Try using a different network or VPN'
        ],
        docs: 'https://docs.ai-stats.com/errors/network'
      };
    }

    // Invalid request
    if (errorMessage.toLowerCase().includes('invalid') || errorMessage.includes('400')) {
      return {
        type: 'Invalid Request',
        icon: AlertCircle,
        problem: 'The request format or parameters are invalid',
        solutions: [
          'Check the request parameters match the API specification',
          'Verify all required fields are included',
          'Check for typos in parameter names',
          'Review the API documentation for correct usage'
        ],
        docs: 'https://docs.ai-stats.com/errors/invalid-request'
      };
    }

    // Generic error
    return {
      type: 'Request Failed',
      icon: AlertTriangle,
      problem: 'The API request was not successful',
      solutions: [
        'Review the error message below for specific details',
        'Check the API documentation for this endpoint',
        'Verify all request parameters are correct',
        'Try again or contact support if the issue persists'
      ],
      docs: 'https://docs.ai-stats.com/errors/troubleshooting'
    };
  };

  const guidance = getErrorGuidance();
  const GuidanceIcon = guidance.icon;

  return (
    <section className="rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-6">
      <div className="flex items-start gap-4">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-2">
          <GuidanceIcon className="h-6 w-6 text-destructive" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-lg font-semibold text-destructive">{guidance.type}</h3>
            <span className="rounded-full bg-destructive/20 px-3 py-1 text-xs font-medium text-destructive">
              Error
            </span>
          </div>

          <div className="mb-4">
            <div className="text-sm font-medium text-destructive/90 mb-2">{guidance.problem}</div>
            <div className="text-xs text-muted-foreground">
              Provider: {metadata.provider || 'Unknown'} • Model: {metadata.model || 'Unknown'}
            </div>
          </div>

          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-destructive/80 mb-2">
              How to Fix:
            </div>
            <ul className="space-y-2">
              {guidance.solutions.map((solution, idx) => (
                <li key={idx} className="flex gap-2 text-sm">
                  <span className="text-destructive/60 flex-shrink-0">{idx + 1}.</span>
                  <span>{solution}</span>
                </li>
              ))}
            </ul>
          </div>

          <details className="mb-4">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-destructive/80 hover:text-destructive">
              View Full Error Message
            </summary>
            <pre className="mt-3 text-xs bg-destructive/10 p-3 rounded-lg overflow-x-auto border border-destructive/20">
              {errorMessage}
            </pre>
          </details>

          {error.stack && (
            <details>
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-destructive/80 hover:text-destructive">
                View Stack Trace
              </summary>
              <pre className="mt-3 text-xs bg-destructive/10 p-3 rounded-lg overflow-x-auto border border-destructive/20">
                {error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
