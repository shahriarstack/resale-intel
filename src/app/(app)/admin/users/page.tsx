'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function UserManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    staffId: '',
    employeeId: '',
    password: '',
    area: '',
    role: 'RECOVERY_TEAM'
  });

  const roles = [
    'SUPER_ADMIN', 'RECOVERY_TEAM', 'RECOVERY_MANAGER', 
    'SERVICE_ENGINEER', 'SERVICE_HEAD', 'REGISTRATION_TEAM', 
    'SR_EXECUTIVE', 'AGM_DGM', 'GM_SR_GM', 'SALES_TEAM'
  ];

  useEffect(() => {
    if (status === 'unauthenticated' || (session?.user as any)?.role !== 'SUPER_ADMIN') {
      router.push('/');
    } else if (status === 'authenticated') {
      fetchUsers();
    }
  }, [status, session, router]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      const json = await res.json();
      if (json.success) {
        setUsers(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (user: any = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name || '',
        staffId: user.staffId || '',
        employeeId: user.employeeId || '',
        password: user.password || '',
        area: user.area || '',
        role: user.role
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        staffId: '',
        employeeId: '',
        password: '',
        area: '',
        role: 'RECOVERY_TEAM'
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
    const method = editingUser ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      
      if (data.success) {
        setIsModalOpen(false);
        fetchUsers();
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="p-8">Loading users...</div>;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>User Management</h1>
        <button className="btn-primary" onClick={() => openModal()}>+ Add New User</button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Staff ID</th>
              <th>Employee ID</th>
              <th>Role</th>
              <th>Area/Territory</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.staffId}</td>
                <td>{user.employeeId}</td>
                <td><span className={`role-badge ${user.role}`}>{user.role.replace(/_/g, ' ')}</span></td>
                <td>{user.area}</td>
                <td>
                  <button className="btn-edit" onClick={() => openModal(user)}>Edit</button>
                  <button className="btn-delete" onClick={() => handleDelete(user.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>{editingUser ? 'Edit User' : 'Add New User'}</h2>
            <form onSubmit={handleSubmit} className="admin-form">
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Staff ID (For Engineer mapping)</label>
                  <input type="text" value={formData.staffId} onChange={e => setFormData({...formData, staffId: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label>Employee ID (Used for Login)</label>
                  <input type="text" value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Password</label>
                  <input type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label>Area / Territory</label>
                  <input type="text" value={formData.area} onChange={e => setFormData({...formData, area: e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label>System Role</label>
                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} required>
                  {roles.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Save User</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
