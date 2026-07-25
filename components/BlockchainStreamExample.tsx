/**
 * Example component demonstrating blockchain streaming with WebSocket and SSE.
 * 
 * This component shows:
 * - Real-time block updates
 * - Connection status
 * - Manual retry functionality
 * - Support for both WebSocket and SSE connections
 */

"use client";

import { useState } from "react";
import { useBlockchainStream } from "@/lib/streaming/useBlockchainStream";
import { BLOCKCHAIN_NODES } from "@/lib/streaming/connection-manager";

export function BlockchainStreamExample() {
  const [wsUrl, setWsUrl] = useState("");
  const [sseUrl, setSseUrl] = useState("");
  const [selectedNode, setSelectedNode] = useState<string>("ethereum");
  
  const {
    snapshot,
    retry,
    stop,
    isConnected,
    isConnecting,
    connectionMethod,
    latestBlock,
    latency,
  } = useBlockchainStream(
    wsUrl || undefined,
    sseUrl || undefined
  );

  const handleConnect = () => {
    // Use selected node's URLs if custom URLs are not provided
    const nodeConfig = BLOCKCHAIN_NODES[selectedNode];
    const finalWsUrl = wsUrl || nodeConfig?.wsUrl || "";
    const finalSseUrl = sseUrl || nodeConfig?.sseUrl || "";
    
    if (finalWsUrl || finalSseUrl) {
      retry();
    }
  };

  const getStatusColor = () => {
    if (isConnected) return "text-green-500";
    if (isConnecting) return "text-yellow-500";
    return "text-red-500";
  };

  const getMethodBadge = () => {
    if (connectionMethod === "websocket") {
      return <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">WebSocket</span>;
    }
    if (connectionMethod === "sse") {
      return <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded">SSE</span>;
    }
    return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded">Polling</span>;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Blockchain Streaming Example</h2>
      
      {/* Configuration Section */}
      <div className="mb-6 p-4 border rounded-lg bg-gray-50">
        <h3 className="text-lg font-semibold mb-4">Connection Configuration</h3>
        
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Blockchain Node</label>
          <select
            value={selectedNode}
            onChange={(e) => setSelectedNode(e.target.value)}
            className="w-full p-2 border rounded"
          >
            {Object.entries(BLOCKCHAIN_NODES).map(([key, config]) => (
              <option key={key} value={key}>
                {config.name} (Chain ID: {config.chainId})
              </option>
            ))}
          </select>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              WebSocket URL (wss://...)
            </label>
            <input
              type="text"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              placeholder={BLOCKCHAIN_NODES[selectedNode]?.wsUrl || "wss://..."}
              className="w-full p-2 border rounded"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">
              SSE URL (https://...)
            </label>
            <input
              type="text"
              value={sseUrl}
              onChange={(e) => setSseUrl(e.target.value)}
              placeholder={BLOCKCHAIN_NODES[selectedNode]?.sseUrl || "https://..."}
              className="w-full p-2 border rounded"
            />
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isConnecting ? "Connecting..." : "Connect"}
          </button>
          
          <button
            onClick={stop}
            disabled={!isConnected}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Status Section */}
      <div className="mb-6 p-4 border rounded-lg">
        <h3 className="text-lg font-semibold mb-4">Connection Status</h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className="text-sm text-gray-600">Status</span>
            <div className={`font-semibold ${getStatusColor()}`}>
              {snapshot.status}
            </div>
          </div>
          
          <div>
            <span className="text-sm text-gray-600">Method</span>
            <div>{getMethodBadge()}</div>
          </div>
          
          <div>
            <span className="text-sm text-gray-600">Latest Block</span>
            <div className="font-mono font-semibold">
              {latestBlock ? `#${parseInt(latestBlock, 16)}` : "N/A"}
            </div>
          </div>
          
          <div>
            <span className="text-sm text-gray-600">Latency</span>
            <div className="font-mono">
              {latency !== null ? `${latency}ms` : "N/A"}
            </div>
          </div>
        </div>
        
        {snapshot.reason && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <span className="text-sm text-yellow-800">
              Reason: {snapshot.reason}
            </span>
          </div>
        )}
      </div>

      {/* Real-time Events Section */}
      <div className="p-4 border rounded-lg">
        <h3 className="text-lg font-semibold mb-4">Real-time Data</h3>
        
        {isConnected ? (
          <div className="space-y-2">
            <div className="p-3 bg-green-50 border border-green-200 rounded">
              <span className="text-sm text-green-800">
                ✓ Connected via {connectionMethod?.toUpperCase()}
              </span>
            </div>
            
            {latestBlock && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                <span className="text-sm text-blue-800">
                  Latest Block: {parseInt(latestBlock, 16)} (hex: {latestBlock})
                </span>
              </div>
            )}
            
            <div className="text-sm text-gray-600">
              <p>✓ Receiving real-time blockchain events</p>
              <p>✓ Automatic reconnection enabled</p>
              <p>✓ Fallback to polling if connection fails</p>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded">
            <span className="text-sm text-gray-600">
              Not connected. Configure and click Connect to start streaming.
            </span>
          </div>
        )}
      </div>
      
      {/* Instructions */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
        <h4 className="font-semibold text-blue-800 mb-2">How to use:</h4>
        <ol className="list-decimal list-inside text-sm text-blue-700 space-y-1">
          <li>Select a blockchain node or enter custom URLs</li>
          <li>Click Connect to start streaming</li>
          <li>Watch real-time block updates</li>
          <li>Connection automatically falls back to polling if WebSocket/SSE fails</li>
          <li>Use Disconnect to stop streaming</li>
        </ol>
      </div>
    </div>
  );
}
