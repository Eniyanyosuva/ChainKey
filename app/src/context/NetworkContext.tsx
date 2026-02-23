"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from "react";

export type NetworkId = "localnet" | "devnet" | "testnet" | "mainnet-beta";

export interface NetworkConfig {
    id: NetworkId;
    label: string;
    endpoint: string;
    explorerSuffix: string;
    color: string;
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
    localnet: {
        id: "localnet",
        label: "Localnet",
        endpoint: "http://localhost:8899",
        explorerSuffix: "?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899",
        color: "#f59e0b",
    },
    devnet: {
        id: "devnet",
        label: "Devnet",
        endpoint: "https://api.devnet.solana.com",
        explorerSuffix: "?cluster=devnet",
        color: "#06b6d4",
    },
    testnet: {
        id: "testnet",
        label: "Testnet",
        endpoint: "https://api.testnet.solana.com",
        explorerSuffix: "?cluster=testnet",
        color: "#8b5cf6",
    },
    "mainnet-beta": {
        id: "mainnet-beta",
        label: "Mainnet",
        endpoint: "https://api.mainnet-beta.solana.com",
        explorerSuffix: "",
        color: "#10b981",
    },
};

interface NetworkContextValue {
    network: NetworkConfig;
    setNetwork: (id: NetworkId) => void;
}

const NetworkContext = createContext<NetworkContextValue>({
    network: NETWORKS.devnet,
    setNetwork: () => { },
});

export function NetworkProvider({ children }: { children: ReactNode }) {
    return (
        <NetworkContext.Provider value={{ network: NETWORKS.devnet, setNetwork: () => { } }}>
            {children}
        </NetworkContext.Provider>
    );
}

export function useNetwork() {
    return useContext(NetworkContext);
}
