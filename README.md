# v2rayDP Desktop

**v2rayDP Desktop** is a modern, high-performance Windows desktop client for **VLESS** and **VMess** proxy protocols, converted from the original Android app `v2rayDP` by **DinethPansiluW**.

Powered by the official **Xray-core** engine with **React + TypeScript + Tailwind CSS** frontend, **Electron** runtime, and **electron-builder** packaging (NSIS installer and standalone portable `.exe`).

---

## 🚀 Key Features

1. **Protocols & Transports**:
   - **VLESS**: Supports XTLS-Vision (`xtls-rprx-vision`), VLESS-Reality (`pbk`, `sid`, `fp`, `spx`), TLS, and plain.
   - **VMess**: Supports standard v2rayN JSON Base64 and URI formats (`alterId`, `auto`/`aes-128-gcm`/`chacha20-poly1305`).
   - **Transports**: TCP (with optional HTTP header simulation), WebSocket (`ws`), gRPC (`gun` & `multi`), HTTP/2 (`h2`).
   - **Certificate Handling**: Certificate verification is disabled with `"allowInsecure": true` set on all TLS configurations, ported directly from the original app.

2. **Windows System Proxy**:
   - Manages Windows proxy in `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings` (`ProxyEnable`, `ProxyServer`, `ProxyOverride`).
   - Immediately notifies WinINet via `InternetSetOption`.
   - Backs up your previous system proxy settings before connecting and **guarantees restoration** upon disconnect, application exit, or crash.
   - TUN virtual adapter mode placeholder included with "Coming Soon" indicator.

3. **Wi-Fi Network Automation**:
   - Automatically polls `netsh wlan show interfaces` (every 3–5 seconds with 5-second debounce).
   - Auto-connect when joining Wi-Fi: "Any SSID" or a list of specific approved SSIDs with custom profile selection.
   - Disconnect policies: "Stop VPN" or "Keep VPN running".
   - Auto-stop when Wi-Fi radio is turned off.
   - Auto-reconnect when returning to target SSID.
   - Network-scoped manual override: if you disconnect manually, the app will not auto-reconnect on that same network until the network changes.
   - Startup switches: "Start with Windows", "Start minimized to tray", "Auto-connect on app launch".

4. **Hotspot & LAN Sharing**:
   - Binds SOCKS5 and HTTP proxy inbounds to `0.0.0.0` instead of loopback `127.0.0.1`.
   - Displays all local IPv4 interface addresses with 1-click copy buttons.
   - Direct button to launch Windows Mobile Hotspot settings (`ms-settings:network-mobilehotspot`).
   - Elevated Windows Defender Firewall inbound rule button via `netsh advfirewall`.
   - Setup guides for phones, other computers, and command-line terminals.

5. **Ad & Threat Blocking (Xray Blackhole)**:
   - Pre-bundled blocklist sources:
     - **Ads**: AdAway hosts
     - **Trackers**: EasyPrivacy domains
     - **Malware & Phishing**: Phishing Filter hosts
   - Master and per-category toggle switches.
   - One-click list updates with deduplication and domain count tracking (~142,000+ domains).
   - Custom user rules with domain normalization (e.g. `*.tracker.com` -> `tracker.com`).
   - Routes blocked traffic directly to an Xray `blackhole` outbound with live blocked-request counters.

6. **Desktop UI & Diagnostics**:
   - NetMod-inspired dark cyberpunk dashboard.
   - Big round Connect/Disconnect button with live pulsing status indicator.
   - Active profile card with quick-switch dropdown (switching while connected reconnects immediately).
   - Live traffic stats (upload/download speed in MB/s, total session bytes, uptime duration).
   - Collapsible live logs panel with log level filtering and copy/clear functions.
   - System Tray with dynamic menu (Connect/Disconnect/Open/Exit), minimize-to-tray, and close-to-tray.

---

## 📁 Project Structure

```
├── electron/
│   ├── main.ts              # Electron main process (Xray spawn, Registry proxy, Wi-Fi polling, Tray)
│   └── preload.ts           # Context bridge exposing secure window.api
├── resources/
│   ├── bin/
│   │   ├── xray.exe         # Official Xray-core Windows executable
│   │   ├── geoip.dat        # IP routing database
│   │   └── geosite.dat      # Domain routing database
│   └── blocklist_sources.json
├── src/
│   ├── assets/              # Logo and bundled blocklist sources
│   ├── components/
│   │   ├── TopBar.tsx       # Horizontal top navigation bar
│   │   ├── EditProfileModal.tsx # Full VLESS/VMess manual add & edit dialog
│   │   ├── QrCodeModal.tsx  # QR code generator and share link dialog
│   │   └── XrayConfigModal.tsx # Xray JSON configuration inspector
│   ├── core/
│   │   ├── types.ts         # Shared TypeScript interfaces & types
│   │   ├── VmessLinkParser.ts # VLESS/VMess link parser & config generator
│   │   ├── AutomationDecision.ts # Pure functional Wi-Fi automation engine
│   │   ├── BlockManager.ts  # Ad-block download, merge & rule normalizer
│   │   ├── SocialLinks.ts   # Original developer social links
│   │   └── mockApi.ts       # Full browser mock API for AI Studio preview
│   ├── screens/
│   │   ├── DashboardScreen.tsx  # Main dashboard with big connect button & traffic
│   │   ├── AutomationScreen.tsx # Wi-Fi automation and rules
│   │   ├── HotspotScreen.tsx    # LAN/Hotspot proxy sharing
│   │   ├── BlockingScreen.tsx   # Ad & malware blackhole filters
│   │   ├── SettingsScreen.tsx   # Ports, DNS, bypass LAN, tray options
│   │   └── AboutScreen.tsx      # App info, credits, and links
│   ├── App.tsx              # Main application shell and state controller
│   └── main.tsx             # React entry point
├── tests/
│   ├── VmessLinkParser.test.ts   # Unit tests for link parsing & Xray config
│   └── AutomationDecision.test.ts # Unit tests for pure automation decisions
├── electron-builder.yml     # NSIS installer and portable executable configuration
├── package.json             # Scripts: dev, build, dist, test
└── tsconfig.electron.json   # TypeScript config for Electron scripts
```

