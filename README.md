<div align="center">

# 🛡️ AIO Troubleshooter

**All-In-One Windows 11 System Troubleshooting & Maintenance Tool**

[![Release](https://img.shields.io/github/v/release/NeoShadow7366/Win11-AIO-Troubleshooter?style=for-the-badge&color=60cdff)](https://github.com/NeoShadow7366/Win11-AIO-Troubleshooter/releases)
[![License](https://img.shields.io/github/license/NeoShadow7366/Win11-AIO-Troubleshooter?style=for-the-badge&color=1a1a2e)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?style=for-the-badge&logo=windows)](https://www.microsoft.com/windows)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri-FFC131?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app)

A modern, beautiful desktop application for diagnosing, repairing, and maintaining your Windows PC. Built with **Tauri** (Rust backend) and **React** (TypeScript frontend) for blazing-fast performance in a lightweight package.

[**Download Latest Release →**](https://github.com/NeoShadow7366/Win11-AIO-Troubleshooter/releases/latest)

</div>

---

## ✨ Features at a Glance

| Feature | Description |
|---------|-------------|
| 📊 **Dashboard** | Real-time system gauges, per-disk storage, network IPs, hardware specs |
| ⚙️ **Process Manager** | Inspect, kill, and favorite processes with icons and detailed info panels |
| 🔧 **Services Manager** | Start/stop/restart services with WMI insights and Google search |
| 📋 **Event Viewer** | Unified log browser with preset date ranges and advanced filtering |
| 🔍 **App Insights** | Search apps, view related processes/events, open file paths in Explorer |
| ⚡ **Service Insights** | Favorite services grid with detailed WMI data and event correlation |
| 🛠️ **Quick Tools** | 24 system tools across 5 categories in best-practice order |
| 💚 **PC Healthcare** | Guided 9-step system health routine with Run/Skip controls |
| 💀 **BSOD Analyzer** | Minidump crash analysis with structured data and web search |
| 📖 **Feature Guide** | Interactive help panel with step-by-step instructions for every feature |
| 🔐 **Admin Detection** | Auto-detects privileges, one-click UAC elevation when needed |

---

## 📊 Dashboard

Your system's health at a glance:

- **Live Resource Gauges** — CPU, memory, and total disk usage with smooth animated circular gauges
- **Network Information** — Internal and external IP addresses with one-click copy to clipboard
- **Per-Disk Storage** — Individual cards for every attached drive showing name, type (SSD/HDD), filesystem, and usage bar
- **System Specs** — OS version, processor, GPU, hostname, and uptime

---

## ⚙️ Process Manager

Full visibility into running processes:

- **Process List** — Sortable table with PID, name, CPU%, memory, and status
- **Process Icons** — Automatically extracted application icons displayed inline
- **Detail Panel** — Click any process to see command line, threads, company, file path, and more
- **"What is this?"** — One-click Google search to learn about unknown processes
- **Favorites** — Star processes to track them across App Insights
- **Kill Process** — Terminate any process directly (requires admin for protected processes)
- **System Process Toggle** — Show/hide system-level processes for a cleaner view

---

## 🔧 Services Manager

Complete control over Windows services:

- **Service Grid** — All services with status badges, start type, and display name
- **Quick Filters** — Toggle between All, Running, and Stopped services
- **Start / Stop / Restart** — One-click service control (requires admin)
- **Insight Panel** — WMI-sourced details including description, executable path, PID, and start mode
- **"What is this?"** — Google search for any service
- **Favorites** — Star services for quick access in Service Insights

---

## 📋 Event Viewer

Unified Windows Event Log browser (combines the functionality of Event Logs + Crash Logs):

- **Preset Date Ranges** — One-click buttons for **Today**, **Last 7 Days**, **Last 30 Days**, or **Custom Range**
- **Log Source Toggles** — System, Application, and Security logs
- **Level Filtering** — All, Critical, Error, or Warning
- **Source Filter** — Text search to narrow by event source/provider
- **Expandable Rows** — Click any event to read the full message
- **Server-Side Pagination** — Navigate through thousands of events with page controls

---

## 🔍 App Insights

Deep dive into any application:

- **Search by Name** — Type any app name to find matching processes and events
- **Favorited Apps** — Starred processes appear at the top for instant access
- **Live Process Data** — PID, CPU, memory, and status for all matching processes
- **Related Event Logs** — Correlated system events filtered by the app's source name
- **Clickable Paths** — Exe path, install directory, and AppData folder open directly in File Explorer

---

## ⚡ Service Insights

Dedicated service analysis page:

- **Favorites Grid** — Your starred services displayed as quick-access cards
- **Searchable Service List** — Find any service by name or display name
- **Detail Panel** — WMI data (description, executable, start mode, state, PID) + related System event logs
- **"What is this?"** — Google search for unfamiliar services

---

## 🛠️ Quick Tools

**24 system tools** organized into **5 categories**, ordered by best practice:

### Categories

| Category | Tools | Description |
|----------|-------|-------------|
| **System Repair** | 5 tools | Restore Point → DISM → SFC → Check Disk → Component Cleanup |
| **Network** | 6 tools | Flush DNS → Display DNS → Release/Renew → Reset IP → Winsock → Restart Adapters |
| **Performance** | 5 tools | Clear Temp → Disk Cleanup → Update Cache → Defrag → Energy Report |
| **Security & Policy** | 3 tools | Defender Scan → GP Update → View Credentials |
| **Diagnostics** | 5 tools | System Info → DxDiag → Battery → WiFi Report → Memory Diagnostic |

### Key Features
- **Best-Practice Ordering** — Tools within each category are ordered from safest/first to most impactful/last
- **Admin Badges** — Each tool clearly indicates whether admin privileges are required
- **Detailed Info** — ℹ️ button on every tool card explains what it does and when to use it
- **Live Terminal Output** — Real-time streaming output with copy-to-clipboard support

---

## 💚 PC Healthcare Routine

A guided **9-step system health checkup** that walks you through the most important maintenance tools in the correct order:

| Step | Tool | Why |
|------|------|-----|
| 1 | Create Restore Point | Safety checkpoint before making changes |
| 2 | Defender Quick Scan | Check for malware that could cause issues |
| 3 | Clear Temp Files | Free up disk space quickly |
| 4 | Disk Cleanup | Deep clean system caches |
| 5 | DISM Repair | Repair the Windows component store |
| 6 | SFC Scan | Fix system files using the repaired store |
| 7 | Flush DNS | Clear stale DNS entries |
| 8 | Clear Update Cache | Fix stuck Windows Updates |
| 9 | Check Disk | Verify disk integrity |

- **Run / Skip** controls on each step
- **Progress tracking** with ✓ completed, ⏭ skipped, and ▸ current indicators
- **Sequential execution** — auto-advances to the next step on completion

---

## 💀 BSOD Analyzer

Investigate blue screen crashes:

- **Minidump Scanner** — Automatically finds dump files in `C:\Windows\Minidump`
- **Structured Analysis** — Bug check code, faulting module, crash-time process, OS version, parameters
- **BSOD History** — Past blue screen events with descriptions
- **Action Buttons** — Search Web (Google the bug check), Open File, Open Folder

---

## 📖 Feature Guide

Built-in interactive documentation:

- **Access** — Click the `?` icon next to `v1.0.0` in the sidebar footer
- **Categorized Features** — Monitoring, Analysis, and Tools categories
- **Detail Cards** — Description, numbered how-to steps, and pro tips for every feature
- **Searchable** — Filter by category to find what you need

---

## 🔐 Admin Mode

Smart privilege management:

- **Auto-Detection** — Checks admin status on launch
- **Warning Banner** — Dismissible amber banner when running without admin
- **Header Badge** — Green "Admin" or amber "Not Admin" indicator
- **Smart Gating** — Only admin-required actions prompt for elevation (non-admin tools work normally)
- **One-Click Elevation** — "Relaunch as Admin" triggers UAC for seamless elevation
- **Modal Explanation** — Lists exactly which features need admin before you decide

---

## 🚀 Installation

### Option 1: MSI Installer (Recommended)
Download `AIO Troubleshooter_1.0.0_x64_en-US.msi` from the [latest release](https://github.com/NeoShadow7366/Win11-AIO-Troubleshooter/releases/latest) and run the installer.

### Option 2: NSIS Setup
Download `AIO Troubleshooter_1.0.0_x64-setup.exe` for a compact installer.

### Option 3: Portable
Download `aio-troubleshooter.exe` and run it directly — no installation required.

### Requirements
- **OS**: Windows 10 or Windows 11 (x64)
- **Runtime**: WebView2 (pre-installed on Windows 11; [download for Windows 10](https://developer.microsoft.com/en-us/microsoft-edge/webview2/))

---

## 🏗️ Building from Source

### Prerequisites
- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (v18+)
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

### Steps

```bash
# Clone the repository
git clone https://github.com/NeoShadow7366/Win11-AIO-Troubleshooter.git
cd Win11-AIO-Troubleshooter

# Install frontend dependencies
npm install

# Run in development mode
npx tauri dev

# Build for production
npx tauri build
```

The release build outputs to:
- `src-tauri/target/release/aio-troubleshooter.exe`
- `src-tauri/target/release/bundle/msi/` (MSI installer)
- `src-tauri/target/release/bundle/nsis/` (NSIS setup)

---

## 🏛️ Architecture

```
Win11-AIO-Troubleshooter/
├── src/                          # React frontend (TypeScript)
│   ├── components/
│   │   ├── Dashboard.tsx         # System gauges, disks, IPs, specs
│   │   ├── ProcessManager.tsx    # Process list, icons, info panel
│   │   ├── ServicesManager.tsx   # Service control, insights
│   │   ├── EventViewer.tsx       # Unified event log browser
│   │   ├── AppInsights.tsx       # App search, processes, events
│   │   ├── ServiceInsights.tsx   # Favorite services deep-dive
│   │   ├── QuickTools.tsx        # 24 tools + PC Healthcare Routine
│   │   ├── BsodAnalyzer.tsx      # Minidump crash analysis
│   │   ├── FeatureGuide.tsx      # Interactive help panel
│   │   ├── Layout.tsx            # Admin detection, routing
│   │   ├── Sidebar.tsx           # Navigation + Feature Guide trigger
│   │   └── TitleBar.tsx          # Custom window controls
│   ├── types/index.ts            # TypeScript type definitions
│   └── main.tsx                  # App entry point
├── src-tauri/                    # Rust backend (Tauri)
│   └── src/
│       ├── commands/
│       │   ├── system_info.rs    # CPU, RAM, disk, IP queries
│       │   ├── processes.rs      # Process listing, details, icons
│       │   ├── services.rs       # Service control, WMI queries
│       │   ├── event_logs.rs     # Windows Event Log access
│       │   ├── crash_logs.rs     # Multi-source log querying
│       │   ├── app_insights.rs   # App search + event correlation
│       │   ├── bsod_analyzer.rs  # Minidump + WER analysis
│       │   ├── cli_tools.rs      # 24 CLI tool streaming executor
│       │   ├── favorites.rs      # Persistent favorites (JSON)
│       │   └── admin.rs          # Admin check, UAC relaunch
│       ├── utils/powershell.rs   # PowerShell execution wrapper
│       └── lib.rs                # Command registration
└── package.json                  # Frontend dependencies
```

### Tech Stack
| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Tailwind CSS v4, Lucide Icons |
| **Backend** | Rust, Tauri v2, Tokio (async), Serde (serialization) |
| **System Queries** | PowerShell (Get-WinEvent, Get-Service, WMI/CIM), Win32 APIs |
| **Data** | JSON file storage in `%APPDATA%/com.aio-troubleshooter.app/` |
| **Build** | Vite (frontend bundler), Cargo (Rust compiler) |

---

## 📄 License

This project is open source. See [LICENSE](LICENSE) for details.

---

<div align="center">

**Made with ❤️ for the Windows community**

[Report a Bug](https://github.com/NeoShadow7366/Win11-AIO-Troubleshooter/issues) · [Request a Feature](https://github.com/NeoShadow7366/Win11-AIO-Troubleshooter/issues)

</div>
