import React from 'react';
import { UnavailableModule } from '../../components/LumoModulePage';
export default function LiveScreen() {
  return <UnavailableModule eyebrow="Lumo / Broadcast" title="Live" description="Broadcast to an audience and host real-time sessions with chat and moderation." iconName="radio-outline" requirements={["A live video transport provider and ingest/playback infrastructure", "Stream lifecycle, audience and chat persistence", "Host/moderator permissions and safety controls", "Recording, network recovery and usage limits"]} />;
}
