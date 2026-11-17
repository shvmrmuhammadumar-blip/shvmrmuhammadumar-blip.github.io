import React from 'react';
import { UnavailableModule } from '../../components/LumoModulePage';
export default function MiniAppsScreen() {
  return <UnavailableModule eyebrow="Lumo / Platform" title="Mini Apps" description="A directory for compact services that can run inside Lumo without leaving the conversation." iconName="apps-outline" requirements={["A trusted mini-app registry and publisher review process", "A sandboxed runtime with capability and permission boundaries", "App identity, versioning and lifecycle management", "Security review, abuse reporting and data-access policies"]} />;
}
