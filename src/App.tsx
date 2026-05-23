import { useState } from "react";
import Layout from "./components/Layout";

export default function App() {
  const [activePage, setActivePage] = useState("dashboard");

  return (
    <Layout activePage={activePage} onNavigate={setActivePage} />
  );
}
