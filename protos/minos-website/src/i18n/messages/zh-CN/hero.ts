// Hero 区块词条(zh-CN):全页唯一 h1;次按钮「查看文档」暂不接站点,点击弹轻提示。
// 主视觉是 5 屏标签页:每屏有标题、一句说明、图例与图内标注;
// 主机名 / 密钥记号 / 密文 / 地址等技术信息不随语言变化,直接写在面板组件里。
export const hero = {
  eyebrow: 'MINOS · PRIVATE NETWORK',
  title: '把每一台设备,放进同一张私有网络',
  subtitle:
    'Minos 让你的电脑、服务器与手机组成一张加密私有网络:无论它们在哪里,彼此都能像在同一间机房里一样直达。',
  primaryCta: '开始使用',
  secondaryCta: '查看文档',
  docsHint: '原型演示,文档站点暂未包含在本原型内',
  tabs: {
    label: '主视觉标签页:Minos 网络的五个事实',
    panels: {
      mesh: {
        tab: '网状互联',
        title: '点对点网状互联',
        blurb: '任意两台设备直接相连,没有中心节点;单条链路失效时自动绕行。',
        diagramLabel: '网状拓扑示意图:九台对等设备两两直连,一条失效链路经备用路径绕行',
        legend: {
          direct: '直连',
          backup: '备用路径',
          failed: '失效链路',
        },
        note: '节点 9 · 无中心',
      },
      access: {
        tab: '访问控制',
        title: '零信任访问控制',
        blurb: '先验证身份,再按策略放行;不在策略内的访问,默认拒绝。',
        diagramLabel: '访问控制示意图:请求方经策略判定后,按身份放行到已授权资源,未授权资源默认拒绝',
        legend: {
          allow: '按身份放行',
          deny: '默认拒绝',
        },
        labels: {
          requester: '请求方',
          policy: '策略判定',
          allowNote: '按身份放行',
          denyNote: '默认拒绝',
        },
        note: '资源 3 · 边界各自独立',
      },
      encryption: {
        tab: '加密链路',
        title: '端到端加密链路',
        blurb: '密钥只留在设备上,链路上只走密文;密钥定期轮换。',
        diagramLabel: '加密链路示意图:两台设备各自持有密钥,链路上只传输密文,密钥定期轮换',
        legend: {
          cipher: '端到端密文链路',
        },
        labels: {
          cipherNote: '链路上只走密文',
          rotateNote: '定期轮换',
        },
        note: '密钥定期轮换',
      },
      environments: {
        tab: '跨环境组网',
        title: '跨环境统一组网',
        blurb: '云、机房、家庭与移动设备加入同一张平面网络,跨环境直达。',
        diagramLabel: '统一组网示意图:云、机房、家庭网络与移动设备四个环境内的节点跨边界互连成同一张网络',
        legend: {
          link: '直连链路',
          boundary: '环境边界',
        },
        labels: {
          vpc: '云 VPC',
          dc: '自建机房',
          home: '家庭网络',
          mobile: '移动设备',
          sameNet: '同一张网络',
          noPublicIp: '无需公网 IP · 无需开端口',
        },
        note: '环境 4 · 网络 1',
      },
      dns: {
        tab: '私有 DNS',
        title: '自定义私有 DNS',
        blurb: '用名字访问设备:名字随设备入网自动注册,私有域名不外泄。',
        diagramLabel: '私有名称解析示意图:名称牌经解析指向地址牌,共三组名称与地址的配对',
        legend: {
          resolve: '名称解析',
        },
        labels: {
          nameColumn: '名称',
          addressColumn: '地址',
          resolve: '解析',
          auto: '名字随设备入网自动注册',
          private: '私有域名不外泄',
        },
        note: '名称 3 · 全部私有',
      },
    },
  },
}
