// One place for every address the hub uses. Public URLs only: no keys or secrets live in this repo.
// The Supabase publishable key is fetched at run time from the Pinyin API, as the games do.
const override = globalThis.LIANN_HUB_CONFIG || {}

export const config = {
  hubOrigin: 'https://app.lwliann.com',
  gamesOrigin: 'https://playtest.lwliann.com',
  pinyinApi: 'https://pinyin-tiles-api-staging.onrender.com',
  backend: 'https://lwl-backend-mhgo.onrender.com',
  downloadsManifest: 'data/downloads.json',
  ...override,
}

// st: 'ok' opens a web app; 'native' is a store or desktop build listed in Downloads;
// 'desk' is a desktop browser extension; 'soon' is announced but not available.
export const APPS = [
  { id: 'tones', g: '声', name: 'LiANN Pinyin Mahjong Tones', kind: 'Game · Unity app', desc: 'Match word and meaning, then enter the tones.', st: 'native', slot: 'mahjong-tones/test-build' },
  { id: 'tiles', g: '拼', name: 'Pinyin Tiles', kind: 'Game · web', desc: 'Build connected words.', st: 'ok', path: '/playtest/game/' },
  { id: 'puzzle', g: '谜', name: 'Pinyin Puzzle', kind: 'Game · web', desc: 'Solve across and down.', st: 'ok', path: '/playtest/puzzle/' },
  { id: 'dash', g: '伴', name: 'AlongSide', kind: 'App · Android test build', desc: 'Classes, whiteboards, SetLists and progress.', st: 'native', slot: 'alongside/android-test' },
  { id: 'poly', g: '琴', name: 'PolyFlow', kind: 'App · offline web', desc: 'Play the song. The lyrics follow you.', st: 'native', slot: 'polyflow/offline' },
  { id: 'lyric', g: '歌', name: 'LyricSync', kind: 'YouTube app · Chrome / Edge on desktop', desc: 'Turn any song into a Multi-Lingual Master.', st: 'desk', yt: 1, slot: 'lyricsync/extension' },
  { id: 'dual', g: '字', name: 'Dual Subs', kind: 'YouTube app · Chrome / Edge on desktop', desc: 'Multiple SubTitled Languages at Once on YouTube.', st: 'desk', yt: 1, slot: 'dualsubs/extension' },
  { id: 'trans', g: '练', name: 'TransApp', kind: 'Practice app', desc: 'Practice App Coming Soon.', st: 'soon' },
]

export const appUrl = app => app.path ? new URL(app.path, config.gamesOrigin).href : null

export const NAV = [['home', 'Home'], ['apps', 'Apps'], ['library', 'Library'], ['read', 'Read'], ['kids', 'Kids'], ['downloads', 'Downloads'], ['plan', 'Settings']]
