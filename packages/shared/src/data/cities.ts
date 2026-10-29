/**
 * 结算页国家 / 城市数据
 * - COUNTRIES：常用收货国家（快捷选项；输入框支持自由填写未列出的国家）
 * - COUNTRY_CITIES：各国主要城市（选定国家后城市输入自动匹配）
 */

export const COUNTRIES = [
  'United States', 'United Kingdom', 'Germany', 'France', 'Spain', 'Italy', 'Netherlands',
  'Portugal', 'Brazil', 'Mexico', 'Canada', 'Australia', 'Japan', 'Other',
  // 东南亚 / 中东 COD 主力市场
  'Thailand', 'Malaysia', 'Singapore', 'Philippines', 'Vietnam', 'Indonesia',
  'Saudi Arabia', 'United Arab Emirates', 'Kuwait', 'Qatar',
  'South Korea', 'India', 'Turkey', 'Poland',
];

/**
 * 国家 → ISO 3166-1 alpha-2 代码
 * 前台用 Intl.DisplayNames(当前语言) 生成 29 种语言的本地化国名（零翻译 API）；
 * 存储 / 提交仍使用英文规范名（COUNTRIES 原文，物流与订单系统依赖）。
 * 'Other' 无 ISO 码，显示与匹配退化为原文。
 */
export const COUNTRY_CODES: Record<string, string> = {
  'United States': 'US',
  'United Kingdom': 'GB',
  'Germany': 'DE',
  'France': 'FR',
  'Spain': 'ES',
  'Italy': 'IT',
  'Netherlands': 'NL',
  'Portugal': 'PT',
  'Brazil': 'BR',
  'Mexico': 'MX',
  'Canada': 'CA',
  'Australia': 'AU',
  'Japan': 'JP',
  'Thailand': 'TH',
  'Malaysia': 'MY',
  'Singapore': 'SG',
  'Philippines': 'PH',
  'Vietnam': 'VN',
  'Indonesia': 'ID',
  'Saudi Arabia': 'SA',
  'United Arab Emirates': 'AE',
  'Kuwait': 'KW',
  'Qatar': 'QA',
  'South Korea': 'KR',
  'India': 'IN',
  'Turkey': 'TR',
  'Poland': 'PL',
};

export const COUNTRY_CITIES: Record<string, string[]> = {
  'United States': [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
    'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville',
    'Columbus', 'Charlotte', 'Seattle', 'Denver', 'Boston', 'Miami', 'Atlanta', 'Detroit',
  ],
  'United Kingdom': [
    'London', 'Manchester', 'Birmingham', 'Liverpool', 'Leeds', 'Glasgow', 'Edinburgh',
    'Sheffield', 'Bristol', 'Newcastle', 'Cardiff', 'Belfast', 'Nottingham', 'Leicester',
  ],
  Germany: [
    'Berlin', 'Munich', 'Hamburg', 'Cologne', 'Frankfurt', 'Stuttgart', 'Düsseldorf',
    'Leipzig', 'Dortmund', 'Essen', 'Bremen', 'Dresden', 'Hannover', 'Nuremberg',
  ],
  France: [
    'Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg',
    'Montpellier', 'Bordeaux', 'Lille', 'Rennes', 'Reims',
  ],
  Spain: [
    'Madrid', 'Barcelona', 'Valencia', 'Seville', 'Zaragoza', 'Málaga', 'Murcia',
    'Palma', 'Bilbao', 'Alicante',
  ],
  Italy: [
    'Rome', 'Milan', 'Naples', 'Turin', 'Palermo', 'Genoa', 'Bologna',
    'Florence', 'Venice', 'Verona',
  ],
  Netherlands: [
    'Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven', 'Groningen',
    'Tilburg', 'Almere',
  ],
  Portugal: ['Lisbon', 'Porto', 'Braga', 'Coimbra', 'Faro', 'Aveiro'],
  Brazil: [
    'São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'Fortaleza', 'Belo Horizonte',
    'Manaus', 'Curitiba', 'Recife', 'Porto Alegre',
  ],
  Mexico: [
    'Mexico City', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana', 'León',
    'Cancún', 'Mérida',
  ],
  Canada: [
    'Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa',
    'Winnipeg', 'Quebec City', 'Halifax',
  ],
  Australia: [
    'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast',
    'Canberra', 'Newcastle',
  ],
  Japan: [
    'Tokyo', 'Osaka', 'Yokohama', 'Nagoya', 'Sapporo', 'Fukuoka', 'Kobe',
    'Kyoto', 'Sendai', 'Hiroshima',
  ],
  Thailand: [
    'Bangkok', 'Chiang Mai', 'Pattaya', 'Phuket', 'Hat Yai', 'Khon Kaen',
    'Nonthaburi', 'Udon Thani', 'Chonburi', 'Surat Thani',
  ],
  Malaysia: [
    'Kuala Lumpur', 'Johor Bahru', 'Penang', 'Ipoh', 'Shah Alam', 'Petaling Jaya',
    'Malacca City', 'Kota Kinabalu', 'Kuching', 'Putrajaya',
  ],
  Singapore: ['Singapore'],
  Philippines: [
    'Manila', 'Quezon City', 'Cebu City', 'Davao City', 'Makati', 'Taguig',
    'Pasig', 'Parañaque', 'Baguio', 'Iloilo City',
  ],
  Vietnam: [
    'Ho Chi Minh City', 'Hanoi', 'Da Nang', 'Hai Phong', 'Can Tho', 'Nha Trang',
    'Bien Hoa', 'Hue', 'Buon Ma Thuot', 'Vung Tau',
  ],
  Indonesia: [
    'Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Semarang', 'Makassar',
    'Palembang', 'Tangerang', 'Depok', 'Denpasar',
  ],
  'Saudi Arabia': [
    'Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam', 'Khobar', 'Dhahran',
    'Taif', 'Buraidah', 'Abha',
  ],
  'United Arab Emirates': [
    'Dubai', 'Abu Dhabi', 'Sharjah', 'Al Ain', 'Ajman', 'Ras Al Khaimah',
    'Fujairah', 'Umm Al Quwain',
  ],
  Kuwait: ['Kuwait City', 'Hawalli', 'Salmiya', 'Jahra', 'Farwaniya', 'Mangaf'],
  Qatar: ['Doha', 'Al Rayyan', 'Al Wakrah', 'Umm Salal', 'Al Khor'],
  'South Korea': [
    'Seoul', 'Busan', 'Incheon', 'Daegu', 'Daejeon', 'Gwangju', 'Ulsan',
    'Suwon', 'Changwon', 'Jeju City',
  ],
  India: [
    'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata',
    'Pune', 'Ahmedabad', 'Jaipur', 'Surat',
  ],
  Turkey: [
    'Istanbul', 'Ankara', 'Izmir', 'Bursa', 'Antalya', 'Adana', 'Konya',
    'Gaziantep', 'Mersin', 'Kayseri',
  ],
  Poland: [
    'Warsaw', 'Kraków', 'Łódź', 'Wrocław', 'Poznań', 'Gdańsk', 'Szczecin',
    'Bydgoszcz', 'Lublin', 'Katowice',
  ],
};
