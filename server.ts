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

      const systemInstruction = `You are a helpful AI weather assistant speaking in Bengali. 
Your goal is to provide accurate, easy-to-understand weather information based on the user's location and queries.
If you have context about their location: ${weatherContext}.
Always respond in Bengali. Maintain a friendly tone.`;

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
      
      if (process.env.OPENWEATHER_API_KEY) {
        let url = "";
        if (city) {
          url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city as string)}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric&lang=bn`;
        } else {
          url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric&lang=bn`;
        }
        
        const weatherRes = await fetch(url);
        if (weatherRes.ok) {
           const weatherData = await weatherRes.json();
           return res.json({
             temp: Math.round(weatherData.main?.temp),
             description: weatherData.weather?.[0]?.description,
             icon: weatherData.weather?.[0]?.icon,
             lat: weatherData.coord?.lat,
             lon: weatherData.coord?.lon,
             name: weatherData.name
           });
        }
      }
      
      // Mock fallback if no API key or fetch fails
      res.json({ 
         temp: 28, 
         description: "রৌদ্রোজ্জ্বল (api key missing)", 
         icon: "01d",
         name: city ? `City: ${city}` : "Unknown Location",
         lat: lat ? parseFloat(lat as string) : 23.81,
         lon: lon ? parseFloat(lon as string) : 90.41
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
