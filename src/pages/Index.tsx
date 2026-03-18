/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { ConnectKitButton } from "connectkit";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { decodeEventLog, formatUnits, isAddress, parseUnits } from "viem";

import "../App.css";

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const DEFAULT_FACTORY_ADDRESS = "0x0B7a34a6860261e5b0Fc559468CcF792E171a2A2";

const ERC20_ABI = [
  {
    type: "function" as const,
    name: "approve",
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function" as const,
    name: "balanceOf",
    stateMutability: "view" as const,
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function" as const,
    name: "allowance",
    stateMutability: "view" as const,
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const FACTORY_ABI = [
  {
    type: "function" as const,
    name: "launch",
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "suffix", type: "string" },
      { name: "initialUsdcAmount", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event" as const,
    name: "Launched",
    anonymous: false,
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "suffix", type: "string", indexed: false },
      { name: "initialUsdcAmount", type: "uint256", indexed: false },
      { name: "recipient", type: "address", indexed: true },
    ],
  },
] as const;

const WRAPPER_ABI = [
  {
    type: "function" as const,
    name: "deposit",
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "minted", type: "uint256" }],
  },
  {
    type: "function" as const,
    name: "redeem",
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "withdrawn", type: "uint256" }],
  },
  {
    type: "function" as const,
    name: "transfer",
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function" as const,
    name: "balanceOf",
    stateMutability: "view" as const,
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function" as const,
    name: "symbol",
    stateMutability: "view" as const,
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function" as const,
    name: "name",
    stateMutability: "view" as const,
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function" as const,
    name: "backingUSDC",
    stateMutability: "view" as const,
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  backingUSDC: string | bigint | null;
}

function isLikelyAlnumSuffix(s: string) {
  if (s.length < 1 || s.length > 16) return false;
  return /^[A-Za-z0-9]+$/.test(s);
}

const LS_TOKENS_KEY = "usdc_backed_tokens_v1";

