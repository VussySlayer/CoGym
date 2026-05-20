/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  Users, 
  Settings, 
  Search, 
  Bell, 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  MapPin,
  Clock,
  Dumbbell,
  LogOut,
  User as UserIcon,
  Check,
  TrendingUp,
  TrendingDown,
  Minus,
  Apple,
  BookOpen,
  Share2,
  RefreshCw
} from 'lucide-react';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  eachDayOfInterval,
  startOfDay,
  parseISO,
  isWithinInterval,
  addHours,
  setHours,
  setMinutes
} from 'date-fns';
import { 
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, doc, getDocs, onSnapshot, query, where, Timestamp, orderBy, arrayUnion, arrayRemove, getDoc, deleteField, setDoc, deleteDoc, limit } from 'firebase/firestore';
import { nanoid } from 'nanoid';

// --- TYPES ---
export interface User {
  uid: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  role?: 'admin' | 'user';
  code?: string;
}

export interface WorkoutSession {
  id: string;
  title: string;
  description: string;
  creatorId: string;
  creatorName: string;
  creatorPhoto?: string;
  startTime: Date;
  endTime: Date;
  location: string;
  bodyParts: BodyPart[];
  participants: string[];
  participantFocus?: Record<string, string>;
  participantNames?: Record<string, string>;
  comments?: { id: string; userId: string; userName: string; text: string; timestamp: string }[];
  capacity: number;
  color: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface WorkoutTemplate {
  id: string;
  userId: string;
  title: string;
  description: string;
  location: string;
  bodyParts: BodyPart[];
  capacity: number;
  color: string;
}

export interface WeightEntry {
  id: string;
  userId: string;
  value: number;
  unit: 'kg' | 'lbs';
  date: Date;
  note?: string;
}

export type BodyPart = 'Upper Body' | 'Lower Body' | 'Full Body' | 'Core' | 'Cardio' | 'Legs' | 'Back' | 'Chest' | 'Shoulders' | 'Arms';
// ... existing BODY_PARTS and WORKOUT_COLORS ...

export const BODY_PARTS: BodyPart[] = [
  'Upper Body', 'Lower Body', 'Full Body', 'Core', 'Cardio', 'Legs', 'Back', 'Chest', 'Shoulders', 'Arms'
];

export const WORKOUT_COLORS = {
  'Upper Body': '#3B82F6', // Blue
  'Lower Body': '#10B981', // Green
  'Full Body': '#8B5CF6', // Purple
  'Core': '#F59E0B',      // Orange
  'Cardio': '#EF4444',    // Red
};

// --- FIREBASE CONFIG & HELPERS ---
const dummyConfig = {
  apiKey: "dummy-key",
  authDomain: "dummy.firebaseapp.com",
  projectId: "dummy-project",
  storageBucket: "dummy.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

// We use a shared observable-like pattern for Firebase state
let firebaseInstance: { app: any, auth: any, db: any, googleProvider: any } = {
  app: null,
  auth: null as any,
  db: null as any,
  googleProvider: null as any
};

function initializeFirebase(config: any, appName?: string) {
  try {
    const isDummy = config.apiKey === 'dummy-key' || config.apiKey === 'dummy-api-key';
    const app = initializeApp(config, appName);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const googleProvider = new GoogleAuthProvider();
    
    return { app, auth, db, googleProvider, isDummy };
  } catch (e) {
    console.warn("Firebase initialization failed:", e);
    return null;
  }
}

const initialResult = initializeFirebase(dummyConfig);
if (initialResult) {
  firebaseInstance = initialResult;
}

// Global exports for legacy support (though we should use the hook)
export let app = firebaseInstance.app;
export let auth = firebaseInstance.auth;
export let db = firebaseInstance.db;
export let googleProvider = firebaseInstance.googleProvider;

const firebaseListeners: Set<(state: any) => void> = new Set();

export function useFirebase() {
  const [state, setState] = useState(firebaseInstance);
  useEffect(() => {
    firebaseListeners.add(setState);
    return () => { firebaseListeners.delete(setState); };
  }, []);
  return state;
}

async function loadConfig() {
  try {
    // @ts-ignore
    const config = await import('../firebase-applet-config.json').catch(() => null);
    if (config && config.apiKey && !config.apiKey.includes('dummy')) {
      const realConfig = config.default || config;
      const result = initializeFirebase(realConfig, "app-real");
      if (result) {
        firebaseInstance = result;
        // Update global exports
        app = firebaseInstance.app;
        auth = firebaseInstance.auth;
        db = firebaseInstance.db;
        googleProvider = firebaseInstance.googleProvider;
        
        firebaseListeners.forEach(listener => listener(firebaseInstance));
        console.log("Real Firebase config loaded successfully.");
      }
    }
  } catch (e) {
    console.warn("Error loading config:", e);
  }
}

loadConfig();

export const signInWithGoogle = () => firebaseInstance.auth ? signInWithPopup(firebaseInstance.auth, firebaseInstance.googleProvider) : Promise.reject("Auth not initialized");
export const logOut = () => firebaseInstance.auth ? signOut(firebaseInstance.auth) : Promise.resolve();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const ANYTIME_FITNESS_LOCATIONS: Record<string, string[]> = {
  "Makati": ["AF Glorietta", "AF Rockwell", "AF Salcedo", "AF Legaspi Village", "AF Chino Roces", "AF JP Rizal"],
  "Taguig / BGC": ["AF High Street", "AF Uptown Mall", "AF Forbes Town", "AF SM Aura", "AF Burgos Circle", "AF McKinley Hill"],
  "Quezon City": ["AF North Ave", "AF Eastwood", "AF Katipunan", "AF Fisher Mall", "AF Banawe", "AF SM North EDSA", "AF Regis Center"],
  "Pasig": ["AF Capitol Commons", "AF Ortigas", "AF Ayala Malls The 30th", "AF Estancia"],
  "Mandaluyong": ["AF Greenfield District", "AF SM Megamall", "AF Shangri-La", "AF Pioneer"],
  "San Juan": ["AF Greenhills", "AF Santolan Town Plaza"],
  "Manila": ["AF Taft", "AF SM San Lazaro", "AF Robinsons Otis", "AF Malate"],
  "Pasay": ["AF Mall of Asia", "AF Newport City", "AF Double Dragon"],
  "Parañaque": ["AF BF Homes", "AF Better Living", "AF Sucat"],
  "Las Piñas": ["AF Alabang Zapote", "AF SM Southmall"],
  "Muntinlupa": ["AF Alabang Town Center", "AF Westgate", "AF Filinvest"]
};

// --- APP COMPONENT ---
export default function App() {
  const { auth, db } = useFirebase();
  const [user, setUser] = useState<any>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [sessions, setSessions] = useState<WorkoutSession[]>(() => {
    try {
      const storedV2 = localStorage.getItem('flexsync_sessions_v2');
      if (storedV2) {
        return JSON.parse(storedV2)
          .map((s: any) => ({
            ...s,
            title: s.title || 'Untitled Session',
            startTime: new Date(s.startTime),
            endTime: new Date(s.endTime)
          }))
          .filter((s: any) => !isNaN(s.startTime.getTime()));
      }
      const storedV1 = localStorage.getItem('flexsync_sessions');
      if (storedV1) {
        return JSON.parse(storedV1)
          .map((s: any) => ({
            ...s,
            title: s.title || 'Untitled Session',
            startTime: new Date(s.startTime),
            endTime: new Date(s.endTime)
          }))
          .filter((s: any) => !isNaN(s.startTime.getTime()));
      }
      return [];
    } catch { return []; }
  });
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>(() => {
    try {
      const storedV2 = localStorage.getItem('flexsync_weights_v2');
      if (storedV2) {
        return JSON.parse(storedV2).map((w: any) => ({ ...w, date: new Date(w.date) }));
      }
      const storedV1 = localStorage.getItem('flexsync_weights');
      if (storedV1) {
        return JSON.parse(storedV1).map((w: any) => ({ ...w, date: new Date(w.date) }));
      }
      return [];
    } catch { return []; }
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeView, setActiveView] = useState<'Weight' | 'Calendar' | 'Settings' | 'Nutrition' | 'Research' | 'Accounts'>('Calendar');
  const [calendarSubView, setCalendarSubView] = useState<'Month' | 'Week' | 'Day'>('Month');
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const [isManualLocation, setIsManualLocation] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [gasUrl, setGasUrl] = useState<string>(localStorage.getItem('flexsync_gas_url_v2') || 'https://script.google.com/macros/s/AKfycbx9Cig5omc0GlZ3aoXQ4rpyxrDKTXQ3nouJMSSUY2h8-IlQjcQEZZ3b4L_mzCxXLZv0/exec');
  const [isGasActive, setIsGasActive] = useState(!!gasUrl);
  const [useGoogleSheets, setUseGoogleSheets] = useState<boolean>(localStorage.getItem('flexsync_use_gsheets_v2') !== 'false');

  useEffect(() => {
    localStorage.setItem('flexsync_use_gsheets_v2', String(useGoogleSheets));
  }, [useGoogleSheets]);

  const handleGasAction = async (action: string, data: any) => {
    if (!gasUrl) return { success: false, message: 'Google Sheet Sync not configured' };
    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors', // Standard for GAS Web App proxy, though result will be opaque
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, data }),
      });
      // Note: GAS CORS with 'no-cors' means we can't read the response directly if it's cross-origin
      // without proper CORS setup. To get responses, we usually use JSONP or a slightly different setup.
      // But for simple "log and forget" it works. 
      // Better way: The user publishes GAS as 'Anyone', and we use simple fetch (non-opaque if possible)
      
