import { AdminLayout } from '@/components/layout/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Shield, Key, FileText, ShieldCheck } from 'lucide-react';
import { UsersTab } from '@/components/users/UsersTab';
import { RolesTab } from '@/components/users/RolesTab';
import { TokensTab } from '@/components/users/TokensTab';
import { AuditTab } from '@/components/users/AuditTab';
import { SecurityTab } from '@/components/users/SecurityTab';

export default function UsersPermissions() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Usuários & Permissões</h1>
          <p className="text-muted-foreground mt-1">Gerencie usuários, perfis de acesso, tokens e auditoria</p>
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="h-4 w-4" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="roles" className="gap-1.5">
              <Shield className="h-4 w-4" />
              Perfis
            </TabsTrigger>
            <TabsTrigger value="tokens" className="gap-1.5">
              <Key className="h-4 w-4" />
              Tokens
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5">
              <FileText className="h-4 w-4" />
              Auditoria
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              Segurança
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users"><UsersTab /></TabsContent>
          <TabsContent value="roles"><RolesTab /></TabsContent>
          <TabsContent value="tokens"><TokensTab /></TabsContent>
          <TabsContent value="audit"><AuditTab /></TabsContent>
          <TabsContent value="security"><SecurityTab /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
