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
export type CapsuleId = string;
export interface CapsuleMetadata {
    id: CapsuleId;
    unlockDate: Time;
    title: string;
    creator: Principal;
    createdDate: Time;
    isUnlocked: boolean;
    planTier: "free" | "signature" | "legacy";
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
    createCapsule(publicId: string, title: string, encryptedMessage: string, fileRefs: Array<ExternalBlob>, unlockDate: Time, messageCharCount: bigint, paymentIntentId: Array<string>): Promise<CapsuleId>;
    createPaymentIntent(tier: { free?: null; signature?: null; legacy?: null }, paymentMethod: { card?: null; crypto?: null; voucher?: null }): Promise<any>;
    getPaymentIntentStatus(intentId: string): Promise<any>;
    confirmPaymentIntent(intentId: string, providerPaymentId: string, targetStatus: { pending?: null; confirmed?: null; failed?: null; expired?: null; refunded?: null }, webhookSecret: string): Promise<any>;
    getPricingPlans(): Promise<any[]>;
    getCallerUserProfile(): Promise<UserProfile | null>;
    getCallerUserRole(): Promise<UserRole>;
    getCapsuleContent(id: string): Promise<{
        fileRefs: Array<ExternalBlob>;
        encryptedMessage: string;
    }>;
    getCapsuleFile(capsuleId: string, fileId: string): Promise<{
        name: string;
        mimeType: string;
        data: Uint8Array<ArrayBuffer>;
    }>;
    getCapsuleMetadata(id: string): Promise<CapsuleMetadata>;
    getMyCapsules(): Promise<Array<CapsuleMetadata>>;
    getTotalCapsuleCount(): Promise<bigint>;
    getUserProfile(user: Principal): Promise<UserProfile | null>;
    isCallerAdmin(): Promise<boolean>;
    saveCallerUserProfile(profile: UserProfile): Promise<void>;
    uploadCapsuleFile(name: string, mimeType: string, data: Uint8Array<ArrayBuffer>): Promise<string>;
}
