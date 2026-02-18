import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const logStep = (step: string, details?: any) => {
  console.log(`[PIX-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

// =============================================
// AUDIT HELPER — grava em system_audit_logs
// =============================================
async function auditLog(event_type: string, entity_type: string, entity_id: string | null, payload: any, status: 'success' | 'warning' | 'error' = 'success') {
  try {
    await supabase.from('system_audit_logs').insert({
      event_type,
      entity_type,
      entity_id,
      payload_json: payload,
      status,
    });
  } catch (e) {
    console.error('[AUDIT] Failed to write audit log:', e);
  }
}

// =============================================
// IDEMPOTÊNCIA — verifica se evento já foi processado
// =============================================
async function isAlreadyProcessed(event_id: string, provider: 'efi' | 'stripe'): Promise<boolean> {
  const { data } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('event_id', event_id)
    .eq('provider', provider)
    .maybeSingle();
  return !!data;
}

async function markAsProcessed(event_id: string, provider: 'efi' | 'stripe') {
  await supabase.from('webhook_events').insert({ event_id, provider }).onConflict('event_id, provider').ignore();
}

// =============================================
// VERIFICAÇÃO DE ESTOQUE
// =============================================
async function checkStockForSubscription(subscriptionId: string): Promise<{ ok: boolean; details: any[] }> {
  const { data: items } = await supabase
    .from('subscription_items')
    .select('product_id, quantity, product:products(stock, name)')
    .eq('subscription_id', subscriptionId);

  if (!items || items.length === 0) return { ok: true, details: [] };

  const issues: any[] = [];
  for (const item of items) {
    const product = Array.isArray(item.product) ? item.product[0] : item.product;
    if (product && product.stock < item.quantity) {
      issues.push({ product_id: item.product_id, name: product.name, available: product.stock, required: item.quantity });
    }
  }
  return { ok: issues.length === 0, details: issues };
}

// =============================================
// CÁLCULO DE DATA DE ENTREGA
// =============================================
async function calculateDeliveryDate(): Promise<{ delivery_date: string; delivery_time_slot: string }> {
  const now = new Date();
  const { data: settingsData } = await supabase.from("system_settings").select("*");
  const settingsMap = new Map(settingsData?.map((s: any) => [s.key, s.value]) || []);

  const getValue = (key: string, defaultValue: any) => {
    const val = settingsMap.get(key);
    if (val === undefined || val === null) return defaultValue;
    if (typeof val === 'string') { try { return JSON.parse(val); } catch { return val; } }
    return val;
  };

  const horaLimite: string = getValue('hora_limite_entrega_dia', '12:00');
  const feriados: string[] = getValue('feriados', []);
  const [limitHour, limitMin] = horaLimite.split(':').map(Number);
  const limitMinutes = limitHour * 60 + (limitMin || 0);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let deliveryDate: Date;
  let timeSlot: string;

  if (currentMinutes <= limitMinutes) {
    deliveryDate = new Date(now);
    timeSlot = 'tarde';
  } else {
    deliveryDate = new Date(now);
    deliveryDate.setDate(deliveryDate.getDate() + 1);
    timeSlot = 'manha';
  }

  while (true) {
    const dow = deliveryDate.getDay();
    const dateStr = deliveryDate.toISOString().split('T')[0];
    if (dow !== 0 && dow !== 6 && !feriados.includes(dateStr)) break;
    deliveryDate.setDate(deliveryDate.getDate() + 1);
  }

  return { delivery_date: deliveryDate.toISOString().split('T')[0], delivery_time_slot: timeSlot };
}

function calculateNextSubscriptionDelivery(deliveryWeekday: string, deliveryWeekdays: string[] | null): string {
  const weekdayMap: Record<string, number> = {
    domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
  };

  const targetDays = deliveryWeekdays && deliveryWeekdays.length > 0
    ? deliveryWeekdays.map(d => weekdayMap[d]).filter(d => d !== undefined)
    : [weekdayMap[deliveryWeekday]].filter(d => d !== undefined);

  if (targetDays.length === 0) targetDays.push(1);

  const today = new Date();
  const candidate = new Date(today);
  candidate.setDate(candidate.getDate() + 1);

  for (let i = 0; i < 7; i++) {
    if (targetDays.includes(candidate.getDay())) {
      return candidate.toISOString().split('T')[0];
    }
    candidate.setDate(candidate.getDate() + 1);
  }

  candidate.setDate(today.getDate() + 7);
  return candidate.toISOString().split('T')[0];
}

serve(async (req) => {
  try {
    const body = await req.json();
    logStep("Pix webhook received", { body });

    const pixEvents = body.pix || [];

    for (const pixEvent of pixEvents) {
      const txid = pixEvent.txid;
      const valor = parseFloat(pixEvent.valor || '0');
      const endToEndId = pixEvent.endToEndId;

      logStep("Processing Pix event", { txid, valor, endToEndId });

      if (!txid) continue;

      // ── IDEMPOTÊNCIA ──
      const eventKey = endToEndId || txid;
      if (await isAlreadyProcessed(eventKey, 'efi')) {
        logStep("Event already processed, skipping", { eventKey });
        continue;
      }

      // Find order with this pix_transaction_id
      const { data: orders } = await supabase.from('orders')
        .select('id, total_amount')
        .eq('pix_transaction_id', txid)
        .limit(1);

      if (orders && orders.length > 0) {
        const order = orders[0];
        const delivery = await calculateDeliveryDate();

        await supabase.from('orders').update({
          payment_status: 'confirmado',
          payment_confirmed_at: new Date().toISOString(),
          delivery_date: delivery.delivery_date,
          delivery_time_slot: delivery.delivery_time_slot,
        }).eq('id', order.id);

        await markAsProcessed(eventKey, 'efi');
        await auditLog('pix_order_confirmed', 'order', order.id, { txid, endToEndId, delivery }, 'success');
        logStep("Order payment confirmed via Pix", { orderId: order.id, delivery });

      } else {
        // Check subscriptions
        const { data: subs } = await supabase.from('subscriptions')
          .select('id, delivery_weekday, delivery_weekdays, total_amount, status')
          .eq('pix_transaction_id', txid)
          .limit(1);

        if (subs && subs.length > 0) {
          const sub = subs[0];

          // ── VERIFICAÇÃO DE ESTOQUE ──
          const stockCheck = await checkStockForSubscription(sub.id);
          if (!stockCheck.ok) {
            logStep("Insufficient stock for subscription", { subscriptionId: sub.id, issues: stockCheck.details });
            await auditLog('pix_sub_stock_insuficiente', 'stock', sub.id, { txid, issues: stockCheck.details }, 'error');
            // Não bloquear a ativação por estoque (flag interna), mas registrar
          }

          const nextDelivery = calculateNextSubscriptionDelivery(sub.delivery_weekday, sub.delivery_weekdays);

          await supabase.from('subscriptions').update({
            status: 'ativa',
            next_delivery_date: nextDelivery,
            pix_recorrencia_autorizada: true,
            pix_recorrencia_status: 'ativa',
            pix_recorrencia_data_inicio: new Date().toISOString(),
            pix_recorrencia_valor_mensal: sub.total_amount,
          }).eq('id', sub.id);

          await markAsProcessed(eventKey, 'efi');
          await auditLog('pix_sub_ativada', 'subscription', sub.id, { txid, nextDelivery, stockOk: stockCheck.ok }, 'success');
          logStep("Subscription activated via Pix", { subscriptionId: sub.id, nextDelivery });

        } else {
          logStep("No order or subscription found for txid", { txid });
          await auditLog('pix_txid_nao_encontrado', 'webhook', null, { txid, endToEndId }, 'warning');
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    logStep("ERROR", { message: error?.message });
    await auditLog('pix_webhook_erro', 'webhook', null, { error: error?.message }, 'error').catch(() => {});
    return new Response(JSON.stringify({ error: error?.message || "Erro interno" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
