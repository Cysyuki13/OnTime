/**
 * 全港十八區地點與地標資料庫（零延遲本地搜尋）
 * 涵蓋：觀塘區（寶達邨、藍田、油塘、秀茂坪、安達臣道、觀塘、九龍灣等）、
 * 將軍澳／西貢（坑口、寶琳、將軍澳、調景嶺、康城、香港科技大學、西貢等）、
 * 九龍各區、港島各區、新界及離島主要屋邨、商場、院校、醫院與交通樞紐。
 */
export const HK_PLACES_DB = [
  // ================= 觀塘區（含寶達、藍田、秀茂坪、安達臣道、觀塘、九龍灣、油塘） =================
  { name: '寶達邨', en: 'Po Tat Estate', district: '觀塘區', category: '屋邨', lat: 22.3238, lng: 114.2368, address: '九龍觀塘寶琳路170號' },
  { name: '寶達商場', en: 'Po Tat Shopping Centre', district: '觀塘區', category: '商場', lat: 22.3235, lng: 114.2362, address: '九龍觀塘寶琳路170號' },
  { name: '藍田', en: 'Lam Tin', district: '觀塘區', category: '地區／樞紐', lat: 22.3067, lng: 114.2331, address: '九龍東藍田' },
  { name: '藍田站', en: 'Lam Tin Station', district: '觀塘區', category: '港鐵站', lat: 22.3067, lng: 114.2331, address: '觀塘綫 · 藍田公共運輸交匯處' },
  { name: '啟田邨', en: 'Kai Tin Estate', district: '觀塘區', category: '屋邨', lat: 22.3082, lng: 114.2345, address: '九龍藍田啟田道' },
  { name: '啟田商場', en: 'Kai Tin Shopping Centre', district: '觀塘區', category: '商場', lat: 22.3080, lng: 114.2351, address: '九龍藍田啟田道50號' },
  { name: '德田邨', en: 'Tak Tin Estate', district: '觀塘區', category: '屋邨', lat: 22.3054, lng: 114.2386, address: '九龍藍田碧雲道' },
  { name: '平田邨', en: 'Ping Tin Estate', district: '觀塘區', category: '屋邨', lat: 22.3075, lng: 114.2405, address: '九龍藍田安田街' },
  { name: '安田邨', en: 'On Tin Estate', district: '觀塘區', category: '屋邨', lat: 22.3095, lng: 114.2412, address: '九龍藍田平田街' },
  { name: '興田邨', en: 'Hing Tin Estate', district: '觀塘區', category: '屋邨', lat: 22.3032, lng: 114.2377, address: '九龍藍田連德道' },
  { name: '康逸苑', en: 'Hong Yat Court', district: '觀塘區', category: '居屋', lat: 22.3061, lng: 114.2314, address: '九龍藍田康華苑旁' },
  { name: '麗港城', en: 'Laguna City', district: '觀塘區', category: '私人屋苑', lat: 22.3069, lng: 114.2259, address: '九龍茶果嶺道' },
  { name: '匯景花園', en: 'Sceneway Garden', district: '觀塘區', category: '私人屋苑', lat: 22.3062, lng: 114.2318, address: '九龍藍田康利道1號' },
  { name: '秀茂坪邨', en: 'Sau Mau Ping Estate', district: '觀塘區', category: '屋邨', lat: 22.3198, lng: 114.2323, address: '九龍秀茂坪秀明道' },
  { name: '秀茂坪商場', en: 'Sau Mau Ping Shopping Centre', district: '觀塘區', category: '商場', lat: 22.3193, lng: 114.2315, address: '九龍秀茂坪秀明道101號' },
  { name: '寶達／秀茂坪（安達臣道）', en: 'Anderson Road / Po Tat', district: '觀塘區', category: '地區', lat: 22.3256, lng: 114.2355, address: '九龍觀塘安達臣道一帶' },
  { name: '安達邨', en: 'On Tat Estate', district: '觀塘區', category: '屋邨', lat: 22.3278, lng: 114.2345, address: '九龍觀塘安秀道20號' },
  { name: '安泰邨', en: 'On Tai Estate', district: '觀塘區', category: '屋邨', lat: 22.3302, lng: 114.2358, address: '九龍觀塘安秀道' },
  { name: '順天邨', en: 'Shun Tin Estate', district: '觀塘區', category: '屋邨', lat: 22.3324, lng: 114.2278, address: '九龍觀塘順安道' },
  { name: '順利邨', en: 'Shun Lee Estate', district: '觀塘區', category: '屋邨', lat: 22.3338, lng: 114.2248, address: '九龍觀塘利安道' },
  { name: '順安邨', en: 'Shun On Estate', district: '觀塘區', category: '屋邨', lat: 22.3315, lng: 114.2262, address: '九龍觀塘順安道' },
  { name: '觀塘市中心', en: 'Kwun Tong Town Centre', district: '觀塘區', category: '地區', lat: 22.3125, lng: 114.2258, address: '九龍觀塘裕民坊／協和街' },
  { name: '觀塘 apm', en: 'apm Kwun Tong', district: '觀塘區', category: '商場', lat: 22.3122, lng: 114.2252, address: '九龍觀塘觀塘道418號' },
  { name: '裕民坊', en: 'Yue Man Square', district: '觀塘區', category: '商場／樞紐', lat: 22.3138, lng: 114.2236, address: '九龍觀塘裕民坊' },
  { name: '九龍灣 MegaBox', en: 'MegaBox', district: '觀塘區', category: '商場', lat: 22.3204, lng: 114.2085, address: '九龍灣宏照道38號' },
  { name: '德福廣場', en: 'Telford Plaza', district: '觀塘區', category: '商場', lat: 22.3231, lng: 114.2136, address: '九龍灣偉業街33號' },
  { name: '油塘', en: 'Yau Tong', district: '觀塘區', category: '地區／樞紐', lat: 22.2977, lng: 114.2372, address: '九龍東油塘' },
  { name: '大本型', en: 'Domain', district: '觀塘區', category: '商場', lat: 22.2994, lng: 114.2385, address: '九龍油塘高超道38號' },
  { name: '鯉魚門邨', en: 'Lei Yue Mun Estate', district: '觀塘區', category: '屋邨', lat: 22.2952, lng: 114.2412, address: '九龍油塘鯉魚門道' },
  { name: '聯合醫院', en: 'United Christian Hospital', district: '觀塘區', category: '醫院', lat: 22.3225, lng: 114.2279, address: '九龍觀塘協和街130號' },

  // ================= 西貢區 & 將軍澳（含香港科技大學、坑口、寶琳、將軍澳、調景嶺、康城、西貢） =================
  { name: '香港科技大學（南）', en: 'HKUST South Gate', district: '西貢區', category: '院校', lat: 22.3358, lng: 114.2635, address: '清水灣道 · 科大南閘 / 逸夫演藝中心一帶' },
  { name: '香港科技大學', en: 'HKUST', district: '西貢區', category: '院校', lat: 22.3364, lng: 114.2655, address: '新界清水灣道' },
  { name: '香港科技大學（北）', en: 'HKUST North Gate', district: '西貢區', category: '院校', lat: 22.3388, lng: 114.2655, address: '新界清水灣道北閘' },
  { name: '坑口', en: 'Hang Hau', district: '西貢區', category: '地區', lat: 22.3155, lng: 114.2645, address: '將軍澳坑口' },
  { name: '東港城', en: 'East Point City', district: '西貢區', category: '商場', lat: 22.3156, lng: 114.2651, address: '將軍澳坑口重華路8號' },
  { name: '寶琳', en: 'Po Lam', district: '西貢區', category: '地區', lat: 22.3225, lng: 114.2582, address: '將軍澳寶琳' },
  { name: '新都城中心 MCP', en: 'Metro City Plaza', district: '西貢區', category: '商場', lat: 22.3228, lng: 114.2586, address: '將軍澳寶琳欣景路8號' },
  { name: '將軍澳中心', en: 'Park Central', district: '西貢區', category: '商場／屋苑', lat: 22.3081, lng: 114.2597, address: '將軍澳唐德街9號' },
  { name: 'PopCorn', en: 'PopCorn Tseung Kwan O', district: '西貢區', category: '商場', lat: 22.3075, lng: 114.2590, address: '將軍澳唐賢街9號' },
  { name: '日出康城 / LOHAS Park', en: 'LOHAS Park', district: '西貢區', category: '屋苑／商場', lat: 22.2958, lng: 114.2689, address: '將軍澳康城路1號' },
  { name: '西貢市中心', en: 'Sai Kung Town', district: '西貢區', category: '地區', lat: 22.3816, lng: 114.2707, address: '新界西貢萬年街／海傍' },
  { name: '清水灣海灘', en: 'Clear Water Bay Beach', district: '西貢區', category: '景點／海灘', lat: 22.2816, lng: 114.2912, address: '新界清水灣大坳門路' },

  // ================= 黃大仙區 & 九龍城區 =================
  { name: '鑽石山', en: 'Diamond Hill', district: '黃大仙區', category: '地區', lat: 22.3400, lng: 114.2016, address: '九龍鑽石山' },
  { name: '荷里活廣場', en: 'Plaza Hollywood', district: '黃大仙區', category: '商場', lat: 22.3408, lng: 114.2018, address: '九龍鑽石山龍蟠街3號' },
  { name: '黃大仙中心', en: 'Temple Mall', district: '黃大仙區', category: '商場', lat: 22.3422, lng: 114.1934, address: '九龍黃大仙龍翔道136號' },
  { name: '彩虹邨', en: 'Choi Hung Estate', district: '黃大仙區', category: '屋邨', lat: 22.3349, lng: 114.2089, address: '九龍彩虹清水灣道' },
  { name: '九龍塘', en: 'Kowloon Tong', district: '九龍城區', category: '地區', lat: 22.3369, lng: 114.1763, address: '九龍塘達之路／窩打老道' },
  { name: '又一城', en: 'Festival Walk', district: '九龍城區', category: '商場', lat: 22.3372, lng: 114.1745, address: '九龍塘達之路80號' },
  { name: '香港城市大學', en: 'City University of Hong Kong', district: '九龍城區', category: '院校', lat: 22.3376, lng: 114.1726, address: '九龍塘達之路83號' },
  { name: '香港浸會大學', en: 'Hong Kong Baptist University', district: '九龍城區', category: '院校', lat: 22.3412, lng: 114.1798, address: '九龍塘窩打老道224號' },
  { name: '香港理工大學', en: 'The Hong Kong Polytechnic University', district: '油尖旺區', category: '院校', lat: 22.3045, lng: 114.1796, address: '九龍紅磡育才道11號' },
  { name: '啟德 AIRSIDE', en: 'AIRSIDE Kai Tak', district: '九龍城區', category: '商場', lat: 22.3318, lng: 114.1986, address: '九龍啟德協調道2號' },

  // ================= 油尖旺區 & 深水埗區 =================
  { name: '海港城', en: 'Harbour City', district: '油尖旺區', category: '商場', lat: 22.2951, lng: 114.1688, address: '九龍尖沙咀廣東道3-27號' },
  { name: 'K11 MUSEA', en: 'K11 MUSEA', district: '油尖旺區', category: '商場', lat: 22.2935, lng: 114.1737, address: '九龍尖沙咀梳士巴利道18號' },
  { name: '西九龍高鐵站', en: 'Hong Kong West Kowloon Station', district: '油尖旺區', category: '交通樞紐', lat: 22.3037, lng: 114.1656, address: '九龍柯士甸道西3號' },
  { name: '旺角朗豪坊', en: 'Langham Place', district: '油尖旺區', category: '商場', lat: 22.3185, lng: 114.1678, address: '九龍旺角亞皆老街8號' },
  { name: '深水埗黃金電腦商場', en: 'Golden Computer Arcade', district: '深水埗區', category: '商場', lat: 22.3320, lng: 114.1621, address: '九龍深水埗福華街146-152號' },

  // ================= 港島各區（中西區、灣仔、東區、南區） =================
  { name: '中環 IFC 國際金融中心', en: 'ifc mall', district: '中西區', category: '商場／地標', lat: 22.2850, lng: 114.1588, address: '香港中環金融街8號' },
  { name: '香港大學', en: 'The University of Hong Kong', district: '中西區', category: '院校', lat: 22.2840, lng: 114.1378, address: '香港薄扶林道' },
  { name: '太平山頂凌霄閣', en: 'The Peak Tower', district: '中西區', category: '景點', lat: 22.2712, lng: 114.1492, address: '香港山頂道128號' },
  { name: '銅鑼灣時代廣場', en: 'Times Square', district: '灣仔區', category: '商場', lat: 22.2782, lng: 114.1822, address: '香港銅鑼灣勿地臣街1號' },
  { name: '香港會議展覽中心', en: 'HKCEC', district: '灣仔區', category: '會展／地標', lat: 22.2840, lng: 114.1733, address: '香港灣仔博覽道1號' },
  { name: '太古城中心', en: 'Cityplaza', district: '東區', category: '商場', lat: 22.2862, lng: 114.2173, address: '香港太古太古城道18號' },
  { name: '赤柱廣場', en: 'Stanley Plaza', district: '南區', category: '商場／景點', lat: 22.2188, lng: 114.2121, address: '香港赤柱佳美道23號' },

  // ================= 新界各區（沙田、大埔、北區、屯門、元朗、荃灣、葵青、離島） =================
  { name: '香港中文大學', en: 'The Chinese University of Hong Kong', district: '沙田區', category: '院校', lat: 22.4196, lng: 114.2068, address: '新界沙田馬料水' },
  { name: '新城市廣場', en: 'New Town Plaza', district: '沙田區', category: '商場', lat: 22.3814, lng: 114.1889, address: '新界沙田沙田正街18號' },
  { name: '威爾斯親王醫院', en: 'Prince of Wales Hospital', district: '沙田區', category: '醫院', lat: 22.3794, lng: 114.2014, address: '新界沙田銀城街30-32號' },
  { name: '大埔超級城', en: 'Tai Po Mega Mall', district: '大埔區', category: '商場', lat: 22.4514, lng: 114.1688, address: '新界大埔安邦路8號' },
  { name: '上水廣場', en: 'Landmark North', district: '北區', category: '商場', lat: 22.5023, lng: 114.1292, address: '新界上水龍琛路39號' },
  { name: '屯門市廣場', en: 'tmtplaza', district: '屯門區', category: '商場', lat: 22.3929, lng: 113.9768, address: '新界屯門屯順街1號' },
  { name: '形點 YOHO MALL', en: 'YOHO MALL', district: '元朗區', category: '商場', lat: 22.4452, lng: 114.0358, address: '新界元朗朗日路9號' },
  { name: '荃灣廣場', en: 'Tsuen Wan Plaza', district: '荃灣區', category: '商場', lat: 22.3709, lng: 114.1112, address: '新界荃灣大壩街4-30號' },
  { name: '青衣城', en: 'Maritime Square', district: '葵青區', category: '商場', lat: 22.3585, lng: 114.1072, address: '新界青衣青敬路33號' },
  { name: '香港國際機場', en: 'Hong Kong International Airport', district: '離島區', category: '交通樞紐', lat: 22.3080, lng: 113.9185, address: '新界大嶼山赤鱲角翔天路1號' },
  { name: '昂坪360 昂坪市集', en: 'Ngong Ping 360', district: '離島區', category: '景點', lat: 22.2559, lng: 113.9018, address: '新界大嶼山昂坪' },
];
