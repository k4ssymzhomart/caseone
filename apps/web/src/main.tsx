// Two entry points in one app. A signed out visitor at `/` gets the landing page alone (React and the page, no API
// client, no router); everything else boots the panel, whose router also shows the landing at `/` when the stored
// session turns out to be gone, and sends signed in staff to their home page.
import './styles/global.css';
import { isLandingVisit } from './lib/sessionHint';

const root = document.getElementById('root')!;

if (isLandingVisit()) {
  void import('./landing/mount').then((m) => m.mountLanding(root));
} else {
  void import('./panel').then((m) => m.mountPanel(root));
}
