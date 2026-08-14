import { NextResponse } from 'next/server';

export function GET(): NextResponse {
  return NextResponse.json({
    service: 'dear-angel-web',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
