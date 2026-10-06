// 两种形态区块词条(zh-CN):桌面 App(本地工作)与 headless(后台远程)的分工。
export const formFactors = {
  eyebrow: '两种形态',
  title: '装好一次,随处可用',
  items: {
    desktopApp: {
      title: '桌面 App',
      desc: '装在自己电脑上,处理本地日常工作;注册到 Mia 平台后,同样支持远程工作。',
      points: ['本地文件与工具触手可及', '注册到平台后,远程也能用'],
    },
    headless: {
      title: 'headless',
      desc: '部署在服务器后台,没有界面,专为远程工作而生。',
      points: ['常驻后台,随时响应', '适合分享给他人一起使用'],
    },
  },
}
