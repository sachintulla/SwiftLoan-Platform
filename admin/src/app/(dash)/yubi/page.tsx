import { redirect } from 'next/navigation';

// Yubi now lives on the Applications page as a tab (2026-11-23). Old links and bookmarks land on that tab.
export default function YubiRedirect() {
  redirect('/loans?tab=yubi');
}
