import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Upload, Eye, EyeOff } from 'lucide-react';

function FormField({ label, value, onChange, type = 'text', placeholder = '' }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="h-8 text-sm" />
    </div>
  );
}

interface Role {
  id: string;
  name: string;
}

interface UserCompleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingUser: any | null;
  roles: Role[];
  onSaved: () => void;
}

export function UserCompleteDialog({ open, onOpenChange, editingUser, roles, onSaved }: UserCompleteDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  // Basic fields (existing)
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRoleId, setFormRoleId] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Access / credentials
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formPasswordConfirm, setFormPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Personal data
  const [nomeSocial, setNomeSocial] = useState('');
  const [cpf, setCpf] = useState('');
  const [rg, setRg] = useState('');
  const [orgaoEmissor, setOrgaoEmissor] = useState('');
  const [dataEmissaoRg, setDataEmissaoRg] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [sexo, setSexo] = useState('');
  const [estadoCivil, setEstadoCivil] = useState('');
  const [nacionalidade, setNacionalidade] = useState('');
  const [naturalidade, setNaturalidade] = useState('');
  const [nomeMae, setNomeMae] = useState('');
  const [nomePai, setNomePai] = useState('');
  const [pisPasepNit, setPisPasepNit] = useState('');
  const [tituloEleitor, setTituloEleitor] = useState('');
  const [cnh, setCnh] = useState('');

  // Address
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [pais, setPais] = useState('Brasil');

  // Contact
  const [celular, setCelular] = useState('');
  const [emailCorporativo, setEmailCorporativo] = useState('');

  // Contract
  const [tipoVinculo, setTipoVinculo] = useState('');
  const [matriculaInterna, setMatriculaInterna] = useState('');
  const [cargo, setCargo] = useState('');
  const [cbo, setCbo] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [centroCusto, setCentroCusto] = useState('');
  const [dataAdmissao, setDataAdmissao] = useState('');
  const [dataInicioEfetivo, setDataInicioEfetivo] = useState('');
  const [tipoContrato, setTipoContrato] = useState('');
  const [jornada, setJornada] = useState('');
  const [salarioBase, setSalarioBase] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [banco, setBanco] = useState('');
  const [agencia, setAgencia] = useState('');
  const [conta, setConta] = useState('');
  const [tipoConta, setTipoConta] = useState('');

  // Partner
  const [percentualParticipacao, setPercentualParticipacao] = useState('');
  const [capitalIntegralizado, setCapitalIntegralizado] = useState('');
  const [proLabore, setProLabore] = useState('');
  const [dataEntradaSociedade, setDataEntradaSociedade] = useState('');
  const [tipoSocio, setTipoSocio] = useState('');

  // Doc URLs
  const [rgUrl, setRgUrl] = useState('');
  const [cpfUrl, setCpfUrl] = useState('');
  const [comprovanteResidenciaUrl, setComprovanteResidenciaUrl] = useState('');
  const [contratoTrabalhoUrl, setContratoTrabalhoUrl] = useState('');
  const [contratoSocialUrl, setContratoSocialUrl] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editingUser) {
      setFormName(editingUser.name || '');
      setFormEmail(editingUser.email || '');
      setFormPhone(editingUser.phone || '');
      setFormRoleId(editingUser.role_id || '');
      setFormUsername((editingUser as any).username || '');
      setFormNotes(editingUser.notes || '');
      setNomeSocial(editingUser.nome_social || '');
      setCpf(editingUser.cpf || '');
      setRg(editingUser.rg || '');
      setOrgaoEmissor(editingUser.orgao_emissor || '');
      setDataEmissaoRg(editingUser.data_emissao_rg || '');
      setDataNascimento(editingUser.data_nascimento || '');
      setSexo(editingUser.sexo || '');
      setEstadoCivil(editingUser.estado_civil || '');
      setNacionalidade(editingUser.nacionalidade || '');
      setNaturalidade(editingUser.naturalidade || '');
      setNomeMae(editingUser.nome_mae || '');
      setNomePai(editingUser.nome_pai || '');
      setPisPasepNit(editingUser.pis_pasep_nit || '');
      setTituloEleitor(editingUser.titulo_eleitor || '');
      setCnh(editingUser.cnh || '');
      setCep(editingUser.cep || '');
      setLogradouro(editingUser.logradouro || '');
      setNumero(editingUser.numero || '');
      setComplemento(editingUser.complemento || '');
      setBairro(editingUser.bairro || '');
      setCidade(editingUser.cidade || '');
      setEstado(editingUser.estado || '');
      setPais(editingUser.pais || 'Brasil');
      setCelular(editingUser.celular || '');
      setEmailCorporativo(editingUser.email_corporativo || '');
      setTipoVinculo(editingUser.tipo_vinculo || '');
      setMatriculaInterna(editingUser.matricula_interna || '');
      setCargo(editingUser.cargo || '');
      setCbo(editingUser.cbo || '');
      setDepartamento(editingUser.departamento || '');
      setCentroCusto(editingUser.centro_custo || '');
      setDataAdmissao(editingUser.data_admissao || '');
      setDataInicioEfetivo(editingUser.data_inicio_efetivo || '');
      setTipoContrato(editingUser.tipo_contrato || '');
      setJornada(editingUser.jornada || '');
      setSalarioBase(editingUser.salario_base?.toString() || '');
      setFormaPagamento(editingUser.forma_pagamento || '');
      setBanco(editingUser.banco || '');
      setAgencia(editingUser.agencia || '');
      setConta(editingUser.conta || '');
      setTipoConta(editingUser.tipo_conta || '');
      setPercentualParticipacao(editingUser.percentual_participacao?.toString() || '');
      setCapitalIntegralizado(editingUser.capital_integralizado?.toString() || '');
      setProLabore(editingUser.pro_labore?.toString() || '');
      setDataEntradaSociedade(editingUser.data_entrada_sociedade || '');
      setTipoSocio(editingUser.tipo_socio || '');
      setRgUrl(editingUser.rg_url || '');
      setCpfUrl(editingUser.cpf_url || '');
      setComprovanteResidenciaUrl(editingUser.comprovante_residencia_url || '');
      setContratoTrabalhoUrl(editingUser.contrato_trabalho_url || '');
      setContratoSocialUrl(editingUser.contrato_social_url || '');
    } else {
      // Reset all
      setFormName(''); setFormEmail(''); setFormPhone(''); setFormRoleId(''); setFormNotes('');
      setFormUsername(''); setFormPassword(''); setFormPasswordConfirm('');
      setUsernameError(''); setPasswordError('');
      setNomeSocial(''); setCpf(''); setRg(''); setOrgaoEmissor(''); setDataEmissaoRg('');
      setDataNascimento(''); setSexo(''); setEstadoCivil(''); setNacionalidade(''); setNaturalidade('');
      setNomeMae(''); setNomePai(''); setPisPasepNit(''); setTituloEleitor(''); setCnh('');
      setCep(''); setLogradouro(''); setNumero(''); setComplemento(''); setBairro(''); setCidade('');
      setEstado(''); setPais('Brasil'); setCelular(''); setEmailCorporativo('');
      setTipoVinculo(''); setMatriculaInterna(''); setCargo(''); setCbo(''); setDepartamento('');
      setCentroCusto(''); setDataAdmissao(''); setDataInicioEfetivo(''); setTipoContrato('');
      setJornada(''); setSalarioBase(''); setFormaPagamento(''); setBanco(''); setAgencia('');
      setConta(''); setTipoConta(''); setPercentualParticipacao(''); setCapitalIntegralizado('');
      setProLabore(''); setDataEntradaSociedade(''); setTipoSocio('');
      setRgUrl(''); setCpfUrl(''); setComprovanteResidenciaUrl('');
      setContratoTrabalhoUrl(''); setContratoSocialUrl('');
    }
  }, [open, editingUser]);

  // Username validation
  const validateUsername = (val: string) => {
    if (!val) { setUsernameError(''); return true; }
    if (val.length < 4) { setUsernameError('Mínimo 4 caracteres'); return false; }
    if (!/^[a-zA-Z0-9_]+$/.test(val)) { setUsernameError('Apenas letras, números e _'); return false; }
    setUsernameError('');
    return true;
  };

  // Password validation
  const validatePassword = (pwd: string, confirm: string) => {
    if (!pwd && !editingUser) { setPasswordError('Senha é obrigatória'); return false; }
    if (pwd && pwd.length < 8) { setPasswordError('Mínimo 8 caracteres'); return false; }
    if (pwd && !/[A-Z]/.test(pwd)) { setPasswordError('Deve conter ao menos 1 letra maiúscula'); return false; }
    if (pwd && !/[0-9]/.test(pwd)) { setPasswordError('Deve conter ao menos 1 número'); return false; }
    if (pwd && pwd !== confirm) { setPasswordError('Senhas não coincidem'); return false; }
    setPasswordError('');
    return true;
  };

  const buildUpdateData = () => {
    const data: Record<string, any> = {
      name: formName.trim(),
      email: formEmail.trim(),
      phone: formPhone.trim() || null,
      role_id: formRoleId || null,
      notes: formNotes.trim() || null,
      username: formUsername.trim() || null,
      nome_social: nomeSocial.trim() || null,
      cpf: cpf.trim() || null,
      rg: rg.trim() || null,
      orgao_emissor: orgaoEmissor.trim() || null,
      data_emissao_rg: dataEmissaoRg || null,
      data_nascimento: dataNascimento || null,
      sexo: sexo || null,
      estado_civil: estadoCivil || null,
      nacionalidade: nacionalidade.trim() || null,
      naturalidade: naturalidade.trim() || null,
      nome_mae: nomeMae.trim() || null,
      nome_pai: nomePai.trim() || null,
      pis_pasep_nit: pisPasepNit.trim() || null,
      titulo_eleitor: tituloEleitor.trim() || null,
      cnh: cnh.trim() || null,
      cep: cep.trim() || null,
      logradouro: logradouro.trim() || null,
      numero: numero.trim() || null,
      complemento: complemento.trim() || null,
      bairro: bairro.trim() || null,
      cidade: cidade.trim() || null,
      estado: estado.trim() || null,
      pais: pais.trim() || null,
      celular: celular.trim() || null,
      email_corporativo: emailCorporativo.trim() || null,
      tipo_vinculo: tipoVinculo || null,
      matricula_interna: matriculaInterna.trim() || null,
      cargo: cargo.trim() || null,
      cbo: cbo.trim() || null,
      departamento: departamento.trim() || null,
      centro_custo: centroCusto.trim() || null,
      data_admissao: dataAdmissao || null,
      data_inicio_efetivo: dataInicioEfetivo || null,
      tipo_contrato: tipoContrato || null,
      jornada: jornada.trim() || null,
      salario_base: salarioBase ? parseFloat(salarioBase) : null,
      forma_pagamento: formaPagamento || null,
      banco: banco.trim() || null,
      agencia: agencia.trim() || null,
      conta: conta.trim() || null,
      tipo_conta: tipoConta || null,
      percentual_participacao: percentualParticipacao ? parseFloat(percentualParticipacao) : null,
      capital_integralizado: capitalIntegralizado ? parseFloat(capitalIntegralizado) : null,
      pro_labore: proLabore ? parseFloat(proLabore) : null,
      data_entrada_sociedade: dataEntradaSociedade || null,
      tipo_socio: tipoSocio || null,
      rg_url: rgUrl || null,
      cpf_url: cpfUrl || null,
      comprovante_residencia_url: comprovanteResidenciaUrl || null,
      contrato_trabalho_url: contratoTrabalhoUrl || null,
      contrato_social_url: contratoSocialUrl || null,
    };
    return data;
  };

  const logChanges = async (userId: string, oldData: any, newData: Record<string, any>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !oldData) return;

    const changes: { user_id: string; field_name: string; old_value: string | null; new_value: string | null; changed_by: string }[] = [];
    for (const key of Object.keys(newData)) {
      const oldVal = oldData[key]?.toString() ?? null;
      const newVal = newData[key]?.toString() ?? null;
      if (oldVal !== newVal) {
        changes.push({
          user_id: userId,
          field_name: key,
          old_value: oldVal,
          new_value: newVal,
          changed_by: user.id,
        });
      }
    }
    if (changes.length > 0) {
      await supabase.from('user_audit_logs').insert(changes);
    }
  };

  const handleSave = async () => {
    if (!formName.trim() || !formEmail.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Nome e email são obrigatórios.' });
      return;
    }

    // Validate username
    if (formUsername && !validateUsername(formUsername)) {
      toast({ variant: 'destructive', title: 'Username inválido', description: usernameError });
      return;
    }

    // Validate password (required on create if username provided, optional on edit)
    if (!editingUser && formUsername && !validatePassword(formPassword, formPasswordConfirm)) {
      toast({ variant: 'destructive', title: 'Senha inválida', description: passwordError });
      return;
    }
    if (formPassword && !validatePassword(formPassword, formPasswordConfirm)) {
      toast({ variant: 'destructive', title: 'Senha inválida', description: passwordError });
      return;
    }

    if (percentualParticipacao && parseFloat(percentualParticipacao) > 100) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Percentual de participação não pode exceder 100%.' });
      return;
    }

    setSaving(true);
    try {
      const updateData = buildUpdateData();

      if (editingUser) {
        await logChanges(editingUser.id, editingUser, updateData);
        const { error } = await supabase.from('app_users').update(updateData).eq('id', editingUser.id);
        if (error) throw error;

        // Update password in Supabase Auth if provided
        if (formPassword) {
          const { data: authUserData } = await supabase.auth.getUser();
          if (authUserData?.user) {
            // Admin: use service role via edge function is preferred, but here we update via admin API
            // For now we record intent — the password can be reset via Supabase dashboard
            toast({ title: 'Usuário atualizado', description: formPassword ? 'Para alterar a senha, use o painel do Supabase Auth.' : undefined });
          }
        } else {
          toast({ title: 'Usuário atualizado' });
        }
      } else {
        if (!formPassword || !formEmail) {
          toast({ variant: 'destructive', title: 'Erro', description: 'Email e senha são obrigatórios para criar um usuário.' });
          setSaving(false);
          return;
        }

        // Use edge function with service role to properly create auth user + app_user
        const appUserData = {
          name: formName.trim(),
          ...updateData,
        };

        const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-create-user', {
          body: {
            email: formEmail.trim(),
            password: formPassword,
            appUserData,
          },
        });

        if (fnError || !fnData?.success) {
          throw new Error(fnData?.error || fnError?.message || 'Erro ao criar usuário');
        }

        toast({ title: 'Usuário criado com sucesso!', description: 'O usuário já pode fazer login.' });
      }
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDocUpload = async (field: string, setter: (v: string) => void, file: File) => {
    if (!editingUser) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Salve o usuário antes de enviar documentos.' });
      return;
    }
    setUploading(field);
    try {
      const ext = file.name.split('.').pop();
      const path = `${editingUser.user_id}/${field}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('user-documents').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('user-documents').getPublicUrl(path);
      setter(publicUrl);
      toast({ title: 'Documento enviado' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro no upload', description: err.message });
    } finally {
      setUploading(null);
    }
  };

  // DocUploadField kept inline since it depends on uploading/editingUser/handleDocUpload

  const DocUploadField = ({ label, value, setter, fieldKey }: { label: string; value: string; setter: (v: string) => void; fieldKey: string }) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input value={value} readOnly placeholder="Nenhum documento" className="h-8 text-sm flex-1" />
        <Button variant="outline" size="sm" className="h-8 px-2" disabled={!!uploading || !editingUser} asChild>
          <label className="cursor-pointer">
            {uploading === fieldKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleDocUpload(fieldKey, setter, file);
            }} />
          </label>
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingUser ? 'Editar Usuário Completo' : 'Novo Usuário'}</DialogTitle>
          <DialogDescription>Cadastro completo compatível com eSocial.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
            <TabsTrigger value="basic" className="text-xs">Básico</TabsTrigger>
            <TabsTrigger value="access" className="text-xs">Acesso</TabsTrigger>
            <TabsTrigger value="personal" className="text-xs">Pessoal</TabsTrigger>
            <TabsTrigger value="address" className="text-xs">Endereço</TabsTrigger>
            <TabsTrigger value="contract" className="text-xs">Contrato</TabsTrigger>
            <TabsTrigger value="bank" className="text-xs">Bancário</TabsTrigger>
            <TabsTrigger value="partner" className="text-xs">Societário</TabsTrigger>
            <TabsTrigger value="docs" className="text-xs">Documentos</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nome *" value={formName} onChange={setFormName} />
              <FormField label="Email *" value={formEmail} onChange={setFormEmail} type="email" />
              <FormField label="Telefone" value={formPhone} onChange={setFormPhone} />
              <FormField label="Celular" value={celular} onChange={setCelular} />
              <FormField label="Email Corporativo" value={emailCorporativo} onChange={setEmailCorporativo} type="email" />
              <div className="space-y-1">
                <Label className="text-xs">Perfil</Label>
                <Select value={formRoleId} onValueChange={setFormRoleId}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observações</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} className="text-sm" />
            </div>
          </TabsContent>

          {/* Access / Credentials Tab */}
          <TabsContent value="access" className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              O username permite login sem email. A senha é gerenciada pelo Supabase Auth.
            </div>
            <div className="grid grid-cols-1 gap-3">
              {/* Username */}
              <div className="space-y-1">
                <Label className="text-xs">Username {!editingUser && '(obrigatório para login por username)'}</Label>
                <Input
                  value={formUsername}
                  onChange={e => { setFormUsername(e.target.value); validateUsername(e.target.value); }}
                  placeholder="ex: joao_silva"
                  className="h-8 text-sm"
                />
                {usernameError && <p className="text-xs text-destructive">{usernameError}</p>}
                <p className="text-xs text-muted-foreground">Mín. 4 caracteres. Apenas letras, números e _</p>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <Label className="text-xs">Senha {editingUser ? '(deixe em branco para manter)' : '(obrigatória)'}</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={formPassword}
                    onChange={e => { setFormPassword(e.target.value); if (e.target.value || formPasswordConfirm) validatePassword(e.target.value, formPasswordConfirm); }}
                    placeholder="••••••••"
                    className="h-8 text-sm pr-8"
                  />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword(v => !v)}>
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Mín. 8 caracteres, 1 maiúscula, 1 número</p>
              </div>

              {/* Confirm password */}
              <div className="space-y-1">
                <Label className="text-xs">Confirmar Senha</Label>
                <div className="relative">
                  <Input
                    type={showPasswordConfirm ? 'text' : 'password'}
                    value={formPasswordConfirm}
                    onChange={e => { setFormPasswordConfirm(e.target.value); if (formPassword || e.target.value) validatePassword(formPassword, e.target.value); }}
                    placeholder="••••••••"
                    className="h-8 text-sm pr-8"
                  />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPasswordConfirm(v => !v)}>
                    {showPasswordConfirm ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="personal" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nome Social" value={nomeSocial} onChange={setNomeSocial} />
              <FormField label="CPF" value={cpf} onChange={setCpf} placeholder="000.000.000-00" />
              <FormField label="RG" value={rg} onChange={setRg} />
              <FormField label="Órgão Emissor" value={orgaoEmissor} onChange={setOrgaoEmissor} />
              <FormField label="Data Emissão RG" value={dataEmissaoRg} onChange={setDataEmissaoRg} type="date" />
              <FormField label="Data Nascimento" value={dataNascimento} onChange={setDataNascimento} type="date" />
              <div className="space-y-1">
                <Label className="text-xs">Sexo</Label>
                <Select value={sexo} onValueChange={setSexo}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="masculino">Masculino</SelectItem>
                    <SelectItem value="feminino">Feminino</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Estado Civil</Label>
                <Select value={estadoCivil} onValueChange={setEstadoCivil}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solteiro">Solteiro(a)</SelectItem>
                    <SelectItem value="casado">Casado(a)</SelectItem>
                    <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                    <SelectItem value="viuvo">Viúvo(a)</SelectItem>
                    <SelectItem value="uniao_estavel">União Estável</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <FormField label="Nacionalidade" value={nacionalidade} onChange={setNacionalidade} />
              <FormField label="Naturalidade" value={naturalidade} onChange={setNaturalidade} />
              <FormField label="Nome da Mãe" value={nomeMae} onChange={setNomeMae} />
              <FormField label="Nome do Pai" value={nomePai} onChange={setNomePai} />
              <FormField label="PIS/PASEP/NIT" value={pisPasepNit} onChange={setPisPasepNit} />
              <FormField label="Título de Eleitor" value={tituloEleitor} onChange={setTituloEleitor} />
              <FormField label="CNH" value={cnh} onChange={setCnh} />
            </div>
          </TabsContent>

          <TabsContent value="address" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="CEP" value={cep} onChange={setCep} placeholder="00000-000" />
              <FormField label="Logradouro" value={logradouro} onChange={setLogradouro} />
              <FormField label="Número" value={numero} onChange={setNumero} />
              <FormField label="Complemento" value={complemento} onChange={setComplemento} />
              <FormField label="Bairro" value={bairro} onChange={setBairro} />
              <FormField label="Cidade" value={cidade} onChange={setCidade} />
              <FormField label="Estado (UF)" value={estado} onChange={setEstado} placeholder="SP" />
              <FormField label="País" value={pais} onChange={setPais} />
            </div>
          </TabsContent>

          <TabsContent value="contract" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo de Vínculo</Label>
                <Select value={tipoVinculo} onValueChange={setTipoVinculo}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clt">CLT</SelectItem>
                    <SelectItem value="pj">PJ</SelectItem>
                    <SelectItem value="autonomo">Autônomo</SelectItem>
                    <SelectItem value="estagiario">Estagiário</SelectItem>
                    <SelectItem value="socio">Sócio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <FormField label="Matrícula Interna" value={matriculaInterna} onChange={setMatriculaInterna} />
              <FormField label="Cargo" value={cargo} onChange={setCargo} />
              <FormField label="CBO" value={cbo} onChange={setCbo} placeholder="Ex: 2524-05" />
              <FormField label="Departamento" value={departamento} onChange={setDepartamento} />
              <FormField label="Centro de Custo" value={centroCusto} onChange={setCentroCusto} />
              <FormField label="Data de Admissão" value={dataAdmissao} onChange={setDataAdmissao} type="date" />
              <FormField label="Data Início Efetivo" value={dataInicioEfetivo} onChange={setDataInicioEfetivo} type="date" />
              <div className="space-y-1">
                <Label className="text-xs">Tipo de Contrato</Label>
                <Select value={tipoContrato} onValueChange={setTipoContrato}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indeterminado">Indeterminado</SelectItem>
                    <SelectItem value="determinado">Determinado</SelectItem>
                    <SelectItem value="temporario">Temporário</SelectItem>
                    <SelectItem value="experiencia">Experiência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <FormField label="Jornada" value={jornada} onChange={setJornada} placeholder="44h semanais" />
              <FormField label="Salário Base (R$)" value={salarioBase} onChange={setSalarioBase} type="number" />
              <div className="space-y-1">
                <Label className="text-xs">Forma de Pagamento</Label>
                <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="bank" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Banco" value={banco} onChange={setBanco} />
              <FormField label="Agência" value={agencia} onChange={setAgencia} />
              <FormField label="Conta" value={conta} onChange={setConta} />
              <div className="space-y-1">
                <Label className="text-xs">Tipo de Conta</Label>
                <Select value={tipoConta} onValueChange={setTipoConta}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrente">Corrente</SelectItem>
                    <SelectItem value="poupanca">Poupança</SelectItem>
                    <SelectItem value="salario">Salário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="partner" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo de Sócio</Label>
                <Select value={tipoSocio} onValueChange={setTipoSocio}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="administrador">Administrador</SelectItem>
                    <SelectItem value="cotista">Cotista</SelectItem>
                    <SelectItem value="investidor">Investidor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <FormField label="% Participação" value={percentualParticipacao} onChange={setPercentualParticipacao} type="number" />
              <FormField label="Capital Integralizado (R$)" value={capitalIntegralizado} onChange={setCapitalIntegralizado} type="number" />
              <FormField label="Pró-Labore (R$)" value={proLabore} onChange={setProLabore} type="number" />
              <FormField label="Data Entrada na Sociedade" value={dataEntradaSociedade} onChange={setDataEntradaSociedade} type="date" />
            </div>
          </TabsContent>

          <TabsContent value="docs" className="space-y-3">
            <div className="grid grid-cols-1 gap-3">
              <DocUploadField label="RG (digitalizado)" value={rgUrl} setter={setRgUrl} fieldKey="rg_url" />
              <DocUploadField label="CPF (digitalizado)" value={cpfUrl} setter={setCpfUrl} fieldKey="cpf_url" />
              <DocUploadField label="Comprovante de Residência" value={comprovanteResidenciaUrl} setter={setComprovanteResidenciaUrl} fieldKey="comprovante_residencia_url" />
              <DocUploadField label="Contrato de Trabalho" value={contratoTrabalhoUrl} setter={setContratoTrabalhoUrl} fieldKey="contrato_trabalho_url" />
              <DocUploadField label="Contrato Social" value={contratoSocialUrl} setter={setContratoSocialUrl} fieldKey="contrato_social_url" />
            </div>
            {!editingUser && <p className="text-xs text-muted-foreground">Salve o usuário primeiro para habilitar o upload de documentos.</p>}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
