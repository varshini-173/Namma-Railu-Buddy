export interface Station {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface Train {
  number: string;
  name: string;
  coaches: string[];
  route: string[]; // List of station IDs in order
  schedule: ScheduleItem[];
}

export interface ScheduleItem {
  stationId: string;
  arrival: string; // HH:mm or "Starts"
  departure: string; // HH:mm or "Ends"
}

export interface TrainLocation {
  trainNumber: string;
  stationId: string;
  updatedAt: any;
}

export interface LiveTrainPosition {
  id?: string;
  trainId: string;
  latitude: number;
  longitude: number;
  reportedBy: string;
  createdAt: any;
}

export interface PlatformPing {
  id?: string;
  trainId: string;
  stationId: string;
  platform: string;
  confirmedBy: string[];
  reportedBy: string;
  createdAt: any;
  expiresAt: any;
}

export interface DelayReport {
  id?: string;
  trainId: string;
  minutes: number;
  reason?: string;
  reportedBy: string;
  createdAt: any;
}

export interface CoachAvailability {
  id?: string;
  trainId: string;
  coachId: string;
  status: 'empty' | 'moderate' | 'full';
  reportedBy: string;
  createdAt: any;
}
