import { useState, useCallback } from "react";
import Layout from "./components/Layout";

const STORAGE_KEY = "aio-active-page";

export default function App() {
  const [activePage, setActivePage] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "dashboard";
    } catch {
      return "dashboard";
    }
  });

  const handleNavigate = useCallback((page: string) => {
    setActivePage(page);
    try {
      localStorage.setItem(STORAGE_KEY, page);
    } catch {
      // localStorage unavailable
    }
  }, []);

  return (
    <Layout activePage={activePage} onNavigate={handleNavigate} />
  );
}
