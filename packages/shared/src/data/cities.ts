/**
 * 结算页国家 / 城市数据
 * - COUNTRIES：常用收货国家（快捷选项；输入框支持自由填写未列出的国家）
 * - COUNTRY_CITIES：各国主要城市（选定国家后城市输入自动匹配）
 */

export const COUNTRIES = [
  'United States', 'United Kingdom', 'Germany', 'France', 'Spain', 'Italy', 'Netherlands',
  'Portugal', 'Brazil', 'Mexico', 'Canada', 'Australia', 'Japan', 'Other',
];

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
};
