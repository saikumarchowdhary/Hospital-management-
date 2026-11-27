import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Camera, Upload, QrCode, RefreshCw, CheckCircle2, AlertCircle, FileText, BedDouble, Building2, Users } from 'lucide-react';
import jsQR from 'jsqr';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onScanResult: (rawText: string, parsedData: any) => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
}

type CameraErrorType = 'denied' | 'not_found' | 'in_use' | 'unsupported' | 'other';

interface CameraErrorState {
  type: CameraErrorType;
  title: string;
  message: string;
}

export const QrScannerModal: React.FC<Props> = ({ isOpen, onClose, onScanResult, onNotify }) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'samples'>('camera');
  const [cameraError, setCameraError] = useState<CameraErrorState | null>(null);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'unsupported' | 'unknown'>('unknown');
  const [isRequestingCamera, setIsRequestingCamera] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [lastScanned, setLastScanned] = useState<{ raw: string; parsed: any } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const activeSessionRef = useRef(false);

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const handleDetectedText = useCallback(
    (raw: string) => {
      let parsed: any = raw;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { type: 'RAW_TEXT', value: raw };
      }
      setLastScanned({ raw, parsed });
      onNotify('QR Code scanned successfully!', 'success');
      stopCamera();
      onScanResult(raw, parsed);
    },
    [onNotify, onScanResult, stopCamera]
  );

  const scanFrame = useCallback(() => {
    if (!scanningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code) {
          handleDetectedText(code.data);
          return;
        }
      }
    }
    if (scanningRef.current) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
    }
  }, [handleDetectedText]);

  const startCamera = useCallback(async (forceRetryRequest = false) => {
    setCameraError(null);
    stopCamera();

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setPermissionState('unsupported');
      setCameraError({
        type: 'unsupported',
        title: 'Live Camera Unavailable',
        message: 'This browser or embedded view does not support live camera streaming. Upload a QR image or choose a Demo QR below.',
      });
      return;
    }

    if (!forceRetryRequest && navigator.permissions?.query) {
      try {
        const perm = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (!activeSessionRef.current) return;
        setPermissionState(perm.state);
        if (perm.state === 'denied') {
          setCameraError({
            type: 'denied',
            title: 'Camera Permission Needed',
            message:
              'Camera access was previously denied. Allow camera access in your browser site settings (lock or camera icon in the address bar) and click Retry to re-trigger the camera request.',
          });
          return;
        }
      } catch {
        // Permissions API for camera is optional across browsers; continue to getUserMedia
      }
    }

    setIsRequestingCamera(true);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } },
        });
      } catch (constraintErr: any) {
        if (constraintErr?.name === 'OverconstrainedError' || constraintErr?.name === 'ConstraintNotSatisfiedError') {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } else {
          throw constraintErr;
        }
      }

      if (!activeSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      setPermissionState('granted');
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        scanningRef.current = true;
        setIsScanning(true);
        animFrameRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err: any) {
      if (!activeSessionRef.current) return;
      const errName = err?.name || '';
      const errMsg = String(err?.message || '');
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || /denied|permission/i.test(errMsg)) {
        setPermissionState('denied');
        setCameraError({
          type: 'denied',
          title: 'Camera Permission Needed',
          message:
            'Camera access is currently blocked. Enable camera access in your browser site settings and click Retry to request camera access again.',
        });
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setCameraError({
          type: 'not_found',
          title: 'No Camera Detected',
          message: 'No working camera was found on this device. You can still scan codes using Upload Image or Demo QRs.',
        });
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setCameraError({
          type: 'in_use',
          title: 'Camera Busy',
          message: 'Your camera appears to be in use by another app or browser tab. Close the other session and click Retry.',
        });
      } else {
        setCameraError({
          type: 'other',
          title: 'Unable to Start Camera',
          message: errMsg || 'Could not initialize camera stream. Click Retry or switch to Upload Image / Demo QRs.',
        });
      }
      scanningRef.current = false;
      setIsScanning(false);
    } finally {
      if (activeSessionRef.current) {
        setIsRequestingCamera(false);
      }
    }
  }, [facingMode, scanFrame, stopCamera]);

  useEffect(() => {
    let permStatus: PermissionStatus | null = null;
    const handlePermChange = () => {
      if (!permStatus) return;
      setPermissionState(permStatus.state);
      if (permStatus.state === 'granted' && activeSessionRef.current) {
        startCamera(true);
      }
    };

    if (isOpen && activeTab === 'camera') {
      activeSessionRef.current = true;
      startCamera(false);
      if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
        navigator.permissions
          .query({ name: 'camera' as PermissionName })
          .then((status) => {
            permStatus = status;
            status.addEventListener?.('change', handlePermChange);
          })
          .catch(() => {});
      }
    } else {
      activeSessionRef.current = false;
      stopCamera();
    }

    return () => {
      activeSessionRef.current = false;
      if (permStatus) {
        permStatus.removeEventListener?.('change', handlePermChange);
      }
      stopCamera();
    };
  }, [isOpen, activeTab, startCamera, stopCamera]);

  const handleRetryCamera = () => {
    startCamera(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onerror = () => {
      onNotify('Failed to read the selected image file.', 'error');
    };
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => {
        onNotify('Invalid image file. Please select a PNG, JPG, or WebP image.', 'error');
      };
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          onNotify('Could not process image context', 'error');
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code) {
          handleDetectedText(code.data);
        } else {
          onNotify('No valid QR code detected in the uploaded image.', 'error');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const sampleQrs = [
    {
      label: 'Patient Record (PT-000001)',
      category: 'Patient',
      icon: Users,
      payload: JSON.stringify({ type: 'HMS_PATIENT', patient_code: 'PT-000001', name: 'Aarav Sharma' }),
    },
    {
      label: 'ICU Bed Assignment (BED-ICU-01)',
      category: 'Bed & Equipment',
      icon: BedDouble,
      payload: JSON.stringify({
        type: 'HMS_BED_ASSIGNMENT',
        bed: 'BED-ICU-01',
        ward: 'Intensive Care Unit',
        room: 'ICU-101',
        status: 'Occupied',
        patient: 'Aarav Sharma',
        patient_code: 'PT-000001',
      }),
    },
    {
      label: 'Cardiology Department',
      category: 'Department',
      icon: Building2,
      payload: JSON.stringify({
        type: 'HMS_DEPARTMENT_LABEL',
        code: 'DEPT-CARD',
        name: 'Cardiology & Vascular Surgery',
        category: 'clinical',
        branch: 'Main Campus',
      }),
    },
    {
      label: 'Prescription Verification (RX-2026-001)',
      category: 'Pharmacy',
      icon: FileText,
      payload: '/verify/prescription/RX-2026-001',
    },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">QR Code & Barcode Scanner</h3>
              <p className="text-xs text-slate-500">Scan patient, bed, equipment or prescription QR labels</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="w-8 h-8 rounded-xl bg-slate-200/70 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-100/60 p-1.5 gap-1">
          <button
            onClick={() => {
              setActiveTab('camera');
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'camera' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <Camera className="w-4 h-4" /> Live Camera
          </button>
          <button
            onClick={() => {
              setActiveTab('upload');
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'upload' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <Upload className="w-4 h-4" /> Upload Image
          </button>
          <button
            onClick={() => {
              setActiveTab('samples');
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'samples' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <QrCode className="w-4 h-4" /> Demo QRs
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {activeTab === 'camera' && (
            <div className="space-y-4">
              <div className="relative bg-slate-900 rounded-2xl overflow-hidden aspect-video flex items-center justify-center shadow-inner">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                <canvas ref={canvasRef} className="hidden" />

                {/* Scanner Viewfinder Overlay */}
                <div className="absolute inset-0 border-[32px] border-slate-950/40 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-48 border-2 border-indigo-400 rounded-2xl relative animate-pulse flex items-center justify-center">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white"></div>
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white"></div>
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white"></div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white"></div>
                    <span className="text-[10px] text-white/80 bg-slate-900/80 px-2 py-0.5 rounded font-mono">
                      Align QR inside frame
                    </span>
                  </div>
                </div>

                {cameraError && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="absolute inset-0 bg-slate-950/95 p-5 flex flex-col items-center justify-center text-center overflow-y-auto"
                  >
                    <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-2 shrink-0">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-bold text-white">{cameraError.title}</h4>
                    <p className="text-[11px] text-slate-300 mt-1 max-w-sm leading-relaxed">
                      MediCore HMS requires camera permission only to scan patient wristbands, bed tags, and prescription QR labels in real time—no video or images are stored.
                    </p>
                    <p className="text-[11px] text-amber-200 mt-2 max-w-sm leading-relaxed">
                      {cameraError.message}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        disabled={isRequestingCamera}
                        onClick={handleRetryCamera}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRequestingCamera ? 'animate-spin' : ''}`} />
                        <span>{isRequestingCamera ? 'Requesting...' : 'Retry'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('upload')}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" /> Upload QR
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('samples')}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                      >
                        <QrCode className="w-3.5 h-3.5" /> Demo QRs
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isScanning ? 'bg-emerald-500 animate-ping' : permissionState === 'denied' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                  {isScanning
                    ? 'Camera active & scanning...'
                    : permissionState === 'denied'
                    ? 'Camera permission blocked'
                    : 'Camera paused'}
                </span>
                <button
                  onClick={() => {
                    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Switch Camera ({facingMode})
                </button>
              </div>
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="space-y-4">
              <label className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer bg-slate-50 hover:bg-indigo-50/30 transition-colors text-center group">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-slate-800">Upload QR Image File</span>
                <span className="text-[11px] text-slate-500 mt-1">PNG, JPG, or WebP containing a hospital QR code</span>
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          )}

          {activeTab === 'samples' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 font-medium">Click any sample record to instantly simulate scanning its QR code:</p>
              <div className="grid grid-cols-1 gap-2.5 max-h-72 overflow-y-auto pr-1">
                {sampleQrs.map((item, idx) => {
                  const IconComp = item.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleDetectedText(item.payload)}
                      className="p-3 bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 rounded-xl text-left flex items-center justify-between transition-all group"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-xl bg-white shadow-xs border border-slate-200 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <IconComp className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-900">{item.label}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{item.category}</div>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-indigo-600 bg-indigo-100 px-2.5 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        Scan
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {lastScanned && (
            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start space-x-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs flex-1 min-w-0">
                <span className="font-bold text-emerald-900 block">Successfully Scanned!</span>
                <span className="text-emerald-700 font-mono truncate block mt-0.5">{lastScanned.raw}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold"
          >
            Close Scanner
          </button>
        </div>
      </div>
    </div>
  );
};
