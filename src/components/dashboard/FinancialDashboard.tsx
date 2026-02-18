import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { DashboardFilters, DashboardFilterValues } from './DashboardFilters';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import {
  DollarSign, TrendingUp, TrendingDown, ShoppingCart, XCircle, RefreshCw,
  Pause, AlertTriangle, Target, Percent, CreditCard, Truck, Package, Clock
} from 'lucide-react';

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)',
  'hsl(262, 83%, 58%)',
  'hsl(199, 89%, 48%)',
];

export function FinancialDashboard() {
  const now = new Date();
  const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;

  const [filters, setFilters] = useState<DashboardFilterValues>({
    startDate: firstDay,
    endDate: lastDay,
    tipo: 'all',
    paymentStatus: 'all',
    deliveryStatus: 'all',
    paymentMethod: 'all',
    customerId: '',
  });

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => { fetchData(); }, [filters]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = filters;
      const startISO = startDate + 'T00:00:00';
      const endISO = endDate + 'T23:59:59';

      // Previous month for comparison
      const sd = new Date(startDate);
      const diff = new Date(endDate).getTime() - sd.getTime();
      const prevEnd = new Date(sd.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - diff);
      const prevStartStr = prevStart.toISOString().split('T')[0] + 'T00:00:00';
      const prevEndStr = prevEnd.toISOString().split('T')[0] + 'T23:59:59';

      const [ordersRes, subsRes, prevOrdersRes, prevSubsRes, productsRes, orderItemsRes] = await Promise.all([
        supabase.from('orders').select('*, customer:customers(customer_type, name)')
          .gte('created_at', startISO).lte('created_at', endISO),
        supabase.from('subscriptions').select('*, customer:customers(customer_type, name)')
          .gte('created_at', startISO).lte('created_at', endISO),
        supabase.from('orders').select('total_amount, payment_status')
          .gte('created_at', prevStartStr).lte('created_at', prevEndStr),
        supabase.from('subscriptions').select('total_amount, status')
          .gte('created_at', prevStartStr).lte('created_at', prevEndStr),
        supabase.from('products').select('stock, stock_min, name').eq('active', true),
        supabase.from('order_items').select('quantity, unit_price, total_price, product:products(name), order:orders(created_at, payment_status)')
      ]);

      // All-time subs for MRR
      const { data: allActiveSubs } = await supabase.from('subscriptions')
        .select('total_amount, status, frequency').eq('status', 'ativa');

      const orders = ordersRes.data || [];
      const subs = subsRes.data || [];
      const prevOrders = prevOrdersRes.data || [];
      const prevSubs = prevSubsRes.data || [];
      const products = productsRes.data || [];
      const orderItems = orderItemsRes.data || [];

      // Apply type filter
      const useOrders = filters.tipo === 'all' || filters.tipo === 'avulso';
      const useSubs = filters.tipo === 'all' || filters.tipo === 'assinatura';

      // Apply additional filters
      let fOrders = useOrders ? orders : [];
      let fSubs = useSubs ? subs : [];

      if (filters.paymentStatus !== 'all') {
        fOrders = fOrders.filter((o: any) => o.payment_status === filters.paymentStatus);
      }
      if (filters.deliveryStatus !== 'all') {
        fOrders = fOrders.filter((o: any) => o.delivery_status === filters.deliveryStatus);
      }
      if (filters.paymentMethod !== 'all') {
        fOrders = fOrders.filter((o: any) => o.payment_method === filters.paymentMethod);
      }

      // Financial cards
      const confirmedOrders = fOrders.filter((o: any) => o.payment_status === 'confirmado');
      const activeSubs = fSubs.filter((s: any) => s.status === 'ativa');
      const cancelledOrders = fOrders.filter((o: any) => o.payment_status === 'cancelado');
      const cancelledSubs = fSubs.filter((s: any) => s.status === 'cancelada');

      const fatAvulso = confirmedOrders.reduce((s: number, o: any) => s + Number(o.total_amount), 0);
      const fatAssinatura = activeSubs.reduce((s: number, o: any) => s + Number(o.total_amount), 0);
      const fatTotal = fatAvulso + fatAssinatura;

      const prevFat = prevOrders.filter((o: any) => o.payment_status === 'confirmado').reduce((s: number, o: any) => s + Number(o.total_amount), 0)
        + prevSubs.filter((s: any) => s.status === 'ativa').reduce((s: number, o: any) => s + Number(o.total_amount), 0);

      const crescimento = prevFat > 0 ? ((fatTotal - prevFat) / prevFat) * 100 : 0;

      const cancelCount = cancelledOrders.length + cancelledSubs.length;
      const totalCount = fOrders.length + fSubs.length;
      const cancelRate = totalCount > 0 ? (cancelCount / totalCount) * 100 : 0;
      const cancelValue = cancelledOrders.reduce((s: number, o: any) => s + Number(o.total_amount), 0)
        + cancelledSubs.reduce((s: number, o: any) => s + Number(o.total_amount), 0);

      const ticketMedio = confirmedOrders.length > 0 ? fatAvulso / confirmedOrders.length : 0;
      const ticketMedioSub = activeSubs.length > 0 ? fatAssinatura / activeSubs.length : 0;

      // MRR
      const allActive = allActiveSubs || [];
      const mrr = allActive.reduce((s: number, sub: any) => {
        const amt = Number(sub.total_amount);
        const freq = sub.frequency;
        if (freq === 'diaria') return s + amt * 22; // ~22 working days
        if (freq === 'semanal') return s + amt * 4;
        if (freq === 'quinzenal') return s + amt * 2;
        return s + amt;
      }, 0);

      // Sub statuses
      const pausedSubs = fSubs.filter((s: any) => s.status === 'pausada').length;
      const pendingSubs = fSubs.filter((s: any) => s.status === 'ativa').length; // simplification

      // Conversion rate (orders that led to subscriptions is approximate)
      const totalOrderCustomers = new Set(fOrders.map((o: any) => o.customer_id)).size;
      const subCustomers = new Set(fSubs.map((s: any) => s.customer_id)).size;
      const conversionRate = totalOrderCustomers > 0 ? (subCustomers / totalOrderCustomers) * 100 : 0;

      // Stock alerts
      const lowStock = products.filter((p: any) => p.stock <= p.stock_min);
      const futureConsumption = allActive.reduce((s: number, sub: any) => s + Number(sub.total_amount), 0);

      // Daily revenue chart
      const dailyMap = new Map<string, { avulso: number; assinatura: number }>();
      const current = new Date(startDate);
      const end = new Date(endDate);
      while (current <= end) {
        const key = current.toISOString().split('T')[0];
        dailyMap.set(key, { avulso: 0, assinatura: 0 });
        current.setDate(current.getDate() + 1);
      }

      confirmedOrders.forEach((o: any) => {
        const day = o.created_at.split('T')[0];
        if (dailyMap.has(day)) {
          dailyMap.get(day)!.avulso += Number(o.total_amount);
        }
      });
      activeSubs.forEach((s: any) => {
        const day = s.created_at.split('T')[0];
        if (dailyMap.has(day)) {
          dailyMap.get(day)!.assinatura += Number(s.total_amount);
        }
      });

      const dailyChart = Array.from(dailyMap.entries()).map(([date, vals]) => ({
        date: date.split('-').reverse().slice(0, 2).join('/'),
        avulso: vals.avulso,
        assinatura: vals.assinatura,
        total: vals.avulso + vals.assinatura,
      }));

      // Delivery by time slot
      const slotMap = new Map<string, number>();
      fOrders.forEach((o: any) => {
        if (o.delivery_time_slot) {
          slotMap.set(o.delivery_time_slot, (slotMap.get(o.delivery_time_slot) || 0) + 1);
        }
      });
      const deliveryBySlot = Array.from(slotMap.entries()).map(([slot, count]) => ({ name: slot, value: count }));

      // Cancellation reasons
      const cancelReasonMap = new Map<string, number>();
      cancelledOrders.forEach((o: any) => {
        const reason = o.cancellation_reason || 'Sem motivo';
        cancelReasonMap.set(reason, (cancelReasonMap.get(reason) || 0) + 1);
      });
      const cancelReasons = Array.from(cancelReasonMap.entries()).map(([reason, count]) => ({ reason, count }));

      // Payment method distribution
      const pmMap = new Map<string, number>();
      confirmedOrders.forEach((o: any) => {
        const pm = o.payment_method || 'N/A';
        pmMap.set(pm, (pmMap.get(pm) || 0) + Number(o.total_amount));
      });
      const paymentDist = Array.from(pmMap.entries()).map(([method, value]) => ({
        name: method === 'pix' ? 'Pix' : method === 'cartao' ? 'Cartão' : method === 'stripe' ? 'Stripe' : method === 'boleto' ? 'Boleto' : method,
        value
      }));

      // Top products
      const productSales = new Map<string, number>();
      orderItems.forEach((item: any) => {
        if (item.order?.payment_status === 'confirmado') {
          const name = item.product?.name || 'Desconhecido';
          productSales.set(name, (productSales.get(name) || 0) + item.quantity);
        }
      });
      const topProducts = Array.from(productSales.entries())
        .map(([name, qty]) => ({ name, quantity: qty }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      setData({
        fatTotal, fatAvulso, fatAssinatura, crescimento,
        cancelCount, cancelRate, cancelValue,
        ticketMedio, ticketMedioSub, mrr,
        activeSubs: activeSubs.length, pausedSubs, cancelledSubs: cancelledSubs.length,
        confirmedOrders: confirmedOrders.length,
        conversionRate,
        lowStock: lowStock.length,
        dailyChart, deliveryBySlot, cancelReasons, paymentDist, topProducts,
      });
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <DashboardFilters filters={filters} onChange={setFilters} />
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  const cards = [
    { title: 'Faturamento Total', value: fmt(data.fatTotal), sub: `Avulso: ${fmt(data.fatAvulso)} | Assinaturas: ${fmt(data.fatAssinatura)}`, icon: DollarSign, accent: 'text-emerald-600' },
    { title: 'Crescimento vs Período Anterior', value: `${data.crescimento >= 0 ? '+' : ''}${data.crescimento.toFixed(1)}%`, icon: data.crescimento >= 0 ? TrendingUp : TrendingDown, accent: data.crescimento >= 0 ? 'text-emerald-600' : 'text-destructive' },
    { title: 'Pedidos Confirmados', value: data.confirmedOrders, icon: ShoppingCart, accent: 'text-blue-600' },
    { title: 'Ticket Médio Avulso', value: fmt(data.ticketMedio), icon: Target, accent: 'text-purple-600' },
    { title: 'Ticket Médio Assinatura', value: fmt(data.ticketMedioSub), icon: Target, accent: 'text-indigo-600' },
    { title: 'MRR (Receita Recorrente)', value: fmt(data.mrr), icon: RefreshCw, accent: 'text-teal-600' },
    { title: 'Assinaturas Ativas', value: data.activeSubs, sub: `Pausadas: ${data.pausedSubs} | Canceladas: ${data.cancelledSubs}`, icon: RefreshCw, accent: 'text-green-600' },
    { title: 'Cancelamentos', value: data.cancelCount, sub: `${data.cancelRate.toFixed(1)}% taxa | ${fmt(data.cancelValue)} perdidos`, icon: XCircle, accent: 'text-destructive' },
    { title: 'Conversão → Assinatura', value: `${data.conversionRate.toFixed(1)}%`, icon: Percent, accent: 'text-orange-600' },
    { title: 'Estoque Baixo', value: data.lowStock, icon: AlertTriangle, accent: data.lowStock > 0 ? 'text-destructive' : 'text-emerald-600' },
  ];

  return (
    <div className="space-y-6">
      <DashboardFilters filters={filters} onChange={setFilters} />

      {/* Financial Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.title}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-4 w-4 ${c.accent} shrink-0`} />
                  <p className="text-xs font-medium text-muted-foreground truncate">{c.title}</p>
                </div>
                <p className="text-lg font-bold">{c.value}</p>
                {c.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Faturamento por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={data.dailyChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Area type="monotone" dataKey="avulso" name="Avulso" stackId="1" fill="hsl(var(--primary))" stroke="hsl(var(--primary))" fillOpacity={0.6} />
                <Area type="monotone" dataKey="assinatura" name="Assinatura" stackId="1" fill="hsl(142, 76%, 36%)" stroke="hsl(142, 76%, 36%)" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribuição por Forma de Pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            {data.paymentDist.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={data.paymentDist} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {data.paymentDist.map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Entregas por Janela de Horário</CardTitle>
          </CardHeader>
          <CardContent>
            {data.deliveryBySlot.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.deliveryBySlot}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Entregas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Motivos de Cancelamento</CardTitle>
          </CardHeader>
          <CardContent>
            {data.cancelReasons.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">Sem cancelamentos</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.cancelReasons} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="reason" tick={{ fontSize: 9 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="count" name="Qtd" fill="hsl(0, 84%, 60%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Produtos Mais Vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topProducts.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="quantity" name="Qtd" fill="hsl(262, 83%, 58%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
