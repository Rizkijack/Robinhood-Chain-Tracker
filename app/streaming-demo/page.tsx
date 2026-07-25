/**
 * Streaming Demo Page
 * 
 * Halaman demo untuk menunjukkan fitur streaming WebSocket/SSE
 * dari blockchain node secara real-time.
 */

import { BlockchainStreamExample } from "@/components/BlockchainStreamExample";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blockchain Streaming Demo | Robinhood Screener",
  description: "Real-time blockchain data streaming using WebSocket and SSE",
};

export default function StreamingDemoPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Blockchain Streaming Demo
          </h1>
          <p className="text-gray-600">
            Demonstrasi koneksi streaming murni dari blockchain node menggunakan WebSocket dan SSE.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Demo Component */}
          <div className="lg:col-span-2">
            <BlockchainStreamExample />
          </div>

          {/* Sidebar - Info */}
          <div className="space-y-6">
            {/* Feature Info */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Fitur Streaming</h2>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-xs mr-3 mt-0.5">
                    ✓
                  </span>
                  <span className="text-sm">
                    <strong>WebSocket Streaming</strong><br />
                    Real-time data dengan latency sub-second
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-5 h-5 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs mr-3 mt-0.5">
                    ✓
                  </span>
                  <span className="text-sm">
                    <strong>SSE Streaming</strong><br />
                    Server-Sent Events untuk kompatibilitas luas
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs mr-3 mt-0.5">
                    ✓
                  </span>
                  <span className="text-sm">
                    <strong>Auto Fallback</strong><br />
                    Otomatis fallback ke polling jika streaming gagal
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-5 h-5 bg-yellow-500 text-white rounded-full flex items-center justify-center text-xs mr-3 mt-0.5">
                    ✓
                  </span>
                  <span className="text-sm">
                    <strong>Reconnection</strong><br />
                    Reconnect otomatis dengan exponential backoff
                  </span>
                </li>
              </ul>
            </div>

            {/* Supported Nodes */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Supported Nodes</h2>
              <div className="space-y-3">
                <div className="p-3 bg-gray-50 rounded">
                  <div className="font-medium">Ethereum Mainnet</div>
                  <div className="text-xs text-gray-600">Chain ID: 1</div>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <div className="font-medium">Polygon</div>
                  <div className="text-xs text-gray-600">Chain ID: 137</div>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <div className="font-medium">BNB Smart Chain</div>
                  <div className="text-xs text-gray-600">Chain ID: 56</div>
                </div>
              </div>
            </div>

            {/* How to Use */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Cara Penggunaan</h2>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Pilih blockchain node atau masukkan custom URL</li>
                <li>Klik Connect untuk memulai streaming</li>
                <li>Lihat real-time block updates</li>
                <li>Connection otomatis fallback jika diperlukan</li>
                <li>Gunakan Disconnect untuk menghentikan</li>
              </ol>
            </div>

            {/* Technical Info */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Technical Info</h2>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Protocol:</span>
                  <span className="ml-2">WebSocket (WSS), SSE, HTTP Polling</span>
                </div>
                <div>
                  <span className="font-medium">Latency:</span>
                  <span className="ml-2">&lt; 1 detik (WebSocket/SSE)</span>
                </div>
                <div>
                  <span className="font-medium">Reconnect:</span>
                  <span className="ml-2">Exponential backoff (max 3x)</span>
                </div>
                <div>
                  <span className="font-medium">Type Safety:</span>
                  <span className="ml-2">Full TypeScript support</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Documentation Link */}
        <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            📚 Documentation
          </h3>
          <p className="text-blue-700 mb-4">
            Lihat dokumentasi lengkap untuk implementasi detail, API reference, dan best practices.
          </p>
          <a
            href="/lib/streaming/README.md"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Baca Documentation
          </a>
        </div>
      </div>
    </div>
  );
}
