import { http } from "viem";
import { baseSepolia } from "wagmi/chains";
import { createConfig } from "wagmi";
import { getDefaultConfig } from "connectkit";

const RPC_URL =
  import.meta.env.VITE_RPC_URL ||
  "https://base-sepolia-rpc.publicnode.com";

export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [baseSepolia],
    transports: {
      [baseSepolia.id]: http(RPC_URL),
    },
    appName: "USDC-backed Token Launcher",
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "be37b17af0fbb579190219af99593a24",
  })
);
