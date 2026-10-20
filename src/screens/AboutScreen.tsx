import React, { useState } from 'react';
import { SocialLinks } from '../core/SocialLinks';
import { ExternalLink, Copy, Check, Info, Heart, Shield, Code, Globe, MessageSquare, Send } from 'lucide-react';

export const AboutScreen: React.FC = () => {
  const [copiedHandle, setCopiedHandle] = useState<string | null>(null);
  const socialItems = SocialLinks.getLinkItems();

  const handleOpenLink = (url: string | null) => {
    if (!url) return;
    if (window.api?.openExternalUrl) {
      window.api.openExternalUrl(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const getSocialIcon = (id: string) => {
    switch (id) {
      case 'github':
        return Code;
      case 'facebook':
        return Globe;
      case 'telegram':
        return Send;
      case 'instagram':
        return Globe;
      case 'whatsapp':
        return MessageSquare;
      default:
        return ExternalLink;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center space-x-2">
          <Info className="w-5 h-5 text-cyan-400" />
          <span>About v2rayDP Desktop</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          High-performance Windows desktop client for modern VLESS and VMess proxy protocols.
        </p>
      </div>

      {/* Main Info Card */}
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        {/* App Hero */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-5 text-center sm:text-left">
          <div className="w-20 h-20 rounded-2xl bg-slate-900 border-2 border-cyan-400/80 p-1 shadow-xl shadow-cyan-500/20 flex items-center justify-center shrink-0">
            <img src="/app_logo.png" alt="v2rayDP Logo" className="w-full h-full object-contain rounded-xl" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center sm:justify-start space-x-2">
              <h3 className="text-2xl font-extrabold text-white tracking-tight">v2rayDP Desktop</h3>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                v1.0.0
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-lg">
              Official Windows desktop edition converted from the original Kotlin Android v2rayDP client. Powered by the official Xray-core engine with XTLS-Vision, VLESS-Reality, gRPC, WebSocket, Wi-Fi automation, Hotspot LAN sharing, and AdAway/EasyPrivacy DNS blocking.
            </p>
          </div>
        </div>

        <div className="h-px bg-slate-800" />

        {/* Credits */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-1">
          <div className="flex items-center space-x-2 text-cyan-400 text-xs font-bold uppercase tracking-wider">
            <Heart className="w-3.5 h-3.5 text-rose-400" />
            <span>Developer Credits</span>
          </div>
          <div className="text-sm font-bold text-white">
            Original Android app v2rayDP by <span className="text-cyan-300">DinethPansiluW</span>
          </div>
          <p className="text-xs text-slate-400">
            Lead author and creator of the v2rayDP architecture. Converted to Electron + React + TypeScript Windows desktop client.
          </p>
        </div>

        {/* Social Links List */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Developer Connect & Social Channels
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {socialItems.map((item) => {
              const Icon = getSocialIcon(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => handleOpenLink(item.url)}
                  className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between hover:border-cyan-500/50 hover:bg-slate-900 transition-all cursor-pointer group"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400 group-hover:border-cyan-500/40">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">{item.label}</div>
                      <div className="text-[11px] font-mono text-slate-400">@{item.handle}</div>
                    </div>
                  </div>

                  <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                </div>
              );
            })}
          </div>
        </div>

        <div className="h-px bg-slate-800" />

        {/* Engine & License Specs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
            <div className="text-slate-500 text-[10px] uppercase font-semibold">Proxy Engine</div>
            <div className="text-white font-bold mt-0.5">Xray-core v1.8+</div>
          </div>
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
            <div className="text-slate-500 text-[10px] uppercase font-semibold">Framework</div>
            <div className="text-white font-bold mt-0.5">Electron + React</div>
          </div>
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
            <div className="text-slate-500 text-[10px] uppercase font-semibold">Security</div>
            <div className="text-white font-bold mt-0.5">contextIsolation</div>
          </div>
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
            <div className="text-slate-500 text-[10px] uppercase font-semibold">Target OS</div>
            <div className="text-white font-bold mt-0.5">Windows 10/11 x64</div>
          </div>
        </div>

        {/* Copyright */}
        <div className="pt-2 text-center text-[11px] text-slate-500">
          © {new Date().getFullYear()} Dineth Pansilu Wickramasinghe. v2rayDP Desktop. All rights reserved.
        </div>
      </div>
    </div>
  );
};
