import { NextResponse } from 'next/server';
import { generateAuthUrl } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.redirect(await generateAuthUrl());
  } catch (error) {
    console.error('Could not start sign-in:', error);
    const message = error instanceof Error ? error.message : 'Could not start sign-in';
    return NextResponse.json({ error: 'oauth_start_failed', message }, { status: 500 });
  }
}
