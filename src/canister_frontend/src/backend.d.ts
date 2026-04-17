import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export class ExternalBlob {
    getBytes(): Promise<Uint8Array<ArrayBuffer>>;
    getDirectURL(): string;
    static fromURL(url: string): ExternalBlob;
    static fromBytes(blob: Uint8Array<ArrayBuffer>): ExternalBlob;
    withUploadProgress(onProgress: (percentage: number) => void): ExternalBlob;
}
export type Time = bigint;
export type CapsuleId = bigint;
export interface CapsuleMetadata {
    id: CapsuleId;
    unlockDate: Time;
    title: string;
    creator: Principal;
    createdDate: Time;
    isUnlocked: boolean;
}
export interface UserProfile {
    name: string;
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    createCapsule(title: string, encryptedMessage: string, fileRefs: Array<ExternalBlob>, unlockDate: Time): Promise<CapsuleId>;
    getCallerUserProfile(): Promise<UserProfile | null>;
    getCallerUserRole(): Promise<UserRole>;
    getCapsuleContent(id: CapsuleId): Promise<{
        fileRefs: Array<ExternalBlob>;
        encryptedMessage: string;
    }>;
    getCapsuleMetadata(id: CapsuleId): Promise<CapsuleMetadata>;
    getMyCapsules(): Promise<Array<CapsuleMetadata>>;
    getTotalCapsuleCount(): Promise<bigint>;
    getUserProfile(user: Principal): Promise<UserProfile | null>;
    isCallerAdmin(): Promise<boolean>;
    saveCallerUserProfile(profile: UserProfile): Promise<void>;
}
