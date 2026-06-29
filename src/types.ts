export interface User {
  name: string;
  email: string;
}

export interface DriveUser {
  displayName: string;
  emailAddress: string;
}

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string; // RFC3339
  version: string; // monotonic string per Drive
  headRevisionId: string | null;
  appProperties?: Record<string, string>;
  lastModifyingUser?: DriveUser;
}

export interface LockInfo {
  lockedBy?: string;
  lockedByEmail?: string;
  lockedByName?: string;
  lockedAt?: string; // RFC3339
}

export type LockState = "free" | "mine" | "theirs";

export interface Revision {
  id: string;
  modifiedTime: string; // RFC3339
  lastModifyingUser?: DriveUser;
  sizeBytes?: number;
  keepForever?: boolean;
}

export interface RestorePoint {
  id: string;
  modifiedTime: string;
  authorName: string;
  authorEmail: string;
  isExternal: boolean;
  sizeBytes?: number;
}

export interface TreeEntry {
  path: string; // POSIX-relative path from the root
  kind: "file" | "dir";
  modifiedTime?: string;
  version?: string;
  appProperties?: Record<string, string>;
}
