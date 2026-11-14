import { Card, Icon } from '../design/primitives';

export function BrowserBlocked({ reason }: { reason: string }) {
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <Card level={3} className="max-w-lg p-10 text-center">
        <div className="mx-auto w-14 h-14 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center mb-6"><Icon name="pedal_bike" size={30} /></div>
        <h1 className="text-headline-lg text-text mb-3">Open MyFitBike in Chrome or Edge</h1>
        <p className="text-body-lg text-text-secondary mb-6">{reason}</p>
        <p className="text-body-md text-text-muted">MyFitBike talks to your trainer and sensors over Web Bluetooth, which only Chromium browsers on macOS support.</p>
      </Card>
    </div>
  );
}
