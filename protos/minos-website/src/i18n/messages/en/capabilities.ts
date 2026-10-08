// 核心能力区块词条(en):四项,按契约 CapabilityId 索引。
export const capabilities = {
  eyebrow: 'CORE CAPABILITIES',
  tag: 'SPEC · 4 CARDS',
  title: 'Networking, the way it should be',
  items: {
    zeroConfig: {
      title: 'Zero-config mesh',
      desc: 'Any device joins the same private network — no public IPs, no open ports, no firewall edits.',
    },
    encryptedDirect: {
      title: 'Encrypted, direct',
      desc: 'Devices build encrypted tunnels to each other, preferring direct paths over detours through central nodes.',
    },
    identityBoundary: {
      title: 'Identity is the perimeter',
      desc: 'Access control is based on identity, not IP ranges: who, from which device, can reach what — readable and auditable.',
    },
    visibility: {
      title: 'The whole network, at a glance',
      desc: 'Topology, presence, connection paths, and latency — all visible in one place.',
    },
  },
}
