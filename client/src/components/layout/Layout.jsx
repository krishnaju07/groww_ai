import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { MobileNav } from './MobileNav.jsx';
import { Navbar } from './Navbar.jsx';
import { ToastContainer } from '../common/ToastContainer.jsx';

export function Layout() {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Route changes happen via NavLinks' own onNavigate close-on-click, but this
  // catches every other way a route can change (back/forward, a programmatic
  // navigate() elsewhere) so the drawer never gets left open over a new page.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div key={location.pathname} className="page-transition">
            <Outlet />
          </div>
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
