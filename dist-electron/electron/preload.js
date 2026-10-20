/**
 * v2rayDP Desktop - Electron Preload Script
 * Secure IPC Bridge exposing window.api to the renderer
 */
import { contextBridge, ipcRenderer, clipboard } from 'electron';
import QRCode from 'qrcode';
contextBridge.exposeInMainWorld('api', {
    // Profiles
    getProfiles: () => ipcRenderer.invoke('get-profiles'),
    saveProfile: (profile) => ipcRenderer.invoke('save-profile', profile),
    deleteProfile: (id) => ipcRenderer.invoke('delete-profile', id),
    selectProfile: (id) => ipcRenderer.invoke('select-profile', id),
    duplicateProfile: (id) => ipcRenderer.invoke('duplicate-profile', id),
    importProfilesFromText: (text) => ipcRenderer.invoke('import-profiles-text', text),
    exportProfilesJson: () => ipcRenderer.invoke('export-profiles-json'),
    importProfilesJson: (json) => ipcRenderer.invoke('import-profiles-json', json),
    // Connection
    startVpn: (profileId) => ipcRenderer.invoke('start-vpn', profileId),
    stopVpn: (reason) => ipcRenderer.invoke('stop-vpn', reason),
    getConnectionState: () => ipcRenderer.invoke('get-connection-state'),
    getTrafficStats: () => ipcRenderer.invoke('get-traffic-stats'),
    onStateChange: (callback) => {
        const handler = (_e, state) => callback(state);
        ipcRenderer.on('on-state-change', handler);
        return () => ipcRenderer.removeListener('on-state-change', handler);
    },
    onTrafficStats: (callback) => {
        const handler = (_e, stats) => callback(stats);
        ipcRenderer.on('on-traffic-stats', handler);
        return () => ipcRenderer.removeListener('on-traffic-stats', handler);
    },
    // Latency
    testLatency: (profileId) => ipcRenderer.invoke('test-latency', profileId),
    testAllLatencies: () => ipcRenderer.invoke('test-all-latencies'),
    // Automation
    getAutomationSettings: () => ipcRenderer.invoke('get-automation-settings'),
    saveAutomationSettings: (settings) => ipcRenderer.invoke('save-automation-settings', settings),
    getWifiStatus: () => ipcRenderer.invoke('get-wifi-status'),
    onWifiStatusChange: (callback) => {
        const handler = (_e, status) => callback(status);
        ipcRenderer.on('on-wifi-status', handler);
        return () => ipcRenderer.removeListener('on-wifi-status', handler);
    },
    resetManualOverride: () => ipcRenderer.invoke('reset-manual-override'),
    // Hotspot
    getHotspotInfo: () => ipcRenderer.invoke('get-hotspot-info'),
    saveHotspotSettings: (settings) => ipcRenderer.invoke('save-hotspot-settings', settings),
    openHotspotSettings: () => ipcRenderer.invoke('open-hotspot-settings'),
    addFirewallRule: (port) => ipcRenderer.invoke('add-firewall-rule', port),
    // Ad Blocking
    getBlockSettings: () => ipcRenderer.invoke('get-block-settings'),
    saveBlockSettings: (settings) => ipcRenderer.invoke('save-block-settings', settings),
    updateBlocklists: () => ipcRenderer.invoke('update-blocklists'),
    addCustomBlockRule: (domain) => ipcRenderer.invoke('add-custom-block-rule', domain),
    removeCustomBlockRule: (domain) => ipcRenderer.invoke('remove-custom-block-rule', domain),
    // Settings
    getDesktopSettings: () => ipcRenderer.invoke('get-desktop-settings'),
    saveDesktopSettings: (settings) => ipcRenderer.invoke('save-desktop-settings', settings),
    resetApp: () => ipcRenderer.invoke('reset-app'),
    // Logs
    getLogs: () => ipcRenderer.invoke('get-logs'),
    clearLogs: () => ipcRenderer.invoke('clear-logs'),
    onLog: (callback) => {
        const handler = (_e, log) => callback(log);
        ipcRenderer.on('on-log', handler);
        return () => ipcRenderer.removeListener('on-log', handler);
    },
    // Helpers
    openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
    copyToClipboard: async (text) => {
        clipboard.writeText(text);
    },
    generateQrCode: async (text) => {
        return await QRCode.toDataURL(text, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 250,
            color: {
                dark: '#00F0FF',
                light: '#0F172A'
            }
        });
    }
});
