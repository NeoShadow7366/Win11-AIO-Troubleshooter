import { useState, useRef, useEffect, useCallback } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import {
  ShieldCheck,
  Wrench,
  Wifi,
  RefreshCw,
  HardDrive,
  RefreshCcw,
  Trash2,
  Globe,
  Play,
  Loader2,
  Copy,
  Check,
  X,
} from "lucide-react";
import type { CliOutput } from "../types";

interface ToolDef {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const TOOLS: ToolDef[] = [
  {
    id: "sfc",
    label: "SFC Scan",
    description: "System File Checker — scan and repair protected system files",
    icon: <ShieldCheck className="w-5 h-5" />,
  },
  {
    id: "dism",
    label: "DISM Repair",
    description: "Deployment Image Servicing — repair the Windows component store",
    icon: <Wrench className="w-5 h-5" />,
  },
  {
    id: "flush_dns",
    label: "Flush DNS",
    description: "Clear the DNS resolver cache to fix name resolution issues",
    icon: <Wifi className="w-5 h-5" />,
  },
  {
    id: "reset_network",
    label: "Reset Winsock",
    description: "Reset Winsock catalog to resolve network socket problems",
    icon: <RefreshCw className="w-5 h-5" />,
  },
  {
    id: "chkdsk",
    label: "Check Disk",
    description: "Verify disk integrity and fix logical file system errors",
    icon: <HardDrive className="w-5 h-5" />,
  },
  {
    id: "gpupdate",
    label: "GP Update",
    description: "Force a Group Policy refresh on this machine",
    icon: <RefreshCcw className="w-5 h-5" />,
  },
  {
    id: "disk_cleanup",
    label: "Disk Cleanup",
    description: "Remove temporary files and free up disk space",
    icon: <Trash2 className="w-5 h-5" />,
  },
  {
    id: "reset_ip",
    label: "Reset IP",
    description: "Reset TCP/IP stack to default configuration",
    icon: <Globe className="w-5 h-5" />,
  },
];

interface OutputLine {
  type: "stdout" | "stderr" | "info";
  text: string;
}

export default function QuickTools() {
  const [runningTool, setRunningTool] = useState<string | null>(null);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [copied, setCopied] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  const runTool = useCallback(async (toolId: string) => {
    if (runningTool) return;

    const tool = TOOLS.find((t) => t.id === toolId);
    setRunningTool(toolId);
    setOutput([
      {
        type: "info",
        text: `▸ Running ${tool?.label || toolId}...`,
      },
    ]);

    try {
      const onOutput = new Channel<CliOutput>();

      onOutput.onmessage = (msg: CliOutput) => {
        switch (msg.type) {
          case "Stdout":
            setOutput((prev) => [...prev, { type: "stdout", text: msg.line }]);
            break;
          case "Stderr":
            setOutput((prev) => [...prev, { type: "stderr", text: msg.line }]);
            break;
          case "Complete":
            setOutput((prev) => [
              ...prev,
              {
                type: "info",
                text: `\n✓ Process exited with code ${msg.exit_code}`,
              },
            ]);
            setRunningTool(null);
            break;
          case "Error":
            setOutput((prev) => [
              ...prev,
              { type: "stderr", text: `Error: ${msg.message}` },
            ]);
            setRunningTool(null);
            break;
        }
      };

      await invoke("run_cli_tool", { toolId, onOutput });
    } catch (err) {
      setOutput((prev) => [
        ...prev,
        { type: "stderr", text: `Failed to start: ${err}` },
      ]);
      setRunningTool(null);
    }
  }, [runningTool]);

  const clearTerminal = () => setOutput([]);

  const copyOutput = async () => {
    const text = output.map((l) => l.text).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may fail */
    }
  };

  return (
    <div className="flex flex-col gap-5 h-full animate-fade-in">
      {/* Tool Grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {TOOLS.map((tool) => {
          const isRunning = runningTool === tool.id;
          const disabled = runningTool !== null && !isRunning;
          return (
            <div
              key={tool.id}
              className={`glass-panel flex flex-col gap-3 p-4
                         transition-all duration-300 group
                         ${isRunning ? "border-accent/30 bg-accent/[0.04]" : ""}
                         ${disabled ? "opacity-50" : "hover:bg-white/[0.05]"}`}
            >
              <div className="flex items-center justify-between">
                <div className={`flex items-center justify-center w-9 h-9 rounded-lg
                                transition-colors duration-300
                                ${isRunning
                                  ? "bg-accent/20 text-accent"
                                  : "bg-white/[0.06] text-white/50 group-hover:text-white/70"
                                }`}>
                  {isRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : tool.icon}
                </div>
              </div>

              <div>
                <h3 className="text-[13.5px] font-semibold text-white/85 mb-0.5">
                  {tool.label}
                </h3>
                <p className="text-[11.5px] text-white/35 leading-relaxed line-clamp-2">
                  {tool.description}
                </p>
              </div>

              <button
                id={`run-${tool.id}`}
                onClick={() => runTool(tool.id)}
                disabled={disabled || isRunning}
                className={`flex items-center justify-center gap-1.5 h-8 w-full rounded-lg
                           text-[12px] font-semibold transition-all duration-200
                           ${isRunning
                             ? "bg-accent/20 text-accent cursor-wait"
                             : "bg-white/[0.06] text-white/60 hover:bg-accent/15 hover:text-accent border border-white/[0.06] hover:border-accent/30"
                           }
                           disabled:cursor-not-allowed`}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Run
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Terminal Output */}
      <div className="flex flex-col flex-1 glass-panel overflow-hidden min-h-[180px]">
        {/* Terminal header */}
        <div className="flex items-center justify-between px-4 h-9 border-b border-white/[0.06]
                        bg-white/[0.02] shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-danger/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
            </div>
            <span className="text-[11px] text-white/30 font-mono ml-2">Terminal Output</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              id="copy-output"
              onClick={copyOutput}
              className="flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium
                         text-white/30 hover:text-white/60 hover:bg-white/[0.05]
                         transition-all duration-200"
              title="Copy output"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-success" />
                  <span className="text-success">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
            <button
              id="clear-terminal"
              onClick={clearTerminal}
              className="flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium
                         text-white/30 hover:text-white/60 hover:bg-white/[0.05]
                         transition-all duration-200"
              title="Clear terminal"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          </div>
        </div>

        {/* Terminal body */}
        <div
          ref={terminalRef}
          className="flex-1 overflow-y-auto p-4 bg-[#07070f]"
        >
          {output.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-[12px] text-white/15 font-mono">
                Select a tool and click Run to begin...
              </span>
            </div>
          ) : (
            <pre className="terminal-output whitespace-pre-wrap break-words">
              {output.map((line, i) => (
                <div key={i} className={line.type === "stderr" ? "stderr" : line.type === "info" ? "info" : "stdout"}>
                  {line.text}
                </div>
              ))}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
