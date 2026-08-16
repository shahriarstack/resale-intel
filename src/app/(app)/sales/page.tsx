'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function SalesShowroomPage() {
  const { status } = useSession();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      fetchLiveVehicles();
    }
  }, [status, router]);

  const fetchLiveVehicles = async () => {
    try {
      const res = await fetch('/api/vehicles');
      const json = await res.json();
      if (json.success) {
        // Filter only LIVE_FOR_RESALE for the showroom
        const liveVehicles = json.data.filter((v: any) => v.status === 'LIVE_FOR_RESALE');
        setVehicles(liveVehicles);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Loading showroom...</div>;

  return (
    <div className="admin-page sales-showroom-page">
      <div className="admin-header no-border">
        <div>
          <h1 className="gradient-text">Live Showroom</h1>
          <p className="text-muted">Vehicles approved and ready for resale</p>
        </div>
      </div>

      <div className="grid-list">
        {vehicles.length === 0 ? (
          <div className="text-muted text-center showroom-empty">No vehicles available for sale right now.</div>
        ) : (
          vehicles.map(vehicle => (
            <div key={vehicle.id} className="vehicle-card showroom-card">
              <div className="showroom-image-container">
                {vehicle.media && vehicle.media.length > 0 ? (
                  <img src={vehicle.media.find((m: any) => m.type === 'FRONT')?.url || vehicle.media[0].url} alt="Vehicle" />
                ) : (
                  <div className="no-image">No Image</div>
                )}
                <div className="status-badge bg-green-500 absolute-badge">
                  AVAILABLE
                </div>
              </div>
              
              <div className="vehicle-card-body showroom-body">
                <h3>{vehicle.make} {vehicle.model}</h3>
                <p className="vehicle-meta">{vehicle.year} • {vehicle.mileage} km • {vehicle.territory}</p>
                
                <div className="showroom-footer">
                  <div className="price-container">
                    <span className="price-label">Approved Price</span>
                    <span className="price-value">Tk {vehicle.costAnalysis?.approvedPrice?.toLocaleString() || 'TBA'}</span>
                  </div>
                  <button className="btn-secondary" onClick={() => router.push(`/vehicles/${vehicle.id}`)}>
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
