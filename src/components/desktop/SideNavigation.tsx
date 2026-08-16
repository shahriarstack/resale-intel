"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SideNavigation.module.css';

export default function SideNavigation() {
  const pathname = usePathname();

  const menuItems = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Inventory', path: '/inventory' },
    { label: 'Approvals', path: '/approvals' },
    { label: 'Cost Analysis', path: '/cost-analysis' },
    { label: 'Settings', path: '/settings' },
  ];

  return (
    <nav className={styles.nav}>
      <div className={styles.logo}>
        Resale Intel
      </div>
      <div className={styles.menu}>
        {menuItems.map((item) => {
          const isActive = pathname === item.path || (pathname === '/' && item.path === '/dashboard');
          return (
            <Link 
              key={item.path} 
              href={item.path} 
              className={`${styles.menuItem} ${isActive ? styles.active : ''}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className={styles.footer}>
        Manager Portal v1.0
      </div>
    </nav>
  );
}
