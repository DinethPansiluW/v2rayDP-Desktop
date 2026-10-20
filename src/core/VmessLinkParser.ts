/**
 * v2rayDP Desktop - Vmess, VLESS & Trojan Link Parser & Xray-core Config Generator
 * Built with full compatibility for modern Xray-core (v1.8+ through v26+).
 */

import { ServerProfile } from './types';

export class VmessLinkParser {
  /**
   * Parses either a vless://, vmess://, or trojan:// link into a ServerProfile.
   */
  static parse(rawInput: string): ServerProfile {
    const link = rawInput.trim();
    if (link.toLowerCase().startsWith('vless://')) {
      return this.parseVlessLink(link);
    } else if (link.toLowerCase().startsWith('vmess://')) {
      return this.parseVmessLink(link);
    } else if (link.toLowerCase().startsWith('trojan://')) {
      return this.parseTrojanLink(link);
    } else {
      throw new Error('Link must start with vless://, vmess://, or trojan://');
    }
  }

  /**
   * Standard VLESS URI format:
   * vless://[uuid]@[host]:[port]?type=[network]&security=[security]&sni=[sni]&fp=[fp]&pbk=[pbk]&sid=[sid]&flow=[flow]&serviceName=[grpcService]#remarks
   */
  static parseVlessLink(link: string): ServerProfile {
    const withoutScheme = link.substring(8).trim();
    const fragmentIndex = withoutScheme.indexOf('#');
    let remarks = 'VLESS Node';
    if (fragmentIndex !== -1) {
      try {
        remarks = decodeURIComponent(withoutScheme.substring(fragmentIndex + 1)).trim();
      } catch {
        remarks = withoutScheme.substring(fragmentIndex + 1).trim() || 'VLESS Node';
      }
    }

    const mainPart = fragmentIndex !== -1 ? withoutScheme.substring(0, fragmentIndex) : withoutScheme;
    const queryIndex = mainPart.indexOf('?');
    const authorityPart = queryIndex !== -1 ? mainPart.substring(0, queryIndex) : mainPart;
    const queryPart = queryIndex !== -1 ? mainPart.substring(queryIndex + 1) : '';

    const atIndex = authorityPart.lastIndexOf('@');
    if (atIndex === -1) {
      throw new Error("Invalid VLESS URI: Missing '@' user delimiter");
    }

    const uuid = authorityPart.substring(0, atIndex).trim();
    let hostPort = authorityPart.substring(atIndex + 1).trim();
    if (hostPort.endsWith('/')) {
      hostPort = hostPort.slice(0, -1);
    }

    let address = '';
    let port = 443;

    if (hostPort.startsWith('[')) {
      // IPv6: [::1]:port
      const closeBracket = hostPort.indexOf(']');
      if (closeBracket === -1) {
        throw new Error("Invalid IPv6 address in VLESS URI: Missing closing bracket ']'");
      }
      address = hostPort.substring(1, closeBracket).trim();
      const portStr = hostPort.substring(closeBracket + 1).replace(/^:/, '').replace(/\/$/, '').trim();
      port = parseInt(portStr, 10) || 443;
    } else if (hostPort.includes(':')) {
      const colonIndex = hostPort.lastIndexOf(':');
      address = hostPort.substring(0, colonIndex).trim().replace(/\/$/, '');
      const portStr = hostPort.substring(colonIndex + 1).replace(/^:/, '').replace(/\/$/, '').trim();
      port = parseInt(portStr, 10) || 443;
    } else {
      address = hostPort.replace(/\/$/, '');
      port = 443;
    }

    // Parse query params case-insensitively
    const queryMap: Record<string, string> = {};
    if (queryPart.length > 0) {
      const pairs = queryPart.split('&');
      for (const pair of pairs) {
        const eq = pair.indexOf('=');
        if (eq !== -1) {
          const key = pair.substring(0, eq).trim().toLowerCase();
          const rawVal = pair.substring(eq + 1).trim();
          try {
            queryMap[key] = decodeURIComponent(rawVal);
          } catch {
            queryMap[key] = rawVal;
          }
        }
      }
    }

    const networkRaw = queryMap['type'] || queryMap['net'] || 'tcp';
    const network = networkRaw.toLowerCase().trim() as 'tcp' | 'ws' | 'grpc' | 'h2';

    const securityRaw = (queryMap['security'] || 'none').toLowerCase().trim();
    const pbk = queryMap['pbk'] || queryMap['publickey'] || queryMap['public_key'] || '';
    const sid = queryMap['sid'] || queryMap['shortid'] || queryMap['short_id'] || '';
    const fp = queryMap['fp'] || queryMap['fingerprint'] || (securityRaw === 'reality' || pbk ? 'chrome' : '');
    const spx = queryMap['spx'] || queryMap['spiderx'] || queryMap['spider_x'] || '';

    const host = queryMap['host'] || '';
    let path = queryMap['path'] || '/';
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    const sni = queryMap['sni'] || queryMap['peer'] || queryMap['servername'] || queryMap['server_name'] || host || address;
    const alpn = queryMap['alpn'] || '';
    const headerType = queryMap['headertype'] || queryMap['header_type'] || 'none';

    // Flow: XTLS-Vision. Xray rejects vision on gRPC/WebSocket transports
    const rawFlow = queryMap['flow'] || '';
    const flow = (network === 'tcp' || (network as string) === 'raw') ? rawFlow : '';

    const serviceName = queryMap['servicename'] || queryMap['service_name'] || (network === 'grpc' ? path.replace(/^\//, '') : '');
    const grpcMode = queryMap['mode'] || 'gun';

    // Modern TLS verification params (migrated from allowInsecure in Xray 26+)
    const pcs = queryMap['pcs'] || queryMap['pinnedpeercertsha256'] || '';
    const vcn = queryMap['vcn'] || queryMap['verifypeercertbyname'] || '';

    let tlsMode: 'none' | 'tls' | 'reality' = 'none';
    if (securityRaw === 'reality' || pbk.length > 0) {
      tlsMode = 'reality';
    } else if (securityRaw === 'tls') {
      tlsMode = 'tls';
    }

    return {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 12),
      name: remarks || 'VLESS Node',
      protocol: 'vless',
      address,
      port,
      uuid,
      alterId: 0,
      security: 'none',
      network,
      headerType,
      host,
      path,
      tls: tlsMode,
      sni,
      alpn,
      flow,
      publicKey: pbk,
      shortId: sid,
      fingerprint: fp,
      spiderX: spx,
      serviceName,
      grpcMode,
      pinnedPeerCertSha256: pcs,
      verifyPeerCertByName: vcn,
      pingLatencyMs: -1,
      createdAt: Date.now()
    };
  }

  /**
   * Parses VMess links in v2rayN JSON Base64 or URI format.
   */
  static parseVmessLink(link: string): ServerProfile {
    const content = link.substring(8).trim();
    if (content.includes('@') && content.includes(':')) {
      return this.parseVmessUriFormat(content);
    } else {
      return this.parseVmessJsonBase64Format(content);
    }
  }

  /**
   * Standard Trojan URI format:
   * trojan://password@host:port?security=tls&sni=...&type=tcp#remarks
   */
  static parseTrojanLink(link: string): ServerProfile {
    const withoutScheme = link.substring(9).trim();
    const fragmentIndex = withoutScheme.indexOf('#');
    let remarks = 'Trojan Node';
    if (fragmentIndex !== -1) {
      try {
        remarks = decodeURIComponent(withoutScheme.substring(fragmentIndex + 1)).trim();
      } catch {
        remarks = withoutScheme.substring(fragmentIndex + 1).trim() || 'Trojan Node';
      }
    }

    const mainPart = fragmentIndex !== -1 ? withoutScheme.substring(0, fragmentIndex) : withoutScheme;
    const queryIndex = mainPart.indexOf('?');
    const authorityPart = queryIndex !== -1 ? mainPart.substring(0, queryIndex) : mainPart;
    const queryPart = queryIndex !== -1 ? mainPart.substring(queryIndex + 1) : '';

    const atIndex = authorityPart.lastIndexOf('@');
    if (atIndex === -1) {
      throw new Error("Invalid Trojan URI: Missing '@' delimiter");
    }

    const password = authorityPart.substring(0, atIndex).trim();
    let hostPort = authorityPart.substring(atIndex + 1).trim();
    if (hostPort.endsWith('/')) {
      hostPort = hostPort.slice(0, -1);
    }

    let address = '';
    let port = 443;
    if (hostPort.startsWith('[')) {
      const closeBracket = hostPort.indexOf(']');
      if (closeBracket === -1) throw new Error('Invalid IPv6 address in Trojan URI');
      address = hostPort.substring(1, closeBracket).trim();
      const portStr = hostPort.substring(closeBracket + 1).replace(/^:/, '').replace(/\/$/, '').trim();
      port = parseInt(portStr, 10) || 443;
    } else if (hostPort.includes(':')) {
      const colonIndex = hostPort.lastIndexOf(':');
      address = hostPort.substring(0, colonIndex).trim().replace(/\/$/, '');
      const portStr = hostPort.substring(colonIndex + 1).replace(/^:/, '').replace(/\/$/, '').trim();
      port = parseInt(portStr, 10) || 443;
    } else {
      address = hostPort.replace(/\/$/, '');
      port = 443;
    }

    const queryMap: Record<string, string> = {};
    if (queryPart.length > 0) {
      const pairs = queryPart.split('&');
      for (const pair of pairs) {
        const eq = pair.indexOf('=');
        if (eq !== -1) {
          const key = pair.substring(0, eq).trim().toLowerCase();
          const rawVal = pair.substring(eq + 1).trim();
          try {
            queryMap[key] = decodeURIComponent(rawVal);
          } catch {
            queryMap[key] = rawVal;
          }
        }
      }
    }

    const networkRaw = queryMap['type'] || queryMap['net'] || 'tcp';
    const network = networkRaw.toLowerCase().trim() as 'tcp' | 'ws' | 'grpc' | 'h2';
    const host = queryMap['host'] || '';
    let path = queryMap['path'] || '/';
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    const sni = queryMap['sni'] || queryMap['peer'] || host || address;
    const alpn = queryMap['alpn'] || '';
    const fp = queryMap['fp'] || queryMap['fingerprint'] || 'chrome';
    const pcs = queryMap['pcs'] || queryMap['pinnedpeercertsha256'] || '';
    const vcn = queryMap['vcn'] || queryMap['verifypeercertbyname'] || '';

    return {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 12),
      name: remarks,
      protocol: 'trojan',
      address,
      port,
      uuid: password,
      alterId: 0,
      security: 'none',
      network,
      headerType: 'none',
      host,
      path,
      tls: 'tls',
      sni,
      alpn,
      flow: '',
      publicKey: '',
      shortId: '',
      fingerprint: fp,
      spiderX: '',
      serviceName: '',
      grpcMode: 'gun',
      pinnedPeerCertSha256: pcs,
      verifyPeerCertByName: vcn,
      pingLatencyMs: -1,
      createdAt: Date.now()
    };
  }

