export const MOOD_LABELS = {
  happy: '开心', sad: '伤感', calm: '平静', energetic: '动感',
  romantic: '浪漫', nostalgic: '怀旧', focused: '专注', melancholy: '忧郁',
};

export function getMoodLabel(mood) {
  return MOOD_LABELS[mood] || mood || '未知';
}
