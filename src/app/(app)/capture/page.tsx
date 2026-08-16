'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function CaptureFlow() {
  const { data: session } = useSession();
  const router = useRouter();
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [engineers, setEngineers] = useState<any[]>([]);
  
  // Form State
  const [formData, setFormData] = useState({
    customerCode: '',
    customerName: '',
    make: '',
    model: '',
    year: '',
    registrationNo: '',
    mileage: '',
    territory: '',
    hasRegistrationCert: false,
    remarks: '',
    capturedLoc: '',
    currentLoc: '',
    letterStatus: '',
    assignedEngineerId: ''
  });

  // Media State
  const [media, setMedia] = useState<any>({
    LEFT: null,
    RIGHT: null,
    FRONT: null,
    BACK: null,
    CABIN: null,
    SLEEP: null
  });

  useEffect(() => {
    // Fetch engineers for the final step
    fetch('/api/users').then(res => res.json()).then(data => {
      if (data.success) {
        setEngineers(data.data.filter((u: any) => u.role === 'SERVICE_ENGINEER' || u.role === 'SUPER_ADMIN'));
      }
    });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handleFileUpload = async (type: string, file: File) => {
    // Temporary preview
    setMedia((prev: any) => ({ ...prev, [type]: { file, preview: URL.createObjectURL(file) } }));
  };

  const uploadFilesToServer = async () => {
    const uploadedMedia = [];
    for (const [type, data] of Object.entries(media)) {
      if (data && (data as any).file) {
        const formData = new FormData();
        formData.append('file', (data as any).file);
        formData.append('type', type);
        
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const json = await res.json();
        if (json.success) {
          uploadedMedia.push({ url: json.url, type });
        }
      }
    }
    return uploadedMedia;
  };

  const submitForm = async () => {
    setLoading(true);
    try {
      // 1. Upload images first
      const uploadedMedia = await uploadFilesToServer();
      
      // 2. Submit capture data
      const payload = {
        ...formData,
        media: uploadedMedia,
        capturedById: (session?.user as any)?.id
      };
      
      const res = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const json = await res.json();
      if (json.success) {
        alert('Vehicle Captured Successfully!');
        router.push('/'); // Redirect to dashboard
      } else {
        alert('Error: ' + json.error);
      }
    } catch (err) {
      console.error(err);
      alert('Upload failed.');
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => setStep(s => Math.min(5, s + 1));
  const prevStep = () => setStep(s => Math.max(1, s - 1));

  const renderStepIndicator = () => (
    <div className="step-indicator">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className={`step-dot ${step >= i ? 'active' : ''}`} />
      ))}
    </div>
  );

  return (
    <div className="capture-flow-page">
      <div className="mobile-header">
        <h2>Capture Vehicle</h2>
        {renderStepIndicator()}
      </div>

      <div className="form-content">
        {step === 1 && (
          <div className="step-section animation-fade-in">
            <h3>Basic Information</h3>
            <div className="form-group">
              <label>Customer Name</label>
              <input type="text" name="customerName" value={formData.customerName} onChange={handleInputChange} placeholder="E.g. Md. Rahim" required />
            </div>
            <div className="form-group">
              <label>Customer Code</label>
              <input type="text" name="customerCode" value={formData.customerCode} onChange={handleInputChange} placeholder="CUST-001" required />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Make / Brand</label>
                <input type="text" name="make" value={formData.make} onChange={handleInputChange} placeholder="Yamaha" required />
              </div>
              <div className="form-group">
                <label>Model</label>
                <input type="text" name="model" value={formData.model} onChange={handleInputChange} placeholder="R15 V3" required />
              </div>
            </div>
            <div className="form-group">
              <label>Registration No (Required)</label>
              <input type="text" name="registrationNo" value={formData.registrationNo} onChange={handleInputChange} placeholder="DHAKA-METRO-LA-11-2233" required />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Mfg Year</label>
                <input type="number" name="year" value={formData.year} onChange={handleInputChange} placeholder="2021" />
              </div>
              <div className="form-group">
                <label>Mileage (km)</label>
                <input type="text" name="mileage" value={formData.mileage} onChange={handleInputChange} placeholder="12500" />
              </div>
            </div>
            <div className="form-group">
              <label>Territory</label>
              <input type="text" name="territory" value={formData.territory} onChange={handleInputChange} placeholder="Dhaka South" required />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="step-section animation-fade-in">
            <h3>Documentations</h3>
            <label className="checkbox-container">
              <input type="checkbox" name="hasRegistrationCert" checked={formData.hasRegistrationCert} onChange={handleInputChange} />
              <span className="checkmark"></span>
              Registration Certificate Available?
            </label>
            
            <div className="form-group mt-4">
              <label>Remarks / Condition Notes</label>
              <textarea name="remarks" value={formData.remarks} onChange={handleInputChange} rows={4} placeholder="Describe any dents, missing parts, or engine issues..."></textarea>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="step-section animation-fade-in">
            <h3>Vehicle Pictures</h3>
            <p className="text-muted mb-4">Please upload 6 required pictures. You can use your camera directly.</p>
            
            <div className="image-grid">
              {['LEFT', 'RIGHT', 'FRONT', 'BACK', 'CABIN', 'SLEEP'].map(type => (
                <div key={type} className="image-upload-card">
                  <label>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files && handleFileUpload(type, e.target.files[0])} />
                    {media[type] ? (
                      <div className="preview-container">
                        <img src={media[type].preview} alt={type} />
                        <div className="preview-overlay">Tap to retake</div>
                      </div>
                    ) : (
                      <div className="upload-placeholder">
                        <span className="icon">📷</span>
                        <span>{type}</span>
                      </div>
                    )}
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="step-section animation-fade-in">
            <h3>Location Details</h3>
            <div className="form-group">
              <label>Captured Location</label>
              <input type="text" name="capturedLoc" value={formData.capturedLoc} onChange={handleInputChange} placeholder="Where was the vehicle captured?" required />
            </div>
            <div className="form-group">
              <label>Current Location</label>
              <input type="text" name="currentLoc" value={formData.currentLoc} onChange={handleInputChange} placeholder="Where is it currently stored?" required />
            </div>
            
            <button type="button" className="btn-secondary w-full mt-4" onClick={() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((pos) => {
                  setFormData(prev => ({...prev, currentLoc: `${pos.coords.latitude}, ${pos.coords.longitude}`}));
                });
              } else {
                alert('Geolocation is not supported');
              }
            }}>
              📍 Use Current GPS Location
            </button>
          </div>
        )}

        {step === 5 && (
          <div className="step-section animation-fade-in">
            <h3>Finalization & Assignment</h3>
            <div className="form-group">
              <label>Letter Status</label>
              <select name="letterStatus" value={formData.letterStatus} onChange={handleInputChange}>
                <option value="">-- Select Letter Status --</option>
                <option value="LETTER_1">Letter 1</option>
                <option value="LETTER_2">Letter 2</option>
                <option value="LETTER_3">Letter 3</option>
                <option value="WRITTEN">Written</option>
                <option value="RELEASED">Released</option>
                <option value="REQ_CN">Requested CN</option>
              </select>
            </div>
            <div className="form-group">
              <label>Assign Service Engineer</label>
              <select name="assignedEngineerId" value={formData.assignedEngineerId} onChange={handleInputChange} required>
                <option value="">-- Select Engineer --</option>
                {engineers.map(eng => (
                  <option key={eng.id} value={eng.id}>{eng.name} ({eng.staffId})</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="form-actions bottom-fixed">
        {step > 1 && (
          <button type="button" className="btn-secondary" onClick={prevStep} disabled={loading}>Back</button>
        )}
        {step < 5 ? (
          <button type="button" className="btn-primary" onClick={nextStep} style={{ marginLeft: 'auto' }}>Next Step</button>
        ) : (
          <button type="button" className="btn-success" onClick={submitForm} disabled={loading} style={{ marginLeft: 'auto' }}>
            {loading ? 'Uploading & Saving...' : 'Submit Capture'}
          </button>
        )}
      </div>
    </div>
  );
}
