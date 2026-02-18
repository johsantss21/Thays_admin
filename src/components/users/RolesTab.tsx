import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Edit, Shield } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

interface Role {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
}

interface Permission {
  id: string;
  resource: string;
  action: string;
  description: string | null;
}

export function RolesTab() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedPermIds, setSelectedPermIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [rolesRes, permsRes, rpRes] = await Promise.all([
        supabase.from('roles').select('*').order('name'),
        supabase.from('permissions').select('*').order('resource, action'),
        supabase.from('role_permissions').select('role_id, permission_id'),
      ]);
      if (rolesRes.data) setRoles(rolesRes.data);
      if (permsRes.data) setPermissions(permsRes.data);
      if (rpRes.data) {
        const map: Record<string, string[]> = {};
        rpRes.data.forEach(rp => {
          if (!map[rp.role_id]) map[rp.role_id] = [];
          map[rp.role_id].push(rp.permission_id);
        });
        setRolePermissions(map);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditingRole(null); setFormName(''); setFormDescription('');
    setDialogOpen(true);
  };

  const openEdit = (r: Role) => {
    setEditingRole(r); setFormName(r.name); setFormDescription(r.description || '');
    setDialogOpen(true);
  };

  const openPerms = (r: Role) => {
    setSelectedRole(r);
    setSelectedPermIds([...(rolePermissions[r.id] || [])]);
    setPermDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast({ variant: 'destructive', title: 'Nome obrigatório' }); return; }
    setSaving(true);
    try {
      if (editingRole) {
        const { error } = await supabase.from('roles').update({ name: formName.trim(), description: formDescription.trim() || null }).eq('id', editingRole.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('roles').insert({ name: formName.trim(), description: formDescription.trim() || null });
        if (error) throw error;
      }
      setDialogOpen(false);
      fetchData();
      toast({ title: editingRole ? 'Perfil atualizado' : 'Perfil criado' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally { setSaving(false); }
  };

  const handleSavePerms = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      // Delete existing
      await supabase.from('role_permissions').delete().eq('role_id', selectedRole.id);
      // Insert new
      if (selectedPermIds.length > 0) {
        const rows = selectedPermIds.map(pid => ({ role_id: selectedRole.id, permission_id: pid }));
        const { error } = await supabase.from('role_permissions').insert(rows);
        if (error) throw error;
      }
      setPermDialogOpen(false);
      fetchData();
      toast({ title: 'Permissões atualizadas' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally { setSaving(false); }
  };

  const togglePerm = (permId: string) => {
    setSelectedPermIds(prev => prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]);
  };

  const toggleAllResource = (resource: string) => {
    const resourcePerms = permissions.filter(p => p.resource === resource);
    const allSelected = resourcePerms.every(p => selectedPermIds.includes(p.id));
    if (allSelected) {
      setSelectedPermIds(prev => prev.filter(id => !resourcePerms.find(p => p.id === id)));
    } else {
      const newIds = resourcePerms.map(p => p.id).filter(id => !selectedPermIds.includes(id));
      setSelectedPermIds(prev => [...prev, ...newIds]);
    }
  };

  // Group permissions by resource
  const groupedPerms = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    if (!acc[p.resource]) acc[p.resource] = [];
    acc[p.resource].push(p);
    return acc;
  }, {});

  const resourceLabels: Record<string, string> = {
    products: 'Produtos', customers: 'Clientes', orders: 'Pedidos',
    subscriptions: 'Assinaturas', deliveries: 'Entregas', dashboard: 'Dashboard',
    settings: 'Configurações', users: 'Usuários', roles: 'Perfis',
    tokens: 'Tokens', audit: 'Auditoria', reports: 'Relatórios',
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Gerencie perfis de acesso e suas permissões.</p>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />Novo Perfil</Button>
      </div>

      <div className="space-y-3">
        {roles.map(r => (
          <Card key={r.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="font-medium">{r.name}</span>
                    {r.is_system && <Badge variant="secondary" className="text-xs">Sistema</Badge>}
                  </div>
                  {r.description && <p className="text-sm text-muted-foreground mt-1">{r.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{(rolePermissions[r.id] || []).length} permissões</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openPerms(r)} className="gap-1">
                    <Shield className="h-3 w-3" />Permissões
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Role Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Editar Perfil' : 'Novo Perfil'}</DialogTitle>
            <DialogDescription>Defina o nome e descrição do perfil.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome *</Label><Input value={formName} onChange={e => setFormName(e.target.value)} /></div>
            <div><Label>Descrição</Label><Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Editor Dialog */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Permissões: {selectedRole?.name}</DialogTitle>
            <DialogDescription>Marque as permissões para este perfil.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {Object.entries(groupedPerms).map(([resource, perms]) => {
              const allChecked = perms.every(p => selectedPermIds.includes(p.id));
              const someChecked = perms.some(p => selectedPermIds.includes(p.id));
              return (
                <Collapsible key={resource} defaultOpen={someChecked}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted text-left">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={() => toggleAllResource(resource)}
                      onClick={e => e.stopPropagation()}
                    />
                    <span className="font-medium text-sm flex-1">{resourceLabels[resource] || resource}</span>
                    <Badge variant="outline" className="text-xs">{perms.filter(p => selectedPermIds.includes(p.id)).length}/{perms.length}</Badge>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-8 space-y-1 pb-2">
                    {perms.map(p => (
                      <label key={p.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                        <Checkbox checked={selectedPermIds.includes(p.id)} onCheckedChange={() => togglePerm(p.id)} />
                        <span>{p.description || `${p.resource}.${p.action}`}</span>
                      </label>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSavePerms} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar Permissões</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