      // Let's assume a transparent fetch if the user set it up right
      const resp = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // GAS prefers this for CORS sometimes
        body: JSON.stringify({ action, data }),
      });
      return await resp.json();
    } catch (e) {
      console.warn("GAS Sync failed:", e);
      return { success: false, message: 'Sync connection failed' };
    }
  };

  // New session state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location: '',
    bodyParts: [] as BodyPart[],
    startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    hours: 1,
    capacity: 50, // High default since user wants to remove the limit input
    saveAsTemplate: false
  });
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth || !db) return;
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        // Real Firebase Auth user (could be Google or Anonymous)
        const adminDoc = await getDoc(doc(db, 'admins', u.uid));
        
        let userData: any = {};
        if (u.isAnonymous) {
          const q = query(collection(db, 'users'), where('uid', '==', u.uid), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) userData = snap.docs[0].data();
        } else {
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists()) userData = userDoc.data();
        }
        
        const isAdminUser = adminDoc.exists() || u.email === 'qamalco@gmail.com' || userData.role === 'admin';
        
        const enhancedUser = {
          uid: u.uid,
          displayName: userData.displayName || u.displayName || 'Athlete',
          email: u.email || undefined,
          photoURL: u.photoURL || undefined,
          role: isAdminUser ? 'admin' : (userData.role || 'user'),
          ...userData
        };

        setUser(enhancedUser);
        setIsAdmin(isAdminUser);
        
        if (isAdminUser && !adminDoc.exists()) {
          await setDoc(doc(db, 'admins', u.uid), { userId: u.uid });
        }
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);  const fetchCloud = useCallback(async (isManual = false) => {
    const isFirebaseDummy = !db || db.app.options.apiKey.includes('dummy');
    const shouldHitGAS = (useGoogleSheets || isFirebaseDummy) && gasUrl;
    
    if (shouldHitGAS) {
      if (isManual) setIsSyncing(true);
      // Independent fetch for Sessions
      fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'getAllSessions', data: { userId: user?.uid } })
      }).then(r => r.json()).then(res => {
        if (res.success && res.data) {
          const gasDocs = res.data
            .filter((d: any) => d.id || d.title || d.startTime) // Skip truly empty rows
            .map((d: any, idx: number) => {
            const safeParse = (str: any, fallback: any) => {
              if (!str) return fallback;
              if (typeof str !== 'string') return str;
              try {
                return JSON.parse(str);
              } catch (e) {
                if (Array.isArray(fallback)) return str.split(',').map(v => v.trim()).filter(Boolean);
                return fallback;
              }
            };
            let sDateRaw = d.startTime || d.timestamp || d.createdAt;
            let sDate = null;
            if (sDateRaw) {
               sDate = new Date(sDateRaw);
               // Try to parse DD/MM/YYYY if standard parse fails
               if (isNaN(sDate.getTime()) && typeof sDateRaw === 'string') {
                  const parts = sDateRaw.split(/[-/]/);
                  if (parts.length === 3) {
                     // Try assuming DD/MM/YYYY
                     // Year is likely 4 digits
                     let y = parts[2], m = parts[1], day = parts[0];
                     if (parts[0].length === 4) { // YYYY/MM/DD or YYYY/DD/MM? Assume YYYY/MM/DD
                        y = parts[0]; m = parts[1]; day = parts[2];
                     }
                     sDate = new Date(`${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00`);
                  }
               }
            }
            
            // Do not fallback to "today". If invalid, we will filter it out below.
            if (sDate && isNaN(sDate.getTime())) {
               sDate = null;
            }
            
            // If still missing but has title, force to a default (e.g. today) so it doesn't get completely hidden
            if (!sDate && (d.title || d.id)) {
               sDate = new Date();
            }
            
            const sId = d.id || `gas_s_${sDate ? sDate.getTime() : Date.now()}_${d.creatorId || idx}`;
            return {
              ...d,
              id: sId,
              title: d.title || 'Untitled Session',
              participants: safeParse(d.participants, []),
              bodyParts: safeParse(d.bodyParts, []),
              participantNames: safeParse(d.participantNames, {}),
              participantFocus: safeParse(d.participantFocus, {}),
              comments: safeParse(d.comments, []),
              startTime: sDate,
              endTime: d.endTime ? new Date(d.endTime) : (sDate ? new Date(sDate.getTime() + 3600000) : null)
            }
          })
          .filter((d: any) => d.startTime !== null); // Drop true ghost sessions with no valid date
          setSessions(prev => {
            const combined = [...prev];
            gasDocs.forEach((d: any) => {
              const existingIdx = combined.findIndex(s => 
                s.id === d.id || 
                (Math.abs(s.startTime.getTime() - d.startTime.getTime()) < 300000 && s.creatorId === d.creatorId)
              );
              if (existingIdx === -1) {
                combined.push(d);
              } else {
                combined[existingIdx] = { ...combined[existingIdx], ...d };
              }
            });
            
            const filtered = combined.filter((s, idx, self) => {
              if (!s.id.startsWith('gas_temp_')) return true;
              const hasReal = self.some(r => !r.id.startsWith('gas_temp_') && Math.abs(r.startTime.getTime() - s.startTime.getTime()) < 300000 && r.creatorId === s.creatorId);
              return !hasReal;
            });

            const sorted = filtered.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
            localStorage.setItem('flexsync_sessions_v2', JSON.stringify(sorted));
            return sorted;
          });
        }
        if (isManual) setTimeout(() => setIsSyncing(false), 800);
      }).catch(e => {
          console.warn("GAS Session Fetch failed", e);
          if (isManual) setIsSyncing(false);
      });

      const searchIds = ['guest_user'];
      if (user?.uid) searchIds.push(user.uid);
      if (user?.email) searchIds.push(user.email);
      if (user?.displayName) searchIds.push(user.displayName);

      fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'getWeights', data: { userId: user?.uid || 'guest_user', searchIds } })
      }).then(r => r.json()).then(wRes => {
        if (wRes.success && wRes.data) {
          const wDocs = wRes.data.map((w: any, wIdx: number) => {
            const wDate = new Date(w.date || w.timestamp || new Date());
            return {
              id: w.id || `gas_w_${wDate.getTime()}_${wIdx}`,
              userId: w.userId || w.email || w.userName || 'guest_user',
              value: Number(w.weight || w.value),
              unit: w.unit || 'kg',
              date: wDate,
              note: w.note || ''
            };
          });
          setWeightEntries(prev => {
            const combined = [...prev];
            wDocs.forEach((d: any) => { 
              const dTime = d.date.getTime();
              const existingIdx = combined.findIndex(l => {
                  const lTime = l.date instanceof Date ? l.date.getTime() : new Date(l.date).getTime();
                  return l.id === d.id || (Math.abs(lTime - dTime) < 300000 && Math.abs(l.value - d.value) < 0.01);
              });
              
              if (existingIdx === -1) {
                  combined.push(d); 
              } else {
                  combined[existingIdx] = { ...combined[existingIdx], ...d };
              }
            });
            const result = combined.sort((a,b) => b.date.getTime() - a.date.getTime());
            localStorage.setItem('flexsync_weights_v2', JSON.stringify(result));
            return result;
          });
        }
      }).catch(e => console.warn("GAS Weight Fetch failed", e));
    }
  }, [db, useGoogleSheets, gasUrl, user?.uid, user?.email]);

  useEffect(() => {
    let pollInterval: any;

    const runSync = () => {
        const isFirebaseDummy = !db || db.app.options.apiKey.includes('dummy');
        if (useGoogleSheets || isFirebaseDummy) {
            fetchCloud();
        }
    };

    runSync();
    pollInterval = setInterval(runSync, 60000); // Sync every minute

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [fetchCloud, db, useGoogleSheets]); 
 

  useEffect(() => {
    if (!db || !authReady) return;
    
    let unsubscribeSessions = () => {};
    const isFirebaseDummy = !db || db.app.options.apiKey.includes('dummy');

    // Only listen to Firestore if NOT using Google Sheets as primary
    if (!useGoogleSheets && !isFirebaseDummy) {
        const q = query(collection(db, 'sessions'), orderBy('startTime', 'asc'));
        unsubscribeSessions = onSnapshot(q, (snapshot) => {
          const docs = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              ...data,
              id: doc.id,
              startTime: data.startTime instanceof Timestamp ? data.startTime.toDate() : new Date(data.startTime),
              endTime: data.endTime instanceof Timestamp ? data.endTime.toDate() : new Date(data.endTime),
            } as WorkoutSession;
          });
          setSessions(docs);
        }, (error) => console.error("Firestore read error:", error));
    }

    const fetchId = user?.uid || 'guest_user';
    const qTemp = query(collection(db, `users/${fetchId}/templates`));
    const unsubscribeTemp = onSnapshot(qTemp, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkoutTemplate));
      setTemplates(docs);
    });

    const qWeight = query(collection(db, `users/${fetchId}/weight_entries`), orderBy('date', 'desc'));
    const unsubscribeWeight = onSnapshot(qWeight, (snapshot) => {
        const docs = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date)
            } as WeightEntry;
        });
        
        if (!useGoogleSheets && !isFirebaseDummy) {
            setWeightEntries(prev => {
                const local = [...prev];
                docs.forEach(d => { 
                    const dTime = d.date.getTime();
                    const existingIdx = local.findIndex(l => {
                        const lTime = l.date instanceof Date ? l.date.getTime() : new Date(l.date).getTime();
                        return l.id === d.id || (Math.abs(lTime - dTime) < 300000 && Math.abs(l.value - d.value) < 0.01);
                    });
                    
                    if (existingIdx === -1) {
                        local.push(d); 
                    } else {
                        local[existingIdx] = { ...local[existingIdx], ...d };
                    }
                });
                const result = local.sort((a,b) => b.date.getTime() - a.date.getTime());
                localStorage.setItem('flexsync_weights_v3', JSON.stringify(result));
                return result;
            });
        }
    });

    return () => {
        unsubscribeSessions();
        unsubscribeTemp();
        unsubscribeWeight();
    };
  }, [user?.uid, db, useGoogleSheets, authReady]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const guestId = 'guest_user';
    const effectiveUserId = user?.uid || guestId;
    const effectiveUserName = user?.name || user?.displayName || user?.email?.split('@')[0] || 'Athlete';
    const effectiveUserPhoto = user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${effectiveUserId}`;

    try {
      const start = new Date(formData.startTime);
      const end = addHours(start, formData.hours);
      const color = formData.bodyParts.length > 0 
        ? (WORKOUT_COLORS[formData.bodyParts[0] as keyof typeof WORKOUT_COLORS] || '#3B82F6')
        : '#3B82F6';

      let sessionData: any = {
        title: formData.title,
        description: formData.description,
        location: formData.location,
        bodyParts: formData.bodyParts,
        capacity: formData.capacity,
        color,
        startTime: Timestamp.fromDate(start),
        endTime: Timestamp.fromDate(end),
        updatedAt: Timestamp.now()
      };

      if (!editingSessionId) {
        sessionData = {
          ...sessionData,
          creatorId: effectiveUserId,
          creatorName: effectiveUserName,
          creatorPhoto: effectiveUserPhoto,
          participants: [effectiveUserId],
          participantNames: { [effectiveUserId]: effectiveUserName },
          createdAt: Timestamp.now(),
        };
      }

      // Close modal immediately for better UX
      setIsModalOpen(false);

      const isFirebaseDummy = !db || db.app.options.apiKey.includes('dummy');
      const shouldHitGAS = (useGoogleSheets || isFirebaseDummy) && gasUrl;

      if (shouldHitGAS) {
          try {
              let existingSession = editingSessionId ? sessions.find(s => s.id === editingSessionId) : null;
              
              const mergedSessionData = {
                  ...(existingSession || {}),
                  ...sessionData,
              };

              const gasPayload = {
                  ...mergedSessionData,
                  participants: JSON.stringify(mergedSessionData.participants || []),
                  bodyParts: JSON.stringify(mergedSessionData.bodyParts || []),
                  participantNames: JSON.stringify(mergedSessionData.participantNames || {}),
                  participantFocus: JSON.stringify(mergedSessionData.participantFocus || {}),
                  comments: JSON.stringify(mergedSessionData.comments || []),
                  startTime: start.toISOString(),
                  endTime: end.toISOString(),
                  createdAt: existingSession?.createdAt || new Date().toISOString(),
                  updatedAt: new Date().toISOString()
              };
              if (editingSessionId) gasPayload.id = editingSessionId;

              // Optimistic update
              const optimisticSession = {
                  ...mergedSessionData,
                  startTime: start,
                  endTime: end,
                  id: editingSessionId || ('gas_temp_' + Date.now())
              };
              
              setSessions(prev => {
                  if (editingSessionId) {
                      return prev.map(s => s.id === editingSessionId ? optimisticSession as WorkoutSession : s);
                  } else {
                      return [...prev, optimisticSession as WorkoutSession];
                  }
              });

              fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: editingSessionId ? 'updateBooking' : 'logBooking', data: { sessionData: gasPayload } })
              }).catch(e => {
                  console.error("GAS logBooking/updateBooking failed", e);
              });
              
          } catch(e) {
              console.error("GAS logBooking/updateBooking failed", e);
          }
      } else {
          if (editingSessionId) {
             await updateDoc(doc(db, 'sessions', editingSessionId), sessionData);
          } else {
             await addDoc(collection(db, 'sessions'), sessionData);
          }
      }

      if (!editingSessionId && formData.saveAsTemplate && user) { // Only save templates for real users
        await addDoc(collection(db, `users/${user.uid}/templates`), {
          userId: user.uid,
          title: formData.title,
          description: formData.description,
          location: formData.location,
          bodyParts: formData.bodyParts,
          capacity: formData.capacity,
          color
        });
      }

      resetForm();
    } catch (error) {
      // Re-open modal if error occurs (optional, but keep for now)
      setIsModalOpen(true);
      handleFirestoreError(error, OperationType.WRITE, 'sessions');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      location: '',
      bodyParts: [],
      startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      hours: 1,
      capacity: 50,
      saveAsTemplate: false
    });
    setEditingSessionId(null);
  };

  const loadTemplate = (template: WorkoutTemplate) => {
    setFormData(prev => ({
      ...prev,
      title: template.title,
      description: template.description,
      location: template.location,
      bodyParts: template.bodyParts || [],
      capacity: template.capacity || 50,
    }));
  };

  const handleEditClick = (session: WorkoutSession) => {
    const diffTime = Math.abs(session.endTime.getTime() - session.startTime.getTime());
    const hours = Math.ceil(diffTime / (1000 * 60 * 60));
    setFormData({
      title: session.title,
      description: session.description,
      location: session.location,
      bodyParts: session.bodyParts || [],
      startTime: format(session.startTime, "yyyy-MM-dd'T'HH:mm"),
      hours: hours,
      capacity: session.capacity || 50,
      saveAsTemplate: false
    });
    setEditingSessionId(session.id);
    setIsModalOpen(true);
  };

  const handleDeleteSession = async (sessionId: string) => {    
    const isFirebaseDummy = !db || db.app.options.apiKey.includes('dummy');
    const shouldHitGAS = (useGoogleSheets || isFirebaseDummy) && gasUrl;

    if (shouldHitGAS) {
      // Optimistic delete
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      try {
        fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: 'deleteBooking', data: { sessionId } })
        }).catch(e => {
          console.error("GAS Delete Failed", e);
        });
      } catch (e) {
        console.error("GAS Delete Failed", e);
      }
      return;
    }

    try {
      await deleteDoc(doc(db, 'sessions', sessionId));
    } catch (error) {
      console.error(error);
      alert("Failed to delete the session.");
    }
  };

  const handleAddComment = async (session: WorkoutSession, text: string) => {
    if (!text.trim()) return;
    const effectiveUserId = user?.uid || 'guest_user';
    const effectiveUserName = user?.displayName || user?.email || 'Guest Athlete';
    
    const newComment = {
      id: nanoid(),
      userId: effectiveUserId,
      userName: effectiveUserName,
      text: text.trim(),
      timestamp: new Date().toISOString()
    };

    const isFirebaseDummy = !db || db.app.options.apiKey.includes('dummy');
    const shouldHitGAS = (useGoogleSheets || isFirebaseDummy) && gasUrl;

    if (shouldHitGAS) {
      const updatedSessionData = {
        ...session,
        comments: [...(session.comments || []), newComment]
      };
      
      setSessions(prev => prev.map(s => s.id === session.id ? { ...updatedSessionData, startTime: session.startTime, endTime: session.endTime } as WorkoutSession : s));

      try {
        const gasPayload = {
          ...updatedSessionData,
          participants: JSON.stringify(updatedSessionData.participants || []),
          bodyParts: JSON.stringify(updatedSessionData.bodyParts || []),
          participantNames: JSON.stringify(updatedSessionData.participantNames || {}),
          participantFocus: JSON.stringify(updatedSessionData.participantFocus || {}),
          comments: JSON.stringify(updatedSessionData.comments || []),
          startTime: session.startTime.toISOString(),
          endTime: session.endTime.toISOString(),
        };
        fetch(gasUrl, {
           method: 'POST',
           headers: { 'Content-Type': 'text/plain' },
           body: JSON.stringify({ action: 'updateBooking', data: { sessionData: gasPayload } })
        });
      } catch (e) {
        console.error("Failed to add comment via GAS", e);
      }
    } else {
      try {
        const sessionRef = doc(db, 'sessions', session.id);
        await updateDoc(sessionRef, {
          comments: arrayUnion(newComment),
          updatedAt: Timestamp.now()
        });
      } catch (e) {
        console.error("Failed to add comment via Firebase", e);
      }
    }
  };

  const toggleJoin = async (session: WorkoutSession, selectedBodyPart?: BodyPart) => {
    const effectiveUserId = user?.uid || 'guest_user';
    const effectiveUserName = user?.name || user?.displayName || user?.email?.split('@')[0] || 'Athlete';
    const currentParticipants = session.participants || [];
    const isJoined = currentParticipants.includes(effectiveUserId);
    
    const isFirebaseDummy = !db || db.app.options.apiKey.includes('dummy');
    const shouldHitGAS = (useGoogleSheets || isFirebaseDummy) && gasUrl;

    try {
      if (shouldHitGAS) {
        let updatedSessionData = { ...session };
        if (selectedBodyPart) {
          if (selectedBodyPart as any === 'CLEAR_ALL_FOCUS') {
             if (updatedSessionData.participantFocus && updatedSessionData.participantFocus[effectiveUserId]) {
                delete updatedSessionData.participantFocus[effectiveUserId];
             }
          } else if (!isJoined) {
            if (currentParticipants.length >= session.capacity) {
              alert("Session is full!");
              return;
            }
            updatedSessionData.participants = Array.from(new Set([...currentParticipants, effectiveUserId]));
            updatedSessionData.participantNames = {
               ...(session.participantNames || {}),
               [effectiveUserId]: effectiveUserName
            };
            updatedSessionData.participantFocus = {
               ...(session.participantFocus || {}),
               [effectiveUserId]: [selectedBodyPart]
            };
          } else {
            const currentFocus = (session.participantFocus?.[effectiveUserId] as unknown as string[]) || [];
            const newFocus = currentFocus.includes(selectedBodyPart)
              ? currentFocus.filter(f => f !== selectedBodyPart)
              : [...currentFocus, selectedBodyPart];
            updatedSessionData.participantFocus = {
               ...(session.participantFocus || {}),
               [effectiveUserId]: newFocus
            };
          }
        } else {
          if (isJoined) {
            updatedSessionData.participants = currentParticipants.filter(id => id !== effectiveUserId);
            if (updatedSessionData.participantFocus && updatedSessionData.participantFocus[effectiveUserId]) {
               delete updatedSessionData.participantFocus[effectiveUserId];
            }
            if (updatedSessionData.participantNames && updatedSessionData.participantNames[effectiveUserId]) {
               delete updatedSessionData.participantNames[effectiveUserId];
            }
          } else {
            if (currentParticipants.length >= session.capacity) {
              alert("Session is full!");
              return;
            }
            updatedSessionData.participants = Array.from(new Set([...currentParticipants, effectiveUserId]));
            updatedSessionData.participantNames = {
               ...(session.participantNames || {}),
               [effectiveUserId]: effectiveUserName
            };
          }
        }

        updatedSessionData.updatedAt = new Date().toISOString() as any;

        try {
           const gasPayload = {
               ...updatedSessionData,
               participants: JSON.stringify(updatedSessionData.participants || []),
               bodyParts: JSON.stringify(updatedSessionData.bodyParts || []),
               participantNames: JSON.stringify(updatedSessionData.participantNames || {}),
               participantFocus: JSON.stringify(updatedSessionData.participantFocus || {}),
               comments: JSON.stringify(updatedSessionData.comments || []),
               startTime: session.startTime.toISOString(),
               endTime: session.endTime.toISOString(),
               createdAt: typeof session.createdAt === 'string' ? session.createdAt : new Date().toISOString(),
               updatedAt: new Date().toISOString()
           };

           // Optimistic update
           setSessions(prev => prev.map(s => s.id === session.id ? { ...updatedSessionData, startTime: session.startTime, endTime: session.endTime } as WorkoutSession : s));

           fetch(gasUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain' },
              body: JSON.stringify({ action: 'updateBooking', data: { sessionData: gasPayload } })
           }).catch(e => {
              console.error("GAS Session Update Failed", e);
           });
        } catch(e) {
           console.error("GAS Session Update Failed", e);
        }
        return;
      }

      const sessionRef = doc(db, 'sessions', session.id);
      
      if (selectedBodyPart) {
        if (selectedBodyPart as any === 'CLEAR_ALL_FOCUS') {
           await updateDoc(sessionRef, {
             [`participantFocus.${effectiveUserId}`]: deleteField(),
             updatedAt: Timestamp.now()
           });
        } else if (!isJoined) {
          // Join first then add focus
          if (session.participants.length >= session.capacity) {
            alert("Session is full!");
            return;
          }
          await updateDoc(sessionRef, {
            participants: arrayUnion(effectiveUserId),
            [`participantFocus.${effectiveUserId}`]: [selectedBodyPart],
            [`participantNames.${effectiveUserId}`]: effectiveUserName,
            updatedAt: Timestamp.now()
          });
        } else {
          // Toggle focus in array
          const currentFocus = (session.participantFocus?.[effectiveUserId] as unknown as string[]) || [];
          const newFocus = currentFocus.includes(selectedBodyPart)
            ? currentFocus.filter(f => f !== selectedBodyPart)
            : [...currentFocus, selectedBodyPart];
            
          await updateDoc(sessionRef, {
            [`participantFocus.${effectiveUserId}`]: newFocus,
            updatedAt: Timestamp.now()
          });
        }
      } else {
        // Toggle Participation (Join/Leave Squad)
        if (isJoined) {
          await updateDoc(sessionRef, {
            participants: arrayRemove(effectiveUserId),
            [`participantFocus.${effectiveUserId}`]: deleteField(),
            [`participantNames.${effectiveUserId}`]: deleteField(),
            updatedAt: Timestamp.now()
          });
        } else {
          if (session.participants.length >= session.capacity) {
            alert("Session is full!");
            return;
          }
          await updateDoc(sessionRef, {
            participants: arrayUnion(effectiveUserId),
            [`participantNames.${effectiveUserId}`]: effectiveUserName,
            updatedAt: Timestamp.now()
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `sessions/${session.id}`);
    }
  };

  const grindStats = useMemo(() => {
    const effectiveUserId = user?.uid || 'guest_user';
    const monthSessions = sessions.filter(s => 
      isSameMonth(s.startTime, currentDate) && 
      s.participants.includes(effectiveUserId)
    );

    const buddyCounts: Record<string, number> = {};
    sessions.forEach(s => {
      if (s.participants.includes(effectiveUserId)) {
        s.participants.forEach(pId => {
          if (pId !== effectiveUserId) {
            buddyCounts[pId] = (buddyCounts[pId] || 0) + 1;
          }
        });
      }
    });

    let topBuddyId = null;
    let maxCount = 0;
    for (const [id, count] of Object.entries(buddyCounts)) {
      if (count > maxCount) {
        maxCount = count;
        topBuddyId = id;
      }
    }

    let topBuddyName = "Solo Warrior";
    if (topBuddyId) {
      const buddySession = sessions.find(s => s.creatorId === topBuddyId);
      topBuddyName = buddySession ? buddySession.creatorName : `Athlete ${topBuddyId.substring(0, 4)}`;
    }

    return {
      count: monthSessions.length,
      topBuddy: topBuddyName,
      buddyId: topBuddyId
    };
  }, [sessions, user, currentDate]);

  const handleLogOut = async () => {
    await logOut();
    sessionStorage.removeItem('grind_user');
    setUser(null);
    setIsAdmin(false);
  };

  if (!authReady) return <div className="h-screen bg-dark-bg flex items-center justify-center"><div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div></div>;

  if (!user) return <LoginScreen gasUrl={gasUrl} useGoogleSheets={useGoogleSheets} onCodeLogin={async (u) => { 
    // This is called AFTER anonymous sign in and code verification
    setUser(u); 
    if (u.role === 'admin') setIsAdmin(true);
    sessionStorage.setItem('grind_user', JSON.stringify(u)); 
  }} />;

  return (
    <div className="flex h-screen bg-dark-bg text-dark-text overflow-hidden font-sans">
      {/* Dynamic Background Elements */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-brand-primary/5 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/5 blur-[100px] rounded-full pointer-events-none"></div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full bg-dark-surface border-t border-dark-border flex items-center justify-around p-2 z-40 lg:hidden">
        <button 
          onClick={() => setActiveView('Calendar')}
          className={`p-3 rounded-2xl transition-all ${activeView === 'Calendar' ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' : 'text-dark-text-muted'}`}
        >
          <CalendarIcon size={20} />
        </button>
        <button 
          onClick={() => setActiveView('Weight')}
          className={`p-3 rounded-2xl transition-all ${activeView === 'Weight' ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' : 'text-dark-text-muted'}`}
        >
          <LayoutDashboard size={20} />
        </button>
        <button 
          onClick={() => setActiveView('Nutrition')}
          className={`p-3 rounded-2xl transition-all ${activeView === 'Nutrition' ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' : 'text-dark-text-muted'}`}
        >
          <Apple size={20} />
        </button>
        <button 
          onClick={() => setActiveView('Research')}
          className={`p-3 rounded-2xl transition-all ${activeView === 'Research' ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' : 'text-dark-text-muted'}`}
        >
          <BookOpen size={20} />
        </button>
        <button 
          onClick={handleLogOut}
          className="p-3 rounded-2xl transition-all text-dark-text-muted hover:text-red-500"
        >
          <LogOut size={20} />
        </button>
      </nav>

      {/* Sidebar - Compact for Highlights (Desktop) */}
      <aside className="hidden lg:flex w-60 bg-dark-surface border-r border-dark-border flex-col p-5 overflow-hidden z-20">
        <div className="flex items-center gap-3 mb-10 px-0">
          <div className="w-9 h-9 bg-brand-primary rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-brand-primary/20 shrink-0">
            F
          </div>
          <span className="text-xl font-black tracking-tighter block">FlexSync</span>
        </div>

        <nav className="flex flex-col gap-1.5 mb-10 flex-1 px-0">
          <NavItem 
            icon={<CalendarIcon size={20} />} 
            label="Calendar" 
            active={activeView === 'Calendar'} 
            onClick={() => setActiveView('Calendar')} 
          />
          <NavItem 
            icon={<LayoutDashboard size={20} />} 
            label="Weight Tracker" 
            active={activeView === 'Weight'} 
            onClick={() => setActiveView('Weight')} 
          />
          <NavItem 
            icon={<Apple size={20} />} 
            label="Nutrition" 
            active={activeView === 'Nutrition'} 
            onClick={() => setActiveView('Nutrition')} 
          />
          <NavItem 
            icon={<BookOpen size={20} />} 
            label="Research" 
            active={activeView === 'Research'} 
            onClick={() => setActiveView('Research')} 
          />
          <NavItem 
            icon={<Settings size={20} />} 
            label="Settings" 
            active={activeView === 'Settings'} 
            onClick={() => setActiveView('Settings')} 
          />
          {isAdmin && (
            <NavItem 
              icon={<UserIcon size={20} />} 
              label="Accounts" 
              active={activeView === 'Accounts'} 
              onClick={() => setActiveView('Accounts')} 
            />
          )}
        </nav>

        {/* Grind Stats Section */}
        <div className="hidden lg:block mb-8 px-2">
           <div className="text-[10px] font-black uppercase tracking-[0.2em] text-dark-text-muted mb-4 opacity-70">Grind Stats</div>
           <div className="space-y-4">
              <div className="bg-dark-surface-lighter p-4 rounded-[24px] border border-dark-border/50 shadow-inner">
                 <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                       <Dumbbell size={14} />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-dark-text-muted">Monthly Volume</span>
                 </div>
                 <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black">{grindStats.count}</span>
                    <span className="text-[10px] font-bold text-dark-text-muted uppercase">Sessions</span>
                 </div>
              </div>

              <div className="bg-dark-surface-lighter p-4 rounded-[24px] border border-dark-border/50 shadow-inner">
                 <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500">
                       <Users size={14} />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-dark-text-muted">Top Partner</span>
                 </div>
                 <div className="flex items-center gap-2">
                    {grindStats.buddyId ? (
                       <img 
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${grindStats.buddyId}`} 
                          className="w-5 h-5 rounded-full border border-purple-500/30" 
                        />
                    ) : (
                       <div className="w-5 h-5 rounded-full bg-dark-bg flex items-center justify-center">
                          <Check size={8} className="text-dark-text-muted" />
                       </div>
                    )}
                    <span className="text-xs font-black truncate">{grindStats.topBuddy}</span>
                 </div>
              </div>
           </div>
        </div>

        {/* Templates Section in Sidebar */}
        {user && templates.length > 0 && (
          <div className="hidden lg:block mb-8 px-2 overflow-hidden">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-dark-text-muted mb-4 opacity-70">Saved Templates</div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {templates.map(t => (
                <button 
                  key={t.id}
                  onClick={() => { loadTemplate(t); setIsModalOpen(true); }}
                  className="w-full text-left p-3 rounded-xl bg-dark-surface-lighter hover:bg-brand-primary/10 border border-transparent hover:border-brand-primary/20 transition-all group flex items-center justify-between"
                >
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-xs font-bold truncate">{t.title}</span>
                    <span className="text-[9px] text-dark-text-muted">{t.bodyPart}</span>
                  </div>
                  <ChevronRight size={14} className="text-dark-text-muted group-hover:text-brand-primary" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* User Card */}
        <div className="mt-auto pt-6 border-t border-dark-border">
          {user ? (
            <div className={`flex flex-col lg:flex-row items-center gap-3 bg-dark-bg/40 p-2.5 rounded-2xl border border-dark-border/50`}>
              <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} className="w-8 h-8 lg:w-9 lg:h-9 rounded-full border-2 border-brand-primary/20" />
              <div className="hidden lg:flex flex-col flex-1 overflow-hidden">
                <span className="text-xs font-black truncate">{user.displayName || user.email}</span>
                <span className="text-[9px] text-brand-primary font-bold uppercase tracking-tighter">Athletic Rank: Pro</span>
              </div>
              <button 
                onClick={() => logOut()}
                className="p-1.5 hover:bg-red-500/10 rounded-xl text-dark-text-muted hover:text-red-500 transition-colors hidden lg:flex"
                title="Log out"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => signInWithGoogle()}
              className="w-full h-12 bg-white text-dark-bg rounded-2xl font-black text-xs hover:scale-[1.02] active:scale-95 transition-all shadow-xl"
            >
              SIGN IN
            </button>
          )}
        </div>
      </aside>

      {/* Main App Container */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Modern Contextual Header */}
        <header className="h-20 lg:h-24 px-4 lg:px-12 flex items-center justify-between shrink-0 z-10 bg-dark-bg/80 backdrop-blur-xl">
          <div className="flex items-center gap-3 lg:gap-6 min-w-0">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-black tracking-tighter uppercase whitespace-nowrap truncate">
              {activeView === 'Weight' ? 'Weight Progress' : activeView === 'Settings' ? 'Account Settings' : activeView === 'Accounts' ? 'Account Management' : activeView === 'Nutrition' ? 'Nutrition Intel' : activeView === 'Research' ? 'Research Lab' : format(currentDate, 'MMMM yyyy')}
            </h1>
            {activeView === 'Calendar' && (
              <div className="flex bg-dark-surface p-1 rounded-2xl border border-dark-border shadow-inner shrink-0">
                <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1.5 lg:p-2 hover:bg-dark-surface-lighter rounded-xl transition-all"><ChevronLeft size={16} className="lg:w-5 lg:h-5" /></button>
                <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1.5 lg:p-2 hover:bg-dark-surface-lighter rounded-xl transition-all"><ChevronRight size={16} className="lg:w-5 lg:h-5" /></button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 lg:gap-4 shrink-0">
             {activeView === 'Calendar' && (
               <div className="flex bg-dark-surface p-1 lg:p-1.5 rounded-2xl border border-dark-border">
                 {[
                   { id: 'Month', label: 'MONTH' },
                   { id: 'Week', label: 'WEEK' },
                   { id: 'Day', label: 'TODAY' }
                 ].map(view => (
                   <button 
                     key={view.id}
                     onClick={() => {
                       setCalendarSubView(view.id as any);
                       if (view.id === 'Day') setSelectedDate(new Date());
                     }}
                     className={`px-3 lg:px-6 py-1.5 lg:py-2 rounded-xl text-[9px] lg:text-[10px] font-black tracking-widest transition-all ${
                       calendarSubView === view.id ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/30' : 'text-dark-text-muted hover:text-white'
                     }`}
                   >
                     {view.label}
                   </button>
                 ))}
               </div>
             )}
             
             {activeView === 'Calendar' && (
               <>
                 <button 
                  onClick={() => {
                    fetchCloud(true);
                  }}
                  className={`p-3 bg-dark-surface border border-dark-border rounded-2xl transition-all shadow-lg ${isSyncing ? 'text-brand-primary animate-spin' : 'text-dark-text-muted hover:text-brand-primary'}`}
                  title="Force Sync"
                  disabled={isSyncing}
                 >
                   <RefreshCw size={18} />
                 </button>
                 <div className="h-10 w-[1px] bg-dark-border mx-2"></div>
                 <button 
                    onClick={() => { resetForm(); setIsModalOpen(true); }}
                    className="group flex items-center gap-3 bg-brand-primary text-white border border-white/20 px-6 py-3 rounded-2xl font-black text-xs hover:scale-[1.05] active:scale-95 transition-all shadow-2xl shadow-brand-primary/20"
                  >
                    <Plus size={18} className="group-hover:rotate-90 transition-transform duration-500" /> 
                    <span className="hidden sm:inline uppercase tracking-widest">Broadcast Session</span>
                  </button>
               </>
             )}
          </div>
        </header>

        {/* Scrollable View Area */}
        <div className="flex-1 overflow-y-auto px-2 lg:px-4 pb-28 lg:pb-12 custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView + (activeView === 'Calendar' ? calendarSubView : '') + format(currentDate, 'MM-yyyy')}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="mt-4"
            >
              {activeView === 'Calendar' && (
                <div className="flex flex-col gap-8">
                  {calendarSubView === 'Month' && (
                    <>
                      <div className="w-full">
                        <MonthView 
                          sessions={sessions} 
                          currentDate={currentDate} 
                          selectedDate={selectedDate}
                          focusedSessionId={focusedSessionId}
                          onSelectSession={(sessionId: string) => {
                            setFocusedSessionId(sessionId);
                            // Set selected date to the session date so it shows in the feed below
                            const session = sessions.find(s => s.id === sessionId);
                            if (session) {
                              setSelectedDate(session.startTime);
                              // Scroll into view logic handled by useEffect in SessionCard
                            }
                          }}
                          onSelectDay={(day: Date) => {
                            setSelectedDate(day);
                            setFocusedSessionId(null);
                            const daySessions = sessions.filter((s: WorkoutSession) => isSameDay(s.startTime, day));
                            if (daySessions.length === 0) {
                              const now = new Date();
                              const startTime = setHours(setMinutes(day, now.getMinutes()), now.getHours());
                              setFormData(prev => ({
                                ...prev,
                                startTime: format(startTime, "yyyy-MM-dd'T'HH:mm")
                              }));
                              setIsModalOpen(true);
                            }
                          }} 
                        />
                      </div>
                      <div className="mt-8 border-t border-dark-border pt-12">
                         <SessionFeed 
                           sessions={sessions} 
                           onJoin={toggleJoin}
                           onEdit={handleEditClick}
                           onDelete={handleDeleteSession}
                           onComment={handleAddComment}
                           user={user} 
                           selectedDate={selectedDate} 
                           focusedSessionId={focusedSessionId}
                         />
                      </div>
                    </>
                  )}
                  {calendarSubView === 'Week' && <WeeklyView sessions={sessions} onJoin={toggleJoin} onEdit={handleEditClick} onDelete={handleDeleteSession} onComment={handleAddComment} user={user} currentMonth={currentDate} />}
                  {calendarSubView === 'Day' && <DailyView sessions={sessions} onJoin={toggleJoin} onEdit={handleEditClick} onDelete={handleDeleteSession} onComment={handleAddComment} user={user} selectedDate={selectedDate} />}
                </div>
              )}
              {activeView === 'Weight' && <WeightTracker user={user} entries={weightEntries} sessions={sessions} gasUrl={gasUrl} onAddWeight={(entry) => setWeightEntries(prev => [entry, ...prev])} />}
              {activeView === 'Nutrition' && <NutritionView />}
              {activeView === 'Research' && <ResearchView />}
              {activeView === 'Accounts' && (
                <AccountsView 
                  gasUrl={gasUrl} 
                  setGasUrl={setGasUrl} 
                  useGoogleSheets={useGoogleSheets} 
                  setUseGoogleSheets={setUseGoogleSheets} 
                  isAdmin={isAdmin}
                />
              )}
              {activeView === 'Settings' && <SettingsView user={user} onNavigate={setActiveView} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Session Details Modal / Form */}
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-dark-bg/90 backdrop-blur-xl">
              <motion.div 
                layoutId="modal"
                initial={{ opacity: 0, scale: 0.9, y: 100 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 100 }}
                className="bg-dark-surface w-full max-w-2xl border border-dark-border rounded-[32px] lg:rounded-[40px] p-6 lg:p-10 shadow-2xl relative overflow-hidden overflow-y-auto max-h-[90vh] custom-scrollbar"
              >
                {/* Decorative bar */}
                <div 
                  className="absolute top-0 left-0 w-full h-2 transition-colors duration-500" 
                  style={{ backgroundColor: WORKOUT_COLORS[formData.bodyPart as keyof typeof WORKOUT_COLORS] }}
                ></div>

                <div className="flex justify-between items-center mb-10">
                   <h3 className="text-4xl font-black tracking-tighter uppercase">Plan your grind</h3>
                   <button onClick={() => setIsModalOpen(false)} className="p-3 bg-dark-surface-lighter rounded-2xl hover:text-red-400 transition-colors">
                      <Plus size={24} className="rotate-45" />
                   </button>
                </div>

                {/* Template Selector inside Modal */}
                {templates.length > 0 && (
                  <div className="mb-8 p-4 bg-dark-bg/40 border border-dark-border rounded-3xl">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-dark-text-muted mb-3 block">Quick Load Template</label>
                    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                      {templates.map(t => (
                        <button 
                          key={t.id}
                          type="button"
                          onClick={() => loadTemplate(t)}
                          className="shrink-0 px-4 py-2 bg-dark-surface-lighter border border-dark-border rounded-xl text-xs font-bold hover:border-brand-primary transition-all"
                        >
                          {t.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                <form onSubmit={handleCreateSession} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary">Session Intel</label>
                       <input 
                        required
                        type="text" 
                        placeholder="Morning Shred / Leg Destroyer"
                        className="w-full bg-dark-bg border border-dark-border rounded-2xl px-6 py-4 text-sm focus:border-brand-primary outline-none transition-all font-bold placeholder:opacity-30"
                        value={formData.title}
                        onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                       />
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-[0.2em] text-dark-text-muted">Target Areas</label>
                       <div className="grid grid-cols-3 gap-2">
                          {BODY_PARTS.slice(0, 9).map(bp => (
                             <button
                                key={bp}
                                type="button"
                                onClick={() => {
                                  setFormData(prev => {
                                    const exists = prev.bodyParts.includes(bp);
                                    if (exists) {
                                      return { ...prev, bodyParts: prev.bodyParts.filter(i => i !== bp) };
                                    } else {
                                      return { ...prev, bodyParts: [...prev.bodyParts, bp] };
                                    }
                                  });
                                }}
                                className={`py-3 rounded-xl text-[10px] font-black border transition-all ${
                                  formData.bodyParts.includes(bp) ? 'bg-brand-primary text-white border-brand-primary shadow-lg' : 'bg-dark-bg border-dark-border text-dark-text-muted hover:border-brand-primary/50'
                                }`}
                             >
                               {bp.toUpperCase()}
                             </button>
                          ))}
                       </div>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-[0.2em] text-dark-text-muted">Intel Detail</label>
                       <textarea 
                        rows={3}
                        placeholder="What's the plan? Benching heavy? Yoga flow?"
                        className="w-full bg-dark-bg border border-dark-border rounded-2xl px-6 py-4 text-sm focus:border-brand-primary outline-none transition-all font-bold placeholder:opacity-30 resize-none"
                        value={formData.description}
                        onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                       />
                    </div>
                  </div>

                  <div className="space-y-6">
                     <div className="space-y-2">
                        <div className="flex items-center justify-between">
                           <label className="text-[10px] font-black uppercase tracking-[0.2em] text-dark-text-muted">Rendevous Point</label>
                           <button 
                              type="button" 
                              onClick={() => setIsManualLocation(!isManualLocation)}
                              className="text-[9px] font-black uppercase tracking-widest text-brand-primary hover:opacity-80 transition-opacity"
                           >
                              {isManualLocation ? 'Switch to AF List' : 'Enter Manual Address'}
                           </button>
                        </div>
                        <div className="relative">
                          <MapPin size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-brand-primary z-10" />
                          
                          {isManualLocation ? (
                            <input 
                              required
                              type="text" 
                              placeholder="Anywhere else?"
                              className="w-full bg-dark-bg border border-dark-border rounded-2xl pl-14 pr-6 py-4 text-sm focus:border-brand-primary outline-none transition-all font-bold placeholder:opacity-30"
                              value={formData.location}
                              onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                            />
                          ) : (
                            <select 
                              required
                              className="w-full bg-dark-bg border border-dark-border rounded-2xl pl-14 pr-6 py-4 text-sm focus:border-brand-primary outline-none transition-all font-bold appearance-none custom-scrollbar"
                              value={formData.location}
                              onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                            >
                               <option value="" disabled>Select AF Branch</option>
                               {Object.entries(ANYTIME_FITNESS_LOCATIONS).map(([city, branches]) => (
                                 <optgroup key={city} label={city.toUpperCase()}>
                                   {branches.map(branch => (
                                     <option key={branch} value={branch}>{branch}</option>
                                   ))}
                                 </optgroup>
                               ))}
                            </select>
                          )}
                        </div>
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <label className="text-[10px] font-black uppercase tracking-[0.2em] text-dark-text-muted">Start</label>
                           <input 
                              type="datetime-local"
                              className="w-full bg-dark-bg border border-dark-border rounded-2xl px-4 py-4 text-xs focus:border-brand-primary outline-none transition-all font-bold"
                              value={formData.startTime}
                              onChange={e => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                           />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-black uppercase tracking-[0.2em] text-dark-text-muted">Duration</label>
                           <select 
                            className="w-full bg-dark-bg border border-dark-border rounded-2xl px-4 py-4 text-xs focus:border-brand-primary outline-none transition-all font-bold appearance-none"
                            value={formData.hours}
                            onChange={e => setFormData(prev => ({ ...prev, hours: Number(e.target.value) }))}
                           >
                              {[1, 1.5, 2, 2.5, 3].map(h => <option key={h} value={h}>{h} HOURS</option>)}
                           </select>
                        </div>
                     </div>

                     <label className="flex items-center gap-3 cursor-pointer group mt-4 bg-dark-bg/50 p-4 rounded-2xl border border-dashed border-dark-border hover:border-brand-primary/50 transition-all">
                        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                          formData.saveAsTemplate ? 'bg-brand-primary border-brand-primary' : 'border-dark-border'
                        }`}>
                           {formData.saveAsTemplate && <Check size={14} className="text-white" />}
                        </div>
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={formData.saveAsTemplate}
                          onChange={e => setFormData(prev => ({ ...prev, saveAsTemplate: e.target.checked }))}
                        />
                        <span className="text-xs font-black uppercase tracking-wider text-dark-text-muted group-hover:text-white transition-colors">Save as Template</span>
                     </label>
                  </div>

                  <div className="col-span-1 md:col-span-2 pt-6">
                    <button 
                      type="submit"
                      disabled={formData.bodyParts.length === 0}
                      className="w-full h-16 bg-white text-dark-bg rounded-3xl font-black text-lg hover:scale-[1.02] active:scale-95 transition-all shadow-2xl flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      BROADCAST TO COMMUNITY <ChevronRight size={24} />
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center gap-4 px-4 py-3.5 rounded-[22px] cursor-pointer transition-all border ${
      active 
        ? 'bg-brand-primary text-white shadow-xl shadow-brand-primary/20 border-white/10' 
        : 'text-dark-text-muted hover:bg-dark-surface-lighter hover:text-white border-transparent'
    }`}>
      {icon}
      <span className="text-sm font-bold uppercase tracking-tight hidden lg:block">{label}</span>
    </div>
  );
}

function WeeklyView({ sessions, onJoin, onEdit, onDelete, onComment, user, currentMonth }: any) {
  const weekStart = startOfWeek(currentMonth, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="space-y-12 pb-10">
      {weekDays.map((day, dIdx) => {
        const daySessions = sessions.filter((s: WorkoutSession) => isSameDay(s.startTime, day));
        return (
          <div key={dIdx} className="space-y-6">
            <div className="flex items-center gap-6 px-4">
              <div className="flex flex-col">
                <span className="text-sm font-black text-brand-primary tracking-[0.3em] uppercase">{format(day, 'EEEE')}</span>
                <h4 className="text-2xl font-bold tracking-tighter opacity-80">{format(day, 'MMMM do')}</h4>
              </div>
              <div className="h-[1px] flex-1 bg-gradient-to-r from-dark-border to-transparent"></div>
              {daySessions.length > 0 && (
                <div className="bg-orange-500/10 text-orange-500 px-4 py-1 rounded-full text-[10px] font-black border border-orange-500/20 uppercase tracking-widest animate-pulse">
                  {daySessions.length} SESSIONS ACTIVE
                </div>
              )}
            </div>

            {daySessions.length === 0 ? (
              <div className="mx-4 p-8 rounded-[40px] border-2 border-dashed border-dark-border/40 flex items-center justify-center bg-dark-surface/10 opacity-30">
                 <span className="text-xs font-black uppercase tracking-[0.2em]">Rest day — or spawn a session</span>
              </div>
            ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-8">
                {daySessions.map((session: WorkoutSession) => (
                  <SessionCard key={session.id} session={session} onJoin={onJoin} onEdit={onEdit} onDelete={onDelete} onComment={onComment} user={user} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface SessionCardProps {
  key?: any;
  session: WorkoutSession;
  onJoin: (session: WorkoutSession, bodyPart?: BodyPart) => void;
  onEdit?: (session: WorkoutSession) => void;
  onDelete?: (sessionId: string) => void;
  onComment?: (session: WorkoutSession, text: string) => void;
  user: any;
  isFocused?: boolean;
}

function SessionCard({ session, onJoin, onEdit, onDelete, onComment, user, isFocused }: SessionCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [commentText, setCommentText] = useState('');
  const isCreator = user?.uid === session.creatorId || (user?.displayName && user?.displayName === session.creatorName);
  const effectiveUserId = user?.uid || 'guest_user';
  const isJoined = (session.participants || []).includes(effectiveUserId);
  const isFull = (session.participants || []).length >= session.capacity && !isJoined;
  const currentFocus = session.participantFocus?.[effectiveUserId];

  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isFocused]);

  return (
     <motion.div 
      ref={cardRef}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ 
        opacity: 1, 
        scale: isFocused ? 1.02 : 1,
        borderColor: isFocused ? 'var(--color-brand-primary)' : 'rgba(255,255,255,0.1)'
      }}
      className={`group relative bg-[#1c1e26] border rounded-[32px] lg:rounded-[40px] p-6 lg:p-8 transition-all hover:bg-[#232630] overflow-hidden shadow-2xl ${
        isFocused ? 'ring-2 ring-brand-primary/50 border-brand-primary' : 'border-dark-border'
      }`}
    >
      {/* Indicator Bar */}
      <div className="absolute top-0 left-0 w-full h-[6px]" style={{ backgroundColor: session.color }}></div>
      <div className="absolute top-0 left-0 w-[6px] h-full" style={{ backgroundColor: session.color }}></div>

      <div className="flex justify-between items-start mb-6">
        <div>
           <div className="flex flex-wrap gap-1 mb-2">
              {session.bodyParts?.map(bp => (
                <span key={bp} className="px-3 py-1 bg-brand-primary/10 text-brand-primary rounded-full text-[13px] font-black uppercase tracking-widest border border-brand-primary/20">
                  {bp}
                </span>
              ))}
           </div>
           <h3 className="text-2xl font-black leading-tight tracking-tight mb-1">{session.title}</h3>
           <div className="flex items-center gap-2 text-xs font-bold text-dark-text-muted">
              <span>by {session.creatorName}</span>
              <span className="opacity-30">•</span>
              <div className="flex items-center gap-1">
                 <div className="w-5 h-5 rounded-full bg-brand-primary/10 flex items-center justify-center p-0.5" style={{ color: session.color }}>
                    <Dumbbell size={10} />
                 </div>
                 <span className="text-[10px] uppercase font-black tracking-widest" style={{ color: session.color }}>
                    {session.bodyParts?.join(' + ') || (session as any).bodyPart || 'CUSTOM'}
                 </span>
              </div>
           </div>
        </div>
        <div className="flex flex-col items-end">
           <span className="text-sm font-black text-brand-primary">{format(session.startTime, 'MMMM dd')}</span>
           <span className="text-xl font-bold tracking-tighter">{format(session.startTime, 'h:mm a')}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs font-bold text-dark-text-muted mb-6 bg-dark-bg/50 w-fit px-4 py-2 rounded-2xl border border-dark-border/50">
         <MapPin size={16} className="text-brand-primary" />
         <span>{session.location}</span>
      </div>
      <div className="bg-dark-bg/80 border border-dark-border rounded-3xl p-4 sm:p-6 mb-6 flex flex-col gap-6 group-hover:border-brand-primary/20 transition-all">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
             <div className="flex -space-x-3">
                {(session.participants || []).slice(0, 5).map((pid: string, idx: number) => {
                    const focuses = (session.participantFocus?.[pid] as unknown as string[]) || [];
                    const pName = session.participantNames?.[pid] || (pid === session.creatorId ? (session.creatorName || 'CREATOR') : 'ATHLETE');
                    const pDisplay = pid === effectiveUserId ? (session.participantNames?.[pid] ? `${session.participantNames[pid]} (YOU)` : (user?.displayName ? `${user.displayName} (YOU)` : 'YOU')) : pName;
                   return (
                      <div key={pid} className="group/avatar relative flex flex-col items-center" style={{ zIndex: 10 - idx }}>
                         <div className="w-10 h-10 rounded-full border-2 border-dark-surface bg-brand-primary overflow-hidden transition-transform hover:scale-110 hover:z-20 cursor-pointer shadow-lg relative">
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${pid}`} />
                            {focuses.length > 0 && (
                               <div 
                                  className="absolute -bottom-1 -right-1 bg-white rounded-full flex items-center justify-center border-2 border-dark-surface shadow-sm px-1 min-w-[16px] h-4"
                                  title={`Focus: ${focuses.join(', ')}`}
                               >
                                  <span className="text-[6px] font-black text-dark-bg">{focuses.length > 1 ? `+${focuses.length}` : focuses[0].substring(0, 1)}</span>
                               </div>
                            )}
                         </div>
                         {/* Name Tag - Tooltip on Hover */}
                         <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-white text-dark-bg px-2 py-1 rounded-lg text-[10px] font-black opacity-0 group-hover/avatar:opacity-100 transition-all pointer-events-none z-50 shadow-2xl flex flex-col items-center scale-90 group-hover/avatar:scale-100 mb-2">
                            <span className="whitespace-nowrap uppercase tracking-tighter">{pDisplay}</span>
                            {focuses.length > 0 && <span className="text-[8px] text-brand-primary uppercase mt-0.5 font-bold">{focuses.join(', ')}</span>}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white"></div>
                         </div>
                      </div>
                   );
                })}
                {Array.from({ length: Math.max(0, 3 - (session.participants || []).length) }).map((_, i) => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-dark-surface bg-dark-surface-lighter flex items-center justify-center text-[10px] font-black text-dark-text-muted/50 border-dashed mb-4">?</div>
                ))}
             </div>
             <div className="flex flex-col">
                <span className="text-sm font-black leading-none">{(session.participants || []).length} GOING <span className="opacity-30 text-xs text-white">/ {session.capacity}</span></span>
                <span className="text-[10px] font-bold text-orange-500/80 uppercase tracking-widest mt-1">
                  {isFull ? 'LOCKDOWN' : isJoined ? "YOU'RE IN THE SQUAD" : 'JOIN THE CREW!'}
                </span>
             </div>
          </div>
          
          {!isCreator ? (
            <button 
              disabled={isFull && !isJoined}
              onClick={() => onJoin(session)}
              className={`flex items-center gap-2 px-4 sm:px-8 py-3 rounded-2xl font-black text-[10px] sm:text-xs transition-all whitespace-nowrap w-full sm:w-auto justify-center ${
                isJoined 
                  ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white sm:min-w-[140px]' 
                  : 'bg-white text-dark-bg shadow-xl hover:scale-105 active:scale-95 disabled:bg-dark-surface-lighter disabled:text-dark-text-muted disabled:scale-100 disabled:shadow-none'
              }`}
            >
              {isJoined ? 'LEAVE SQUAD' : isFull ? 'SQUAD FULL' : 'TAG ALONG'}
            </button>
          ) : (
            <div className="flex gap-2 w-full sm:w-auto">
              {showConfirmDelete ? (
                <div className="flex gap-2 w-full animate-in fade-in slide-in-from-right-4">
                  <button 
                    onClick={() => setShowConfirmDelete(false)}
                    className="flex-1 px-6 py-3 rounded-2xl font-black text-xs transition-all bg-dark-surface border border-dark-border text-dark-text-muted hover:text-white"
                  >
                    CANCEL
                  </button>
                  <button 
                    onClick={() => {
                        onDelete?.(session.id);
                        setShowConfirmDelete(false);
                    }}
                    className="flex-1 px-6 py-3 rounded-2xl font-black text-xs transition-all bg-red-500 text-white shadow-xl shadow-red-500/20"
                  >
                    CONFIRM DELETE
                  </button>
                </div>
              ) : (
                <>
                  {onEdit && (
                    <button 
                      onClick={() => onEdit(session)}
                      className="px-6 py-3 rounded-2xl font-black text-xs transition-all bg-dark-bg border border-dark-border text-dark-text-muted hover:border-brand-primary"
                    >
                      EDIT
                    </button>
                  )}
                  {onDelete && (
                    <button 
                      onClick={() => setShowConfirmDelete(true)}
                      className="px-6 py-3 rounded-2xl font-black text-xs transition-all bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white"
                    >
                      DELETE
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {isJoined && (
           <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="pt-4 border-t border-dark-border/30 overflow-hidden"
           >
              {!isCreator && (
                 <div className="mb-6">
                   <p className="text-[10px] font-black uppercase tracking-widest text-dark-text-muted mb-4 opacity-60">Personal Target Focus (Multiple Select)</p>
                   <div className="flex flex-wrap gap-2">
                      {BODY_PARTS.map((bp: any) => (
                         <button 
                            key={bp}
                            onClick={(e) => {
                               e.stopPropagation();
                               onJoin(session, bp);
                            }}
                            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                               (currentFocus as unknown as string[])?.includes(bp) 
                                 ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' 
                                 : 'bg-dark-bg border border-dark-border text-dark-text-muted hover:border-brand-primary/50'
                            }`}
                         >
                            {bp}
                         </button>
                      ))}
                      <button 
                         onClick={(e) => {
                            e.stopPropagation();
                            onJoin(session, 'CLEAR_ALL_FOCUS' as any); 
                         }}
                         className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                            !(currentFocus as unknown as string[])?.length 
                              ? 'bg-white text-dark-bg' 
                              : 'bg-dark-bg border border-dark-border text-dark-text-muted hover:border-brand-primary/50'
                         }`}
                      >
                         GENERAL
                      </button>
                   </div>
                 </div>
              )}

              {/* Squad Breakdown - New section for separate personal targets */}
              {Object.keys(session.participantFocus || {}).length > 0 && (
                 <div className="bg-dark-bg/40 p-4 rounded-2xl border border-dark-border/40">
                    <p className="text-[9px] font-black uppercase tracking-widest text-dark-text-muted mb-3 opacity-60">Squad Intentions</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                       {Object.entries(session.participantFocus || {}).map(([pid, focuses]: [string, any]) => (
                          <div key={pid} className="flex items-center gap-2">
                             <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${pid}`} className="w-4 h-4 rounded-full" />
                             <div className="flex gap-1">
                                {focuses.map((f: string) => (
                                   <span key={f} className="text-[8px] font-bold text-brand-primary bg-brand-primary/10 px-1.5 rounded-md uppercase">{f}</span>
                                ))}
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>
              )}

              {/* Comments Section */}
              <div className="mt-6 border-t border-dark-border/30 pt-4">
                 <p className="text-[10px] font-black uppercase tracking-widest text-dark-text-muted mb-4 opacity-60">Squad Comms</p>
                 <div className="space-y-3 mb-4 max-h-[150px] overflow-y-auto custom-scrollbar pr-2">
                    {(!session.comments || session.comments.length === 0) ? (
                       <p className="text-xs text-dark-text-muted/50 italic font-medium">No comms yet. Start the hype.</p>
                    ) : (
                       session.comments.map(c => (
                          <div key={c.id} className="bg-dark-bg/60 p-3 rounded-2xl flex gap-3">
                             <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${c.userId}`} className="w-6 h-6 rounded-full shrink-0" />
                             <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-2 mb-1">
                                   <span className="text-[10px] font-black text-brand-primary truncate">{c.userName}</span>
                                   <span className="text-[8px] font-bold text-dark-text-muted whitespace-nowrap">
                                      {format(new Date(c.timestamp), 'MMM d, h:mm a')}
                                   </span>
                                </div>
                                <p className="text-xs text-dark-text font-medium">{c.text}</p>
                             </div>
                          </div>
                       ))
                    )}
                 </div>
                 
                 {onComment && isJoined && (session.comments?.filter(c => c.userId === effectiveUserId)?.length || 0) < 4 && (
                    <form 
                       onSubmit={(e) => {
                          e.preventDefault();
                          if (commentText.trim()) {
                             onComment(session, commentText);
                             setCommentText('');
                          }
                       }}
                       className="flex gap-2"
                    >
                       <input 
                          type="text"
                          placeholder="Drop some hype..."
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          className="flex-1 bg-dark-bg border border-dark-border rounded-xl px-4 py-2 text-xs font-medium focus:border-brand-primary outline-none transition-all placeholder:text-dark-text-muted/50"
                       />
                       <button 
                          type="submit"
                          disabled={!commentText.trim()}
                          className="bg-brand-primary text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 disabled:scale-100 hover:scale-[1.02] active:scale-95 transition-all"
                       >
                          SEND
                       </button>
                    </form>
                 )}
              </div>
           </motion.div>
        )}
      </div>

      <div className="text-sm font-medium text-dark-text-muted leading-relaxed line-clamp-3 mb-6 bg-brand-primary/5 p-4 rounded-2xl italic">
         "{session.description || 'No specialized intel provided. Showing up is enough.'}"
      </div>

      {isCreator && (
        <div className="flex justify-end gap-3 pt-2 border-t border-dark-border/20">
           <button className="px-4 py-2 text-[10px] font-black uppercase text-dark-text-muted hover:text-white transition-colors tracking-widest">Edit</button>
           <button className="px-4 py-2 text-[10px] font-black uppercase text-red-500/70 hover:text-red-500 transition-colors tracking-widest">Delete</button>
        </div>
      )}
    </motion.div>
  );
}

function getDaysInMonth(date: Date) {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  const startCal = startOfWeek(start, { weekStartsOn: 1 });
  const endCal = endOfWeek(end, { weekStartsOn: 1 });
  return eachDayOfInterval({ start: startCal, end: endCal });
}

function MonthView({ sessions, currentDate, selectedDate, onSelectDay, onSelectSession, focusedSessionId }: any) {
  const days = getDaysInMonth(currentDate);

  return (
    <div className="bg-dark-surface rounded-[32px] border border-dark-border overflow-hidden shadow-2xl">
      <div className="grid grid-cols-7 border-b border-dark-border/50 bg-dark-bg/40">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="py-4 lg:py-5 text-center text-[9px] lg:text-[10px] font-black uppercase text-dark-text-muted tracking-[0.2em] lg:tracking-[0.3em]">
            <span className="lg:hidden">{d}</span>
            <span className="hidden lg:inline">{d === 'S' ? (i === 5 ? 'Sat' : 'Sun') : d === 'M' ? 'Mon' : d === 'T' ? (i === 1 ? 'Tue' : 'Thu') : d === 'W' ? 'Wed' : d === 'F' ? 'Fri' : d}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          const daySessions = sessions.filter((s: WorkoutSession) => isSameDay(s.startTime, day));
          const isToday = isSameDay(day, new Date());
          const isSelected = isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, currentDate);

          return (
            <div 
              key={idx}
              onClick={() => onSelectDay(day)}
              className={`min-h-[100px] lg:min-h-[110px] p-1.5 lg:p-3 border-r border-b border-dark-border/50 transition-all hover:bg-brand-primary/5 cursor-pointer group flex flex-col gap-1 relative ${
                !isCurrentMonth ? 'opacity-10 grayscale' : ''
              } ${idx % 7 === 6 ? 'border-r-0' : ''} ${isSelected ? 'bg-brand-primary/10 ring-1 ring-inset ring-brand-primary/30' : ''}`}
            >
              <div className="flex justify-between items-start z-10">
                <span className={`text-[10px] lg:text-xs font-black transition-all ${
                  isToday ? 'bg-brand-primary text-white w-6 h-6 lg:w-7 lg:h-7 rounded-full flex items-center justify-center -mt-1 -ml-1 shadow-lg shadow-brand-primary/30' : 'text-dark-text-muted group-hover:text-white'
                } ${isSelected ? 'text-brand-primary' : ''}`}>
                   {format(day, 'd')}
                </span>
                
                {daySessions.length > 0 && isCurrentMonth && (
                  <div className="flex -space-x-1 lg:hidden">
                     <div className="w-1.5 h-1.5 rounded-full bg-brand-primary shadow-sm border border-dark-bg"></div>
                  </div>
                )}

                {daySessions.length > 0 && isCurrentMonth && (
                  <div className="hidden lg:flex -space-x-1">
                    {daySessions.slice(0, 4).map((s: any, i: number) => (
                      <div 
                        key={i} 
                        className="w-2.5 h-2.5 rounded-full border border-dark-surface shadow-sm" 
                        style={{ backgroundColor: s.color }}
                      ></div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex flex-col gap-1 mt-1 lg:mt-2 overflow-hidden z-10 w-full px-0.5 lg:px-1 mb-1">
                {daySessions.slice(0, 3).map((s: any) => (
                  <div 
                    key={s.id} 
                    onClick={(e) => {
                       e.stopPropagation();
                       onSelectSession(s.id);
                    }}
                    style={{
                       backgroundColor: focusedSessionId === s.id ? s.color : `${s.color || '#3B82F6'}15`,
                       borderColor: focusedSessionId === s.id ? 'rgba(255,255,255,0.4)' : `${s.color || '#3B82F6'}30`,
                       borderLeftWidth: '3px',
                       borderLeftColor: s.color || '#3B82F6',
                       color: focusedSessionId === s.id ? '#000' : 'inherit'
                    }}
                    className={`flex flex-col gap-1 p-1.5 px-2 text-left rounded-md border transition-all overflow-hidden cursor-pointer hover:brightness-125`}
                  >
                    <div className="flex items-center justify-between gap-1 w-full">
                      <div className="flex flex-col min-w-0 w-full">
                        <span className={`text-[8px] font-black uppercase truncate whitespace-nowrap opacity-90 ${focusedSessionId === s.id ? 'text-black' : 'text-white'}`}>{s.title}</span>
                        <div className="flex justify-between items-center w-full min-w-0 mt-0.5">
                           <span className={`text-[7px] font-bold truncate opacity-60 ${focusedSessionId === s.id ? 'text-black' : 'text-dark-text-muted'}`}>{format(s.startTime, 'h:mm a')}</span>
                           {s.participants.length > 0 && (
                             <span className={`text-[6px] font-black ${focusedSessionId === s.id ? 'text-black' : 'text-brand-primary'}`}>{s.participants.length} JND</span>
                           )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {daySessions.length > 3 && (
                   <span className="text-[7px] font-black text-dark-text-muted uppercase tracking-widest pl-1 mt-0.5">+ {daySessions.length - 3} MORE</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SessionFeed({ sessions, onJoin, onEdit, onDelete, onComment, user, selectedDate, focusedSessionId }: any) {
  const isToday = isSameDay(selectedDate, new Date());
  
  const todaySessions = sessions.filter((s: WorkoutSession) => isSameDay(s.startTime, new Date()));
  
  // Dedup names logic
  const getParticipantName = (pid: string, session: WorkoutSession) => {
    const fromMap = session.participantNames?.[pid];
    if (fromMap) return fromMap;
    if (pid === user?.uid) return user.displayName;
    if (pid === session.creatorId) return session.creatorName;
    return 'Athlete';
  };
  const selectedDaySessions = isToday ? todaySessions : sessions.filter((s: WorkoutSession) => isSameDay(s.startTime, selectedDate));
  
  const upcomingSessions = sessions.filter((s: WorkoutSession) => s.startTime > (isToday ? endOfDay(new Date()) : endOfDay(selectedDate))).slice(0, 6);

  const showTodaySection = !isToday || selectedDaySessions.length > 0;

  return (
    <div className="space-y-16">
      {/* Selected Day / Today Section */}
      {showTodaySection && (
        <div className="space-y-6 lg:space-y-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
             <h2 className="text-2xl lg:text-4xl font-black tracking-tighter uppercase leading-none">
               {isToday ? "Today's Squads" : format(selectedDate, 'EEEE, MMM do')}
             </h2>
             <span className="bg-brand-primary/10 text-brand-primary px-4 py-1.5 rounded-full text-[9px] lg:text-xs font-black uppercase tracking-[0.2em] w-fit">
               {selectedDaySessions.length} ACTIVE SESSIONS
             </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {selectedDaySessions.map((s: any) => (
              <SessionCard 
                key={s.id} 
                session={s} 
                onJoin={onJoin} 
                onEdit={onEdit}
                onDelete={onDelete}
                onComment={onComment}
                user={user} 
                isFocused={focusedSessionId === s.id}
              />
            ))}
            {selectedDaySessions.length === 0 && !isToday && (
              <div className="col-span-full py-40 border-2 border-dashed border-dark-border rounded-[50px] flex flex-col items-center justify-center gap-4 opacity-40">
                 <LayoutDashboard size={64} className="text-dark-border" />
                 <span className="text-lg font-black uppercase tracking-widest">No sessions scheduled for this date</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upcoming Section */}
      {upcomingSessions.length > 0 && (
        <div className="space-y-10">
          <div className="flex items-center gap-6">
             <h2 className="text-2xl font-black tracking-tight uppercase opacity-50">
               {isToday && todaySessions.length === 0 ? "No today session. Showing Upcoming" : "Coming Up Next"}
             </h2>
             <div className="flex-1 h-[1px] bg-dark-border/40"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
             {upcomingSessions.map((s: any) => (
               <SessionCard 
                 key={s.id} 
                 session={s} 
                 onJoin={onJoin} 
                 onEdit={onEdit}
                 onDelete={onDelete}
                 onComment={onComment}
                 user={user} 
                 isFocused={focusedSessionId === s.id}
               />
             ))}
          </div>
        </div>
      )}
      
      {!showTodaySection && upcomingSessions.length === 0 && (
        <div className="py-40 border-2 border-dashed border-dark-border rounded-[50px] flex flex-col items-center justify-center gap-4 opacity-40">
           <LayoutDashboard size={64} className="text-dark-border" />
           <span className="text-lg font-black uppercase tracking-widest">The grid is clear. Spawn a session.</span>
        </div>
      )}
    </div>
  );
}

const endOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

function DailyView({ sessions, onJoin, onEdit, onDelete, onComment, user, selectedDate }: any) {
  const daySessions = sessions.filter((s: WorkoutSession) => isSameDay(s.startTime, selectedDate));
  
  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
         <h2 className="text-4xl font-black tracking-tighter uppercase">{format(selectedDate, 'EEEE, MMM do')}</h2>
         <span className="bg-brand-primary/10 text-brand-primary px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em]">{daySessions.length} ACTIVE SESSIONS</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {daySessions.map((s: any) => <SessionCard key={s.id} session={s} onJoin={onJoin} onEdit={onEdit} onDelete={onDelete} onComment={onComment} user={user} />)}
        {daySessions.length === 0 && (
          <div className="col-span-full py-40 border-2 border-dashed border-dark-border rounded-[50px] flex flex-col items-center justify-center gap-4 opacity-40">
             <LayoutDashboard size={64} className="text-dark-border" />
             <span className="text-lg font-black uppercase tracking-widest">Dead silent on the gym floor</span>
          </div>
        )}
      </div>
    </div>
  );
}

function NutritionView() {
  return (
    <div className="space-y-12 pb-24">
      <div className="bg-dark-surface border border-dark-border rounded-[40px] p-8 lg:p-12 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-[6px] bg-green-500"></div>
        <div className="max-w-3xl">
          <h2 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase mb-6 leading-none">Fuel Performance</h2>
          <p className="text-lg text-dark-text-muted font-medium mb-10 leading-relaxed italic">
            "Eat like an athlete, not a nutritionist. Focus on whole foods, adequate protein, and strategic carb loading."
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-green-500">Macro Strategy</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-4 bg-dark-bg/40 rounded-2xl border border-dark-border/50">
                  <span className="text-xs font-bold uppercase tracking-widest">Protein</span>
                  <span className="text-sm font-black">2.2g / kg</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-dark-bg/40 rounded-2xl border border-dark-border/50">
                  <span className="text-xs font-bold uppercase tracking-widest">Carbohydrates</span>
                  <span className="text-sm font-black">4-6g / kg</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-dark-bg/40 rounded-2xl border border-dark-border/50">
                  <span className="text-xs font-bold uppercase tracking-widest">Fats</span>
                  <span className="text-sm font-black">0.8g / kg</span>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-green-500">Hydration Intel</h3>
              <div className="p-6 bg-dark-bg/60 border border-dark-border rounded-[32px] h-full">
                <p className="text-sm font-bold text-dark-text-muted leading-relaxed">
                  Minimum 3.7L daily for active males. Supplement with electrolytes (Sodium, Potassium, Magnesium) during sessions exceeding 90 minutes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { title: 'Meal Timing', desc: 'Pre-workout carbs 2h before. Protein 1h after.', color: 'border-blue-500' },
          { title: 'Supplements', desc: 'Creatine Monohydrate 5g daily. Caffeine pre-grind.', color: 'border-purple-500' },
          { title: 'Gut Health', desc: 'Fermented foods and high fiber for absorption.', color: 'border-yellow-500' }
        ].map(item => (
          <div key={item.title} className={`bg-dark-surface border border-dark-border p-6 rounded-[32px] hover:scale-[1.02] transition-all cursor-pointer ${item.color} border-l-4 shadow-xl`}>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-dark-text-muted mb-3 italic">{item.title}</h4>
            <p className="text-sm font-bold leading-snug">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResearchView() {
  return (
    <div className="space-y-12 pb-24">
      <div className="bg-dark-surface border border-dark-border rounded-[40px] p-8 lg:p-12 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-[6px] bg-brand-primary"></div>
        <div className="max-w-3xl">
          <h2 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase mb-6 leading-none">The Science of Strength</h2>
          <p className="text-lg text-dark-text-muted font-medium mb-10 leading-relaxed italic">
            "Knowledge is only potential power. Execution is the actual power."
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <h3 className="text-xs font-black uppercase tracking-[0.3em] text-brand-primary px-4">Latest Research Papers</h3>
          {[
            { title: 'Hypertrophy Mechanisms', author: 'Schoenfeld et al.', date: '2024' },
            { title: 'Volume vs Intensity Meta-Analysis', author: 'Nuckols et al.', date: '2023' },
            { title: 'The Anabolic Window Myth', author: 'Aragon/Helms', date: '2024' }
          ].map(paper => (
            <div key={paper.title} className="bg-dark-surface border border-dark-border p-6 rounded-[32px] hover:border-brand-primary/40 transition-all flex items-center justify-between group shadow-lg">
              <div className="overflow-hidden">
                <h4 className="text-sm font-black uppercase tracking-tighter group-hover:text-brand-primary transition-colors truncate">{paper.title}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold text-dark-text-muted">{paper.author}</span>
                  <div className="w-1 h-1 rounded-full bg-dark-border"></div>
                  <span className="text-[10px] font-bold text-dark-text-muted">{paper.date}</span>
                </div>
              </div>
              <BookOpen size={18} className="text-dark-text-muted group-hover:text-white" />
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <h3 className="text-xs font-black uppercase tracking-[0.3em] text-purple-500 px-4">Periodization Intel</h3>
          <div className="bg-dark-surface/50 border border-dark-border border-dashed p-8 rounded-[40px] h-full flex flex-col justify-center text-center">
            <Search size={32} className="mx-auto text-dark-border mb-6" />
            <p className="text-sm font-bold text-dark-text-muted italic leading-relaxed">
              Researching dynamic micro-cycles. Stay tuned for data-driven training blocks based on your session volume.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeightTracker({ user, entries, sessions, gasUrl, onAddWeight }: { user: any; entries: WeightEntry[]; sessions: WorkoutSession[]; gasUrl?: string; onAddWeight?: (e: WeightEntry) => void }) {
  const [newValue, setNewValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const entriesSorted = useMemo(() => [...entries].sort((a, b) => a.date.getTime() - b.date.getTime()), [entries]);
  const entriesDesc = useMemo(() => [...entries].sort((a, b) => b.date.getTime() - a.date.getTime()), [entries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newValue || isSubmitting) return;
    
    setIsSubmitting(true);
    
    const effectiveUserId = user?.uid || 'guest_user';
    const newEntry: WeightEntry = {
        id: 'local_' + Date.now(),
        userId: effectiveUserId,
        value: Number(newValue),
        unit: 'kg',
        date: new Date(),
        note: ''
    };

    // Save to local storage for dummy db fallback
    try {
        const stored = JSON.parse(localStorage.getItem('flexsync_weights_v2') || '[]');
        localStorage.setItem('flexsync_weights_v2', JSON.stringify([newEntry, ...stored]));
        if (onAddWeight) onAddWeight(newEntry);
    } catch (e) {}
    
    // PRIORITY 0: CLOUD SYNC
    if (gasUrl) {
      try {
        await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ 
            action: 'logWeight', 
            data: { 
              id: newEntry.id,
              userId: effectiveUserId,
              weight: Number(newValue), 
              date: newEntry.date.toISOString(),
              note: '', 
              userName: user?.displayName || 'Athlete',
              email: user?.email || ''
            } 
          })
        });
      } catch (gasErr) {
        console.warn("GAS Weight Sync failed", gasErr);
      }
    }

    try {
      await addDoc(collection(db, `users/${effectiveUserId}/weight_entries`), {
        userId: effectiveUserId,
        value: Number(newValue),
        unit: 'kg',
        date: Timestamp.now(),
        note: ''
      });
      setNewValue('');
    } catch (error) {
      console.error(error);
      setNewValue('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const syncToSheets = async () => {
    if (!user) {
      alert("Please sign in to sync with Google Sheets");
      return;
    }
    
    setIsSyncing(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/spreadsheets');
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (!token) throw new Error("No access token acquired");

      const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: { title: `FlexSync Weight Log - ${user.displayName || user.email}` }
        })
      });

      const spreadsheet = await createRes.json();
      const spreadsheetId = spreadsheet.spreadsheetId;

      // 1. Weight Data
      const weightValues = [
         ['Date', 'Weight (kg)', 'Notes'],
         ...entriesDesc.map(e => [format(e.date, 'yyyy-MM-dd HH:mm'), e.value, e.note || ''])
      ];

      // 2. Booking Data
      const sessionValues = [
        ['Timestamp', 'Activity', 'Start Time', 'Location', 'Creator'],
        ...sessions.map(s => [
          format(s.startTime, 'yyyy-MM-dd HH:mm'),
          s.title,
          format(s.startTime, 'MMM dd, p'),
          s.location,
          s.creatorName
        ])
      ];

      // Add Bookings sheet if it doesn't exist (creating a spreadsheet via POST already creates 'Sheet1')
      // For simplicity, we'll write Weight to Sheet1 and add a new sheet for Bookings
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: 'Bookings' } } }]
        })
      });

      // Append Weight to Sheet1
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: weightValues })
      });

      // Append Bookings to Bookings sheet
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Bookings!A1:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: sessionValues })
      });

      alert(`Successfully synced ${entries.length} weight entries and ${sessions.length} bookings to Google Sheets!`);
    } catch (error) {
      console.error("Sheets Sync Error:", error);
      alert("Failed to sync to Google Sheets. Check your connection and permissions.");
    } finally {
      setIsSyncing(false);
    }
  };

  const chartData = entriesSorted.map(e => ({
    date: format(e.date, 'MMM dd'),
    timestamp: e.date.getTime(),
    weight: e.value
  }));

  // Correcting index logic for status
  const getStatusForHistory = (entry: WeightEntry, idx: number) => {
    if (idx === entriesDesc.length - 1) return null; // Oldest entry has no previous
    const previousEntry = entriesDesc[idx + 1];
    const diff = entry.value - previousEntry.value;
    return {
      diff: Number(diff.toFixed(1)),
      trend: diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable'
    };
  };

  const latestEntry = entriesDesc[0];
  const oldestEntry = entriesDesc[entriesDesc.length - 1];
  const overallDiff = latestEntry && oldestEntry ? latestEntry.value - oldestEntry.value : 0;

  return (
    <div className="space-y-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Form Card */}
        <div className="lg:col-span-4 bg-dark-surface border border-dark-border rounded-[40px] p-8 shadow-2xl relative overflow-hidden h-fit">
          <div className="absolute top-0 left-0 w-full h-[6px] bg-brand-primary"></div>
          <h3 className="text-2xl font-black uppercase tracking-tighter mb-6">Log Weight</h3>
          
          {latestEntry && (
            <div className="mb-8 flex items-center justify-between p-4 bg-dark-bg/40 rounded-3xl border border-dark-border/50">
               <div>
                  <p className="text-[10px] font-black uppercase text-dark-text-muted tracking-widest mb-1">Current Entry</p>
                  <div className="flex items-baseline gap-1">
                     <span className="text-3xl font-black">{latestEntry.value}</span>
                     <span className="text-xs font-bold text-brand-primary">KG</span>
                  </div>
               </div>
               {entriesDesc.length > 1 && (
                  <div className="text-right">
                     <p className="text-[10px] font-black uppercase text-dark-text-muted tracking-widest mb-1">Overall</p>
                     <div className={`flex items-center gap-1 font-black ${overallDiff > 0 ? 'text-red-500' : overallDiff < 0 ? 'text-green-500' : 'text-dark-text-muted'}`}>
                        {overallDiff > 0 ? <TrendingUp size={16} /> : overallDiff < 0 ? <TrendingDown size={16} /> : <Minus size={16} />}
                        <span>{Math.abs(overallDiff).toFixed(1)} KG</span>
                     </div>
                  </div>
               )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-dark-text-muted">New Weight Log (KG)</label>
              <input 
                type="number" 
                step="0.1"
                placeholder="e.g. 75.5"
                className="w-full bg-dark-bg border border-dark-border rounded-2xl px-6 py-4 text-xl font-black focus:border-brand-primary outline-none transition-all"
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
              />
            </div>
            <button 
              type="submit" 
              disabled={isSubmitting || !newValue}
              className="w-full h-16 bg-white text-dark-bg rounded-3xl font-black text-sm hover:scale-[1.02] active:scale-95 transition-all shadow-xl disabled:opacity-50"
            >
              RECORD PROGRESS
            </button>
          </form>
          {/* Sync Button */}
          <button 
            onClick={syncToSheets}
            disabled={isSyncing || entries.length === 0}
            className="w-full mt-4 h-12 bg-green-500/10 text-green-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-green-500 hover:text-white transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {isSyncing ? 'SYNCING...' : 'SYNC WITH GOOGLE SHEETS'}
          </button>
        </div>

        {/* Chart Card */}
        <div className="lg:col-span-8 bg-dark-surface border border-dark-border rounded-[40px] p-8 shadow-2xl h-[450px] relative overflow-hidden">
          <div className="flex items-center justify-between mb-8">
             <h3 className="text-2xl font-black uppercase tracking-tighter">Performance Trajectory</h3>
             <div className="flex gap-4">
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-brand-primary"></div>
                   <span className="text-[10px] font-black uppercase text-dark-text-muted tracking-widest">Weight (KG)</span>
                </div>
             </div>
          </div>
          <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2D303E" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 700 }} 
                  dy={10}
                />
                <YAxis 
                   hide 
                   domain={['dataMin - 2', 'dataMax + 2']} 
                />
                <Tooltip 
                   cursor={{ stroke: '#3B82F6', strokeWidth: 1, strokeDasharray: '5 5' }}
                   contentStyle={{ backgroundColor: '#1C1E26', border: '1px solid #2D303E', borderRadius: '16px', padding: '12px' }}
                   itemStyle={{ color: '#white', fontWeight: 900, textTransform: 'uppercase', fontSize: '10px' }}
                   labelStyle={{ color: '#9CA3AF', marginBottom: '4px', fontSize: '10px', fontWeight: 700 }}
                />
                <Area 
                  type="monotone" 
                  dataKey="weight" 
                  stroke="#3B82F6" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorWeight)" 
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* History List */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-4">
           <h3 className="text-xl font-black uppercase tracking-widest border-l-4 border-brand-primary pl-4">Tactical Log History</h3>
           <span className="text-[10px] font-black text-dark-text-muted uppercase tracking-widest">{entries.length} RECORDS</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {entriesDesc.map((entry, idx) => {
            const status = getStatusForHistory(entry, idx);
            return (
              <div key={entry.id} className="group bg-dark-surface border border-dark-border rounded-[32px] p-6 flex flex-col gap-4 hover:bg-[#232630] hover:border-brand-primary/30 transition-all relative overflow-hidden shadow-xl">
                <div className="flex justify-between items-start">
                   <div className="flex flex-col">
                      <span className="text-[10px] font-black text-dark-text-muted uppercase tracking-widest mb-1">{format(entry.date, 'MMM dd, yyyy')}</span>
                      <span className="text-[8px] font-bold text-dark-text-muted/50 uppercase tracking-tighter">{format(entry.date, 'h:mm a')}</span>
                   </div>
                   {status && (
                      <div className={`px-3 py-1 rounded-full text-[9px] font-black flex items-center gap-1 border ${
                        status.trend === 'up' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 
                        status.trend === 'down' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 
                        'bg-dark-bg text-dark-text-muted border-dark-border'
                      }`}>
                         {status.trend === 'up' ? <TrendingUp size={10} /> : status.trend === 'down' ? <TrendingDown size={10} /> : <Minus size={10} />}
                         {Math.abs(status.diff)} KG
                      </div>
                   )}
                </div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-4xl font-black tracking-tighter">{entry.value}</span>
                  <span className="text-sm font-black text-brand-primary uppercase">KG</span>
                </div>
              </div>
            );
          })}
          {entries.length === 0 && <div className="col-span-full py-24 border-2 border-dashed border-dark-border rounded-[40px] flex flex-col items-center justify-center gap-4 opacity-40">
             <LayoutDashboard size={48} className="text-dark-text-muted" />
             <span className="text-lg font-black uppercase tracking-widest">No progress reports received</span>
          </div>}
        </div>
      </div>
    </div>
  );
}

function SettingsView({ user, onNavigate }: { user: any, onNavigate?: (view: any) => void }) {
  const displayUser = user || {
    displayName: 'Guest Athlete',
    email: 'guest@flexsync.app',
    photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=guest_user`
  };
  
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="bg-dark-surface border border-dark-border rounded-[40px] p-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[6px] bg-brand-primary"></div>
        <div className="flex items-center gap-6 mb-10">
          <div className="relative">
             <img src={displayUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${displayUser.uid}`} className="w-24 h-24 rounded-[32px] border-4 border-brand-primary/20" />
             {displayUser.role === 'admin' && <div className="absolute -top-2 -right-2 bg-brand-primary text-white text-[8px] font-black px-2 py-0.5 rounded-full border border-dark-bg transition-transform hover:scale-110">ADMIN</div>}
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight">{displayUser.displayName}</h2>
            <p className="text-brand-primary font-bold uppercase tracking-widest text-xs mt-1">
              STATUS: {displayUser.role === 'admin' ? 'ROOT ADMIN' : 'ELITE ATHLETE'}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-6 bg-dark-bg/50 border border-dark-border rounded-3xl">
            <h4 className="text-xs font-black uppercase tracking-widest text-dark-text-muted mb-2">Identifier</h4>
            <div className="flex justify-between items-center">
              <span className="font-bold">{displayUser.email || `G-CODE: ${displayUser.code}`}</span>
            </div>
          </div>

          <div className="p-6 bg-dark-bg/50 border border-dark-border rounded-3xl">
            <h4 className="text-xs font-black uppercase tracking-widest text-dark-text-muted mb-2">Display Name</h4>
            <div className="flex justify-between items-center">
              <span className="font-bold">{displayUser.displayName}</span>
            </div>
          </div>

          {user?.role === 'admin' && (
            <button 
              onClick={() => onNavigate?.('Accounts')}
              className="w-full h-20 bg-brand-primary text-white rounded-[24px] font-black text-sm hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-brand-primary/40 flex items-center justify-center gap-4 border-b-4 border-brand-primary-dark"
            >
              <Users size={24} />
              MANAGE ATHLETE ACCOUNTS
            </button>
          )}

          <div className="p-8 bg-blue-500/10 border border-blue-500/20 rounded-[32px]">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-4 flex items-center gap-2">
              <Share2 size={12} />
              Deployment & Setup
            </h4>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-black text-white uppercase mb-2">Mobile PWA (iOS/Android)</p>
                <ol className="text-[11px] text-dark-text-muted space-y-2 font-medium">
                  <li className="flex gap-2"><span>1. Open URL in Safari/Chrome</span></li>
                  <li className="flex gap-2"><span>2. Tap Share / Menu</span></li>
                  <li className="flex gap-2"><span>3. "Add to Home Screen"</span></li>
                </ol>
              </div>
              <div className="pt-2 border-t border-blue-500/10">
                <p className="text-[10px] font-black text-white uppercase mb-2">Google Sheets Sync (GAS)</p>
                <p className="text-[11px] text-dark-text-muted leading-relaxed">
                  To sync data to Google Sheets, use the code in <code>/google-apps-script</code>. 
                  Deploy as a Web App and use the provided ID in your Sheets extension.
                </p>
              </div>
            </div>
          </div>

          {user && (
            <button 
              onClick={() => logOut()}
              className="w-full h-16 bg-red-500/10 text-red-500 rounded-3xl font-black text-sm hover:bg-red-500 hover:text-white transition-all"
            >
              TERMINATE CURRENT SESSION
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ onCodeLogin, gasUrl, useGoogleSheets }: { onCodeLogin: (user: any) => void; gasUrl?: string; useGoogleSheets: boolean }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { db } = useFirebase();

  const handleCodeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    setLoading(true);
    setError('');
    
    // 0. CHECK GOOGLE SHEET SYNC FIRST
    const isFirebaseDummy = !db || db.app.options.apiKey.includes('dummy');
    const isUsingGoogleSheets = (useGoogleSheets || isFirebaseDummy) && gasUrl;
    
    if (isUsingGoogleSheets) {
      try {
        const resp = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: 'validate', data: { code: code.toUpperCase() } }),
        });
        
        if (!resp.ok) {
           setError(`Sheet Sync Error (Status: ${resp.status}). Verify your Web App URL.`);
           setLoading(false);
           return;
        }

        const res = await resp.json();
        if (res.success) {
          onCodeLogin({ 
            uid: `gas_${res.user.name}`, 
            displayName: res.user.name, 
            role: res.user.role, 
            code: res.user.code 
          });
          setLoading(false);
          return;
        } else {
          setError(res.error || 'Invalid code. Please check your sheet Users tab.');
          setLoading(false);
          return;
        }
      } catch (gasErr) {
        console.warn("GAS Auth failed", gasErr);
        setError('Connection to Google Sheets failed. Ensure the script is deployed as "Anyone".');
        setLoading(false);
        return;
      }
    }

    // Special admin code override
    if (code === '011426') {
      try {
        let authUser;
        try {
          const authResult = await signInAnonymously(auth);
          authUser = authResult.user;
        } catch (authErr) {
          console.warn("Auth failed, using mock admin", authErr);
          authUser = { uid: 'admin_override' };
        }
        
        onCodeLogin({
          uid: authUser.uid,
          displayName: 'Root Admin',
          role: 'admin',
          code: '011426'
        });
        return;
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      // 1. Sign in anonymously
      let guestUid: string;
      const isDummy = !auth || (auth.app.options.apiKey === 'dummy-key' || auth.app.options.apiKey === 'dummy-api-key');
      
      try {
        if (isDummy) throw new Error("DUMMY_MODE");
        const authResult = await signInAnonymously(auth);
        guestUid = authResult.user.uid;
      } catch (authErr: any) {
        // Check local storage for codes if Firebase Auth fails or in dummy mode
        const localUsersStr = localStorage.getItem('flexsync_local_users');
        if (localUsersStr) {
          const localUsers = JSON.parse(localUsersStr);
          const found = localUsers.find((u: any) => u.code === code.toUpperCase());
          if (found) {
            onCodeLogin({ ...found, uid: found.uid || 'local_user' });
            return;
          }
        }
        
        if (authErr.message === "DUMMY_MODE") {
          setError('Firebase setup in progress. Valid cold codes currently not available. Use admin code if authorized.');
          return;
        }
        
        throw new Error("AUTHENTICATION_FAILED");
      }

      // 2. Find user with this code
      const q = query(collection(db, 'users'), where('code', '==', code.toUpperCase()), limit(1));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const userDoc = snap.docs[0];
        const userData = userDoc.data();
        
        // 3. Update the user record with the NEW anonymous UID
        try {
          await updateDoc(doc(db, 'users', userDoc.id), {
            uid: guestUid,
            updatedAt: Timestamp.now()
          });
        } catch (updErr) {
          console.warn("Could not update user record", updErr);
        }

        onCodeLogin({ ...userData, uid: guestUid });
      } else {
        await auth.signOut(); // Clean up if failed
        setError('Invalid grind code. Contact admin.');
      }
    } catch (e: any) {
      console.error(e);
      if (e.message === "AUTHENTICATION_FAILED" || e.code?.includes('api-key')) {
        setError('Firebase not configured. Please wait or use admin code.');
      } else {
        setError('Connection error. Try your internet.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-dark-bg flex items-center justify-center p-6 relative overflow-hidden font-sans">
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-brand-primary/10 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/10 blur-[100px] rounded-full pointer-events-none"></div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-dark-surface border border-dark-border rounded-[40px] p-10 shadow-2xl relative z-10"
      >
        <div className="flex items-center gap-4 mb-10">
          <div className="w-12 h-12 bg-brand-primary rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-brand-primary/30">F</div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase leading-none">FlexSync</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-dark-text-muted mt-1">Authentication Hub</p>
          </div>
        </div>

        <form onSubmit={handleCodeLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-dark-text-muted ml-1">Athlete Grind Code</label>
            <input 
              type="text" 
              placeholder="000-000"
              className="w-full bg-dark-bg border border-dark-border rounded-2xl px-6 py-5 text-center text-2xl font-black tracking-[0.5em] focus:border-brand-primary outline-none transition-all placeholder:text-dark-text-muted/10 placeholder:tracking-normal uppercase"
              value={code}
              onChange={e => setCode(e.target.value)}
              maxLength={10}
            />
          </div>

          {error && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">{error}</p>}

          <button 
            type="submit"
            disabled={loading}
            className="group w-full bg-brand-primary hover:bg-brand-primary-light text-white font-black py-5 rounded-2xl shadow-xl shadow-brand-primary/20 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-3"
          >
            {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : (
              <>
                <TrendingUp size={16} className="group-hover:translate-y-[-2px] transition-transform" />
                Initialize Grind
              </>
            )}
          </button>
        </form>

        <div className="mt-10 pt-10 border-t border-dark-border/50">
          <button 
            onClick={() => signInWithGoogle()}
            className="w-full bg-dark-bg border border-dark-border hover:bg-dark-surface-lighter text-dark-text font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-[9px] flex items-center justify-center gap-3"
          >
            <Lock size={12} className="text-brand-primary" />
            Root Admin Override
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Lock({ size, className }: { size?: number, className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size || 24} 
      height={size || 24} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="3" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function AccountsView({ gasUrl, setGasUrl, useGoogleSheets, setUseGoogleSheets, isAdmin }: { gasUrl: string; setGasUrl: (url: string) => void; useGoogleSheets: boolean; setUseGoogleSheets: (val: boolean) => void; isAdmin: boolean }) {
  const { db } = useFirebase();
  const [syncUrl, setSyncUrl] = useState(gasUrl);
  const [users, setUsers] = useState<any[]>([]);
  const [gasUsers, setGasUsers] = useState<any[]>([]);
  const [localUsers, setLocalUsers] = useState<any[]>(() => {
    const saved = localStorage.getItem('flexsync_local_users');
    return saved ? JSON.parse(saved) : [];
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', role: 'user' as 'admin' | 'user' });
  const [lastIssued, setLastIssued] = useState<{name: string, code: string} | null>(null);

  useEffect(() => {
    // 1. Fetch from GAS if active
    if (gasUrl && (useGoogleSheets || !db || db.app.options.apiKey.includes('dummy'))) {
      fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'getUsers', data: {} })
      })
      .then(res => res.json())
      .then(res => {
        if (res.success) setGasUsers(res.data);
      })
      .catch(e => console.warn("GAS Registry sync failed", e));
    }

    // 2. Fetch from Firebase
    if (db && db.app.options.apiKey !== 'dummy-key' && !useGoogleSheets) {
      const q = query(collection(db, 'users'), orderBy('displayName', 'asc'));
      const unsub = onSnapshot(q, {
        next: (snap) => {
          setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        },
        error: (err) => {
          console.warn("Snapshot error (likely permissions/config):", err);
          setLoading(false);
        }
      });
      return () => unsub();
    } else {
      // Fallback to local users combined with any existing ones
      setLoading(false);
    }
  }, [db, useGoogleSheets, gasUrl]);

  const allUsersList = useMemo(() => {
    // Merge real users, gas users, and local users, avoiding duplicates by code
    const combined = [...users];
    
    gasUsers.forEach(gu => {
      if (!combined.some(u => u.code === gu.code)) {
        combined.push({
          id: `gas_${gu.name}`,
          displayName: gu.name,
          role: gu.role,
          code: gu.code,
          isGas: true
        });
      }
    });

    localUsers.forEach(lu => {
      if (!combined.some(u => u.code === lu.code)) {
        combined.push(lu);
      }
    });
    return combined.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  }, [users, localUsers, gasUsers]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name) return;
    
    setSubmitting(true);
    const tempId = nanoid(10);
    const code = nanoid(6).toUpperCase();
    const userData = {
      uid: tempId,
      displayName: newUser.name,
      role: newUser.role,
      code: code,
      createdAt: new Date().toISOString(),
      isLocal: false
    };

    try {
      // 0. CLOUD SYNC
      if (gasUrl) {
        try {
          const resp = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'createUser', data: { name: newUser.name, role: newUser.role } }),
          });
          const res = await resp.json();
          if (res.success) {
            setLastIssued({ name: newUser.name, code: res.code });
            setNewUser({ name: '', role: 'user' });
            // Refresh gas list
            const gRes = await fetch(gasUrl, { 
              method: 'POST', 
              headers: { 'Content-Type': 'text/plain' }, 
              body: JSON.stringify({ action: 'getUsers', data: {} }) 
            });
            const gd = await gRes.json();
            if (gd.success) setGasUsers(gd.data);
            setSubmitting(false);
            return;
          }
        } catch (gasErr) {
          console.warn("GAS Registry Save failed", gasErr);
        }
      }

      // Check for dummy DB
      if (!db || (db.app.options.apiKey === 'dummy-key')) {
        throw new Error("FIREBASE_NOT_CONNECTED");
      }

      await setDoc(doc(db, 'users', tempId), userData);
      if (newUser.role === 'admin') {
        await setDoc(doc(db, 'admins', tempId), { userId: tempId });
      }
      setLastIssued({ name: newUser.name, code });
      setNewUser({ name: '', role: 'user' });
    } catch (e: any) {
      console.warn("Firebase save failed or not connected, using Local Mode", e);
      
      const localData = { ...userData, isLocal: true, id: tempId };
      const updatedLocal = [localData, ...localUsers];
      setLocalUsers(updatedLocal);
      localStorage.setItem('flexsync_local_users', JSON.stringify(updatedLocal));
      
      setLastIssued({ name: newUser.name, code });
      setNewUser({ name: '', role: 'user' });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteUser = async (u: any) => {
    if (!confirm(`Delete user ${u.displayName}?`)) return;
    
    if (u.isLocal) {
      const updated = localUsers.filter(lu => lu.id !== u.id);
      setLocalUsers(updated);
      localStorage.setItem('flexsync_local_users', JSON.stringify(updated));
      return;
    }

    try {
      if (!db || db.app.options.apiKey === 'dummy-key') return;
      await deleteDoc(doc(db, 'users', u.id));
      if (u.role === 'admin') {
        await deleteDoc(doc(db, 'admins', u.id));
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `users/${u.id}`);
    }
  };

  if (loading) return <div className="py-20 flex justify-center"><div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="space-y-12 pb-24">
      <div className="bg-dark-surface border border-dark-border rounded-[40px] p-8 lg:p-12 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[6px] bg-orange-500"></div>
        <div className="max-w-2xl">
          <h2 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase mb-6 leading-none">Neural Sync Hive</h2>
          <p className="text-lg text-dark-text-muted font-medium mb-10 leading-relaxed italic">
            "The sheet is the truth. The app is the interface."
          </p>

          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <input 
              type="text" 
              value={syncUrl}
              onChange={(e) => setSyncUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="flex-1 bg-dark-bg border border-dark-border rounded-2xl px-6 py-4 text-xs font-bold focus:border-orange-500 outline-none transition-all"
            />
            <button 
              onClick={() => {
                localStorage.setItem('flexsync_gas_url_v2', syncUrl);
                setGasUrl(syncUrl);
                alert("Protocol Updated. Neural Sync prioritized.");
              }}
              className="bg-orange-600 hover:bg-orange-500 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[9px] shadow-xl transition-all h-[52px]"
            >
              Initialize Sync
            </button>
          </div>
          
          <button
            onClick={() => {
              if (isAdmin) setUseGoogleSheets(!useGoogleSheets);
              else alert('Only admins can toggle sync source');
            }}
            className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 border-2 transition-all ${
              useGoogleSheets ? 'bg-green-500/20 text-green-500 border-green-500/50' : 'bg-dark-bg text-dark-text-muted border-dark-border'
            }`}
          >
            {useGoogleSheets ? 'USING GOOGLE SHEETS AS SOURCE' : 'USING FIREBASE AS SOURCE'}
          </button>
        </div>
      </div>

      <div className="bg-dark-surface border border-dark-border rounded-[40px] p-8 lg:p-12 relative overflow-hidden shadow-2xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-primary mb-1 ml-1">Athlete Deployment Registry</h3>
            <div className="flex items-center gap-2 mb-8">
              <div className={`w-2 h-2 rounded-full animate-pulse ${(!db || db.app.options.apiKey.includes('dummy')) ? 'bg-orange-500' : 'bg-green-500'}`}></div>
              <p className="text-[10px] font-black uppercase tracking-widest text-dark-text-muted">
                {(!db || db.app.options.apiKey.includes('dummy')) ? 'Local Node Active (Cloud Sync Disabled)' : 'Neural Sync established (Cloud Live)'}
              </p>
            </div>
          </div>
          
          <button 
            onClick={() => {
              const url = window.location.href;
              navigator.clipboard.writeText(url);
              alert("App link copied! Share this with athletes. Instruct them to 'Add to Home Screen' via Safari/Chrome.");
            }}
            className="flex items-center gap-2 px-6 py-3 bg-dark-bg border border-dark-border rounded-2xl text-[10px] font-black uppercase tracking-widest text-dark-text hover:bg-dark-surface-lighter transition-all"
          >
            <Share2 size={14} className="text-brand-primary" />
            Quick Share Link
          </button>
        </div>

        <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-dark-text-muted ml-3">Athlete Name</label>
            <input 
              required
              type="text" 
              placeholder="e.g. John Wick"
              className="w-full bg-dark-bg border border-dark-border rounded-2xl px-6 py-4 text-sm font-bold focus:border-brand-primary outline-none transition-all"
              value={newUser.name}
              onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-dark-text-muted ml-3">Security Clearances</label>
            <select 
              className="w-full bg-dark-bg border border-dark-border rounded-2xl px-6 py-4 text-sm font-bold focus:border-brand-primary outline-none transition-all appearance-none uppercase"
              value={newUser.role}
              onChange={e => setNewUser(p => ({ ...p, role: e.target.value as any }))}
            >
              <option value="user">STANDARD OPERATIVE</option>
              <option value="admin">ROOT ADMINISTRATOR</option>
            </select>
          </div>
          <div className="flex items-end">
            <button 
              disabled={submitting}
              className="w-full bg-brand-primary hover:bg-brand-primary-light text-white font-black py-4 rounded-2xl shadow-lg transition-all uppercase tracking-widest text-[9px] h-[58px]"
            >
              {submitting ? 'GENERATING KEY...' : 'ISSUE NEW GRIND CODE'}
            </button>
          </div>
        </form>

        {lastIssued && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 p-6 bg-brand-primary/10 border border-brand-primary/20 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4"
          >
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-brand-primary mb-1">New Key Issued Successfully</p>
              <p className="text-xl font-black text-white">{lastIssued.name}</p>
            </div>
            <div className="flex flex-col items-center md:items-end">
              <p className="text-[10px] font-black uppercase tracking-widest text-dark-text-muted mb-1">Activation Code</p>
              <p className="text-3xl font-black text-brand-primary tracking-[0.2em]">{lastIssued.code}</p>
            </div>
          </motion.div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {allUsersList.map(u => (
          <div key={u.id} className="bg-dark-surface border border-dark-border rounded-[32px] p-6 flex flex-col gap-6 relative overflow-hidden group hover:bg-[#232630] transition-all">
            {u.isLocal && (
              <div className="absolute top-4 right-4 bg-orange-500/20 text-orange-500 text-[8px] font-black uppercase px-2 py-1 rounded-full tracking-widest border border-orange-500/10">
                Local Only
              </div>
            )}
            <div className="flex items-center gap-4">
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`} className="w-14 h-14 rounded-2xl border border-dark-border bg-dark-bg" alt="User" />
              <div className="overflow-hidden">
                <h4 className="text-lg font-black uppercase truncate leading-none">{u.displayName}</h4>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border ${u.role === 'admin' ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20' : 'bg-dark-bg text-dark-text-muted border-dark-border'}`}>
                    {u.role?.toUpperCase()}
                  </span>
                  <span className="text-[7px] font-bold text-dark-text-muted/40 uppercase tracking-widest">
                    ID: {u.id.substring(0, 8)}
                  </span>
                </div>
              </div>
            </div>
            <div className="bg-dark-bg/60 p-5 rounded-2xl border border-dark-border/50 flex items-center justify-between shadow-inner">
               <div className="flex flex-col">
                  <span className="text-[8px] font-black text-dark-text-muted uppercase tracking-widest mb-1">Active Grind Key</span>
                  <span className="text-xl font-black tracking-[0.3em] text-brand-primary font-mono">{u.code}</span>
               </div>
               <button 
                 onClick={() => deleteUser(u)} 
                 className="p-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all"
                 title="Revoke Access"
               >
                 <LogOut size={16} />
               </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
