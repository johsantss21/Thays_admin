import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Printer, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PrintFilters {
  startDate: string;
  endDate: string;
  paymentStatus: string;
  deliveryStatus: string;
  paymentMethod: string;
}

export function OrderPrintReport() {
  const now = new Date();
  const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const today = now.toISOString().split('T')[0];

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<PrintFilters>({
    startDate: firstDay,
    endDate: today,
    paymentStatus: 'all',
    deliveryStatus: 'all',
    paymentMethod: 'all',
  });

  const update = (key: keyof PrintFilters, val: string) =>
    setFilters((f) => ({ ...f, [key]: val }));

  const handlePrint = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('orders')
        .select(`*, customer:customers(*), items:order_items(*, product:products(name, code))`)
        .gte('created_at', filters.startDate + 'T00:00:00')
        .lte('created_at', filters.endDate + 'T23:59:59')
        .order('delivery_date', { ascending: true });

      if (filters.paymentStatus !== 'all') query = query.eq('payment_status', filters.paymentStatus as any);
      if (filters.deliveryStatus !== 'all') query = query.eq('delivery_status', filters.deliveryStatus as any);
      if (filters.paymentMethod !== 'all') query = query.eq('payment_method', filters.paymentMethod as any);

      const { data: orders, error } = await query;
      if (error) throw error;
      if (!orders || orders.length === 0) {
        alert('Nenhum pedido encontrado com os filtros selecionados.');
        return;
      }

      // Get company info
      const { data: settingsData } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['empresa_nome', 'empresa_cnpj']);
      
      const settings: Record<string, string> = {};
      (settingsData || []).forEach((s: any) => {
        settings[s.key] = typeof s.value === 'string' ? s.value : JSON.stringify(s.value).replace(/"/g, '');
      });

      const companyName = settings['empresa_nome'] || 'Hidroponia Admin';
      const companyCnpj = settings['empresa_cnpj'] || '';

      // Group by delivery date
      const grouped = new Map<string, any[]>();
      orders.forEach((o: any) => {
        const key = o.delivery_date || 'sem-data';
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(o);
      });

      const fmtCurrency = (v: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

      const statusLabel = (s: string) => {
        const map: Record<string, string> = {
          pendente: 'Pendente', confirmado: 'Confirmado', recusado: 'Recusado', cancelado: 'Cancelado',
          aguardando: 'Aguardando', em_rota: 'Em Rota', entregue: 'Entregue',
        };
        return map[s] || s;
      };

      const pmLabel = (s: string | null) => {
        if (!s) return '—';
        const map: Record<string, string> = { pix: 'Pix', cartao: 'Cartão', boleto: 'Boleto', stripe: 'Stripe' };
        return map[s] || s;
      };

      // Totals
      const totalPedidos = orders.length;
      const totalFaturado = orders.filter((o: any) => o.payment_status === 'confirmado')
        .reduce((s: number, o: any) => s + Number(o.total_amount), 0);
      const totalCancelado = orders.filter((o: any) => o.payment_status === 'cancelado')
        .reduce((s: number, o: any) => s + Number(o.total_amount), 0);

      // Payment method totals
      const pmTotals = new Map<string, number>();
      orders.filter((o: any) => o.payment_status === 'confirmado').forEach((o: any) => {
        const pm = pmLabel(o.payment_method);
        pmTotals.set(pm, (pmTotals.get(pm) || 0) + Number(o.total_amount));
      });

      // Build HTML
      let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Pedidos</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #333; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  h2 { font-size: 14px; margin: 16px 0 8px; border-bottom: 2px solid #333; padding-bottom: 4px; }
  .header { border-bottom: 3px solid #333; padding-bottom: 10px; margin-bottom: 16px; }
  .header p { margin: 2px 0; color: #666; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; }
  th { background: #f5f5f5; font-size: 10px; }
  .items-table { margin-left: 20px; width: calc(100% - 20px); }
  .items-table th { background: #fafafa; }
  .totals { margin-top: 20px; border-top: 3px solid #333; padding-top: 12px; }
  .totals table { width: 50%; }
  .totals td { font-weight: bold; }
  @media print { body { margin: 10px; } }
</style></head><body>
<div class="header">
  <h1>${companyName}</h1>
  ${companyCnpj ? `<p>CNPJ: ${companyCnpj}</p>` : ''}
  <p>Relatório de Pedidos — Emitido em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
  <p>Período: ${format(new Date(filters.startDate + 'T12:00:00'), 'dd/MM/yyyy')} a ${format(new Date(filters.endDate + 'T12:00:00'), 'dd/MM/yyyy')}</p>
</div>`;

      const sortedDates = Array.from(grouped.keys()).sort();
      for (const dateKey of sortedDates) {
        const dayOrders = grouped.get(dateKey)!;
        const dateLabel = dateKey === 'sem-data' ? 'Sem data definida'
          : format(new Date(dateKey + 'T12:00:00'), "EEEE, dd/MM/yyyy", { locale: ptBR });

        html += `<h2>📅 ${dateLabel}</h2>`;

        for (const order of dayOrders) {
          const addr = [order.customer?.street, order.customer?.number, order.customer?.complement, order.customer?.neighborhood, order.customer?.city, order.customer?.state]
            .filter(Boolean).join(', ');

          html += `<table>
<tr><th>Pedido</th><td>${order.order_number}</td><th>Cliente</th><td>${order.customer?.name || '—'}</td></tr>
<tr><th>Endereço</th><td colspan="3">${addr || '—'}</td></tr>
<tr><th>Horário</th><td>${order.delivery_time_slot || '—'}</td><th>Pagamento</th><td>${pmLabel(order.payment_method)} — ${statusLabel(order.payment_status)}</td></tr>
<tr><th>Entrega</th><td>${statusLabel(order.delivery_status)}</td><th>Total</th><td><strong>${fmtCurrency(Number(order.total_amount))}</strong></td></tr>
</table>`;

          if (order.items && order.items.length > 0) {
            html += `<table class="items-table"><tr><th>Produto</th><th>Qtd</th><th>Unitário</th><th>Total</th></tr>`;
            for (const item of order.items) {
              html += `<tr><td>${item.product?.name || item.product?.code || '—'}</td><td>${item.quantity}</td><td>${fmtCurrency(Number(item.unit_price))}</td><td>${fmtCurrency(Number(item.total_price))}</td></tr>`;
            }
            html += `</table>`;
          }
        }
      }

      html += `<div class="totals"><h2>📊 Resumo do Período</h2><table>
<tr><td>Total de Pedidos</td><td>${totalPedidos}</td></tr>
<tr><td>Total Faturado</td><td>${fmtCurrency(totalFaturado)}</td></tr>
<tr><td>Total Cancelado</td><td>${fmtCurrency(totalCancelado)}</td></tr>`;
      pmTotals.forEach((val, key) => {
        html += `<tr><td>Total ${key}</td><td>${fmtCurrency(val)}</td></tr>`;
      });
      html += `</table></div></body></html>`;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
      }
    } catch (err) {
      console.error('Print error:', err);
      alert('Erro ao gerar relatório.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Printer className="h-4 w-4" />
          <span className="hidden sm:inline">Imprimir Relatório</span>
          <span className="sm:hidden">Relatório</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Relatório de Pedidos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data Início</label>
              <Input type="date" value={filters.startDate} onChange={(e) => update('startDate', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data Fim</label>
              <Input type="date" value={filters.endDate} onChange={(e) => update('endDate', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status Pagamento</label>
            <Select value={filters.paymentStatus} onValueChange={(v) => update('paymentStatus', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status Entrega</label>
            <Select value={filters.deliveryStatus} onValueChange={(v) => update('deliveryStatus', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="aguardando">Aguardando</SelectItem>
                <SelectItem value="em_rota">Em Rota</SelectItem>
                <SelectItem value="entregue">Entregue</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Forma de Pagamento</label>
            <Select value={filters.paymentMethod} onValueChange={(v) => update('paymentMethod', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="pix">Pix</SelectItem>
                <SelectItem value="cartao">Cartão</SelectItem>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handlePrint} disabled={loading} className="gap-2">
            <Printer className="h-4 w-4" />
            {loading ? 'Gerando...' : 'Gerar e Imprimir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
