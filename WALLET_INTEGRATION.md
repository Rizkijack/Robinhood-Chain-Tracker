# Crypto Wallet Integration: Privy & Reown

Complete wallet management system for the Robinhood Chain Tracker with Privy (social auth + embedded wallets) and Reown (WalletConnect + hardware wallets).

## Features

### Phase 1: Unified Wallet Management ✅
- **Unified Service Layer** (`lib/wallet-service.ts`) - Abstract both Privy and Reown providers
- **Enhanced useWallet Hook** (`components/useWallet.ts`) - Integrated Privy and Reown with proper status tracking
- **WalletContext** (`components/WalletContext.tsx`) - Global wallet state with balance fetching

### Phase 2: Balance & Assets ✅
- **Balance Service** (`lib/balance-service.ts`) - Fetch native ETH and ERC-20 balances with caching
- **WalletBalance Component** - Display connected wallet address and ETH balance
- **WalletAssets Component** - List held assets with sortable table

### Phase 3: Multi-Wallet Support ✅
- **Multi-Wallet Store** (`lib/multi-wallet-store.ts`) - Zustand store for wallet management
- **WalletSelector Component** - Switch between wallets, edit names, manage portfolio

### Phase 4: Transactions ✅
- **Transaction Service** (`lib/transaction-service.ts`) - Build, estimate, and monitor transactions
- **SendTransaction Component** - User-friendly transaction interface with gas estimation
- **Error Handling** - Comprehensive error parsing and user feedback

### Phase 5: Portfolio Tracking ✅
- **Portfolio Store** (`lib/portfolio-store.ts`) - Track positions, gains/losses, and transactions
- **PortfolioOverview Component** - Display portfolio stats and top holdings

### Phase 6: Notifications & Polish ✅
- **Notification Service** (`lib/notification-service.ts`) - Type-safe toast system
- **NotificationCenter Component** - Display notifications with auto-dismiss
- **Transaction Alerts** - Real-time feedback on connection, transactions, and balance changes

## Architecture

```
lib/
├── wallet-service.ts         # Unified provider abstraction
├── balance-service.ts        # Balance & asset fetching
├── multi-wallet-store.ts     # Zustand wallet store
├── transaction-service.ts    # Transaction operations
├── portfolio-store.ts        # Portfolio tracking
└── notification-service.ts   # Toast notifications

components/
├── useWallet.ts              # Hook integrating Privy + Reown
├── WalletContext.tsx         # Global wallet context
├── WalletProviders.tsx       # Provider setup (updated)
├── ConnectWallet.tsx         # Connection UI (existing)
├── WalletBalance.tsx         # Balance display
├── WalletAssets.tsx          # Assets table
├── WalletSelector.tsx        # Multi-wallet switcher
├── SendTransaction.tsx       # Transaction form
├── PortfolioOverview.tsx     # Portfolio stats
└── NotificationCenter.tsx    # Notification toasts
```

## Setup & Configuration

### 1. Environment Variables
Already configured in your project:
```env
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_REOWN_PROJECT_ID=your_reown_project_id
NEXT_PUBLIC_APP_URL=https://your-app.com
NEXT_PUBLIC_RH_RPC_URL=https://robinhood-mainnet.g.alchemy.com/v2/your-key
```

### 2. Provider Setup
Wrap your app with `WalletProviders`:
```tsx
import { WalletProviders } from "@/components/WalletProviders";

export default function RootLayout({ children }) {
  return (
    <WalletProviders>
      <html>
        <body>{children}</body>
      </html>
    </WalletProviders>
  );
}
```

### 3. Add Context Provider
Wrap page components with `WalletContextProvider`:
```tsx
import { WalletContextProvider } from "@/components/WalletProviders";

export default function Page() {
  return (
    <WalletContextProvider>
      {/* Your components */}
    </WalletContextProvider>
  );
}
```

### 4. Add Notification Center
Add to your root layout:
```tsx
import { NotificationCenter } from "@/components/NotificationCenter";

export default function RootLayout({ children }) {
  return (
    <WalletProviders>
      <html>
        <body>
          <NotificationCenter />
          {children}
        </body>
      </html>
    </WalletProviders>
  );
}
```

## Usage Examples

### Display Wallet Connection
```tsx
import { ConnectWallet } from "@/components/ConnectWallet";

export default function Header() {
  return (
    <header>
      <ConnectWallet />
    </header>
  );
}
```

### Show Wallet Balance
```tsx
import { WalletBalance } from "@/components/WalletBalance";

export default function Dashboard() {
  return (
    <div>
      <WalletBalance />
    </div>
  );
}
```

### Use useWalletContext Hook
```tsx
import { useWalletContext } from "@/components/WalletProviders";

export default function MyComponent() {
  const {
    address,
    via,              // "privy" or "reown"
    status,           // "connected" | "disconnected" | "connecting"
    balance,          // { formatted: "1.5", symbol: "ETH", ... }
    balanceLoading,
    connectExternal,
    connectSocial,
    disconnect,
  } = useWalletContext();

  return (
    <div>
      {address && <p>Connected: {address}</p>}
      {balance && <p>Balance: {balance.formatted} {balance.symbol}</p>}
    </div>
  );
}
```

### Send Transaction
```tsx
import { SendTransaction } from "@/components/SendTransaction";

export default function Transactions() {
  return <SendTransaction />;
}
```

