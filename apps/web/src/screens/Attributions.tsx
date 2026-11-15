// Public attributions page (PLAN 17.4): content/ATTRIBUTIONS.md rendered as a readable page.
import attributions from '../../../../content/ATTRIBUTIONS.md?raw';
import { Icon } from '../design/primitives';
import { Markdown } from '../landing/markdown';
import { DocPage } from '../landing/ui';

export function Attributions() {
  return (
    <DocPage eyebrow="Credits and licences" title="Attributions">
      <p className="text-body-lg text-text-secondary">MyFitBike is built on open-source software and open data. Thank you to everyone who made these available.</p>
      <div className="mt-6 rounded-card border border-secondary/30 bg-secondary/10 p-5 flex gap-3">
        <Icon name="map" className="text-secondary mt-0.5" />
        <p className="text-body-lg text-on-surface">Real roads: road geometry © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">OpenStreetMap contributors</a>, available under the <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">Open Database License (ODbL)</a>.</p>
      </div>
      <Markdown source={attributions} />
    </DocPage>
  );
}
