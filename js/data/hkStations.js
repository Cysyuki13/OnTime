/**
 * 香港重鐵車站拓撲、九巴/專線小巴路線站序與香港熱門地標座標庫
 * 針對香港真實地理特性設計（例如將軍澳至清水灣／科大沿山坡而建，不能直接由坑口站步行上科大南閘）
 */
export const MTR_STATION_NAMES = Object.freeze({
  YAT: '油塘', LAM: '藍田', KWT: '觀塘', NTK: '牛頭角', KOB: '九龍灣',
  CHH: '彩虹', DIH: '鑽石山', WTS: '黃大仙', LOF: '樂富', KOT: '九龍塘',
  SKM: '石硤尾', PRE: '太子', MOK: '旺角', YMT: '油麻地', HOM: '何文田',
  WHA: '黃埔', TIK: '調景嶺', TKO: '將軍澳', HAH: '坑口', POA: '寶琳',
  LHP: '康城', TST: '尖沙咀', JOR: '佐敦', SSP: '深水埗', CSW: '長沙灣',
  LCK: '荔枝角', MEF: '美孚', KWH: '葵興', KWF: '葵芳', TSW: '荃灣',
  CEN: '中環', ADM: '金鐘', WAC: '灣仔', CAB: '銅鑼灣', TIH: '天后',
  FOH: '炮台山', NOP: '北角', QUB: '鰂魚涌', TAK: '太古', SWH: '西灣河',
  SHW: '上環', HKU: '香港大學', HOK: '香港', KOW: '九龍', OLY: '奧運',
  NAC: '南昌', TSY: '青衣', TUC: '東涌', HUH: '紅磡', TAW: '大圍',
  SHT: '沙田', FOT: '火炭', UNI: '大學', TAP: '大埔墟', FAN: '粉嶺',
  SHS: '上水', KAT: '啟德', AUS: '柯士甸', TuenMun: '屯門', YUL: '元朗',
  OCP: '海洋公園', WCH: '黃竹坑', SOH: '利東', SKW: '海怡半島',
});

