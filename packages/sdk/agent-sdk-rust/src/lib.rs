#![forbid(unsafe_code)]

use std::error::Error;
use std::fmt;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use phaseo::Phaseo;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

static RUN_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentError {
    message: String,
}

impl AgentError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

impl fmt::Display for AgentError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for AgentError {}

impl From<phaseo::PhaseoError> for AgentError {
    fn from(error: phaseo::PhaseoError) -> Self {
        Self::new(error.to_string())
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub input: Value,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct Message {
    pub role: String,
    #[serde(default)]
    pub content: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_calls: Vec<ToolCall>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default)]
    pub is_error: bool,
}

impl Message {
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".to_string(),
            content: content.into(),
            ..Self::default()
        }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: "assistant".to_string(),
            content: content.into(),
            ..Self::default()
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct UsageSummary {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: u64,
    pub total_tokens: u64,
    pub cost: f64,
}

impl UsageSummary {
    fn add(&mut self, other: &Self) {
        self.input_tokens += other.input_tokens;
        self.output_tokens += other.output_tokens;
        self.cached_tokens += other.cached_tokens;
        self.total_tokens += other.total_tokens;
        self.cost += other.cost;
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct ModelRequest {
    pub agent_id: String,
    pub model: String,
    pub instructions: String,
    pub messages: Vec<Message>,
    pub tools: Vec<ToolSpec>,
    #[serde(default)]
    pub context: Value,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct ModelResponse {
    pub message: Message,
    #[serde(default)]
    pub usage: UsageSummary,
    pub request_id: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub finish_reason: Option<String>,
}

pub trait ModelClient {
    fn generate(&mut self, request: &ModelRequest) -> Result<ModelResponse, AgentError>;
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ToolSpec {
    pub id: String,
    pub description: String,
    pub parameters: Value,
}

pub type ToolExecutor =
    Arc<dyn Fn(Value, &RuntimeContext) -> Result<Value, AgentError> + Send + Sync>;

#[derive(Clone)]
pub struct Tool {
    pub id: String,
    pub description: String,
    pub parameters: Value,
    pub execute: Option<ToolExecutor>,
    pub require_approval: bool,
}

impl fmt::Debug for Tool {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Tool")
            .field("id", &self.id)
            .field("description", &self.description)
            .field("parameters", &self.parameters)
            .field("has_executor", &self.execute.is_some())
            .field("require_approval", &self.require_approval)
            .finish()
    }
}

impl Tool {
    pub fn new<F>(
        id: impl Into<String>,
        description: impl Into<String>,
        parameters: Value,
        execute: F,
    ) -> Self
    where
        F: Fn(Value, &RuntimeContext) -> Result<Value, AgentError> + Send + Sync + 'static,
    {
        Self {
            id: id.into(),
            description: description.into(),
            parameters,
            execute: Some(Arc::new(execute)),
            require_approval: false,
        }
    }

    pub fn external(
        id: impl Into<String>,
        description: impl Into<String>,
        parameters: Value,
    ) -> Self {
        Self {
            id: id.into(),
            description: description.into(),
            parameters,
            execute: None,
            require_approval: false,
        }
    }

    pub fn require_approval(mut self) -> Self {
        self.require_approval = true;
        self
    }

    fn spec(&self) -> ToolSpec {
        ToolSpec {
            id: self.id.clone(),
            description: self.description.clone(),
            parameters: self.parameters.clone(),
        }
    }
}

pub fn define_tool(tool: Tool) -> Tool {
    tool
}

#[derive(Clone, Debug)]
pub struct RuntimeContext {
    pub run_id: String,
    pub agent_id: String,
    pub step_index: usize,
    pub context: Value,
    pub tool_call: ToolCall,
}

#[derive(Clone, Debug)]
pub struct HumanReviewContext {
    pub run_id: String,
    pub agent_id: String,
    pub step_index: usize,
    pub messages: Vec<Message>,
    pub response: ModelResponse,
    pub context: Value,
}

#[derive(Clone, Debug)]
pub struct HumanReviewRequest {
    pub reason: String,
    pub payload: Value,
}

pub type HumanReviewer =
    Arc<dyn Fn(&HumanReviewContext) -> Option<HumanReviewRequest> + Send + Sync>;

#[derive(Clone)]
pub struct AgentDefinition {
    pub id: String,
    pub model: String,
    pub instructions: String,
    pub tools: Vec<Tool>,
    pub max_steps: usize,
    pub max_retries: usize,
    pub retry_backoff: Duration,
    pub human_review: Option<HumanReviewer>,
}

impl fmt::Debug for AgentDefinition {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("AgentDefinition")
            .field("id", &self.id)
            .field("model", &self.model)
            .field("instructions", &self.instructions)
            .field("tools", &self.tools)
            .field("max_steps", &self.max_steps)
            .field("max_retries", &self.max_retries)
            .field("retry_backoff", &self.retry_backoff)
            .field("has_human_review", &self.human_review.is_some())
            .finish()
    }
}

impl AgentDefinition {
    pub fn new(id: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            model: model.into(),
            instructions: String::new(),
            tools: Vec::new(),
            max_steps: 8,
            max_retries: 0,
            retry_backoff: Duration::from_millis(250),
            human_review: None,
        }
    }

    pub fn instructions(mut self, instructions: impl Into<String>) -> Self {
        self.instructions = instructions.into();
        self
    }

    pub fn tool(mut self, tool: Tool) -> Self {
        self.tools.push(tool);
        self
    }

    pub fn max_steps(mut self, max_steps: usize) -> Self {
        self.max_steps = max_steps.max(1);
        self
    }

    pub fn model_retries(mut self, max_retries: usize, backoff: Duration) -> Self {
        self.max_retries = max_retries;
        self.retry_backoff = backoff;
        self
    }

    pub fn human_review<F>(mut self, reviewer: F) -> Self
    where
        F: Fn(&HumanReviewContext) -> Option<HumanReviewRequest> + Send + Sync + 'static,
    {
        self.human_review = Some(Arc::new(reviewer));
        self
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct PendingToolCall {
    pub call: ToolCall,
    pub kind: String,
    pub reason: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct HumanPause {
    pub reason: String,
    pub payload: Value,
    pub kind: String,
    pub pending_tool_calls: Vec<PendingToolCall>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct RunStep {
    pub index: usize,
    pub status: String,
    pub model_attempts: usize,
    pub tool_calls: Vec<ToolCall>,
    pub request_id: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub finish_reason: Option<String>,
    pub error: Option<String>,
    pub usage: UsageSummary,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct RunRecord {
    pub id: String,
    pub agent_id: String,
    pub model: String,
    pub max_steps: usize,
    pub status: String,
    pub input: Value,
    pub context: Value,
    pub step_count: usize,
    pub pause: Option<HumanPause>,
    pub stop_reason: Option<String>,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct RunResult {
    pub run: RunRecord,
    pub steps: Vec<RunStep>,
    pub output: Value,
    pub messages: Vec<Message>,
    pub usage: UsageSummary,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct AgentEvent {
    pub event_type: String,
    pub run_id: String,
    pub agent_id: String,
    pub timestamp_ms: u64,
    pub details: Value,
}

#[derive(Clone, Debug)]
pub struct RunOptions {
    pub input: Value,
    pub context: Value,
    pub model: Option<String>,
    pub max_steps: Option<usize>,
}

impl RunOptions {
    pub fn new(input: impl Into<Value>) -> Self {
        Self {
            input: input.into(),
            context: Value::Null,
            model: None,
            max_steps: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ToolDecision {
    pub tool_call_id: String,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ToolOutput {
    pub tool_call_id: String,
    pub output: Value,
}

#[derive(Clone, Debug)]
pub struct ContinueOptions {
    pub result: RunResult,
    pub human_input: Option<String>,
    pub approvals: Vec<ToolDecision>,
    pub tool_outputs: Vec<ToolOutput>,
}

impl ContinueOptions {
    pub fn new(result: RunResult) -> Self {
        Self {
            result,
            human_input: None,
            approvals: Vec::new(),
            tool_outputs: Vec::new(),
        }
    }
}

pub struct Agent {
    definition: AgentDefinition,
}

pub fn create_agent(definition: AgentDefinition) -> Agent {
    Agent { definition }
}

impl Agent {
    pub fn run(
        &self,
        client: &mut dyn ModelClient,
        options: RunOptions,
    ) -> Result<RunResult, AgentError> {
        self.run_with_events(client, options, None)
    }

    pub fn run_with_events(
        &self,
        client: &mut dyn ModelClient,
        options: RunOptions,
        mut on_event: Option<&mut dyn FnMut(&AgentEvent)>,
    ) -> Result<RunResult, AgentError> {
        let timestamp = now_ms();
        let run_id = new_run_id();
        let model = options
            .model
            .unwrap_or_else(|| self.definition.model.clone());
        let max_steps = options
            .max_steps
            .unwrap_or(self.definition.max_steps)
            .max(1);
        let input = options.input;
        let mut result = RunResult {
            run: RunRecord {
                id: run_id.clone(),
                agent_id: self.definition.id.clone(),
                model,
                max_steps,
                status: "running".to_string(),
                input: input.clone(),
                context: options.context,
                step_count: 0,
                pause: None,
                stop_reason: None,
                created_at_ms: timestamp,
                updated_at_ms: timestamp,
            },
            steps: Vec::new(),
            output: Value::Null,
            messages: vec![Message::user(value_to_text(&input))],
            usage: UsageSummary::default(),
        };
        emit(&mut on_event, &result, "run.started", Value::Null);
        self.drive(client, &mut result, &mut on_event)?;
        Ok(result)
    }

    pub fn continue_run(
        &self,
        client: &mut dyn ModelClient,
        options: ContinueOptions,
    ) -> Result<RunResult, AgentError> {
        self.continue_with_events(client, options, None)
    }

    pub fn continue_with_events(
        &self,
        client: &mut dyn ModelClient,
        options: ContinueOptions,
        mut on_event: Option<&mut dyn FnMut(&AgentEvent)>,
    ) -> Result<RunResult, AgentError> {
        let ContinueOptions {
            mut result,
            human_input,
            approvals,
            tool_outputs,
        } = options;
        let pause = result
            .run
            .pause
            .clone()
            .ok_or_else(|| AgentError::new("Agent run is not waiting for human input"))?;

        if pause.kind == "human_review" {
            let input = human_input
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| AgentError::new("Human input is required to resume this run"))?;
            result.messages.push(Message::user(input));
        } else {
            self.resolve_pending_tools(&mut result, &pause, &approvals, &tool_outputs)?;
        }

        result.run.pause = None;
        result.run.status = "running".to_string();
        result.run.updated_at_ms = now_ms();
        emit(&mut on_event, &result, "run.resumed", Value::Null);
        self.drive(client, &mut result, &mut on_event)?;
        Ok(result)
    }

    fn drive(
        &self,
        client: &mut dyn ModelClient,
        result: &mut RunResult,
        on_event: &mut Option<&mut dyn FnMut(&AgentEvent)>,
    ) -> Result<(), AgentError> {
        let max_steps = result.run.max_steps.max(1);

        while result.run.step_count < max_steps {
            let step_index = result.run.step_count;
            emit(
                on_event,
                result,
                "model.request.started",
                json!({"step_index": step_index}),
            );

            let request = ModelRequest {
                agent_id: self.definition.id.clone(),
                model: result.run.model.clone(),
                instructions: self.definition.instructions.clone(),
                messages: result.messages.clone(),
                tools: self.definition.tools.iter().map(Tool::spec).collect(),
                context: result.run.context.clone(),
            };

            let (response, attempts) = self.generate_with_retry(client, &request)?;
            result.run.step_count += 1;
            result.run.updated_at_ms = now_ms();
            result.usage.add(&response.usage);
            result.messages.push(response.message.clone());
            result.steps.push(RunStep {
                index: step_index,
                status: "completed".to_string(),
                model_attempts: attempts,
                tool_calls: response.message.tool_calls.clone(),
                request_id: response.request_id.clone(),
                provider: response.provider.clone(),
                model: response.model.clone(),
                finish_reason: response.finish_reason.clone(),
                error: None,
                usage: response.usage.clone(),
            });
            emit(
                on_event,
                result,
                "model.response.completed",
                json!({"step_index": step_index, "attempts": attempts}),
            );

            if !response.message.tool_calls.is_empty() {
                let pending = self.pending_tools(&response.message.tool_calls)?;
                let automatic: Vec<ToolCall> = response
                    .message
                    .tool_calls
                    .iter()
                    .filter(|call| !pending.iter().any(|item| item.call.id == call.id))
                    .cloned()
                    .collect();
                self.execute_tools(result, &automatic, on_event)?;
                if !pending.is_empty() {
                    let pause_kind = if pending.iter().all(|call| call.kind == "external_output") {
                        "external_output"
                    } else if pending.iter().all(|call| call.kind == "approval") {
                        "tool_approval"
                    } else {
                        "tool_input"
                    };
                    result.run.status = "waiting_for_human".to_string();
                    result.run.pause = Some(HumanPause {
                        reason: "Pending tool calls require input".to_string(),
                        payload: json!({"tool_calls": pending}),
                        kind: pause_kind.to_string(),
                        pending_tool_calls: pending,
                    });
                    emit(on_event, result, "run.paused", Value::Null);
                    return Ok(());
                }
                continue;
            }

            if let Some(reviewer) = &self.definition.human_review {
                let review_context = HumanReviewContext {
                    run_id: result.run.id.clone(),
                    agent_id: result.run.agent_id.clone(),
                    step_index,
                    messages: result.messages.clone(),
                    response: response.clone(),
                    context: result.run.context.clone(),
                };
                if let Some(review) = reviewer(&review_context) {
                    result.run.status = "waiting_for_human".to_string();
                    result.run.pause = Some(HumanPause {
                        reason: review.reason,
                        payload: review.payload,
                        kind: "human_review".to_string(),
                        pending_tool_calls: Vec::new(),
                    });
                    emit(on_event, result, "run.paused", Value::Null);
                    return Ok(());
                }
            }

            result.output = Value::String(response.message.content);
            result.run.status = "completed".to_string();
            emit(on_event, result, "run.completed", Value::Null);
            return Ok(());
        }

        result.run.status = "stopped".to_string();
        result.run.stop_reason = Some(format!("max_steps:{max_steps}"));
        emit(
            on_event,
            result,
            "run.stopped",
            json!({"reason": result.run.stop_reason}),
        );
        Ok(())
    }

    fn generate_with_retry(
        &self,
        client: &mut dyn ModelClient,
        request: &ModelRequest,
    ) -> Result<(ModelResponse, usize), AgentError> {
        let mut attempts = 0;
        loop {
            attempts += 1;
            match client.generate(request) {
                Ok(response) => return Ok((response, attempts)),
                Err(error) if attempts <= self.definition.max_retries => {
                    if !self.definition.retry_backoff.is_zero() {
                        thread::sleep(self.definition.retry_backoff);
                    }
                    let _ = error;
                }
                Err(error) => return Err(error),
            }
        }
    }

    fn pending_tools(&self, calls: &[ToolCall]) -> Result<Vec<PendingToolCall>, AgentError> {
        calls
            .iter()
            .filter_map(|call| {
                let tool = self
                    .definition
                    .tools
                    .iter()
                    .find(|tool| tool.id == call.name);
                match tool {
                    None => Some(Err(AgentError::new(format!(
                        "Model requested unknown tool: {}",
                        call.name
                    )))),
                    Some(tool) if tool.require_approval => Some(Ok(PendingToolCall {
                        call: call.clone(),
                        kind: "approval".to_string(),
                        reason: "Tool requires approval".to_string(),
                    })),
                    Some(tool) if tool.execute.is_none() => Some(Ok(PendingToolCall {
                        call: call.clone(),
                        kind: "external_output".to_string(),
                        reason: "Tool output must be supplied externally".to_string(),
                    })),
                    Some(_) => None,
                }
            })
            .collect()
    }

    fn execute_tools(
        &self,
        result: &mut RunResult,
        calls: &[ToolCall],
        on_event: &mut Option<&mut dyn FnMut(&AgentEvent)>,
    ) -> Result<(), AgentError> {
        for call in calls {
            let tool = self
                .definition
                .tools
                .iter()
                .find(|tool| tool.id == call.name)
                .ok_or_else(|| AgentError::new(format!("Unknown tool: {}", call.name)))?;
            let executor = tool.execute.as_ref().ok_or_else(|| {
                AgentError::new(format!("Tool requires external output: {}", call.name))
            })?;
            let runtime = RuntimeContext {
                run_id: result.run.id.clone(),
                agent_id: result.run.agent_id.clone(),
                step_index: result.run.step_count.saturating_sub(1),
                context: result.run.context.clone(),
                tool_call: call.clone(),
            };
            emit(
                on_event,
                result,
                "tool.started",
                json!({"tool_call_id": call.id, "name": call.name}),
            );
            let (output, is_error) = match executor(call.input.clone(), &runtime) {
                Ok(output) => (output, false),
                Err(error) => (json!({"error": error.to_string()}), true),
            };
            result.messages.push(Message {
                role: "tool".to_string(),
                content: value_to_text(&output),
                tool_call_id: Some(call.id.clone()),
                name: Some(call.name.clone()),
                is_error,
                ..Message::default()
            });
            emit(
                on_event,
                result,
                "tool.completed",
                json!({"tool_call_id": call.id, "name": call.name, "is_error": is_error}),
            );
        }
        Ok(())
    }

    fn resolve_pending_tools(
        &self,
        result: &mut RunResult,
        pause: &HumanPause,
        approvals: &[ToolDecision],
        tool_outputs: &[ToolOutput],
    ) -> Result<(), AgentError> {
        for pending in &pause.pending_tool_calls {
            match pending.kind.as_str() {
                "external_output" => {
                    if let Some(output) = tool_outputs
                        .iter()
                        .find(|output| output.tool_call_id == pending.call.id)
                    {
                        result.messages.push(Message {
                            role: "tool".to_string(),
                            content: value_to_text(&output.output),
                            tool_call_id: Some(pending.call.id.clone()),
                            name: Some(pending.call.name.clone()),
                            ..Message::default()
                        });
                        continue;
                    }
                }
                "approval" => {
                    let approved = approvals
                        .iter()
                        .any(|decision| decision.tool_call_id == pending.call.id);
                    if approved {
                        let tool = self
                            .definition
                            .tools
                            .iter()
                            .find(|tool| tool.id == pending.call.name)
                            .ok_or_else(|| {
                                AgentError::new(format!(
                                    "Model requested unknown tool: {}",
                                    pending.call.name
                                ))
                            })?;
                        if tool.execute.is_some() {
                            self.execute_tools(
                                result,
                                std::slice::from_ref(&pending.call),
                                &mut None,
                            )?;
                            continue;
                        }
                        if let Some(output) = tool_outputs
                            .iter()
                            .find(|output| output.tool_call_id == pending.call.id)
                        {
                            result.messages.push(Message {
                                role: "tool".to_string(),
                                content: value_to_text(&output.output),
                                tool_call_id: Some(pending.call.id.clone()),
                                name: Some(pending.call.name.clone()),
                                ..Message::default()
                            });
                            continue;
                        }
                    }
                }
                kind => {
                    return Err(AgentError::new(format!(
                        "Unknown pending tool call kind {kind} for {}",
                        pending.call.id
                    )));
                }
            }

            return Err(AgentError::new(format!(
                "No approval or external output supplied for tool call {}",
                pending.call.id
            )));
        }
        Ok(())
    }
}

pub struct GatewayAgentClient {
    client: Phaseo,
    model: String,
    gateway_tools: Vec<Value>,
}

impl GatewayAgentClient {
    pub fn new(client: Phaseo, model: impl Into<String>) -> Self {
        Self {
            client,
            model: model.into(),
            gateway_tools: Vec::new(),
        }
    }

    pub fn with_gateway_tools(mut self, tools: Vec<Value>) -> Self {
        self.gateway_tools = tools;
        self
    }

    pub fn from_env(model: impl Into<String>) -> Result<Self, AgentError> {
        Ok(Self::new(
            Phaseo::from_env()?
                .with_header("X-Phaseo-Client", "phaseo-agent-rust")
                .with_header("X-Phaseo-Client-Version", env!("CARGO_PKG_VERSION")),
            model,
        ))
    }
}

pub fn create_gateway_agent_client(
    model: impl Into<String>,
) -> Result<GatewayAgentClient, AgentError> {
    GatewayAgentClient::from_env(model)
}

impl ModelClient for GatewayAgentClient {
    fn generate(&mut self, request: &ModelRequest) -> Result<ModelResponse, AgentError> {
        let model = if request.model.trim().is_empty() {
            &self.model
        } else {
            &request.model
        };
        let input = response_input(&request.messages);
        let mut tools: Vec<Value> = request
            .tools
            .iter()
            .map(|tool| {
                json!({
                    "type": "function",
                    "name": tool.id,
                    "description": tool.description,
                    "parameters": tool.parameters,
                })
            })
            .collect();
        tools.extend(self.gateway_tools.iter().cloned());
        let mut body = json!({
            "model": model,
            "input": input,
            "metadata": {"phaseo_agent_id": request.agent_id},
        });
        if !request.instructions.is_empty() {
            body["instructions"] = Value::String(request.instructions.clone());
        }
        if !tools.is_empty() {
            body["tools"] = Value::Array(tools);
        }

        let response = self.client.responses(&body)?;
        model_response_from_body(response.body, response.request_id)
    }
}

fn response_input(messages: &[Message]) -> Vec<Value> {
    let mut input = Vec::new();
    for message in messages {
        if message.role == "tool" {
            input.push(json!({
                "type": "function_call_output",
                "call_id": message.tool_call_id,
                "output": message.content,
            }));
            continue;
        }
        if !message.content.is_empty() {
            input.push(json!({
                "type": "message",
                "role": message.role,
                "content": message.content,
            }));
        }
        for call in &message.tool_calls {
            input.push(json!({
                "type": "function_call",
                "call_id": call.id,
                "name": call.name,
                "arguments": call.input.to_string(),
            }));
        }
    }
    input
}

fn model_response_from_body(
    body: Value,
    header_request_id: Option<String>,
) -> Result<ModelResponse, AgentError> {
    let mut text = body
        .get("output_text")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let mut tool_calls = Vec::new();
    if let Some(output) = body.get("output").and_then(Value::as_array) {
        for item in output {
            match item.get("type").and_then(Value::as_str) {
                Some("function_call") => {
                    let raw = item
                        .get("arguments")
                        .and_then(Value::as_str)
                        .unwrap_or("{}");
                    tool_calls.push(ToolCall {
                        id: item
                            .get("call_id")
                            .or_else(|| item.get("id"))
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        name: item
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        input: serde_json::from_str(raw)
                            .unwrap_or_else(|_| Value::String(raw.into())),
                    });
                }
                Some("message") if text.is_empty() => {
                    text = item
                        .get("content")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                        .filter_map(|part| part.get("text").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join("");
                }
                _ => {}
            }
        }
    }

    if text.is_empty() && tool_calls.is_empty() {
        return Err(AgentError::new(
            "Phaseo response contained neither output text nor tool calls",
        ));
    }

    let usage = body.get("usage").cloned().unwrap_or(Value::Null);
    let input_tokens = integer(&usage, &["input_tokens", "prompt_tokens"]);
    let output_tokens = integer(&usage, &["output_tokens", "completion_tokens"]);
    let total_tokens = integer(&usage, &["total_tokens"]).max(input_tokens + output_tokens);
    Ok(ModelResponse {
        message: Message {
            role: "assistant".to_string(),
            content: text,
            tool_calls,
            ..Message::default()
        },
        usage: UsageSummary {
            input_tokens,
            output_tokens,
            cached_tokens: usage
                .pointer("/input_tokens_details/cached_tokens")
                .and_then(Value::as_u64)
                .unwrap_or_else(|| integer(&usage, &["cached_tokens", "cache_read_input_tokens"])),
            total_tokens,
            cost: body
                .pointer("/meta/cost")
                .or_else(|| body.get("cost"))
                .and_then(Value::as_f64)
                .unwrap_or_default(),
        },
        request_id: header_request_id
            .or_else(|| body.get("id").and_then(Value::as_str).map(str::to_string)),
        provider: body
            .get("provider")
            .and_then(Value::as_str)
            .map(str::to_string),
        model: body
            .get("model")
            .and_then(Value::as_str)
            .map(str::to_string),
        finish_reason: body
            .get("status")
            .and_then(Value::as_str)
            .map(str::to_string),
    })
}

fn integer(value: &Value, keys: &[&str]) -> u64 {
    keys.iter()
        .find_map(|key| value.get(key).and_then(Value::as_u64))
        .unwrap_or_default()
}

fn value_to_text(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn new_run_id() -> String {
    let sequence = RUN_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("run_{}_{sequence}", now_ms())
}

fn emit(
    handler: &mut Option<&mut dyn FnMut(&AgentEvent)>,
    result: &RunResult,
    event_type: &str,
    details: Value,
) {
    if let Some(handler) = handler.as_deref_mut() {
        handler(&AgentEvent {
            event_type: event_type.to_string(),
            run_id: result.run.id.clone(),
            agent_id: result.run.agent_id.clone(),
            timestamp_ms: now_ms(),
            details,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configures_gateway_native_tools() {
        let client = GatewayAgentClient::new(
            Phaseo::new("test-key")
                .expect("test client")
                .with_base_url("https://api.phaseo.app/v1")
                .expect("test base URL"),
            "phaseo/free",
        )
        .with_gateway_tools(vec![json!({
            "type": "gateway:datetime",
            "parameters": { "timezones": ["UTC"] }
        })]);

        assert_eq!(client.gateway_tools.len(), 1);
        assert_eq!(client.gateway_tools[0]["type"], "gateway:datetime");
    }

    struct ToolLoopClient {
        calls: usize,
    }

    impl ModelClient for ToolLoopClient {
        fn generate(&mut self, _request: &ModelRequest) -> Result<ModelResponse, AgentError> {
            self.calls += 1;
            if self.calls == 1 {
                return Ok(ModelResponse {
                    message: Message {
                        role: "assistant".to_string(),
                        tool_calls: vec![ToolCall {
                            id: "call_1".to_string(),
                            name: "lookup".to_string(),
                            input: json!({"slug": "presets"}),
                        }],
                        ..Message::default()
                    },
                    ..ModelResponse::default()
                });
            }
            Ok(ModelResponse {
                message: Message::assistant("Presets define stable routing defaults."),
                ..ModelResponse::default()
            })
        }
    }

    #[test]
    fn executes_a_tool_loop_and_emits_events() {
        let tool = Tool::new(
            "lookup",
            "Lookup documentation",
            json!({"type": "object"}),
            |input, _context| Ok(json!({"slug": input["slug"], "ok": true})),
        );
        let agent = create_agent(
            AgentDefinition::new("support", "openai/gpt-5.4-nano")
                .instructions("Use tools when helpful")
                .tool(tool),
        );
        let mut client = ToolLoopClient { calls: 0 };
        let mut events = Vec::new();
        let mut capture = |event: &AgentEvent| events.push(event.event_type.clone());
        let result = agent
            .run_with_events(
                &mut client,
                RunOptions::new("Explain presets"),
                Some(&mut capture),
            )
            .unwrap();

        assert_eq!(result.run.status, "completed");
        assert_eq!(
            result.output,
            json!("Presets define stable routing defaults.")
        );
        assert_eq!(result.steps.len(), 2);
        assert!(result.messages.iter().any(|message| message.role == "tool"));
        assert!(events.iter().any(|event| event == "tool.completed"));
    }

    struct RetryReviewClient {
        calls: usize,
        models: Vec<String>,
    }

    impl ModelClient for RetryReviewClient {
        fn generate(&mut self, request: &ModelRequest) -> Result<ModelResponse, AgentError> {
            self.calls += 1;
            self.models.push(request.model.clone());
            if self.calls == 1 {
                return Err(AgentError::new("temporary failure"));
            }
            Ok(ModelResponse {
                message: Message::assistant("Deploy the change"),
                ..ModelResponse::default()
            })
        }
    }

    #[test]
    fn retries_pauses_and_resumes_human_review() {
        let agent = create_agent(
            AgentDefinition::new("review", "openai/gpt-5.4-nano")
                .model_retries(1, Duration::ZERO)
                .human_review(|context| {
                    if context
                        .messages
                        .iter()
                        .any(|message| message.role == "user" && message.content == "approved")
                    {
                        None
                    } else {
                        Some(HumanReviewRequest {
                            reason: "Approve deployment".to_string(),
                            payload: json!({"output": context.response.message.content}),
                        })
                    }
                }),
        );
        let mut client = RetryReviewClient {
            calls: 0,
            models: Vec::new(),
        };
        let mut run_options = RunOptions::new("Prepare deployment");
        run_options.model = Some("openai/override-model".to_string());
        run_options.max_steps = Some(3);
        let paused = agent.run(&mut client, run_options).unwrap();
        assert_eq!(paused.run.status, "waiting_for_human");
        assert_eq!(paused.steps[0].model_attempts, 2);
        assert_eq!(paused.run.model, "openai/override-model");
        assert_eq!(paused.run.max_steps, 3);

        let mut options = ContinueOptions::new(paused);
        options.human_input = Some("approved".to_string());
        let completed = agent.continue_run(&mut client, options).unwrap();
        assert_eq!(completed.run.status, "completed");
        assert_eq!(completed.output, json!("Deploy the change"));
        assert!(client
            .models
            .iter()
            .all(|model| model == "openai/override-model"));
        serde_json::to_string(&completed).unwrap();
    }

    struct MixedToolClient {
        calls: usize,
    }

    impl ModelClient for MixedToolClient {
        fn generate(&mut self, _request: &ModelRequest) -> Result<ModelResponse, AgentError> {
            self.calls += 1;
            if self.calls == 1 {
                return Ok(ModelResponse {
                    message: Message {
                        role: "assistant".to_string(),
                        tool_calls: vec![
                            ToolCall {
                                id: "call_local".to_string(),
                                name: "local".to_string(),
                                input: json!({"value": 1}),
                            },
                            ToolCall {
                                id: "call_external".to_string(),
                                name: "external".to_string(),
                                input: json!({"value": 2}),
                            },
                        ],
                        ..Message::default()
                    },
                    ..ModelResponse::default()
                });
            }
            Ok(ModelResponse {
                message: Message::assistant("Both tool results received."),
                ..ModelResponse::default()
            })
        }
    }

    #[test]
    fn executes_automatic_tools_before_pausing_for_external_outputs() {
        let agent = create_agent(
            AgentDefinition::new("mixed-tools", "openai/gpt-5.4-nano")
                .tool(Tool::new(
                    "local",
                    "Run locally",
                    json!({"type": "object"}),
                    |input, _context| Ok(json!({"local": input["value"]})),
                ))
                .tool(Tool::external(
                    "external",
                    "Run externally",
                    json!({"type": "object"}),
                )),
        );
        let mut client = MixedToolClient { calls: 0 };
        let paused = agent
            .run(&mut client, RunOptions::new("Use both tools"))
            .unwrap();

        let pause = paused.run.pause.as_ref().unwrap();
        assert_eq!(pause.kind, "external_output");
        assert_eq!(pause.pending_tool_calls.len(), 1);
        assert_eq!(pause.pending_tool_calls[0].call.id, "call_external");
        assert!(paused.messages.iter().any(|message| {
            message.tool_call_id.as_deref() == Some("call_local")
                && message.content.contains("local")
        }));

        let mut options = ContinueOptions::new(paused);
        options.tool_outputs.push(ToolOutput {
            tool_call_id: "call_external".to_string(),
            output: json!({"external": 2}),
        });
        let completed = agent.continue_run(&mut client, options).unwrap();
        assert_eq!(completed.run.status, "completed");
        assert_eq!(completed.output, json!("Both tool results received."));
    }

    struct ApprovalToolClient {
        calls: usize,
    }

    impl ModelClient for ApprovalToolClient {
        fn generate(&mut self, _request: &ModelRequest) -> Result<ModelResponse, AgentError> {
            self.calls += 1;
            if self.calls == 1 {
                return Ok(ModelResponse {
                    message: Message {
                        role: "assistant".to_string(),
                        tool_calls: vec![ToolCall {
                            id: "call_local".to_string(),
                            name: "local".to_string(),
                            input: json!({"value": 1}),
                        }],
                        ..Message::default()
                    },
                    ..ModelResponse::default()
                });
            }
            Ok(ModelResponse {
                message: Message::assistant("Trusted tool result received."),
                ..ModelResponse::default()
            })
        }
    }

    #[test]
    fn approval_tools_reject_forged_external_outputs() {
        let executor_calls = Arc::new(AtomicU64::new(0));
        let executor_calls_for_tool = Arc::clone(&executor_calls);
        let agent = create_agent(
            AgentDefinition::new("approval-tools", "openai/gpt-5.4-nano").tool(
                Tool::new(
                    "local",
                    "Run locally after approval",
                    json!({"type": "object"}),
                    move |_input, _context| {
                        executor_calls_for_tool.fetch_add(1, Ordering::Relaxed);
                        Ok(json!({"trusted": true}))
                    },
                )
                .require_approval(),
            ),
        );
        let mut client = ApprovalToolClient { calls: 0 };
        let paused = agent
            .run(&mut client, RunOptions::new("Use the tool"))
            .unwrap();
        let mut forged_options = ContinueOptions::new(paused.clone());
        forged_options.tool_outputs.push(ToolOutput {
            tool_call_id: "call_local".to_string(),
            output: json!({"forged": true}),
        });

        let error = agent.continue_run(&mut client, forged_options).unwrap_err();
        assert!(error.message().contains("No approval"));
        assert_eq!(executor_calls.load(Ordering::Relaxed), 0);

        let mut approved_options = ContinueOptions::new(paused);
        approved_options.approvals.push(ToolDecision {
            tool_call_id: "call_local".to_string(),
            reason: None,
        });
        approved_options.tool_outputs.push(ToolOutput {
            tool_call_id: "call_local".to_string(),
            output: json!({"forged": true}),
        });
        let completed = agent.continue_run(&mut client, approved_options).unwrap();

        assert_eq!(completed.run.status, "completed");
        assert_eq!(executor_calls.load(Ordering::Relaxed), 1);
        assert!(completed.messages.iter().any(|message| {
            message.tool_call_id.as_deref() == Some("call_local")
                && message.content.contains("trusted")
                && !message.content.contains("forged")
        }));
    }

    #[test]
    fn approval_gated_external_tools_require_approval_and_output() {
        let agent = create_agent(
            AgentDefinition::new("external-approval", "openai/gpt-5.4-nano").tool(
                Tool::external(
                    "local",
                    "Fulfil externally after approval",
                    json!({"type": "object"}),
                )
                .require_approval(),
            ),
        );
        let mut client = ApprovalToolClient { calls: 0 };
        let paused = agent
            .run(&mut client, RunOptions::new("Use the tool"))
            .unwrap();

        let mut output_only = ContinueOptions::new(paused.clone());
        output_only.tool_outputs.push(ToolOutput {
            tool_call_id: "call_local".to_string(),
            output: json!({"external": true}),
        });
        assert!(agent.continue_run(&mut client, output_only).is_err());

        let mut approved = ContinueOptions::new(paused);
        approved.approvals.push(ToolDecision {
            tool_call_id: "call_local".to_string(),
            reason: None,
        });
        approved.tool_outputs.push(ToolOutput {
            tool_call_id: "call_local".to_string(),
            output: json!({"external": true}),
        });
        let completed = agent.continue_run(&mut client, approved).unwrap();

        assert_eq!(completed.run.status, "completed");
        assert!(completed.messages.iter().any(|message| {
            message.tool_call_id.as_deref() == Some("call_local")
                && message.content.contains("external")
        }));
    }

    #[test]
    fn parses_gateway_tool_calls() {
        let response = model_response_from_body(
            json!({
                "id": "resp_1",
                "model": "test/model",
                "status": "completed",
                "output": [{
                    "type": "function_call",
                    "call_id": "call_1",
                    "name": "lookup",
                    "arguments": "{\"slug\":\"rust\"}"
                }],
                "usage": {"input_tokens": 3, "output_tokens": 2}
            }),
            None,
        )
        .unwrap();
        assert_eq!(response.message.tool_calls[0].input["slug"], "rust");
        assert_eq!(response.usage.total_tokens, 5);
    }

    #[test]
    fn reads_nested_responses_cached_token_usage() {
        let response = model_response_from_body(
            json!({
                "id": "resp_cached",
                "output_text": "cached",
                "usage": {
                    "input_tokens": 10,
                    "output_tokens": 2,
                    "input_tokens_details": {"cached_tokens": 7}
                }
            }),
            None,
        )
        .unwrap();
        assert_eq!(response.usage.cached_tokens, 7);
    }
}
