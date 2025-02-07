const { id: chrome_id } = chrome.runtime

const cfg = Object.freeze({
  DEBUG_DEV_TOOLS_WIDTH: 640,

  DEFAULT_TITLE_BAR_HEIGHT: 30,

  INSTALLED_WINDOW_WIDTH: 640,
  INSTALLED_WINDOW_HEIGHT: 480,

  CONTROL_WINDOW_WIDTH: 380,

  CONTROL_WINDOW_HEIGHT_WITH_NORMAL: 220,
  CONTROL_WINDOW_HEIGHT_WITH_DEBUGGER: 220 + 42,

  CONTROL_QUERY_TEXT: 'text',
  CONTROL_QUERY_REVERT: 'revert',

  SEARCH_WINDOW_WIDTH_SMALL: 320,
  SEARCH_WINDOW_WIDTH_NORMAL: 380,
  NORMAL_WINDOW_WINDOW_COUNT: 5,

  REFOCUS_LAYOUT_WINDOW_WIDTH: 128,
  REFOCUS_LAYOUT_WINDOW_HEIGHT: 80,

  SEARCH_WINDOW_HEIGHT_LIST: [
    1500,
    1000,
    720,
    480,
  ],

  SEARCH_WINDOW_GAP_HORIZONTAL: 30,

  SEARCH_FOCUS_INTERVAL: 300,
  WINDOWS_DOUBLE_FOCUS_WAITING_DURATION: 100,

  ENVIRONMENT_STORAGE_KEY: 'poker-env',
  PREFERENCES_STORAGE_KEY: 'poker-options',

  KEYWORD_REPLACEHOLDER: '%poker%',

  MOBILE_PAGE_IDENTIFIER: chrome_id,

  get PLAIN_SEARCH_WINDOW_URL_PATTERN() {
    return chrome.runtime.getURL(`/plainWindow.html?q=${cfg.KEYWORD_REPLACEHOLDER}`)
  },

  get DEFAULT_SITE_ICON() {
    return chrome.runtime.getURL(`/default-siteicon.png`)
  },

  EXPORT_SITE_SETTINGS_FILE_NAME: 'poker-sites.json',
  DEFAULT_SITE_OPTION_NAME: '站点',

  get DEFAULT_SITES() {
    return [
      [
        `https://www.google.com/search?q=${cfg.KEYWORD_REPLACEHOLDER}`,
        `http://www.baidu.com/s?ie=utf-8&f=8&wd=${cfg.KEYWORD_REPLACEHOLDER}`,
        `https://www.bing.com/search?q=${cfg.KEYWORD_REPLACEHOLDER}`,
        `https://duckduckgo.com/?q=${cfg.KEYWORD_REPLACEHOLDER}`,
        `https://www.reddit.com/search/?q=${cfg.KEYWORD_REPLACEHOLDER}`,
        `https://mobile.twitter.com/search?q=${cfg.KEYWORD_REPLACEHOLDER}&src=typeahead_click`,
      ],
      [
        `https://www.youtube.com/results?search_query=${cfg.KEYWORD_REPLACEHOLDER}`,
        `https://search.bilibili.com/all?keyword=${cfg.KEYWORD_REPLACEHOLDER}`,
        `https://www.zhihu.com/search?type=content&q=${cfg.KEYWORD_REPLACEHOLDER}`,
        `https://www.douban.com/search?source=suggest&q=${cfg.KEYWORD_REPLACEHOLDER}`,
        `https://www.google.com/maps/search/${cfg.KEYWORD_REPLACEHOLDER}`,
        `https://www.deepl.com/ja/translator#en/zh/${cfg.KEYWORD_REPLACEHOLDER}`,
      ],
      [
        `https://github.com/search?q=${cfg.KEYWORD_REPLACEHOLDER}`,
        `https://stackoverflow.com/search?q=${cfg.KEYWORD_REPLACEHOLDER}`,
        `https://www.artstation.com/search?sort_by=relevance&query=${cfg.KEYWORD_REPLACEHOLDER}`,
      ]
    ]
  },
} as const)
export default cfg
