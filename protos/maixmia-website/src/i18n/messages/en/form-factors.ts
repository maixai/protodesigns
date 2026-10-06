// 两种形态区块词条(en):桌面 App(本地工作)与 headless(后台远程)的分工。
export const formFactors = {
  eyebrow: 'Two forms',
  title: 'Install once, use everywhere',
  items: {
    desktopApp: {
      title: 'Desktop app',
      desc: 'Runs on your own computer for local, day-to-day work; register it with the Mia platform and it works remotely too.',
      points: ['Local files and tools within reach', 'Remote-ready once registered'],
    },
    headless: {
      title: 'headless',
      desc: 'Deployed on a server, no interface — built for remote work.',
      points: ['Always on, always responsive', 'Made to be shared with others'],
    },
  },
}