  private static parseVmessJsonBase64Format(base64Content: string): ServerProfile {
    const decodedJson = this.decodeFlexibleBase64(base64Content);
    const json = JSON.parse(decodedJson);

    const name = String(json.ps || 'VMess Server').trim() || 'VMess Server';
    const address = String(json.add || '').trim();
    const port = parseInt(json.port, 10) || 443;
    const uuid = String(json.id || '').trim();
    const alterId = parseInt(json.aid, 10) || 0;
    const security = String(json.scy || 'auto').trim() || 'auto';
    const network = (String(json.net || 'tcp').trim().toLowerCase() || 'tcp') as 'tcp' | 'ws' | 'grpc' | 'h2';
    const headerType = String(json.type || 'none').trim().toLowerCase();
    const host = String(json.host || '').trim();
    let path = String(json.path || '/').trim() || '/';
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    const tls = String(json.tls || '').trim().toLowerCase();
    const sni = String(json.sni || host || address).trim();
    const alpn = String(json.alpn || '').trim();
    const fp = String(json.fp || '').trim();
    const pcs = String(json.pcs || json.pinnedPeerCertSha256 || '').trim();
    const vcn = String(json.vcn || json.verifyPeerCertByName || '').trim();

    if (!address) throw new Error("Server address 'add' is missing");
    if (!uuid) throw new Error("Server UUID 'id' is missing");
    if (port <= 0 || port > 65535) throw new Error(`Invalid port: ${port}`);

    return {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 12),
      name,
      protocol: 'vmess',
      address,
      port,
      uuid,
      alterId,
      security,
      network,
      headerType,
      host,
      path,
      tls: (tls && tls !== 'none') ? 'tls' : 'none',
      sni,
      alpn,
      flow: '',
      publicKey: '',
      shortId: '',
      fingerprint: fp,
      spiderX: '',
      serviceName: '',
      grpcMode: 'gun',
      pinnedPeerCertSha256: pcs,
      verifyPeerCertByName: vcn,
      pingLatencyMs: -1,
      createdAt: Date.now()
    };
  }

  private static parseVmessUriFormat(uriContent: string): ServerProfile {
    const atIndex = uriContent.indexOf('@');
    const questionIndex = uriContent.indexOf('?');
    const authority = questionIndex !== -1 ? uriContent.substring(0, questionIndex) : uriContent;
    const queryPart = questionIndex !== -1 ? uriContent.substring(questionIndex + 1) : '';

    const userInfo = atIndex !== -1 ? authority.substring(0, atIndex) : '';
    const hostPort = atIndex !== -1 ? authority.substring(atIndex + 1) : authority;

    const userParts = userInfo.split(':');
    const security = userParts.length > 1 ? userParts[0] : 'auto';
    const uuid = userParts.length > 1 ? userParts[1] : userParts[0];

    const colonIndex = hostPort.lastIndexOf(':');
    const address = colonIndex !== -1 ? hostPort.substring(0, colonIndex).replace(/\/$/, '') : hostPort;
    const port = colonIndex !== -1 ? (parseInt(hostPort.substring(colonIndex + 1), 10) || 443) : 443;

    const queryParams = new URLSearchParams(queryPart);
    const remarks = queryParams.get('remarks') || 'VMess Server';
    const network = (queryParams.get('obfs') || queryParams.get('net') || 'tcp').toLowerCase() as 'tcp' | 'ws' | 'grpc' | 'h2';
    let path = queryParams.get('path') || '/';
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    const host = queryParams.get('obfsParam') || queryParams.get('host') || '';
    const tlsRaw = queryParams.get('tls');
    const tls = (tlsRaw === '1' || tlsRaw === 'tls') ? 'tls' : 'none';
    const sni = queryParams.get('peer') || queryParams.get('sni') || host || address;
    const pcs = queryParams.get('pcs') || queryParams.get('pinnedPeerCertSha256') || '';
    const vcn = queryParams.get('vcn') || queryParams.get('verifyPeerCertByName') || '';
    const fp = queryParams.get('fp') || '';

    return {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 12),
      name: remarks,
      protocol: 'vmess',
      address,
      port,
      uuid,
      alterId: 0,
      security,
      network,
      headerType: 'none',
      host,
      path,
      tls,
      sni,
      alpn: '',
      flow: '',
      publicKey: '',
      shortId: '',
      fingerprint: fp,
      spiderX: '',
      serviceName: '',
      grpcMode: 'gun',
      pinnedPeerCertSha256: pcs,
      verifyPeerCertByName: vcn,
      pingLatencyMs: -1,
      createdAt: Date.now()
    };
  }

  /**
   * Converts a ServerProfile into the appropriate share link.
   */
  static toShareLink(profile: ServerProfile): string {
    if (profile.protocol === 'trojan') {
      return this.toTrojanLink(profile);
    }
    return profile.protocol === 'vless' ? this.toVlessLink(profile) : this.toVmessLink(profile);
  }

  static toTrojanLink(profile: ServerProfile): string {
    const encodedName = encodeURIComponent(profile.name || 'Trojan Node');
    let link = `trojan://${encodeURIComponent(profile.uuid)}@${profile.address}:${profile.port}?security=tls&type=${profile.network || 'tcp'}`;
    if (profile.sni) link += `&sni=${encodeURIComponent(profile.sni)}`;
    if (profile.fingerprint) link += `&fp=${encodeURIComponent(profile.fingerprint)}`;
    if (profile.alpn) link += `&alpn=${encodeURIComponent(profile.alpn)}`;
    if (profile.pinnedPeerCertSha256) link += `&pcs=${encodeURIComponent(profile.pinnedPeerCertSha256)}`;
    if (profile.verifyPeerCertByName) link += `&vcn=${encodeURIComponent(profile.verifyPeerCertByName)}`;
    if (profile.network === 'ws') {
      link += `&path=${encodeURIComponent(profile.path || '/')}`;
      if (profile.host) link += `&host=${encodeURIComponent(profile.host)}`;
    }
    link += `#${encodedName}`;
    return link;
  }

  static toVlessLink(profile: ServerProfile): string {
    const encodedPath = encodeURIComponent(profile.path || '/');
    const encodedName = encodeURIComponent(profile.name || 'VLESS Node');
    const sec = profile.tls === 'reality' ? 'reality' : (profile.tls === 'tls' ? 'tls' : 'none');

    let link = `vless://${profile.uuid}@${profile.address}:${profile.port}?type=${profile.network}&security=${sec}&path=${encodedPath}`;
    if (profile.host) link += `&host=${encodeURIComponent(profile.host)}`;
    if (profile.sni) link += `&sni=${encodeURIComponent(profile.sni)}`;
    if (profile.alpn) link += `&alpn=${encodeURIComponent(profile.alpn)}`;
    if (profile.pinnedPeerCertSha256) link += `&pcs=${encodeURIComponent(profile.pinnedPeerCertSha256)}`;
    if (profile.verifyPeerCertByName) link += `&vcn=${encodeURIComponent(profile.verifyPeerCertByName)}`;
    if (profile.flow && (profile.network === 'tcp' || (profile.network as string) === 'raw')) {
      link += `&flow=${encodeURIComponent(profile.flow)}`;
    }
    if (profile.tls === 'reality') {
      link += `&pbk=${encodeURIComponent(profile.publicKey)}&sid=${encodeURIComponent(profile.shortId)}&fp=${encodeURIComponent(profile.fingerprint || 'chrome')}&spx=${encodeURIComponent(profile.spiderX || '/')}`;
    }
    if (profile.network === 'grpc') {
      link += `&serviceName=${encodeURIComponent(profile.serviceName)}&mode=${profile.grpcMode || 'gun'}`;
    }
    link += `#${encodedName}`;
    return link;
  }

  static toVmessLink(profile: ServerProfile): string {
    const json: Record<string, string> = {
      v: '2',
      ps: profile.name,
      add: profile.address,
      port: String(profile.port),
      id: profile.uuid,
      aid: String(profile.alterId || 0),
      scy: profile.security || 'auto',
      net: profile.network || 'tcp',
      type: profile.headerType || 'none',
      host: profile.host || '',
      path: profile.path || '/',
      tls: profile.tls === 'tls' ? 'tls' : '',
      sni: profile.sni || profile.host || '',
      alpn: profile.alpn || ''
    };
    if (profile.fingerprint) json.fp = profile.fingerprint;
    if (profile.pinnedPeerCertSha256) json.pcs = profile.pinnedPeerCertSha256;
    if (profile.verifyPeerCertByName) json.vcn = profile.verifyPeerCertByName;

    const jsonStr = JSON.stringify(json);
    const base64 = typeof Buffer !== 'undefined'
      ? Buffer.from(jsonStr, 'utf8').toString('base64')
      : btoa(unescape(encodeURIComponent(jsonStr)));
    return `vmess://${base64}`;
  }

  /**
   * Deeply cleanses any configuration object, recursively purging all deprecated fields
   * like "allowInsecure" to guarantee 100% startup success on Xray-core 26.x+.
   */
  static sanitizeConfig(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeConfig(item));
    } else if (obj !== null && typeof obj === 'object') {
      const cleaned: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        // Strip legacy allowInsecure from all sections
        if (key === 'allowInsecure') {
          continue;
        }
        cleaned[key] = this.sanitizeConfig(val);
      }
      return cleaned;
    }
    return obj;
  }

  /**
   * Generates a complete, compliant V2Ray/Xray JSON configuration for this profile.
   * Certificate handling rule: Modern Xray-core (v26+) migration compliant.
   * Strips "allowInsecure" completely and applies modern TLS verification standards.
   */
  static toV2RayConfigJson(
    profile: ServerProfile,
    options: {
      socksPort?: number;
      httpPort?: number;
      listenAllInterfaces?: boolean; // Hotspot sharing
      bypassLan?: boolean;
      primaryDns?: string;
      secondaryDns?: string;
      blockedDomains?: string[];
      logLevel?: 'warning' | 'info' | 'debug' | 'error' | 'none';
    } = {}
  ): string {
    const socksPort = options.socksPort || 10808;
    const httpPort = options.httpPort || 10809;
    const listenHost = options.listenAllInterfaces ? '0.0.0.0' : '127.0.0.1';
    const bypassLan = options.bypassLan !== false;
    const primaryDns = options.primaryDns || '1.1.1.1';
    const secondaryDns = options.secondaryDns || '8.8.8.8';
    const logLevel = options.logLevel || 'warning';
    const blockedDomains = options.blockedDomains || [];

    const root: Record<string, unknown> = {};

    // 1. Log configuration
    root.log = {
      loglevel: logLevel === 'none' ? 'error' : logLevel
    };

    // 1b. Stats & API Service for real-time traffic statistics
    root.stats = {};
    root.api = {
      tag: 'api',
      services: ['StatsService']
    };
    root.policy = {
      system: {
        statsOutboundUplink: true,
        statsOutboundDownlink: true
      }
    };

    // 2. Inbounds
    const inbounds: Record<string, unknown>[] = [
      {
        tag: 'socks-in',
        port: socksPort,
        listen: listenHost,
        protocol: 'socks',
        settings: {
          auth: 'noauth',
          udp: true
        },
        sniffing: {
          enabled: true,
          destOverride: ['http', 'tls']
        }
      },
      {
        tag: 'http-in',
        port: httpPort,
        listen: listenHost,
        protocol: 'http',
        settings: {}
      },
      {
        tag: 'api',
        port: 10085,
        listen: '127.0.0.1',
        protocol: 'dokodemo-door',
        settings: {
          address: '127.0.0.1'
        }
      }
    ];
    root.inbounds = inbounds;

    // 3. Outbounds
    const outbounds: Record<string, unknown>[] = [];

    // Proxy Outbound
    const isVless = profile.protocol === 'vless';
    const isTrojan = profile.protocol === 'trojan';
    const isReality = profile.tls === 'reality' || Boolean(profile.publicKey);
    const isTls = profile.tls === 'tls' || isReality;

    // Modern StreamSettings with keep-alive
    const streamSettings: Record<string, unknown> = {
      network: profile.network || 'tcp',
      security: isReality ? 'reality' : (isTls ? 'tls' : 'none'),
      sockopt: {
        tcpKeepAliveInterval: 15,
        tcpFastOpen: false
      }
    };

    if (isReality) {
      streamSettings.realitySettings = {
        serverName: profile.sni || profile.address,
        fingerprint: profile.fingerprint || 'chrome',
        show: false,
        publicKey: profile.publicKey,
        shortId: profile.shortId || '',
        spiderX: profile.spiderX || '/'
      };
    } else if (isTls) {
      const tlsSettings: Record<string, unknown> = {
        serverName: profile.sni || profile.address
      };
      if (profile.fingerprint) {
        tlsSettings.fingerprint = profile.fingerprint;
      }
      if (profile.alpn) {
        tlsSettings.alpn = profile.alpn.split(',').map((s) => s.trim()).filter(Boolean);
      }
      // Modern Xray-core 26+ certification pinning and verification
      if (profile.pinnedPeerCertSha256) {
        tlsSettings.pinnedPeerCertSha256 = profile.pinnedPeerCertSha256
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (profile.verifyPeerCertByName) {
        tlsSettings.verifyPeerCertByName = profile.verifyPeerCertByName
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      // Note: "allowInsecure" is strictly omitted. Xray-core (v26+) errors immediately if present:
      // "The feature allowInsecure has been removed and migrated to pinnedPeerCertSha256(pcs) and verifyPeerCertByName(vcn)."
      streamSettings.tlsSettings = tlsSettings;
    }

    if (profile.network === 'ws') {
      let wsPath = profile.path || '/';
      if (!wsPath.startsWith('/')) {
        wsPath = `/${wsPath}`;
      }
      const wsSettings: Record<string, unknown> = {
        path: wsPath,
        maxEarlyData: 0
      };
      if (profile.host) {
        wsSettings.headers = { Host: profile.host };
      }
      streamSettings.wsSettings = wsSettings;
    } else if (profile.network === 'grpc') {
      streamSettings.grpcSettings = {
        serviceName: profile.serviceName || (profile.path ? profile.path.replace(/^\//, '') : ''),
        multiMode: profile.grpcMode === 'multi'
      };
    } else if (profile.network === 'tcp' && profile.headerType?.toLowerCase() === 'http') {
      streamSettings.tcpSettings = {
        header: {
          type: 'http',
          request: {
            version: '1.1',
            method: 'GET',
            path: [profile.path || '/'],
            headers: profile.host ? { Host: [profile.host] } : undefined
          }
        }
      };
    }

    let proxyOutbound: Record<string, unknown>;
    if (isTrojan) {
      proxyOutbound = {
        tag: 'proxy',
        protocol: 'trojan',
        settings: {
          servers: [
            {
              address: profile.address,
              port: profile.port,
              password: profile.uuid
            }
          ]
        },
        streamSettings
      };
    } else {
      const userObj: Record<string, unknown> = {
        id: profile.uuid,
        level: 0
      };

      if (isVless) {
        userObj.encryption = 'none';
        if (profile.flow && (profile.network === 'tcp' || (profile.network as string) === 'raw')) {
          userObj.flow = profile.flow;
        }
      } else {
        userObj.alterId = profile.alterId || 0;
        userObj.security = profile.security || 'auto';
      }

      const serverObj = {
        address: profile.address,
        port: profile.port,
        users: [userObj]
      };

      proxyOutbound = {
        tag: 'proxy',
        protocol: isVless ? 'vless' : 'vmess',
        settings: {
          vnext: [serverObj]
        },
        streamSettings
      };
    }
    outbounds.push(proxyOutbound);

    // Direct outbound
    outbounds.push({
      tag: 'direct',
      protocol: 'freedom',
      settings: {}
    });

    // Block outbound (blackhole for ad blocking)
    outbounds.push({
      tag: 'block',
      protocol: 'blackhole',
      settings: {
        response: {
          type: 'none'
        }
      }
    });

    root.outbounds = outbounds;

    // 4. Routing
    const rules: Record<string, unknown>[] = [];

    // 4-api. Route internal StatsService API traffic
    rules.push({
      type: 'field',
      inboundTag: ['api'],
      outboundTag: 'api'
    });

    // 4a. Ad-blocking rule if domains exist
    if (blockedDomains.length > 0) {
      const domainRules: string[] = [];
      for (const d of blockedDomains) {
        domainRules.push(`domain:${d}`);
      }
      rules.push({
        type: 'field',
        outboundTag: 'block',
        domain: domainRules
      });
    }

    // 4b. Captive portal validation bypass rule -> direct
    rules.push({
      type: 'field',
      outboundTag: 'direct',
      domain: [
        'domain:connectivitycheck.gstatic.com',
        'domain:clients3.google.com',
        'domain:captive.apple.com',
        'domain:connectivitycheck.android.com',
        'domain:msftconnecttest.com',
        'domain:detectportal.firefox.com',
        'domain:gstatic.com',
        'domain:g.cn',
        'domain:google.cn'
      ]
    });

    // 4c. Bypass private LAN IPs if enabled
    if (bypassLan) {
      rules.push({
        type: 'field',
        outboundTag: 'direct',
        ip: ['geoip:private']
      });
    }

    // 4d. Default Internet traffic -> proxy outbound
    rules.push({
      type: 'field',
      outboundTag: 'proxy',
      network: 'tcp,udp'
    });

    root.routing = {
      domainStrategy: 'IPIfNonMatch',
      domainMatcher: 'hybrid',
      rules
    };

    // 5. DNS configuration
    root.dns = {
      servers: [primaryDns, secondaryDns, 'localhost']
    };

    return JSON.stringify(this.sanitizeConfig(root), null, 2);
  }

  private static decodeFlexibleBase64(input: string): string {
    let sanitized = input
      .trim()
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .replace(/[\r\n\s]/g, '');

    const remainder = sanitized.length % 4;
    if (remainder > 0) {
      sanitized += '='.repeat(4 - remainder);
    }

    if (typeof Buffer !== 'undefined') {
      return Buffer.from(sanitized, 'base64').toString('utf8');
    } else {
      return decodeURIComponent(escape(atob(sanitized)));
    }
  }
}
