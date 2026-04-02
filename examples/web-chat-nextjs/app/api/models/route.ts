import { NextResponse } from 'next/server';
import { getGatewayModels } from '@/lib/gateway';

export async function GET() {
  try {
    const models = await getGatewayModels();
    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'models_fetch_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
