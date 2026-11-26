import { redirect } from 'next/navigation';

// Revasure now lives on the Applications page as a tab (2026-11-23). Old links and bookmarks land on that tab.
export default function RevasureRedirect() {
  redirect('/loans?tab=revasure');
}
