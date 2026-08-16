'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  name: string;
  role: string;
  area: string | null;
}

export default function LoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.data)) {
          setUsers(data.data);
          setFilteredUsers(data.data);
        }
      })
      .catch(err => console.error("Failed to load users", err));
  }, []);

  useEffect(() => {
    if (searchQuery) {
      setFilteredUsers(users.filter(u => 
        (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        (u.area || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.role || '').toLowerCase().includes(searchQuery.toLowerCase())
      ));
    } else {
      setFilteredUsers(users);
    }
  }, [searchQuery, users]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) {
      setError('Please select a user first');
      return;
    }
    setError('');
    setLoading(true);

    const res = await signIn('credentials', {
      id: selectedUser.id,
      employeeId,
      redirect: false,
    });

    if (res?.error) {
      setError('Invalid Employee ID');
      setLoading(false);
    } else {
      router.push('/');
    }
  };

  return (
    <div className="sales360-login-wrapper">
      
      {/* LEFT SIDE: Branding Panel */}
      <div className="sales360-branding-panel">
        <div style={{ textAlign: 'center' }}>
          <h1 className="sales360-brand-title">
            <span>Resale</span>
            <span className="sales360-brand-accent">Intel</span>
          </h1>
          <p className="sales360-brand-subtitle">
            Commercial vehicle recovery & resale management for Foton and Mahindra.
          </p>
        </div>
      </div>

      {/* RIGHT SIDE: Form Panel */}
      <div className="sales360-form-panel">
        <div className="sales360-card">
          
          <div>
            <span className="sales360-badge">Portal Access</span>
            <h2 className="sales360-card-title">Sign In</h2>
            <p className="sales360-card-desc">Select your user profile and enter your Employee ID.</p>
          </div>

          {error && (
            <div className="sales360-error-banner">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            
            {/* Custom Searchable Dropdown */}
            <div className="sales360-form-group">
              <label className="sales360-label">Select User / Territory</label>
              
              <div 
                className="sales360-dropdown-trigger"
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                <div>
                  {selectedUser ? (
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{selectedUser.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{selectedUser.area || selectedUser.role.replace('_', ' ')}</div>
                    </div>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>Click to select user...</span>
                  )}
                </div>

                {/* Arrow Icon with EXPLICIT width and height so it never stretches! */}
                <svg 
                  width="18" 
                  height="18" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  style={{ 
                    transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    flexShrink: 0,
                    color: '#94a3b8'
                  }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {dropdownOpen && (
                <div className="sales360-dropdown-menu">
                  <div className="sales360-dropdown-search">
                    <input 
                      type="text" 
                      placeholder="Search by name, area, or role..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  </div>
                  <div className="sales360-dropdown-list">
                    {filteredUsers.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>
                        No matching users found
                      </div>
                    ) : (
                      filteredUsers.map(user => (
                        <div 
                          key={user.id}
                          className="sales360-dropdown-item"
                          onClick={() => {
                            setSelectedUser(user);
                            setDropdownOpen(false);
                            setSearchQuery('');
                          }}
                        >
                          <span style={{ fontWeight: '600', fontSize: '0.9rem', color: '#ffffff' }}>{user.name}</span>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {user.area ? `${user.area} • ` : ''}{user.role.replace('_', ' ')}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Password / Employee ID Field */}
            <div className="sales360-form-group">
              <label className="sales360-label">Employee ID (Password)</label>
              <input
                type="password"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="sales360-input"
                placeholder="Enter your Employee ID"
                required
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="sales360-submit-btn"
            >
              {loading ? 'Authenticating...' : 'Secure Login'}
            </button>
          </form>
          
          <div className="sales360-footer-credit">
            crafted with precision by <span>Shahriar</span>
          </div>

        </div>
      </div>
      
    </div>
  );
}
