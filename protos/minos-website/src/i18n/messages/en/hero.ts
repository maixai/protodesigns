// Hero 区块词条(en):全页唯一 h1;次按钮「Read the docs」暂不接站点,点击弹轻提示。
// 词条结构必须与 zh-CN 完全一致(Messages 类型以 zh-CN 为来源)。
export const hero = {
  eyebrow: 'MINOS · PRIVATE NETWORK',
  title: 'Every device you own, on one private network',
  subtitle:
    'Minos turns your computers, servers, and phones into a single encrypted private network: wherever they are, they reach each other as if they shared the same rack.',
  primaryCta: 'Get started',
  secondaryCta: 'Read the docs',
  docsHint: 'Prototype demo — the docs site is not part of this prototype',
  tabs: {
    label: 'Highlights tabs: five facts about a Minos network',
    panels: {
      mesh: {
        tab: 'Mesh',
        title: 'Peer-to-peer mesh',
        blurb: 'Every pair connects directly — no hub; failed links route around.',
        diagramLabel:
          'Mesh topology diagram: nine peer devices directly interconnected, one failed link bypassed via a standby path',
        legend: {
          direct: 'Direct',
          backup: 'Standby path',
          failed: 'Failed link',
        },
        note: '9 peers · no hub',
      },
      access: {
        tab: 'Access',
        title: 'Zero-trust access',
        blurb: 'Identity first, then allow per policy; everything else is denied.',
        diagramLabel:
          'Access control diagram: a requester passes policy evaluation, is allowed to an authorized resource by identity, and denied to an unauthorized one by default',
        legend: {
          allow: 'Allowed by identity',
          deny: 'Denied by default',
        },
        labels: {
          requester: 'Requester',
          policy: 'Policy check',
          allowNote: 'Allowed by identity',
          denyNote: 'Denied by default',
        },
        note: '3 resources · own perimeter each',
      },
      encryption: {
        tab: 'Encryption',
        title: 'End-to-end encryption',
        blurb: 'Keys stay on devices; only ciphertext crosses the wire.',
        diagramLabel:
          'Encrypted link diagram: two devices each holding a key, only ciphertext on the link, keys rotated on schedule',
        legend: {
          cipher: 'End-to-end ciphertext link',
        },
        labels: {
          cipherNote: 'Ciphertext only on the wire',
          rotateNote: 'Rotated on a schedule',
        },
        note: 'Keys rotate on schedule',
      },
      environments: {
        tab: 'Environments',
        title: 'One network across environments',
        blurb: 'Cloud, data center, home, and mobile join one flat network.',
        diagramLabel:
          'Unified networking diagram: nodes inside cloud VPC, data center, home network, and mobile boundaries interconnect into a single flat network',
        legend: {
          link: 'Direct link',
          boundary: 'Environment boundary',
        },
        labels: {
          vpc: 'Cloud VPC',
          dc: 'Data center',
          home: 'Home network',
          mobile: 'Mobile',
          sameNet: 'One single network',
          noPublicIp: 'No public IP · no open ports',
        },
        note: '4 environments · 1 network',
      },
      dns: {
        tab: 'DNS',
        title: 'Private DNS, your names',
        blurb: 'Reach devices by name — registered on join, never leaked out.',
        diagramLabel:
          'Private name resolution diagram: name plates resolve through an arrow to address plates, three name-to-address pairs in total',
        legend: {
          resolve: 'Name resolution',
        },
        labels: {
          nameColumn: 'Name',
          addressColumn: 'Address',
          resolve: 'Resolve',
          // 底部两条标注在窄屏并排放置,须短(过长会在小图上互撞)
          auto: 'Auto-registered on join',
          private: 'Never leaked outside',
        },
        note: '3 names · all private',
      },
    },
  },
}
