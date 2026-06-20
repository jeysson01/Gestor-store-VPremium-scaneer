import { NextRequest, NextResponse } from 'next/server';
import {
  getRecentYapeNotifications,
  getYapeNotificationsAfter,
} from '@/lib/actions/yape-notifications';

export async function GET(req: NextRequest) {
  const after = req.nextUrl.searchParams.get('after');

  if (after !== null) {
    const afterId = Number(after);
    const result = await getYapeNotificationsAfter(Number.isFinite(afterId) ? afterId : 0);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ notifications: result.data });
  }

  const result = await getRecentYapeNotifications();
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ notifications: result.data });
}
