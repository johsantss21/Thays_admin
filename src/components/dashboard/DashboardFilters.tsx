import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Filter, ChevronDown } from 'lucide-react';

export interface DashboardFilterValues {
  startDate: string;
  endDate: string;
  tipo: string;
  paymentStatus: string;
  deliveryStatus: string;
  paymentMethod: string;
  customerId: string;
}

interface Props {
  filters: DashboardFilterValues;
  onChange: (f: DashboardFilterValues) => void;
}

export function DashboardFilters({ filters, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const now = new Date();
  const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const update = (key: keyof DashboardFilterValues, val: string) =>
    onChange({ ...filters, [key]: val });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4" />
          Filtros
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-lg border bg-card">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Data Início</label>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => update('startDate', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Data Fim</label>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => update('endDate', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Tipo</label>
            <Select value={filters.tipo} onValueChange={(v) => update('tipo', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="avulso">Pedidos Avulsos</SelectItem>
                <SelectItem value="assinatura">Assinaturas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status Pagamento</label>
            <Select value={filters.paymentStatus} onValueChange={(v) => update('paymentStatus', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="recusado">Recusado</SelectItem>
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
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="stripe">Stripe</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
