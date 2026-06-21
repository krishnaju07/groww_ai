import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

/**
 * App shell: fixed-width Sidebar + a right column with a sticky Navbar and a
 * scrollable centered <main> wrapping react-router's <Outlet/> in a fade-in.
 * @returns {JSX.Element}
 */
export default function Layout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] animate-fade-in-up p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
