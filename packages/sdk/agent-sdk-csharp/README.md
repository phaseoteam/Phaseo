# AI Stats Agent SDK (C#)

`AI.Stats.AgentSdk` is a minimal .NET agent runtime for AI Stats Gateway.

It provides:

- `AgentSdk.CreateAgent(...)`
- `AgentSdk.DefineTool(...)`
- `AgentSdk.CreateGatewayAgentClient(...)`
- a bounded tool loop on top of the AI Stats `responses` API

## Install

```bash
dotnet add package AI.Stats.Sdk
dotnet add package AI.Stats.AgentSdk
```

## Quickstart

```csharp
using AiStatsAgentSdk;

var agent = AgentSdk.CreateAgent(new AgentDefinition
{
    Id = "quickstart-agent",
    Model = "openai/gpt-5.4-nano",
    Instructions = "Answer concisely and helpfully."
});

var result = await agent.Run(new RunOptions
{
    Input = "Give me one fun fact about cURL.",
    Client = AgentSdk.CreateGatewayAgentClient(),
});

Console.WriteLine(result.Output);
```
