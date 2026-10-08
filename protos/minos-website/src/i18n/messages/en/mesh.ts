// 跨层 Mesh 区块词条(en):结构与 zh-CN 完全一致(Messages 类型以 zh-CN 为来源)。
export const mesh = {
  eyebrow: 'CROSS-LAYER MESH',
  tag: 'L2 · L3 · L7',
  title: 'One network, three ways in',
  lede: 'From link layer to application layer: the same private network, joined at the layer that fits.',
  selectorLabel: 'Pick a network layer: L2 link, L3 network, L7 application',
  layers: {
    l2: {
      tab: 'L2 · Link',
      title: 'Link layer: as if on the same switch',
      blurb: 'Forwards data frames and links devices at layer 2 — built for IoT and industrial gear that cannot run a client.',
      diagramLabel: 'Link-layer view: four devices each dropping onto one shared link-layer segment, with a data frame crossing it',
      legend: {
        link: 'Link',
        segment: 'Segment boundary',
      },
      labels: {
        // 窄屏段下线下的空白带有限,标注须短(过长会越出图版)
        segment: 'Shared L2 segment',
      },
      note: '4 devices · one segment',
    },
    l3: {
      tab: 'L3 · Network',
      title: 'Network layer: subnets routed over the mesh',
      blurb: 'Forwards network-layer packets; subnets reach each other directly, with no hand-maintained route tables.',
      diagramLabel: 'Network-layer view: two subnets with two nodes each, cross-subnet links routed directly over the mesh',
      legend: {
        route: 'Routed link',
        subnet: 'Subnet boundary',
      },
      labels: {
        routed: 'Routed via mesh',
      },
      note: '2 subnets · auto-converged',
    },
    l7: {
      tab: 'L7 · App',
      title: 'Application layer: proxies and port mapping',
      blurb: 'Open access per service at the application layer: proxies, port mapping, and reverse mapping for finer-grained control.',
      diagramLabel:
        'Application-layer service view: four flows — HTTP proxy, SOCKS proxy, port mapping, and reverse port mapping — each from an entry point on the left to a service on the right',
      legend: {
        flow: 'Application flow',
      },
      labels: {
        browser: 'browser',
        dbClient: 'db client',
        httpProxy: 'HTTP proxy',
        socksProxy: 'SOCKS proxy',
        portMap: 'port map',
        reverseMap: 'reverse map',
      },
      note: '2 proxies · 2 mappings',
    },
  },
  capabilities: {
    frameForwarding: {
      title: 'Frame forwarding',
      desc: 'Devices exchange Ethernet frames directly, as if plugged into the same VLAN.',
    },
    sameSegment: {
      title: 'One link-layer segment',
      desc: 'Broadcast and link-layer discovery keep working — legacy protocols need no changes.',
    },
    iotIndustrial: {
      title: 'For IoT and industrial gear',
      desc: 'Devices that cannot run a client join the network a whole segment at a time.',
    },
    packetForwarding: {
      title: 'Packet forwarding',
      desc: 'Network-layer packets addressed by private IPs, forwarded across nodes.',
    },
    subnetRouting: {
      title: 'Subnet routing',
      desc: 'Subnets announce themselves on join and routes converge automatically — nothing to maintain by hand.',
    },
    httpProxy: {
      title: 'HTTP proxy',
      desc: 'Web services are exposed per service over the HTTP proxy, scoped down to a single app.',
    },
    socksProxy: {
      title: 'SOCKS proxy',
      desc: 'Any TCP application comes in over the SOCKS proxy, controlled per destination.',
    },
    portMapping: {
      title: 'Port mapping',
      desc: 'Map a port of an in-network service to a local port, and reach it the localhost way.',
    },
    reversePortMapping: {
      title: 'Reverse port mapping',
      desc: 'Expose a local service port at a chosen address inside the network, opened on demand.',
    },
  },
}
