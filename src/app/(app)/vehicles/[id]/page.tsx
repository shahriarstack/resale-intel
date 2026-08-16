'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function VehicleDetailPage({ params }: { params: { id: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [vehicle, setVehicle] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Cost form states
  const [costForm, setCostForm] = useState({
    repairCost: 0,
    transportCost: 0,
    registrationCost: 0,
    sopCost: 0,
    finalApprovedPrice: 0,
    remarks: ''
  });

  const [assessmentMedia, setAssessmentMedia] = useState<any[]>([]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      fetchVehicle();
    }
  }, [status, router]);

  const fetchVehicle = async () => {
    try {
      const res = await fetch(`/api/vehicles/${params.id}`);
      const json = await res.json();
      if (json.success) {
        setVehicle(json.data);
        if (json.data.costAnalysis) {
          const latest = json.data.costAnalysis;
          setCostForm({
            repairCost: latest.repairCosts || 0,
            transportCost: latest.transportCosts || 0,
            registrationCost: latest.registrationCost || 0,
            sopCost: latest.sopCost || 0,
            finalApprovedPrice: latest.approvedPrice || 0,
            remarks: latest.remarks || ''
          });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCostSubmit = async (e: React.FormEvent, type: string) => {
    e.preventDefault();
    // Simplified logic: create a new cost record
    try {
      const res = await fetch(`/api/vehicles/${params.id}/costs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...costForm, type })
      });
      const json = await res.json();
      if (json.success) {
        alert('Saved successfully!');
        fetchVehicle();
      } else {
        alert('Error saving data');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const uploadAssessmentImages = async () => {
    const uploadedMedia = [];
    for (const file of assessmentMedia) {
      const formData = new FormData();
      formData.append('file', file.file);
      formData.append('type', 'ASSESSMENT');
      
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (json.success) {
        uploadedMedia.push(json.url);
      }
    }

    // Now save to assessment DB model
    await fetch(`/api/vehicles/${params.id}/assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: uploadedMedia })
    });
    alert('Assessment uploaded!');
    fetchVehicle();
  };

  const updateStatus = async (newStatus: string) => {
    try {
      const res = await fetch(`/api/vehicles/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const json = await res.json();
      if (json.success) fetchVehicle();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="p-8">Loading details...</div>;
  if (!vehicle) return <div className="p-8">Vehicle not found.</div>;

  const role = (session?.user as any)?.role;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>{vehicle.make} {vehicle.model}</h1>
        <span className={`status-badge bg-blue-500`}>{vehicle.status.replace(/_/g, ' ')}</span>
      </div>

      <div className="grid-list" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '2rem' }}>
        <div className="vehicle-card" style={{ padding: '1.5rem' }}>
          <h3 className="mb-4 font-bold text-lg">Basic Information</h3>
          <p><strong>Customer:</strong> {vehicle.customerName} ({vehicle.customerCode})</p>
          <p><strong>Registration:</strong> {vehicle.registrationNo}</p>
          <p><strong>Year:</strong> {vehicle.year}</p>
          <p><strong>Mileage:</strong> {vehicle.mileage} km</p>
          <p><strong>Territory:</strong> {vehicle.territory}</p>
          <p><strong>Captured By:</strong> {vehicle.capturedBy?.name}</p>
          <p><strong>Engineer:</strong> {vehicle.assignedEngineer?.name || 'Unassigned'}</p>
        </div>

        <div className="vehicle-card" style={{ padding: '1.5rem' }}>
          <h3 className="mb-4 font-bold text-lg">Images</h3>
          <div className="grid grid-cols-3 gap-2">
            {vehicle.media.map((img: any, idx: number) => (
              <a key={idx} href={img.url} target="_blank" rel="noreferrer" className="block w-full aspect-square bg-gray-800 rounded">
                <img src={img.url} alt={img.type} className="w-full h-full object-cover rounded" />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Role Based Forms */}
      {role === 'SERVICE_ENGINEER' && vehicle.status === 'CAPTURED' && (
        <div className="vehicle-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
          <h3 className="mb-4 font-bold text-lg text-blue-400">Service Engineer Action</h3>
          <form onSubmit={e => { e.preventDefault(); updateStatus('COST_ANALYSIS_PENDING'); }}>
            <div className="form-group">
              <label>Initial Repair Cost (Tk)</label>
              <input type="number" value={costForm.repairCost} onChange={e => setCostForm({...costForm, repairCost: parseFloat(e.target.value)})} />
            </div>
            <div className="form-group">
              <label>Upload Manual Assessments</label>
              <input type="file" multiple accept="image/*" onChange={e => {
                if(e.target.files) {
                  const filesArray = Array.from(e.target.files).map(f => ({ file: f, preview: URL.createObjectURL(f) }));
                  setAssessmentMedia(prev => [...prev, ...filesArray]);
                }
              }} className="mb-2 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={uploadAssessmentImages}>Upload Images</button>
              <button type="submit" className="btn-primary">Submit to Service Head</button>
            </div>
          </form>
        </div>
      )}

      {role === 'SERVICE_HEAD' && (vehicle.status === 'COST_ANALYSIS_PENDING' || vehicle.status === 'REPAIR_APPROVED') && (
        <div className="vehicle-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
          <h3 className="mb-4 font-bold text-lg text-green-400">Service Head Action</h3>
          <form onSubmit={e => { e.preventDefault(); updateStatus('REPAIR_APPROVED'); }}>
            <div className="form-group">
              <label>Approved Repair Cost (Tk)</label>
              <input type="number" value={costForm.repairCost} onChange={e => setCostForm({...costForm, repairCost: parseFloat(e.target.value)})} />
            </div>
            <div className="form-group">
              <label>Repair SLA Deadline</label>
              <input type="date" />
            </div>
            <button type="submit" className="btn-primary">Approve Repair</button>
          </form>
        </div>
      )}

      {(role === 'REGISTRATION_TEAM' || role === 'SUPER_ADMIN') && (
        <div className="vehicle-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
          <h3 className="mb-4 font-bold text-lg text-yellow-400">Registration Team Action</h3>
          <form onSubmit={e => { e.preventDefault(); updateStatus('REG_COST_ADDED'); }}>
            <div className="form-group">
              <label>Registration & Ownership Transfer Cost (Tk)</label>
              <input type="number" value={costForm.registrationCost} onChange={e => setCostForm({...costForm, registrationCost: parseFloat(e.target.value)})} />
            </div>
            <button type="submit" className="btn-primary">Submit Cost</button>
          </form>
        </div>
      )}

      {(role === 'SR_EXECUTIVE' || role === 'SUPER_ADMIN') && (
        <div className="vehicle-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
          <h3 className="mb-4 font-bold text-lg text-purple-400">Sr. Executive Action</h3>
          <form onSubmit={e => { e.preventDefault(); updateStatus('SOP_COST_ADDED'); }}>
            <div className="form-group">
              <label>SOP Cost (Tk)</label>
              <input type="number" value={costForm.sopCost} onChange={e => setCostForm({...costForm, sopCost: parseFloat(e.target.value)})} />
            </div>
            <button type="submit" className="btn-primary">Submit SOP Cost</button>
          </form>
        </div>
      )}

      {/* Executive Approval (AGM / GM) */}
      {(role === 'AGM_DGM' || role === 'GM_SR_GM' || role === 'SUPER_ADMIN') && (
        <div className="vehicle-card" style={{ padding: '1.5rem', marginBottom: '2rem', border: '1px solid #10b981' }}>
          <h3 className="mb-4 font-bold text-lg text-green-400">Executive Final Approval</h3>
          <div className="mb-4 p-4 bg-gray-900 rounded">
            <h4 className="text-sm font-bold text-gray-400 uppercase mb-2">Cost Breakdown</h4>
            <div className="flex justify-between border-b border-gray-700 py-1"><span>Repair & Transport:</span> <span>Tk {costForm.repairCost + costForm.transportCost}</span></div>
            <div className="flex justify-between border-b border-gray-700 py-1"><span>Registration Cost:</span> <span>Tk {costForm.registrationCost}</span></div>
            <div className="flex justify-between border-b border-gray-700 py-1"><span>SOP Cost:</span> <span>Tk {costForm.sopCost}</span></div>
            <div className="flex justify-between font-bold py-2 text-blue-400"><span>Total Accumulated Costs:</span> <span>Tk {costForm.repairCost + costForm.transportCost + costForm.registrationCost + costForm.sopCost}</span></div>
          </div>
          
          <form onSubmit={async e => { 
            e.preventDefault(); 
            // 1. Save the final price
            await handleCostSubmit(e as any, 'FINAL_APPROVAL');
            // 2. Push status to live
            await updateStatus('LIVE_FOR_RESALE'); 
          }}>
            <div className="form-group">
              <label>Final Approved Selling Price (Tk)</label>
              <input type="number" required value={costForm.finalApprovedPrice} onChange={e => setCostForm({...costForm, finalApprovedPrice: parseFloat(e.target.value)})} className="text-xl font-bold" />
            </div>
            <button type="submit" className="btn-success w-full text-lg py-3">APPROVE & PUSH TO LIVE SHOWROOM</button>
          </form>
        </div>
      )}

    </div>
  );
}
