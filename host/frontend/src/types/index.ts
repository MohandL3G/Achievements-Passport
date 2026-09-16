export interface PlayerProfile {
  steamid64: string;
  personaName: string;
  profileUrl: string;
  avatarFullUrl: string;
  avatarMediumUrl?: string;
  customTitle?: string | null;
}

export interface PassportSummary {
  PerfectGames: number;
  TotalGames: number;
  TotalAchievementsUnlocked: number;
  TotalAchievements: number;
  CompletionPercentage: number;
  TotalPlaytimeMinutes: number;
  GamesEverPlayed: number;
  RareAchievementsCount: number;
  GamesWithAchievements: number;
}

export interface AchievementRecord {
  name: string;
  description: string;
  apiname: string;
  achieved: boolean;
  globalPercent: number | null;
  unlockTimestamps?: number[];
}

export interface GameRecord {
  AppId: number;
  Name: string;
  HeaderImageUrl: string;
  IconUrl: string;
  Source: number;
  PlaytimeForeverMinutes: number;
  PlaytimeLastTwoWeeksMinutes: number;
  LastPlayedTimestamp: number;
  AchievementsUnlocked: number;
  AchievementsTotal: number;
  CompletionPercentage: number;
  IsPerfect: boolean;
  Achievements?: AchievementRecord[];
}

export interface PassportData {
  Player: PlayerProfile;
  Summary: PassportSummary;
  HighlightGames: GameRecord[];
  Games: GameRecord[];
  PrivateProfile: boolean;
  GeneratedAtTimestamp: number;
  GeneratedAtFormatted: string;
  Version: number;
}

export interface PublicUser {
  steamid64: string;
  personaName: string;
  avatarUrl: string;
  lastGeneratedAt?: string;
}

export interface Me {
  steamid: string | null;
  persona: { name: string; avatar: string } | null;
  isAdmin: boolean;
  isOwner: boolean;
  csrf: string | null;
}

export interface UserS3Config {
  endpoint: string;
  bucket: string;
  region: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export interface UserS3Status {
  configured: boolean;
  endpoint?: string;
  bucket?: string;
  region?: string;
  prefix?: string;
  forcePathStyle?: boolean;
}

export type CrSource = 'none' | 'folder' | 'zip' | 's3';

export interface GenerateOptions {
  includeSteam: boolean;
  crSource: CrSource;
}

export interface GenerateResult {
  ok: boolean;
  games: number;
  perfect: number;
  generatedAt: string;
  privateProfile: boolean;
  usedPrefix?: string | null;
  error?: string;
}

export interface AdminState {
  ownerSteamid: string;
  gate: { mode: 'open' | 'protected'; whitelist: string[] };
  scheduler: { enabled: boolean; cron: string };
  limits: { maxZipBytes: number; maxFiles: number; maxFileBytes: number };
  s3: {
    configured: boolean;
    endpoint?: string;
    bucket?: string;
    region?: string;
    prefix?: string;
    forcePathStyle?: boolean;
  };
  users: AdminUser[];
  log: string[];
}

export interface AdminUser {
  steamid64: string;
  personaName: string;
  avatarUrl: string;
  autoUpdate: boolean;
  disabled: boolean;
  lastGeneratedAt?: string;
  createdAt?: string;
  gamesCount?: number | null;
}