export default function Index() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const [factoryAddress, setFactoryAddress] = useState(DEFAULT_FACTORY_ADDRESS);
  const [recipient, setRecipient] = useState("");
  const [suffix, setSuffix] = useState("Krump");
  const [initialUsdcAmountHuman, setInitialUsdcAmountHuman] = useState("1.00");
  const [backendVerifyUrl, setBackendVerifyUrl] = useState("");
  const [status, setStatus] = useState("");

  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState("");

  const [mode, setMode] = useState<"deposit" | "redeem" | "send">("deposit");

  const [depositAmountHuman, setDepositAmountHuman] = useState("1.00");
  const [depositRecipient, setDepositRecipient] = useState("");

  const [redeemAmountHuman, setRedeemAmountHuman] = useState("1.00");
  const [redeemRecipient, setRedeemRecipient] = useState("");

  const [sendAmountHuman, setSendAmountHuman] = useState("1.00");
  const [sendRecipient, setSendRecipient] = useState("");

  const [manualTokenAddress, setManualTokenAddress] = useState("");

  useEffect(() => {
    if (address && !recipient) setRecipient(address);
  }, [address, recipient]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_TOKENS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setTokens(
        parsed
          .filter((t: any) => t && typeof t.address === "string")
          .map((t: any) => ({
            address: t.address,
            symbol: t.symbol || "",
            name: t.name || "",
            backingUSDC: typeof t.backingUSDC === "string" ? t.backingUSDC : t.backingUSDC ?? null,
          }))
      );
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (tokens.length === 0) return;
    if (!selectedToken) {
      setSelectedToken(tokens[0]?.address || "");
    }
  }, [tokens, selectedToken]);

  useEffect(() => {
    if (tokens.length === 0) return;
    try {
      const serializable = tokens.map((t) => ({
        ...t,
        backingUSDC: typeof t.backingUSDC === "bigint" ? t.backingUSDC.toString() : t.backingUSDC,
      }));
      localStorage.setItem(LS_TOKENS_KEY, JSON.stringify(serializable));
    } catch {
      // ignore
    }
  }, [tokens]);

  useEffect(() => {
    if (!address) return;
    if (!depositRecipient) setDepositRecipient(address);
    if (!redeemRecipient) setRedeemRecipient(address);
    if (!sendRecipient) setSendRecipient(address);
  }, [address, depositRecipient, redeemRecipient, sendRecipient]);

  const canLaunch = Boolean(address && walletClient && factoryAddress && recipient);
  const initialAmountStr = useMemo(() => initialUsdcAmountHuman, [initialUsdcAmountHuman]);

  // Helper to work around viem type strictness with authorizationList
  const readContract = (params: any) => publicClient!.readContract(params as any) as any;
  const writeContract = (params: any) => walletClient!.writeContract(params as any) as any;

  async function fetchTokenMeta(tokenAddress: `0x${string}`) {
    const sym = await readContract({
      address: tokenAddress,
      abi: WRAPPER_ABI,
      functionName: "symbol",
    });
    const name = await readContract({
      address: tokenAddress,
      abi: WRAPPER_ABI,
      functionName: "name",
    });
    const backingUSDC = await readContract({
      address: tokenAddress,
      abi: WRAPPER_ABI,
      functionName: "backingUSDC",
    });
    return { address: tokenAddress, symbol: sym, name, backingUSDC };
  }

  async function assertIsWrappedTokenContract(tokenAddress: string) {
    if (!isAddress(tokenAddress)) throw new Error("Token address is invalid.");
    const code = await publicClient!.getCode({ address: tokenAddress as `0x${string}` });
    if (!code || code === "0x") {
      throw new Error("Selected token address is not a contract.");
    }
    await fetchTokenMeta(tokenAddress as `0x${string}`);
  }

  async function upsertToken(tokenAddress: string, { select = false } = {}) {
    const addrLower = tokenAddress.toLowerCase();
    const meta = await fetchTokenMeta(tokenAddress as `0x${string}`).catch(() => ({
      address: tokenAddress,
      symbol: "",
      name: "",
      backingUSDC: null as string | bigint | null,
    }));

    setTokens((prev) => {
      const existsIdx = prev.findIndex((t) => t.address.toLowerCase() === addrLower);
      if (existsIdx >= 0) {
        const next = [...prev];
        next[existsIdx] = { ...next[existsIdx], ...meta };
        return next;
      }
      return [meta, ...prev];
    });

    if (select) setSelectedToken(tokenAddress);
  }

  async function handleAddManualToken() {
    setStatus("");
    try {
      if (!manualTokenAddress.trim()) throw new Error("Enter a token address.");
      const addr = manualTokenAddress.trim();
      if (!isAddress(addr)) throw new Error("Token address is invalid.");
      if (Number(chainId) !== Number(baseSepolia.id)) {
        await switchChainAsync({ chainId: baseSepolia.id });
      }
      await assertIsWrappedTokenContract(addr);
      await upsertToken(addr, { select: true });
      setStatus(`Added wrapped token to dashboard: ${addr}`);
    } catch (e: any) {
      setStatus(e?.message || String(e));
    }
  }

  function getAmountFromHuman(humanStr: string) {
    const s = String(humanStr ?? "").trim();
    if (!s) throw new Error("Enter an amount.");
    return parseUnits(s, 6);
  }

  async function handleDeposit() {
    setStatus("");
    try {
      if (!address || !walletClient) throw new Error("Connect wallet first.");
      if (!selectedToken) throw new Error("Select a token from the dashboard.");
      if (!isAddress(selectedToken)) throw new Error("Selected token address is invalid.");
      if (!isAddress(depositRecipient)) throw new Error("Recipient address is invalid.");
      await assertIsWrappedTokenContract(selectedToken);
      const amount = getAmountFromHuman(depositAmountHuman);
      if (amount === 0n) throw new Error("Amount must be greater than 0.");
      if (Number(chainId) !== Number(baseSepolia.id)) {
        await switchChainAsync({ chainId: baseSepolia.id });
      }
      const usdcBalance = await readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      });
      if (usdcBalance < amount) {
        throw new Error(`Insufficient USDC balance. You have ${formatUnits(usdcBalance, 6)} USDC.`);
      }
      const allowance = await readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, selectedToken as `0x${string}`],
      });
      if (allowance < amount) {
        setStatus("Approving USDC for the wrapped token...");
        const approveHash = await writeContract({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [selectedToken as `0x${string}`, amount],
          gas: 1_500_000n,
        });
        await publicClient!.waitForTransactionReceipt({ hash: approveHash });
      }
      setStatus("Depositing USDC into wrapped token...");
      const depositHash = await writeContract({
        address: selectedToken as `0x${string}`,
        abi: WRAPPER_ABI,
        functionName: "deposit",
        args: [amount, depositRecipient as `0x${string}`],
        gas: 5_000_000n,
      });
      await publicClient!.waitForTransactionReceipt({ hash: depositHash });
      setStatus(`Deposited ${depositAmountHuman} USDC -> wrapped token for ${depositRecipient}.\nDeposit tx: ${depositHash}`);
      await upsertToken(selectedToken);
    } catch (e: any) {
      setStatus(e?.shortMessage || e?.cause?.shortMessage || e?.reason || e?.message || String(e));
    }
  }

  async function handleRedeem() {
    setStatus("");
    try {
      if (!address || !walletClient) throw new Error("Connect wallet first.");
      if (!selectedToken) throw new Error("Select a token from the dashboard.");
      if (!isAddress(selectedToken)) throw new Error("Selected token address is invalid.");
      if (!isAddress(redeemRecipient)) throw new Error("Recipient address is invalid.");
      await assertIsWrappedTokenContract(selectedToken);
      const amount = getAmountFromHuman(redeemAmountHuman);
      if (amount === 0n) throw new Error("Amount must be greater than 0.");
      if (Number(chainId) !== Number(baseSepolia.id)) {
        await switchChainAsync({ chainId: baseSepolia.id });
      }
      const wrappedBalance = await readContract({
        address: selectedToken as `0x${string}`,
        abi: WRAPPER_ABI,
        functionName: "balanceOf",
        args: [address],
      });
      if (wrappedBalance < amount) {
        throw new Error(`Insufficient wrapped token balance. You have ${formatUnits(wrappedBalance, 6)}.`);
      }
      setStatus("Redeeming wrapped token back to USDC...");
      const redeemHash = await writeContract({
        address: selectedToken as `0x${string}`,
        abi: WRAPPER_ABI,
        functionName: "redeem",
        args: [amount, redeemRecipient as `0x${string}`],
        gas: 5_000_000n,
      });
      await publicClient!.waitForTransactionReceipt({ hash: redeemHash });
      setStatus(`Redeemed ${redeemAmountHuman} wrapped token -> USDC for ${redeemRecipient}.\nRedeem tx: ${redeemHash}`);
      await upsertToken(selectedToken);
    } catch (e: any) {
      setStatus(e?.shortMessage || e?.cause?.shortMessage || e?.reason || e?.message || String(e));
    }
  }

  async function handleSendWrapped() {
    setStatus("");
    try {
      if (!address || !walletClient) throw new Error("Connect wallet first.");
      if (!selectedToken) throw new Error("Select a token from the dashboard.");
      if (!isAddress(selectedToken)) throw new Error("Selected token address is invalid.");
      if (!isAddress(sendRecipient)) throw new Error("Recipient address is invalid.");
      await assertIsWrappedTokenContract(selectedToken);
      const amount = getAmountFromHuman(sendAmountHuman);
      if (amount === 0n) throw new Error("Amount must be greater than 0.");
      if (Number(chainId) !== Number(baseSepolia.id)) {
        await switchChainAsync({ chainId: baseSepolia.id });
      }
      const wrappedBalance = await readContract({
        address: selectedToken as `0x${string}`,
        abi: WRAPPER_ABI,
        functionName: "balanceOf",
        args: [address],
      });
      if (wrappedBalance < amount) {
        throw new Error(`Insufficient wrapped token balance. You have ${formatUnits(wrappedBalance, 6)}.`);
      }
      setStatus("Sending wrapped tokens...");
      const sendHash = await writeContract({
        address: selectedToken as `0x${string}`,
        abi: WRAPPER_ABI,
        functionName: "transfer",
        args: [sendRecipient as `0x${string}`, amount],
        gas: 1_500_000n,
      });
      await publicClient!.waitForTransactionReceipt({ hash: sendHash });
      setStatus(`Sent ${sendAmountHuman} wrapped token to ${sendRecipient}.\nTx: ${sendHash}`);
      await upsertToken(selectedToken);
    } catch (e: any) {
      setStatus(e?.shortMessage || e?.cause?.shortMessage || e?.reason || e?.message || String(e));
    }
  }

  async function handleLaunch() {
    setStatus("");
    try {
      if (!address || !walletClient) throw new Error("Connect wallet first.");
      const f = factoryAddress.trim();
      const r = recipient.trim();
      const s = suffix.trim();
      if (!isAddress(f)) throw new Error("Factory address is invalid.");
      if (!isAddress(r)) throw new Error("Recipient address is invalid.");
      if (!isLikelyAlnumSuffix(s)) {
        throw new Error("Suffix must be 1..16 chars and alphanumeric only.");
      }
      if (!initialAmountStr.trim()) throw new Error("Enter an initial USDC amount.");
      const initialUsdcAmount = parseUnits(initialAmountStr, 6);
      if (Number(chainId) !== Number(baseSepolia.id)) {
        await switchChainAsync({ chainId: baseSepolia.id });
      }
      const usdcBalance = await readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      });
      if (usdcBalance < initialUsdcAmount) {
        throw new Error(`Insufficient USDC balance. You have ${formatUnits(usdcBalance, 6)} USDC, but attempted ${initialAmountStr}.`);
      }
      setStatus("Approving USDC to factory...");
      const approveHash = await writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [f as `0x${string}`, initialUsdcAmount],
        gas: 1_500_000n,
      });
      await publicClient!.waitForTransactionReceipt({ hash: approveHash });
      setStatus("Launching wrapper token...");
      const launchHash = await writeContract({
        address: f as `0x${string}`,
        abi: FACTORY_ABI,
        functionName: "launch",
        args: [s, initialUsdcAmount, r as `0x${string}`],
        gas: 15_000_000n,
      });
      const receipt = await publicClient!.waitForTransactionReceipt({ hash: launchHash });
      let tokenAddress = "";
      for (const log of receipt.logs as any[]) {
        if (!log || !log.data || !log.topics) continue;
        try {
          const decoded = decodeEventLog({
            abi: FACTORY_ABI,
            eventName: "Launched",
            data: log.data,
            topics: log.topics,
          });
          tokenAddress = decoded?.args?.token || "";
          if (tokenAddress) break;
        } catch {
          // Ignore non-matching logs
        }
      }
      if (!tokenAddress) throw new Error("Launched event log not found in receipt.");
      setStatus(`Launched token: ${tokenAddress}\nUSDC->token mint amount: ${initialAmountStr}.\n`);
      await upsertToken(tokenAddress, { select: true });

      if (backendVerifyUrl.trim()) {
        try {
          setStatus((prev) => prev + "\nCalling backend verification...");
          const resp = await fetch(backendVerifyUrl.trim(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokenAddress, factory: f, suffix: s, initialUsdcAmount: initialAmountStr, recipient: r }),
          });
          const json = await resp.json();
          setStatus((prev) => prev + `\nBackend response: ${JSON.stringify(json, null, 2)}`);
        } catch (e: any) {
          setStatus((prev) => prev + `\nBackend error: ${e?.message || String(e)}`);
        }
      }
    } catch (e: any) {
      setStatus(e?.shortMessage || e?.cause?.shortMessage || e?.reason || e?.message || String(e));
    }
  }

  return (
    <div className="page">
      <h1 style={{ fontSize: "clamp(24px, 4vw, 42px)", fontWeight: 600, letterSpacing: "-0.5px", marginBottom: 8, color: "hsl(var(--foreground))" }}>
        USDC-backed Token Launcher
      </h1>
      <p className="muted" style={{ marginBottom: 24 }}>Base Sepolia · For educational purposes only · Krump Dance Community</p>

      <div className="card">
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "hsl(var(--foreground))", margin: "0 0 12px" }}>Wallet</h2>
        <ConnectKitButton />
        <div className="muted">
          {address ? `Connected: ${address}` : "Not connected"}
          {chainId ? ` | ChainId: ${chainId}` : ""}
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "hsl(var(--foreground))", margin: "0 0 12px" }}>Launch new wrapper token</h2>
        <label className="field">
          <span>Factory Address</span>
          <input className="input" value={factoryAddress} onChange={(e) => setFactoryAddress(e.target.value)} />
        </label>
        <label className="field">
          <span>Recipient (mint initial tokens to)</span>
          <input className="input" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x..." />
        </label>
        <label className="field">
          <span>Suffix (e.g., Krump, IKF) - alnum, length 1..16</span>
          <input className="input" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
        </label>
        <label className="field">
          <span>Initial USDC Amount (human, e.g., 1.25)</span>
          <input className="input" value={initialUsdcAmountHuman} onChange={(e) => setInitialUsdcAmountHuman(e.target.value)} />
        </label>
        <button className="btn primary" disabled={!canLaunch} onClick={handleLaunch}>
          Approve USDC &amp; Launch
        </button>
        <pre className="status">{status}</pre>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "hsl(var(--foreground))", margin: "0 0 12px" }}>Deployed Tokens (Dashboard)</h2>
        <p className="muted">Tokens launched from this browser are saved locally.</p>
        {tokens.length === 0 ? (
          <div className="muted">No tokens yet. Launch one above to see it here.</div>
        ) : (
          <>
            <label className="field">
              <span>Selected token</span>
              <select className="input" value={selectedToken} onChange={(e) => setSelectedToken(e.target.value)}>
                {tokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol ? t.symbol : t.address.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <div className="tokenGrid">
              {tokens.map((t) => {
                const isSelected = t.address.toLowerCase() === selectedToken.toLowerCase();
                let backing = "";
                try {
                  if (t.backingUSDC !== null && t.backingUSDC !== undefined && String(t.backingUSDC).trim() !== "") {
                    backing = formatUnits(BigInt(String(t.backingUSDC)), 6);
                  }
                } catch {
                  // ignore
                }
                return (
                  <div key={t.address} className={`tokenCard ${isSelected ? "tokenCardSelected" : ""}`}>
                    <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{t.symbol || t.name || "Wrapped Token"}</div>
                        <div className="muted" style={{ wordBreak: "break-all" }}>{t.address}</div>
                      </div>
                      <div className="muted" style={{ textAlign: "right" }}>
                        {backing ? `Backed: ${backing} USDC` : ""}
                      </div>
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>Choose this token to exchange/send below.</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div className="sectionSpacer" />
        <h3 className="sectionTitle">Add token by address</h3>
        <label className="field">
          <span>Wrapped token address (0x...)</span>
          <input className="input" value={manualTokenAddress} onChange={(e) => setManualTokenAddress(e.target.value)} placeholder="0x25D923fB298D6c0cbE6F1F3724654D6E7fD63B63" />
        </label>
        <button className="btn" onClick={handleAddManualToken} disabled={!manualTokenAddress.trim()}>
          Add to dashboard
        </button>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "hsl(var(--foreground))", margin: "0 0 12px" }}>Exchange / Send</h2>
        <p className="muted">Convert between USDC and the wrapped token, or send wrapped tokens to another wallet.</p>
        <div className="modeTabs" style={{ marginTop: 12 }}>
          <button className={`btn modeBtn ${mode === "deposit" ? "primary" : ""}`} onClick={() => setMode("deposit")} disabled={!selectedToken}>
            USDC → Wrapped
          </button>
          <button className={`btn modeBtn ${mode === "redeem" ? "primary" : ""}`} onClick={() => setMode("redeem")} disabled={!selectedToken}>
            Wrapped → USDC
          </button>
          <button className={`btn modeBtn ${mode === "send" ? "primary" : ""}`} onClick={() => setMode("send")} disabled={!selectedToken}>
            Send Wrapped
          </button>
        </div>
        {!selectedToken ? (
          <div className="muted">Select a token in the dashboard first.</div>
        ) : (
          <>
            {mode === "deposit" && (
              <div style={{ display: "grid", gap: 12 }}>
                <label className="field">
                  <span>USDC amount (human)</span>
                  <input className="input" value={depositAmountHuman} onChange={(e) => setDepositAmountHuman(e.target.value)} />
                </label>
                <label className="field">
                  <span>Recipient (mint wrapped tokens to)</span>
                  <input className="input" value={depositRecipient} onChange={(e) => setDepositRecipient(e.target.value)} placeholder="0x..." />
                </label>
                <button className="btn primary" onClick={handleDeposit}>Deposit &amp; Mint</button>
              </div>
            )}
            {mode === "redeem" && (
              <div style={{ display: "grid", gap: 12 }}>
                <label className="field">
                  <span>Wrapped amount (human)</span>
                  <input className="input" value={redeemAmountHuman} onChange={(e) => setRedeemAmountHuman(e.target.value)} />
                </label>
                <label className="field">
                  <span>USDC recipient</span>
                  <input className="input" value={redeemRecipient} onChange={(e) => setRedeemRecipient(e.target.value)} placeholder="0x..." />
                </label>
                <button className="btn primary" onClick={handleRedeem}>Redeem &amp; Withdraw USDC</button>
              </div>
            )}
            {mode === "send" && (
              <div style={{ display: "grid", gap: 12 }}>
                <label className="field">
                  <span>Wrapped amount (human)</span>
                  <input className="input" value={sendAmountHuman} onChange={(e) => setSendAmountHuman(e.target.value)} />
                </label>
                <label className="field">
                  <span>Recipient wallet</span>
                  <input className="input" value={sendRecipient} onChange={(e) => setSendRecipient(e.target.value)} placeholder="0x..." />
                </label>
                <button className="btn primary" onClick={handleSendWrapped}>Send Wrapped Tokens</button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "hsl(var(--foreground))", margin: "0 0 12px" }}>Optional: automatic verification</h2>
        <p className="muted">Calls your backend endpoint to run BaseScan/Etherscan verification.</p>
        <label className="field">
          <span>Backend Verify URL</span>
          <input className="input" value={backendVerifyUrl} onChange={(e) => setBackendVerifyUrl(e.target.value)} placeholder="http://localhost:3001/api/verify" />
        </label>
      </div>
    </div>
  );
}
