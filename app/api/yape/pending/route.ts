import { NextResponse } from 'next/server';
import { getPendingApprovalPurchases } from '@/lib/actions/yape-notifications';

export async function GET() {
  const result = await getPendingApprovalPurchases();
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ pending: result.data, pendingList: result.data });
}
