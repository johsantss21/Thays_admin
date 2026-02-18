import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Search, UserCog, ShieldAlert, ShieldCheck, KeyRound, MoreVertical } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface AppUser {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  role_id: string | null;
  last_login_at: string | null;
  must_change_password: boolean;
  notes: string | null;
  created_at: string;
  roles?: { name: string } | null;
}

interface Role {
  id: string;
  name: string;
}

export function UsersTab() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [justificationDialog, setJustificationDialog] = useState<{ action: string; userId: string; data?: any } | null>(null);
  const [justification, setJustification] = useState('');
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRoleId, setFormRoleId] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        supabase.from('app_users').select('*, roles(name)').order('created_at', { ascending: false }),
        supabase.from('roles').select('id, name').order('name'),
      ]);
      if (usersRes.data) setUsers(usersRes.data as any);
      if (rolesRes.data) setRoles(rolesRes.data);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditingUser(null);
    setFormName(''); setFormEmail(''); setFormPhone(''); setFormRoleId(''); setFormNotes('');
    setDialogOpen(true);
  };

  const openEdit = (u: AppUser) => {
    setEditingUser(u);
    setFormName(u.name); setFormEmail(u.email); setFormPhone(u.phone || '');
    setFormRoleId(u.role_id || ''); setFormNotes(u.notes || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formEmail.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Nome e email são obrigatórios.' });
      return;
    }
    setSaving(true);
    try {
      if (editingUser) {
        const { error } = await supabase.from('app_users').update({
          name: formName.trim(),
          email: formEmail.trim(),
          phone: formPhone.trim() || null,
          role_id: formRoleId || null,
          notes: formNotes.trim() || null,
        }).eq('id', editingUser.id);
        if (error) throw error;
        toast({ title: 'Usuário atualizado' });
      } else {
        const { error } = await supabase.from('app_users').insert({
          user_id: crypto.randomUUID(), // placeholder, will be linked on first login
          name: formName.trim(),
          email: formEmail.trim(),
          phone: formPhone.trim() || null,
          role_id: formRoleId || null,
          notes: formNotes.trim() || null,
        });
        if (error) throw error;
        toast({ title: 'Usuário criado' });
      }
      setDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally { setSaving(false); }
  };

  const handleSensitiveAction = async () => {
    if (!justificationDialog || !justification.trim()) {
      toast({ variant: 'destructive', title: 'Justificativa obrigatória' });
      return;
    }
    setSaving(true);
    try {
      const { action, userId, data } = justificationDialog;
      let updateData: any = {};

      if (action === 'suspend') updateData = { status: 'suspenso' };
      else if (action === 'activate') updateData = { status: 'ativo' };
      else if (action === 'change_role') updateData = { role_id: data.role_id };

      const { error } = await supabase.from('app_users').update(updateData).eq('id', userId);
      if (error) throw error;

      // Log audit
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        actor_type: 'user',
        actor_id: user!.id,
        action: action === 'suspend' ? 'USER_SUSPEND' : action === 'activate' ? 'USER_ACTIVATE' : 'USER_ROLE_CHANGE',
        resource_type: 'users',
        resource_id: userId,
        justification: justification.trim(),
        after_data: updateData,
      });

      toast({ title: 'Ação executada com sucesso' });
      setJustificationDialog(null);
      setJustification('');
      fetchData();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally { setSaving(false); }
  };

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (status: string) => {
    if (status === 'ativo') return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Ativo</Badge>;
    if (status === 'suspenso') return <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">Suspenso</Badge>;
    return <Badge variant="destructive">Bloqueado</Badge>;
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar usuários..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />Novo Usuário</Button>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum usuário encontrado.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(u => (
            <Card key={u.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{u.name}</span>
                      {statusBadge(u.status)}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">{(u.roles as any)?.name || 'Sem perfil'}</Badge>
                      {u.last_login_at && (
                        <span className="text-xs text-muted-foreground">
                          Último login: {new Date(u.last_login_at).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(u)}>
                        <UserCog className="h-4 w-4 mr-2" />Editar
                      </DropdownMenuItem>
                      {u.status === 'ativo' ? (
                        <DropdownMenuItem onClick={() => { setJustificationDialog({ action: 'suspend', userId: u.id }); setJustification(''); }}>
                          <ShieldAlert className="h-4 w-4 mr-2" />Suspender
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => { setJustificationDialog({ action: 'activate', userId: u.id }); setJustification(''); }}>
                          <ShieldCheck className="h-4 w-4 mr-2" />Reativar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => {
                        toast({ title: 'Reset de senha', description: 'Funcionalidade via Supabase Auth — envie link de reset pelo dashboard.' });
                      }}>
                        <KeyRound className="h-4 w-4 mr-2" />Reset Senha
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
            <DialogDescription>Preencha os dados do usuário operador.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome *</Label><Input value={formName} onChange={e => setFormName(e.target.value)} /></div>
            <div><Label>Email *</Label><Input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} /></div>
            <div><Label>Telefone</Label><Input value={formPhone} onChange={e => setFormPhone(e.target.value)} /></div>
            <div>
              <Label>Perfil</Label>
              <Select value={formRoleId} onValueChange={setFormRoleId}>
                <SelectTrigger><SelectValue placeholder="Selecione um perfil" /></SelectTrigger>
                <SelectContent>
                  {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Observações</Label><Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Justification Dialog */}
      <Dialog open={!!justificationDialog} onOpenChange={() => setJustificationDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Justificativa Obrigatória</DialogTitle>
            <DialogDescription>Esta ação sensível será registrada em auditoria.</DialogDescription>
          </DialogHeader>
          <div><Label>Justificativa *</Label><Textarea value={justification} onChange={e => setJustification(e.target.value)} rows={3} placeholder="Descreva o motivo desta ação..." /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJustificationDialog(null)}>Cancelar</Button>
            <Button onClick={handleSensitiveAction} disabled={saving || !justification.trim()} variant="destructive">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
