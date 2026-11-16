export interface UserInfo {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  role_type: 'super_admin' | 'org_user' | 'tenant' | 'developer';
}

export interface OrganizationInfo {
  id: number;
  name: string;
  slug: string;
  org_type: 'agency' | 'owner' | 'promoter';
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  rccm: string | null;
  stamp_text: string | null;
  status: string;
  role_code: string;
  role_name: string;
  is_default: number;
}

export interface AuthState {
  user: UserInfo;
  organizations: OrganizationInfo[];
  twoFactorVerified?: boolean;
}

export interface SubscriptionPlan {
  id: number;
  code: string;
  name: string;
  tagline: string;
  price_monthly_xof: number;
  price_annual_xof: number;
  max_properties: number;
  max_tenants: number;
  max_users: number;
  features_json: string;
}

export type AppRoute =
  | 'public'
  | 'login'
  | 'register'
  | 'forgot-password'
  | 'legal'
  | 'dashboard'
  | 'properties'
  | 'buildings'
  | 'units'
  | 'tenants'
  | 'contracts'
  | 'invoices'
  | 'payments'
  | 'receipts'
  | 'expenses'
  | 'maintenance'
  | 'reports'
  | 'notifications'
  | 'users'
  | 'subscription'
  | 'settings'
  | 'tenant-portal'
  | 'super-admin'
  | 'developer';
