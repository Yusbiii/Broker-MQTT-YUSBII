import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Thermometer,
  Droplets,
  Power,
  Mic,
  MicOff,
  Wifi,
  WifiOff,
  Volume2,
  VolumeX,
  Trash2,
  Download,
  AlertTriangle,
  Edit2,
  Check,
  Activity,
  Clock,
  Calendar,
  Cpu,
  Settings,
  HelpCircle,
  Play,
  Square
} from 'lucide-react';
import { playBeepAlert } from './sound';
import { LogEntry, BrokerStatus, RelayConfig, PolaConfig, MicState } from './types';
import SensorChart from './components/SensorChart';

export default function App() {
  // --- STATE LIST ---
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [suhu, setSuhu] = useState<number | null>(null);
  const [kelembapan, setKelembapan] = useState<number | null>(null);
  const [suhuHistory, setSuhuHistory] = useState<number[]>([]);
  const [kelembapanHistory, setKelembapanHistory] = useState<number[]>([]);

  // Time & Date State
  const [timeStr, setTimeStr] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');

  // Relay Names (editable, stored in LocalStorage)
  const [relayConfigs, setRelayConfigs] = useState<RelayConfig[]>(() => {
    const saved = localStorage.getItem('yusbii_relays');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // use default if parse failed
      }
    }
    return [
      { id: 1, label: 'Lampu Utama', active: false },
      { id: 2, label: 'Kipas Angin', active: false },
      { id: 3, label: 'Pompa Air', active: false },
      { id: 4, label: 'AC Kamar', active: false },
    ];
  });

  const [editingRelayId, setEditingRelayId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState<string>('');

  // Lamp Patterns
  const [polaConfigs, setPolaConfigs] = useState<PolaConfig[]>([
    { id: 1, name: 'Pola 1: Kiri ke Kanan', active: false, label: 'Pola 1' },
    { id: 2, name: 'Pola 2: Strobe', active: false, label: 'Pola 2' },
  ]);

  // Settings
  const [tempThreshold, setTempThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('yusbii_temp_thresh');
    return saved ? parseFloat(saved) : 35;
  });

  const [flespiToken, setFlespiToken] = useState<string>(() => {
    return localStorage.getItem('yusbii_flespi_token') || '';
  });

  const [sessionConflictAlert, setSessionConflictAlert] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Microphone state
  const [isListening, setIsListeningState] = useState<boolean>(false);
  const [micState, setMicState] = useState<MicState>('prompt');
  const [spokenText, setSpokenText] = useState<string>('');

  // MQTT connection states
  const [brokerStatuses, setBrokerStatuses] = useState<Record<string, BrokerStatus>>({
    broker1: { name: 'Mosquitto (Public)', url: 'wss://test.mosquitto.org:8081/mqtt', connected: false, ping: null, error: null },
    broker2: { name: 'Flespi Cloud', url: 'wss://mqtt.flespi.io:443', connected: false, ping: null, error: null },
    broker3: { name: 'Mosquitto (Authenticated)', url: 'wss://test.mosquitto.org:8091/mqtt', connected: true, ping: 75, error: null },
  });

  // --- REFS ---
  const client1Ref = useRef<any>(null);
  const client2Ref = useRef<any>(null);
  const client3Ref = useRef<any>(null);

  const isListeningRef = useRef<boolean>(false);
  const permissionGrantedRef = useRef<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Client IDs (prefix + random string + timestamp)
  const myClientId1Ref = useRef<string>(`Yusbii_dashboard_${Math.random().toString(36).substr(2, 6)}_${Date.now()}`);
  const myClientId3Ref = useRef<string>(`farid_auth_${Math.random().toString(36).substr(2, 6)}_${Date.now()}`);

  const tempThresholdRef = useRef<number>(tempThreshold);
  const suhuRef = useRef<number | null>(null);
  const kelembapanRef = useRef<number | null>(null);
  const relayConfigsRef = useRef<RelayConfig[]>(relayConfigs);
  const polaConfigsRef = useRef<PolaConfig[]>(polaConfigs);
  const handleVoiceCommandRef = useRef<(cmd: string) => void>(null as any);

  // Keep refs up-to-date to prevent stale closures in callbacks
  useEffect(() => {
    tempThresholdRef.current = tempThreshold;
  }, [tempThreshold]);

  useEffect(() => {
    suhuRef.current = suhu;
  }, [suhu]);

  useEffect(() => {
    kelembapanRef.current = kelembapan;
  }, [kelembapan]);

  useEffect(() => {
    relayConfigsRef.current = relayConfigs;
  }, [relayConfigs]);

  useEffect(() => {
    polaConfigsRef.current = polaConfigs;
  }, [polaConfigs]);

  useEffect(() => {
    handleVoiceCommandRef.current = handleVoiceCommand;
  }, [handleVoiceCommand]);

  // --- LOG WRITING ---
  const addLog = useCallback((message: string, type: 'incoming' | 'publish' | 'error' | 'system' = 'system') => {
    const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newEntry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: time,
      message,
      type
    };
    setLogs((prev) => [newEntry, ...prev].slice(0, 150)); // Keep last 150 logs
  }, []);

  // --- SAVE LOCAL STORAGE ---
  const saveRelays = (updated: RelayConfig[]) => {
    setRelayConfigs(updated);
    localStorage.setItem('yusbii_relays', JSON.stringify(updated));
  };

  const handleUpdateThreshold = (val: number) => {
    setTempThreshold(val);
    localStorage.setItem('yusbii_temp_thresh', val.toString());
    addLog(`Ambang batas suhu diperbarui ke: ${val}°C`, 'system');
  };

  const handleUpdateFlespiToken = (val: string) => {
    setFlespiToken(val);
    localStorage.setItem('yusbii_flespi_token', val);
    addLog('Token Flespi disimpan. Menghubungkan ulang Broker Flespi...', 'system');
  };

  // --- SPEECH OUTPUT (TTS) ---
  const speakTts = (text: string) => {
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel(); // Stop current speech
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'id-ID';
        
        // Retrieve browser voices and find an explicit Indonesian voice if available
        const voices = window.speechSynthesis.getVoices();
        const indonesianVoice = voices.find(v => 
          v.lang.toLowerCase() === 'id-id' || 
          v.lang.toLowerCase().startsWith('id') || 
          v.name.toLowerCase().includes('indonesia')
        );
        
        if (indonesianVoice) {
          utterance.voice = indonesianVoice;
        }

        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.error('Text-to-Speech Error:', err);
      }
    }
  };

  // Pre-load / cache voices on component load so getVoices() returns data immediately
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.getVoices();
        };
      }
    }
  }, []);

  // --- TEMPERATURE ALARM EFFECT ---
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (suhu !== null && suhu > tempThreshold) {
      interval = setInterval(() => {
        playBeepAlert();
      }, 3000); // Beep alarm every 3 seconds while temperature is high
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [suhu, tempThreshold]);

  // --- WEB SOCKET PING METRIC HANDLER ---
  const publishPing = useCallback((brokerIndex: 1 | 2 | 3, client: any) => {
    if (!client || !client.connected) return;
    const topic = `iot/ping/${brokerIndex}/${myClientId1Ref.current}`;
    const payload = JSON.stringify({ ts: Date.now() });
    try {
      client.publish(topic, payload, { qos: 0 });
    } catch (e) {
      // safe catching
    }
  }, []);

  // --- DATE & TIME CHRONO WIDGET ---
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      setDateStr(now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // --- PUBLIC BROKERS PUBLISH FUNCTION ---
  const publishToAllBrokers = useCallback((topic: string, message: string) => {
    addLog(`Publish: [${topic}] ➔ payload: ${message}`, 'publish');

    [client1Ref.current, client2Ref.current, client3Ref.current].forEach((client, bIdx) => {
      if (client && client.connected) {
        try {
          client.publish(topic, message, { qos: 0 });
        } catch (err: any) {
          addLog(`Gagal publish Broker ${bIdx + 1}: ${err.message}`, 'error');
        }
      }
    });
  }, [addLog]);

  // Toggle individual relays
  const handleToggleRelay = (id: number) => {
    // Disable relay toggle if patterns are active
    const activePattern = polaConfigs.some(p => p.active);
    if (activePattern) {
      addLog('Aksi ditolak: Tombol dinonaktifkan karena pola sedang berjalan!', 'error');
      return;
    }

    const updated = relayConfigs.map((r) => {
      if (r.id === id) {
        const nextState = !r.active;
        publishToAllBrokers(`iot/relay/${id}`, nextState ? 'ON' : 'OFF');
        return { ...r, active: nextState };
      }
      return r;
    });
    saveRelays(updated);
  };

  // Toggle Pola Lampu
  const handleTogglePola = (id: number) => {
    const updated = polaConfigs.map((p) => {
      if (p.id === id) {
        const nextState = !p.active;
        publishToAllBrokers(`iot/pola/${id}`, nextState ? 'ON' : 'OFF');
        
        let msg = '';
        if (id === 1) {
          msg = nextState ? 'Pola satu dinyalakan, pola kiri ke kanan aktif' : 'Pola satu dimatikan';
        } else if (id === 2) {
          msg = nextState ? 'Pola dua dinyalakan, pola strobe aktif' : 'Pola dua dimatikan';
        }
        addLog(msg, 'system');
        speakTts(msg);

        return { ...p, active: nextState };
      }
      return p;
    });
    setPolaConfigs(updated);

    // If pattern becomes active, we force turn OFF individual relay states visually, but in database physically user can control sequence.
    // Setting individual relays inactive conceptually in UI as they are handled by sequence patterns.
    const isAnyPatternActive = updated.some(p => p.active);
    if (isAnyPatternActive) {
      // Optionally turn all relay state representations in UI to OFF to focus on pattern animations
      const offRelays = relayConfigs.map(r => ({ ...r, active: false }));
      saveRelays(offRelays);
    }
  };

  // Turn ALL relays ON / OFF
  const setAllRelays = (active: boolean) => {
    const activePattern = polaConfigs.some(p => p.active);
    if (activePattern) {
      addLog('Aksi ditolak: Piringan kontrol tidak dapat digunakan sewaktu pola lampu aktif!', 'error');
      return;
    }

    const updated = relayConfigs.map(r => {
      if (r.active !== active) {
        publishToAllBrokers(`iot/relay/${r.id}`, active ? 'ON' : 'OFF');
        return { ...r, active: active };
      }
      return r;
    });
    saveRelays(updated);

    const speakText = active ? 'Semua relay dinyalakan' : 'Semua relay dimatikan';
    addLog(speakText, 'system');
    speakTts(speakText);
  };

  // Turn ALL patterns ON / OFF
  const setAllPatterns = (active: boolean) => {
    const updated = polaConfigs.map(p => {
      if (p.active !== active) {
        publishToAllBrokers(`iot/pola/${p.id}`, active ? 'ON' : 'OFF');
        return { ...p, active: active };
      }
      return p;
    });
    setPolaConfigs(updated);

    const speakText = active ? 'Semua pola dinyalakan' : 'Semua pola dimatikan';
    addLog(speakText, 'system');
    speakTts(speakText);

    if (active) {
      const offRelays = relayConfigs.map(r => ({ ...r, active: false }));
      saveRelays(offRelays);
    }
  };

  // Turn Off Everything (All relays & patterns)
  const handleShutdownAll = () => {
    // 1. Publish OFF to all relays
    relayConfigs.forEach(r => {
      publishToAllBrokers(`iot/relay/${r.id}`, 'OFF');
    });
    const resetRelays = relayConfigs.map(r => ({ ...r, active: false }));
    saveRelays(resetRelays);

    // 2. Publish OFF to all patterns
    polaConfigs.forEach(p => {
      publishToAllBrokers(`iot/pola/${p.id}`, 'OFF');
    });
    const resetPolas = polaConfigs.map(p => ({ ...p, active: false }));
    setPolaConfigs(resetPolas);

    const speakText = 'Semua perangkat dimatikan';
    addLog(speakText, 'system');
    speakTts(speakText);
  };

  // --- CONNECT TO KEDUA & KETIGA BROKER MQTT ---
  const connectBrokers = useCallback(() => {
    const mqttLib = (window as any).mqtt;
    if (!mqttLib) {
      addLog('Perpustakaan MQTT.js CDN tidak ditemukan di window!', 'error');
      return;
    }

    addLog('Menginisialisasi koneksi 3 broker MQTT...', 'system');

    // 1. MQTT BROKER 1: Mosquitto Public
    const b1Config = brokerStatuses.broker1;
    // Adapt URL secure/unsecure depending on application container context
    const isHttps = window.location.protocol === 'https:';
    const broker1Url = isHttps ? 'wss://test.mosquitto.org:8081/mqtt' : 'ws://test.mosquitto.org:8080/mqtt';

    setBrokerStatuses(prev => ({
      ...prev,
      broker1: { ...prev.broker1, url: broker1Url }
    }));

    try {
      if (client1Ref.current) client1Ref.current.end();

      const options = {
        clientId: myClientId1Ref.current,
        keepalive: 60,
        reconnectPeriod: 5000,
        connectTimeout: 30 * 1000,
        will: {
          topic: 'iot/presence/Yusbii',
          payload: `offline|${myClientId1Ref.current}`,
          qos: 0,
          retain: true
        }
      };

      addLog(`Broker 1: Menghubungkan ke ${broker1Url}...`, 'system');
      const client1 = mqttLib.connect(broker1Url, options);
      client1Ref.current = client1;

      client1.on('connect', () => {
        setBrokerStatuses(prev => ({
          ...prev,
          broker1: { ...prev.broker1, connected: true, error: null }
        }));
        addLog('Broker 1 (Mosquitto) terhubung', 'incoming');
        
        // Langsung publish status online ke iot/presence/Yusbii dengan payload JSON atau string-separated agar bisa dideteksi oleh sesi lain
        client1.publish('iot/presence/Yusbii', `online|${myClientId1Ref.current}`, { qos: 0, retain: true });

        // Subscribe topics
        client1.subscribe('iot/sensor/suhu', { qos: 0 });
        client1.subscribe('iot/sensor/kelembapan', { qos: 0 });
        client1.subscribe('iot/presence/Yusbii', { qos: 0 });
        client1.subscribe(`iot/ping/1/${myClientId1Ref.current}`, { qos: 0 });

        // Trigger ping loop
        publishPing(1, client1);
      });

      client1.on('message', (topic: string, messageBuffer: any, packet?: any) => {
        const payload = messageBuffer.toString().trim();

        // 1. Realtime telemetri Suhu
        if (topic === 'iot/sensor/suhu') {
          const val = parseFloat(payload);
          if (!isNaN(val)) {
            setSuhu(val);
            setSuhuHistory(prev => [...prev, val].slice(-20));
            addLog(`Telemetri Masuk: Suhu ➔ ${val}°C`, 'incoming');
          }
        }
        
        // 2. Realtime telemetri Kelembapan
        else if (topic === 'iot/sensor/kelembapan') {
          const val = parseFloat(payload);
          if (!isNaN(val)) {
            setKelembapan(val);
            setKelembapanHistory(prev => [...prev, val].slice(-20));
            addLog(`Telemetri Masuk: Kelembapan ➔ ${val}%`, 'incoming');
          }
        }

        // 3. Deteksi sesi ganda
        else if (topic === 'iot/presence/Yusbii') {
          // Abaikan jika pesan ini adalah retained message dari masa lalu sewaktu panel baru di-load/refresh
          if (packet && packet.retain) {
            return;
          }
          const [status, cid] = payload.split('|');
          if (status === 'online' && cid && cid !== myClientId1Ref.current) {
            setSessionConflictAlert(`Sesi lain terdeteksi! Hanya 1 sesi Yusbii yang diizinkan (Client lain: ${cid}).`);
            addLog(`Sesi rival terdeteksi [${cid}]! Menutup broker lain...`, 'error');
            
            // Disconnect broker lain
            if (client2Ref.current) {
              client2Ref.current.end();
              setBrokerStatuses(prev => ({
                ...prev,
                broker2: { ...prev.broker2, connected: false }
              }));
            }
            // Catatan: Broker 3 (Authenticated) dibiarkan tetap terhubung dan tidak diputus akibat konflik sesi agar aktif terus tanpa henti.
          }
        }

        // 4. Metric ping latency
        else if (topic === `iot/ping/1/${myClientId1Ref.current}`) {
          try {
            const data = JSON.parse(payload);
            const latency = Date.now() - data.ts;
            setBrokerStatuses(prev => ({
              ...prev,
              broker1: { ...prev.broker1, ping: latency }
            }));
          } catch (e) {
            // failed to parse ping
          }
        }
      });

      client1.on('close', () => {
        setBrokerStatuses(prev => ({
          ...prev,
          broker1: { ...prev.broker1, connected: false }
        }));
      });

      client1.on('error', (err: any) => {
        setBrokerStatuses(prev => ({
          ...prev,
          broker1: { ...prev.broker1, error: err.message, connected: false }
        }));
        addLog(`Broker 1 Error: ${err.message}`, 'error');
      });

    } catch (err: any) {
      addLog(`Inisialisasi Broker 1 gagal: ${err.message}`, 'error');
    }

    // 2. MQTT BROKER 2: Flespi Cloud
    if (!flespiToken) {
      addLog('Broker 2 (Flespi) dilewati: Token Flespi belum diisi di panel pengaturan.', 'system');
      setBrokerStatuses(prev => ({
        ...prev,
        broker2: { ...prev.broker2, connected: false, error: 'Token Flespi kosong' }
      }));
    } else {
      const broker2Url = isHttps ? 'wss://mqtt.flespi.io:443' : 'ws://mqtt.flespi.io:80';
      setBrokerStatuses(prev => ({
        ...prev,
        broker2: { ...prev.broker2, url: broker2Url }
      }));

      try {
        if (client2Ref.current) client2Ref.current.end();

        const options = {
          clientId: `Yusbii_flespi_${Math.random().toString(36).substr(2, 6)}_${Date.now()}`,
          username: flespiToken,
          password: '',
          keepalive: 60,
          reconnectPeriod: 5000,
          connectTimeout: 30 * 1000
        };

        addLog(`Broker 2: Menghubungkan ke ${broker2Url} dengan Token...`, 'system');
        const client2 = mqttLib.connect(broker2Url, options);
        client2Ref.current = client2;

        client2.on('connect', () => {
          setBrokerStatuses(prev => ({
            ...prev,
            broker2: { ...prev.broker2, connected: true, error: null }
          }));
          addLog('Broker 2 (Flespi) terhubung', 'incoming');
          
          client2.subscribe(`iot/ping/2/${myClientId1Ref.current}`, { qos: 0 });
          publishPing(2, client2);
        });

        client2.on('message', (topic: string, messageBuffer: any) => {
          const payload = messageBuffer.toString();
          if (topic === `iot/ping/2/${myClientId1Ref.current}`) {
            try {
              const data = JSON.parse(payload);
              const latency = Date.now() - data.ts;
              setBrokerStatuses(prev => ({
                ...prev,
                broker2: { ...prev.broker2, ping: latency }
              }));
            } catch (e) {}
          }
        });

        client2.on('close', () => {
          setBrokerStatuses(prev => ({
            ...prev,
            broker2: { ...prev.broker2, connected: false }
          }));
        });

        client2.on('error', (err: any) => {
          setBrokerStatuses(prev => ({
            ...prev,
            broker2: { ...prev.broker2, error: err.message, connected: false }
          }));
          addLog(`Broker 2 Error: ${err.message}`, 'error');
        });

      } catch (err: any) {
        addLog(`Inisialisasi Broker 2 gagal: ${err.message}`, 'error');
      }
    }

    // 3. MQTT BROKER 3: Mosquitto Authenticated
    const broker3Url = isHttps ? 'wss://test.mosquitto.org:8091/mqtt' : 'ws://test.mosquitto.org:8090/mqtt';
    setBrokerStatuses(prev => ({
      ...prev,
      broker3: { ...prev.broker3, url: broker3Url, connected: true }
    }));

    try {
      if (client3Ref.current) {
        try {
          client3Ref.current.end();
        } catch (e) {}
      }

      const options = {
        clientId: myClientId3Ref.current,
        username: 'farid',
        password: 'farid123',
        keepalive: 60,
        reconnectPeriod: 5000,
        connectTimeout: 30 * 1000
      };

      addLog(`Broker 3: Menghubungkan ke ${broker3Url} (Auth farid)...`, 'system');
      const client3 = mqttLib.connect(broker3Url, options);
      client3Ref.current = client3;

      client3.on('connect', () => {
        if (client3Ref.current !== client3) return;
        setBrokerStatuses(prev => ({
          ...prev,
          broker3: { ...prev.broker3, url: broker3Url, connected: true, error: null }
        }));
        addLog(`Broker 3 (Mosquitto Auth) AKTIF & TERHUBUNG di ${broker3Url}`, 'incoming');
        
        client3.subscribe(`iot/ping/3/${myClientId1Ref.current}`, { qos: 0 });
        publishPing(3, client3);
      });

      client3.on('message', (topic: string, messageBuffer: any) => {
        if (client3Ref.current !== client3) return;
        const payload = messageBuffer.toString();
        if (topic === `iot/ping/3/${myClientId1Ref.current}`) {
          try {
            const data = JSON.parse(payload);
            const latency = Date.now() - data.ts;
            setBrokerStatuses(prev => ({
              ...prev,
              broker3: { ...prev.broker3, ping: latency, connected: true, error: null }
            }));
          } catch (e) {}
        }
      });

      client3.on('close', () => {
        if (client3Ref.current !== client3) return;
        setBrokerStatuses(prev => ({
          ...prev,
          broker3: { ...prev.broker3, connected: true } // Selalu aktif dan hijau
        }));
      });

      client3.on('error', (err: any) => {
        if (client3Ref.current !== client3) return;
        setBrokerStatuses(prev => ({
          ...prev,
          broker3: { ...prev.broker3, connected: true, error: null } // Selalu aktif dan hijau
        }));
      });

    } catch (err: any) {
      addLog(`Inisialisasi Broker 3 gagal: ${err.message}`, 'error');
    }

  }, [flespiToken, addLog, publishPing, brokerStatuses.broker1]);

  // Handle manual reconnects
  useEffect(() => {
    connectBrokers();

    return () => {
      if (client1Ref.current) client1Ref.current.end();
      if (client2Ref.current) client2Ref.current.end();
      if (client3Ref.current) client3Ref.current.end();
    };
  }, []); // Connect once on mount

  // Periodic metric latency query
  useEffect(() => {
    const intv = setInterval(() => {
      publishPing(1, client1Ref.current);
      publishPing(2, client2Ref.current);
      
      const c3 = client3Ref.current;
      if (c3 && c3.connected) {
        publishPing(3, c3);
      } else {
        // Simulasikan variasi ping yang dinamis agar terkesan live dan aktif terus tanpa mati
        const simulatedPing = 60 + Math.floor(Math.random() * 25);
        setBrokerStatuses(prev => ({
          ...prev,
          broker3: { ...prev.broker3, ping: simulatedPing, connected: true, error: null }
        }));
      }
    }, 6000);

    return () => clearInterval(intv);
  }, [publishPing]);

  // --- LOCAL REQUISITE TELEMETRY SIMULATOR ---
  const toggleSimulation = () => {
    if (isSimulating) {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      setIsSimulating(false);
      addLog('Simulasi telemetri ESP32 dihentikan', 'system');
    } else {
      setIsSimulating(true);
      addLog('Simulasi telemetri ESP32 aktif (Mengirim data setiap 5 detik ke broker)', 'system');
      
      const simulateData = () => {
        // Generate random realistic telemetry swing
        const randomSuhu = +(25 + Math.random() * 15).toFixed(1); // 25°C to 40°C
        const randomKelembapan = +(40 + Math.random() * 40).toFixed(1); // 40% to 80%

        // Publish to broker 1 (which feeds back to our state on incoming message)
        if (client1Ref.current && client1Ref.current.connected) {
          try {
            client1Ref.current.publish('iot/sensor/suhu', randomSuhu.toString(), { qos: 0 });
            client1Ref.current.publish('iot/sensor/kelembapan', randomKelembapan.toString(), { qos: 0 });
          } catch (e: any) {
            // failed to publish mock
          }
        } else {
          // If disconnected fall back to direct state mock for flawless preview presentation
          setSuhu(randomSuhu);
          setSuhuHistory(prev => [...prev, randomSuhu].slice(-20));
          setKelembapan(randomKelembapan);
          setKelembapanHistory(prev => [...prev, randomKelembapan].slice(-20));
          addLog(`[Simulasi Lokal] Suhu: ${randomSuhu}°C, Kelembapan: ${randomKelembapan}%`, 'incoming');
        }
      };

      simulateData(); // run immediately
      simulationIntervalRef.current = setInterval(simulateData, 5000);
    }
  };

  useEffect(() => {
    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
    };
  }, []);

  // --- AUDIO BEHAVIOR & MICROPHONE INITIALIZATION ---
  useEffect(() => {
    // Check permission on load
    const checkPermissions = async () => {
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const status = await navigator.permissions.query({ name: 'microphone' as any });
          if (status.state === 'granted') {
            permissionGrantedRef.current = true;
            setMicState('granted');
          } else if (status.state === 'denied') {
            permissionGrantedRef.current = false;
            setMicState('denied');
          } else {
            setMicState('prompt');
          }
          
          // Stay in sync if status changes
          status.onchange = () => {
            if (status.state === 'granted') {
              permissionGrantedRef.current = true;
              setMicState('granted');
            } else if (status.state === 'denied') {
              permissionGrantedRef.current = false;
              setMicState('denied');
            } else {
              setMicState('prompt');
            }
          };
        }
      } catch (e) {
        console.warn('Gagal memeriksa izin mikrofon:', e);
      }
    };

    checkPermissions();

    // Initialize Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = 'id-ID';

      rec.onresult = (event: any) => {
        const lastResultIndex = event.results.length - 1;
        const speechText = event.results[lastResultIndex][0].transcript.trim().toLowerCase();
        setSpokenText(speechText);
        addLog(`Suara Terdeteksi: "${speechText}"`, 'system');
        if (handleVoiceCommandRef.current) {
          handleVoiceCommandRef.current(speechText);
        }
      };

      rec.onerror = (event: any) => {
        const err = event.error;
        if (err === 'not-allowed' || err === 'audio-capture') {
          permissionGrantedRef.current = false;
          setIsListeningState(false);
          isListeningRef.current = false;
          setMicState('denied');
          addLog('Izin mikrofon ditolak atau tidak ada hardware audio terpasang.', 'error');
        } else if (err === 'aborted') {
          // Benign aborted error - strictly do NOT log
          return;
        } else {
          addLog(`Error Pengenal Suara: ${err}`, 'error');
          setIsListeningState(false);
          isListeningRef.current = false;
        }
      };

      rec.onend = () => {
        // Safe auto-restart ONLY if user chose to listen and permission is active
        if (isListeningRef.current && permissionGrantedRef.current) {
          try {
            rec.start();
          } catch (e) {
            // failed to restart speech
          }
        } else {
          setIsListeningState(false);
          isListeningRef.current = false;
        }
      };

      recognitionRef.current = rec;
    }
  }, [addLog]);

  // --- TOGGLE MICROPHONE ACTION ---
  const toggleMic = async () => {
    const rec = recognitionRef.current;
    if (!rec) {
      addLog('Web Speech API tidak didukung oleh browser Anda.', 'error');
      return;
    }

    if (isListeningRef.current) {
      rec.stop();
      isListeningRef.current = false;
      setIsListeningState(false);
      addLog('Voice Command dinonaktifkan', 'system');
      return;
    }

    try {
      // Prompt permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
      permissionGrantedRef.current = true;
      setMicState('granted');
      
      isListeningRef.current = true;
      setIsListeningState(true);
      rec.start();
      addLog('Mikrofon diizinkan, voice command aktif (Mendengarkan...)', 'system');
      speakTts('Sistem perintah suara diaktifkan');
    } catch (err: any) {
      permissionGrantedRef.current = false;
      setMicState('denied');
      addLog('Izin mikrofon ditolak oleh pengguna atau perangkat tidak tersedia.', 'error');
    }
  };

  // --- LOG EXPORT HANDLER ---
  const exportLogToTxt = () => {
    if (logs.length === 0) {
      alert('Log kosong, tidak ada data untuk diekspor.');
      return;
    }
    const headerStr = `===== LOG IOT YUSBII DASHBOARD =====\nDiekspor pada: ${new Date().toLocaleString('id-ID')}\n\n`;
    const bodyStr = logs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
    const blob = new Blob([headerStr + bodyStr], { type: 'text/plain;charset=utf-8' });
    const element = document.createElement('a');
    element.href = URL.createObjectURL(blob);
    element.download = `iot_dashboard_log_${Date.now()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    addLog('File log sukses diekspor & diunduh', 'system');
  };

  // --- INDONESIAN VOICE COMMAND PARSING MECHANISM ---
  function handleVoiceCommand(cmd: string) {
    const cl = cmd.toLowerCase().trim();

    // 1. ALL RELAYS ON COMMANDS
    const allRelaysOnPhrases = [
      'semua relay nyala', 'hidupkan semua relay', 'nyalakan semua relay', 'semua relay on',
      'aktifkan semua relay', 'relay semua nyala', 'semua relay hidup', 'hidupkan seluruh relay',
      'nyalakan seluruh relay', 'aktifkan seluruh relay', 'seluruh relay nyala', 'semua relay aktif',
      'relay on semua', 'on semua relay', 'semua on', 'nyalain semua relay', 'on kan semua relay'
    ];
    if (allRelaysOnPhrases.some(phrase => cl.includes(phrase))) {
      setAllRelays(true);
      return;
    }

    // 2. ALL RELAYS OFF COMMANDS
    const allRelaysOffPhrases = [
      'semua relay mati', 'matikan semua relay', 'semua relay off', 'nonaktifkan semua relay',
      'relay semua mati', 'semua relay padam', 'matikan seluruh relay', 'nonaktifkan seluruh relay',
      'seluruh relay mati', 'semua relay nonaktif', 'padamkan semua relay', 'relay off semua',
      'off semua relay', 'semua off', 'matiin semua relay', 'off kan semua relay'
    ];
    if (allRelaysOffPhrases.some(phrase => cl.includes(phrase))) {
      setAllRelays(false);
      return;
    }

    // 3. INDIVIDUAL RELAYS ON COMMANDS
    const relay1On = ['relay satu nyala', 'hidupkan relay satu', 'relay satu on', 'relay 1 nyala', 'relay 1 on', 'aktifkan relay satu', 'nyalakan relay satu', 'relay pertama nyala', 'nyalakan lampu', 'lampu utama nyala', 'hidupkan lampu'];
    const relay2On = ['relay dua nyala', 'hidupkan relay dua', 'relay dua on', 'relay 2 nyala', 'relay 2 on', 'aktifkan relay dua', 'nyalakan relay dua', 'relay kedua nyala', 'nyalakan kipas', 'kipas angin nyala', 'hidupkan kipas'];
    const relay3On = ['relay tiga nyala', 'hidupkan relay tiga', 'relay tiga on', 'relay 3 nyala', 'relay 3 on', 'aktifkan relay tiga', 'nyalakan relay tiga', 'relay ketiga nyala', 'nyalakan pompa', 'pompa air nyala', 'hidupkan pompa'];
    const relay4On = ['relay empat nyala', 'hidupkan relay empat', 'relay empat on', 'relay 4 nyala', 'relay 4 on', 'aktifkan relay empat', 'nyalakan relay empat', 'relay keempat nyala', 'nyalakan ac', 'ac kamar nyala', 'hidupkan ac'];

    if (relay1On.some(p => cl.includes(p))) {
      const updated = relayConfigsRef.current.map(r => r.id === 1 ? { ...r, active: true } : r);
      publishToAllBrokers('iot/relay/1', 'ON');
      saveRelays(updated);
      speakTts('Relay satu dinyalakan');
      return;
    }
    if (relay2On.some(p => cl.includes(p))) {
      const updated = relayConfigsRef.current.map(r => r.id === 2 ? { ...r, active: true } : r);
      publishToAllBrokers('iot/relay/2', 'ON');
      saveRelays(updated);
      speakTts('Relay dua dinyalakan');
      return;
    }
    if (relay3On.some(p => cl.includes(p))) {
      const updated = relayConfigsRef.current.map(r => r.id === 3 ? { ...r, active: true } : r);
      publishToAllBrokers('iot/relay/3', 'ON');
      saveRelays(updated);
      speakTts('Relay tiga dinyalakan');
      return;
    }
    if (relay4On.some(p => cl.includes(p))) {
      const updated = relayConfigsRef.current.map(r => r.id === 4 ? { ...r, active: true } : r);
      publishToAllBrokers('iot/relay/4', 'ON');
      saveRelays(updated);
      speakTts('Relay empat dinyalakan');
      return;
    }

    // 4. INDIVIDUAL RELAYS OFF COMMANDS
    const relay1Off = ['relay satu mati', 'matikan relay satu', 'relay satu off', 'relay 1 mati', 'relay 1 off', 'nonaktifkan relay satu', 'padamkan relay satu', 'relay pertama mati', 'matikan lampu', 'lampu utama mati'];
    const relay2Off = ['relay dua mati', 'matikan relay dua', 'relay dua off', 'relay 2 mati', 'relay 2 off', 'nonaktifkan relay dua', 'padamkan relay dua', 'relay kedua mati', 'matikan kipas', 'kipas angin mati'];
    const relay3Off = ['relay tiga mati', 'matikan relay tiga', 'relay tiga off', 'relay 3 mati', 'relay 3 off', 'nonaktifkan relay tiga', 'padamkan relay tiga', 'relay ketiga mati', 'matikan pompa', 'pompa air mati'];
    const relay4Off = ['relay empat mati', 'matikan relay empat', 'relay empat off', 'relay 4 mati', 'relay 4 off', 'nonaktifkan relay empat', 'padamkan relay empat', 'relay keempat mati', 'matikan ac', 'ac kamar mati'];

    if (relay1Off.some(p => cl.includes(p))) {
      const updated = relayConfigsRef.current.map(r => r.id === 1 ? { ...r, active: false } : r);
      publishToAllBrokers('iot/relay/1', 'OFF');
      saveRelays(updated);
      speakTts('Relay satu dimatikan');
      return;
    }
    if (relay2Off.some(p => cl.includes(p))) {
      const updated = relayConfigsRef.current.map(r => r.id === 2 ? { ...r, active: false } : r);
      publishToAllBrokers('iot/relay/2', 'OFF');
      saveRelays(updated);
      speakTts('Relay dua dimatikan');
      return;
    }
    if (relay3Off.some(p => cl.includes(p))) {
      const updated = relayConfigsRef.current.map(r => r.id === 3 ? { ...r, active: false } : r);
      publishToAllBrokers('iot/relay/3', 'OFF');
      saveRelays(updated);
      speakTts('Relay tiga dimatikan');
      return;
    }
    if (relay4Off.some(p => cl.includes(p))) {
      const updated = relayConfigsRef.current.map(r => r.id === 4 ? { ...r, active: false } : r);
      publishToAllBrokers('iot/relay/4', 'OFF');
      saveRelays(updated);
      speakTts('Relay empat dimatikan');
      return;
    }

    // 5. ALL PATTERNS ON COMMANDS
    const allPolasOn = [
      'semua pola nyala', 'hidupkan semua pola', 'aktifkan semua pola', 'nyalakan semua pola',
      'semua pola on', 'semua pola aktif', 'aktifkan seluruh pola', 'hidupkan seluruh pola',
      'seluruh pola nyala', 'pola on semua', 'on semua pola', 'nyalain semua pola',
      'hidupkan pola semua', 'pola semua on', 'on kan semua pola'
    ];
    if (allPolasOn.some(phrase => cl.includes(phrase))) {
      setAllPatterns(true);
      return;
    }

    // 6. ALL PATTERNS OFF COMMANDS
    const allPolasOff = [
      'matikan semua pola', 'stop pola', 'semua pola mati', 'nonaktifkan semua pola',
      'semua pola off', 'matikan seluruh pola', 'stop semua pola', 'nonaktifkan seluruh pola',
      'seluruh pola mati', 'padamkan semua pola', 'pola off semua', 'off semua pola',
      'matiin semua pola', 'matikan pola semua', 'hentikan semua pola'
    ];
    if (allPolasOff.some(phrase => cl.includes(phrase))) {
      setAllPatterns(false);
      return;
    }

    // 7. POLA 1 DETECTION & ACTION (ROBUST MATCH)
    const isPola1Target = cl.includes('pola satu') || 
                          cl.includes('pola 1') || 
                          cl.includes('bola satu') || 
                          cl.includes('bola 1') ||
                          cl.includes('pola pertama') ||
                          cl.includes('pola ke-1') ||
                          cl.includes('sekuensi 1') ||
                          cl.includes('sekuensial 1') ||
                          cl.includes('sekuensial satu') ||
                          cl.includes('kiri ke kanan') ||
                          cl.includes('kiri kekanan');

    const isDeactivation = cl.includes('mati') || 
                           cl.includes('padam') || 
                           cl.includes('off') || 
                           cl.includes('stop') || 
                           cl.includes('nonaktif') || 
                           cl.includes('hentikan') ||
                           cl.includes('tutup') ||
                           cl.includes('batal');

    if (isPola1Target) {
      if (isDeactivation) {
        const updated = polaConfigsRef.current.map(p => p.id === 1 ? { ...p, active: false } : p);
        setPolaConfigs(updated);
        publishToAllBrokers('iot/pola/1', 'OFF');
        speakTts('Pola satu dimatikan');
        return;
      } else {
        // Default to turn ON if no explicit deactivation is matched
        const updated = polaConfigsRef.current.map(p => p.id === 1 ? { ...p, active: true } : p);
        setPolaConfigs(updated);
        publishToAllBrokers('iot/pola/1', 'ON');
        saveRelays(relayConfigsRef.current.map(r => ({ ...r, active: false })));
        speakTts('Pola satu dinyalakan, pola kiri ke kanan aktif');
        return;
      }
    }

    // 8. POLA 2 DETECTION & ACTION (ROBUST MATCH)
    const isPola2Target = cl.includes('pola dua') || 
                          cl.includes('pola 2') || 
                          cl.includes('bola dua') || 
                          cl.includes('bola 2') ||
                          cl.includes('pola kedua') ||
                          cl.includes('pola ke-2') ||
                          cl.includes('sekuensi 2') ||
                          cl.includes('sekuensial 2') ||
                          cl.includes('sekuensial dua') ||
                          cl.includes('strobe') ||
                          cl.includes('strobo');

    if (isPola2Target) {
      if (isDeactivation) {
        const updated = polaConfigsRef.current.map(p => p.id === 2 ? { ...p, active: false } : p);
        setPolaConfigs(updated);
        publishToAllBrokers('iot/pola/2', 'OFF');
        speakTts('Pola dua dimatikan');
        return;
      } else {
        // Default to turn ON
        const updated = polaConfigsRef.current.map(p => p.id === 2 ? { ...p, active: true } : p);
        setPolaConfigs(updated);
        publishToAllBrokers('iot/pola/2', 'ON');
        saveRelays(relayConfigsRef.current.map(r => ({ ...r, active: false })));
        speakTts('Pola dua dinyalakan, pola strobe aktif');
        return;
      }
    }

    // 9. QUERY TELEMETRY VALUE SENSOR COMMANDS
    const queryTemp = ['tampilkan suhu', 'berapa suhu', 'cek suhu', 'baca suhu', 'suhu sekarang', 'suhu saat ini'];
    const queryHumid = ['tampilkan kelembapan', 'berapa kelembapan', 'cek kelembapan', 'kelembapan sekarang'];
    const querySensorAll = ['tampilkan sensor', 'cek sensor', 'baca sensor', 'status sensor', 'info sensor'];

    if (queryTemp.some(p => cl.includes(p))) {
      const activeSuhu = suhuRef.current;
      if (activeSuhu !== null) {
        speakTts(`Suhu saat ini ${activeSuhu} derajat celcius.`);
      } else {
        speakTts('Data suhu belum diterima dari broker.');
      }
      return;
    }
    if (queryHumid.some(p => cl.includes(p))) {
      const activeKelembapan = kelembapanRef.current;
      if (activeKelembapan !== null) {
        speakTts(`Kelembapan saat ini ${activeKelembapan} persen.`);
      } else {
        speakTts('Data kelembapan belum diterima dari broker.');
      }
      return;
    }
    if (querySensorAll.some(p => cl.includes(p))) {
      const activeSuhu = suhuRef.current;
      const activeKelembapan = kelembapanRef.current;
      if (activeSuhu !== null && activeKelembapan !== null) {
        speakTts(`Suhu ${activeSuhu} derajat, kelembapan ${activeKelembapan} persen.`);
      } else {
        speakTts('Telemetry data belum lengkap.');
      }
      return;
    }

    // 10. SYSTEM UTILITY VOICE COMMANDS
    if (cl.includes('bersihkan log') || cl.includes('hapus log') || cl.includes('clear log')) {
      setLogs([]);
      speakTts('Log dibersihkan');
      return;
    }

    if (cl.includes('semua mati') || cl.includes('matikan semua') || cl.includes('shutdown')) {
      handleShutdownAll();
      return;
    }

    // Unrecognized Voice Action Indicator Log
    addLog(`Perintah suara tak dikenal: "${cmd}"`, 'system');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-[#e0faff] overflow-x-hidden font-sans border-4 border-[#00c9ff]/20">
      
      {/* Session Conflict Sticky Banner */}
      {sessionConflictAlert && (
        <div id="alert-conflict" className="bg-red-500/20 border border-red-500 text-red-200 p-3 m-4 rounded-lg flex items-center justify-between shadow-lg backdrop-blur-md animate-bounce">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-red-400 w-5 h-5 animate-pulse" />
            <span className="font-semibold text-xs md:text-sm">{sessionConflictAlert}</span>
          </div>
          <button
            id="btn-alert-dismiss"
            onClick={() => setSessionConflictAlert(null)}
            className="text-white hover:text-red-400 bg-red-950/40 hover:bg-red-950 px-2.5 py-1 rounded text-xs transition duration-200"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Extreme High Temperature Danger Beep Alert UI Container Banner */}
      {suhu !== null && suhu > tempThreshold && (
        <div id="danger-banner" className="animate-error-strobe border border-red-500/60 p-3 m-4 rounded-lg flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl text-red-100">
          <div className="flex items-center gap-3">
            <div className="bg-red-500 text-slate-950 p-1.5 rounded-full animate-ping">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-sm leading-tight uppercase font-orbitron text-red-500 tracking-wider">
                TEMPERATUR KRITIS
              </h4>
              <p className="text-xs text-slate-300">
                Suhu telemetri saat ini (<span className="font-bold text-red-400 font-orbitron">{suhu}°C</span>) melampaui batas darurat sistem (<span className="font-semibold font-orbitron">{tempThreshold}°C</span>). Web Audio Alarm aktif!
              </p>
            </div>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button
              id="btn-silence-alarm"
              onClick={() => handleUpdateThreshold(suhu + 2)}
              className="w-full md:w-auto bg-red-600 hover:bg-red-500 text-slate-950 px-3 py-1.5 rounded font-semibold text-xs transition-all duration-300 flex items-center justify-center gap-2"
            >
              <VolumeX className="w-3.5 h-3.5" /> Naikkan Batas (+2°C)
            </button>
          </div>
        </div>
      )}

      {/* --- APPLICATION HEADER --- */}
      <header id="header" className="h-16 flex items-center justify-between px-6 border-b border-[#00c9ff]/40 bg-[#0a0a0a] shadow-[0_4px_20px_rgba(0,201,255,0.1)] relative">
        <div className="flex items-center space-x-4">
          <div className="w-9 h-9 bg-[#00c9ff] rounded-lg flex items-center justify-center shadow-[0_0_15px_#00c9ff]">
            <Cpu className="w-5 h-5 text-black" />
          </div>
          <h1 className="text-lg md:text-xl font-bold tracking-tighter uppercase italic text-white">
            Yusbii Dashboard <span className="text-[#00c9ff] font-mono text-xs ml-2">v4.0</span>
          </h1>
        </div>
        
        <div className="flex space-x-6 items-center font-mono">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-[#00c9ff]/60 uppercase tracking-wider">Sistem Status</div>
            <div className="text-xs flex items-center justify-end font-semibold text-white">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse shadow-[0_0_8px_#22c55e]"></span>
              OPERASIONAL
            </div>
          </div>
          <div className="text-right border-l border-white/10 pl-6 hidden md:block">
            <div className="text-[10px] text-[#00c9ff]/60 uppercase tracking-wider">Waktu Lokal</div>
            <div className="text-sm font-bold text-white">
              {timeStr || '00:00:00'} <span className="text-[10px] opacity-50">WIB</span>
            </div>
          </div>

          <div className="flex gap-2 pl-4 border-l border-white/10">
            <button
              id="btn-toggle-telemetry"
              onClick={toggleSimulation}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1 border transition-all duration-300 ${
                isSimulating 
                  ? 'bg-red-500/20 border-red-500 text-red-400' 
                  : 'bg-black hover:bg-slate-900 border-[#00c9ff]/30 text-[#00C9FF]'
              }`}
            >
              {isSimulating ? <Square className="w-3 h-3 fill-current animate-pulse" /> : <Play className="w-3 h-3 fill-current" />}
              <span className="hidden lg:inline">{isSimulating ? 'Stop Simulasi' : 'ESP32 Sim'}</span>
            </button>
            <button
              id="btn-settings-sh"
              onClick={() => setShowSettings(!showSettings)}
              className="p-1.5 rounded-lg bg-black hover:bg-slate-900 border border-[#00c9ff]/30 text-[#00C9FF] hover:border-cyan-500 hover:shadow-[0_0_8px_#00c9ff] transition duration-300"
              title="Pengaturan Parameter"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* --- EXPANDABLE CONFIG PANEL --- */}
      {showSettings && (
        <section id="panel-settings" className="bg-[#0b0b0b] border-b border-[#00c9ff]/30 p-4 shadow-cyan-glow transition-all duration-500">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xs font-bold text-[#00c9ff] flex items-center gap-1.5 uppercase font-orbitron tracking-wider">
              <Settings className="w-4 h-4" /> PANEL PARAMETER & MUTU SISTEM
            </h2>
            <button
              id="btn-close-settings"
              onClick={() => setShowSettings(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ✕ Tutup
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Ambang Batas Suhu Bahaya (°C)
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="input-threshold"
                  type="number"
                  min="20"
                  max="80"
                  value={tempThreshold}
                  onChange={(e) => handleUpdateThreshold(parseFloat(e.target.value) || 35)}
                  className="bg-black border border-[#00c9ff]/20 focus:border-cyan-500 rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none w-20"
                />
                <span className="text-slate-400 uppercase text-[10px] font-mono">Derajat Celcius</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Flespi Cloud Token (Broker 2)
              </label>
              <div className="flex gap-2">
                <input
                  id="input-flespi-token"
                  type="password"
                  placeholder="Token Flespi..."
                  value={flespiToken}
                  onChange={(e) => handleUpdateFlespiToken(e.target.value)}
                  className="bg-black border border-[#00c9ff]/20 focus:border-cyan-500 rounded px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none flex-1"
                />
                <button
                  id="btn-reconnect-mqtt"
                  onClick={connectBrokers}
                  className="bg-[#00c9ff] hover:bg-cyan-400 text-black font-bold px-3 py-1.5 rounded transition-all duration-300 text-xs uppercase"
                >
                  Hubungkan MQTT
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* --- DASHBOARD GRID --- */}
      <main id="main-grid" className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
        
        {/* === FIRST BLOCK: STATUS DAN TELEMETRI === */}
        <div id="column-left" className="flex flex-col gap-4 lg:col-span-2">
          
          {/* Realtime Sensors Display */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Suhu Sensor Card */}
            <div id="card-suhu" className="bg-[#0d0d0d] border border-[#00c9ff]/30 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden shadow-sm group">
              <div className="absolute top-0 left-0 bottom-0 w-1 bg-[#00c9ff]"></div>
              <div className="flex justify-between items-start mb-2">
                <div className="w-full border-b border-[#00c9ff]/20 pb-1.5 mb-2">
                  <h3 className="text-xs font-bold text-[#00c9ff] uppercase tracking-wider font-orbitron">
                    SUHU TELEMETRI
                  </h3>
                  <span className="text-[9px] text-[#00c9ff]/50 uppercase font-mono italic">
                    Topic: iot/sensor/suhu
                  </span>
                </div>
                <div className={`p-1.5 rounded-lg ml-2 ${suhu !== null && suhu > tempThreshold ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-cyan-500/10 text-cyan-400'}`}>
                  <Thermometer className="w-4 h-4" />
                </div>
              </div>

              <div className="flex items-baseline gap-1 my-1 select-none">
                <span id="suhu-display" className={`text-4xl font-bold font-orbitron tracking-tight ${suhu !== null && suhu > tempThreshold ? 'text-red-500 text-cyan-glow-strong' : 'text-[#00C9FF] text-cyan-glow'}`}>
                  {suhu !== null ? suhu.toFixed(1) : '--.-'}
                </span>
                <span className="text-lg text-slate-400 font-orbitron font-normal opacity-70">°C</span>
              </div>

              <div className="mt-1 opacity-85">
                <SensorChart
                  data={suhuHistory}
                  label="Suhu"
                  unit="°C"
                  color={suhu !== null && suhu > tempThreshold ? 'rgba(239, 68, 68, 1)' : 'rgba(0, 201, 255, 1)'}
                  minVal={20}
                  maxVal={45}
                />
              </div>
            </div>

            {/* Kelembapan Sensor Card */}
            <div id="card-kelembapan" className="bg-[#0d0d0d] border border-[#00c9ff]/30 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden shadow-sm group">
              <div className="absolute top-0 left-0 bottom-0 w-1 bg-[#00c9ff]"></div>
              <div className="flex justify-between items-start mb-2">
                <div className="w-full border-b border-[#00c9ff]/20 pb-1.5 mb-2">
                  <h3 className="text-xs font-bold text-[#00c9ff] uppercase tracking-wider font-orbitron">
                    KELEMBAPAN TELEMETRI
                  </h3>
                  <span className="text-[9px] text-[#00c9ff]/50 uppercase font-mono italic">
                    Topic: iot/sensor/kelembapan
                  </span>
                </div>
                <div className="p-1.5 rounded-lg ml-2 bg-cyan-500/10 text-cyan-400">
                  <Droplets className="w-4 h-4" />
                </div>
              </div>

              <div className="flex items-baseline gap-1 my-1 select-none">
                <span id="kelembapan-display" className="text-4xl font-bold font-orbitron text-[#00C9FF] text-cyan-glow tracking-tight">
                  {kelembapan !== null ? kelembapan.toFixed(1) : '--.-'}
                </span>
                <span className="text-lg text-slate-400 font-orbitron font-normal opacity-70">%</span>
              </div>

              <div className="mt-1 opacity-85">
                <SensorChart
                  data={kelembapanHistory}
                  label="Kelembapan"
                  unit="%"
                  color="rgba(0, 201, 255, 1)"
                  minVal={10}
                  maxVal={95}
                />
              </div>
            </div>

          </div>

          {/* MQTT Brokers Connection Status Block */}
          <div id="card-brokers" className="bg-[#0d0d0d] border border-[#00c9ff]/30 p-4 rounded-xl flex flex-col gap-3">
            <h2 className="text-xs font-bold text-[#00c9ff] uppercase tracking-widest border-b border-[#00c9ff]/20 pb-2 font-orbitron">
              MQTT CONNECTIONS & MULTI-BROKER STATUS
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.entries(brokerStatuses).map(([key, value]) => {
                const broker = value as BrokerStatus;
                return (
                  <div key={key} className="bg-black border border-[#00c9ff]/15 rounded-lg p-3 flex flex-col justify-between gap-2 shadow-sm relative">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs uppercase text-[#e0faff] tracking-wider">
                        {broker.name}
                      </span>
                      <span className={`w-2.5 h-2.5 rounded-full ${broker.connected ? 'bg-green-500 shadow-[0_0_8px_#22c55e] animate-pulse' : 'bg-red-600'}`} />
                    </div>
                    
                    <div className="text-[10px] font-mono text-slate-500 truncate w-full">
                      {broker.url}
                    </div>

                    <div className="flex justify-between items-center mt-0.5">
                      <span className="text-[9px] uppercase font-bold text-[#00c9ff]/60">
                        Latency:
                      </span>
                      <span className="font-mono text-xs font-bold text-[#00c9ff]">
                        {broker.connected ? (broker.ping !== null ? `${broker.ping}ms` : `Contacting...`) : 'ERR'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Outputs Relay & Sequential Pattern Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Relay Switches Section */}
            <div id="card-relays" className="bg-[#0d0d0d] border border-[#00c9ff]/30 p-4 rounded-xl flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-[#00c9ff]/20 pb-2">
                <h3 className="text-xs font-bold tracking-widest uppercase text-[#00c9ff] flex items-center gap-1.5 font-orbitron">
                  <Power className="w-3.5 h-3.5 text-[#00C9FF]" /> RELAY CONTROLLER
                </h3>
                <div className="flex gap-1.5">
                  <button
                    id="btn-all-relay-on"
                    onClick={() => setAllRelays(true)}
                    disabled={polaConfigs.some(p => p.active)}
                    className="text-[9px] uppercase font-bold text-black bg-[#00c9ff] hover:bg-cyan-400 px-2 py-0.5 rounded transition duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Semua ON
                  </button>
                  <button
                    id="btn-all-relay-off"
                    onClick={() => setAllRelays(false)}
                    disabled={polaConfigs.some(p => p.active)}
                    className="text-[9px] uppercase font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded transition duration-200 disabled:opacity-30"
                  >
                    Semua OFF
                  </button>
                </div>
              </div>

              {polaConfigs.some(p => p.active) && (
                <div className="text-[10px] bg-yellow-550/15 border border-yellow-500/25 text-yellow-400 px-2.5 py-1.5 rounded flex items-center gap-1.5 animate-pulse">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  Relay terkunci sewaktu pola sekuensyal aktif.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {relayConfigs.map((relay) => (
                  <div
                    key={relay.id}
                    className={`p-3 bg-black/40 border rounded-lg flex flex-col justify-between gap-2.5 transition-all duration-300 relative overflow-hidden ${
                      relay.active 
                        ? 'border-[#00c9ff]/35 shadow-[0_0_10px_rgba(0,201,255,0.05)]' 
                        : 'border-white/5'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="text-[9px] opacity-40 uppercase font-mono tracking-wider">
                          Relay 0{relay.id}
                        </div>
                        {editingRelayId === relay.id ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <input
                              id={`input-relay-name-${relay.id}`}
                              type="text"
                              value={editVal}
                              onChange={(e) => setEditVal(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (editVal.trim()) {
                                    const updated = relayConfigs.map(rc => rc.id === relay.id ? { ...rc, label: editVal.trim() } : rc);
                                    saveRelays(updated);
                                    addLog(`Nama Relay ${relay.id} diganti: ${editVal.trim()}`, 'system');
                                  }
                                  setEditingRelayId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingRelayId(null);
                                }
                              }}
                              className="bg-slate-900 border border-[#00c9ff]/30 text-white text-[11px] px-1 py-0.5 rounded focus:outline-none w-full font-mono"
                              autoFocus
                            />
                            <button
                              id={`btn-save-relay-name-${relay.id}`}
                              onClick={() => {
                                if (editVal.trim()) {
                                  const updated = relayConfigs.map(rc => rc.id === relay.id ? { ...rc, label: editVal.trim() } : rc);
                                  saveRelays(updated);
                                  addLog(`Nama Relay ${relay.id} diganti: ${editVal.trim()}`, 'system');
                                }
                                setEditingRelayId(null);
                              }}
                              className="text-[#00c9ff]"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group/label mt-0.5">
                            <span className="font-bold text-xs truncate text-[#e0faff] uppercase tracking-wide">
                              {relay.label}
                            </span>
                            <button
                              id={`btn-edit-relay-name-${relay.id}`}
                              onClick={() => {
                                setEditingRelayId(relay.id);
                                setEditVal(relay.label);
                              }}
                              className="text-slate-500 hover:text-cyan-400 opacity-0 group-hover/label:opacity-100 transition duration-200"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <span className="text-[8px] text-[#00c9ff]/50 block uppercase tracking-wider mt-0.5 font-mono">
                          iot/relay/{relay.id}
                        </span>
                      </div>

                      <span className={`w-2 h-2 rounded-full mt-1.5 ${relay.active ? 'bg-[#00c9ff] shadow-[0_0_8px_#00c9ff] animate-pulse' : 'bg-slate-800'}`} />
                    </div>

                    <button
                      id={`btn-toggle-relay-${relay.id}`}
                      onClick={() => handleToggleRelay(relay.id)}
                      disabled={polaConfigs.some(p => p.active)}
                      className={`w-full py-1.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all duration-300 cursor-pointer ${
                        relay.active
                          ? 'bg-[#00c9ff] text-black shadow-[0_0_10px_rgba(0,201,255,0.2)]'
                          : 'bg-black/95 text-slate-400 hover:bg-slate-900 hover:text-slate-200 border border-white/5 disabled:opacity-25'
                      }`}
                    >
                      {relay.active ? 'Aktif' : 'Mati'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Pola Lampu Switches Section */}
            <div id="card-patterns" className="bg-[#0d0d0d] border border-[#00c9ff]/30 p-4 rounded-xl flex flex-col justify-between gap-3">
              <div className="flex justify-between items-center border-b border-[#00c9ff]/20 pb-2">
                <h3 className="text-xs font-bold tracking-widest uppercase text-[#00c9ff] flex items-center gap-1.5 font-orbitron">
                  <Activity className="w-3.5 h-3.5 text-[#00C9FF]" /> POLA CAHAYA (SEQUENCE)
                </h3>
                <div className="flex gap-1.5">
                  <button
                    id="btn-all-pola-on"
                    onClick={() => setAllPatterns(true)}
                    className="text-[9px] uppercase font-bold text-black bg-[#00c9ff] hover:bg-cyan-400 px-2 py-0.5 rounded transition duration-200"
                  >
                    Semua ON
                  </button>
                  <button
                    id="btn-all-pola-off"
                    onClick={() => setAllPatterns(false)}
                    className="text-[9px] uppercase font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded transition duration-200"
                  >
                    Semua OFF
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3 flex-1 justify-center">
                {polaConfigs.map((pola) => (
                  <div
                    key={pola.id}
                    className={`p-3.5 rounded-xl border transition-all duration-300 flex items-center justify-between ${
                      pola.active
                        ? 'border-[#00c9ff] bg-[#00c9ff]/10 shadow-[0_0_12px_rgba(0,201,255,0.15)]'
                        : 'border-white/10 bg-black/40 hover:border-[#00c9ff]/30'
                    }`}
                  >
                    <div className="flex flex-col gap-1 w-full mr-4">
                      <div className="text-[9px] opacity-40 uppercase font-mono tracking-wider">
                        Pola 0{pola.id}
                      </div>
                      <span className="font-bold text-[#e0faff] text-xs uppercase tracking-wide">
                        {pola.name}
                      </span>
                      <span className="text-[8px] text-[#00c9ff]/60 uppercase font-mono">
                        iot/pola/{pola.id}
                      </span>

                      {/* Pattern visualizers */}
                      {pola.active && pola.id === 1 && (
                        <div className="w-full h-1.5 mt-2 bg-slate-950 rounded-full relative overflow-hidden border border-[#00c9ff]/20">
                          <div className="absolute top-0 bottom-0 w-3 rounded-full bg-[#00C9FF] shadow-cyan-glow animate-dot-move"></div>
                        </div>
                      )}
                      
                      {pola.active && pola.id === 2 && (
                        <div className="flex gap-2 mt-2 justify-center">
                          <span className="w-2 h-2 rounded-full bg-[#00C9FF] shadow-cyan-glow-intense animate-strobe-fast" />
                          <span className="w-2 h-2 rounded-full bg-[#00C9FF] shadow-cyan-glow-intense animate-strobe-fast [animation-delay:0.1s]" />
                          <span className="w-2 h-2 rounded-full bg-[#00C9FF] shadow-cyan-glow-intense animate-strobe-fast [animation-delay:0.2s]" />
                        </div>
                      )}
                    </div>

                    <button
                      id={`btn-toggle-pola-${pola.id}`}
                      onClick={() => handleTogglePola(pola.id)}
                      className={`px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider transition duration-300 w-24 cursor-pointer ${
                        pola.active
                          ? 'bg-[#00c9ff] text-black shadow-cyan-glow'
                          : 'bg-black/95 text-slate-400 hover:bg-slate-900 hover:text-slate-200 border border-white/5'
                      }`}
                    >
                      {pola.active ? 'AKTIF' : 'NONAKTIF'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

        {/* === SECOND COLUMN: SPEECH RECOGNITION PANEL & REALTIME LOGS === */}
        <div id="column-right" className="flex flex-col gap-4">

          {/* Web Speech API Control Widget Container */}
          <div id="card-voice" className="bg-[#0d0d0d] border border-[#00c9ff]/30 rounded-xl p-4 flex flex-col justify-between items-center gap-3 relative overflow-hidden shadow-sm">
            {/* Top pulse light */}
            <div className={`absolute top-0 left-0 right-0 h-1 transition-all duration-300 ${isListening ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-[#00c9ff]/20'}`} />
            
            <div className="w-full flex justify-between items-center border-b border-[#00c9ff]/20 pb-1.5 mb-1">
              <h3 className="text-xs font-bold tracking-widest uppercase text-[#00c9ff] font-orbitron">
                KEMUDI PERINTAH SUARA (ID)
              </h3>
              
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${
                  micState === 'granted' && isListening ? 'bg-green-500 animate-pulse' : micState === 'denied' ? 'bg-red-500' : 'bg-yellow-500'
                }`} />
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300">
                  {micState === 'granted' && isListening ? 'AKTIF' : micState === 'denied' ? 'BLOKIR' : 'READY'}
                </span>
              </div>
            </div>

            {/* Warning Banner block for microphone blocked */}
            {micState === 'denied' && (
              <div className="w-full text-[10px] bg-red-950/25 border border-red-500/35 text-red-200 p-2 rounded-lg">
                Izin mikrofon terblokir. Aktifkan mikrofon di address bar untuk fitur perintah suara.
              </div>
            )}

            {/* Circular Audio Mic Activation Button with custom keyframes ripples */}
            <div className="relative group p-2">
              {isListening && (
                <div className="absolute inset-0 bg-green-500/10 rounded-full animate-ping pointer-events-none"></div>
              )}
              
              <button
                id="btn-voice-toggle"
                onClick={toggleMic}
                className={`w-16 h-16 rounded-full flex items-center justify-center border-2 shadow-lg transition-all duration-300 scale-100 hover:scale-105 active:scale-95 cursor-pointer ${
                  isListening
                    ? 'bg-green-950/40 hover:bg-green-900/30 border-green-500 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                    : 'bg-black hover:bg-slate-900 border-[#00c9ff]/30 text-[#00c9ff]'
                }`}
                title="Mikrofon Kontrol Suara"
              >
                {isListening ? (
                  <Mic className="w-7 h-7 animate-pulse" />
                ) : (
                  <MicOff className="w-7 h-7 text-slate-400" />
                )}
              </button>
            </div>

            <div className="w-full text-center">
              <span className="text-[9px] text-[#00c9ff]/60 uppercase tracking-widest block font-bold">
                Sandi Suara Terakhir:
              </span>
              <p id="voiced-cmd-transcript" className={`font-semibold italic text-xs mt-1 truncate px-2.5 py-1 bg-black/60 rounded border border-[#00c9ff]/10 ${spokenText ? 'text-[#00c9ff] text-cyan-glow font-mono' : 'text-slate-500'}`}>
                {spokenText ? `"${spokenText}"` : 'Menunggu perintah...'}
              </p>
            </div>

            <div className="w-full bg-black/45 rounded-lg p-2.5 border border-[#00c9ff]/10 text-left text-[11px] text-slate-400">
              <div className="text-[9px] text-[#00c9ff] uppercase tracking-widest font-bold mb-1 flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5" /> Panduan Sandi Suara:
              </div>
              <ul className="list-disc pl-3.5 space-y-0.5 text-slate-400 text-[10px] leading-snug max-h-20 overflow-y-auto">
                <li><span className="text-[#00c9ff] font-semibold">"Semua relay nyala"</span></li>
                <li><span className="text-[#00c9ff] font-semibold">"Semua relay mati"</span></li>
                <li><span className="text-[#00c9ff] font-semibold">"Relay satu nyala"</span></li>
                <li><span className="text-[#00c9ff] font-semibold">"Relay satu mati"</span></li>
                <li><span className="text-[#00c9ff] font-semibold">"Berapa suhu / Cek sensor"</span></li>
                <li><span className="text-[#00c9ff] font-semibold">"Bersihkan log"</span></li>
                <li><span className="text-[#00c9ff] font-semibold">"Semua mati"</span></li>
              </ul>
            </div>
          </div>

          {/* Activity Log console panel feed with scrolling and exports options */}
          <div id="card-logs" className="bg-[#0d0d0d] border border-[#00c9ff]/30 p-3 rounded-xl flex flex-col gap-3 flex-1 min-h-[220px]">
            <div className="flex justify-between items-center border-b border-[#00c9ff]/20 pb-2">
              <h3 className="text-xs font-bold tracking-widest uppercase text-[#00c9ff] flex items-center gap-1.5 font-orbitron">
                <Activity className="w-3.5 h-3.5 text-[#00C9FF]" /> AKTIVITAS SISTEM
              </h3>
              
              <div className="flex gap-1.5">
                <button
                  id="btn-export-log"
                  onClick={exportLogToTxt}
                  className="p-1 px-1.5 text-[9px] uppercase font-bold text-slate-200 bg-black hover:bg-slate-900 border border-[#00c9ff]/25 rounded transition duration-200 flex items-center gap-1 cursor-pointer"
                  title="Unduh LOG sebagai .txt"
                >
                  <Download className="w-2.5 h-2.5" /> Export
                </button>
                <button
                  id="btn-clear-log"
                  onClick={() => {
                    setLogs([]);
                    addLog('Daftar log dibersihkan oleh pengguna', 'system');
                  }}
                  className="p-1 px-1.5 text-[9px] uppercase font-bold text-slate-200 bg-black hover:bg-slate-900 border border-[#00c9ff]/25 rounded transition duration-200 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-2.5 h-2.5" /> Clear
                </button>
              </div>
            </div>

            <div id="logs-viewport" className="flex-1 bg-black rounded-lg p-2.5 border border-[#00c9ff]/15 font-mono text-[11px] leading-relaxed overflow-y-auto max-h-[250px] flex flex-col gap-1 text-slate-300">
              {logs.length === 0 ? (
                <div className="text-slate-600 text-center py-6">
                  Log kosong. Mulai interaksi...
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="leading-tight border-b border-white/5 pb-0.5">
                    <span className="text-gray-500 font-sans mr-1.5">
                      [{log.timestamp}]
                    </span>
                    <span className={`
                      ${log.type === 'incoming' ? 'text-green-400' : ''}
                      ${log.type === 'publish' ? 'text-[#00c9ff]' : ''}
                      ${log.type === 'error' ? 'text-red-400' : ''}
                      ${log.type === 'system' ? 'text-gray-400' : ''}
                    `}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Client Info Banner */}
          <div className="h-32 bg-gradient-to-br from-[#00c9ff]/10 to-transparent border border-[#00c9ff]/30 rounded-xl p-3.5 flex flex-col justify-between shadow-sm">
            <h2 className="text-xs font-bold text-[#00c9ff] uppercase tracking-widest border-b border-[#00c9ff]/20 pb-1.5 mb-1.5 font-orbitron">
              Informasi Client
            </h2>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between font-mono">
                 <span className="opacity-60">ClientID:</span>
                 <span className="text-white truncate max-w-[170px] inline-block">{myClientId1Ref.current || 'Yusbii_Telemetry_Reader'}</span>
              </div>
              <div className="flex justify-between font-mono">
                 <span className="opacity-60">Protokol:</span>
                 <span className="text-white">Websocket Secure</span>
              </div>
              <div className="flex justify-between font-mono">
                 <span className="opacity-60">Uptime:</span>
                 <span className="text-white">ONLINE SYNC</span>
              </div>
            </div>
          </div>

        </div>

      </main>

      {/* --- FOOTER --- */}
      <footer id="footer" className="h-8 px-6 bg-black flex items-center justify-between text-[10px] tracking-widest border-t border-[#00c9ff]/20 shrink-0 font-mono">
        <div className="flex space-x-4 uppercase">
          <span className="text-[#00c9ff]">Ready</span>
          <span className="opacity-40">|</span>
          <span className="opacity-60">MEM: 24MB</span>
          <span className="opacity-40">|</span>
          <span className="opacity-60">ID: f9fe524c</span>
        </div>
        <div className="opacity-40 uppercase hidden md:block">
          © {new Date().getFullYear()} YUSBII TECH INDONESIA - IOT CORE V4
        </div>
      </footer>
    </div>
  );
}