export const HK_MTR_STATIONS = [
  // 觀塘綫 (KTL)
  { code: 'YAT', lineCode: 'KTL', name: '油塘站', en: 'Yau Tong', line: '觀塘綫 / 將軍澳綫', lat: 22.2977, lng: 114.2372, exits: ['A1', 'A2', 'B1', 'B2'] },
  { code: 'LAM', lineCode: 'KTL', name: '藍田站', en: 'Lam Tin', line: '觀塘綫', lat: 22.3067, lng: 114.2331, exits: ['A', 'B', 'C', 'D'] },
  { code: 'KWT', lineCode: 'KTL', name: '觀塘站', en: 'Kwun Tong', line: '觀塘綫', lat: 22.3122, lng: 114.2264, exits: ['A1', 'A2', 'B1', 'B2', 'C', 'D'] },
  { code: 'NTK', lineCode: 'KTL', name: '牛頭角站', en: 'Ngau Tau Kok', line: '觀塘綫', lat: 22.3155, lng: 114.2191, exits: ['A', 'B1', 'B2'] },
  { code: 'KOB', lineCode: 'KTL', name: '九龍灣站', en: 'Kowloon Bay', line: '觀塘綫', lat: 22.3235, lng: 114.2141, exits: ['A', 'B', 'C'] },
  { code: 'CHH', lineCode: 'KTL', name: '彩虹站', en: 'Choi Hung', line: '觀塘綫', lat: 22.3349, lng: 114.2089, exits: ['A1', 'A2', 'B', 'C1', 'C2'] },
  { code: 'DIH', lineCode: 'KTL', name: '鑽石山站', en: 'Diamond Hill', line: '觀塘綫 / 屯馬綫', lat: 22.3400, lng: 114.2016, exits: ['A1', 'A2', 'B', 'C1', 'C2'] },
  { code: 'WTS', lineCode: 'KTL', name: '黃大仙站', en: 'Wong Tai Sin', line: '觀塘綫', lat: 22.3417, lng: 114.1939, exits: ['A', 'B1', 'B2', 'C1', 'C2', 'D', 'E'] },
  { code: 'LOF', lineCode: 'KTL', name: '樂富站', en: 'Lok Fu', line: '觀塘綫', lat: 22.3378, lng: 114.1869, exits: ['A', 'B'] },
  { code: 'KOT', lineCode: 'KTL', name: '九龍塘站', en: 'Kowloon Tong', line: '觀塘綫 / 東鐵綫', lat: 22.3369, lng: 114.1763, exits: ['A1', 'A2', 'B', 'C1', 'C2', 'D', 'E', 'F', 'G', 'H'] },
  { code: 'SKM', lineCode: 'KTL', name: '石硤尾站', en: 'Shek Kip Mei', line: '觀塘綫', lat: 22.3318, lng: 114.1688, exits: ['A', 'B1', 'B2', 'C'] },
  { code: 'PRE', lineCode: 'KTL', name: '太子站', en: 'Prince Edward', line: '觀塘綫 / 荃灣綫', lat: 22.3245, lng: 114.1683, exits: ['A', 'B1', 'B2', 'C1', 'C2', 'D', 'E'] },
  { code: 'MOK', lineCode: 'KTL', name: '旺角站', en: 'Mong Kok', line: '觀塘綫 / 荃灣綫', lat: 22.3193, lng: 114.1694, exits: ['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3', 'E1', 'E2'] },
  { code: 'YMT', lineCode: 'KTL', name: '油麻地站', en: 'Yau Ma Tei', line: '荃灣綫 / 觀塘綫', lat: 22.3132, lng: 114.1707, exits: ['A1', 'A2', 'B1', 'B2', 'C', 'D'] },
  { code: 'HOM', lineCode: 'KTL', name: '何文田站', en: 'Ho Man Tin', line: '觀塘綫 / 屯馬綫', lat: 22.3095, lng: 114.1825, exits: ['A1', 'A2', 'A3', 'B1', 'B2'] },
  { code: 'WHA', lineCode: 'KTL', name: '黃埔站', en: 'Whampoa', line: '觀塘綫', lat: 22.3057, lng: 114.1903, exits: ['A', 'B', 'C', 'D1', 'D2'] },

  // 將軍澳綫 (TKL)
  { code: 'TIK', lineCode: 'TKL', name: '調景嶺站', en: 'Tiu Keng Leng', line: '將軍澳綫 / 觀塘綫', lat: 22.3042, lng: 114.2525, exits: ['A1', 'A2', 'B'] },
  { code: 'TKO', lineCode: 'TKL', name: '將軍澳站', en: 'Tseung Kwan O', line: '將軍澳綫', lat: 22.3074, lng: 114.2600, exits: ['A1', 'A2', 'B1', 'B2', 'C'] },
  { code: 'HAH', lineCode: 'TKL', name: '坑口站', en: 'Hang Hau', line: '將軍澳綫', lat: 22.3155, lng: 114.2645, exits: ['A1', 'A2', 'B1', 'B2'] },
  { code: 'POA', lineCode: 'TKL', name: '寶琳站', en: 'Po Lam', line: '將軍澳綫', lat: 22.3225, lng: 114.2582, exits: ['A1', 'A2', 'B1', 'B2', 'C'] },
  { code: 'LHP', lineCode: 'TKL', name: '康城站', en: 'LOHAS Park', line: '將軍澳綫', lat: 22.2958, lng: 114.2689, exits: ['A', 'B', 'C'] },

  // 荃灣綫 (TWL)
  { code: 'TST', lineCode: 'TWL', name: '尖沙咀站', en: 'Tsim Sha Tsui', line: '荃灣綫', lat: 22.2974, lng: 114.1722, exits: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E', 'H', 'L1', 'L3', 'L4', 'L5', 'L6', 'N5', 'R'] },
  { code: 'JOR', lineCode: 'TWL', name: '佐敦站', en: 'Jordan', line: '荃灣綫', lat: 22.3049, lng: 114.1717, exits: ['A', 'B1', 'B2', 'C1', 'C2', 'D', 'E'] },
  { code: 'SSP', lineCode: 'TWL', name: '深水埗站', en: 'Sham Shui Po', line: '荃灣綫', lat: 22.3307, lng: 114.1622, exits: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'] },
  { code: 'CSW', lineCode: 'TWL', name: '長沙灣站', en: 'Cheung Sha Wan', line: '荃灣綫', lat: 22.3357, lng: 114.1566, exits: ['A1', 'A2', 'A3', 'B', 'C'] },
  { code: 'LCK', lineCode: 'TWL', name: '荔枝角站', en: 'Lai Chi Kok', line: '荃灣綫', lat: 22.3374, lng: 114.1481, exits: ['A', 'B1', 'B2', 'C', 'D1', 'D2'] },
  { code: 'MEF', lineCode: 'TWL', name: '美孚站', en: 'Mei Foo', line: '荃灣綫 / 屯馬綫', lat: 22.3383, lng: 114.1393, exits: ['A', 'B', 'C1', 'C2', 'D', 'F', 'G'] },
  { code: 'KWH', lineCode: 'TWL', name: '葵興站', en: 'Kwai Hing', line: '荃灣綫', lat: 22.3633, lng: 114.1312, exits: ['A', 'B', 'C', 'D', 'E'] },
  { code: 'KWF', lineCode: 'TWL', name: '葵芳站', en: 'Kwai Fong', line: '荃灣綫', lat: 22.3571, lng: 114.1282, exits: ['A', 'B', 'C', 'D', 'E'] },
  { code: 'TSW', lineCode: 'TWL', name: '荃灣站', en: 'Tsuen Wan', line: '荃灣綫', lat: 22.3736, lng: 114.1178, exits: ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'C', 'D', 'E'] },

  // 港島綫 (ISL)
  { code: 'CEN', lineCode: 'ISL', name: '中環站', en: 'Central', line: '港島綫 / 荃灣綫', lat: 22.2819, lng: 114.1582, exits: ['A', 'B', 'C', 'D1', 'D2', 'E', 'F', 'G', 'H', 'J1', 'J2', 'J3', 'K'] },
  { code: 'ADM', lineCode: 'ISL', name: '金鐘站', en: 'Admiralty', line: '港島綫 / 荃灣綫 / 東鐵綫 / 南港島綫', lat: 22.2790, lng: 114.1646, exits: ['A', 'B', 'C1', 'C2', 'D', 'E1', 'E2', 'F'] },
  { code: 'WAC', lineCode: 'ISL', name: '灣仔站', en: 'Wan Chai', line: '港島綫', lat: 22.2775, lng: 114.1731, exits: ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'C'] },
  { code: 'CAB', lineCode: 'ISL', name: '銅鑼灣站', en: 'Causeway Bay', line: '港島綫', lat: 22.2802, lng: 114.1851, exits: ['A', 'B', 'C', 'D1', 'D2', 'E', 'F1', 'F2'] },
  { code: 'TIH', lineCode: 'ISL', name: '天后站', en: 'Tin Hau', line: '港島綫', lat: 22.2827, lng: 114.1918, exits: ['A1', 'A2', 'B'] },
  { code: 'FOH', lineCode: 'ISL', name: '炮台山站', en: 'Fortress Hill', line: '港島綫', lat: 22.2882, lng: 114.1939, exits: ['A', 'B'] },
  { code: 'NOP', lineCode: 'ISL', name: '北角站', en: 'North Point', line: '港島綫 / 將軍澳綫', lat: 22.2908, lng: 114.2007, exits: ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'] },
  { code: 'QUB', lineCode: 'ISL', name: '鰂魚涌站', en: 'Quarry Bay', line: '港島綫 / 將軍澳綫', lat: 22.2879, lng: 114.2097, exits: ['A', 'B', 'C'] },
  { code: 'TAK', lineCode: 'ISL', name: '太古站', en: 'Tai Koo', line: '港島綫', lat: 22.2846, lng: 114.2175, exits: ['A', 'B', 'C', 'D1', 'D2', 'E'] },
  { code: 'SWH', lineCode: 'ISL', name: '西灣河站', en: 'Sai Wan Ho', line: '港島綫', lat: 22.2820, lng: 114.2226, exits: ['A', 'B'] },
  { code: 'SHW', lineCode: 'ISL', name: '上環站', en: 'Sheung Wan', line: '港島綫', lat: 22.2869, lng: 114.1516, exits: ['A1', 'A2', 'B', 'C', 'D', 'E1', 'E2'] },
  { code: 'HKU', lineCode: 'ISL', name: '香港大學站', en: 'HKU', line: '港島綫', lat: 22.2842, lng: 114.1351, exits: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },

  // 東涌綫 (TCL)
  { code: 'HOK', lineCode: 'TCL', name: '香港站', en: 'Hong Kong', line: '東涌綫 / 機場快綫', lat: 22.2849, lng: 114.1581, exits: ['A1', 'A2', 'B1', 'B2', 'C', 'D', 'E1', 'E2', 'F'] },
  { code: 'KOW', lineCode: 'TCL', name: '九龍站', en: 'Kowloon', line: '東涌綫 / 機場快綫', lat: 22.3046, lng: 114.1616, exits: ['A', 'B', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2'] },
  { code: 'OLY', lineCode: 'TCL', name: '奧運站', en: 'Olympic', line: '東涌綫', lat: 22.3156, lng: 114.1601, exits: ['A', 'B', 'C', 'D', 'E'] },
  { code: 'NAC', lineCode: 'TCL', name: '南昌站', en: 'Nam Cheong', line: '屯馬綫 / 東涌綫', lat: 22.3267, lng: 114.1534, exits: ['A', 'B', 'C', 'D1', 'D2'] },
  { code: 'TSY', lineCode: 'TCL', name: '青衣站', en: 'Tsing Yi', line: '東涌綫 / 機場快綫', lat: 22.3585, lng: 114.1070, exits: ['A1', 'A2', 'B', 'C', 'F', 'G'] },
  { code: 'TUC', lineCode: 'TCL', name: '東涌站', en: 'Tung Chung', line: '東涌綫', lat: 22.2891, lng: 113.9415, exits: ['A', 'B', 'C', 'D'] },

  // 東鐵綫 (EAL)
  { code: 'HUH', lineCode: 'EAL', name: '紅磡站', en: 'Hung Hom', line: '東鐵綫 / 屯馬綫', lat: 22.3029, lng: 114.1816, exits: ['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6'] },
  { code: 'TAW', lineCode: 'EAL', name: '大圍站', en: 'Tai Wai', line: '東鐵綫 / 屯馬綫', lat: 22.3730, lng: 114.1786, exits: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
  { code: 'SHT', lineCode: 'EAL', name: '沙田站', en: 'Sha Tin', line: '東鐵綫', lat: 22.3826, lng: 114.1874, exits: ['A1', 'A2', 'A3', 'A4', 'B'] },
  { code: 'FOT', lineCode: 'EAL', name: '火炭站', en: 'Fo Tan', line: '東鐵綫', lat: 22.3951, lng: 114.1984, exits: ['A', 'B', 'C', 'D'] },
  { code: 'UNI', lineCode: 'EAL', name: '大學站', en: 'University', line: '東鐵綫', lat: 22.4135, lng: 114.2102, exits: ['A', 'B', 'C', 'D'] },
  { code: 'TAP', lineCode: 'EAL', name: '大埔墟站', en: 'Tai Po Market', line: '東鐵綫', lat: 22.4446, lng: 114.1705, exits: ['A1', 'A2', 'A3', 'B'] },
  { code: 'FAN', lineCode: 'EAL', name: '粉嶺站', en: 'Fanling', line: '東鐵綫', lat: 22.4922, lng: 114.1381, exits: ['A1', 'A2', 'B', 'C'] },
  { code: 'SHS', lineCode: 'EAL', name: '上水站', en: 'Sheung Shui', line: '東鐵綫', lat: 22.5011, lng: 114.1282, exits: ['A1', 'A2', 'A3', 'B1', 'B2', 'C', 'D', 'E'] },

  // 屯馬綫 (TML)
  { code: 'KAT', lineCode: 'TML', name: '啟德站', en: 'Kai Tak', line: '屯馬綫', lat: 22.3304, lng: 114.1994, exits: ['A', 'B', 'C', 'D'] },
  { code: 'AUS', lineCode: 'TML', name: '柯士甸站', en: 'Austin', line: '屯馬綫', lat: 22.3048, lng: 114.1665, exits: ['A', 'B1', 'B2', 'B4', 'B5', 'C', 'D1', 'D2', 'E', 'F'] },
  { code: 'TuenMun', lineCode: 'TML', name: '屯門站', en: 'Tuen Mun', line: '屯馬綫', lat: 22.3952, lng: 113.9735, exits: ['A', 'B', 'C1', 'C2', 'D', 'E', 'F'] },
  { code: 'YUL', lineCode: 'TML', name: '元朗站', en: 'Yuen Long', line: '屯馬綫', lat: 22.4457, lng: 114.0355, exits: ['A', 'B', 'C', 'E', 'F', 'G', 'H', 'J', 'K'] },

  // 南港島綫 (SIL)
  { code: 'OCP', lineCode: 'SIL', name: '海洋公園站', en: 'Ocean Park', line: '南港島綫', lat: 22.2481, lng: 114.1737, exits: ['A', 'B'] },
  { code: 'WCH', lineCode: 'SIL', name: '黃竹坑站', en: 'Wong Chuk Hang', line: '南港島綫', lat: 22.2485, lng: 114.1675, exits: ['A', 'B'] },
  { code: 'SOH', lineCode: 'SIL', name: '利東站', en: 'Lei Tung', line: '南港島綫', lat: 22.2423, lng: 114.1556, exits: ['A1', 'A2', 'B'] },
  { code: 'SKW', lineCode: 'SIL', name: '海怡半島站', en: 'South Horizons', line: '南港島綫', lat: 22.2407, lng: 114.1453, exits: ['A', 'B', 'C', 'D'] },
];

export const HK_MTR_LINE_EDGES = [
  // 觀塘綫 (KTL)
  { lineCode: 'KTL', lineName: '觀塘綫', from: 'WHA', to: 'HOM', min: 2, terminusUp: '調景嶺', terminusDown: '黃埔' },
  { lineCode: 'KTL', lineName: '觀塘綫', from: 'HOM', to: 'YMT', min: 3, terminusUp: '調景嶺', terminusDown: '黃埔' },
  { lineCode: 'KTL', lineName: '觀塘綫', from: 'YMT', to: 'MOK', min: 2, terminusUp: '調景嶺', terminusDown: '黃埔' },
  { lineCode: 'KTL', lineName: '觀塘綫', from: 'MOK', to: 'PRE', min: 2, terminusUp: '調景嶺', terminusDown: '黃埔' },
  { lineCode: 'KTL', lineName: '觀塘綫', from: 'PRE', to: 'SKM', min: 2, terminusUp: '調景嶺', terminusDown: '黃埔' },
  { lineCode: 'KTL', lineName: '觀塘綫', from: 'SKM', to: 'KOT', min: 3, terminusUp: '調景嶺', terminusDown: '黃埔' },
  { lineCode: 'KTL', lineName: '觀塘綫', from: 'KOT', to: 'LOF', min: 2, terminusUp: '調景嶺', terminusDown: '黃埔' },
  { lineCode: 'KTL', lineName: '觀塘綫', from: 'LOF', to: 'WTS', min: 2, terminusUp: '調景嶺', terminusDown: '黃埔' },
  { lineCode: 'KTL', lineName: '觀塘綫', from: 'WTS', to: 'DIH', min: 2, terminusUp: '調景嶺', terminusDown: '黃埔' },
  { lineCode: 'KTL', lineName: '觀塘綫', from: 'DIH', to: 'CHH', min: 2, terminusUp: '調景嶺', terminusDown: '黃埔' },
  { lineCode: 'KTL', lineName: '觀塘綫', from: 'CHH', to: 'KOB', min: 3, terminusUp: '調景嶺', terminusDown: '黃埔' },
  { lineCode: 'KTL', lineName: '觀塘綫', from: 'KOB', to: 'NTK', min: 2, terminusUp: '調景嶺', terminusDown: '黃埔' },
  { lineCode: 'KTL', lineName: '觀塘綫', from: 'NTK', to: 'KWT', min: 2, terminusUp: '調景嶺', terminusDown: '黃埔' },
  { lineCode: 'KTL', lineName: '觀塘綫', from: 'KWT', to: 'LAM', min: 2, terminusUp: '調景嶺', terminusDown: '黃埔' },
  { lineCode: 'KTL', lineName: '觀塘綫', from: 'LAM', to: 'YAT', min: 3, terminusUp: '調景嶺', terminusDown: '黃埔' },
  { lineCode: 'KTL', lineName: '觀塘綫', from: 'YAT', to: 'TIK', min: 3, terminusUp: '調景嶺', terminusDown: '黃埔' },

  // 將軍澳綫 (TKL)
  { lineCode: 'TKL', lineName: '將軍澳綫', from: 'YAT', to: 'TIK', min: 3, terminusUp: '寶琳 / 康城', terminusDown: '北角' },
  { lineCode: 'TKL', lineName: '將軍澳綫', from: 'TIK', to: 'TKO', min: 3, terminusUp: '寶琳 / 康城', terminusDown: '北角' },
  { lineCode: 'TKL', lineName: '將軍澳綫', from: 'TKO', to: 'HAH', min: 2, terminusUp: '寶琳', terminusDown: '北角' },
  { lineCode: 'TKL', lineName: '將軍澳綫', from: 'HAH', to: 'POA', min: 3, terminusUp: '寶琳', terminusDown: '北角' },
  { lineCode: 'TKL', lineName: '將軍澳綫', from: 'TKO', to: 'LHP', min: 4, terminusUp: '康城', terminusDown: '北角' },
  { lineCode: 'TKL', lineName: '將軍澳綫', from: 'YAT', to: 'QUB', min: 4, terminusUp: '寶琳 / 康城', terminusDown: '北角' },
  { lineCode: 'TKL', lineName: '將軍澳綫', from: 'QUB', to: 'NOP', min: 2, terminusUp: '寶琳 / 康城', terminusDown: '北角' },

  // 荃灣綫 (TWL)
  { lineCode: 'TWL', lineName: '荃灣綫', from: 'CEN', to: 'ADM', min: 2, terminusUp: '荃灣', terminusDown: '中環' },
  { lineCode: 'TWL', lineName: '荃灣綫', from: 'ADM', to: 'TST', min: 3, terminusUp: '荃灣', terminusDown: '中環' },
  { lineCode: 'TWL', lineName: '荃灣綫', from: 'TST', to: 'JOR', min: 2, terminusUp: '荃灣', terminusDown: '中環' },
  { lineCode: 'TWL', lineName: '荃灣綫', from: 'JOR', to: 'YMT', min: 2, terminusUp: '荃灣', terminusDown: '中環' },
  { lineCode: 'TWL', lineName: '荃灣綫', from: 'YMT', to: 'MOK', min: 2, terminusUp: '荃灣', terminusDown: '中環' },
  { lineCode: 'TWL', lineName: '荃灣綫', from: 'MOK', to: 'PRE', min: 2, terminusUp: '荃灣', terminusDown: '中環' },
  { lineCode: 'TWL', lineName: '荃灣綫', from: 'PRE', to: 'SSP', min: 2, terminusUp: '荃灣', terminusDown: '中環' },
  { lineCode: 'TWL', lineName: '荃灣綫', from: 'SSP', to: 'CSW', min: 2, terminusUp: '荃灣', terminusDown: '中環' },
  { lineCode: 'TWL', lineName: '荃灣綫', from: 'CSW', to: 'LCK', min: 2, terminusUp: '荃灣', terminusDown: '中環' },
  { lineCode: 'TWL', lineName: '荃灣綫', from: 'LCK', to: 'MEF', min: 3, terminusUp: '荃灣', terminusDown: '中環' },
  { lineCode: 'TWL', lineName: '荃灣綫', from: 'MEF', to: 'KWH', min: 5, terminusUp: '荃灣', terminusDown: '中環' },
  { lineCode: 'TWL', lineName: '荃灣綫', from: 'KWH', to: 'KWF', min: 2, terminusUp: '荃灣', terminusDown: '中環' },
  { lineCode: 'TWL', lineName: '荃灣綫', from: 'KWF', to: 'TSW', min: 4, terminusUp: '荃灣', terminusDown: '中環' },

  // 港島綫 (ISL)
  { lineCode: 'ISL', lineName: '港島綫', from: 'SHW', to: 'CEN', min: 2, terminusUp: '柴灣', terminusDown: '堅尼地城' },
  { lineCode: 'ISL', lineName: '港島綫', from: 'CEN', to: 'ADM', min: 2, terminusUp: '柴灣', terminusDown: '堅尼地城' },
  { lineCode: 'ISL', lineName: '港島綫', from: 'ADM', to: 'WAC', min: 2, terminusUp: '柴灣', terminusDown: '堅尼地城' },
  { lineCode: 'ISL', lineName: '港島綫', from: 'WAC', to: 'CAB', min: 3, terminusUp: '柴灣', terminusDown: '堅尼地城' },
  { lineCode: 'ISL', lineName: '港島綫', from: 'CAB', to: 'TIH', min: 2, terminusUp: '柴灣', terminusDown: '堅尼地城' },
  { lineCode: 'ISL', lineName: '港島綫', from: 'TIH', to: 'FOH', min: 2, terminusUp: '柴灣', terminusDown: '堅尼地城' },
  { lineCode: 'ISL', lineName: '港島綫', from: 'FOH', to: 'NOP', min: 2, terminusUp: '柴灣', terminusDown: '堅尼地城' },
  { lineCode: 'ISL', lineName: '港島綫', from: 'NOP', to: 'QUB', min: 2, terminusUp: '柴灣', terminusDown: '堅尼地城' },
  { lineCode: 'ISL', lineName: '港島綫', from: 'QUB', to: 'TAK', min: 2, terminusUp: '柴灣', terminusDown: '堅尼地城' },
  { lineCode: 'ISL', lineName: '港島綫', from: 'TAK', to: 'SWH', min: 2, terminusUp: '柴灣', terminusDown: '堅尼地城' },
  { lineCode: 'ISL', lineName: '港島綫', from: 'CEN', to: 'HKU', min: 4, terminusUp: '柴灣', terminusDown: '堅尼地城' },

  // 東涌綫 (TCL)
  { lineCode: 'TCL', lineName: '東涌綫', from: 'HOK', to: 'KOW', min: 3, terminusUp: '東涌', terminusDown: '香港' },
  { lineCode: 'TCL', lineName: '東涌綫', from: 'KOW', to: 'OLY', min: 2, terminusUp: '東涌', terminusDown: '香港' },
  { lineCode: 'TCL', lineName: '東涌綫', from: 'OLY', to: 'NAC', min: 3, terminusUp: '東涌', terminusDown: '香港' },
  { lineCode: 'TCL', lineName: '東涌綫', from: 'NAC', to: 'TSY', min: 7, terminusUp: '東涌', terminusDown: '香港' },
  { lineCode: 'TCL', lineName: '東涌綫', from: 'TSY', to: 'TUC', min: 15, terminusUp: '東涌', terminusDown: '香港' },

  // 東鐵綫 (EAL)
  { lineCode: 'EAL', lineName: '東鐵綫', from: 'HUH', to: 'KOT', min: 7, terminusUp: '羅湖 / 落馬洲', terminusDown: '金鐘' },
  { lineCode: 'EAL', lineName: '東鐵綫', from: 'KOT', to: 'TAW', min: 6, terminusUp: '羅湖 / 落馬洲', terminusDown: '金鐘' },
  { lineCode: 'EAL', lineName: '東鐵綫', from: 'TAW', to: 'SHT', min: 3, terminusUp: '羅湖 / 落馬洲', terminusDown: '金鐘' },
  { lineCode: 'EAL', lineName: '東鐵綫', from: 'SHT', to: 'FOT', min: 3, terminusUp: '羅湖 / 落馬洲', terminusDown: '金鐘' },
  { lineCode: 'EAL', lineName: '東鐵綫', from: 'FOT', to: 'UNI', min: 4, terminusUp: '羅湖 / 落馬洲', terminusDown: '金鐘' },
  { lineCode: 'EAL', lineName: '東鐵綫', from: 'UNI', to: 'TAP', min: 6, terminusUp: '羅湖 / 落馬洲', terminusDown: '金鐘' },
  { lineCode: 'EAL', lineName: '東鐵綫', from: 'TAP', to: 'FAN', min: 7, terminusUp: '羅湖 / 落馬洲', terminusDown: '金鐘' },
  { lineCode: 'EAL', lineName: '東鐵綫', from: 'FAN', to: 'SHS', min: 4, terminusUp: '羅湖 / 落馬洲', terminusDown: '金鐘' },

  // 屯馬綫 (TML)
  { lineCode: 'TML', lineName: '屯馬綫', from: 'HUH', to: 'HOM', min: 2, terminusUp: '屯門 / 烏溪沙', terminusDown: '紅磡 / 屯門' },
  { lineCode: 'TML', lineName: '屯馬綫', from: 'HOM', to: 'KAT', min: 6, terminusUp: '屯門 / 烏溪沙', terminusDown: '紅磡 / 屯門' },
  { lineCode: 'TML', lineName: '屯馬綫', from: 'KAT', to: 'DIH', min: 3, terminusUp: '屯門 / 烏溪沙', terminusDown: '紅磡 / 屯門' },
  { lineCode: 'TML', lineName: '屯馬綫', from: 'DIH', to: 'TAW', min: 7, terminusUp: '屯門 / 烏溪沙', terminusDown: '紅磡 / 屯門' },
  { lineCode: 'TML', lineName: '屯馬綫', from: 'HUH', to: 'AUS', min: 3, terminusUp: '屯門', terminusDown: '紅磡' },
  { lineCode: 'TML', lineName: '屯馬綫', from: 'AUS', to: 'NAC', min: 4, terminusUp: '屯門', terminusDown: '紅磡' },
  { lineCode: 'TML', lineName: '屯馬綫', from: 'NAC', to: 'MEF', min: 4, terminusUp: '屯門', terminusDown: '紅磡' },
  { lineCode: 'TML', lineName: '屯馬綫', from: 'MEF', to: 'YUL', min: 18, terminusUp: '屯門', terminusDown: '紅磡' },
  { lineCode: 'TML', lineName: '屯馬綫', from: 'YUL', to: 'TuenMun', min: 12, terminusUp: '屯門', terminusDown: '紅磡' },

  // 南港島綫 (SIL)
  { lineCode: 'SIL', lineName: '南港島綫', from: 'ADM', to: 'OCP', min: 4, terminusUp: '海怡半島', terminusDown: '金鐘' },
  { lineCode: 'SIL', lineName: '南港島綫', from: 'OCP', to: 'WCH', min: 3, terminusUp: '海怡半島', terminusDown: '金鐘' },
  { lineCode: 'SIL', lineName: '南港島綫', from: 'WCH', to: 'SOH', min: 3, terminusUp: '海怡半島', terminusDown: '金鐘' },
  { lineCode: 'SIL', lineName: '南港島綫', from: 'SOH', to: 'SKW', min: 2, terminusUp: '海怡半島', terminusDown: '金鐘' },
];

/**
 * 常用九巴及專線小巴路線站點序列（包含科大接駁路線：91M、91、新界專線小巴 11 / 11M / 12）
 */
export const HK_KMB_ROUTES_DATA = [
  {
    route: '214',
    mode: 'bus',
    serviceType: '1',
    origTc: '油塘',
    destTc: '長沙灣（甘泉街）',
    stops: [
      { id: 'YAT_214', name: '油塘站', lat: 22.2977, lng: 114.2372 },
      { id: 'LAM_214', name: '藍田站', lat: 22.3067, lng: 114.2331 },
      { id: 'SAU_214', name: '秀茂坪邨', lat: 22.3198, lng: 114.2323 },
      { id: 'POTAT_214', name: '寶達邨', lat: 22.3238, lng: 114.2368 },
      { id: 'CHH_214', name: '彩虹邨紅萼樓', lat: 22.3338, lng: 114.2075 },
      { id: 'DIH_214', name: '鑽石山站', lat: 22.3404, lng: 114.2022 },
      { id: 'KOT_214', name: '九龍塘站', lat: 22.3369, lng: 114.1763 },
    ],
  },
  {
    route: '14B',
    mode: 'bus',
    serviceType: '1',
    origTc: '牛頭角',
    destTc: '藍田（廣田邨）',
    stops: [
      { id: 'NTK_14B', name: '牛頭角站', lat: 22.3155, lng: 114.2191 },
      { id: 'KWT_14B', name: '觀塘市中心', lat: 22.3122, lng: 114.2264 },
      { id: 'LAM_14B', name: '藍田站', lat: 22.3067, lng: 114.2331 },
      { id: 'KWONG_TIN_14B', name: '廣田邨', lat: 22.3045, lng: 114.2425 },
      { id: 'YAT_14B', name: '油塘站', lat: 22.2977, lng: 114.2372 },
    ],
  },
  {
    route: '14',
    mode: 'bus',
    serviceType: '1',
    origTc: '鯉魚門邨',
    destTc: '中天街',
    stops: [
      { id: 'YAT_14', name: '油塘站', lat: 22.2977, lng: 114.2372 },
      { id: 'LAM_14', name: '藍田站', lat: 22.3067, lng: 114.2331 },
      { id: 'KWT_14', name: '觀塘市中心', lat: 22.3122, lng: 114.2264 },
      { id: 'NTK_14', name: '牛頭角站', lat: 22.3155, lng: 114.2191 },
      { id: 'KOB_14', name: '九龍灣站', lat: 22.3235, lng: 114.2141 },
    ],
  },
  {
    route: '601',
    mode: 'bus',
    serviceType: '1',
    origTc: '寶達邨',
    destTc: '金鐘（東）',
    stops: [
      { id: 'POTAT_601', name: '寶達邨', lat: 22.3238, lng: 114.2368 },
      { id: 'SAU_601', name: '秀茂坪商場', lat: 22.3193, lng: 114.2315 },
      { id: 'LAM_601', name: '藍田站', lat: 22.3067, lng: 114.2331 },
      { id: 'YAT_601', name: '油塘站', lat: 22.2977, lng: 114.2372 },
      { id: 'NOP_601', name: '北角站', lat: 22.2908, lng: 114.2007 },
      { id: 'WAC_601', name: '灣仔站', lat: 22.2775, lng: 114.1731 },
      { id: 'ADM_601', name: '金鐘站', lat: 22.2790, lng: 114.1646 },
    ],
  },
  {
    route: '290 / 290A',
    mode: 'bus',
    serviceType: '1',
    origTc: '將軍澳（彩明）',
    destTc: '荃灣西站',
    stops: [
      { id: 'POTAT_290', name: '寶達邨', lat: 22.3238, lng: 114.2368 },
      { id: 'SAU_290', name: '秀茂坪邨', lat: 22.3198, lng: 114.2323 },
      { id: 'LAM_290', name: '藍田站', lat: 22.3067, lng: 114.2331 },
      { id: 'KOT_290', name: '九龍塘站', lat: 22.3369, lng: 114.1763 },
      { id: 'MEF_290', name: '美孚站', lat: 22.3383, lng: 114.1393 },
      { id: 'TSW_290', name: '荃灣站', lat: 22.3736, lng: 114.1178 },
    ],
  },
  {
    route: '62X',
    mode: 'bus',
    serviceType: '1',
    origTc: '兆康站',
    destTc: '鯉魚門邨',
    stops: [
      { id: 'KOB_62X', name: '九龍灣站', lat: 22.3235, lng: 114.2141 },
      { id: 'KWT_62X', name: '觀塘站', lat: 22.3122, lng: 114.2264 },
      { id: 'LAM_62X', name: '藍田站', lat: 22.3067, lng: 114.2331 },
      { id: 'YAT_62X', name: '油塘站', lat: 22.2977, lng: 114.2372 },
    ],
  },
  {
    route: '91M',
    mode: 'bus',
    serviceType: '1',
    origTc: '寶琳',
    destTc: '鑽石山站',
    stops: [
      { id: 'POA_91M', name: '寶琳站公共運輸交匯處', lat: 22.3228, lng: 114.2585 },
      { id: 'HAH_91M', name: '坑口站（B2 出口旁巴士站）', lat: 22.3161, lng: 114.2647 },
      { id: 'SH_91M', name: '尚德邨', lat: 22.3106, lng: 114.2598 },
      { id: 'TKO_91M', name: '將軍澳站', lat: 22.3078, lng: 114.2592 },
      { id: 'TIK_91M', name: '調景嶺站', lat: 22.3046, lng: 114.2528 },
      { id: 'UST_N_91M', name: '香港科技大學（北）', lat: 22.3388, lng: 114.2655 },
      { id: 'UST_S_91M', name: '香港科技大學（南）', lat: 22.3358, lng: 114.2635 },
      { id: 'CHOI_HUNG_91M', name: '彩虹邨紅萼樓', lat: 22.3338, lng: 114.2075 },
      { id: 'DIH_91M', name: '鑽石山站', lat: 22.3404, lng: 114.2022 },
    ],
  },
  {
    route: '專線小巴 11 / 11M',
    mode: 'minibus',
    serviceType: '1',
    origTc: '坑口站',
    destTc: '香港科技大學',
    stops: [
      { id: 'HAH_GMB11', name: '坑口站小巴總站', lat: 22.3160, lng: 114.2646 },
      { id: 'UST_N_GMB11', name: '香港科技大學（北）', lat: 22.3388, lng: 114.2655 },
      { id: 'UST_S_GMB11', name: '香港科技大學（南）', lat: 22.3358, lng: 114.2635 },
    ],
  },
  {
    route: '專線小巴 12',
    mode: 'minibus',
    serviceType: '1',
    origTc: '寶琳',
    destTc: '西貢',
    stops: [
      { id: 'POA_GMB12', name: '寶琳站小巴站', lat: 22.3226, lng: 114.2584 },
      { id: 'HAH_GMB12', name: '坑口（銀澳路）', lat: 22.3158, lng: 114.2642 },
      { id: 'UST_S_GMB12', name: '香港科技大學（南）', lat: 22.3358, lng: 114.2635 },
      { id: 'UST_N_GMB12', name: '香港科技大學（北）', lat: 22.3388, lng: 114.2655 },
    ],
  },
  {
    route: '91',
    mode: 'bus',
    serviceType: '1',
    origTc: '清水灣',
    destTc: '鑽石山站',
    stops: [
      { id: 'CW_91', name: '清水灣', lat: 22.2798, lng: 114.2903 },
      { id: 'UST_S_91', name: '香港科技大學（南）', lat: 22.3358, lng: 114.2635 },
      { id: 'UST_N_91', name: '香港科技大學（北）', lat: 22.3388, lng: 114.2655 },
      { id: 'CHH_91', name: '彩虹站', lat: 22.3349, lng: 114.2089 },
      { id: 'DIH_91', name: '鑽石山站', lat: 22.3404, lng: 114.2022 },
    ],
  },
];

/**
 * 香港常用地標／院校／商場座標庫（零延遲本地搜尋）
 */
export const HK_LANDMARKS = [
  { name: '香港科技大學（南）', lat: 22.3358, lng: 114.2635, address: '清水灣道 · 科大南閘 / 逸夫演藝中心一帶', source: 'landmark' },
  { name: '香港科技大學', lat: 22.3364, lng: 114.2655, address: '新界清水灣道', source: 'landmark' },
  { name: '油塘', lat: 22.2977, lng: 114.2372, address: '九龍東油塘', source: 'landmark' },
  { name: '坑口', lat: 22.3155, lng: 114.2645, address: '將軍澳坑口', source: 'landmark' },
  { name: '鑽石山', lat: 22.3400, lng: 114.2016, address: '黃大仙區鑽石山', source: 'landmark' },
  { name: '中環 IFC 國際金融中心', lat: 22.2850, lng: 114.1588, address: '中環金融街8號', source: 'landmark' },
  { name: '香港理工大學', lat: 22.3045, lng: 114.1796, address: '紅磡育才道', source: 'landmark' },
  { name: '香港中文大學', lat: 22.4196, lng: 114.2068, address: '沙田馬料水', source: 'landmark' },
  { name: '香港城市大學', lat: 22.3376, lng: 114.1726, address: '九龍塘達之路', source: 'landmark' },
  { name: '香港浸會大學', lat: 22.3412, lng: 114.1798, address: '九龍塘窩打老道', source: 'landmark' },
  { name: '海港城', lat: 22.2951, lng: 114.1688, address: '尖沙咀廣東道', source: 'landmark' },
  { name: '觀塘 apm', lat: 22.3122, lng: 114.2252, address: '觀塘觀塘道418號', source: 'landmark' },
];
