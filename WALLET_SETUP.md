# Wallet Connection Setup

## Overview
This application supports multiple wallet connection providers:
1. **Privy** - Embedded wallets with social login (email, Google)
2. **Reown** - External wallets (MetaMask, Rabby, WalletConnect, etc.)

## Setup Instructions

### 1. Privy Setup
1. Go to [Privy Dashboard](https://dashboard.privy.io)
2. Create a new app or use existing one
3. Copy your **App ID** from the dashboard
4. Add to `.env.local`:
   ```
   NEXT_PUBLIC_PRIVY_APP_ID=your_app_id_here
   ```

### 2. Reown Setup
1. Go to [Reown Dashboard](https://reown.com/dashboard)
2. Create a new project or use existing one
3. Copy your **Project ID** from the dashboard
4. Add to `.env.local`:
   ```
   NEXT_PUBLIC_REOWN_PROJECT_ID=your_project_id_here
   ```

### 3. Optional: WalletConnect Setup
1. Go to [WalletConnect Cloud](https://cloud.walletconnect.com)
2. Create a new project
3. Copy your **Project ID**
4. Add to `.env.local`:
   ```
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_wc_project_id_here
   ```

## Environment Files

### `.env.example`
Template file with placeholder values. Copy this to `.env.local` and fill in your actual values.

### `.env.local`
Your local environment variables (not committed to git).

## Testing

### Without Configuration
If no wallet providers are configured, the Connect Wallet button will show a message asking for configuration.

### With Single Provider
If only one provider is configured, clicking "Connect Wallet" will directly trigger that provider.

### With Multiple Providers
If multiple providers are configured, a menu will appear allowing users to choose their preferred connection method.

## Development Notes

- The application checks for environment variables on startup
- CSS classes use `connect-` prefix (e.g., `connect-wrap`, `connect-btn`)
- Component: `components/ConnectWallet.tsx`
- Styles: `app/styles/wallet.css`
- Wallet logic: `components/useWallet.ts` and `lib/wallet.ts`