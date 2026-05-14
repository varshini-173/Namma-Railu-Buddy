import React, { useState, useEffect, useMemo } from 'react';
import { 
  Train as TrainIcon, 
  MapPin, 
  Bell, 
  LayoutList, 
  Accessibility,
  Snowflake,
  Bed,
  Armchair,
  ShieldCheck,
  Search,
  Navigation,
  CheckCircle2,
  AlertCircle,
  Info,
  Clock,
  LogIn,
  LogOut,
  User as UserIcon,
  Users,
  Crown,
  Wifi,
  ChevronRight,
  Calendar,
  Map as MapIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  Timestamp,
  limit,
  getDocs
} from 'firebase/firestore';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

import { auth, db, OperationType, handleFirestoreError } from './firebase';
import { STATIONS, TRAINS } from './data/mockData';
import { Station, Train, PlatformPing, DelayReport, CoachAvailability, LiveTrainPosition } from './types';
import { cn, calculateDistance } from './lib/utils';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

function RoutePolyline({ stations }: { stations: Station[] }) {
  const map = useMap();
  const mapsLib = useMapsLibrary('core');
  
  useEffect(() => {
    if (!map || !mapsLib || stations.length < 2) return;

    const path = stations.map(s => ({ lat: s.latitude, lng: s.longitude }));
    const polyline = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: '#f97316',
      strokeOpacity: 0.8,
      strokeWeight: 4,
    });

    polyline.setMap(map);

    // Fit bounds to show entire route
    const bounds = new google.maps.LatLngBounds();
    path.forEach(coord => bounds.extend(coord));
    map.fitBounds(bounds, { top: 100, bottom: 100, left: 50, right: 50 });

    return () => polyline.setMap(null);
  }, [map, mapsLib, stations]);

  return null;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'pings' | 'coach' | 'alarm' | 'map' | 'schedule'>('pings');
  const [selectedStation, setSelectedStation] = useState<Station | null>(STATIONS[0]);
  const [selectedTrain, setSelectedTrain] = useState<Train | null>(TRAINS[0]);
  const [trainSearch, setTrainSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [pings, setPings] = useState<PlatformPing[]>([]);
  const [trainLocation, setTrainLocation] = useState<Station | null>(null);
  const [livePosition, setLivePosition] = useState<{lat: number, lng: number} | null>(null);
  const [delays, setDelays] = useState<DelayReport[]>([]);
  const [availability, setAvailability] = useState<CoachAvailability[]>([]);
  const [showDelayModal, setShowDelayModal] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [destination, setDestination] = useState<Station | null>(null);
  const [alarmActive, setAlarmActive] = useState(false);
  const [distanceToDest, setDistanceToDest] = useState<number | null>(null);
  const [platformSuggestions, setPlatformSuggestions] = useState<string[]>([]);
  const [isOnTrain, setIsOnTrain] = useState(false);
  const [shareLocation, setShareLocation] = useState(localStorage.getItem('share_location') === 'true');
  const [publicUserPositions, setPublicUserPositions] = useState<LiveTrainPosition[]>([]);
  const [openInfoWindow, setOpenInfoWindow] = useState<string | null>(null);

  // Auth setup
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currUser) => {
      setUser(currUser);
    });
    return unsub;
  }, []);

  const [showProfile, setShowProfile] = useState(false);
  const [userHistory, setUserHistory] = useState<{pings: PlatformPing[], delays: DelayReport[], availability: CoachAvailability[]}>({ pings: [], delays: [], availability: [] });

  // History listener
  useEffect(() => {
    if (!user) return;

    const pingsQuery = query(
      collection(db, 'pings'),
      where('reportedBy', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const delaysQuery = query(
      collection(db, 'delays'),
      where('reportedBy', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const availabilityQuery = query(
      collection(db, 'availability'),
      where('reportedBy', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubPings = onSnapshot(pingsQuery, (snapshot) => {
      setUserHistory(prev => ({
        ...prev,
        pings: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlatformPing))
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'pings');
    });

    const unsubDelays = onSnapshot(delaysQuery, (snapshot) => {
      setUserHistory(prev => ({
        ...prev,
        delays: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DelayReport))
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'delays');
    });

    const unsubAvailability = onSnapshot(availabilityQuery, (snapshot) => {
      setUserHistory(prev => ({
        ...prev,
        availability: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoachAvailability))
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'availability');
    });

    return () => {
      unsubPings();
      unsubDelays();
      unsubAvailability();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Geolocation tracking
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
      },
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Alarm logic
  useEffect(() => {
    if (destination && currentLocation && alarmActive) {
      const dist = calculateDistance(
        currentLocation.lat, 
        currentLocation.lng, 
        destination.latitude, 
        destination.longitude
      );
      setDistanceToDest(dist);

      // Heuristic for On Train: Near ANY station on the route
      if (selectedTrain) {
        const isNearRoute = selectedTrain.route.some(stationId => {
          const station = STATIONS.find(s => s.id === stationId);
          if (!station) return false;
          const d = calculateDistance(currentLocation.lat, currentLocation.lng, station.latitude, station.longitude);
          return d < 5; // 5km proximity
        });
        setIsOnTrain(isNearRoute);
      } else {
        setIsOnTrain(false);
      }

      if (dist <= 5) {
        if ('vibrate' in navigator) {
          navigator.vibrate([500, 200, 500, 200, 500]);
        }
      }
    } else {
      setDistanceToDest(null);
    }
  }, [currentLocation, destination, alarmActive]);

  // Platform Suggestions Logic
  useEffect(() => {
    if (!selectedStation || !selectedTrain) return;

    const q = query(
      collection(db, 'pings'),
      where('stationId', '==', selectedStation.id),
      where('trainId', '==', selectedTrain.number),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const platforms = snapshot.docs
        .map(doc => doc.data() as PlatformPing)
        .filter(ping => ping.confirmedBy.length > 0)
        .map(ping => ping.platform);
      
      // Get unique platforms and take the most recent ones
      const uniqueSuggestions = Array.from(new Set(platforms)).slice(0, 3);
      setPlatformSuggestions(uniqueSuggestions);
    }, (error) => {
      console.error("Error fetching suggestions:", error);
    });

    return unsub;
  }, [selectedStation, selectedTrain]);

  // Firestore listeners for Pings
  useEffect(() => {
    if (!selectedStation || !selectedTrain) return;

    const now = new Date();
    const q = query(
      collection(db, 'pings'),
      where('stationId', '==', selectedStation.id),
      where('trainId', '==', selectedTrain.number),
      where('expiresAt', '>', Timestamp.fromDate(now)),
      orderBy('expiresAt', 'asc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const pingList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as PlatformPing));
      setPings(pingList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'pings');
    });

    return unsub;
  }, [selectedStation, selectedTrain]);

  // Live Train Tracking Listener
  useEffect(() => {
    if (!selectedTrain) return;

    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    const q = query(
      collection(db, 'live_positions'),
      where('trainId', '==', selectedTrain.number),
      where('createdAt', '>', Timestamp.fromDate(tenMinutesAgo)),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const positions = snapshot.docs.map(doc => doc.data() as LiveTrainPosition);
        // Average positions to get a more accurate location
        const avgLat = positions.reduce((acc, curr) => acc + curr.latitude, 0) / positions.length;
        const avgLng = positions.reduce((acc, curr) => acc + curr.longitude, 0) / positions.length;
        setLivePosition({ lat: avgLat, lng: avgLng });
      } else {
        setLivePosition(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'live_positions');
    });

    return unsub;
  }, [selectedTrain]);

  // Persist share location preference
  useEffect(() => {
    localStorage.setItem('share_location', shareLocation.toString());
  }, [shareLocation]);

  // Public User Positions Listener
  useEffect(() => {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    const q = query(
      collection(db, 'live_positions'),
      where('trainId', '==', '__PUBLIC_USER__'),
      where('createdAt', '>', Timestamp.fromDate(tenMinutesAgo)),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const positions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LiveTrainPosition));
      // Filter out own position if already sharing
      setPublicUserPositions(positions.filter(p => p.reportedBy !== user?.uid));
    }, (error) => {
      // Don't throw for public positions if list fails, just log it
      console.error("Public positions error:", error);
    });

    return unsub;
  }, [user]);

  // Combined Broadcast Logic
  useEffect(() => {
    if ((!isOnTrain || !selectedTrain) && !shareLocation) return;
    if (!currentLocation || !user) return;

    // Only broadcast every 60 seconds to save battery/quota
    const lastBroadcast = localStorage.getItem(`last_broadcast_full`);
    const now = Date.now();
    
    if (lastBroadcast && now - parseInt(lastBroadcast) < 60000) return;

    const broadcast = async () => {
      try {
        const batch: Promise<any>[] = [];
        
        // Broadcast train location if on train
        if (isOnTrain && selectedTrain) {
          batch.push(addDoc(collection(db, 'live_positions'), {
            trainId: selectedTrain.number,
            latitude: currentLocation.lat,
            longitude: currentLocation.lng,
            reportedBy: user.uid,
            createdAt: serverTimestamp()
          }));
        }

        // Broadcast public location if enabled
        if (shareLocation) {
          batch.push(addDoc(collection(db, 'live_positions'), {
            trainId: '__PUBLIC_USER__',
            latitude: currentLocation.lat,
            longitude: currentLocation.lng,
            reportedBy: user.uid,
            createdAt: serverTimestamp()
          }));
        }

        if (batch.length > 0) {
          await Promise.all(batch);
          localStorage.setItem(`last_broadcast_full`, now.toString());
        }
      } catch (error) {
        console.error("Error broadcasting location:", error);
      }
    };

    broadcast();
  }, [isOnTrain, selectedTrain, shareLocation, currentLocation, user]);

  // Live Train Tracking Listener (Station-based fallback)
  useEffect(() => {
    if (!selectedTrain) return;

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const q = query(
      collection(db, 'pings'),
      where('trainId', '==', selectedTrain.number),
      where('createdAt', '>', Timestamp.fromDate(oneHourAgo)),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const latestPing = snapshot.docs[0].data() as PlatformPing;
        const station = STATIONS.find(s => s.id === latestPing.stationId);
        if (station) {
          setTrainLocation(station);
        }
      } else {
        setTrainLocation(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'pings');
    });

    return unsub;
  }, [selectedTrain]);

  // Coach Availability listener
  useEffect(() => {
    if (!selectedTrain) return;

    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const q = query(
      collection(db, 'availability'),
      where('trainId', '==', selectedTrain.number),
      where('createdAt', '>', Timestamp.fromDate(twoHoursAgo)),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const availList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as CoachAvailability));
      setAvailability(availList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'availability');
    });

    return unsub;
  }, [selectedTrain]);

  // Delay listener
  useEffect(() => {
    if (!selectedTrain) return;

    const now = new Date();
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

    const q = query(
      collection(db, 'delays'),
      where('trainId', '==', selectedTrain.number),
      where('createdAt', '>', Timestamp.fromDate(fourHoursAgo)),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const delayList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as DelayReport));
      setDelays(delayList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'delays');
    });

    return unsub;
  }, [selectedTrain]);

  const handleReportPlatform = async (platform: string) => {
    if (!user || !selectedStation || !selectedTrain) return;

    const now = new Date();
    const expiry = new Date(now.getTime() + 30 * 60 * 1000);

    try {
      await addDoc(collection(db, 'pings'), {
        trainId: selectedTrain.number,
        stationId: selectedStation.id,
        platform,
        reportedBy: user.uid,
        confirmedBy: [],
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiry)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'pings');
    }
  };

  const handleConfirmPing = async (pingId: string, confirmedBy: string[]) => {
    if (!user || confirmedBy.includes(user.uid)) return;

    try {
      await updateDoc(doc(db, 'pings', pingId), {
        confirmedBy: [...confirmedBy, user.uid]
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `pings/${pingId}`);
    }
  };

  const handleReportDelay = async (minutes: number, reason: string) => {
    if (!user || !selectedTrain) return;

    try {
      await addDoc(collection(db, 'delays'), {
        trainId: selectedTrain.number,
        minutes,
        reason,
        reportedBy: user.uid,
        createdAt: serverTimestamp()
      });
      setShowDelayModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'delays');
    }
  };

  const handleReportAvailability = async (coachId: string, status: 'empty' | 'moderate' | 'full') => {
    if (!user || !selectedTrain) return;

    try {
      await addDoc(collection(db, 'availability'), {
        trainId: selectedTrain.number,
        coachId,
        status,
        reportedBy: user.uid,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'availability');
    }
  };

  const avgDelay = delays.length > 0 
    ? Math.round(delays.reduce((acc, curr) => acc + curr.minutes, 0) / delays.length)
    : 0;

  const topReason = useMemo(() => {
    if (delays.length === 0) return null;
    const reasons = delays.map(d => d.reason).filter(Boolean) as string[];
    if (reasons.length === 0) return null;
    
    const freq: Record<string, number> = {};
    reasons.forEach(r => freq[r] = (freq[r] || 0) + 1);
    
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  }, [delays]);

  const trainStatus = useMemo(() => {
    if (!selectedTrain) return null;
    
    // Proximity logic from live position or pings
    let proximityLabel = '';
    let proximityIcon = Clock;
    let proximityColor = 'text-green-500';
    let proximityBg = 'bg-green-500/10';

    if (livePosition) {
      // Find nearest station in route
      const stationsInRoute = selectedTrain.route.map(id => STATIONS.find(s => s.id === id)).filter(Boolean) as Station[];
      const nearest = stationsInRoute.reduce((prev, curr) => {
        const dPrev = calculateDistance(livePosition.lat, livePosition.lng, prev.latitude, prev.longitude);
        const dCurr = calculateDistance(livePosition.lat, livePosition.lng, curr.latitude, curr.longitude);
        return dPrev < dCurr ? prev : curr;
      });

      const dist = calculateDistance(livePosition.lat, livePosition.lng, nearest.latitude, nearest.longitude);
      if (dist < 1) {
        proximityLabel = `At ${nearest.name}`;
        proximityIcon = MapPin;
      } else {
        const trainIdx = selectedTrain.route.indexOf(nearest.id);
        // Heuristic: if moving towards next station
        proximityLabel = `Approaching ${nearest.name}`;
        proximityIcon = Navigation;
      }
      proximityColor = 'text-orange-500';
      proximityBg = 'bg-orange-500/10';
    } else if (trainLocation) {
      if (selectedStation && trainLocation.id === selectedStation.id) {
        proximityLabel = 'At Station';
        proximityIcon = MapPin;
      } else {
        proximityLabel = `Last seen at ${trainLocation.name}`;
        proximityIcon = History;
      }
      proximityColor = 'text-blue-500';
      proximityBg = 'bg-blue-500/10';
    }

    if (avgDelay > 15) return { 
      label: proximityLabel || 'Delayed', 
      subLabel: `${avgDelay}m late`, 
      color: 'text-red-500', 
      bg: 'bg-red-500/10', 
      icon: AlertCircle,
      proximity: proximityLabel
    };
    if (avgDelay > 0) return { 
      label: proximityLabel || 'Running Late', 
      subLabel: `${avgDelay}m delay`, 
      color: 'text-yellow-500', 
      bg: 'bg-yellow-500/10', 
      icon: Clock,
      proximity: proximityLabel
    };

    return { 
      label: proximityLabel || 'On Time', 
      subLabel: proximityLabel ? 'Running Smooth' : 'Expected', 
      color: proximityColor, 
      bg: proximityBg, 
      icon: proximityLabel ? proximityIcon : CheckCircle2,
      proximity: proximityLabel
    };
  }, [selectedTrain, avgDelay, trainLocation, selectedStation, livePosition]);

  const getCoachInfo = (code: string) => {
    if (code === 'Engine') return { name: 'Locomotive', icon: Navigation, color: 'text-red-400', bg: 'bg-red-500/5', border: 'border-red-500/20', iconRotate: 180 };
    if (code === 'Ladies') return { name: 'Ladies Only', icon: UserIcon, color: 'text-pink-400', bg: 'bg-pink-500/5', border: 'border-pink-500/20' };
    if (code === 'Handicapped') return { name: 'Handicapped', icon: Accessibility, color: 'text-blue-400', bg: 'bg-blue-500/5', border: 'border-blue-500/20' };
    if (code === 'General' || code === 'UR') return { name: 'General/UR', icon: Users, color: 'text-neutral-400', bg: 'bg-neutral-900/40', border: 'border-neutral-800' };
    
    if (code.startsWith('S')) return { name: `Sleeper (${code})`, icon: Bed, color: 'text-orange-400', bg: 'bg-orange-500/5', border: 'border-orange-500/20' };
    if (code.startsWith('B')) return { name: `AC 3-Tier (${code})`, icon: Snowflake, color: 'text-cyan-400', bg: 'bg-cyan-500/5', border: 'border-cyan-500/20' };
    if (code.startsWith('A')) return { name: `AC 2-Tier (${code})`, icon: Snowflake, color: 'text-indigo-400', bg: 'bg-indigo-500/5', border: 'border-indigo-500/20' };
    if (code.startsWith('H')) return { name: `AC 1st Class (${code})`, icon: Crown, color: 'text-yellow-400', bg: 'bg-yellow-500/5', border: 'border-yellow-500/20' };
    if (code.startsWith('D')) return { name: `Second Seating (${code})`, icon: Armchair, color: 'text-neutral-300', bg: 'bg-neutral-900/40', border: 'border-neutral-800' };
    if (code.startsWith('C')) return { name: `AC Chair Car (${code})`, icon: Snowflake, color: 'text-blue-300', bg: 'bg-blue-500/5', border: 'border-blue-500/20' };
    if (code === 'Guard' || code === 'SLR') return { name: 'Guard/Brake', icon: ShieldCheck, color: 'text-neutral-500', bg: 'bg-neutral-900/40', border: 'border-neutral-800' };
    
    return { name: `Coach ${code}`, icon: LayoutList, color: 'text-neutral-400', bg: 'bg-neutral-900/40', border: 'border-neutral-800' };
  };

  if (!hasValidKey) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-8 font-sans">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-[3rem] p-10 text-center space-y-8 shadow-2xl">
          <div className="bg-orange-500/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto border border-orange-500/20">
            <MapIcon className="w-10 h-10 text-orange-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black italic tracking-tighter">Maps Key Required</h2>
            <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest leading-relaxed">
              To visualize routes, you need to add your Google Maps API key as a secret.
            </p>
          </div>
          <div className="bg-black/40 rounded-3xl p-6 text-left space-y-4 border border-neutral-800">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Instructions:</p>
            <ol className="text-[11px] font-bold text-neutral-300 space-y-3 pl-4 list-decimal">
              <li>Get a key from the Google Cloud Console</li>
              <li>Open Settings (⚙️ top right) → Secrets</li>
              <li>Add <code className="text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded">GOOGLE_MAPS_PLATFORM_KEY</code></li>
            </ol>
          </div>
          <p className="text-[10px] text-neutral-600 font-black uppercase tracking-tighter">The app will rebuild automatically</p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY} version="weekly">
      <div className="min-h-screen bg-[#050505] text-neutral-100 font-sans selection:bg-orange-500/30 pb-32">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#050505]/80 backdrop-blur-2xl border-b border-neutral-900 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-orange-400 to-orange-600 p-2 rounded-2xl shadow-lg shadow-orange-500/20">
              <TrainIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter leading-tight">Railu Buddy</h1>
              <div className="flex items-center gap-1 opacity-60 text-[8px] uppercase tracking-widest font-black">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                </span>
                Live Network
              </div>
            </div>
          </div>

          <div className="flex-1 max-w-[120px] mx-4 relative group hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-500" />
            <input 
              type="text"
              placeholder="Search..."
              value={trainSearch}
              onChange={(e) => {
                setTrainSearch(e.target.value);
                setShowSearch(true);
              }}
              onFocus={() => setShowSearch(true)}
              onBlur={() => setTimeout(() => setShowSearch(false), 200)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-full py-1.5 pl-8 pr-3 text-[10px] font-bold focus:outline-none focus:ring-1 focus:ring-orange-500/50 transition-all"
            />
            <AnimatePresence>
              {showSearch && trainSearch && (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute top-full left-0 right-0 mt-1 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden z-50 p-1 min-w-[160px]"
                >
                  {TRAINS.filter(t => 
                    t.name.toLowerCase().includes(trainSearch.toLowerCase()) || 
                    t.number.includes(trainSearch)
                  ).map(train => (
                    <button
                      key={train.number}
                      onClick={() => {
                        setSelectedTrain(train);
                        setTrainSearch('');
                        setShowSearch(false);
                      }}
                      className="w-full text-left p-2 hover:bg-black rounded-lg transition-colors flex items-center gap-2"
                    >
                      <TrainIcon className="w-3 h-3 text-orange-500" />
                      <div className="truncate">
                        <p className="text-[9px] font-black text-white leading-none">{train.number}</p>
                        <p className="text-[8px] text-neutral-500 font-bold uppercase truncate">{train.name}</p>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="flex items-center gap-3">
            {user ? (
              <button 
                onClick={() => setShowProfile(true)}
                className="w-10 h-10 rounded-full border-2 border-neutral-800 p-0.5 hover:border-orange-500 transition-all overflow-hidden"
              >
                {user.photoURL ? (
                  <img src={user.photoURL} className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" alt="" />
                ) : (
                  <div className="w-full h-full bg-neutral-800 rounded-full flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-neutral-500" />
                  </div>
                )}
              </button>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/5"
              >
                <LogIn className="w-3.5 h-3.5" />
                Login
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Profile Modal */}
      <AnimatePresence>
        {showProfile && user && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProfile(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-[3rem] overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-8 pb-4 text-center space-y-4">
                <div className="relative inline-block">
                  <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} className="w-24 h-24 rounded-full border-4 border-black shadow-2xl mx-auto" alt="" referrerPolicy="no-referrer" />
                  <div className="absolute -bottom-1 -right-1 bg-green-500 w-6 h-6 rounded-full border-4 border-neutral-900"></div>
                </div>
                <div>
                  <h2 className="text-2xl font-black italic tracking-tighter">{user.displayName}</h2>
                  <p className="text-xs font-bold text-neutral-500 uppercase tracking-[0.2em]">{user.email}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 pb-8 space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-black/40 border border-neutral-800 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-black text-white">{userHistory.pings.length + userHistory.delays.length + userHistory.availability.length}</p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500">Total Reports</p>
                  </div>
                  <div className="bg-black/40 border border-neutral-800 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-black text-orange-500">Top 12%</p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500">Contributor</p>
                  </div>
                </div>

                  <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 ml-2">Recent Contributions</h3>
                  <div className="space-y-2">
                    {[
                      ...userHistory.delays.map(d => ({...d, type: 'delay', label: `Reported ${d.minutes}m delay`})), 
                      ...userHistory.pings.map(p => ({...p, type: 'ping', label: `Platform ${p.platform} update`})),
                      ...userHistory.availability.map(a => ({...a, type: 'availability', label: `Coach ${a.coachId}: ${a.status}`}))
                    ].sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 10).map((item: any, idx) => (
                      <div key={idx} className="bg-black/20 border border-neutral-800/50 rounded-xl p-3 flex items-center gap-3">
                        <div className="p-2 bg-neutral-800 rounded-lg">
                          {item.type === 'delay' ? <Clock className="w-3 h-3 text-orange-500" /> : 
                           item.type === 'availability' ? <LayoutList className="w-3 h-3 text-blue-500" /> :
                           <TrainIcon className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-bold text-white">
                            {item.label}
                          </p>
                          <p className="text-[8px] text-neutral-500 uppercase tracking-tighter font-black">Train {item.trainId}</p>
                        </div>
                      </div>
                    ))}
                    {userHistory.pings.length === 0 && userHistory.delays.length === 0 && userHistory.availability.length === 0 && (
                      <div className="text-center py-8 opacity-50">
                        <p className="text-xs font-bold uppercase tracking-widest">No history yet</p>
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  onClick={() => {
                    auth.signOut();
                    setShowProfile(false);
                  }}
                  className="w-full py-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {/* Selection Area */}
        <div className="bg-neutral-900/40 border border-neutral-800 p-5 rounded-[2.5rem] shadow-2xl space-y-5">
          {/* Tracking visualization */}
          {selectedTrain && (
            <div className="relative h-24 bg-black/40 rounded-3xl border border-neutral-800/50 overflow-hidden flex items-center px-6">
              <div className="absolute inset-0 opacity-10 pointer-events-none">
                <div className="h-full w-full bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.1)_0%,transparent_70%)]"></div>
              </div>
              
              <div className="flex-1 relative flex items-center justify-between">
                {/* Route Line */}
                <div className="absolute left-0 right-0 h-0.5 bg-neutral-800"></div>
                
                {selectedTrain.route.map((stationId, idx) => {
                  const station = STATIONS.find(s => s.id === stationId);
                  const isCurrent = trainLocation?.id === stationId;
                  const isUserAt = selectedStation?.id === stationId;
                  
                  return (
                    <div key={stationId} className="relative flex flex-col items-center">
                      <div className={cn(
                        "w-2.5 h-2.5 rounded-full z-10 transition-all duration-500",
                        isCurrent ? "bg-orange-500 ring-4 ring-orange-500/20 scale-125" : "bg-neutral-700"
                      )}></div>
                      <span className={cn(
                        "absolute top-4 text-[7px] font-black uppercase tracking-tighter whitespace-nowrap transition-colors",
                        isCurrent ? "text-orange-500" : "text-neutral-600"
                      )}>
                        {station?.id}
                      </span>
                      {isCurrent && (
                        <motion.div 
                          layoutId="trainIndicator"
                          className="absolute -top-7"
                        >
                          <TrainIcon className="w-4 h-4 text-orange-500" />
                        </motion.div>
                      )}
                      {isUserAt && !isCurrent && (
                        <div className="absolute -top-5">
                          <MapPin className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></div>
                <span className="text-[8px] font-black text-neutral-500 uppercase tracking-widest">
                  {trainLocation ? `Currently at ${trainLocation.name}` : 'Position Unknown'}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 ml-1">Current Station</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center group-focus-within:bg-orange-500 transition-colors">
                <MapPin className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
              </div>
              <select 
                value={selectedStation?.id}
                onChange={(e) => setSelectedStation(STATIONS.find(s => s.id === e.target.value) || null)}
                className="w-full bg-black border border-neutral-800 rounded-2xl py-4 pl-14 pr-4 appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all font-bold text-white shadow-inner"
              >
                {STATIONS.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                <ChevronRight className="w-5 h-5 rotate-90" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 ml-1">Train Selection</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center group-focus-within:bg-orange-500 transition-colors">
                <Navigation className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
              </div>
              <select 
                value={selectedTrain?.number}
                onChange={(e) => setSelectedTrain(TRAINS.find(t => t.number === e.target.value) || null)}
                className="w-full bg-black border border-neutral-800 rounded-2xl py-4 pl-14 pr-4 appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all font-bold text-white shadow-inner"
              >
                {TRAINS.map(t => <option key={t.number} value={t.number}>{t.number} - {t.name}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                <ChevronRight className="w-5 h-5 rotate-90" />
              </div>
            </div>
            
            {selectedTrain && (
              <div className="pt-4 mt-4 border-t border-neutral-800/50 space-y-5">
                {/* Coach List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500">Coach Composition</p>
                    <span className="text-[8px] font-bold text-neutral-600 bg-neutral-800/50 px-2 py-0.5 rounded-full uppercase">Front {`→`} Back</span>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                    {selectedTrain.coaches.map((coach, idx) => {
                      const info = getCoachInfo(coach);
                      const Icon = info.icon;
                      return (
                        <div key={idx} className={cn(
                          "shrink-0 w-9 h-12 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-transform hover:scale-105", 
                          info.bg, 
                          info.border
                        )}>
                          <Icon 
                            className={cn("w-4 h-4", info.color)} 
                            style={info.iconRotate ? { transform: `rotate(${info.iconRotate}deg)` } : {}} 
                          />
                          <span className={cn("text-[8px] font-black", info.color)}>{coach.substring(0, 3)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Route Summary */}
                <div className="space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500">Main Route Stops</p>
                  <div className="bg-black/30 rounded-2xl p-3 flex flex-wrap items-center gap-y-2 gap-x-1 border border-neutral-800/30">
                    {selectedTrain.route.map((stationId, idx) => {
                      const station = STATIONS.find(s => s.id === stationId);
                      return (
                        <React.Fragment key={stationId}>
                          <div className="flex flex-col items-start px-2 py-1 bg-white/5 rounded-lg border border-white/5">
                            <span className="text-[9px] font-black text-white leading-tight">{station?.name}</span>
                            <span className="text-[7px] font-bold text-neutral-500 uppercase tracking-tighter">{stationId}</span>
                          </div>
                          {idx < selectedTrain.route.length - 1 && (
                            <div className="flex items-center px-0.5">
                              <ChevronRight className="w-3 h-3 text-neutral-800" />
                            </div>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Delay Reporting Modal */}
        <AnimatePresence>
          {showDelayModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowDelayModal(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-[2.5rem] p-8 shadow-2xl space-y-6"
              >
                <div className="text-center space-y-1">
                  <h3 className="text-xl font-black italic tracking-tighter">Report Delay</h3>
                  <p className="text-[10px] uppercase font-black tracking-widest text-neutral-500">How late is {selectedTrain?.name}?</p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[5, 10, 15, 20, 30, 45].map(mins => (
                    <button
                      key={mins}
                      onClick={() => handleReportDelay(mins, 'Late Arrival')}
                      className="bg-black border border-neutral-800 rounded-2xl py-4 hover:border-orange-500 transition-all font-black"
                    >
                      {mins}m
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-black text-center uppercase tracking-widest text-neutral-600">Quick Reasons</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {['Signal', 'Technical', 'Heavy Rain', 'Others'].map(reason => (
                      <button
                        key={reason}
                        onClick={() => handleReportDelay(5, reason)}
                        className="bg-neutral-800/50 border border-neutral-800 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest hover:border-neutral-700"
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={() => setShowDelayModal(false)}
                  className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'pings' && (
            <motion.div 
              key="pings"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-5"
            >
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-orange-500" />
                  <h3 className="text-sm font-black uppercase tracking-widest underline decoration-orange-500 decoration-2 underline-offset-4">Platform Pings</h3>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 px-3 py-1 rounded-full text-[9px] font-black text-neutral-400 uppercase tracking-tighter">
                  Real-time
                </div>
              </div>

              {/* Comprehensive Train Status Card */}
              {trainStatus && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "relative overflow-hidden rounded-[2.5rem] p-6 border border-white/5 shadow-2xl",
                    trainStatus.bg
                  )}
                >
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <trainStatus.icon className={cn("w-24 h-24", trainStatus.color)} />
                  </div>
                  <div className="relative space-y-4">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-xl bg-black/20", trainStatus.color)}>
                        <trainStatus.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className={cn("text-[10px] font-black uppercase tracking-widest", trainStatus.color)}>
                          Current Status
                        </p>
                        <h4 className="text-xl font-black italic tracking-tighter text-white">
                          {trainStatus.label}
                        </h4>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-black/20 rounded-2xl p-3 border border-white/5">
                        <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mb-1">Delay Info</p>
                        <div className="flex items-center gap-2">
                          <Clock className={cn("w-3 h-3", avgDelay > 0 ? "text-yellow-500" : "text-green-500")} />
                          <span className="text-xs font-black text-white">
                            {avgDelay > 0 ? `${avgDelay}m Delay` : 'On Time'}
                          </span>
                        </div>
                      </div>
                      <div className="bg-black/20 rounded-2xl p-3 border border-white/5">
                        <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mb-1">Reliability</p>
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-3 h-3 text-blue-500" />
                          <span className="text-xs font-black text-white">
                            {pings.length > 5 ? 'High' : 'Medium'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {trainStatus.proximity && (
                      <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-full border border-white/5 self-start">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                        <p className="text-[9px] font-black uppercase tracking-widest text-orange-200/80">
                          {trainStatus.proximity}
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* On Train Status */}
              {isOnTrain && destination && distanceToDest !== null && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-orange-500/10 border border-orange-500/20 rounded-[2.5rem] p-6 shadow-xl shadow-orange-500/5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-orange-500 p-2.5 rounded-2xl shadow-lg shadow-orange-500/20 ring-4 ring-orange-500/10">
                        <TrainIcon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">On Train</p>
                        </div>
                        <h4 className="text-white font-black italic tracking-tighter">Heading to {destination.name}</h4>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-orange-500 tabular-nums tracking-tighter">{distanceToDest.toFixed(1)} km</p>
                      <p className="text-[8px] font-black text-neutral-500 uppercase tracking-widest">To Destination</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(5, Math.min(100, (1 - (distanceToDest / 100)) * 100))}%` }} 
                        className="h-full bg-gradient-to-r from-orange-600 to-orange-400"
                      />
                    </div>
                    <div className="flex justify-between items-center px-1">
                      <p className="text-[7px] font-black text-neutral-600 uppercase tracking-widest">Departure</p>
                      <p className="text-[7px] font-black text-neutral-400 uppercase tracking-widest">Arriving Soon</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {pings.length === 0 ? (
                <div className="bg-neutral-900/30 border-2 border-dashed border-neutral-800 rounded-[2rem] p-10 text-center space-y-4">
                  <div className="w-16 h-16 bg-neutral-900 border border-neutral-800 rounded-full flex items-center justify-center mx-auto ring-4 ring-orange-500/5">
                    <Search className="w-8 h-8 text-neutral-600" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-neutral-500 text-sm font-bold">Waiting for reports...</p>
                    <p className="text-neutral-700 text-[10px] uppercase font-black tracking-widest">Share info to help others!</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {pings.map((ping) => (
                    <motion.div 
                      layout
                      key={ping.id} 
                      className="bg-neutral-900/60 border border-neutral-800 p-5 rounded-3xl flex items-center justify-between group hover:border-orange-500 transition-all shadow-xl"
                    >
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-4xl font-black text-orange-500 tabular-nums">PF {ping.platform}</span>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 bg-green-500/10 text-green-500 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-green-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Live
                            </div>
                            {trainStatus && (
                              <div className="flex flex-col items-start gap-1">
                                <div className="flex items-center gap-2">
                                  <div className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border border-white/5 shadow-lg shadow-black/20",
                                    trainStatus.bg,
                                    trainStatus.color
                                  )}>
                                    <trainStatus.icon className="w-3 h-3" />
                                    {trainStatus.label}
                                  </div>
                                  {isOnTrain && (
                                    <div className="flex items-center gap-1 bg-orange-500 text-white px-2 py-1 rounded-lg text-[7px] font-black uppercase tracking-widest shadow-lg shadow-orange-500/20 animate-pulse">
                                      <TrainIcon className="w-2.5 h-2.5" /> On Train
                                    </div>
                                  )}
                                </div>
                                {topReason && avgDelay > 0 && (
                                  <p className="text-[7px] font-black text-white/40 uppercase tracking-widest pl-1">
                                    Reason: {topReason}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="text-neutral-500 text-[10px] font-bold mt-2 flex items-center gap-1.5">
                          <UserIcon className="w-3 h-3" /> {ping.confirmedBy.length} passengers confirmed
                        </p>
                      </div>
                      <button 
                        onClick={() => handleConfirmPing(ping.id!, ping.confirmedBy)}
                        disabled={ping.confirmedBy.includes(user?.uid || '') || !user}
                        className={cn(
                          "px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg",
                          ping.confirmedBy.includes(user?.uid || '') 
                            ? "bg-neutral-800/50 text-neutral-600 border border-neutral-800" 
                            : "bg-white text-black hover:scale-105 active:scale-95 shadow-white/5"
                        )}
                      >
                        {ping.confirmedBy.includes(user?.uid || '') ? 'Confirmed' : 'Confirm'}
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}

              <div className="space-y-4 pt-6">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-500 text-center">Contribute Report</p>
                
                {platformSuggestions.length > 0 && user && (
                  <div className="flex flex-col items-center gap-3 bg-neutral-900/40 p-4 rounded-3xl border border-neutral-800/50">
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-orange-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                      Suggested Platforms
                    </div>
                    <div className="flex gap-2">
                      {platformSuggestions.map(pf => (
                        <button
                          key={pf}
                          onClick={() => handleReportPlatform(pf)}
                          className="px-4 py-2 bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-xl text-xs font-black hover:bg-orange-500/20 transition-all"
                        >
                          PF {pf}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!user ? (
                  <div className="bg-orange-500/5 border border-orange-500/20 rounded-[2rem] p-8 text-center space-y-4">
                    <p className="text-xs text-orange-200/60 font-bold italic">Sign in to report live platform updates for {selectedStation?.name}</p>
                    <button 
                      onClick={handleLogin}
                      className="bg-orange-500 text-white px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20"
                    >
                      Login with Google
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-3">
                    {['1', '2', '3', '4'].map((num) => (
                      <button
                        key={num}
                        onClick={() => handleReportPlatform(num)}
                        className="aspect-square bg-neutral-900/60 border border-neutral-800 rounded-3xl flex flex-col items-center justify-center gap-1 hover:border-orange-500 transition-all group shadow-inner"
                      >
                        <span className="text-neutral-600 text-[9px] uppercase font-black group-hover:text-orange-500 transition-colors">PF</span>
                        <span className="text-2xl font-black">{num}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'coach' && (
            <motion.div 
              key="coach"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-black uppercase tracking-widest underline decoration-orange-500 decoration-2 underline-offset-4">Coach Position</h3>
                <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3 py-1 rounded-full">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span>
                  <span className="text-[9px] font-black text-neutral-400 uppercase">Engine Front</span>
                </div>
              </div>

              <div className="relative pl-10 border-l-[3px] border-neutral-800 py-6 space-y-4">
                {selectedTrain?.coaches.map((coach, idx) => {
                  const info = getCoachInfo(coach);
                  const Icon = info.icon;
                  const coachReports = availability.filter(a => a.coachId === coach);
                  const latestReport = coachReports[0];
                  
                  const statusInfo = {
                    empty: { label: 'Plenty of Seats', color: 'text-green-400', progress: 20, bg: 'bg-green-500/20' },
                    moderate: { label: 'Moderate Crowd', color: 'text-yellow-400', progress: 60, bg: 'bg-yellow-500/20' },
                    full: { label: 'Standing Room Only', color: 'text-red-400', progress: 95, bg: 'bg-red-500/20' }
                  }[latestReport?.status || 'moderate'];

                  const timeAgo = latestReport?.createdAt?.seconds 
                    ? Math.round((Date.now() / 1000 - latestReport.createdAt.seconds) / 60)
                    : null;

                  return (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      key={idx} 
                      className="relative flex flex-col gap-3"
                    >
                      <div className="relative flex items-center gap-4">
                        <div className="absolute -left-[54px] w-7 h-7 bg-[#050505] border-2 border-neutral-800 rounded-full flex items-center justify-center text-[10px] font-black text-neutral-500 shadow-xl">
                          {idx + 1}
                        </div>
                        <div className={cn(
                          "flex-1 p-5 rounded-[1.5rem] border flex items-center justify-between shadow-2xl transition-all",
                          info.bg,
                          info.border
                        )}>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-lg font-black tracking-tighter opacity-90",
                                info.color
                              )}>{info.name}</span>
                            </div>
                            <div className="space-y-1.5 mt-2">
                              <div className="flex items-center justify-between gap-4">
                                <p className={cn("text-[9px] font-black uppercase tracking-widest", latestReport ? statusInfo.color : "text-neutral-500")}>
                                  {latestReport ? statusInfo.label : 'No recent reports'}
                                </p>
                                {timeAgo !== null && (
                                  <span className="text-[7px] font-bold text-neutral-600 uppercase">
                                    {timeAgo === 0 ? 'Just now' : `${timeAgo}m ago`}
                                  </span>
                                )}
                              </div>
                              <div className="h-1 w-32 bg-white/5 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: latestReport ? `${statusInfo.progress}%` : '0%' }}
                                  className={cn("h-full transition-all", latestReport ? statusInfo.bg : "bg-neutral-800")}
                                />
                              </div>
                            </div>
                          </div>
                          <div className={cn(
                            "p-2 rounded-xl border transition-all",
                            "bg-black/20 border-white/5"
                          )}>
                            <Icon 
                              className={cn("w-4 h-4", info.color)} 
                              style={info.iconRotate ? { transform: `rotate(${info.iconRotate}deg)` } : {}}
                            />
                          </div>
                        </div>
                      </div>
                      
                      {/* Availability Reporting */}
                      <div className="flex gap-2 ml-4">
                        {['empty', 'moderate', 'full'].map((status) => (
                          <button
                            key={status}
                            onClick={() => handleReportAvailability(coach, status as any)}
                            className={cn(
                              "text-[8px] px-3 py-1.5 rounded-full border transition-all font-black uppercase tracking-widest",
                              latestReport?.status === status 
                                ? "bg-white text-black border-white" 
                                : "bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-700"
                            )}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === 'map' && (
            <motion.div 
              key="map"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6 h-[70vh] relative rounded-[3rem] overflow-hidden border border-neutral-800 shadow-2xl"
            >
              <Map
                defaultCenter={{ lat: 12.9777, lng: 77.5726 }}
                defaultZoom={8}
                mapId="RAILU_BUDDY_MAP"
                disableDefaultUI={true}
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                style={{ width: '100%', height: '100%' }}
                colorScheme="DARK"
              >
                {selectedTrain && (
                  <>
                    <RoutePolyline stations={selectedTrain.route.map(id => STATIONS.find(s => s.id === id)!).filter(Boolean)} />
                    {selectedTrain.route.map(stationId => {
                      const station = STATIONS.find(s => s.id === stationId);
                      if (!station) return null;
                      return (
                        <React.Fragment key={stationId}>
                          <AdvancedMarker 
                            position={{ lat: station.latitude, lng: station.longitude }} 
                            title={station.name}
                            onClick={() => setOpenInfoWindow(stationId)}
                          >
                            <div className="flex flex-col items-center group">
                              <div className="w-3 h-3 bg-neutral-950 border-2 border-orange-500 rounded-full group-hover:scale-150 transition-transform shadow-lg shadow-orange-500/20" />
                              <div className="mt-1 overflow-hidden">
                                <span className="block bg-neutral-900/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[7px] font-black tracking-tighter text-orange-200 border border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {station.name}
                                </span>
                              </div>
                            </div>
                          </AdvancedMarker>
                          {openInfoWindow === stationId && (
                            <InfoWindow 
                              position={{ lat: station.latitude, lng: station.longitude }}
                              onCloseClick={() => setOpenInfoWindow(null)}
                            >
                              <div className="p-1 min-w-[100px]">
                                <p className="text-[10px] font-black uppercase tracking-widest text-orange-600 mb-0.5">Station</p>
                                <h4 className="text-sm font-black tracking-tight text-neutral-900">{station.name}</h4>
                                <p className="text-[9px] font-bold text-neutral-500 italic">Code: {station.id}</p>
                              </div>
                            </InfoWindow>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {livePosition ? (
                      <React.Fragment>
                        <AdvancedMarker 
                          position={livePosition} 
                          zIndex={100}
                          onClick={() => setOpenInfoWindow('train')}
                        >
                          <div className="bg-orange-500 p-2 rounded-full shadow-2xl shadow-orange-500/50 ring-4 ring-orange-500/20">
                            <TrainIcon className="w-4 h-4 text-white" />
                          </div>
                        </AdvancedMarker>
                        {openInfoWindow === 'train' && (
                          <InfoWindow 
                            position={livePosition}
                            onCloseClick={() => setOpenInfoWindow(null)}
                          >
                            <div className="p-1 min-w-[150px]">
                              <p className="text-[10px] font-black uppercase tracking-widest text-orange-600 mb-0.5">Live Train Status</p>
                              <h4 className="text-sm font-black tracking-tight text-neutral-900">{selectedTrain.name}</h4>
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full uppercase", trainStatus?.bg, trainStatus?.color)}>
                                  {trainStatus?.label}
                                </span>
                              </div>
                              <p className="text-[9px] font-bold text-neutral-500 mt-2 italic">Last reported via crowdsourced coordinates</p>
                            </div>
                          </InfoWindow>
                        )}
                      </React.Fragment>
                    ) : trainLocation && (
                      <React.Fragment>
                        <AdvancedMarker 
                          position={{ lat: trainLocation.latitude, lng: trainLocation.longitude }} 
                          zIndex={100}
                          onClick={() => setOpenInfoWindow('train')}
                        >
                          <div className="bg-orange-500 p-2 rounded-full shadow-2xl shadow-orange-500/50 ring-4 ring-orange-500/30">
                            <TrainIcon className="w-4 h-4 text-white" />
                          </div>
                        </AdvancedMarker>
                        {openInfoWindow === 'train' && (
                          <InfoWindow 
                            position={{ lat: trainLocation.latitude, lng: trainLocation.longitude }}
                            onCloseClick={() => setOpenInfoWindow(null)}
                          >
                            <div className="p-1 min-w-[150px]">
                              <p className="text-[10px] font-black uppercase tracking-widest text-orange-600 mb-0.5">Train Tracker</p>
                              <h4 className="text-sm font-black tracking-tight text-neutral-900">{selectedTrain.name}</h4>
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full uppercase", trainStatus?.bg, trainStatus?.color)}>
                                  {trainStatus?.label}
                                </span>
                              </div>
                              <p className="text-[9px] font-bold text-neutral-500 mt-2 italic">At: {trainLocation.name}</p>
                            </div>
                          </InfoWindow>
                        )}
                      </React.Fragment>
                    )}
                  </>
                )}
                
                {currentLocation && (
                  <React.Fragment>
                    <AdvancedMarker 
                      position={currentLocation} 
                      zIndex={101}
                      onClick={() => setOpenInfoWindow('user')}
                    >
                      <div className="relative">
                        <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-50" />
                        <div className="relative bg-white p-1 rounded-full border-2 border-blue-500 shadow-lg">
                          <UserIcon className="w-3 h-3 text-blue-500" />
                        </div>
                      </div>
                    </AdvancedMarker>
                    {openInfoWindow === 'user' && (
                      <InfoWindow 
                        position={currentLocation}
                        onCloseClick={() => setOpenInfoWindow(null)}
                      >
                        <div className="p-1 min-w-[120px]">
                          <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-0.5">Me</p>
                          <h4 className="text-sm font-black tracking-tight text-neutral-900">Your Location</h4>
                          <p className="text-[8px] font-bold text-neutral-400 mt-1 tabular-nums text-center">
                            {currentLocation.lat.toFixed(5)}, {currentLocation.lng.toFixed(5)}
                          </p>
                        </div>
                      </InfoWindow>
                    )}
                    {/* Other anonymous users */}
                    {publicUserPositions.map((pos) => (
                      <AdvancedMarker 
                        key={pos.id}
                        position={{ lat: pos.latitude, lng: pos.longitude }}
                      >
                        <div className="p-1 bg-neutral-900/60 rounded-full border border-white/20 shadow-lg backdrop-blur-sm">
                          <UserIcon className="w-2.5 h-2.5 text-neutral-400" />
                        </div>
                      </AdvancedMarker>
                    ))}
                  </React.Fragment>
                )}
              </Map>
              
              {/* Floating info card */}
              <div className="absolute top-6 left-6 right-6 space-y-3">
                <div className="bg-neutral-900/80 backdrop-blur-xl border border-white/10 p-4 rounded-3xl shadow-2xl flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="text-xs font-black italic tracking-tighter text-white">{selectedTrain?.name}</h4>
                    <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500">Live Simulation Route</p>
                  </div>
                  <div className="flex -space-x-2">
                    {selectedTrain?.route.map(id => (
                      <div key={id} className="w-6 h-6 rounded-full bg-neutral-800 border-2 border-neutral-900 flex items-center justify-center text-[7px] font-bold text-neutral-500 uppercase">
                        {id.substring(0, 2)}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Anonymous Sharing Toggle */}
                <div className="bg-neutral-900/80 backdrop-blur-xl border border-white/10 p-3 rounded-2xl shadow-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className={cn("w-3.5 h-3.5", shareLocation ? "text-blue-500" : "text-neutral-500")} />
                    <span className="text-[9px] font-black uppercase tracking-widest text-neutral-300">
                      Share location anonymously
                    </span>
                  </div>
                  <button 
                    onClick={() => setShareLocation(!shareLocation)}
                    className={cn(
                      "w-10 h-5 rounded-full p-1 transition-all relative",
                      shareLocation ? "bg-blue-600" : "bg-neutral-800"
                    )}
                  >
                    <motion.div 
                      animate={{ x: shareLocation ? 20 : 0 }}
                      className="bg-white w-3 h-3 rounded-full shadow-md"
                    />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'alarm' && (
            <motion.div 
              key="alarm"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <h3 className="text-sm font-black uppercase tracking-widest underline decoration-orange-500 decoration-2 underline-offset-4 px-1">Wake-up Alarm</h3>

              <div className="bg-neutral-900/60 p-8 rounded-[2.5rem] border border-neutral-800 shadow-2xl space-y-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-500 ml-1">Destination</label>
                  <div className="relative">
                    <select 
                      value={destination?.id || ''}
                      onChange={(e) => setDestination(STATIONS.find(s => s.id === e.target.value) || null)}
                      className="w-full bg-black border-2 border-neutral-800 rounded-3xl py-5 px-6 appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all font-black text-xl text-white shadow-inner"
                    >
                      <option value="">Select Station</option>
                      {STATIONS.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
                    </select>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                      <ChevronRight className="w-6 h-6 rotate-90" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-black/60 p-6 rounded-[2rem] border border-neutral-800/50">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "p-3 rounded-2xl transition-all shadow-lg", 
                      alarmActive ? "bg-orange-500 shadow-orange-500/20" : "bg-neutral-800 border border-neutral-700"
                    )}>
                      <Bell className={cn("w-6 h-6", alarmActive ? "text-white animate-bounce" : "text-neutral-500")} />
                    </div>
                    <div>
                      <p className="font-black text-neutral-100 italic">Auto-Alarm</p>
                      <p className="text-[9px] text-neutral-500 font-black uppercase tracking-widest">Triggers at 5.0 km</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setAlarmActive(!alarmActive)}
                    className={cn(
                      "w-14 h-7 rounded-full p-1 transition-all relative ring-2 ring-neutral-800",
                      alarmActive ? "bg-orange-500" : "bg-neutral-900"
                    )}
                  >
                    <motion.div 
                      animate={{ x: alarmActive ? 28 : 0 }}
                      className="bg-white w-5 h-5 rounded-full shadow-2xl"
                    />
                  </button>
                </div>

                {alarmActive && distanceToDest !== null && (
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-center space-y-2 py-6 bg-orange-500/5 rounded-3xl border border-orange-500/10"
                  >
                    <p className="text-7xl font-black tabular-nums tracking-tighter text-orange-500 drop-shadow-2xl">{distanceToDest.toFixed(1)}</p>
                    <p className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.6em]">KM Remaining</p>
                  </motion.div>
                )}
              </div>

              <div className="bg-orange-500/10 border border-orange-500/20 rounded-[1.5rem] p-5 flex gap-4">
                <div className="shrink-0 mt-0.5">
                  <Info className="w-5 h-5 text-orange-400" />
                </div>
                <p className="text-[11px] text-orange-200/80 leading-relaxed font-bold">
                  We use your device GPS for precision. Keep the app open for the best experience. Vibration will trigger within the 5km radius.
                </p>
              </div>
            </motion.div>
          )}

          {activeTab === 'schedule' && (
            <motion.div 
              key="schedule"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-black uppercase tracking-widest underline decoration-orange-500 decoration-2 underline-offset-4">Full Timetable</h3>
                <div className="bg-neutral-900 border border-neutral-800 px-3 py-1 rounded-full text-[9px] font-black text-neutral-400 uppercase tracking-tighter">
                  {selectedTrain?.number} {selectedTrain?.name}
                </div>
              </div>

              <div className="bg-neutral-900/40 border border-neutral-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
                <div className="grid grid-cols-12 bg-black/40 border-b border-neutral-800 p-4">
                  <div className="col-span-6 text-[9px] font-black uppercase tracking-widest text-neutral-500">Station</div>
                  <div className="col-span-3 text-center text-[9px] font-black uppercase tracking-widest text-neutral-500">Arr.</div>
                  <div className="col-span-3 text-center text-[9px] font-black uppercase tracking-widest text-neutral-500">Dep.</div>
                </div>
                <div className="divide-y divide-neutral-800/50">
                  {selectedTrain?.schedule.map((item, idx) => {
                    const station = STATIONS.find(s => s.id === item.stationId);
                    const isCurrent = trainLocation?.id === item.stationId;
                    const isSelected = selectedStation?.id === item.stationId;
                    
                    return (
                      <div 
                        key={idx} 
                        className={cn(
                          "grid grid-cols-12 p-4 items-center transition-colors",
                          isCurrent ? "bg-orange-500/5" : isSelected ? "bg-white/5" : ""
                        )}
                      >
                        <div className="col-span-6 flex items-center gap-3">
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            isCurrent ? "bg-orange-500 animate-pulse" : "bg-neutral-800"
                          )} />
                          <div>
                            <p className={cn("text-[11px] font-black tracking-tight", isCurrent ? "text-orange-500" : "text-white")}>
                              {station?.name}
                            </p>
                            <p className="text-[8px] font-bold text-neutral-500 uppercase">{item.stationId}</p>
                          </div>
                        </div>
                        <div className="col-span-3 text-center">
                          <span className={cn(
                            "text-[11px] font-black tabular-nums tracking-tighter",
                            item.arrival === 'Starts' ? "text-neutral-600 italic" : "text-neutral-300"
                          )}>
                            {item.arrival}
                          </span>
                        </div>
                        <div className="col-span-3 text-center">
                          <span className={cn(
                            "text-[11px] font-black tabular-nums tracking-tighter",
                            item.departure === 'Ends' ? "text-neutral-600 italic" : "text-neutral-300"
                          )}>
                            {item.departure}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="text-center">
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-neutral-600">All times are in 24-hour format</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Nav Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#050505]/90 backdrop-blur-3xl border-t border-neutral-900 px-6 pt-4 pb-10 z-[100]">
        <div className="max-w-md mx-auto flex items-center justify-around">
          <NavButton 
            active={activeTab === 'pings'} 
            onClick={() => setActiveTab('pings')}
            icon={<Wifi />}
            label="Live"
          />
          <NavButton 
            active={activeTab === 'coach'} 
            onClick={() => setActiveTab('coach')}
            icon={<LayoutList />}
            label="Coach"
          />
          <NavButton 
            active={activeTab === 'map'} 
            onClick={() => setActiveTab('map')}
            icon={<MapIcon />}
            label="Map"
          />
          <NavButton 
            active={activeTab === 'schedule'} 
            onClick={() => setActiveTab('schedule')}
            icon={<Calendar />}
            label="Schedule"
          />
          <NavButton 
            active={activeTab === 'alarm'} 
            onClick={() => setActiveTab('alarm')}
            icon={<Bell />}
            label="Alarm"
          />
        </div>
      </nav>
    </div>
    </APIProvider>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 transition-all relative px-6 group",
        active ? "text-orange-500" : "text-neutral-600 hover:text-neutral-400"
      )}
    >
      <div className={cn("transition-transform duration-500 ease-out", active && "-translate-y-1 scale-125")}>
        {React.cloneElement(icon as React.ReactElement, { className: cn("w-6 h-6 transition-all", active ? "drop-shadow-[0_0_10px_rgba(249,115,22,0.4)]" : "opacity-60") })}
      </div>
      <span className={cn("text-[9px] font-black uppercase tracking-[0.2em] transition-all", active ? "opacity-100" : "opacity-0")}>{label}</span>
      {active && (
        <motion.div 
          layoutId="activeIndicator"
          className="absolute -bottom-8 w-1 h-1 bg-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,1)]"
        />
      )}
    </button>
  );
}
