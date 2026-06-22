import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Gemini
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history, context } = req.body;
      
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      let weatherContext = "";
      if (context && context.lat && context.lon) {
         // Optionally fetch real weather if API key present
         if (process.env.OPENWEATHER_API_KEY) {
            try {
              const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${context.lat}&lon=${context.lon}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric&lang=bn`);
              if (weatherRes.ok) {
                 const weatherData = await weatherRes.json();
                 weatherContext = `Current weather: ${weatherData.weather?.[0]?.description}, Temp: ${weatherData.main?.temp}°C.`;
              }
            } catch (e) {
              console.error("OpenWeather failed", e);
            }
         } else {
            weatherContext = `User Location Lat: ${context.lat}, Lon: ${context.lon}. (No weather API key configured, answer generally).`;
         }
      }

      const systemInstruction = `You are a Level-9 Agrometeorology AI Agent & Principal NWP (Numerical Weather Prediction) Engineer speaking in Bengali.
You specialize in hyper-localized predictive nowcasting for the Netrokona Sadar and surrounding Haor regions (e.g., Dingapota, Boro Haor, Khaliajuri).
Your primary users are Boro paddy farmers and local residents.

Important Operational Logic:
1. Spatial Corridor Analysis: Analyze weather strictly along the transit axis of the user (e.g., Netrokona to Borni, etc.). Interpret the raw JSON forecast provided.
2. Time-to-Impact Nowcasting (Lagrangian Optical Flow logic): If rain or storms are detected in the forecast, calculate and describe the conceptual 'Time-to-Impact' (TTI) for the user's location based on wind and precipitation trends.
3. BAMIS Agricultural Rule Engine: 
   - If precipitation is >50mm in 24h during harvesting season (April-May), trigger critical alerts.
   - Example Advisory: "সতর্কতা: আগামী ৩ দিন ভারি বৃষ্টির সম্ভাবনা। আপনার বোরো ধান ৮০% পাকলে হাওরের ঢল আসার আগেই দ্রুত কেটে ফেলুন।" (Warning: Heavy rain expected, if Boro paddy is 80% ripe, harvest immediately before flash floods).
4. Do not clutter the response. Keep it deeply analytical yet easily accessible in simple Bengali.

User Location Context: Lat: ${context?.lat}, Lon: ${context?.lon}.
Additional Weather Data: ${weatherContext}.
Raw Data from API: ${context?.rawForecastJson || 'None'}.
Data Attached by User: ${context?.attachedData || 'None'}.
If the user attaches any text or mock CSV/JSON data, analyze it accurately for localized metrics.
Always respond in Bengali. Maintain an expert, analytical, yet highly accessible tone for farmers.`;

      // Build messages array
      const messages = [];
      if (history && history.length > 0) {
        for (const msg of history) {
           messages.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{text: msg.parts[0].text}] });
        }
      }
      // Add current message
      messages.push({ role: 'user', parts: [{text: message}] });

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite", // The user profile requested low-latency with flash-lite
        contents: messages,
        config: {
          systemInstruction: systemInstruction,
        }
      });
      
      res.json({ text: response.text });
    } catch (error) {
      console.error("Error calling Gemini:", error);
      res.status(500).json({ error: "Failed to generate response." });
    }
  });

  app.get("/api/weather", async (req, res) => {
    try {
      const { lat, lon, city } = req.query;
      if (!lat && !lon && !city) {
        return res.status(400).json({ error: "Missing parameters" });
      }
      
      let weatherData: any = null;
      let targetLat = lat ? parseFloat(lat as string) : 23.81;
      let targetLon = lon ? parseFloat(lon as string) : 90.41;
      
      // 1. Fetch Current Weather to establish coordinates if city is used
      if (process.env.OPENWEATHER_API_KEY) {
        let url = "";
        if (city) {
          url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city as string)}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric&lang=bn`;
        } else {
          url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric&lang=bn`;
        }
        
        const weatherRes = await fetch(url);
        if (weatherRes.ok) {
           weatherData = await weatherRes.json();
           targetLat = weatherData.coord?.lat;
           targetLon = weatherData.coord?.lon;
        }
      }

      // 2. Fetch Forecast (Windy API or OpenWeatherMap Fallback)
      let forecastData: any[] = [];
      let rawForecastJson = "";

      if (process.env.WINDY_API_KEY) {
        try {
           const body = {
             lat: targetLat,
             lon: targetLon,
             model: "gfs",
             parameters: ["temp", "precip"],
             levels: ["surface"],
             key: process.env.WINDY_API_KEY
           };
           const windyRes = await fetch("https://api.windy.com/api/point-forecast/v2", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
           });
           if (windyRes.ok) {
              const windyJson = await windyRes.json();
              rawForecastJson = JSON.stringify(windyJson);
              // Extract logic if needed, simplify since Windy v2 format has arrays in ts, temp-surface, precip
              if (windyJson && windyJson.ts) {
                 for (let i = 0; i < Math.min(8, windyJson.ts.length); i++) {
                   forecastData.push({
                      time: new Date(windyJson.ts[i]).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                      temp: Math.round(windyJson['temp-surface'][i] - 273.15), // Kelvin to C
                      precip: windyJson['precip'] ? Math.round(windyJson['precip'][i]) : 0
                   });
                 }
              }
           }
        } catch (e) {
           console.error("Windy API failed", e);
        }
      }

      // OpenWeather Forecast fallback
      if (forecastData.length === 0 && process.env.OPENWEATHER_API_KEY) {
        try {
           const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${targetLat}&lon=${targetLon}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`);
           if (forecastRes.ok) {
              const fData = await forecastRes.json();
              rawForecastJson = JSON.stringify(fData.list?.slice(0, 8));
              forecastData = fData.list?.slice(0, 8).map((item: any) => ({
                 time: new Date(item.dt * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                 temp: Math.round(item.main.temp),
                 precip: item.rain ? item.rain['3h'] || 0 : 0
              })) || [];
           }
        } catch (e) {
           console.error("OpenWeather forecast failed", e);
        }
      }

      // Mock Forecast if all fail
      if (forecastData.length === 0) {
        const now = new Date();
        for(let i=0; i<8; i++) {
          const t = new Date(now.getTime() + i*3*60*60*1000);
          forecastData.push({
             time: t.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
             temp: 28 + Math.round(Math.random() * 5 - 2),
             precip: Math.max(0, Math.round(Math.random() * 5 - 3))
          });
        }
        rawForecastJson = "MOCK_FORECAST_DATA";
      }

      if (weatherData) {
         return res.json({
           temp: Math.round(weatherData.main?.temp),
           description: weatherData.weather?.[0]?.description,
           icon: weatherData.weather?.[0]?.icon,
           lat: weatherData.coord?.lat,
           lon: weatherData.coord?.lon,
           name: weatherData.name,
           forecast: forecastData,
           rawForecastJson
         });
      }
      
      // Fallback
      res.json({ 
         temp: 28, 
         description: "রৌদ্রোজ্জ্বল (api key missing)", 
         icon: "01d",
         name: city ? `City: ${city}` : "Unknown Location",
         lat: targetLat,
         lon: targetLon,
         forecast: forecastData,
         rawForecastJson
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
