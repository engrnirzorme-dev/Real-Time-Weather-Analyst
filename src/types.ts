export interface Message {
  id: string;
  role: 'user' | 'model';
  parts: { text: string }[];
  timestamp: Date;
}

export interface LocationData {
  lat: number;
  lon: number;
  error?: string;
  name?: string;
}

export interface WeatherData {
  temp?: number;
  description?: string;
  icon?: string;
  forecast?: { time: string, temp: number, precip: number }[];
  rawForecastJson?: string;
  attachedData?: string;
}
