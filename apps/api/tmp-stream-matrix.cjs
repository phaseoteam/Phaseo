require('dotenv').config({ path: '.env.local' });

async function run(providerModel, path, body) {
  const res = await fetch('http://127.0.0.1:8787/v1' + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.GATEWAY_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.log(path, providerModel, 'status', res.status, await res.text());
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const chunks = [];
  const rawFrames = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      if (!frame.trim()) continue;
      rawFrames.push(frame);

      let data = '';
      for (const ln of frame.split(/\r?\n/)) {
        if (ln.startsWith('data:')) data += ln.slice(5).trim();
      }
      if (!data || data === '[DONE]') continue;
      try {
        chunks.push(JSON.parse(data));
      } catch {}
    }
  }

  if (path === '/chat/completions') {
    const toolChunks = chunks.filter((c) => Array.isArray(c?.choices?.[0]?.delta?.tool_calls));
    const ids = [...new Set(toolChunks.map((c) => c.choices[0].delta.tool_calls[0]?.id).filter(Boolean))];
    const names = [...new Set(toolChunks.map((c) => c.choices[0].delta.tool_calls[0]?.function?.name).filter(Boolean))];
    const finish = chunks.find((c) => c?.choices?.[0]?.finish_reason)?.choices?.[0]?.finish_reason ?? null;
    const hasUsage = chunks.some((c) => !!c?.usage);
    console.log(JSON.stringify({ path, providerModel, status: res.status, totalChunks: chunks.length, toolChunks: toolChunks.length, ids, names, finish, hasUsage }, null, 2));
  } else {
    const events = rawFrames.map((fr) => {
      let ev = 'message';
      for (const ln of fr.split(/\r?\n/)) {
        if (ln.startsWith('event:')) ev = ln.slice(6).trim();
      }
      return ev;
    });

    console.log(JSON.stringify({
      path,
      providerModel,
      status: res.status,
      totalFrames: rawFrames.length,
      events: events.slice(0, 20),
      hasAdded: events.includes('response.output_item.added'),
      hasDelta: events.includes('response.function_call_arguments.delta'),
      hasDoneArgs: events.includes('response.function_call_arguments.done'),
      hasItemDone: events.includes('response.output_item.done'),
    }, null, 2));
  }
}

(async () => {
  const providers = ['anthropic/claude-3-haiku', 'google/gemini-2.0-flash-lite', 'x-ai/grok-3-mini'];
  for (const model of providers) {
    await run(model, '/responses', {
      model,
      stream: true,
      input: 'Call get_weather for London and do not answer directly.',
      tools: [{
        type: 'function',
        name: 'get_weather',
        description: 'Get weather for a city',
        parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
      }],
      tool_choice: { type: 'function', name: 'get_weather' },
    });

    await run(model, '/chat/completions', {
      model,
      stream: true,
      messages: [{ role: 'user', content: 'Call get_weather for London and do not answer directly.' }],
      tools: [{
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather for a city',
          parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'get_weather' } },
    });
  }
})();
