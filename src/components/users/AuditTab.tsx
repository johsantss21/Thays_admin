import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, FileText, ChevronDown, ChevronUp } from 'lucide-react';

interface AuditLog {
  id: string;
  actor_type: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  before_data: any;
  after_data: any;
  justification: string | null;
  ip: string | null;
  created_at: string;
  metadata: any;
}

export function AuditTab() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [filterAction, setFilterAction] = useState('all');
  const [filterResource, setFilterResource] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200);
      if (filterAction && filterAction !== 'all') query = query.eq('action', filterAction);
      if (filterResource && filterResource !== 'all') query = query.eq('resource_type', filterResource);
      if (filterDateFrom) query = query.gte('created_at', filterDateFrom);
      if (filterDateTo) query = query.lte('created_at', filterDateTo + 'T23:59:59');

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally { setLoading(false); }
  };

  const actionLabels: Record<string, string> = {
    USER_SUSPEND: 'Suspensão de usuário',
    USER_ACTIVATE: 'Ativação de usuário',
    USER_ROLE_CHANGE: 'Alteração de perfil',
    TOKEN_CREATE: 'Criação de token',
    TOKEN_REVOKE: 'Revogação de token',
    ORDER_CANCEL: 'Cancelamento de pedido',
    SETTINGS_UPDATE: 'Atualização de configurações',
    SUBSCRIPTION_STATUS_CHANGE: 'Alteração status assinatura',
  };

  const maskSensitive = (data: any): any => {
    if (!data || typeof data !== 'object') return data;
    const masked = { ...data };
    const sensitiveKeys = ['client_secret', 'token_hash', 'password', 'secret'];
    for (const key of Object.keys(masked)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        masked[key] = '****' + (typeof masked[key] === 'string' ? masked[key].slice(-4) : '');
      }
    }
    return masked;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Ação</label>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {Object.entries(actionLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Recurso</label>
              <Select value={filterResource} onValueChange={setFilterResource}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="users">Usuários</SelectItem>
                  <SelectItem value="api_tokens">Tokens</SelectItem>
                  <SelectItem value="orders">Pedidos</SelectItem>
                  <SelectItem value="subscriptions">Assinaturas</SelectItem>
                  <SelectItem value="settings">Configurações</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Data inicial</label>
              <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Data final</label>
              <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
            </div>
          </div>
          <Button onClick={fetchLogs} className="mt-3 gap-2" size="sm"><Search className="h-4 w-4" />Filtrar</Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : logs.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum registro de auditoria.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <Card key={log.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-3">
                <div
                  className="flex items-start justify-between gap-2 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">{actionLabels[log.action] || log.action}</span>
                      <Badge variant="outline" className="text-xs">{log.resource_type}</Badge>
                      <Badge variant="secondary" className="text-xs">{log.actor_type}</Badge>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                      <span>{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                      {log.justification && <span className="truncate max-w-[200px]">Motivo: {log.justification}</span>}
                    </div>
                  </div>
                  {expandedId === log.id ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                </div>
                {expandedId === log.id && (
                  <div className="mt-3 pt-3 border-t space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-muted-foreground">Actor ID:</span> <span className="font-mono">{log.actor_id.slice(0, 8)}...</span></div>
                      {log.resource_id && <div><span className="text-muted-foreground">Recurso ID:</span> <span className="font-mono">{log.resource_id.slice(0, 8)}...</span></div>}
                      {log.ip && <div><span className="text-muted-foreground">IP:</span> {log.ip}</div>}
                    </div>
                    {log.justification && (
                      <div><span className="text-muted-foreground font-medium">Justificativa:</span> <span>{log.justification}</span></div>
                    )}
                    {log.before_data && (
                      <div>
                        <span className="text-muted-foreground font-medium">Antes:</span>
                        <pre className="bg-muted p-2 rounded text-xs overflow-x-auto mt-1">{JSON.stringify(maskSensitive(log.before_data), null, 2)}</pre>
                      </div>
                    )}
                    {log.after_data && (
                      <div>
                        <span className="text-muted-foreground font-medium">Depois:</span>
                        <pre className="bg-muted p-2 rounded text-xs overflow-x-auto mt-1">{JSON.stringify(maskSensitive(log.after_data), null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
