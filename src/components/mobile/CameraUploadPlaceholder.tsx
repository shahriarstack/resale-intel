'use client';

import { useState } from 'react';
import styles from './CameraUploadPlaceholder.module.css';
import Image from 'next/image';

interface CameraUploadPlaceholderProps {
  label?: string;
  onCapture?: (file: File) => void;
}

export default function CameraUploadPlaceholder({ 
  label = "Tap to take photo",
  onCapture
}: CameraUploadPlaceholderProps) {
  const [preview, setPreview] = useState<string | null>(null);

  const handleSimulatedCapture = () => {
    // In a real app, this would trigger an <input type="file" accept="image/*" capture="environment" />
    // For this mockup, we'll just set a placeholder gradient/image
    
    // Simulate haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50);
    }

    // Mock an image capture
    setPreview('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiM0YTU1NjgiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZmlsbD0id2hpdGUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjIwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5DYXB0dXJlZCBJbWFnZTwvdGV4dD48L3N2Zz4=');
    
    if (onCapture) {
      // Mock passing a file
      const mockFile = new File([''], 'photo.jpg', { type: 'image/jpeg' });
      onCapture(mockFile);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreview(null);
  };

  return (
    <div 
      className={`${styles.container} ${preview ? styles.hasImage : ''}`}
      onClick={!preview ? handleSimulatedCapture : undefined}
    >
      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Captured" className={styles.imagePreview} />
          <button className={styles.removeBtn} onClick={handleRemove} aria-label="Remove image">
            <CloseIcon />
          </button>
        </>
      ) : (
        <div className={styles.content}>
          <CameraIcon />
          <span className={styles.text}>{label}</span>
          <span className={styles.subtext}>Requires camera access</span>
        </div>
      )}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="3.2"/>
      <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}