### Display Portfolio
```tsx
import { PortfolioOverview } from "@/components/PortfolioOverview";

export default function Portfolio() {
  return <PortfolioOverview />;
}
```

### Use Portfolio Store
```tsx
import { usePortfolioStats, usePortfolioPositions } from "@/lib/portfolio-store";

export default function Stats() {
  const stats = usePortfolioStats("0x...");
  const positions = usePortfolioPositions("0x...");

  return (
    <div>
      <p>Total Value: ${stats.totalValue}</p>
      <p>Positions: {positions.length}</p>
    </div>
  );
}
```

### Send Notifications
```tsx
import { notificationService } from "@/lib/notification-service";

// Success notification (auto-dismiss after 3s)
notificationService.success("Wallet Connected", "0x123...abc");

// Error notification (auto-dismiss after 5s)
notificationService.error("Transaction Failed", "Insufficient balance");

// Transaction notifications
notificationService.transactionPending("0x456...def");
notificationService.transactionSuccess("0x456...def");

// Wallet notifications
notificationService.walletConnected("0x789...xyz");
notificationService.walletDisconnected();
```

## Key Services

### `wallet-service.ts`
Core wallet operations abstraction:
- `getActiveWallet()` - Get current wallet
- `fetchWalletBalance()` - Fetch balance from RPC
- `signWalletMessage()` - Sign messages
- `sendWalletTransaction()` - Send transactions
- `validateWalletAddress()` - Validate Ethereum addresses

### `balance-service.ts`
Balance and asset fetching:
- `getNativeBalance()` - Fetch ETH balance with caching
- `getTokenBalance()` - Fetch ERC-20 token balance
- `getPortfolioSummary()` - Get all balances for wallet
- `clearBalanceCache()` - Manual cache clearing

### `transaction-service.ts`
Transaction management:
- `validateTransaction()` - Validate transaction config
- `estimateTransactionGas()` - Estimate gas fees
- `buildTransactionData()` - Build encoded transaction
- `getTransactionStatus()` - Monitor transaction
- `waitForTransactionConfirmation()` - Poll for confirmation
- `parseTransactionError()` - Parse error messages

### `multi-wallet-store.ts`
Wallet management store:
- `addWallet()` - Add new wallet to store
- `removeWallet()` - Remove wallet
- `setActiveWallet()` - Switch active wallet
- `updateWalletName()` - Custom wallet naming

### `portfolio-store.ts`
Portfolio tracking:
- `addPosition()` - Track position
- `addTransaction()` - Log transaction
- `getStats()` - Calculate P&L

### `notification-service.ts`
Toast notifications:
- `notificationService.success/error/warning/info()` - Send notifications
- `useNotifications()` - Hook to get all notifications
- Pre-built helpers for common events

## Styling

All components use CSS-in-JS with default styling. Customize via CSS variables:

```css
:root {
  /* Colors */
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --border-color: #e5e7eb;
  --card-bg: #ffffff;
  --card-bg-alt: #f9fafb;
  --button-bg: #f3f4f6;
  --button-bg-hover: #e5e7eb;
  --primary-color: #3b82f6;
  --success-color: #16a34a;
  --error-color: #dc2626;
  --warning-color: #ea580c;
  --link-color: #3b82f6;
}
```

Override in your global CSS to match your design system.

## Integration Checklist

- [x] Phase 1: Unified wallet service & hooks
- [x] Phase 2: Balance display & assets
- [x] Phase 3: Multi-wallet selector
- [x] Phase 4: Transaction support
- [x] Phase 5: Portfolio tracking
- [x] Phase 6: Notifications & polish

## Next Steps

1. **Integration in Pages**: Add components to your pages and routes
2. **Testing**: Test both Privy (email/social) and Reown (WalletConnect) connections
3. **Styling**: Customize CSS variables to match your design
4. **Backend Integration**: Connect portfolio tracking to your database if needed
5. **Price Feed**: Add price oracle for USD valuation (currently shows 0)
6. **Transaction History**: Fetch historical transactions from blockchain

## Troubleshooting

### Wallet won't connect
- Ensure Privy App ID and Reown Project ID are set correctly
- Check browser console for errors from Privy/Reown
- Verify RPC URL is accessible

### Balance not updating
- Check RPC URL is working
- Verify wallet address is on Robinhood Chain
- Try manual refresh button in WalletBalance component

### Notifications not showing
- Ensure `NotificationCenter` is mounted in layout
- Check console for notification service errors

### Multi-wallet issues
- localStorage must be enabled for wallet persistence
- Check browser storage limits
- Try clearing localStorage and reconnecting

## Performance Optimization

- Balance caching: 10 seconds (configurable in balance-service.ts)
- Transaction polling: 2 second intervals with 5 minute timeout
- Auto-refresh balance every 10 seconds (disable in WalletContext if needed)
- Notifications auto-dismiss after 3-5 seconds (configurable)

## Security Considerations

- Never store private keys in localStorage
- Use Privy embedded wallets for non-custodial security
- All balance queries go through public RPC nodes
- Transaction hashes are validated before display
- All user inputs are validated before contract interaction

## Support

For issues or questions:
1. Check console logs for detailed error messages
2. Verify environment variables are set
3. Test with both Privy and Reown connections
4. Check RPC connectivity
5. Review component props in code comments
