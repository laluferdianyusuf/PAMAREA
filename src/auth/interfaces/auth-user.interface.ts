export interface AuthUser {
  id: string;
  employeeNumber: string | null;
  fullName: string;
  username: string;
  email: string | null;
  phone: string | null;
  roleId: string;
  siteId: string | null;

  role: {
    id: string;
    name: string;
  };

  site: {
    id: string;
    code: string;
    name: string;
  } | null;

  sessionId: string;
}
