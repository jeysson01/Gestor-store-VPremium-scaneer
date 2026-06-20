import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { registerYapeReceived } from '@/lib/actions/yape-notifications';

const bodySchema = z.object({
  amount: z.number().positive(),
  secret: z.string().optional(),
});

/**
 * Webhook opcional para automatizar desde el celular (MacroDroid, Tasker, etc.)
 * cuando lee la notificación push de Yape y reenvía el monto aquí.
 */
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.YAPE_WEBHOOK_SECRET;
  const headerSecret = req.headers.get('x-yape-secret');
  const json = await req.json().catch(() => null);

  if (!json) {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'amount es requerido' }, { status: 400 });
  }

  const secret = parsed.data.secret ?? headerSecret;
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const result = await registerYapeReceived(parsed.data.amount, 'webhook');
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...result.data });
}
