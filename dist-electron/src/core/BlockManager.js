/**
 * v2rayDP Desktop - Ad & Threat Blocking Manager
 * Ported from BlockEngine.kt, BlockListManager.kt, BlockModel.kt
 */
import defaultSources from '../assets/blocklist_sources.json';
export class BlockManager {
    static getDefaultSettings() {
        const sources = defaultSources.map(s => ({
            ...s,
            enabled: true,
            domainCount: s.id === 'ads' ? 52000 : s.id === 'trackers' ? 44000 : 28000
        }));
        return {
            isBlockingEnabled: true,
            sources,
            customRules: ['telemetry.example.com', 'analytics.tracker.org'],
            totalDomains: 124000,
            lastUpdatedTimestamp: Date.now() - 3600000 * 12,
            sessionBlockedCount: 0,
            totalBlockedCount: 142
        };
    }
    /**
     * Normalizes a custom user rule into a clean domain.
     * Ported from normalizeCustomRule in BlockListManager.kt
     */
    static normalizeCustomRule(raw) {
        let s = raw.trim().toLowerCase();
        if (s.startsWith('*.')) {
            s = s.substring(2);
        }
        s = s.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
        s = s.replace(/\.$/, '');
        if (!s || s.includes(' ') || !s.includes('.')) {
            return null;
        }
        return s;
    }
    /**
     * Parses domain from a single line in hosts or domains format.
     * Ported from parseDomainFromLine in BlockListManager.kt
     */
    static parseDomainFromLine(line) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
            return null;
        }
        const noComment = trimmed.split('#')[0].split('!')[0].trim();
        if (!noComment)
            return null;
        const tokens = noComment.split(/\s+/);
        let candidate = tokens[0];
        if (tokens.length >= 2 && (tokens[0] === '0.0.0.0' || tokens[0] === '127.0.0.1' || tokens[0] === '::1')) {
            candidate = tokens[1];
        }
        let domain = candidate.toLowerCase().replace(/\.$/, '');
        if (domain.startsWith('*.'))
            domain = domain.substring(2);
        const ignored = new Set([
            'localhost',
            'localhost.localdomain',
            'local',
            'broadcasthost',
            'ip6-localhost',
            'ip6-loopback',
            '0.0.0.0'
        ]);
        if (!domain || ignored.has(domain) || !domain.includes('.')) {
            return null;
        }
        return domain;
    }
}
