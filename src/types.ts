export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'incoming' | 'publish' | 'error' | 'system';
}

export interface BrokerStatus {
  name: string;
  url: string;
  connected: boolean;
  ping: number | null;
  error: string | null;
}

export interface RelayConfig {
  id: number;
  label: string;
  active: boolean;
}

export interface PolaConfig {
  id: number;
  name: string;
  active: boolean;
  label: string;
}

export type MicState = 'denied' | 'prompt' | 'granted';
