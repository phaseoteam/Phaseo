import { NextRequest } from 'next/server';
import { proxyGatewayRequest } from '@/lib/gateway';

type RouteContext = {
  params: Promise<{ surface: string[] }> | { surface: string[] };
};

async function readSurface(context: RouteContext): Promise<string[]> {
  const params = await context.params;
  return params.surface ?? [];
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyGatewayRequest(request, await readSurface(context));
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyGatewayRequest(request, await readSurface(context));
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyGatewayRequest(request, await readSurface(context));
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyGatewayRequest(request, await readSurface(context));
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyGatewayRequest(request, await readSurface(context));
}
