import { Station, Train } from '../types';

export const STATIONS: Station[] = [
  { id: 'SBC', name: 'KSR Bengaluru', latitude: 12.9777, longitude: 77.5726 },
  { id: 'MYS', name: 'Mysuru Junction', latitude: 12.3164, longitude: 76.6450 },
  { id: 'MYA', name: 'Mandya', latitude: 12.5222, longitude: 76.8967 },
  { id: 'CPT', name: 'Channapatna', latitude: 12.6517, longitude: 77.2091 },
  { id: 'RMGM', name: 'Ramanagaram', latitude: 12.7247, longitude: 77.2847 },
  { id: 'BID', name: 'Bidadi', latitude: 12.8000, longitude: 77.3881 },
  { id: 'YPR', name: 'Yesvantpur', latitude: 13.0238, longitude: 77.5501 },
  { id: 'TK', name: 'Tumakuru', latitude: 13.3421, longitude: 77.1017 },
  { id: 'RRB', name: 'Birur Junction', latitude: 13.5937, longitude: 75.9680 },
];

export const TRAINS: Train[] = [
  {
    number: '06256',
    name: 'MYS-SBC MEMU Passenger',
    coaches: ['Engine', 'General', 'General', 'Ladies', 'General', 'General', 'Handicapped', 'General', 'General'],
    route: ['MYS', 'MYA', 'RMGM', 'BID', 'SBC'],
    schedule: [
      { stationId: 'MYS', arrival: 'Starts', departure: '06:10' },
      { stationId: 'MYA', arrival: '06:55', departure: '06:57' },
      { stationId: 'RMGM', arrival: '07:45', departure: '07:46' },
      { stationId: 'BID', arrival: '07:58', departure: '07:59' },
      { stationId: 'SBC', arrival: '09:15', departure: 'Ends' },
    ]
  },
  {
    number: '16232',
    name: 'Mailaduturai Express',
    coaches: ['Engine', 'General', 'General', 'S1', 'S2', 'S3', 'S4', 'B1', 'B2', 'A1', 'General', 'General'],
    route: ['MYS', 'SBC', 'YPR'],
    schedule: [
      { stationId: 'MYS', arrival: 'Starts', departure: '16:15' },
      { stationId: 'SBC', arrival: '19:00', departure: '19:15' },
      { stationId: 'YPR', arrival: '19:35', departure: 'Ends' },
    ]
  },
  {
    number: '20661',
    name: 'SBC-MYS Rajya Rani Express',
    coaches: ['Engine', 'General', 'General', 'D1', 'D2', 'D3', 'D4', 'D5', 'C1', 'C2', 'General', 'General'],
    route: ['SBC', 'BID', 'RMGM', 'MYA', 'MYS'],
    schedule: [
      { stationId: 'SBC', arrival: 'Starts', departure: '17:50' },
      { stationId: 'BID', arrival: '18:22', departure: '18:23' },
      { stationId: 'RMGM', arrival: '18:35', departure: '18:36' },
      { stationId: 'MYA', arrival: '19:18', departure: '19:20' },
      { stationId: 'MYS', arrival: '20:30', departure: 'Ends' },
    ]
  },
  {
    number: '16535',
    name: 'MYS-SUR Golgumbaz Express',
    coaches: ['Engine', 'General', 'S1', 'S2', 'S3', 'S4', 'S5', 'B1', 'B2', 'A1', 'General'],
    route: ['MYS', 'MYA', 'CPT', 'RMGM', 'SBC', 'YPR', 'TK', 'RRB'],
    schedule: [
      { stationId: 'MYS', arrival: 'Starts', departure: '15:30' },
      { stationId: 'MYA', arrival: '16:18', departure: '16:20' },
      { stationId: 'CPT', arrival: '16:47', departure: '16:48' },
      { stationId: 'RMGM', arrival: '16:58', departure: '16:59' },
      { stationId: 'SBC', arrival: '18:00', departure: '18:20' },
      { stationId: 'YPR', arrival: '18:33', departure: '18:35' },
      { stationId: 'TK', arrival: '19:28', departure: '19:30' },
      { stationId: 'RRB', arrival: '21:05', departure: 'Ends' },
    ]
  },
  {
    number: '06575',
    name: 'SBC-TK MEMU Passenger',
    coaches: ['Engine', 'General', 'General', 'General', 'General', 'General', 'General'],
    route: ['SBC', 'YPR', 'TK'],
    schedule: [
      { stationId: 'SBC', arrival: 'Starts', departure: '08:30' },
      { stationId: 'YPR', arrival: '08:42', departure: '08:44' },
      { stationId: 'TK', arrival: '09:45', departure: 'Ends' },
    ]
  },
  {
    number: '12614',
    name: 'MYS-SBC Tipu Express',
    coaches: ['Engine', 'General', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'General'],
    route: ['MYS', 'MYA', 'SBC'],
    schedule: [
      { stationId: 'MYS', arrival: 'Starts', departure: '11:30' },
      { stationId: 'MYA', arrival: '12:13', departure: '12:15' },
      { stationId: 'SBC', arrival: '13:45', departure: 'Ends' },
    ]
  },
];
