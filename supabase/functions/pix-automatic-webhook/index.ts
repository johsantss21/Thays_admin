import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const logStep = (step: string, details?: any) => {
  console.log(`[PIX-AUTO-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
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
// IDEMPOTÊNCIA
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
// REMOVER ENTREGAS FUTURAS (ao pausar por falha)
// =============================================
async function removeFutureDeliveries(subscriptionId: string) {
  const today = new Date().toISOString().split('T')[0];
  const { error } = await supabase
    .from('subscription_deliveries')
    .delete()
    .eq('subscription_id', subscriptionId)
    .eq('delivery_status', 'aguardando')
    .gte('delivery_date', today);

  if (error) logStep("Error removing future deliveries", { error: error.message });
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

function generateMonthlyDeliveryDates(deliveryWeekday: string, deliveryWeekdays: string[] | null, count: number): string[] {
  const weekdayMap: Record<string, number> = {
    domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
  };

  const targetDays = deliveryWeekdays && deliveryWeekdays.length > 0
    ? deliveryWeekdays.map(d => weekdayMap[d]).filter(d => d !== undefined)
    : [weekdayMap[deliveryWeekday]].filter(d => d !== undefined);

  if (targetDays.length === 0) targetDays.push(1);

  const dates: string[] = [];
  const candidate = new Date();
  candidate.setDate(candidate.getDate() + 1);

  for (let i = 0; i < 35 && dates.length < count; i++) {
    if (targetDays.includes(candidate.getDay())) {
      dates.push(candidate.toISOString().split('T')[0]);
    }
    candidate.setDate(candidate.getDate() + 1);
  }

  return dates;
}

async function findSubscription(identifier: string) {
  const { data: subs } = await supabase.from('subscriptions')
    .select('id, delivery_weekday, delivery_weekdays, total_amount, status, pix_transaction_id, pix_autorizacao_id')
    .or(`pix_transaction_id.eq.${identifier},pix_autorizacao_id.eq.${identifier}`)
    .limit(1);
  return subs && subs.length > 0 ? subs[0] : null;
}

serve(async (req) => {
  try {
    const body = await req.json();
    logStep("Webhook received", { body });

    // ======================================================================
    // Handle REC events (recurrence status changes - webhookrec)
    // Blindagem financeira: só ativa se APROVADA
    // ======================================================================
    if (body.rec) {
      for (const recEvent of Array.isArray(body.rec) ? body.rec : [body.rec]) {
        const idRec = recEvent.idRec;
        const status = recEvent.status;
        logStep("REC event", { idRec, status });

        if (!idRec) continue;

        // ── IDEMPOTÊNCIA ──
        const eventKey = `rec_${idRec}_${status}`;
        if (await isAlreadyProcessed(eventKey, 'efi')) {
          logStep("REC event already processed, skipping", { eventKey });
          continue;
        }

        const sub = await findSubscription(idRec);
        if (!sub) {
          logStep("No subscription found for idRec", { idRec });
          await auditLog('rec_sub_nao_encontrada', 'webhook', null, { idRec, status }, 'warning');
          continue;
        }

        if (status === 'APROVADA') {
          // ── BLINDAGEM FINANCEIRA: verificar se pagamento imediato também foi confirmado ──
          const { data: fullSub } = await supabase.from('subscriptions')
            .select('status, pix_recorrencia_status')
            .eq('id', sub.id)
            .single();

          // Se já está ativa (pagamento imediato confirmado), ativa recorrência
          // Se não, marca aguardando_autorizacao via campo notes
          const newRecStatus = 'ativa';
          const newSubStatus = fullSub?.status === 'ativa' ? 'ativa' : 'pausada';

          await supabase.from('subscriptions').update({
            pix_recorrencia_autorizada: true,
            pix_recorrencia_status: newRecStatus,
            // Se estava pausada aguardando recorrência, ativa agora
            ...(fullSub?.status === 'pausada' ? { status: 'ativa' } : {}),
          }).eq('id', sub.id);

          await markAsProcessed(eventKey, 'efi');
          await auditLog('rec_aprovada', 'subscription', sub.id, { idRec, newSubStatus }, 'success');
          logStep("Recurrence approved", { subscriptionId: sub.id });

        } else if (status === 'REJEITADA' || status === 'CANCELADA') {
          // ── BLOQUEIO POR FALHA RECORRENTE ──
          await supabase.from('subscriptions').update({
            status: 'pausada',
            pix_recorrencia_autorizada: false,
            pix_recorrencia_status: status === 'REJEITADA' ? 'rejeitada' : 'cancelada',
          }).eq('id', sub.id);

          await removeFutureDeliveries(sub.id);
          await markAsProcessed(eventKey, 'efi');
          await auditLog('rec_rejeitada_sub_pausada', 'subscription', sub.id, { idRec, status }, 'error');
          logStep("Recurrence rejected/cancelled, subscription paused", { subscriptionId: sub.id, status });
        }
      }
    }

    // ======================================================================
    // Handle COBR events (recurring charge events - webhookcobr)
    // ======================================================================
    if (body.cobr) {
      for (const cobrEvent of Array.isArray(body.cobr) ? body.cobr : [body.cobr]) {
        const idRec = cobrEvent.idRec;
        const txid = cobrEvent.txid;
        const status = cobrEvent.status;
        logStep("COBR event", { idRec, txid, status });

        if (!idRec) continue;

        // ── IDEMPOTÊNCIA ──
        const eventKey = `cobr_${txid || idRec}_${status}`;
        if (await isAlreadyProcessed(eventKey, 'efi')) {
          logStep("COBR event already processed, skipping", { eventKey });
          continue;
        }

        const sub = await findSubscription(idRec);
        if (!sub) {
          logStep("No subscription found for cobr idRec", { idRec });
          await auditLog('cobr_sub_nao_encontrada', 'webhook', null, { idRec, txid, status }, 'warning');
          continue;
        }

        if (status === 'LIQUIDADA' || status === 'CONCLUIDA') {
          const { data: fullSub } = await supabase.from('subscriptions')
            .select('frequency, is_emergency, delivery_weekday, delivery_weekdays, delivery_time_slot, total_amount')
            .eq('id', sub.id)
            .single();

          // ── VERIFICAÇÃO DE ESTOQUE ──
          const stockCheck = await checkStockForSubscription(sub.id);
          if (!stockCheck.ok) {
            await auditLog('cobr_stock_insuficiente', 'stock', sub.id, { txid, issues: stockCheck.details }, 'error');
          }

          const freqMap: Record<string, number> = { diaria: 20, semanal: 4, quinzenal: 2, mensal: 1 };
          let monthlyDeliveries = 1;
          if (fullSub && !fullSub.is_emergency) {
            if (fullSub.delivery_weekdays && fullSub.delivery_weekdays.length > 0) {
              monthlyDeliveries = Math.round(fullSub.delivery_weekdays.length * 4.33);
            } else {
              monthlyDeliveries = freqMap[fullSub?.frequency || 'semanal'] || 4;
            }
          }

          const deliveryDates = generateMonthlyDeliveryDates(sub.delivery_weekday, sub.delivery_weekdays, monthlyDeliveries);
          const nextDelivery = deliveryDates[0] || calculateNextSubscriptionDelivery(sub.delivery_weekday, sub.delivery_weekdays);

          await supabase.from('subscriptions').update({
            next_delivery_date: nextDelivery,
            pix_recorrencia_status: 'ativa',
          }).eq('id', sub.id);

          const deliveryRecords = deliveryDates.map(date => ({
            subscription_id: sub.id,
            delivery_date: date,
            total_amount: sub.total_amount,
            payment_status: 'confirmado' as const,
            delivery_status: 'aguardando' as const,
          }));

          if (deliveryRecords.length > 0) {
            await supabase.from('subscription_deliveries').insert(deliveryRecords);
          }

          await markAsProcessed(eventKey, 'efi');
          await auditLog('cobr_paga', 'subscription', sub.id, { idRec, txid, deliveryCount: deliveryRecords.length, stockOk: stockCheck.ok }, 'success');
          logStep("Recurring charge paid, multiple deliveries scheduled", { subscriptionId: sub.id, deliveryCount: deliveryRecords.length });

        } else if (status === 'CANCELADA' || status === 'NAO_REALIZADA' || status === 'REJEITADA') {
          // ── BLOQUEIO AUTOMÁTICO POR FALHA RECORRENTE ──
          await supabase.from('subscriptions').update({
            status: 'pausada',
            pix_recorrencia_status: 'falha_cobranca',
          }).eq('id', sub.id);

          await removeFutureDeliveries(sub.id);
          await markAsProcessed(eventKey, 'efi');
          await auditLog('cobr_falha_sub_pausada', 'subscription', sub.id, { idRec, txid, status }, 'error');
          logStep("Recurring charge failed, subscription paused, future deliveries removed", { subscriptionId: sub.id, status });
        }
      }
    }

    // ======================================================================
    // Handle standard PIX events (fallback for /v2/cob confirmations)
    // ======================================================================
    if (body.pix) {
      for (const pixEvent of Array.isArray(body.pix) ? body.pix : [body.pix]) {
        const txid = pixEvent.txid;
        const endToEndId = pixEvent.endToEndId;
        logStep("Standard Pix event", { txid, endToEndId });

        if (!txid) continue;

        // ── IDEMPOTÊNCIA ──
        const eventKey = endToEndId || txid;
        if (await isAlreadyProcessed(eventKey, 'efi')) {
          logStep("PIX event already processed, skipping", { eventKey });
          continue;
        }

        const sub = await findSubscription(txid);
        if (sub && sub.status !== 'ativa') {
          const { data: fullSub } = await supabase.from('subscriptions')
            .select('frequency, is_emergency, delivery_weekdays')
            .eq('id', sub.id)
            .single();

          // ── VERIFICAÇÃO DE ESTOQUE ──
          const stockCheck = await checkStockForSubscription(sub.id);
          if (!stockCheck.ok) {
            await auditLog('pix_sub_stock_insuficiente', 'stock', sub.id, { txid, issues: stockCheck.details }, 'error');
          }

          const freqMap: Record<string, number> = { diaria: 20, semanal: 4, quinzenal: 2, mensal: 1 };
          let monthlyDeliveries = 1;
          if (fullSub && !fullSub.is_emergency) {
            if (fullSub.delivery_weekdays && fullSub.delivery_weekdays.length > 0) {
              monthlyDeliveries = Math.round(fullSub.delivery_weekdays.length * 4.33);
            } else {
              monthlyDeliveries = freqMap[fullSub?.frequency || 'semanal'] || 4;
            }
          }

          const deliveryDates = generateMonthlyDeliveryDates(sub.delivery_weekday, sub.delivery_weekdays, monthlyDeliveries);
          const nextDelivery = deliveryDates[0] || calculateNextSubscriptionDelivery(sub.delivery_weekday, sub.delivery_weekdays);

          // Ativa com status aguardando confirmação da recorrência
          await supabase.from('subscriptions').update({
            status: 'ativa',
            next_delivery_date: nextDelivery,
            pix_recorrencia_data_inicio: new Date().toISOString(),
            pix_recorrencia_valor_mensal: sub.total_amount,
            // Recorrência ainda não autorizada — será confirmada via REC event
            pix_recorrencia_autorizada: false,
            pix_recorrencia_status: 'aguardando_autorizacao',
          }).eq('id', sub.id);

          const deliveryRecords = deliveryDates.map(date => ({
            subscription_id: sub.id,
            delivery_date: date,
            total_amount: sub.total_amount,
            payment_status: 'confirmado' as const,
            delivery_status: 'aguardando' as const,
          }));

          if (deliveryRecords.length > 0) {
            await supabase.from('subscription_deliveries').insert(deliveryRecords);
          }

          await markAsProcessed(eventKey, 'efi');
          await auditLog('pix_sub_ativada_aguardando_rec', 'subscription', sub.id, { txid, nextDelivery, stockOk: stockCheck.ok }, 'success');
          logStep("Subscription activated (awaiting REC authorization)", { subscriptionId: sub.id, deliveryCount: deliveryRecords.length });
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    logStep("ERROR", { message: error?.message });
    await auditLog('pix_auto_webhook_erro', 'webhook', null, { error: error?.message }, 'error').catch(() => {});
    return new Response(JSON.stringify({ error: error?.message || "Erro interno" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
