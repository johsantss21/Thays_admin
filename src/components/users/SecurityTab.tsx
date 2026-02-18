import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Save, ShieldCheck } from 'lucide-react';

export function SecurityTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [maxAttempts, setMaxAttempts] = useState(5);
  const [lockoutMinutes, setLockoutMinutes] = useState(30);
  const [sessionTimeout, setSessionTimeout] = useState(480);
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await supabase.from('system_settings').select('key, value')
        .in('key', ['security_max_login_attempts', 'security_lockout_duration_minutes', 'security_session_timeout_minutes', 'security_require_password_change_first_login']);

      if (data) {
        const map = new Map(data.map(s => [s.key, s.value]));
        const parse = (key: string, def: any) => {
          const v = map.get(key);
          if (v === undefined || v === null) return def;
          if (typeof v === 'string') { try { return JSON.parse(v); } catch { return parseInt(v) || def; } }
          return v;
        };
        setMaxAttempts(parse('security_max_login_attempts', 5));
        setLockoutMinutes(parse('security_lockout_duration_minutes', 30));
        setSessionTimeout(parse('security_session_timeout_minutes', 480));
        setRequirePasswordChange(parse('security_require_password_change_first_login', true));
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const settings = [
        { key: 'security_max_login_attempts', value: maxAttempts, description: 'Máximo de tentativas de login antes de bloquear' },
        { key: 'security_lockout_duration_minutes', value: lockoutMinutes, description: 'Tempo de bloqueio em minutos' },
        { key: 'security_session_timeout_minutes', value: sessionTimeout, description: 'Tempo de expiração da sessão em minutos' },
        { key: 'security_require_password_change_first_login', value: requirePasswordChange, description: 'Exigir troca de senha no primeiro acesso' },
      ];
      for (const s of settings) {
        const { error } = await supabase.from('system_settings').upsert({ key: s.key, value: s.value as any, description: s.description }, { onConflict: 'key' });
        if (error) throw error;
      }
      toast({ title: 'Configurações de segurança salvas' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Política de Autenticação</CardTitle>
          <CardDescription>Configure as regras de segurança para login e sessão.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tentativas máximas de login</Label>
              <Input type="number" min={1} max={20} value={maxAttempts} onChange={e => setMaxAttempts(parseInt(e.target.value) || 5)} />
              <p className="text-xs text-muted-foreground">Após este número, o usuário será bloqueado temporariamente.</p>
            </div>
            <div className="space-y-2">
              <Label>Tempo de bloqueio (minutos)</Label>
              <Input type="number" min={1} max={1440} value={lockoutMinutes} onChange={e => setLockoutMinutes(parseInt(e.target.value) || 30)} />
              <p className="text-xs text-muted-foreground">Duração do bloqueio após tentativas excedidas.</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Expiração da sessão (minutos)</Label>
            <Input type="number" min={30} max={2880} value={sessionTimeout} onChange={e => setSessionTimeout(parseInt(e.target.value) || 480)} />
            <p className="text-xs text-muted-foreground">Tempo de inatividade antes de exigir novo login.</p>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={requirePasswordChange} onCheckedChange={setRequirePasswordChange} />
            <div>
              <Label>Exigir troca de senha no primeiro acesso</Label>
              <p className="text-xs text-muted-foreground">Novos usuários precisarão definir uma nova senha ao fazer login pela primeira vez.</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Configurações
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