---

## 📥 Where to Place `xray.exe`, `geoip.dat`, and `geosite.dat`

The official Xray-core binary runs the proxy engine. Download the latest Windows release (`Xray-windows-64.zip`) from the official Xray repository:
👉 [https://github.com/XTLS/Xray-core/releases](https://github.com/XTLS/Xray-core/releases)

Extract and place the files into the `resources/bin/` directory:
```
resources/
└── bin/
    ├── xray.exe       <-- The 64-bit Xray binary
    ├── geoip.dat      <-- IP classification data
    └── geosite.dat    <-- Domain classification data
```

When building with `npm run dist`, `electron-builder` automatically copies `resources/bin/` into the application's installation folder using the `extraResources` configuration in `electron-builder.yml`.

*(Note: When running inside the AI Studio web preview, the built-in browser mock automatically simulates the Xray core and traffic engine with full interactivity.)*

---

## 🛠️ Build & Development Commands

### 1. In-Browser Development (AI Studio Preview)
```bash
npm run dev
```
Runs the Vite development server at `http://localhost:3000`. The app detects the browser environment and activates the mock `window.api` with simulated traffic and Wi-Fi state.

### 2. Run Unit Tests
```bash
npm run test
```
Executes the Vitest unit test suite covering `VmessLinkParser` and `AutomationDecision`.

### 3. Build Web & Electron Scripts
```bash
npm run build
npm run build:electron
```
Builds the production Vite bundle in `dist/` and compiles the Electron main/preload scripts in `dist-electron/`.

### 4. Package Windows Executables (.exe)
```bash
npm run dist
```
Builds both:
- **NSIS Setup Installer**: `release/v2rayDP-Desktop-Setup-1.0.0.exe`
- **Standalone Portable `.exe`**: `release/v2rayDP-Desktop-Portable-1.0.0.exe`

---

## 📋 Manual Test Checklist

| Category | Test Case | Expected Result |
|---|---|---|
| **Profiles** | Import VLESS Reality link | Correctly parses UUID, public key, short ID, spiderX, and flow (`xtls-rprx-vision`). |
| **Profiles** | Import VMess v2rayN Base64 JSON | Correctly decodes Base64, sets alterId, security, network, and host header. |
| **Profiles** | Manual Add/Edit Dialog | Modifies server address, port, and transport settings; updates profile list. |
| **Profiles** | Export Share Link & QR | Shows valid QR code in modal; copies link to clipboard. |
| **Profiles** | Xray JSON Generator | Generates valid config with `allowInsecure: true` in `tlsSettings` and blackhole outbounds. |
| **Dashboard** | Connect Button | Transitions to "Connecting…", spawns Xray, enables Windows System Proxy, and transitions to "Connected". |
| **Dashboard** | Live Throughput Ticker | Real-time upload/download speed updates every second; session bytes counter increments. |
| **Dashboard** | Profile Quick-Switch | Selecting another node while connected restarts Xray immediately with the new node. |
| **Dashboard** | Disconnect | Kills Xray process, stops traffic ticker, and restores previous Windows system proxy settings. |
| **Latency** | Single & "Test All" Ping | Executes TCP/TLS socket handshake (with trust-all certificate); displays colored ms badge. |
| **Automation** | Join Target Wi-Fi | Automatically connects VPN when SSID matches approved list (or "Any SSID" is ON). |
| **Automation** | Manual Override | Disconnecting manually suppresses auto-reconnect on that same network until the network changes. |
| **Automation** | Leave Wi-Fi (STOP_VPN) | Stops VPN and restores system proxy when disconnecting from Wi-Fi. |
| **Hotspot** | Enable LAN Sharing | Xray inbounds listen on `0.0.0.0`; displays local IP endpoints with 1-click copy buttons. |
| **Hotspot** | Windows Hotspot Button | Launches Windows Mobile Hotspot settings via `ms-settings:network-mobilehotspot`. |
| **Ad Blocking** | Category Toggles | Enables/disables Ads, Trackers, and Malware filters; regenerates Xray blackhole rules. |
| **Ad Blocking** | Add Custom Domain | Normalizes and adds custom domain to blocklist; updates blocked request counters. |
| **Settings** | Port & DNS Changes | Updates SOCKS (10808) and HTTP (10809) ports and DNS servers (`1.1.1.1`, `8.8.8.8`). |
| **Settings** | Backup & Restore | Exports `v2raydp_profiles.json` and restores all server profiles from backup file. |
| **System Tray** | Tray Icon & Menu | Minimizes or closes to tray; context menu allows 1-click Connect/Disconnect or Exit. |
| **Safety** | Crash / Hard Exit Recovery | Previous Windows proxy registry values are restored on app quit or uncaught exception. |

---

## 👨‍💻 Credits
- **Original Android App**: `v2rayDP` by [DinethPansiluW](https://github.com/DinethPansiluW)
- **Proxy Core**: [Xray-core](https://github.com/XTLS/Xray-core)
- **Desktop Client**: Converted and engineered for Windows with Electron, React, TypeScript, and Tailwind CSS.
