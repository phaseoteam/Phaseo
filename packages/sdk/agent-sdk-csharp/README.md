# Phaseo Agent SDK (C#)

`Phaseo.AgentSdk` is a minimal .NET agent runtime for Phaseo Gateway.

It provides:

- `AgentSdk.CreateAgent(...)`
- `AgentSdk.DefineTool(...)`
- `AgentSdk.CreateGatewayAgentClient(...)`
- a bounded tool loop on top of the Phaseo `responses` API

## Install

```bash
dotnet add package Phaseo.Sdk
dotnet add package Phaseo.AgentSdk
```

## Quickstart

```csharp
using PhaseoAgentSdk;

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
