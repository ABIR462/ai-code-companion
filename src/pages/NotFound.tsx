import { Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";

export default function NotFound() {
  const location = useLocation();

  useEffect(() => {
    console.warn("[Matrix AI] 404 — no route matched:", location.pathname);
  }, [location.pathname]);

  return <Navigate to="/" replace />;
}
