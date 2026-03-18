/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { ConnectKitButton } from "connectkit";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { decodeEventLog, formatUnits, isAddress, parseUnits } from "viem";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          USDC-backed Token Launcher
        </h1>
        <p className="text-sm text-muted-foreground">
          Base Sepolia · For educational purposes only · Krump Dance Community
        </p>
      </div>

      {/* Wallet */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Wallet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ConnectKitButton />
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {address ? (
              <>
                <Badge variant="outline" className="font-mono text-xs">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </Badge>
                {chainId && (
                  <Badge variant="secondary" className="text-xs">
                    Chain {chainId}
                  </Badge>
                )}
              </>
            ) : (
              <span>Not connected</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Launch */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Launch new wrapper token</CardTitle>
          <CardDescription>Deploy a new USDC-backed ERC-20 wrapper</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Factory Address</Label>
            <Input value={factoryAddress} onChange={(e) => setFactoryAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Recipient (mint initial tokens to)</Label>
            <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x..." />
          </div>
          <div className="space-y-2">
            <Label>Suffix (e.g., Krump, IKF) — alnum, 1–16 chars</Label>
            <Input value={suffix} onChange={(e) => setSuffix(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Initial USDC Amount (e.g., 1.25)</Label>
            <Input value={initialUsdcAmountHuman} onChange={(e) => setInitialUsdcAmountHuman(e.target.value)} />
          </div>
          <Button disabled={!canLaunch} onClick={handleLaunch} className="w-full">
            Approve USDC &amp; Launch
          </Button>
          {status && (
            <pre className="mt-2 whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs text-muted-foreground">
              {status}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Deployed Tokens</CardTitle>
          <CardDescription>Tokens launched from this browser are saved locally.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tokens yet. Launch one above to see it here.</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Selected token</Label>
                <Select value={selectedToken} onValueChange={setSelectedToken}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a token" />
                  </SelectTrigger>
                  <SelectContent>
                    {tokens.map((t) => (
                      <SelectItem key={t.address} value={t.address}>
                        {t.symbol ? t.symbol : t.address.slice(0, 10) + "…"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3">
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
                    <div
                      key={t.address}
                      className={`rounded-lg border p-4 cursor-pointer transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                      onClick={() => setSelectedToken(t.address)}
                    >
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground">
                            {t.symbol || t.name || "Wrapped Token"}
                          </div>
                          <div className="text-xs text-muted-foreground break-all">{t.address}</div>
                        </div>
                        {backing && (
                          <Badge variant="secondary" className="shrink-0 self-start text-xs">
                            {backing} USDC
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="border-t border-border pt-4 space-y-3">
            <h3 className="text-sm font-medium text-foreground">Add token by address</h3>
            <div className="space-y-2">
              <Label>Wrapped token address (0x…)</Label>
              <Input
                value={manualTokenAddress}
                onChange={(e) => setManualTokenAddress(e.target.value)}
                placeholder="0x25D923fB..."
              />
            </div>
            <Button variant="secondary" onClick={handleAddManualToken} disabled={!manualTokenAddress.trim()}>
              Add to dashboard
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Exchange / Send */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Exchange / Send</CardTitle>
          <CardDescription>
            Convert between USDC and the wrapped token, or send wrapped tokens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedToken ? (
            <p className="text-sm text-muted-foreground">Select a token in the dashboard first.</p>
          ) : (
            <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <TabsList className="w-full">
                <TabsTrigger value="deposit" className="flex-1">USDC → Wrapped</TabsTrigger>
                <TabsTrigger value="redeem" className="flex-1">Wrapped → USDC</TabsTrigger>
                <TabsTrigger value="send" className="flex-1">Send</TabsTrigger>
              </TabsList>

              <TabsContent value="deposit" className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>USDC amount</Label>
                  <Input value={depositAmountHuman} onChange={(e) => setDepositAmountHuman(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Recipient</Label>
                  <Input value={depositRecipient} onChange={(e) => setDepositRecipient(e.target.value)} placeholder="0x..." />
                </div>
                <Button onClick={handleDeposit} className="w-full">Deposit &amp; Mint</Button>
              </TabsContent>

              <TabsContent value="redeem" className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Wrapped amount</Label>
                  <Input value={redeemAmountHuman} onChange={(e) => setRedeemAmountHuman(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>USDC recipient</Label>
                  <Input value={redeemRecipient} onChange={(e) => setRedeemRecipient(e.target.value)} placeholder="0x..." />
                </div>
                <Button onClick={handleRedeem} className="w-full">Redeem &amp; Withdraw USDC</Button>
              </TabsContent>

              <TabsContent value="send" className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Wrapped amount</Label>
                  <Input value={sendAmountHuman} onChange={(e) => setSendAmountHuman(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Recipient wallet</Label>
                  <Input value={sendRecipient} onChange={(e) => setSendRecipient(e.target.value)} placeholder="0x..." />
                </div>
                <Button onClick={handleSendWrapped} className="w-full">Send Wrapped Tokens</Button>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Verification */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Optional: automatic verification</CardTitle>
          <CardDescription>Calls your backend endpoint to run BaseScan/Etherscan verification.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>Backend Verify URL</Label>
          <Input
            value={backendVerifyUrl}
            onChange={(e) => setBackendVerifyUrl(e.target.value)}
            placeholder="http://localhost:3001/api/verify"
          />
        </CardContent>
      </Card>
    </div>
  );
}
