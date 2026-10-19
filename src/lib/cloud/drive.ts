/** Native build: Google Drive sync is web-only for now (the App Store build will use iCloud first). */
import type { AppData } from '../types';

export const driveSupported = false;
export class AuthError extends Error {}
export function loadDrive(_onToken: (ok: boolean, err?: string) => void): void {}
export function driveReady() { return false; }
export function hasToken() { return false; }
export function requestToken(_firstTime: boolean) {}
export function revokeToken() {}
export async function findOrCreateDataFile(): Promise<string> { throw new Error('unsupported'); }
export async function downloadJson(_id: string): Promise<AppData | null> { return null; }
export async function uploadJson(_id: string, _data: AppData): Promise<void> {}
export async function whoAmI(): Promise<string | null> { return null; }
