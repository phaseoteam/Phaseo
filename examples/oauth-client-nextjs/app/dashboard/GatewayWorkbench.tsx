'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type TesterPreset = {
  label: string;
  method: 'GET' | 'POST' | 'DELETE';
  surface: string;
  sampleBody?: string;
};

const TESTER_PRESETS: TesterPreset[] = [
  { label: 'Health', method: 'GET', surface: 'health' },
  { label: 'Providers', method: 'GET', surface: 'providers' },
  { label: 'Models', method: 'GET', surface: 'models' },
  { label: 'Gateway Models', method: 'GET', surface: 'gateway/models' },
  {
    label: 'Embeddings',
    method: 'POST',
    surface: 'embeddings',
    sampleBody: JSON.stringify(
      {
        model: 'openai/text-embedding-3-small',
        input: 'hello world',
      },
      null,
      2,
    ),
  },
  {
    label: 'Moderations',
    method: 'POST',
    surface: 'moderations',
    sampleBody: JSON.stringify(
      {
        model: 'openai/omni-moderation-latest',
        input: 'I love building safe products.',
      },
      null,
      2,
    ),
  },
  {
    label: 'Image Generation',
    method: 'POST',
    surface: 'images/generations',
    sampleBody: JSON.stringify(
      {
        model: 'openai/gpt-image-1',
        prompt: 'A minimalist poster showing latency as a race track',
      },
      null,
      2,
    ),
  },
  {
    label: 'Video Generation',
    method: 'POST',
    surface: 'videos',
    sampleBody: JSON.stringify(
      {
        model: 'openai/sora-2',
        prompt: 'A short cinematic scene of waves at sunrise',
      },
      null,
      2,
    ),
  },
  {
    label: 'OCR',
    method: 'POST',
    surface: 'ocr',
    sampleBody: JSON.stringify(
      {
        model: 'mistral/mistral-ocr',
        image_url: 'https://example.com/invoice.png',
      },
      null,
      2,
    ),
  },
  {
    label: 'Music Generation',
    method: 'POST',
    surface: 'music/generate',
    sampleBody: JSON.stringify(
      {
        model: 'suno/suno-v4',
        prompt: 'Lo-fi instrumental with warm piano and vinyl texture',
      },
      null,
      2,
    ),
  },
];

function pickModels(payload: any): string[] {
  if (!payload || typeof payload !== 'object') return [];

  const candidates: string[] = [];
  const fromData = Array.isArray(payload.data) ? payload.data : [];
  const fromModels = Array.isArray(payload.models) ? payload.models : [];

  for (const item of [...fromData, ...fromModels]) {
    if (item && typeof item === 'object') {
      if (typeof item.id === 'string') candidates.push(item.id);
      if (typeof item.model_id === 'string') candidates.push(item.model_id);
      if (typeof item.model === 'string') candidates.push(item.model);
    }
  }

  const unique = Array.from(new Set(candidates));
  unique.sort((a, b) => a.localeCompare(b));
  return unique;
}

function extractResponseText(payload: any): string {
  if (!payload || typeof payload !== 'object') return 'No response payload';
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text;

  if (Array.isArray(payload.output)) {
    const parts: string[] = [];
    for (const item of payload.output) {
      if (!item || typeof item !== 'object') continue;
      const content = Array.isArray(item.content) ? item.content : [];
      for (const segment of content) {
        if (!segment || typeof segment !== 'object') continue;
        if (typeof segment.text === 'string') parts.push(segment.text);
      }
    }
    if (parts.length > 0) return parts.join('\n');
  }

  if (Array.isArray(payload.choices) && payload.choices[0]?.message?.content) {
    return String(payload.choices[0].message.content);
  }

  return JSON.stringify(payload, null, 2);
}

async function fetchJson(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  return { ok: response.ok, status: response.status, data };
}

