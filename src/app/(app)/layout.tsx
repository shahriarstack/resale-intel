import Link from 'next/link';
import { ReactNode } from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="app-container">
      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Resale Intel</h2>
        </div>
        <nav className="sidebar-nav">
          <Link href="/" className="nav-item">Dashboard</Link>
          <Link href="/inventory" className="nav-item">Inventory</Link>
          <Link href="/sales" className="nav-item">Sales</Link>
          <Link href="/settings" className="nav-item">Settings</Link>
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">{session.user?.email}</div>
          <Link href="/api/auth/signout" className="logout-btn">Sign Out</Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="bottom-nav">
        <Link href="/" className="bottom-nav-item">
          <span className="icon">📊</span>
          <span>Home</span>
        </Link>
        <Link href="/inventory" className="bottom-nav-item">
          <span className="icon">📦</span>
          <span>Items</span>
        </Link>
        <Link href="/sales" className="bottom-nav-item">
          <span className="icon">💰</span>
          <span>Sales</span>
        </Link>
        <Link href="/settings" className="bottom-nav-item">
          <span className="icon">⚙️</span>
          <span>Menu</span>
        </Link>
      </nav>
    </div>
  );
}
