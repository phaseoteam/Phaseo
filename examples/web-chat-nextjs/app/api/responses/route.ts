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

  const input = body.input;
  if (typeof input !== 'string' || !input.trim()) {
    return NextResponse.json({ error: 'missing_input' }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    model,
    input: input.trim(),
  };

  if (typeof body.previous_response_id === 'string' && body.previous_response_id.trim()) {
    payload.previous_response_id = body.previous_response_id.trim();
  }

  const upstream = await createResponse(payload);
  return NextResponse.json(upstream.data, { status: upstream.status });
}
