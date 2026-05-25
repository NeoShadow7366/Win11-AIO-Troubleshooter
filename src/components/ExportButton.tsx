import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileDown, Loader2 } from "lucide-react";
import { useToast } from "./ToastProvider";

export default function ExportButton() {
  const [generating, setGenerating] = useState(false);
  const { showToast } = useToast();

  const handleExport = async () => {
    setGenerating(true);
    try {
      const html = await invoke<string>("generate_system_report");
      
      // Create a Blob and trigger download
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      a.download = `System-Report-${timestamp}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast("System report exported successfully", "success");
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "Failed to generate report";
      showToast(msg, "error");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <button
      id="export-report-btn"
      onClick={handleExport}
      disabled={generating}
      className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium
                 bg-accent/10 text-accent/80 hover:bg-accent/20 hover:text-accent
                 disabled:opacity-50 transition-all duration-200 border border-accent/20"
      title="Export System Report as HTML"
    >
      {generating ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <FileDown className="w-3.5 h-3.5" />
      )}
      {generating ? "Generating..." : "Export Report"}
    </button>
  );
}
