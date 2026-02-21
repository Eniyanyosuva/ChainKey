import type { Metadata } from "next";
import "./globals.css";
import { NetworkProvider } from "../context/NetworkContext";
import WalletContextProvider from "../components/WalletProvider";

export const metadata: Metadata = {
    title: "ChainKey — On-Chain Access Control Layer",
    description: "Manage API keys on the Solana blockchain. No database, no Redis — pure on-chain state.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
            </head>
            <body suppressHydrationWarning>
                <NetworkProvider>
                    <WalletContextProvider>
                        <main>{children}</main>
                    </WalletContextProvider>
                </NetworkProvider>
            </body>
        </html>
    );
}
