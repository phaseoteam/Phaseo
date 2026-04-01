'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

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

export default function ChatClient() {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previousResponseId, setPreviousResponseId] = useState<string | null>(null);

  useEffect(() => {
    void loadModels();
  }, []);

  async function loadModels() {
    setError(null);
    const response = await fetch('/api/models');
    const data = await response.json();

    if (!response.ok) {
      setError(data?.message || 'Failed to load models');
      return;
    }

    const ids = Array.isArray(data.models) ? data.models : [];
    setModels(ids);
    if (ids.length > 0) setSelectedModel(ids[0]);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || !selectedModel || loading) return;

    const userMessage: ChatMessage = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          input: userMessage.content,
          previous_response_id: previousResponseId || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data?.message || `Gateway error (${response.status})`);
        return;
      }

      const text = extractResponseText(data);
      setMessages((prev) => [...prev, { role: 'assistant', content: text }]);

      if (typeof data?.id === 'string' && data.id.trim()) {
        setPreviousResponseId(data.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  const modelCountLabel = useMemo(() => `${models.length} model${models.length === 1 ? '' : 's'}`, [models]);

  return (
    <section className="panel">
      <h2>Web Chat App</h2>
      <p className="muted">
        Discovered {modelCountLabel} from `/v1/models` and chat via `/v1/responses`.
      </p>

      <div className="row">
        <select
          className="select"
          value={selectedModel}
          onChange={(event) => {
            setSelectedModel(event.target.value);
            setPreviousResponseId(null);
            setMessages([]);
          }}
          disabled={models.length === 0}
        >
          {models.length === 0 ? <option>No models found</option> : null}
          {models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
        <button className="button" onClick={() => void loadModels()} disabled={loading}>
          Refresh models
        </button>
      </div>

      <div className="chat-log">
        {messages.length === 0 ? (
          <div className="bubble assistant">
            <strong>Assistant</strong>
            <p>Send a prompt to start chatting with the selected model.</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`bubble ${message.role}`}>
              <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
              <p>{message.content}</p>
            </div>
          ))
        )}
      </div>

      <form onSubmit={onSubmit}>
        <textarea
          className="textarea"
          rows={4}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask anything..."
        />
        <div style={{ marginTop: 10 }}>
          <button className="button" disabled={loading || !input.trim() || !selectedModel}>
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
