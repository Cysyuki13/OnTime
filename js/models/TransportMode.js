export const TransportMode = Object.freeze({
  WALK: 'walk',
  MTR: 'mtr',
  BUS: 'bus',
  MINIBUS: 'minibus',
  LRT: 'lrt', // 輕鐵 Light Rail
});

export const ModeMeta = Object.freeze({
  walk:    { label: '步行', icon: '🚶', color: '#6b7280' },
  mtr:     { label: '港鐵', icon: '🚇', color: '#dc2626' },
  bus:     { label: '巴士', icon: '🚌', color: '#ea580c' },
  minibus: { label: '小巴', icon: '🚐', color: '#16a34a' },
  lrt:     { label: '輕鐵', icon: '🚊', color: '#c45c26' },
});

export const isTransit = (mode) => mode !== TransportMode.WALK;
