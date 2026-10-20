import React, { useState } from 'react';
import { HotspotSettings, HotspotInfo } from '../core/types';
import {
  Radio,
  Copy,
  Check,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  Smartphone,
  Laptop,
  Flame,
  HelpCircle,
  KeyRound
} from 'lucide-react';

interface HotspotScreenProps {
  hotspotInfo: HotspotInfo;
  hotspotSettings: HotspotSettings;
  onSaveHotspotSettings: (settings: HotspotSettings) => Promise<boolean>;
  onOpenMobileHotspot: () => Promise<boolean>;
  onAddFirewallRule: (port: number) => Promise<{ success: boolean; message: string }>;
}

export const HotspotScreen: React.FC<HotspotScreenProps> = ({
  hotspotInfo,
  hotspotSettings,
  onSaveHotspotSettings,
  onOpenMobileHotspot,
  onAddFirewallRule
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [firewallStatus, setFirewallStatus] = useState<string | null>(null);
  const [isAddingRule, setIsAddingRule] = useState(false);

  const handleToggle = async (enabled: boolean) => {
    await onSaveHotspotSettings({
      ...hotspotSettings,
      isHotspotSharingEnabled: enabled
    });
  };

  const handleCopy = (text: string, key: string) => {
    if (window.api?.copyToClipboard) {
      window.api.copyToClipboard(text);
    } else {
      navigator.clipboard.writeText(text);
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleAddFirewall = async () => {
    setIsAddingRule(true);
    setFirewallStatus(null);
    try {
      const res = await onAddFirewallRule(hotspotSettings.hotspotProxyPort || 10808);
      setFirewallStatus(res.message);
    } catch (err: unknown) {
      setFirewallStatus(`Error: ${(err as Error).message}`);
    } finally {
      setIsAddingRule(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center space-x-2">
          <Radio className="w-5 h-5 text-cyan-400" />
          <span>VPN Hotspot & LAN Sharing</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Share your accelerated, uncensored VPN connection with phones, consoles, smart TVs, and other PCs on your local Wi-Fi or mobile hotspot.
        </p>
      </div>

      {/* Warning Alert Banner */}
      <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-2xl flex items-start space-x-3 text-amber-200">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-bold">Security Notice: Local Network Exposure</p>
          <p className="text-amber-300/80">
            Enabling LAN sharing binds Xray SOCKS5 and HTTP proxy listeners to <span className="font-mono text-cyan-300 font-bold">0.0.0.0</span> instead of loopback <span className="font-mono text-cyan-300">127.0.0.1</span>. Any device on your local Wi-Fi/Hotspot network can route traffic through your proxy. Ensure you only enable this on trusted local networks or Hotspots.
          </p>
        </div>
      </div>

      {/* Master Share Switch */}
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-base font-bold text-white">Share VPN over LAN / Hotspot</h3>
            {hotspotSettings.isHotspotSharingEnabled && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 uppercase">
                Active (0.0.0.0)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Allows other devices on your Wi-Fi or Windows Hotspot to connect to your proxy ports
          </p>
        </div>

        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={hotspotSettings.isHotspotSharingEnabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-12 h-6.5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5.5 after:w-5.5 after:transition-all peer-checked:bg-cyan-500 shadow-inner"></div>
        </label>
      </div>

      {/* Local IP Endpoints */}
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider text-cyan-400 flex items-center space-x-2">
          <Laptop className="w-4 h-4" />
          <span>Local Device Proxy Endpoints</span>
        </h3>

        <div className="space-y-3">
          {hotspotInfo.ipAddresses.map((ip) => {
            const httpEndpoint = `${ip}:${hotspotInfo.httpPort}`;
            const socksEndpoint = `${ip}:${hotspotInfo.socksPort}`;
            return (
              <div
                key={ip}
                className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div>
                  <div className="text-sm font-bold text-white font-mono flex items-center space-x-2">
                    <span>{ip}</span>
                    <span className="text-[10px] text-slate-500 font-sans font-normal">
                      (IPv4 Host Interface)
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs font-mono text-slate-400">
                    <span>HTTP: <strong className="text-cyan-300">{httpEndpoint}</strong></span>
                    <span>•</span>
                    <span>SOCKS5: <strong className="text-cyan-300">{socksEndpoint}</strong></span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleCopy(httpEndpoint, `http-${ip}`)}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700/80 rounded-xl text-xs font-mono font-medium flex items-center space-x-1.5 transition-colors"
                  >
                    {copiedKey === `http-${ip}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
                    <span>{copiedKey === `http-${ip}` ? 'Copied!' : 'Copy HTTP'}</span>
                  </button>

                  <button
                    onClick={() => handleCopy(socksEndpoint, `socks-${ip}`)}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700/80 rounded-xl text-xs font-mono font-medium flex items-center space-x-1.5 transition-colors"
                  >
                    {copiedKey === `socks-${ip}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
                    <span>{copiedKey === `socks-${ip}` ? 'Copied!' : 'Copy SOCKS5'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Windows Tools & Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Open Windows Mobile Hotspot settings */}
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-3">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center space-x-2">
              <Smartphone className="w-4 h-4 text-cyan-400" />
              <span>Windows Mobile Hotspot</span>
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Turn your PC into a Wi-Fi hotspot so your phone or tablet can connect directly to your laptop.
            </p>
          </div>

          <button
            onClick={onOpenMobileHotspot}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow-md"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Windows Hotspot Settings</span>
          </button>
        </div>

        {/* Windows Defender Firewall Inbound Rule */}
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-3">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center space-x-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <span>Windows Defender Firewall</span>
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              If other devices cannot connect, add an inbound firewall rule allowing traffic on ports 10808 & 10809.
            </p>
          </div>

          <div>
            <button
              onClick={handleAddFirewall}
              disabled={isAddingRule}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-orange-500/20 to-amber-500/20 hover:from-orange-500/30 hover:to-amber-500/30 text-orange-300 border border-orange-500/40 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
            >
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>{isAddingRule ? 'Requesting Elevation…' : 'Add Firewall Inbound Rule'}</span>
            </button>
            {firewallStatus && (
              <p className="text-[11px] text-cyan-300 mt-2 font-mono">{firewallStatus}</p>
            )}
          </div>
        </div>
      </div>

      {/* Client Configuration Guide */}
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider text-cyan-400 flex items-center space-x-2">
          <HelpCircle className="w-4 h-4" />
          <span>Quick Client Setup Instructions</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300">
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
            <h5 className="font-bold text-white flex items-center space-x-1">
              <span>Android / iOS Phone</span>
            </h5>
            <p className="text-[11px] text-slate-400">
              1. Connect to the same Wi-Fi/Hotspot.<br />
              2. Open Wi-Fi settings -&gt; Advanced/Proxy -&gt; Manual.<br />
              3. Set Proxy Host to PC's IP and Port to <strong className="text-cyan-400">10809</strong>.
            </p>
          </div>

          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
            <h5 className="font-bold text-white flex items-center space-x-1">
              <span>Second Laptop / PC</span>
            </h5>
            <p className="text-[11px] text-slate-400">
              1. Open Network Settings -&gt; Manual Proxy Setup.<br />
              2. Enable "Use a proxy server".<br />
              3. Address: Host IP, Port: <strong className="text-cyan-400">10809</strong>.
            </p>
          </div>

          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
            <h5 className="font-bold text-white flex items-center space-x-1">
              <span>Terminal / CLI / Git</span>
            </h5>
            <p className="text-[11px] font-mono text-slate-400">
              export http_proxy=http://{hotspotInfo.ipAddresses[0] || '192.168.1.105'}:10809<br />
              export https_proxy=http://{hotspotInfo.ipAddresses[0] || '192.168.1.105'}:10809
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
