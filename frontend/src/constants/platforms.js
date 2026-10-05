export const PLATFORM_META = {
  netease: { name: '网易云音乐', color: '#ec4141', short: '云', iconBg: 'linear-gradient(135deg, #ec4141, #c62f2f)' },
  qqmusic: { name: 'QQ音乐', color: '#31c27c', short: 'Q', iconBg: 'linear-gradient(135deg, #31c27c, #1da863)' },
  kugou: { name: '酷狗音乐', color: '#2D8CF0', short: '狗', iconBg: 'linear-gradient(135deg, #2D8CF0, #1a6dd4)' },
  kuwo: { name: '酷我音乐', color: '#FFCD00', short: '我', iconBg: 'linear-gradient(135deg, #FFCD00, #e6b800)' },
};

export function getPlatformMeta(key) {
  return PLATFORM_META[key] || { name: key, color: '#666', short: key[0], iconBg: '#666' };
}
