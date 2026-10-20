import { describe, it, expect } from 'vitest';
import { VmessLinkParser } from '../src/core/VmessLinkParser';

describe('VmessLinkParser', () => {
  it('should parse modern VLESS Reality link correctly', () => {
    const vlessLink =
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@198.51.100.25:443?type=tcp&security=reality&pbk=Z1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0T1U=&sid=12345678&fp=chrome&spx=%2F&flow=xtls-rprx-vision&sni=www.apple.com#Fast%20Reality%20Node';

    const profile = VmessLinkParser.parse(vlessLink);

    expect(profile.protocol).toBe('vless');
    expect(profile.name).toBe('Fast Reality Node');
    expect(profile.address).toBe('198.51.100.25');
    expect(profile.port).toBe(443);
    expect(profile.uuid).toBe('b831381d-6324-4d53-ad4f-8cda48b30811');
    expect(profile.network).toBe('tcp');
    expect(profile.tls).toBe('reality');
    expect(profile.publicKey).toBe('Z1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0T1U=');
    expect(profile.shortId).toBe('12345678');
    expect(profile.fingerprint).toBe('chrome');
    expect(profile.spiderX).toBe('/');
    expect(profile.flow).toBe('xtls-rprx-vision');
    expect(profile.sni).toBe('www.apple.com');
  });

  it('should parse VLESS gRPC link correctly', () => {
    const grpcLink =
      'vless://user-uuid-123@grpc.node.org:8443?type=grpc&security=tls&serviceName=my-service&mode=gun&sni=grpc.node.org#Germany%20gRPC';

    const profile = VmessLinkParser.parse(grpcLink);

    expect(profile.protocol).toBe('vless');
    expect(profile.network).toBe('grpc');
    expect(profile.tls).toBe('tls');
    expect(profile.serviceName).toBe('my-service');
    expect(profile.grpcMode).toBe('gun');
    expect(profile.name).toBe('Germany gRPC');
  });

  it('should parse VMess JSON Base64 link correctly', () => {
    const vmessConfig = {
      v: '2',
      ps: 'US Cloudflare Node',
      add: 'cloudflare.cdn.com',
      port: 443,
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6',
      aid: 0,
      scy: 'auto',
      net: 'ws',
      type: 'none',
      host: 'cloudflare.cdn.com',
      path: '/vmess-path',
      tls: 'tls',
      sni: 'cloudflare.cdn.com',
      alpn: 'http/1.1'
    };
    const b64 = Buffer.from(JSON.stringify(vmessConfig)).toString('base64');
    const vmessLink = `vmess://${b64}`;

    const profile = VmessLinkParser.parse(vmessLink);

    expect(profile.protocol).toBe('vmess');
    expect(profile.name).toBe('US Cloudflare Node');
    expect(profile.address).toBe('cloudflare.cdn.com');
    expect(profile.port).toBe(443);
    expect(profile.uuid).toBe('a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6');
    expect(profile.network).toBe('ws');
    expect(profile.path).toBe('/vmess-path');
    expect(profile.host).toBe('cloudflare.cdn.com');
    expect(profile.tls).toBe('tls');
  });

  it('should generate compliant Xray JSON config with allowInsecure: true and blackhole routing', () => {
    const profile = VmessLinkParser.parse(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@198.51.100.25:443?type=tcp&security=tls&sni=server.com#TestNode'
    );

    const jsonString = VmessLinkParser.toV2RayConfigJson(profile, {
      socksPort: 10808,
      httpPort: 10809,
      listenAllInterfaces: true,
      bypassLan: true,
      blockedDomains: ['adservice.google.com', 'tracker.net']
    });

    const parsed = JSON.parse(jsonString);

    // Inbounds check
    expect(parsed.inbounds).toHaveLength(2);
    expect(parsed.inbounds[0].port).toBe(10808);
    expect(parsed.inbounds[0].listen).toBe('0.0.0.0'); // Hotspot sharing
    expect(parsed.inbounds[1].port).toBe(10809);

    // Outbounds check
    expect(parsed.outbounds.length).toBeGreaterThanOrEqual(3);
    const proxyOutbound = parsed.outbounds.find((o: any) => o.tag === 'proxy');
    expect(proxyOutbound).toBeDefined();
    expect(proxyOutbound.protocol).toBe('vless');

    // TLS allowInsecure requirement
    expect(proxyOutbound.streamSettings.tlsSettings.allowInsecure).toBe(true);

    // Blackhole ad-blocking outbound
    const blockOutbound = parsed.outbounds.find((o: any) => o.tag === 'block');
    expect(blockOutbound).toBeDefined();
    expect(blockOutbound.protocol).toBe('blackhole');

    // Routing rules
    const adRule = parsed.routing.rules.find((r: any) => r.outboundTag === 'block');
    expect(adRule).toBeDefined();
    expect(adRule.domain).toContain('domain:adservice.google.com');
  });

  it('should generate round-trip share links', () => {
    const originalLink =
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@198.51.100.25:443?type=tcp&security=reality&pbk=my-pbk&sid=1234&fp=chrome&spx=%2F&flow=xtls-rprx-vision#MyNode';
    const profile = VmessLinkParser.parse(originalLink);
    const generated = VmessLinkParser.toShareLink(profile);

    expect(generated.startsWith('vless://')).toBe(true);
    expect(generated).toContain('b831381d-6324-4d53-ad4f-8cda48b30811');
    expect(generated).toContain('pbk=my-pbk');
    expect(generated).toContain('flow=xtls-rprx-vision');
  });
});
