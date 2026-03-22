export interface WeatherReport {
  city: string;
  country: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
}

const data: Record<string, WeatherReport> = {
  paris: { city: "Paris", country: "France", temperature: 18, condition: "Partly cloudy", humidity: 65, windSpeed: 12, feelsLike: 16 },
  tokyo: { city: "Tokyo", country: "Japan", temperature: 22, condition: "Sunny", humidity: 55, windSpeed: 8, feelsLike: 24 },
  "new york": { city: "New York", country: "United States", temperature: 12, condition: "Rainy", humidity: 80, windSpeed: 20, feelsLike: 9 },
  london: { city: "London", country: "United Kingdom", temperature: 14, condition: "Overcast", humidity: 75, windSpeed: 15, feelsLike: 11 },
  berlin: { city: "Berlin", country: "Germany", temperature: 10, condition: "Foggy", humidity: 85, windSpeed: 6, feelsLike: 8 },
  sydney: { city: "Sydney", country: "Australia", temperature: 25, condition: "Clear sky", humidity: 45, windSpeed: 10, feelsLike: 26 },
  dubai: { city: "Dubai", country: "UAE", temperature: 38, condition: "Sunny", humidity: 30, windSpeed: 5, feelsLike: 42 },
  singapore: { city: "Singapore", country: "Singapore", temperature: 31, condition: "Thunderstorm", humidity: 90, windSpeed: 18, feelsLike: 36 },
  toronto: { city: "Toronto", country: "Canada", temperature: 8, condition: "Snow flurries", humidity: 70, windSpeed: 22, feelsLike: 3 },
  "sao paulo": { city: "São Paulo", country: "Brazil", temperature: 27, condition: "Partly cloudy", humidity: 60, windSpeed: 9, feelsLike: 29 },
};

export function getWeather(city: string): WeatherReport | undefined {
  return data[city.toLowerCase()];
}

export function listCities(): string[] {
  return Object.values(data).map((w) => w.city);
}
