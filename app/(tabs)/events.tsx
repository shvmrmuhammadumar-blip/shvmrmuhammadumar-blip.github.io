import React from 'react';
import { UnavailableModule } from '../../components/LumoModulePage';
export default function EventsScreen() {
  return <UnavailableModule eyebrow="Lumo / Community" title="Events" description="Create and discover community meetups, launches and live sessions." iconName="calendar-outline" requirements={["Events and attendee schema with capacity and time-zone support", "Host permissions, RSVP state and cancellation handling", "Moderation, reporting and attendee privacy controls", "Notifications and calendar integration"]} />;
}
