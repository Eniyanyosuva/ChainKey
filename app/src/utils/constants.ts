import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("EWGBn5r5sA9nyDyfkRNzBsr85KiMi5TUd1KY7fiQvdpF");

export const PROJECT_SEED = Buffer.from("project");
export const API_KEY_SEED = Buffer.from("api_key");
export const USAGE_SEED = Buffer.from("usage");

export const RATE_WINDOW_SLOTS = 216_000;
export const MAX_KEYS_PER_PROJECT = 100;
export const MAX_SCOPES = 8;
