import React from 'react';
import { UnavailableModule } from '../../components/LumoModulePage';
export default function WalletScreen() {
  return <UnavailableModule eyebrow="Lumo / Payments" title="Wallet" description="A secure place for balances, creator payouts and transaction history. No money movement is enabled in this build." iconName="wallet-outline" requirements={["A regulated payment or wallet provider for the target markets", "Server-side ledger with immutable double-entry records", "Identity, fraud, refund and dispute controls", "Webhook verification, reconciliation and security review"]} />;
}
