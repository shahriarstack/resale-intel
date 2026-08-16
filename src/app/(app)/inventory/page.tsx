'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function InventoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      fetchVehicles();
    }
  }, [status, router]);

  const fetchVehicles = async () => {
    try {
      const res = await fetch('/api/vehicles');
      const json = await res.json();
      if (json.success) {
        setVehicles(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'CAPTURED': return 'bg-gray-500';
      case 'COST_ANALYSIS_PENDING': return 'bg-yellow-500';
      case 'REPAIR_APPROVED': return 'bg-blue-500';
      case 'LIVE_FOR_RESALE': return 'bg-green-500';
      default: return 'bg-gray-700';
    }
  };

  if (loading) return <div className="p-8">Loading vehicles...</div>;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>Vehicle Inventory</h1>
        {(session?.user as any)?.role === 'RECOVERY_TEAM' && (
          <Link href="/capture" className="btn-primary">+ Add New Capture</Link>
        )}
      </div>

      <div className="grid-list">
        {vehicles.length === 0 ? (
          <div className="text-muted p-8 text-center">No vehicles found.</div>
        ) : (
          vehicles.map(vehicle => (
            <div key={vehicle.id} className="vehicle-card">
              <div className="vehicle-card-header">
                <h3>{vehicle.make} {vehicle.model}</h3>
                <span className={`status-badge ${getStatusColor(vehicle.status)}`}>
                  {vehicle.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="vehicle-card-body">
                <p><strong>Reg No:</strong> {vehicle.registrationNo}</p>
                <p><strong>Territory:</strong> {vehicle.territory}</p>
                <p><strong>Assigned Engineer:</strong> {vehicle.assignedEngineer?.name || 'Unassigned'}</p>
                <p className="text-xs text-muted mt-2">Captured on: {new Date(vehicle.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="vehicle-card-footer">
                <Link href={`/vehicles/${vehicle.id}`} className="btn-secondary w-full text-center block">
                  View Details & Actions
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
