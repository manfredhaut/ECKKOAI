import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAdminAuth } from "../adminAuth/AdminAuthContext";

export function AdminProtectedRoute({ children }: { children: ReactNode }) {
  const { admin, loading } = useAdminAuth();

  if (loading) return null;
  if (!admin) return <Navigate to="/admin/login" replace />;

  return <>{children}</>;
}
