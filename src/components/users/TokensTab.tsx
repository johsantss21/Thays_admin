import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Key, Copy, Eye, EyeOff, ShieldX } from 'lucide-react';

interface ApiToken {
  id: string;
  name: string;
  token_preview: string;
  status: string;
  scopes: string[] | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  role_id: string | null;
  roles?: { name: string } | null;
}

interface Role {
  id: string;
  name: string;
}

export function TokensTab() {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeDialog, setRevokeDialog] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [saving, setSaving] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formRoleId, setFormRoleId] = useState('');
  const [formExpires, setFormExpires] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [tokensRes, rolesRes] = await Promise.all([
        supabase.from('api_tokens').select('*, roles(name)').order('created_at', { ascending: false }),
        supabase.from('roles').select('id, name'),
      ]);
      if (tokensRes.data) setTokens(tokensRes.data as any);
      if (rolesRes.data) setRoles(rolesRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const generateToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = 'hvt_';
    for (let i = 0; i < 48; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
    return token;
  };

  const hashToken = async (token: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleCreate = async () => {
    if (!formName.trim()) { toast({ variant: 'destructive', title: 'Nome obrigatório' }); return; }
    setSaving(true);
    try {
      const token = generateToken();
      const tokenHash = await hashToken(token);
      const preview = token.slice(-4);

      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('api_tokens').insert({
        name: formName.trim(),
        token_hash: tokenHash,
        token_preview: preview,
        role_id: formRoleId || null,
        created_by_user_id: user?.id,
        expires_at: formExpires || null,
      });
      if (error) throw error;

      // Audit
      await supabase.from('audit_logs').insert({
        actor_type: 'user', actor_id: user!.id,
        action: 'TOKEN_CREATE', resource_type: 'api_tokens',
        justification: `Token criado: ${formName.trim()}`,
      });

      setNewToken(token);
      setCreateOpen(false);
      fetchData();
      toast({ title: 'Token criado com sucesso' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally { setSaving(false); }
  };

  const handleRevoke = async () => {
    if (!revokeDialog || !justification.trim()) {
      toast({ variant: 'destructive', title: 'Justificativa obrigatória' }); return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('api_tokens').update({
        status: 'revogado', revoked_at: new Date().toISOString(), revoked_by: user?.id, revocation_reason: justification.trim(),
      }).eq('id', revokeDialog);
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        actor_type: 'user', actor_id: user!.id,
        action: 'TOKEN_REVOKE', resource_type: 'api_tokens', resource_id: revokeDialog,
        justification: justification.trim(),
      });

      setRevokeDialog(null); setJustification('');
      fetchData();
      toast({ title: 'Token revogado' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <p className="text-sm text-muted-foreground">Tokens de API para integrações (n8n, agentes, etc.).</p>
        <Button onClick={() => { setFormName(''); setFormRoleId(''); setFormExpires(''); setCreateOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" />Gerar Token
        </Button>
      </div>

      {/* Show new token once */}
      {newToken && (
        <Card className="border-primary">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              <span className="font-medium text-primary">Token gerado — copie agora! Ele não será exibido novamente.</span>
            </div>
            <div className="flex gap-2">
              <Input readOnly value={newToken} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(newToken); toast({ title: 'Copiado!' }); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setNewToken(null)}>Fechar</Button>
          </CardContent>
        </Card>
      )}

      {tokens.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum token criado.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {tokens.map(t => (
            <Card key={t.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Key className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{t.name}</span>
                      {t.status === 'ativo' ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Ativo</Badge>
                      ) : (
                        <Badge variant="destructive">Revogado</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                      <span>****{t.token_preview}</span>
                      <span>Perfil: {(t.roles as any)?.name || '—'}</span>
                      {t.last_used_at && <span>Último uso: {new Date(t.last_used_at).toLocaleDateString('pt-BR')}</span>}
                      {t.expires_at && <span>Expira: {new Date(t.expires_at).toLocaleDateString('pt-BR')}</span>}
                    </div>
                  </div>
                  {t.status === 'ativo' && (
                    <Button variant="destructive" size="sm" onClick={() => { setRevokeDialog(t.id); setJustification(''); }} className="gap-1">
                      <ShieldX className="h-3 w-3" />Revogar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Novo Token</DialogTitle>
            <DialogDescription>Configure o token de integração.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome *</Label><Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="ex: n8n_atendimento" /></div>
            <div>
              <Label>Perfil de Permissão</Label>
              <Select value={formRoleId} onValueChange={setFormRoleId}>
                <SelectTrigger><SelectValue placeholder="Selecione um perfil" /></SelectTrigger>
                <SelectContent>{roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Data de Expiração (opcional)</Label><Input type="datetime-local" value={formExpires} onChange={e => setFormExpires(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Gerar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Dialog */}
      <Dialog open={!!revokeDialog} onOpenChange={() => setRevokeDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revogar Token</DialogTitle>
            <DialogDescription>Esta ação é irreversível e será registrada em auditoria.</DialogDescription>
          </DialogHeader>
          <div><Label>Justificativa *</Label><Textarea value={justification} onChange={e => setJustification(e.target.value)} rows={3} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeDialog(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={saving || !justification.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Revogar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
