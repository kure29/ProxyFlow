const MINI_REVISION = '0e2bab71d8dbe512db9b5e7a9000a5661dd0e327'

export function miniIcon(name: string, darkName = name) {
  return {
    icon: `https://fastly.jsdelivr.net/gh/Orz-3/mini@${MINI_REVISION}/Color/${name}.png`,
    iconDark: `https://fastly.jsdelivr.net/gh/Orz-3/mini@${MINI_REVISION}/Alpha/${darkName}.png`,
  }
}
