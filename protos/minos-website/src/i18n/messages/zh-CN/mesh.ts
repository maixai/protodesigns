// 跨层 Mesh 区块词条(zh-CN):层选择器 + 每层一张聚焦图 + 映射到该层的能力清单。
// layers 按契约 MeshLayerId 索引;capabilities 是全部九条能力的平面表,
// 各层引用其中的子集(数据在 src/data/home.ts)。
export const mesh = {
  eyebrow: '跨层 Mesh',
  tag: 'L2 · L3 · L7',
  title: '一张网,三层用法',
  lede: '从链路层到应用层:同一张私有网络,按设备与场景选择接入的那一层。',
  selectorLabel: '选择网络分层:L2 链路层、L3 网络层、L7 应用层',
  layers: {
    l2: {
      tab: 'L2 · 链路层',
      title: '链路层:像接在同一台交换机上',
      blurb: '转发数据帧,把设备在链路层连起来;面向不便安装客户端的 IoT 与工业设备。',
      diagramLabel: '链路层视图:四台设备各自经链路接入同一条链路层段,段上有数据帧穿过',
      legend: {
        link: '链路连接',
        segment: '链路层段边界',
      },
      labels: {
        segment: '同一链路层段',
      },
      note: '设备 4 · 同一链路段',
    },
    l3: {
      tab: 'L3 · 网络层',
      title: '网络层:子网之间经 Mesh 路由',
      blurb: '转发网络层数据包;不同子网之间按路由直达,不用手工维护路由表。',
      diagramLabel: '网络层视图:两个子网各含两个节点,跨子网的连线经 Mesh 路由直达',
      legend: {
        route: '路由可达链路',
        subnet: '子网边界',
      },
      labels: {
        routed: '经 Mesh 路由',
      },
      note: '子网 2 · 路由自动收敛',
    },
    l7: {
      tab: 'L7 · 应用层',
      title: '应用层:代理与端口映射',
      blurb: '在应用层按服务开放访问:代理、端口映射与反向映射,配出更精细的访问控制。',
      diagramLabel:
        '应用层服务视图:四行流量,分别是 HTTP 代理、SOCKS 代理、端口映射与反向端口映射,各从左侧入口指向右侧服务',
      legend: {
        flow: '应用流量',
      },
      labels: {
        browser: '浏览器',
        dbClient: '数据库客户端',
        httpProxy: 'HTTP 代理',
        socksProxy: 'SOCKS 代理',
        portMap: '端口映射',
        reverseMap: '反向端口映射',
      },
      note: '代理 2 · 映射 2',
    },
  },
  capabilities: {
    frameForwarding: {
      title: '数据帧转发',
      desc: '设备之间直接转发以太帧,像插在同一个 VLAN 里。',
    },
    sameSegment: {
      title: '同一链路层段',
      desc: '广播与链路层发现照常工作,依赖它们的老协议不用改。',
    },
    iotIndustrial: {
      title: '面向 IoT 与工业设备',
      desc: '装不了客户端的设备,也能以链路层整段加入网络。',
    },
    packetForwarding: {
      title: '数据包转发',
      desc: '以私有地址寻址,跨节点转发网络层数据包。',
    },
    subnetRouting: {
      title: '子网路由',
      desc: '各子网随入网自动宣告,路由自动收敛,无需手工维护。',
    },
    httpProxy: {
      title: 'HTTP 代理',
      desc: 'Web 服务经 HTTP 代理按服务放行,访问粒度到单个应用。',
    },
    socksProxy: {
      title: 'SOCKS 代理',
      desc: '任意 TCP 应用经 SOCKS 代理接入,按目标精细控制。',
    },
    portMapping: {
      title: '端口映射',
      desc: '把网络内服务的端口映射到本机端口,照 localhost 的习惯访问。',
    },
    reversePortMapping: {
      title: '反向端口映射',
      desc: '把本机服务的端口暴露到网络内指定地址,按需开放。',
    },
  },
}
