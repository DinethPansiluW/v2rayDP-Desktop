/**
 * v2rayDP Desktop - Electron Main Process
 * Handles:
 * - Single-instance lock
 * - Window lifecycle, minimize/close to tray
 * - System Tray with dynamic Connect/Disconnect/Open/Exit menu
 * - Windows System Proxy management via Registry
 *   (HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings)
 *   with PowerShell WinINet notification and guaranteed restore on disconnect/quit/crash
 * - Xray-core binary lifecycle with real-time statsquery API, SOCKS port readiness check,
 *   mutual exclusion, and config.json generation
 * - Wi-Fi monitoring via `netsh wlan show interfaces`
 * - TCP/TLS latency tester with allowInsecure: true
 * - JSON persistence in app.getPath('userData')
 */

import { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as net from 'net';
import * as tls from 'tls';
import { spawn, exec, ChildProcess } from 'child_process';
import {
  ServerProfile,
  ConnectionState,
  TrafficStats,
  AutomationSettings,
  HotspotSettings,
  BlockSettings,
  DesktopSettings,
  AppLog,
  WifiStatus
} from '../src/core/types';
import { VmessLinkParser } from '../src/core/VmessLinkParser';
import { AutomationDecision } from '../src/core/AutomationDecision';
import { BlockManager } from '../src/core/BlockManager';
import defaultSources from '../src/assets/blocklist_sources.json';

// Single Instance Lock (B9)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let currentXrayChild: ChildProcess | null = null;
let isStoppingIntentionally = false;
let isQuitting = false;
let cleanedUp = false;

// Config store files in userData
const userDataPath = app.getPath('userData');
const storeFilePath = path.join(userDataPath, 'v2raydp_config.json');
const xrayConfigPath = path.join(userDataPath, 'config.json');
const proxyBackupPath = path.join(userDataPath, 'proxy_backup.json');
const blocklistsDir = path.join(userDataPath, 'blocklists');

interface SavedOriginalProxy {
  proxyEnable: number;
  proxyServer: string;
  proxyOverride: string;
}

interface AppStore {
  profiles: ServerProfile[];
  automation: AutomationSettings;
  hotspot: HotspotSettings;
  block: BlockSettings;
  settings: DesktopSettings;
  logs: AppLog[];
}

function loadStore(): AppStore {
  try {
    if (fs.existsSync(storeFilePath)) {
      const data = fs.readFileSync(storeFilePath, 'utf8');
      const parsed = JSON.parse(data);
      return {
        profiles: parsed.profiles || [],
        automation: {
          isAutomationGloballyEnabled: parsed.automation?.isAutomationGloballyEnabled ?? true,
          rules: parsed.automation?.rules || [],
          fallbackRule: parsed.automation?.fallbackRule || {
            enabled: true,
            action: 'connect',
            profileId: null
          },
          autoStopOnWifiLeave: parsed.automation?.autoStopOnWifiLeave ?? true,
          wifiLeavePolicy: parsed.automation?.wifiLeavePolicy || 'STOP_VPN',
          autoStopOnWifiOff: parsed.automation?.autoStopOnWifiOff ?? true,
          autoReconnectOnWifiReturn: parsed.automation?.autoReconnectOnWifiReturn ?? true,
          manualOverrideSuppressed: parsed.automation?.manualOverrideSuppressed || false,
          manualOverrideReason: parsed.automation?.manualOverrideReason || '',
          manualOverrideNetworkKey: parsed.automation?.manualOverrideNetworkKey || null,
          manualConnectedProfileId: parsed.automation?.manualConnectedProfileId || null,
          manualConnectedNetworkKey: parsed.automation?.manualConnectedNetworkKey || null,
          stoppedByLeaveWifiSsid: parsed.automation?.stoppedByLeaveWifiSsid || null
        },
        hotspot: {
          isHotspotSharingEnabled: parsed.hotspot?.isHotspotSharingEnabled || false,
          hotspotProxyPort: parsed.hotspot?.hotspotProxyPort || 10808,
          httpProxyPort: parsed.hotspot?.httpProxyPort || 10809,
          requireAuth: parsed.hotspot?.requireAuth || false,
          username: parsed.hotspot?.username,
          password: parsed.hotspot?.password
        },
        block: parsed.block || BlockManager.getDefaultSettings(),
        settings: {
          mode: parsed.settings?.mode || 'system_proxy',
          socksPort: parsed.settings?.socksPort || 10808,
          httpPort: parsed.settings?.httpPort || 10809,
          primaryDns: parsed.settings?.primaryDns || '1.1.1.1',
          secondaryDns: parsed.settings?.secondaryDns || '8.8.8.8',
          isBypassLan: parsed.settings?.isBypassLan !== false,
          logLevel: parsed.settings?.logLevel || 'warning',
          minimizeToTray: parsed.settings?.minimizeToTray !== false,
          closeToTray: parsed.settings?.closeToTray !== false,
          startWithWindows: parsed.settings?.startWithWindows || false,
          startMinimized: parsed.settings?.startMinimized || false,
          autoConnectOnLaunch: parsed.settings?.autoConnectOnLaunch || false
        },
        logs: parsed.logs || []
      };
    }
  } catch (err) {
    console.error('Failed to load store file:', err);
  }

  return {
    profiles: [],
    automation: {
      isAutomationGloballyEnabled: true,
      rules: [],
      fallbackRule: {
        enabled: true,
        action: 'connect',
        profileId: null
      },
      autoStopOnWifiLeave: true,
      wifiLeavePolicy: 'STOP_VPN',
      autoStopOnWifiOff: true,
      autoReconnectOnWifiReturn: true,
      manualOverrideSuppressed: false,
      manualOverrideReason: '',
      manualOverrideNetworkKey: null,
      manualConnectedProfileId: null,
      manualConnectedNetworkKey: null,
      stoppedByLeaveWifiSsid: null
    },
    hotspot: {
      isHotspotSharingEnabled: false,
      hotspotProxyPort: 10808,
      httpProxyPort: 10809,
      requireAuth: false
    },
    block: BlockManager.getDefaultSettings(),
    settings: {
      mode: 'system_proxy',
      socksPort: 10808,
      httpPort: 10809,
      primaryDns: '1.1.1.1',
      secondaryDns: '8.8.8.8',
      isBypassLan: true,
      logLevel: 'warning',
      minimizeToTray: true,
      closeToTray: true,
      startWithWindows: false,
      startMinimized: false,
      autoConnectOnLaunch: false
    },
    logs: []
  };
}

let store: AppStore = loadStore();

function saveStore(): void {
  try {
    fs.writeFileSync(storeFilePath, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save store file:', err);
  }
}

// Current runtime connection state
let currentConnectionState: ConnectionState = {
  status: 'disconnected',
  reason: 'Idle',
  activeProfile: null
};

let trafficStats: TrafficStats = {
  uploadSpeedBps: 0,
  downloadSpeedBps: 0,
  sessionTxBytes: 0,
  sessionRxBytes: 0,
  connectedDurationSeconds: 0
};

let connectStartTime = 0;
let prevStatsUplink = 0;
let prevStatsDownlink = 0;
let trafficTimer: NodeJS.Timeout | null = null;
let wifiPollTimer: NodeJS.Timeout | null = null;
let currentWifiStatus: WifiStatus = {
  connected: false,
  ssid: null
};

function addLog(level: AppLog['level'], tag: string, message: string, triggerReason?: string) {
  const log: AppLog = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: Date.now(),
    level,
    tag,
    message,
    triggerReason
  };
  store.logs.unshift(log);
  if (store.logs.length > 500) store.logs.pop();
  saveStore();
  mainWindow?.webContents.send('on-log', log);
}

// ==========================================
// Windows System Proxy (Registry & WinINet)
// ==========================================
class WindowsProxyManager {
  private static regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

  static async readCurrentProxy(): Promise<SavedOriginalProxy> {
    return new Promise((resolve) => {
      exec(`reg query "${this.regKey}" /v ProxyEnable`, (_err, stdout) => {
        const enableMatch = stdout && stdout.match(/ProxyEnable\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
        const proxyEnable = enableMatch ? parseInt(enableMatch[1], 16) : 0;

        exec(`reg query "${this.regKey}" /v ProxyServer`, (_err2, stdout2) => {
          const serverMatch = stdout2 && stdout2.match(/ProxyServer\s+REG_SZ\s+(.*)/);
          const proxyServer = serverMatch ? serverMatch[1].trim() : '';

          exec(`reg query "${this.regKey}" /v ProxyOverride`, (_err3, stdout3) => {
            const overrideMatch = stdout3 && stdout3.match(/ProxyOverride\s+REG_SZ\s+(.*)/);
            const proxyOverride = overrideMatch ? overrideMatch[1].trim() : '';

            resolve({ proxyEnable, proxyServer, proxyOverride });
          });
        });
      });
    });
  }

  static async setSystemProxy(httpPort: number, bypassLan: boolean): Promise<void> {
    if (process.platform !== 'win32') {
      addLog('WARN', 'Proxy', 'System proxy configuration only supported on Windows platform');
      return;
    }

    try {
      // Persist backup to proxy_backup.json if not already backed up
      if (!fs.existsSync(proxyBackupPath)) {
        const current = await this.readCurrentProxy();
        fs.writeFileSync(proxyBackupPath, JSON.stringify(current, null, 2), 'utf8');
        addLog('INFO', 'Proxy', `Backed up original Windows proxy settings (Enabled: ${current.proxyEnable})`);
      }

      const proxyServer = `127.0.0.1:${httpPort}`;
      const bypassList = bypassLan
        ? '<local>;localhost;127.*;10.*;192.168.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*'
        : '<local>;localhost;127.*';

      const commands = [
        `reg add "${this.regKey}" /v ProxyEnable /t REG_DWORD /d 1 /f`,
        `reg add "${this.regKey}" /v ProxyServer /t REG_SZ /d "${proxyServer}" /f`,
        `reg add "${this.regKey}" /v ProxyOverride /t REG_SZ /d "${bypassList}" /f`
      ];

      for (const cmd of commands) {
        await new Promise<void>((res) => exec(cmd, () => res()));
      }

      this.notifyWinINet();
      addLog('INFO', 'Proxy', `Windows System Proxy set to ${proxyServer}`);
    } catch (err: unknown) {
      addLog('ERROR', 'Proxy', `Failed to set Windows proxy: ${(err as Error).message}`);
    }
  }

  static async restoreSystemProxy(): Promise<void> {
    if (process.platform !== 'win32') return;

    try {
      let orig: SavedOriginalProxy = { proxyEnable: 0, proxyServer: '', proxyOverride: '' };
      if (fs.existsSync(proxyBackupPath)) {
        try {
          const raw = fs.readFileSync(proxyBackupPath, 'utf8');
          orig = JSON.parse(raw);
        } catch {}
      }

      const commands = [
        `reg add "${this.regKey}" /v ProxyEnable /t REG_DWORD /d ${orig.proxyEnable} /f`,
        `reg add "${this.regKey}" /v ProxyServer /t REG_SZ /d "${orig.proxyServer}" /f`,
        `reg add "${this.regKey}" /v ProxyOverride /t REG_SZ /d "${orig.proxyOverride}" /f`
      ];

      for (const cmd of commands) {
        await new Promise<void>((res) => exec(cmd, () => res()));
      }

      this.notifyWinINet();

      if (fs.existsSync(proxyBackupPath)) {
        try {
          fs.unlinkSync(proxyBackupPath);
        } catch {}
      }

      addLog('INFO', 'Proxy', 'Restored original Windows System Proxy settings');
    } catch (err: unknown) {
      addLog('ERROR', 'Proxy', `Failed to restore Windows proxy: ${(err as Error).message}`);
    }
  }

  static notifyWinINet(): void {
    if (process.platform !== 'win32') return;

    // Use PowerShell with -NoProfile -ExecutionPolicy Bypass -EncodedCommand
    const script = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class WinINet {
    [DllImport("wininet.dll", SetLastError = true)]
    public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
}
"@
Add-Type -TypeDefinition $code
[WinINet]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0)
[WinINet]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0)
`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, () => {});
  }
}

// ==========================================
// Path Resolution (Never use __dirname)
// ==========================================
function getXrayExecutablePath(): string {
  if (app.isPackaged) {
    const resPath = process.resourcesPath || path.join(app.getAppPath(), '..');
    return path.join(resPath, 'bin', 'xray.exe');
  } else {
    return path.join(app.getAppPath(), 'resources', 'bin', 'xray.exe');
  }
}

function getAppIconPath(): string {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'dist', 'app_logo.png');
  } else {
    return path.join(app.getAppPath(), 'public', 'app_logo.png');
  }
}

// ==========================================
// Process Serialization & Mutex
// ==========================================
let operationMutex: Promise<any> = Promise.resolve();

function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = operationMutex.then(() => fn());
  operationMutex = result.catch(() => {});
  return result;
}

function waitForPort(port: number, timeoutMs = 8000): Promise<boolean> {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const socket = new net.Socket();
      socket.setTimeout(400);

      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start >= timeoutMs) {
          resolve(false);
        } else {
          setTimeout(check, 250);
        }
      });

      socket.once('timeout', () => {
        socket.destroy();
        if (Date.now() - start >= timeoutMs) {
          resolve(false);
        } else {
          setTimeout(check, 250);
        }
      });

      socket.connect(port, '127.0.0.1');
    };

    check();
  });
}

async function stopCurrentXrayProcess(): Promise<void> {
  if (!currentXrayChild) return;

  const childToKill = currentXrayChild;
  currentXrayChild = null;
  isStoppingIntentionally = true;

  try {
    childToKill.kill('SIGKILL');
  } catch {}

  // Await exit
  await new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    childToKill.once('exit', done);
    setTimeout(done, 1500);
  });

  isStoppingIntentionally = false;
}

// Gather all active blocked domains from cache & custom rules
function getActiveBlockedDomains(): string[] {
  const block = store.block;
  if (!block.isBlockingEnabled) return [];

  const domains = new Set<string>();

  // Add custom user rules
  for (const rule of block.customRules || []) {
    const norm = BlockManager.normalizeCustomRule(rule);
    if (norm) domains.add(norm);
  }

  // Add from cached source files
  if (fs.existsSync(blocklistsDir)) {
    const enabledSources = (block.sources || []).filter((s) => s.enabled);
    for (const source of enabledSources) {
      const filePath = path.join(blocklistsDir, `${source.id}.txt`);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split('\n');
          for (const line of lines) {
            const domain = line.trim();
            if (domain) domains.add(domain);
          }
        } catch {}
      }
    }
  }

  return Array.from(domains);
}

async function startXrayInternal(profile: ServerProfile): Promise<boolean> {
  await stopCurrentXrayProcess();
  stopTrafficMonitor();

  const binaryPath = getXrayExecutablePath();
  const desktopSettings = store.settings;
  const hotspot = store.hotspot;
  const socksPort = desktopSettings.socksPort || 10808;
  const httpPort = desktopSettings.httpPort || 10809;

  // B5: Check if binary exists. If missing, report error and do not touch system proxy
  if (!fs.existsSync(binaryPath)) {
    const errorMsg = `xray.exe not found in ${binaryPath}`;
    addLog('ERROR', 'Xray', errorMsg);
    currentConnectionState = {
      status: 'error',
      reason: errorMsg,
      activeProfile: null
    };
    mainWindow?.webContents.send('on-state-change', currentConnectionState);
    updateTrayMenu();
    return false;
  }

  // Stay in 'connecting' until verified
  currentConnectionState = {
    status: 'connecting',
    reason: `Starting Xray with ${profile.name}...`,
    profileName: profile.name,
    activeProfile: profile,
    connectedAt: Date.now(),
    localSocksPort: socksPort,
    localHttpPort: httpPort,
    systemProxyActive: false
  };
  mainWindow?.webContents.send('on-state-change', currentConnectionState);
  updateTrayMenu();

  const activeBlockedDomains = getActiveBlockedDomains();

  const xrayJson = VmessLinkParser.toV2RayConfigJson(profile, {
    socksPort,
    httpPort,
    listenAllInterfaces: hotspot.isHotspotSharingEnabled,
    bypassLan: desktopSettings.isBypassLan,
    primaryDns: desktopSettings.primaryDns,
    secondaryDns: desktopSettings.secondaryDns,
    blockedDomains: activeBlockedDomains,
    logLevel: desktopSettings.logLevel
  });

  fs.writeFileSync(xrayConfigPath, xrayJson, 'utf8');

  let lastStderr = '';
  let earlyExitCode: number | null = null;
  const binDir = path.dirname(binaryPath);

  try {
    const child = spawn(binaryPath, ['run', '-c', xrayConfigPath], {
      cwd: binDir,
      windowsHide: true,
      env: {
        ...process.env,
        XRAY_LOCATION_ASSET: binDir
      }
    });
    currentXrayChild = child;

    child.stdout?.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        addLog('DEBUG', 'XrayCore', text);
      }
    });

    child.stderr?.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        lastStderr = text;
        addLog('WARN', 'XrayCore', text);
      }
    });

    child.on('error', (err) => {
      if (child !== currentXrayChild) return;
      addLog('ERROR', 'Xray', `Process error: ${err.message}`);
      disconnectVpnInternal(`Xray process crashed: ${err.message}`);
    });

    child.on('exit', (code, signal) => {
      earlyExitCode = code;
      if (child !== currentXrayChild || isStoppingIntentionally) return;

      if (currentConnectionState.status === 'connected') {
        addLog('WARN', 'Xray', `Xray-core terminated unexpectedly (code: ${code}, signal: ${signal})`);
        disconnectVpnInternal('Proxy engine stopped unexpectedly');
      }
    });

    // Poll SOCKS port for up to 8s
    const isPortReady = await waitForPort(socksPort, 8000);

    if (!isPortReady || earlyExitCode !== null || child !== currentXrayChild) {
      const failReason = lastStderr || 'Failed to initialize Xray engine or bind SOCKS port';
      addLog('ERROR', 'Xray', `Startup failure: ${failReason}`);
      await stopCurrentXrayProcess();

      currentConnectionState = {
        status: 'error',
        reason: failReason,
        activeProfile: null
      };
      mainWindow?.webContents.send('on-state-change', currentConnectionState);
      updateTrayMenu();
      return false;
    }

    // Port is ready! Now activate Windows System Proxy
    await WindowsProxyManager.setSystemProxy(httpPort, desktopSettings.isBypassLan);

    connectStartTime = Date.now();
    prevStatsUplink = 0;
    prevStatsDownlink = 0;
    trafficStats = {
      uploadSpeedBps: 0,
      downloadSpeedBps: 0,
      sessionTxBytes: 0,
      sessionRxBytes: 0,
      connectedDurationSeconds: 0
    };

    currentConnectionState = {
      status: 'connected',
      reason: 'Connected',
      profileName: profile.name,
      activeProfile: profile,
      connectedAt: connectStartTime,
      localSocksPort: socksPort,
      localHttpPort: httpPort,
      systemProxyActive: true
    };

    mainWindow?.webContents.send('on-state-change', currentConnectionState);
    mainWindow?.webContents.send('on-traffic-stats', trafficStats);
    updateTrayMenu();
    startRealTrafficMonitor(binaryPath);
    addLog('INFO', 'Core', `Xray proxy active for "${profile.name}" on SOCKS :${socksPort} & HTTP :${httpPort}`);
    return true;
  } catch (err: unknown) {
    const errorMsg = (err as Error).message;
    addLog('ERROR', 'Xray', `Failed to spawn xray.exe: ${errorMsg}`);
    currentConnectionState = {
      status: 'error',
      reason: errorMsg,
      activeProfile: null
    };
    mainWindow?.webContents.send('on-state-change', currentConnectionState);
    updateTrayMenu();
    return false;
  }
}

async function disconnectVpnInternal(reason = 'Disconnected'): Promise<void> {
  stopTrafficMonitor();
  await stopCurrentXrayProcess();
  await WindowsProxyManager.restoreSystemProxy();

  currentConnectionState = {
    status: 'disconnected',
    reason,
    activeProfile: null
  };

  trafficStats = {
    uploadSpeedBps: 0,
    downloadSpeedBps: 0,
    sessionTxBytes: trafficStats.sessionTxBytes,
    sessionRxBytes: trafficStats.sessionRxBytes,
    connectedDurationSeconds: trafficStats.connectedDurationSeconds
  };

  mainWindow?.webContents.send('on-state-change', currentConnectionState);
  mainWindow?.webContents.send('on-traffic-stats', trafficStats);
  updateTrayMenu();
  addLog('INFO', 'Core', `Disconnected: ${reason}`);
}

function startXray(profile: ServerProfile): Promise<boolean> {
  return runSerialized(() => startXrayInternal(profile));
}

function disconnectVpn(reason = 'Disconnected'): Promise<void> {
  return runSerialized(() => disconnectVpnInternal(reason));
}

// B4: Helper to restart Xray with the currently RUNNING profile
async function restartRunningXrayIfActive(): Promise<void> {
  if (currentConnectionState.status === 'connected' && currentConnectionState.activeProfile) {
    await startXray(currentConnectionState.activeProfile);
  }
}

// ==========================================
// Real Traffic Monitor via statsquery (B6)
// ==========================================
function stopTrafficMonitor(): void {
  if (trafficTimer) {
    clearInterval(trafficTimer);
    trafficTimer = null;
  }
}

function startRealTrafficMonitor(binaryPath: string): void {
  stopTrafficMonitor();

  trafficTimer = setInterval(() => {
    if (currentConnectionState.status !== 'connected' || !currentXrayChild) return;

    const binDir = path.dirname(binaryPath);
    const cmd = `"${binaryPath}" api statsquery --server=127.0.0.1:10085`;

    exec(cmd, { cwd: binDir }, (err, stdout) => {
      if (err || !stdout) return;

      try {
        const data = JSON.parse(stdout);
        const statsArray: Array<{ name: string; value?: number }> = data.stat || [];

        let currentUplink = 0;
        let currentDownlink = 0;

        for (const item of statsArray) {
          if (item.name === 'outbound>>>proxy>>>traffic>>>uplink') {
            currentUplink = Number(item.value) || 0;
          } else if (item.name === 'outbound>>>proxy>>>traffic>>>downlink') {
            currentDownlink = Number(item.value) || 0;
          }
        }

        const deltaUp = prevStatsUplink > 0 ? Math.max(0, currentUplink - prevStatsUplink) : 0;
        const deltaDown = prevStatsDownlink > 0 ? Math.max(0, currentDownlink - prevStatsDownlink) : 0;

        prevStatsUplink = currentUplink;
        prevStatsDownlink = currentDownlink;

        const duration = Math.floor((Date.now() - connectStartTime) / 1000);

        trafficStats = {
          uploadSpeedBps: deltaUp,
          downloadSpeedBps: deltaDown,
          sessionTxBytes: currentUplink,
          sessionRxBytes: currentDownlink,
          connectedDurationSeconds: duration
        };

        mainWindow?.webContents.send('on-traffic-stats', trafficStats);
      } catch {}
    });
  }, 1000);
}

// ==========================================
// Windows Wi-Fi Monitoring (netsh)
// ==========================================
function pollWifiState(): Promise<WifiStatus> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ connected: true, ssid: 'Demo_Office_WiFi' });
      return;
    }

    exec('netsh wlan show interfaces', { encoding: 'utf8' }, (err, stdout) => {
      if (err || !stdout) {
        resolve({ connected: false, ssid: null });
        return;
      }

      const stateMatch = stdout.match(/State\s*:\s*(connected|disconnected)/i);
      const isConnected = stateMatch ? stateMatch[1].toLowerCase() === 'connected' : false;

      const ssidMatch = stdout.match(/^\s*SSID\s*:\s*(.*)$/im);
      let ssid = ssidMatch ? ssidMatch[1].trim() : null;
      if (ssid === '' || ssid === '<unknown ssid>') ssid = null;

      const nameMatch = stdout.match(/Name\s*:\s*(.*)$/im);
      const ifName = nameMatch ? nameMatch[1].trim() : undefined;

      const signalMatch = stdout.match(/Signal\s*:\s*(\d+)%/i);
      const signal = signalMatch ? parseInt(signalMatch[1], 10) : undefined;

      const status: WifiStatus = {
        connected: isConnected,
        ssid,
        interfaceName: ifName,
        signalPercent: signal,
        locationPermissionHint: isConnected && !ssid
      };

      resolve(status);
    });
  });
}

function stopWifiAutomationMonitor(): void {
  if (wifiPollTimer) {
    clearInterval(wifiPollTimer);
    wifiPollTimer = null;
  }
}

function startWifiAutomationMonitor() {
  stopWifiAutomationMonitor();

  wifiPollTimer = setInterval(async () => {
    const newStatus = await pollWifiState();
    currentWifiStatus = newStatus;
    mainWindow?.webContents.send('on-wifi-status', newStatus);

    // Evaluate pure decision logic
    const decision = AutomationDecision.evaluate({
      settings: store.automation,
      wifiStatus: newStatus,
      currentConnectionStatus: currentConnectionState.status,
      isVpnRunning: currentConnectionState.status === 'connected',
      runningProfileId: currentConnectionState.activeProfile?.id || null,
      source: 'poll'
    });

    if (decision.updatedSettings !== store.automation) {
      store.automation = decision.updatedSettings;
      saveStore();
    }

    if (decision.logMessage) {
      addLog(decision.logLevel || 'INFO', 'Automation', decision.logMessage);
    }

    if (decision.action.type === 'START_VPN' || decision.action.type === 'SWITCH_VPN') {
      const action = decision.action as { type: string; profileId: string; reason: string };
      const target = store.profiles.find((p) => p.id === action.profileId);
      if (target) {
        addLog(
          'AUTO',
          'Automation',
          `${action.type === 'SWITCH_VPN' ? 'Switching' : 'Auto-starting'} VPN with "${target.name}" (${action.reason})`
        );
        startXray(target);
      }
    } else if (decision.action.type === 'STOP_VPN') {
      const stopAction = decision.action as { type: 'STOP_VPN'; reason: string };
      addLog('AUTO', 'Automation', `Auto-stopping VPN (${stopAction.reason})`);
      disconnectVpn(stopAction.reason);
    }
  }, 4000);
}

// ==========================================
// Latency Testing (TCP / TLS Socket)
// ==========================================
async function testServerLatency(profile: ServerProfile): Promise<number> {
  const start = Date.now();
  const timeoutMs = 3500;

  return new Promise((resolve) => {
    let timer: NodeJS.Timeout;

    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    const onFinish = (ms: number) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(ms);
    };

    timer = setTimeout(() => {
      onFinish(-1);
    }, timeoutMs + 100);

    socket.connect(profile.port, profile.address, () => {
      if (profile.tls === 'tls' || profile.tls === 'reality') {
        const tlsSocket = tls.connect(
          {
            socket,
            servername: profile.sni || profile.address,
            rejectUnauthorized: false
          },
          () => {
            const elapsed = Date.now() - start;
            tlsSocket.destroy();
            onFinish(elapsed);
          }
        );

        tlsSocket.on('error', () => onFinish(-1));
      } else {
        const elapsed = Date.now() - start;
        onFinish(elapsed);
      }
    });

    socket.on('error', () => onFinish(-1));
    socket.on('timeout', () => onFinish(-1));
  });
}

// ==========================================
// System Tray & Window Setup
// ==========================================
function updateTrayMenu(): void {
  if (!tray) return;

  const isConnected = currentConnectionState.status === 'connected';
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `v2rayDP Desktop - ${isConnected ? 'Connected' : 'Disconnected'}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: isConnected ? 'Disconnect VPN' : 'Connect VPN',
      click: () => {
        if (isConnected) {
          disconnectVpn('Disconnected via Tray');
        } else {
          const active = store.profiles.find((p) => p.isSelected) || store.profiles[0];
          if (active) startXray(active);
        }
      }
    },
    {
      label: 'Open v2rayDP',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: async () => {
        isQuitting = true;
        await cleanupEverything();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`v2rayDP Desktop (${isConnected ? 'Connected' : 'Disconnected'})`);
}

function createMainWindow(): void {
  const iconPath = getAppIconPath();
  const iconImage = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;
  const shouldStartMinimized = store.settings.startMinimized || process.argv.includes('--minimized');

  mainWindow = new BrowserWindow({
    width: 1060,
    height: 740,
    minWidth: 880,
    minHeight: 620,
    backgroundColor: '#090D16',
    title: 'v2rayDP Desktop',
    icon: iconImage,
    show: !shouldStartMinimized,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist-electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  } else {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000');
  }

  mainWindow.on('close', async (event) => {
    if (!isQuitting && store.settings.closeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    } else {
      await cleanupEverything();
    }
  });

  (mainWindow as any).on('minimize', (event: any) => {
    if (store.settings.minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createSystemTray(): void {
  const iconPath = getAppIconPath();
  if (!fs.existsSync(iconPath)) return;

  try {
    const trayImg = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(trayImg);

    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
        }
      }
    });

    updateTrayMenu();
  } catch (err) {
    console.error('Failed to initialize tray:', err);
  }
}

// Guaranteed Cleanup on all exit paths (B2)
async function cleanupEverything(): Promise<void> {
  if (cleanedUp) return;
  cleanedUp = true;

  stopTrafficMonitor();
  stopWifiAutomationMonitor();
  await stopCurrentXrayProcess();
  await WindowsProxyManager.restoreSystemProxy();
}

app.on('before-quit', async (event) => {
  if (!cleanedUp) {
    event.preventDefault();
    await cleanupEverything();
    app.quit();
  }
});

app.on('will-quit', async () => {
  await cleanupEverything();
});

(app as any).on('session-end', async () => {
  await cleanupEverything();
});

process.on('uncaughtException', async (err) => {
  console.error('Uncaught Exception:', err);
  await cleanupEverything();
  process.exit(1);
});

process.on('unhandledRejection', async (err) => {
  console.error('Unhandled Rejection:', err);
  await cleanupEverything();
  process.exit(1);
});

process.on('SIGINT', async () => {
  await cleanupEverything();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await cleanupEverything();
  process.exit(0);
});

// App Lifecycle
app.whenReady().then(async () => {
  // If proxy_backup.json exists from previous crash/kill, restore it immediately
  if (fs.existsSync(proxyBackupPath)) {
    console.log('Restoring Windows proxy from previous session backup...');
    await WindowsProxyManager.restoreSystemProxy();
  }

  createMainWindow();
  createSystemTray();
  startWifiAutomationMonitor();

  // Configure Windows auto-start (app.setLoginItemSettings)
  if (process.platform === 'win32') {
    const execPath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    app.setLoginItemSettings({
      openAtLogin: Boolean(store.settings.startWithWindows),
      path: execPath,
      args: store.settings.startMinimized ? ['--minimized'] : []
    });
  }

  // Auto-connect on app launch if enabled (B8)
  if (store.settings.autoConnectOnLaunch) {
    const active = store.profiles.find((p) => p.isSelected) || store.profiles[0];
    if (active) {
      setTimeout(() => startXray(active), 1500);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

  // Dev-time verification that every channel used in preload has a handler
  verifyIpcHandlersRegistered();
});

// ==========================================
// IPC Handlers Implementation (B1)
// ==========================================
ipcMain.handle('get-profiles', async () => store.profiles);

ipcMain.handle('save-profile', async (_e, profileData: Partial<ServerProfile>) => {
  let updated: ServerProfile;
  if (profileData.id) {
    const idx = store.profiles.findIndex((p) => p.id === profileData.id);
    if (idx !== -1) {
      updated = { ...store.profiles[idx], ...profileData } as ServerProfile;
      store.profiles[idx] = updated;
    } else {
      updated = { ...profileData, id: profileData.id } as ServerProfile;
      store.profiles.push(updated);
    }
  } else {
    updated = {
      id: `prof-${Date.now()}`,
      name: 'New Node',
      protocol: 'vless',
      address: '127.0.0.1',
      port: 443,
      uuid: '',
      alterId: 0,
      security: 'none',
      network: 'tcp',
      headerType: 'none',
      host: '',
      path: '/',
      tls: 'reality',
      sni: '',
      alpn: '',
      flow: '',
      publicKey: '',
      shortId: '',
      fingerprint: 'chrome',
      spiderX: '/',
      serviceName: '',
      grpcMode: 'gun',
      allowInsecure: true,
      isSelected: store.profiles.length === 0,
      pingLatencyMs: -1,
      createdAt: Date.now(),
      ...profileData
    } as ServerProfile;
    store.profiles.push(updated);
  }
  saveStore();
  return updated;
});

ipcMain.handle('delete-profile', async (_e, id: string) => {
  store.profiles = store.profiles.filter((p) => p.id !== id);
  if (store.profiles.length > 0 && !store.profiles.some((p) => p.isSelected)) {
    store.profiles[0].isSelected = true;
  }
  saveStore();
  return true;
});

ipcMain.handle('select-profile', async (_e, id: string) => {
  let selected: ServerProfile | null = null;
  store.profiles.forEach((p) => {
    p.isSelected = p.id === id;
    if (p.isSelected) selected = p;
  });
  saveStore();
  if (selected && currentConnectionState.status === 'connected') {
    startXray(selected);
  }
  return true;
});

// B1: Duplicate Profile handler
ipcMain.handle('duplicate-profile', async (_e, id: string) => {
  const target = store.profiles.find((p) => p.id === id);
  if (!target) return null;

  const cloned: ServerProfile = {
    ...target,
    id: `prof-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: `${target.name} (Copy)`,
    isSelected: false,
    pingLatencyMs: -1,
    createdAt: Date.now()
  };

  store.profiles.push(cloned);
  saveStore();
  return cloned;
});

// B1: Import profiles from multi-line text (vless:// and vmess://)
ipcMain.handle('import-profiles-text', async (_e, text: string) => {
  const lines = (text || '').split(/\r?\n/);
  let added = 0;
  let failed = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase().startsWith('vless://') || trimmed.toLowerCase().startsWith('vmess://')) {
      try {
        const parsed = VmessLinkParser.parse(trimmed);
        parsed.id = `prof-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        parsed.createdAt = Date.now();
        parsed.isSelected = store.profiles.length === 0;
        store.profiles.push(parsed);
        added++;
      } catch (err) {
        failed++;
      }
    }
  }

  saveStore();
  return { added, failed };
});

// B1: Export profiles JSON
ipcMain.handle('export-profiles-json', async () => {
  return JSON.stringify(store.profiles, null, 2);
});

// B1: Import profiles JSON
ipcMain.handle('import-profiles-json', async (_e, jsonStr: string) => {
  let added = 0;
  const errors: string[] = [];

  try {
    const parsed = JSON.parse(jsonStr);
    const list = Array.isArray(parsed) ? parsed : [parsed];

    for (const item of list) {
      if (item.address && item.port && item.uuid && (item.protocol === 'vless' || item.protocol === 'vmess')) {
        const profile: ServerProfile = {
          id: `prof-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: item.name || 'Imported Node',
          protocol: item.protocol,
          address: item.address,
          port: item.port,
          uuid: item.uuid,
          alterId: item.alterId || 0,
          security: item.security || 'none',
          network: item.network || 'tcp',
          headerType: item.headerType || 'none',
          host: item.host || '',
          path: item.path || '/',
          tls: item.tls || 'none',
          sni: item.sni || '',
          alpn: item.alpn || '',
          flow: item.flow || '',
          publicKey: item.publicKey || '',
          shortId: item.shortId || '',
          fingerprint: item.fingerprint || 'chrome',
          spiderX: item.spiderX || '/',
          serviceName: item.serviceName || '',
          grpcMode: item.grpcMode || 'gun',
          allowInsecure: true,
          isSelected: store.profiles.length === 0,
          pingLatencyMs: -1,
          createdAt: Date.now()
        };
        store.profiles.push(profile);
        added++;
      } else {
        errors.push(`Invalid node config for ${item.name || 'unnamed'}`);
      }
    }

    saveStore();
  } catch (err: unknown) {
    errors.push(`JSON parse error: ${(err as Error).message}`);
  }

  return { added, errors };
});

ipcMain.handle('start-vpn', async (_e, profileId?: string) => {
  const target = profileId
    ? store.profiles.find((p) => p.id === profileId)
    : store.profiles.find((p) => p.isSelected) || store.profiles[0];
  if (!target) return false;

  // Preserve user manually chosen profile on this network
  store.automation.manualConnectedProfileId = target.id;
  store.automation.manualConnectedNetworkKey = currentWifiStatus.connected
    ? `WIFI:${AutomationDecision.cleanSsid(currentWifiStatus.ssid) || '<no-ssid>'}`
    : 'NONE:none';
  store.automation.manualOverrideSuppressed = false;
  saveStore();

  return await startXray(target);
});

ipcMain.handle('stop-vpn', async (_e, reason?: string) => {
  // If user manually disconnects, suppress auto-reconnect on this network until network changes
  store.automation.manualOverrideSuppressed = true;
  store.automation.manualOverrideReason = reason || 'Manual disconnect';
  store.automation.manualOverrideNetworkKey = currentWifiStatus.connected
    ? `WIFI:${AutomationDecision.cleanSsid(currentWifiStatus.ssid) || '<no-ssid>'}`
    : 'NONE:none';
  store.automation.manualConnectedProfileId = null;
  store.automation.manualConnectedNetworkKey = null;
  saveStore();

  await disconnectVpn(reason || 'User clicked Disconnect');
  return true;
});

ipcMain.handle('reset-manual-override', async () => {
  store.automation.manualOverrideSuppressed = false;
  store.automation.manualOverrideReason = '';
  store.automation.manualOverrideNetworkKey = null;
  store.automation.manualConnectedProfileId = null;
  store.automation.manualConnectedNetworkKey = null;
  saveStore();
  addLog('AUTO', 'Automation', 'Manual overrides cleared by user');
  return true;
});

ipcMain.handle('get-connection-state', async () => currentConnectionState);
ipcMain.handle('get-traffic-stats', async () => trafficStats);

ipcMain.handle('test-latency', async (_e, profileId: string) => {
  const profile = store.profiles.find((p) => p.id === profileId);
  if (!profile) return -1;
  const ping = await testServerLatency(profile);
  profile.pingLatencyMs = ping;
  profile.lastPingTimestamp = Date.now();
  saveStore();
  return ping;
});

ipcMain.handle('test-all-latencies', async () => {
  const results: Record<string, number> = {};
  for (const p of store.profiles) {
    const ping = await testServerLatency(p);
    p.pingLatencyMs = ping;
    p.lastPingTimestamp = Date.now();
    results[p.id] = ping;
  }
  saveStore();
  return results;
});

ipcMain.handle('get-automation-settings', async () => store.automation);
ipcMain.handle('save-automation-settings', async (_e, settings: AutomationSettings) => {
  store.automation = settings;
  saveStore();
  return true;
});

ipcMain.handle('get-wifi-status', async () => currentWifiStatus);

ipcMain.handle('get-hotspot-info', async () => {
  const interfaces = os.networkInterfaces();
  const ipAddresses: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const netInfo of interfaces[name] || []) {
      if (netInfo.family === 'IPv4' && !netInfo.internal) {
        ipAddresses.push(netInfo.address);
      }
    }
  }
  return {
    isSharing: store.hotspot.isHotspotSharingEnabled,
    socksPort: store.hotspot.hotspotProxyPort || store.settings.socksPort || 10808,
    httpPort: store.hotspot.httpProxyPort || store.settings.httpPort || 10809,
    ipAddresses: ipAddresses.length > 0 ? ipAddresses : ['192.168.1.100']
  };
});

ipcMain.handle('save-hotspot-settings', async (_e, settings: HotspotSettings) => {
  store.hotspot = settings;
  saveStore();
  // B4: Restart with currently RUNNING profile
  await restartRunningXrayIfActive();
  return true;
});

ipcMain.handle('open-hotspot-settings', async () => {
  shell.openExternal('ms-settings:network-mobilehotspot');
  return true;
});

ipcMain.handle('add-firewall-rule', async (_e, port: number) => {
  return new Promise((resolve) => {
    const cmd = `powershell.exe -NoProfile -Command "Start-Process netsh -ArgumentList 'advfirewall firewall add rule name=\\\"v2rayDP Hotspot Share\\\" dir=in action=allow protocol=TCP localport=${port},${port + 1}' -Verb RunAs"`;
    exec(cmd, (err) => {
      if (err) {
        resolve({ success: false, message: `Firewall elevation failed: ${err.message}` });
      } else {
        resolve({ success: true, message: `Firewall inbound rules added for ports ${port} and ${port + 1}` });
      }
    });
  });
});

ipcMain.handle('get-block-settings', async () => store.block);

ipcMain.handle('save-block-settings', async (_e, settings: BlockSettings) => {
  store.block = settings;
  saveStore();
  // B4: Restart with currently RUNNING profile
  await restartRunningXrayIfActive();
  return true;
});

// B1: Update blocklists via Node fetch
ipcMain.handle('update-blocklists', async () => {
  if (!fs.existsSync(blocklistsDir)) {
    fs.mkdirSync(blocklistsDir, { recursive: true });
  }

  const sources = store.block.sources && store.block.sources.length > 0
    ? store.block.sources
    : (defaultSources as any[]);

  const uniqueDomains = new Set<string>();

  for (const source of sources) {
    try {
      addLog('INFO', 'BlockManager', `Downloading blocklist "${source.name}" from ${source.url}`);
      const res = await fetch(source.url, {
        signal: AbortSignal.timeout(30000)
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const bodyText = await res.text();
      const lines = bodyText.split('\n');
      const parsedDomains: string[] = [];

      for (const line of lines) {
        const domain = BlockManager.parseDomainFromLine(line);
        if (domain) {
          parsedDomains.push(domain);
          if (source.enabled) {
            uniqueDomains.add(domain);
          }
        }
      }

      source.domainCount = parsedDomains.length;
      const targetFile = path.join(blocklistsDir, `${source.id}.txt`);
      fs.writeFileSync(targetFile, parsedDomains.join('\n'), 'utf8');
      addLog('INFO', 'BlockManager', `Saved ${parsedDomains.length} domains for "${source.name}"`);
    } catch (err: unknown) {
      addLog('WARN', 'BlockManager', `Failed to update source "${source.name}": ${(err as Error).message}`);
    }
  }

  // Add custom rules into total unique domains count
  for (const rule of store.block.customRules || []) {
    const norm = BlockManager.normalizeCustomRule(rule);
    if (norm) uniqueDomains.add(norm);
  }

  store.block.sources = sources;
  store.block.totalDomains = uniqueDomains.size;
  store.block.lastUpdatedTimestamp = Date.now();
  saveStore();

  // Restart running proxy with updated domains
  await restartRunningXrayIfActive();

  return { success: true, count: store.block.totalDomains };
});

// B1: Add custom block rule
ipcMain.handle('add-custom-block-rule', async (_e, rawDomain: string) => {
  const norm = BlockManager.normalizeCustomRule(rawDomain);
  if (!norm) return false;
  if (!store.block.customRules) store.block.customRules = [];
  if (store.block.customRules.includes(norm)) return false;

  store.block.customRules.push(norm);
  store.block.totalDomains = (store.block.totalDomains || 0) + 1;
  saveStore();
  addLog('INFO', 'BlockManager', `Added custom blocked domain: ${norm}`);

  await restartRunningXrayIfActive();
  return true;
});

// B1: Remove custom block rule
ipcMain.handle('remove-custom-block-rule', async (_e, rawDomain: string) => {
  if (!store.block.customRules) return false;
  const initialLen = store.block.customRules.length;
  store.block.customRules = store.block.customRules.filter((d) => d !== rawDomain);

  if (store.block.customRules.length !== initialLen) {
    store.block.totalDomains = Math.max(0, (store.block.totalDomains || 1) - 1);
    saveStore();
    addLog('INFO', 'BlockManager', `Removed custom blocked domain: ${rawDomain}`);

    await restartRunningXrayIfActive();
    return true;
  }
  return false;
});

// B8: Desktop Settings as single source of truth
ipcMain.handle('get-desktop-settings', async () => store.settings);

ipcMain.handle('save-desktop-settings', async (_e, settings: DesktopSettings) => {
  store.settings = settings;
  saveStore();

  if (process.platform === 'win32') {
    const execPath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    app.setLoginItemSettings({
      openAtLogin: Boolean(settings.startWithWindows),
      path: execPath,
      args: settings.startMinimized ? ['--minimized'] : []
    });
  }

  // B4: If running, restart with currently active profile
  await restartRunningXrayIfActive();
  return true;
});

ipcMain.handle('get-logs', async () => store.logs);
ipcMain.handle('clear-logs', async () => {
  store.logs = [];
  saveStore();
  return true;
});

ipcMain.handle('open-external-url', async (_e, url: string) => {
  shell.openExternal(url);
});

ipcMain.handle('reset-app', async () => {
  try {
    if (fs.existsSync(storeFilePath)) fs.unlinkSync(storeFilePath);
    if (fs.existsSync(proxyBackupPath)) fs.unlinkSync(proxyBackupPath);
  } catch {}
  store = loadStore();
  mainWindow?.reload();
  return true;
});

// B1: Dev-time check that every channel used in preload has an ipcMain handler
function verifyIpcHandlersRegistered(): void {
  const expectedChannels = [
    'get-profiles',
    'save-profile',
    'delete-profile',
    'select-profile',
    'duplicate-profile',
    'import-profiles-text',
    'export-profiles-json',
    'import-profiles-json',
    'start-vpn',
    'stop-vpn',
    'get-connection-state',
    'get-traffic-stats',
    'test-latency',
    'test-all-latencies',
    'get-automation-settings',
    'save-automation-settings',
    'get-wifi-status',
    'reset-manual-override',
    'get-hotspot-info',
    'save-hotspot-settings',
    'open-hotspot-settings',
    'add-firewall-rule',
    'get-block-settings',
    'save-block-settings',
    'update-blocklists',
    'add-custom-block-rule',
    'remove-custom-block-rule',
    'get-desktop-settings',
    'save-desktop-settings',
    'reset-app',
    'get-logs',
    'clear-logs',
    'open-external-url'
  ];

  const registeredHandlers: string[] = (ipcMain as any)._invokeHandlers
    ? Array.from((ipcMain as any)._invokeHandlers.keys())
    : [];

  const missing = expectedChannels.filter((c) => !registeredHandlers.includes(c));
  if (missing.length > 0) {
    console.error(`[IPC DEV CHECK WARNING] Missing ipcMain handlers: ${missing.join(', ')}`);
  } else {
    console.log(`✓ Verified: All ${expectedChannels.length} IPC channels are registered in main.ts`);
  }
}
