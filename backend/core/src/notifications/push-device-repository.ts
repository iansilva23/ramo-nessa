import type { AuthSubjectType } from '../auth/auth-session-repository.js';

export type PushPlatform = 'android' | 'ios';
export type PushTokenProvider = 'fcm' | 'apns';

export interface PushDeviceRecord {
  id: string;
  sessionId: string;
  subjectId: string;
  subjectType: AuthSubjectType;
  platform: PushPlatform;
  provider: PushTokenProvider;
  token: string;
  tokenHash: string;
  enabled: boolean;
  disabledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterPushDeviceInput {
  id: string;
  sessionId: string;
  subjectId: string;
  subjectType: AuthSubjectType;
  platform: PushPlatform;
  provider: PushTokenProvider;
  token: string;
  tokenHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface PushDeviceRepository {
  registerForSession(
    input: RegisterPushDeviceInput,
  ): Promise<PushDeviceRecord>;
  listEnabledForSubject(
    subjectType: AuthSubjectType,
    subjectId: string,
  ): Promise<PushDeviceRecord[]>;
  disableForSession(
    sessionId: string,
    disabledAt: string,
  ): Promise<number>;
  disableDevice(id: string, disabledAt: string): Promise<void>;
}