export default function GatewayWorkbench() {
  const [loadingControl, setLoadingControl] = useState(true);
  const [health, setHealth] = useState<string>('unknown');
  const [providerCount, setProviderCount] = useState<number>(0);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [previousResponseId, setPreviousResponseId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  const [testerPreset, setTesterPreset] = useState<TesterPreset>(TESTER_PRESETS[0]);
  const [testerSurface, setTesterSurface] = useState<string>(TESTER_PRESETS[0].surface);
  const [testerMethod, setTesterMethod] = useState<'GET' | 'POST' | 'DELETE'>(TESTER_PRESETS[0].method);
  const [testerBody, setTesterBody] = useState<string>(TESTER_PRESETS[0].sampleBody || '');
  const [testerResult, setTesterResult] = useState<string>('');
  const [testerBusy, setTesterBusy] = useState(false);

  const modelOptions = useMemo(() => {
    return models.length > 0 ? models : ['openai/gpt-5-nano-2025-08-07'];
  }, [models]);

  useEffect(() => {
    void refreshControlData();
  }, []);

  async function refreshControlData() {
    setLoadingControl(true);

    try {
      const [healthRes, providersRes, modelsRes] = await Promise.all([
        fetchJson('/api/gateway/health'),
        fetchJson('/api/gateway/providers'),
        fetchJson('/api/gateway/models'),
      ]);

      if (healthRes.ok && typeof healthRes.data === 'object' && healthRes.data) {
        setHealth(String((healthRes.data as any).status || 'ok'));
      } else {
        setHealth(`error (${healthRes.status})`);
      }

      if (providersRes.ok && typeof providersRes.data === 'object' && providersRes.data) {
        const providers = Array.isArray((providersRes.data as any).providers)
          ? (providersRes.data as any).providers
          : [];
        setProviderCount(providers.length);
      } else {
        setProviderCount(0);
      }

      const discovered = pickModels(modelsRes.data);
      const deduped = Array.from(new Set(discovered)).sort((a, b) => a.localeCompare(b));
      setModels(deduped);
      if (!selectedModel && deduped.length > 0) {
        setSelectedModel(deduped[0]);
      }
    } catch (error) {
      setHealth('error');
      setProviderCount(0);
      setModels([]);
    } finally {
      setLoadingControl(false);
    }
  }

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chatInput.trim() || !selectedModel || chatBusy) return;

    const userMessage: ChatMessage = { role: 'user', content: chatInput.trim() };
    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput('');
    setChatBusy(true);
    setChatError(null);

    try {
      const body: Record<string, unknown> = {
        model: selectedModel,
        input: userMessage.content,
      };
      if (previousResponseId) {
        body.previous_response_id = previousResponseId;
      }

      const response = await fetchJson('/api/gateway/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        setChatError(`Responses API error (${response.status})`);
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Request failed (${response.status}). Check gateway permissions for this model.` },
        ]);
        return;
      }

      const assistantText = extractResponseText(response.data);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: assistantText }]);

      const maybeId = (response.data as any)?.id;
      if (typeof maybeId === 'string' && maybeId.trim()) {
        setPreviousResponseId(maybeId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setChatError(message);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `Request failed: ${message}` }]);
    } finally {
      setChatBusy(false);
    }
  }

  function clearConversation() {
    setChatMessages([]);
    setPreviousResponseId(null);
    setChatError(null);
  }

  async function runTester(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTesterBusy(true);
    setTesterResult('');

    try {
      const init: RequestInit = { method: testerMethod };
      if (testerMethod !== 'GET') {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = testerBody.trim() ? testerBody : '{}';
      }

      const result = await fetchJson(`/api/gateway/${testerSurface}`, init);
      const pretty = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
      setTesterResult(`HTTP ${result.status}\n\n${pretty}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTesterResult(`Request failed: ${message}`);
    } finally {
      setTesterBusy(false);
    }
  }

  function applyPreset(preset: TesterPreset) {
    setTesterPreset(preset);
    setTesterMethod(preset.method);
    setTesterSurface(preset.surface);
    setTesterBody(preset.sampleBody || '');
  }

  return (
    <div className="panel-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>Gateway Control Routes</h2>
          <button className="button secondary" onClick={() => void refreshControlData()} disabled={loadingControl}>
            {loadingControl ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="metric-grid">
          <div className="metric-card">
            <span className="metric-label">Health</span>
            <strong>{health}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Providers</span>
            <strong>{providerCount}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Models</span>
            <strong>{models.length}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Responses API Chat (Model Discovery Driven)</h2>
          <button className="button secondary" onClick={clearConversation}>
            Clear Conversation
          </button>
        </div>

        <label className="field-label" htmlFor="model-select">Model</label>
        <select
          id="model-select"
          className="select"
          value={selectedModel}
          onChange={(event) => {
            setSelectedModel(event.target.value);
            setPreviousResponseId(null);
            setChatMessages([]);
          }}
        >
          {modelOptions.map((model) => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>

        <div className="chat-log">
          {chatMessages.length === 0 ? (
            <p className="muted">No messages yet. Send a prompt to start a Responses API conversation.</p>
          ) : (
            chatMessages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
                <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
                <p>{message.content}</p>
              </div>
            ))
          )}
        </div>

        <form onSubmit={sendChat} className="form-stack">
          <label className="field-label" htmlFor="chat-input">Prompt</label>
          <textarea
            id="chat-input"
            className="textarea"
            rows={4}
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder="Ask anything. The request is sent to /v1/responses with the selected model."
          />
          {chatError && <p className="error">{chatError}</p>}
          <button className="button" disabled={chatBusy || !selectedModel || !chatInput.trim()}>
            {chatBusy ? 'Sending...' : 'Send via Responses API'}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>All Surfaces Endpoint Tester</h2>
        </div>

        <div className="preset-row">
          {TESTER_PRESETS.map((preset) => (
            <button
              key={preset.label}
              className={`chip ${testerPreset.label === preset.label ? 'active' : ''}`}
              onClick={() => applyPreset(preset)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <form onSubmit={runTester} className="form-stack">
          <div className="inline-grid">
            <div>
              <label className="field-label" htmlFor="tester-method">Method</label>
              <select
                id="tester-method"
                className="select"
                value={testerMethod}
                onChange={(event) => setTesterMethod(event.target.value as 'GET' | 'POST' | 'DELETE')}
              >
                <option>GET</option>
                <option>POST</option>
                <option>DELETE</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="tester-surface">Surface</label>
              <input
                id="tester-surface"
                className="input"
                value={testerSurface}
                onChange={(event) => setTesterSurface(event.target.value)}
                placeholder="e.g. videos/models or music/generate"
              />
            </div>
          </div>

          <label className="field-label" htmlFor="tester-body">JSON Body (for non-GET)</label>
          <textarea
            id="tester-body"
            className="textarea"
            rows={10}
            value={testerBody}
            onChange={(event) => setTesterBody(event.target.value)}
          />

          <button className="button" disabled={testerBusy}>
            {testerBusy ? 'Calling Gateway...' : 'Run Request'}
          </button>
        </form>

        {testerResult ? (
          <pre className="result-block">{testerResult}</pre>
        ) : (
          <p className="muted">Run a request to inspect status and payload from any exposed surface.</p>
        )}
      </section>
    </div>
  );
}
