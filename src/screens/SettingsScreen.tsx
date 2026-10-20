import React, { useState } from 'react';
import { DesktopSettings } from '../core/types';
import {
  Sliders,
  Network,
  Globe,
  HardDrive,
  Download,
  Upload,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  FileCode,
  Shield,
  Monitor,
  EyeOff
} from 'lucide-react';

interface SettingsScreenProps {
  settings: DesktopSettings;
  onSaveSettings: (settings: DesktopSettings) => Promise<boolean>;
  onExportProfiles: () => Promise<string>;
  onImportProfiles: (json: string) => Promise<{ added: number; errors: string[] }>;
  onResetApp: () => Promise<boolean>;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  onSaveSettings,
  onExportProfiles,
  onImportProfiles,
  onResetApp
}) => {
  const [socksPort, setSocksPort] = useState(settings.socksPort || 10808);
  const [httpPort, setHttpPort] = useState(settings.httpPort || 10809);
  const [primaryDns, setPrimaryDns] = useState(settings.primaryDns || '1.1.1.1');
  const [secondaryDns, setSecondaryDns] = useState(settings.secondaryDns || '8.8.8.8');
  const [isBypassLan, setIsBypassLan] = useState(settings.isBypassLan !== false);
  const [logLevel, setLogLevel] = useState(settings.logLevel || 'warning');
  const [minimizeToTray, setMinimizeToTray] = useState(settings.minimizeToTray !== false);
  const [closeToTray, setCloseToTray] = useState(settings.closeToTray !== false);
  const [startWithWindows, setStartWithWindows] = useState(Boolean(settings.startWithWindows));

  const [savedNotice, setSavedNotice] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSettings({
      ...settings,
      socksPort: Number(socksPort) || 10808,
      httpPort: Number(httpPort) || 10809,
      primaryDns: primaryDns.trim() || '1.1.1.1',
      secondaryDns: secondaryDns.trim() || '8.8.8.8',
      isBypassLan,
      logLevel,
      minimizeToTray,
      closeToTray,
      startWithWindows
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleExport = async () => {
    const json = await onExportProfiles();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `v2raydp_profiles_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        if (text) {
          const res = await onImportProfiles(text);
          if (res.added > 0) {
            setImportNotice(`Successfully restored ${res.added} profiles!`);
          } else if (res.errors.length > 0) {
            setImportNotice(`Error: ${res.errors.join(', ')}`);
          }
          setTimeout(() => setImportNotice(null), 3500);
        }
      };
      reader.readAsText(file);
    }
    if (e.target) e.target.value = '';
  };

  const handleConfirmReset = async () => {
    if (window.confirm('Are you sure you want to reset v2rayDP Desktop? This will clear all profiles and configuration.')) {
      await onResetApp();
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <input type="file" ref={fileInputRef} onChange={handleFileImport} accept=".json" className="hidden" />

      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center space-x-2">
          <Sliders className="w-5 h-5 text-cyan-400" />
          <span>Desktop & Core Settings</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure proxy inbound ports, DNS routing, system tray behavior, and backup/restore.
        </p>
      </div>

      {savedNotice && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-500/60 rounded-xl text-emerald-300 text-xs flex items-center space-x-2 font-bold shadow-lg animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Settings successfully saved and applied!</span>
        </div>
      )}

      {importNotice && (
        <div className="p-3 bg-cyan-950/80 border border-cyan-500/60 rounded-xl text-cyan-300 text-xs flex items-center space-x-2 font-bold shadow-lg">
          <Info className="w-4 h-4 text-cyan-400" />
          <span>{importNotice}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Mode Selection */}
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider text-cyan-400 flex items-center space-x-2">
            <Globe className="w-4 h-4" />
            <span>Proxy Operating Mode</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* System Proxy Card (Active) */}
            <div className="p-4 bg-slate-950/80 border-2 border-cyan-500/60 rounded-xl relative shadow-md">
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="text-sm font-bold text-white">Windows System Proxy</h4>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60 uppercase">
                  Active Default
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Sets system proxy in Windows Registry (HKCU\...\Internet Settings) and notifies WinINet. Supports browsers, Discord, Telegram, and standard apps with zero drivers needed.
              </p>
            </div>

            {/* TUN Mode Card (Coming Soon) */}
            <div className="p-4 bg-slate-900/30 border border-slate-800 rounded-xl opacity-60 relative cursor-not-allowed">
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="text-sm font-bold text-slate-400">TUN Virtual Adapter Mode</h4>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700 uppercase">
                  Coming Soon
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Wintun virtual network adapter capturing all UDP/TCP games and terminal traffic globally without application proxy configuration.
              </p>
            </div>
          </div>
        </div>

        {/* Inbound Ports & DNS */}
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider text-cyan-400 flex items-center space-x-2">
            <Network className="w-4 h-4" />
            <span>Inbound Ports & DNS Configuration</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Local SOCKS5 Inbound Port
              </label>
              <input
                type="number"
                value={socksPort}
                onChange={(e) => setSocksPort(parseInt(e.target.value, 10) || 10808)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">Default: 10808 (supports UDP proxying)</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Local HTTP Inbound Port
              </label>
              <input
                type="number"
                value={httpPort}
                onChange={(e) => setHttpPort(parseInt(e.target.value, 10) || 10809)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">Default: 10809 (used for Windows system proxy)</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Primary DNS Server
              </label>
              <input
                type="text"
                value={primaryDns}
                onChange={(e) => setPrimaryDns(e.target.value)}
                placeholder="1.1.1.1"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Secondary DNS Server
              </label>
              <input
                type="text"
                value={secondaryDns}
                onChange={(e) => setSecondaryDns(e.target.value)}
                placeholder="8.8.8.8"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          <div className="h-px bg-slate-800 pt-2" />

          {/* Bypass LAN */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <h4 className="text-sm font-semibold text-slate-200">Bypass LAN / Private Ranges</h4>
              <p className="text-xs text-slate-400">
                Directly routes private RFC1918 subnets (192.168.x, 10.x, 172.16.x) without going through the proxy
              </p>
            </div>
            <input
              type="checkbox"
              checked={isBypassLan}
              onChange={(e) => setIsBypassLan(e.target.checked)}
              className="w-4 h-4 accent-cyan-400 cursor-pointer"
            />
          </div>

          <div className="h-px bg-slate-800" />

          {/* Log Level */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Xray Core Log Level
            </label>
            <select
              value={logLevel}
              onChange={(e) => setLogLevel(e.target.value as DesktopSettings['logLevel'])}
              className="w-full md:w-64 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="warning">Warning (Recommended)</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
              <option value="error">Error only</option>
              <option value="none">None (Silent)</option>
            </select>
          </div>
        </div>

        {/* Windows Desktop & Tray Options */}
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider text-cyan-400 flex items-center space-x-2">
            <Monitor className="w-4 h-4" />
            <span>Windows & Tray Behaviors</span>
          </h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-200">Minimize to System Tray</h4>
                <p className="text-xs text-slate-400">
                  Hides window into the taskbar notification tray when clicking minimize
                </p>
              </div>
              <input
                type="checkbox"
                checked={minimizeToTray}
                onChange={(e) => setMinimizeToTray(e.target.checked)}
                className="w-4 h-4 accent-cyan-400 cursor-pointer"
              />
            </div>

            <div className="h-px bg-slate-800" />

            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-200">Close to System Tray</h4>
                <p className="text-xs text-slate-400">
                  Clicking the window 'X' close button minimizes to the tray instead of quitting
                </p>
              </div>
              <input
                type="checkbox"
                checked={closeToTray}
                onChange={(e) => setCloseToTray(e.target.checked)}
                className="w-4 h-4 accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-cyan-500/20 transition-all"
          >
            Save All Settings
          </button>
        </div>
      </form>

      {/* Backup, Restore, and Reset */}
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider text-cyan-400 flex items-center space-x-2">
          <HardDrive className="w-4 h-4" />
          <span>Profile Backup, Restore & Reset</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {/* Export JSON */}
          <button
            type="button"
            onClick={handleExport}
            className="p-3 bg-slate-900 hover:bg-slate-850 border border-slate-700/80 rounded-xl text-left transition-all group"
          >
            <div className="flex items-center space-x-2 text-cyan-400 mb-1">
              <Download className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
              <span className="text-xs font-bold text-white">Backup Profiles (JSON)</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Export all your configured VLESS and VMess nodes to a JSON backup file.
            </p>
          </button>

          {/* Import JSON */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 bg-slate-900 hover:bg-slate-850 border border-slate-700/80 rounded-xl text-left transition-all group"
          >
            <div className="flex items-center space-x-2 text-cyan-400 mb-1">
              <Upload className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
              <span className="text-xs font-bold text-white">Restore Profiles (JSON)</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Restore previously exported profiles from a v2rayDP JSON backup file.
            </p>
          </button>

          {/* Reset App */}
          <button
            type="button"
            onClick={handleConfirmReset}
            className="p-3 bg-red-950/20 hover:bg-red-950/40 border border-red-800/50 rounded-xl text-left transition-all group"
          >
            <div className="flex items-center space-x-2 text-red-400 mb-1">
              <RotateCcw className="w-4 h-4 group-hover:rotate-45 transition-transform" />
              <span className="text-xs font-bold text-red-300">Reset Application</span>
            </div>
            <p className="text-[11px] text-red-400/80">
              Clears all local profiles, settings, and logs, returning app to fresh state.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
};

function Info(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
