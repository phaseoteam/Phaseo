import { NextResponse } from 'next/server';
import { generateAuthUrl } from '@/lib/oauth';

export async function GET() {
  const authUrl = await generateAuthUrl();
  return NextResponse.redirect(authUrl);
}
