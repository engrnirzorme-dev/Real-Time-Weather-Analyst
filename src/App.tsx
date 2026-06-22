import React, { useState, useEffect, useRef } from "react";
import { Mic, Send, MapPin, CloudRain, Sun, Wind, Cloud, Menu, X, Settings, User, Search } from "lucide-react";
import { cn } from "./lib/utils";
import ReactMarkdown from "react-markdown";
import { Message, LocationData } from "./types";
import { auth, db } from "./lib/firebase";
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User as FirebaseUser, signOut } from "firebase/auth";
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp, limit } from "firebase/firestore";

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [weatherDescription, setWeatherDescription] = useState<string>("Loading...");
  const [weatherTemp, setWeatherTemp] = useState<number | null>(null);
  
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchCity, setSearchCity] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchWeatherData = async (params: { lat?: number, lon?: number, city?: string }) => {
     try {
        const queryParams = params.city 
           ? `city=${encodeURIComponent(params.city)}` 
           : `lat=${params.lat}&lon=${params.lon}`;
        
        const res = await fetch(`/api/weather?${queryParams}`);
        const data = await res.json();
        
        if (data.temp !== undefined) setWeatherTemp(data.temp);
        if (data.description) setWeatherDescription(data.description);
        if (data.lat && data.lon) {
           setLocation({ lat: data.lat, lon: data.lon, name: data.name });
        }
     } catch (e) {
        console.error("Weather fetch failed", e);
     }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchChatHistory(currentUser.uid);
      } else {
        setMessages([
          { id: 'welcome', role: 'model', parts: [{ text: "নমস্কার! আমি আপনার এআই আবহাওয়া সহকারী। আপনি যেকোনো জায়গার আবহাওয়া সম্পর্কে বাংলায় জিজ্ঞেস করতে পারেন।" }], timestamp: new Date() }
        ]);
      }
    });

    // Get Geolocation
    if (navigator.geolocation) {
       navigator.geolocation.getCurrentPosition(
         (pos) => {
            fetchWeatherData({ lat: pos.coords.latitude, lon: pos.coords.longitude });
         },
         (err) => {
            fetchWeatherData({ lat: 23.8103, lon: 90.4125 }); // Default to Dhaka
         }
       );
    } else {
       fetchWeatherData({ lat: 23.8103, lon: 90.4125 });
    }

    return () => unsubscribe();
  }, []);


  const fetchChatHistory = async (userId: string) => {
     try {
       const q = query(collection(db, "users", userId, "chats"), orderBy("timestamp", "asc"), limit(50));
       const querySnapshot = await getDocs(q);
       const history: Message[] = [];
       querySnapshot.forEach((doc) => {
          const data = doc.data();
          history.push({
             id: doc.id,
             role: data.role,
             parts: [{ text: data.text }],
             timestamp: data.timestamp?.toDate() || new Date()
          });
       });
       if (history.length === 0) {
          setMessages([
            { id: 'welcome', role: 'model', parts: [{ text: "নমস্কার! আমি আপনার এআই আবহাওয়া সহকারী। আপনি যেকোনো জায়গার আবহাওয়া সম্পর্কে বাংলায় জিজ্ঞেস করতে পারেন।" }], timestamp: new Date() }
          ]);
       } else {
          setMessages(history);
       }
     } catch (e) {
       console.error("Error fetching chats:", e);
     }
  };

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
      alert("Login failed");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    
    const userMessage: Message = { id: Date.now().toString(), role: "user", parts: [{ text }], timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInputText("");
    setLoading(true);

    if (user) {
        addDoc(collection(db, "users", user.uid, "chats"), {
            role: "user",
            text: text,
            timestamp: serverTimestamp()
        }).catch(console.error);
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
           message: text, 
           history: messages,
           context: location
        }),
      });

      if (!response.ok) {
         throw new Error("Failed to get response");
      }

      const data = await response.json();
      
      const modelMessage: Message = { id: (Date.now() + 1).toString(), role: "model", parts: [{ text: data.text }], timestamp: new Date() };
      setMessages(prev => [...prev, modelMessage]);

      if (user) {
          addDoc(collection(db, "users", user.uid, "chats"), {
              role: "model",
              text: data.text,
              timestamp: serverTimestamp()
          }).catch(console.error);
      }
    } catch (e) {
      const errorMessage: Message = { id: (Date.now() + 1).toString(), role: "model", parts: [{ text: "দুঃখিত, সংযোগে সমস্যা হয়েছে।" }], timestamp: new Date() };
      setMessages(prev => [...prev, errorMessage]);
    }

    setLoading(false);
  };

  const renderDashboard = () => (
    <>
      <div className="p-6 sm:p-8 border-b border-slate-100 bg-gradient-to-b from-blue-50 to-white">
        <div className="flex items-center justify-between mb-6">
           <h1 className="text-xl sm:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">আবহাওয়া ড্যাশবোর্ড</h1>
           <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <Settings size={22} className="text-slate-600" />
           </button>
        </div>

        <form 
           onSubmit={(e) => { 
              e.preventDefault(); 
              if (searchCity.trim()) {
                 fetchWeatherData({ city: searchCity }); 
                 setMobileMenuOpen(false);
              }
           }} 
           className="mb-4 relative"
        >
           <input 
             type="text" 
             placeholder="শহরের নাম খুঁজুন..." 
             value={searchCity}
             onChange={(e) => setSearchCity(e.target.value)}
             className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-sans"
           />
           <Search size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
        </form>

        <div className="flex items-center text-slate-600 text-sm mb-2 font-medium px-1">
           <MapPin size={16} className="mr-1.5 text-blue-500 shrink-0" />
           <span className="truncate">{location?.name || (location?.error ? location.error : "Location Active (Lat: " + location?.lat?.toFixed(2) + ")")}</span>
        </div>
        <div className="mt-6 flex items-end gap-3 text-slate-800">
            <CloudRain size={56} className="text-blue-500" />
            <div>
               <div className="text-5xl font-light tracking-tight">{weatherTemp ?? "--"}°C</div>
               <div className="text-lg font-medium text-slate-500 capitalize">{weatherDescription}</div>
            </div>
        </div>
      </div>
      
      <div className="p-6 flex-1 space-y-4 overflow-y-auto">
         <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">কুইক অ্যাকশন (Quick Actions)</h3>
         <button onClick={() => { handleSendMessage("পরবর্তী ৩ ঘণ্টার অবস্থা কী?"); setMobileMenuOpen(false); }} className="w-full flex items-center p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors border border-slate-100 group">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-4 group-hover:scale-110 transition-transform shrink-0">
               <Wind size={20} />
            </div>
            <span className="font-medium text-slate-700 text-left">পরবর্তী ৩ ঘণ্টার অবস্থা</span>
         </button>
         <button onClick={() => { handleSendMessage("আজকের সম্পূর্ণ পূর্বাভাস দিন"); setMobileMenuOpen(false); }} className="w-full flex items-center p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors border border-slate-100 group">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 mr-4 group-hover:scale-110 transition-transform shrink-0">
               <Sun size={20} />
            </div>
            <span className="font-medium text-slate-700 text-left">আজকের সম্পূর্ণ পূর্বাভাস</span>
         </button>
         
         <div className="mt-8">
             <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">রাডার ম্যাপ (Radar)</h3>
             <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden shadow-sm border border-slate-200 bg-slate-100 relative group cursor-pointer" onClick={() => { handleSendMessage("রাডার ম্যাপের তথ্য দিন"); setMobileMenuOpen(false); }}>
                 {/* Fallback map if needed - simulated for now */}
                 <div className="absolute inset-0 opacity-20 bg-[url('https://upload.wikimedia.org/wikipedia/commons/e/ec/World_map_blank_without_borders.svg')] bg-cover bg-center"></div>
                 <div className="absolute inset-0 flex items-center justify-center flex-col text-slate-500 bg-white/40 backdrop-blur-[2px]">
                    <MapPin size={32} className="mb-2 text-blue-500 group-hover:scale-110 transition-transform" />
                    <span className="font-medium text-sm">Open Interactive Radar</span>
                 </div>
             </div>
         </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans text-slate-900">
      {/* Mobile Only: Dashboard Drawer */}
      {mobileMenuOpen && (
         <div className="absolute inset-0 z-50 bg-black/20 lg:hidden" onClick={() => setMobileMenuOpen(false)}>
            <div className="absolute inset-y-0 left-0 w-4/5 max-w-sm bg-white shadow-xl flex flex-col animate-in slide-in-from-left h-full" onClick={e => e.stopPropagation()}>
               <div className="absolute top-4 right-4 z-10">
                  <button onClick={() => setMobileMenuOpen(false)} className="p-2 bg-white/50 backdrop-blur rounded-full shadow-sm text-slate-500 hover:text-slate-800 border border-slate-100">
                     <X size={20} />
                  </button>
               </div>
               {renderDashboard()}
            </div>
         </div>
      )}

      {/* Mobile & Desktop: Settings Modal/Drawer */}
      {showSettings && (
         <div className="absolute inset-0 z-[60] bg-black/40 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setShowSettings(false)}>
            <div className="bg-white rounded-2xl shadow-xl flex flex-col w-full max-w-md animate-in slide-in-from-bottom-4" onClick={e => e.stopPropagation()}>
               <div className="p-4 border-b flex justify-between items-center bg-slate-900 text-white rounded-t-2xl">
                  <h2 className="text-xl font-bold">সেটিংস (Settings)</h2>
                  <button onClick={() => setShowSettings(false)} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700">
                     <X size={20} />
                  </button>
               </div>
               <div className="p-6 text-slate-700 bg-slate-50 rounded-b-2xl">
                  {user ? (
                    <div className="space-y-4">
                       <div className="flex items-center gap-3 p-4 bg-white rounded-xl shadow-sm border border-slate-100">
                          <img src={user.photoURL || ""} alt="Avatar" className="w-12 h-12 rounded-full" />
                          <div>
                            <p className="font-semibold text-slate-900">{user.displayName}</p>
                            <p className="text-sm text-slate-500">{user.email}</p>
                          </div>
                       </div>
                       <button onClick={() => { handleLogout(); setShowSettings(false); }} className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-medium border border-red-100 hover:bg-red-100 transition-colors">
                          লগ আউট করুন
                       </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                       <p>আপনার চ্যাট হিস্টোরি সেভ করতে লগ-ইন করুন।</p>
                       <button onClick={() => { handleLogin(); setShowSettings(false); }} className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium shadow-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                          <User size={18} /> গুগল দিয়ে লগ-ইন
                       </button>
                    </div>
                  )}
               </div>
            </div>
         </div>
      )}

      {/* Left Sidebar - Weather Status Dashboard (Desktop) */}
      <div className="hidden lg:flex w-1/3 max-w-md bg-white border-r border-slate-200 flex-col shadow-sm">
        {renderDashboard()}
      </div>

      {/* Main Chat Interface */}
      <div className="flex-1 flex flex-col w-full relative">
        <header className="lg:hidden p-4 bg-white border-b border-slate-200 flex items-center justify-between shadow-sm z-10">
           <button onClick={() => setMobileMenuOpen(true)} className="p-2 hover:bg-slate-100 rounded-full text-slate-600">
              <Menu size={24} />
           </button>
           <h1 className="text-lg font-bold">এআই আবহাওয়া</h1>
           <button onClick={() => setShowSettings(true)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100">
             {user ? <img src={user.photoURL || ""} alt="" className="w-8 h-8 rounded-full border border-slate-200" /> : <User size={20} className="text-slate-600" />}
           </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 bg-slate-50 scroll-smooth">
            {messages.map((msg) => (
               <div key={msg.id} className={cn("flex w-full", msg.role === 'user' ? "justify-end" : "justify-start")}>
                  <div className={cn(
                     "max-w-[85%] sm:max-w-[70%] rounded-2xl p-5 shadow-sm text-[15px] leading-relaxed", 
                     msg.role === 'user' 
                       ? "bg-slate-900 text-white rounded-tr-sm" 
                       : "bg-white text-slate-800 border border-slate-200 rounded-tl-sm"
                  )}>
                     <div className="markdown-body text-current space-y-2 [&>p]:mb-2 [&>ul]:list-disc [&>ul]:ml-4 [&>ol]:list-decimal [&>ol]:ml-4">
                        <ReactMarkdown>
                           {msg.parts[0].text}
                        </ReactMarkdown>
                     </div>
                     <div className={cn("mt-2 text-[10px] uppercase tracking-wider font-semibold opacity-50", msg.role === 'user' ? "text-right" : "text-left")}>
                        {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                     </div>
                  </div>
               </div>
            ))}
            {loading && (
               <div className="flex w-full justify-start">
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-5 shadow-sm flex gap-2">
                     <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{animationDelay: '0ms'}}></div>
                     <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{animationDelay: '150ms'}}></div>
                     <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{animationDelay: '300ms'}}></div>
                  </div>
               </div>
            )}
            <div ref={messagesEndRef} className="h-4" />
        </div>

        <div className="p-4 sm:p-6 bg-white border-t border-slate-200">
           <form 
              onSubmit={(e) => { e.preventDefault(); handleSendMessage(inputText); }}
              className="max-w-4xl mx-auto relative flex items-end gap-3"
           >
              <button 
                 type="button"
                 title="Voice Input (Coming Soon)"
                 className="p-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-colors shadow-sm shrink-0"
              >
                 <Mic size={22} />
              </button>
              <div className="flex-1 bg-slate-100 rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex-col flex relative min-h-[56px]">
                  <textarea
                     value={inputText}
                     onChange={(e) => setInputText(e.target.value)}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                           e.preventDefault();
                           handleSendMessage(inputText);
                        }
                     }}
                     placeholder="আবহাওয়ার বিষয়ে কিছু জিগ্যেস করুন..."
                     className="w-full bg-transparent p-4 resize-none outline-none text-slate-900 placeholder:text-slate-500"
                     rows={1}
                     style={{minHeight: '56px'}}
                  />
              </div>
              <button 
                 type="submit"
                 disabled={!inputText.trim() || loading}
                 className="p-4 bg-slate-900 disabled:bg-slate-400 hover:bg-slate-800 text-white rounded-2xl transition-colors shadow-sm shrink-0 disabled:cursor-not-allowed group"
              >
                 <Send size={22} className={cn(inputText.trim() && !loading ? "group-hover:translate-x-1 transition-transform" : "")} />
              </button>
           </form>
           <p className="text-center text-xs text-slate-400 mt-4 font-medium uppercase tracking-widest hidden sm:block">AI Studio • Google Gemini • Firebase</p>
        </div>
      </div>
    </div>
  );
}
