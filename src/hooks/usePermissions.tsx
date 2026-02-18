import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Permission {
  resource: string;
  action: string;
}

export function usePermissions() {
  const { user, isAdmin } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPermissions([]);
      setLoading(false);
      return;
    }
    fetchPermissions();
  }, [user?.id]);

  const fetchPermissions = async () => {
    if (!user) return;
    try {
      // Get user's role permissions
      const { data: appUser } = await supabase
        .from('app_users')
        .select('id, role_id')
        .eq('user_id', user.id)
        .single();

      const perms: Permission[] = [];

      if (appUser?.role_id) {
        const { data: rolePerms } = await supabase
          .from('role_permissions')
          .select('permission_id, permissions(resource, action)')
          .eq('role_id', appUser.role_id);

        if (rolePerms) {
          for (const rp of rolePerms) {
            const p = rp.permissions as any;
            if (p) perms.push({ resource: p.resource, action: p.action });
          }
        }
      }

      // Get overrides
      if (appUser?.id) {
        const { data: overrides } = await supabase
          .from('user_permission_overrides')
          .select('effect, permissions(resource, action)')
          .eq('user_id', appUser.id);

        if (overrides) {
          for (const o of overrides) {
            const p = o.permissions as any;
            if (!p) continue;
            if (o.effect === 'deny') {
              const idx = perms.findIndex(x => x.resource === p.resource && x.action === p.action);
              if (idx >= 0) perms.splice(idx, 1);
            } else if (o.effect === 'allow') {
              if (!perms.find(x => x.resource === p.resource && x.action === p.action)) {
                perms.push({ resource: p.resource, action: p.action });
              }
            }
          }
        }
      }

      setPermissions(perms);
    } catch (err) {
      console.error('Error fetching permissions:', err);
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = useCallback((resource: string, action: string): boolean => {
    if (isAdmin) return true;
    return permissions.some(p => p.resource === resource && p.action === action);
  }, [permissions, isAdmin]);

  const can = hasPermission;

  return { permissions, loading, hasPermission, can };
}
