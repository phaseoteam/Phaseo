import { NextRequest, NextResponse } from 'next/server';
import { createResponse } from '@/lib/gateway';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const model = typeof body.model === 'string' ? body.model.trim() : '';
  if (!model) {
    return NextResponse.json({ error: 'missing_model' }, { status: 400 });
  }

  // The whole conversation goes with every turn: previous_response_id is not supported across providers.
  const messages = Array.isArray(body.input) ? (body.input as Array<Record<string, unknown>>) : [];
  const input = messages.flatMap((message) => {
    const role = message?.role;
    const content = typeof message?.content === 'string' ? message.content.trim() : '';
    return (role === 'user' || role === 'assistant') && content ? [{ role, content }] : [];
  });
  if (input.length === 0 || input[input.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'missing_input' }, { status: 400 });
  }

  const payload: Record<string, unknown> = { model, input };

  const upstream = await createResponse(payload);
  return NextResponse.json(upstream.data, { status: upstream.status });
}
