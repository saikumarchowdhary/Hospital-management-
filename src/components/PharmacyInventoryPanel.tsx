import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  Pill,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Download,
  Clock,
  Box,
  ShieldAlert,
  X,
  Volume2,
  VolumeX,
  Eye,
  Edit3,
  Check,
  History,
  Layers,
  FlaskConical,
  Scan,
  Droplets,
  Calendar,
  DollarSign,
  ArrowDownRight,
  ArrowUpRight,
  Radio,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  Bell,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiRequest, buildWsUrl } from '../lib/api';
import { ClinicalDiagnosticsPanel } from './ClinicalDiagnosticsPanel';

interface Props {
  searchQuery?: string;
  userRole: string;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
}

interface Medicine {
  id: number;
  sku: string;
  name: string;
  generic_name: string;
  category_id: number | null;
  category_name?: string;
  unit: string;
  unit_price: number;
  reorder_level: number;
  total_quantity: number;
  is_low_stock?: boolean;
  is_critical?: boolean;
  is_out_of_stock?: boolean;
  updated_at?: string;
}

interface Batch {
  id: number;
  medicine_id: number;
  medicine_name: string;
  sku: string;
  unit?: string;
  batch_number: string;
  expiry_date: string;
  quantity_received: number;
  quantity_available: number;
  cost_price: number;
  received_at?: string;
}

interface StockMovement {
  id: number;
  medicine_id: number;
  medicine_name: string;
  sku: string;
  unit: string;
  batch_number?: string;
  movement_type: string;
  quantity_delta: number;
  actor_name?: string;
  notes?: string;
  created_at: string;
}

interface Prescription {
  id: number;
  prescription_ref: string;
  patient_id: number;
  patient_name: string;
  patient_code: string;
  doctor_name: string;
  status: string;
  created_at: string;
  items: Array<{
    id: number;
    medicine_id?: number;
    medicine_name: string;
    dosage: string;
    frequency: string;
    duration: string;
    quantity: number;
  }>;
}

interface RefillRequest {
  id: number;
  prescription_id: number;
  prescription_ref: string;
  patient_name: string;
  notes?: string;
  status: string;
  created_at: string;
}

interface LowStockAlertEvent {
  id: string;
  medicineId: number;
  medicineName: string;
  sku: string;
  totalQuantity: number;
  reorderLevel: number;
  unit: string;
  isCritical: boolean;
  message: string;
  timestamp: string;
}

interface RealtimeToast {
  id: string;
  medicineName: string;
  sku: string;
  totalQuantity: number;
  reorderLevel: number;
  unit: string;
  isCritical: boolean;
  message: string;
  time: string;
}

export const PharmacyInventoryPanel: React.FC<Props> = ({
  searchQuery = '',
  userRole,
  onNotify,
  refreshSignal,
}) => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'batches' | 'dispense' | 'refills' | 'movements' | 'diagnostics'>('inventory');

  // Core Data
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [expiringSoon, setExpiringSoon] = useState<Batch[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [refills, setRefills] = useState<RefillRequest[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [internalSearch, setInternalSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'critical' | 'low' | 'instock' | 'out'>('all');

  // Expanded Batches in Table
  const [expandedMedIds, setExpandedMedIds] = useState<Record<number, boolean>>({});

  // Real-time WebSocket state
  const [wsConnected, setWsConnected] = useState(false);
  const [wsMessageCount, setWsMessageCount] = useState(0);
  const [audioAlertsEnabled, setAudioAlertsEnabled] = useState(true);
  const [liveAlerts, setLiveAlerts] = useState<LowStockAlertEvent[]>([]);
  const [recentlyUpdatedMedIds, setRecentlyUpdatedMedIds] = useState<Record<number, number>>({});
  const [realtimeToast, setRealtimeToast] = useState<RealtimeToast | null>(null);

  // Modals
  const [isAddMedOpen, setIsAddMedOpen] = useState(false);
  const [isReceiveBatchOpen, setIsReceiveBatchOpen] = useState(false);
  const [isAdjustStockOpen, setIsAdjustStockOpen] = useState(false);
  const [isEditReorderOpen, setIsEditReorderOpen] = useState(false);
  const [selectedMedForAction, setSelectedMedForAction] = useState<Medicine | null>(null);

  // Form states
  const [newMedForm, setNewMedForm] = useState({
    sku: '',
    name: '',
    generic_name: '',
    category_id: '',
    unit: 'Tablet',
    unit_price: '2.50',
    reorder_level: '20',
  });

  const [batchForm, setBatchForm] = useState({
    medicine_id: '',
    batch_number: '',
    expiry_date: '',
    quantity: '100',
    cost_price: '1.20',
  });

  const [adjustForm, setAdjustForm] = useState({
    medicine_id: '',
    batch_id: '',
    quantity_delta: '',
    reason: 'Cycle Count Reconciliation',
    notes: '',
  });

  const [reorderEditForm, setReorderEditForm] = useState({
    reorder_level: '',
    unit_price: '',
  });

  const audioContextRef = useRef<AudioContext | null>(null);

  // Sound generator for critical stock alerts
  const playAlertTone = useCallback((isCritical: boolean) => {
    if (!audioAlertsEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isCritical ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(isCritical ? 880 : 587.33, ctx.currentTime);
      if (isCritical) {
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25);
      }
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (isCritical ? 0.35 : 0.2));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (isCritical ? 0.35 : 0.2));
    } catch {
      // Audio playback suppressed by browser policy
    }
  }, [audioAlertsEnabled]);

  // Load inventory & prescription data
  const loadPharmacyData = useCallback(async () => {
    try {
      const [invRes, rxRes, movRes] = await Promise.all([
        apiRequest('/api/pharmacy/inventory'),
        apiRequest('/api/pharmacy/prescriptions').catch(() => ({ prescriptions: [], refills: [] })),
        apiRequest('/api/pharmacy/movements').catch(() => ({ movements: [] })),
      ]);

      setMedicines(invRes.medicines || []);
      setBatches(invRes.batches || []);
      setCategories(invRes.categories || []);
      setExpiringSoon(invRes.expiringSoon || []);
      setPrescriptions(rxRes.prescriptions || []);
      setRefills(rxRes.refills || []);
      setMovements(movRes.movements || []);
    } catch (err: any) {
      onNotify(err.message || 'Failed to fetch pharmacy inventory', 'error');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    loadPharmacyData();
  }, [loadPharmacyData, refreshSignal]);

  // Direct WebSocket subscription for Pharmacy inventory & real-time low-stock alerts
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isDisposed = false;

    const connectWebSocket = () => {
      try {
        const url = buildWsUrl();
        ws = new WebSocket(url);

        ws.onopen = () => {
          if (!isDisposed) setWsConnected(true);
        };

        ws.onclose = () => {
          if (!isDisposed) {
            setWsConnected(false);
            reconnectTimeout = setTimeout(connectWebSocket, 3500);
          }
        };

        ws.onerror = () => {
          if (!isDisposed) setWsConnected(false);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const evType = String(data.eventType || data.event || data.type || '');
            if (evType === 'connected' || evType === 'pong') return;

            setWsMessageCount((c) => c + 1);

            // 1. REAL-TIME NOTIFICATION LISTENER FOR 'low-stock' OR 'pharmacy:low_stock' EVENT
            if (evType === 'low-stock' || evType === 'pharmacy:low_stock') {
              const medId = Number(data.medicineId || data.medicine_id || data.id || 0);
              const medName = String(data.medicineName || data.name || data.medicine || 'Medication');
              const sku = String(data.sku || '');
              const qty = Number(data.totalQuantity ?? data.stock_qty ?? data.quantity ?? 0);
              const reorder = Number(data.reorderLevel ?? data.reorder_level ?? 20);
              const unit = String(data.unit || 'Units');
              const isCrit = Boolean(data.isCritical || qty <= 5 || qty === 0);
              const alertMsg = data.message || (isCrit
                ? `🚨 CRITICAL LOW STOCK: ${medName} (${sku}) has dropped to ${qty} ${unit}!`
                : `⚠️ LOW STOCK ALERT: ${medName} (${sku}) is at/below safety threshold (${qty}/${reorder} ${unit}).`);

              // A. Trigger parent toast notification
              onNotify(alertMsg, isCrit ? 'error' : 'success');

              // B. Trigger in-panel real-time toast banner
              setRealtimeToast({
                id: `toast-${Date.now()}`,
                medicineName: medName,
                sku,
                totalQuantity: qty,
                reorderLevel: reorder,
                unit,
                isCritical: isCrit,
                message: alertMsg,
                time: new Date().toLocaleTimeString(),
              });

              // C. Update the UI state for specific medication items immediately
              setMedicines((prev) =>
                prev.map((m) =>
                  (medId && m.id === medId) || (sku && m.sku === sku)
                    ? {
                        ...m,
                        total_quantity: qty,
                        reorder_level: reorder || m.reorder_level,
                        is_low_stock: true,
                        is_critical: isCrit,
                        is_out_of_stock: qty === 0,
                      }
                    : m
                )
              );

              // D. Highlight/flash the affected medication item row in table
              if (medId) {
                setRecentlyUpdatedMedIds((prev) => ({ ...prev, [medId]: Date.now() }));
                setTimeout(() => {
                  setRecentlyUpdatedMedIds((prev) => {
                    const copy = { ...prev };
                    delete copy[medId];
                    return copy;
                  });
                }, 6000);
              }

              // E. Add to live alerts feed & play sound
              const alertItem: LowStockAlertEvent = {
                id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                medicineId: medId,
                medicineName: medName,
                sku,
                totalQuantity: qty,
                reorderLevel: reorder,
                unit,
                isCritical: isCrit,
                message: alertMsg,
                timestamp: new Date().toLocaleTimeString(),
              };
              setLiveAlerts((prev) => [alertItem, ...prev.slice(0, 9)]);
              playAlertTone(isCrit);
            }

            // 2. Stock Updated event (from dispense, receipt, adjustment, or reorder threshold edit)
            if (evType === 'pharmacy:stock_updated' || evType === 'stock_updated' || evType === 'stock-updated') {
              const medId = Number(data.medicineId || data.medicine_id);
              const newTotal = Number(data.totalQuantity ?? data.stock_qty ?? data.quantity ?? 0);
              const isLow = Boolean(data.isLowStock);
              const isCrit = Boolean(data.isCritical || newTotal <= 5 || newTotal === 0);

              setMedicines((prev) =>
                prev.map((m) =>
                  m.id === medId
                    ? {
                        ...m,
                        total_quantity: newTotal,
                        reorder_level: data.reorderLevel !== undefined ? Number(data.reorderLevel) : m.reorder_level,
                        is_low_stock: isLow,
                        is_critical: isCrit,
                        is_out_of_stock: newTotal === 0,
                      }
                    : m
                )
              );

              // Flash highlight on this medicine row
              setRecentlyUpdatedMedIds((prev) => ({ ...prev, [medId]: Date.now() }));
              setTimeout(() => {
                setRecentlyUpdatedMedIds((prev) => {
                  const copy = { ...prev };
                  delete copy[medId];
                  return copy;
                });
              }, 4000);

              // Refresh batches and movements silently
              apiRequest('/api/pharmacy/inventory').then((res) => {
                if (res.batches) setBatches(res.batches);
                if (res.expiringSoon) setExpiringSoon(res.expiringSoon);
              }).catch(() => {});
              apiRequest('/api/pharmacy/movements').then((res) => {
                if (res.movements) setMovements(res.movements);
              }).catch(() => {});
            }

            // 3. Prescription dispensed or refill updated
            if (evType === 'pharmacy:dispensed') {
              loadPharmacyData();
            }

            // 4. Medicine created
            if (evType === 'pharmacy:medicine_created') {
              loadPharmacyData();
            }
          } catch {
            // Ignore parse errors on raw messages
          }
        };
      } catch {
        setWsConnected(false);
      }
    };

    connectWebSocket();

    return () => {
      isDisposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [buildWsUrl, loadPharmacyData, onNotify, playAlertTone]);

  // Combined Category List including requested categories: 'Antibiotics', 'Painkillers', 'Emergency', etc.
  const allCategoryNames = useMemo(() => {
    const priorityCategories = ['Antibiotics', 'Painkillers', 'Cardiovascular', 'Emergency', 'Analgesics', 'Endocrine', 'Respiratory', 'Gastrointestinal'];
    const fetched = categories.map((c) => c.name);
    return Array.from(new Set([...priorityCategories, ...fetched])).filter(Boolean);
  }, [categories]);

  // Synchronize internal search when parent search query changes
  useEffect(() => {
    if (searchQuery !== undefined) {
      setInternalSearch(searchQuery);
    }
  }, [searchQuery]);

  // Quick filter metrics
  const summaryMetrics = useMemo(() => {
    const total = medicines.length;
    const critical = medicines.filter((m) => m.total_quantity <= 5 || m.total_quantity === 0).length;
    const low = medicines.filter((m) => m.total_quantity <= m.reorder_level && m.total_quantity > 5).length;
    const optimal = medicines.filter((m) => m.total_quantity > m.reorder_level).length;
    const out = medicines.filter((m) => m.total_quantity === 0).length;
    const totalUnits = medicines.reduce((s, m) => s + Number(m.total_quantity || 0), 0);
    const expiring = expiringSoon.length;
    const pendingRx = prescriptions.filter((r) => !['Dispensed', 'Completed'].includes(r.status)).length;
    const pendingRefills = refills.filter((r) => r.status === 'Requested').length;

    return { total, critical, low, optimal, out, totalUnits, expiring, pendingRx, pendingRefills };
  }, [medicines, expiringSoon, prescriptions, refills]);

  // Critical Low Stock Items for the Alert Banner
  const criticalItems = useMemo(() => {
    return medicines.filter((m) => m.total_quantity <= 5 || m.total_quantity <= m.reorder_level);
  }, [medicines]);

  // Filtered Medicines based on Search Bar and Category Dropdown
  const effectiveSearch = internalSearch.trim().toLowerCase();
  const filteredMedicines = useMemo(() => {
    return medicines.filter((m) => {
      const matchesSearch =
        !effectiveSearch ||
        m.name.toLowerCase().includes(effectiveSearch) ||
        m.sku.toLowerCase().includes(effectiveSearch) ||
        (m.generic_name && m.generic_name.toLowerCase().includes(effectiveSearch));

      // Category matching logic: handles Painkillers <-> Analgesics seamlessly
      const cat = (m.category_name || '').toLowerCase();
      const selCat = selectedCategory.toLowerCase();
      let matchesCategory = selectedCategory === 'All';
      if (!matchesCategory) {
        if (cat === selCat) {
          matchesCategory = true;
        } else if (selCat === 'painkillers' && (cat === 'analgesics' || cat.includes('pain'))) {
          matchesCategory = true;
        } else if (selCat === 'analgesics' && (cat === 'painkillers' || cat.includes('pain'))) {
          matchesCategory = true;
        } else if (selCat === 'emergency' && (cat.includes('emerg') || m.sku.includes('CRIT') || m.name.toLowerCase().includes('epinephrine'))) {
          matchesCategory = true;
        }
      }

      let matchesStock = true;
      if (stockStatusFilter === 'critical') {
        matchesStock = m.total_quantity <= 5 || m.total_quantity === 0;
      } else if (stockStatusFilter === 'low') {
        matchesStock = m.total_quantity <= m.reorder_level;
      } else if (stockStatusFilter === 'instock') {
        matchesStock = m.total_quantity > m.reorder_level;
      } else if (stockStatusFilter === 'out') {
        matchesStock = m.total_quantity === 0;
      }

      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [medicines, effectiveSearch, selectedCategory, stockStatusFilter]);

  // Toggle Batches Accordion for a Medicine
  const toggleMedBatches = (medId: number) => {
    setExpandedMedIds((prev) => ({ ...prev, [medId]: !prev[medId] }));
  };

  // Actions: Add Medicine
  const handleCreateMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/pharmacy/medicines', {
        method: 'POST',
        body: {
          sku: newMedForm.sku,
          name: newMedForm.name,
          generic_name: newMedForm.generic_name,
          category_id: newMedForm.category_id ? Number(newMedForm.category_id) : null,
          unit: newMedForm.unit,
          unit_price: Number(newMedForm.unit_price),
          reorder_level: Number(newMedForm.reorder_level),
        },
      });
      onNotify(`Medicine "${newMedForm.name}" created and added to catalogue.`, 'success');
      setIsAddMedOpen(false);
      setNewMedForm({
        sku: '',
        name: '',
        generic_name: '',
        category_id: '',
        unit: 'Tablet',
        unit_price: '2.50',
        reorder_level: '20',
      });
      loadPharmacyData();
    } catch (err: any) {
      onNotify(err.message || 'Failed to create medicine', 'error');
    }
  };

  // Actions: Receive Batch
  const handleReceiveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/pharmacy/batches', {
        method: 'POST',
        body: {
          medicine_id: Number(batchForm.medicine_id),
          batch_number: batchForm.batch_number,
          expiry_date: batchForm.expiry_date,
          quantity: Number(batchForm.quantity),
          cost_price: Number(batchForm.cost_price || 0),
        },
      });
      onNotify(`Batch "${batchForm.batch_number}" received successfully. Stock level updated.`, 'success');
      setIsReceiveBatchOpen(false);
      setBatchForm({
        medicine_id: '',
        batch_number: '',
        expiry_date: '',
        quantity: '100',
        cost_price: '1.20',
      });
      loadPharmacyData();
    } catch (err: any) {
      onNotify(err.message || 'Failed to receive stock batch', 'error');
    }
  };

  // Actions: Adjust Stock
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const delta = Number(adjustForm.quantity_delta);
      if (!delta || isNaN(delta)) {
        onNotify('Please enter a valid non-zero adjustment delta.', 'error');
        return;
      }
      await apiRequest('/api/pharmacy/adjust-stock', {
        method: 'POST',
        body: {
          medicine_id: Number(adjustForm.medicine_id),
          batch_id: adjustForm.batch_id ? Number(adjustForm.batch_id) : null,
          quantity_delta: delta,
          reason: adjustForm.reason,
          notes: adjustForm.notes,
        },
      });
      onNotify(`Stock adjusted by ${delta > 0 ? `+${delta}` : delta} units. Ledger recorded.`, 'success');
      setIsAdjustStockOpen(false);
      setAdjustForm({
        medicine_id: '',
        batch_id: '',
        quantity_delta: '',
        reason: 'Cycle Count Reconciliation',
        notes: '',
      });
      loadPharmacyData();
    } catch (err: any) {
      onNotify(err.message || 'Stock adjustment rejected', 'error');
    }
  };

  // Actions: Edit Reorder Level
  const handleSaveReorderLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMedForAction) return;
    try {
      await apiRequest(`/api/pharmacy/medicines/${selectedMedForAction.id}`, {
        method: 'PATCH',
        body: {
          reorder_level: Number(reorderEditForm.reorder_level),
          unit_price: Number(reorderEditForm.unit_price),
        },
      });
      onNotify(`Threshold for ${selectedMedForAction.name} updated to ${reorderEditForm.reorder_level}.`, 'success');
      setIsEditReorderOpen(false);
      setSelectedMedForAction(null);
      loadPharmacyData();
    } catch (err: any) {
      onNotify(err.message || 'Failed to update reorder threshold', 'error');
    }
  };

  // Actions: Dispense Prescription
  const handleDispenseRx = async (rxId: number) => {
    try {
      await apiRequest(`/api/pharmacy/prescriptions/${rxId}/dispense`, {
        method: 'POST',
        body: {},
      });
      onNotify('Prescription dispensed atomically: batch deducted & pharmacy invoice generated.', 'success');
      loadPharmacyData();
    } catch (err: any) {
      onNotify(err.message || 'Dispensing rejected', 'error');
    }
  };

  // Actions: Approve Refill
  const handleApproveRefill = async (refillId: number) => {
    try {
      await apiRequest(`/api/pharmacy/refills/${refillId}`, {
        method: 'PATCH',
        body: { status: 'Approved' },
      });
      onNotify('Prescription refill approved.', 'success');
      loadPharmacyData();
    } catch (err: any) {
      onNotify(err.message || 'Failed to approve refill', 'error');
    }
  };

  // Export Inventory CSV
  const handleExportCSV = () => {
    const headers = ['SKU', 'Medicine Name', 'Generic Name', 'Category', 'Unit', 'Unit Price ($)', 'Available Stock', 'Reorder Level', 'Stock Alert Level', 'Total Value ($)'];
    const rows = filteredMedicines.map((m) => {
      const isCritical = m.total_quantity <= 5 || m.total_quantity === 0;
      const isLow = m.total_quantity <= m.reorder_level && !isCritical;
      const statusColor = isCritical ? 'Red (Critical Low)' : isLow ? 'Amber (Low Stock)' : 'Green (Optimal)';
      const val = (m.total_quantity * m.unit_price).toFixed(2);
      return [
        `"${m.sku}"`,
        `"${m.name}"`,
        `"${m.generic_name || ''}"`,
        `"${m.category_name || 'General'}"`,
        `"${m.unit}"`,
        m.unit_price.toFixed(2),
        m.total_quantity,
        m.reorder_level,
        `"${statusColor}"`,
        val,
      ];
    });
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `CareLine_Pharmacy_Inventory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Quick Open Receive Batch for a specific medicine
  const openReceiveBatchForMed = (med: Medicine) => {
    setBatchForm({
      medicine_id: String(med.id),
      batch_number: `BCH-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`,
      expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      quantity: '100',
      cost_price: String((med.unit_price * 0.5).toFixed(2)),
    });
    setIsReceiveBatchOpen(true);
  };

  // Quick Open Adjust Stock for a specific medicine
  const openAdjustStockForMed = (med: Medicine) => {
    setSelectedMedForAction(med);
    setAdjustForm({
      medicine_id: String(med.id),
      batch_id: '',
      quantity_delta: '',
      reason: 'Physical Inventory Count',
      notes: '',
    });
    setIsAdjustStockOpen(true);
  };

  // Quick Open Edit Reorder for a specific medicine
  const openEditReorderForMed = (med: Medicine) => {
    setSelectedMedForAction(med);
    setReorderEditForm({
      reorder_level: String(med.reorder_level),
      unit_price: String(med.unit_price),
    });
    setIsEditReorderOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Real-time In-Panel Low-Stock Toast Notification Banner */}
      <AnimatePresence>
        {realtimeToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.96 }}
            className={`p-4 rounded-2xl shadow-lg border flex items-center justify-between gap-4 ${
              realtimeToast.isCritical
                ? 'bg-rose-600 text-white border-rose-700'
                : 'bg-amber-500 text-slate-900 border-amber-600'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-white/20 backdrop-blur-xs shrink-0">
                <Bell className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-sm uppercase tracking-wide">
                    {realtimeToast.isCritical ? '🔴 Red Alert: Critical Low Stock' : '🟡 Amber Alert: Low Stock Warning'}
                  </span>
                  <span className="text-[11px] opacity-80 font-mono">({realtimeToast.time})</span>
                </div>
                <p className="text-xs mt-0.5 font-medium">
                  <strong>{realtimeToast.medicineName}</strong> ({realtimeToast.sku}) has only{' '}
                  <strong>{realtimeToast.totalQuantity} {realtimeToast.unit}</strong> remaining (Reorder threshold:{' '}
                  {realtimeToast.reorderLevel}).
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => {
                  const m = medicines.find((x) => x.sku === realtimeToast.sku || x.name === realtimeToast.medicineName);
                  if (m) openReceiveBatchForMed(m);
                  setRealtimeToast(null);
                }}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs transition-colors ${
                  realtimeToast.isCritical
                    ? 'bg-white text-rose-700 hover:bg-rose-50'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                + Restock Batch
              </button>
              <button
                onClick={() => setRealtimeToast(null)}
                className="p-1 rounded-lg hover:bg-black/10 transition-colors"
                title="Dismiss Alert"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h2 className="text-2xl font-bold text-slate-900">Pharmacy & Drug Inventory</h2>
            {/* Live WebSocket Status Indicator */}
            <div
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                wsConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
              title={wsConnected ? 'Connected to live hospital WebSocket event bus' : 'Connecting to WebSocket...'}
            >
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>{wsConnected ? 'Live WS Active' : 'Connecting WS'}</span>
              {wsMessageCount > 0 && (
                <span className="text-[10px] bg-emerald-200/80 text-emerald-900 px-1.5 rounded-full font-mono">
                  {wsMessageCount}
                </span>
              )}
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time stock monitoring, FEFO batch expiry management, dispensing, and automated low-stock WebSocket alerts.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Audio Alert Toggle */}
          <button
            onClick={() => setAudioAlertsEnabled(!audioAlertsEnabled)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold border ${
              audioAlertsEnabled
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
            title="Toggle audible chime for critical low-stock alerts"
          >
            {audioAlertsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{audioAlertsEnabled ? 'Audio Alerts ON' : 'Muted'}</span>
          </button>

          {/* Refresh Data */}
          <button
            onClick={loadPharmacyData}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          {/* Add Medicine */}
          {['admin', 'pharmacist'].includes(userRole) && (
            <button
              onClick={() => setIsAddMedOpen(true)}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold border border-slate-300"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Medicine</span>
            </button>
          )}

          {/* Receive Batch */}
          {['admin', 'pharmacist'].includes(userRole) && (
            <button
              onClick={() => {
                if (medicines.length > 0) {
                  setBatchForm({
                    medicine_id: String(medicines[0].id),
                    batch_number: `BCH-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`,
                    expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                    quantity: '100',
                    cost_price: '1.20',
                  });
                }
                setIsReceiveBatchOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs"
            >
              <Box className="w-3.5 h-3.5" />
              <span>+ Receive Batch</span>
            </button>
          )}
        </div>
      </div>

      {/* Color-Coded Stock Level Legend & Stat Cards */}
      <div className="bg-slate-100/80 p-3 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2 font-semibold text-slate-700">
          <SlidersHorizontal className="w-4 h-4 text-blue-600" />
          <span>Color-Coded Stock Level Alerts:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
            <span>Green: In Stock (&gt; Reorder)</span>
          </span>
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
            <span>Amber: Low Stock Alert (&le; Reorder)</span>
          </span>
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-rose-100 text-rose-900 border border-rose-300 font-semibold text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
            <span>Red: Critical Low Alert (&le; 5 or Depleted)</span>
          </span>
        </div>
      </div>

      {/* KPI & Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          onClick={() => setStockStatusFilter('all')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            stockStatusFilter === 'all'
              ? 'bg-blue-50/70 border-blue-300 shadow-xs'
              : 'bg-white border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Formulations</span>
            <Pill className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900 font-mono">{summaryMetrics.total}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{summaryMetrics.totalUnits} total units</div>
        </div>

        <div
          onClick={() => setStockStatusFilter('critical')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            stockStatusFilter === 'critical'
              ? 'bg-rose-50 border-rose-300 shadow-xs'
              : summaryMetrics.critical > 0
              ? 'bg-rose-50/40 border-rose-200 hover:bg-rose-50/70'
              : 'bg-white border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-rose-600 font-semibold mb-1">
            <span className="flex items-center space-x-1">
              {summaryMetrics.critical > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />}
              <span>Red: Critical (&le;5)</span>
            </span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-xl font-bold text-rose-600 font-mono">{summaryMetrics.critical}</div>
          <div className="text-[10px] text-rose-500 mt-0.5">Immediate restock needed</div>
        </div>

        <div
          onClick={() => setStockStatusFilter('low')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            stockStatusFilter === 'low'
              ? 'bg-amber-50 border-amber-300 shadow-xs'
              : 'bg-white border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-amber-700 font-semibold mb-1">
            <span>Amber: Low Stock</span>
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-xl font-bold text-amber-600 font-mono">{summaryMetrics.low}</div>
          <div className="text-[10px] text-amber-600 mt-0.5">&le; Threshold limit</div>
        </div>

        <div
          onClick={() => setStockStatusFilter('instock')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            stockStatusFilter === 'instock'
              ? 'bg-emerald-50 border-emerald-300 shadow-xs'
              : 'bg-white border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-emerald-700 font-semibold mb-1">
            <span>Green: Optimal</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-600 font-mono">{summaryMetrics.optimal}</div>
          <div className="text-[10px] text-emerald-600 mt-0.5">&gt; Threshold safety</div>
        </div>

        <div
          onClick={() => setActiveTab('batches')}
          className="p-3.5 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-300 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Expiring &le;60d</span>
            <Clock className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 font-mono">{summaryMetrics.expiring}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">FEFO priority batch</div>
        </div>

        <div
          onClick={() => setActiveTab('dispense')}
          className="p-3.5 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-300 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Pending Rx</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900 font-mono">{summaryMetrics.pendingRx}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Awaiting dispense</div>
        </div>
      </div>

      {/* Real-time Critical Low Stock Alert Banner (Visible if any items are critically low) */}
      <AnimatePresence>
        {criticalItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 bg-gradient-to-r from-rose-50 via-amber-50 to-rose-50 border border-rose-300 rounded-2xl shadow-xs"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-rose-600 text-white rounded-xl shadow-xs shrink-0 mt-0.5">
                  <ShieldAlert className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="font-bold text-sm text-rose-900">
                      🔴 Real-Time Low-Stock Warnings ({criticalItems.length} {criticalItems.length === 1 ? 'item' : 'items'})
                    </h4>
                    <span className="text-[10px] font-bold uppercase bg-rose-200 text-rose-800 px-2 py-0.5 rounded-full">
                      WebSocket Live Push Active
                    </span>
                  </div>
                  <p className="text-xs text-rose-700 mt-0.5">
                    The following medication items are depleted or below critical safety threshold. Dispensing will fail or disrupt clinical care.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {criticalItems.slice(0, 5).map((med) => {
                      const isCrit = med.total_quantity <= 5 || med.total_quantity === 0;
                      return (
                        <span
                          key={med.id}
                          onClick={() => openReceiveBatchForMed(med)}
                          className={`inline-flex items-center space-x-1.5 px-2.5 py-1 border rounded-lg text-xs font-semibold shadow-2xs hover:bg-white cursor-pointer transition-colors ${
                            isCrit
                              ? 'bg-rose-100 text-rose-900 border-rose-300'
                              : 'bg-amber-100 text-amber-900 border-amber-300'
                          }`}
                          title="Click to receive restock batch"
                        >
                          <span className={`w-2 h-2 rounded-full ${isCrit ? 'bg-rose-600 animate-pulse' : 'bg-amber-600'}`} />
                          <span>{med.name}</span>
                          <strong className="font-mono">{med.total_quantity} {med.unit}</strong>
                          <span className="text-slate-400 text-[10px]">(&le;{med.reorder_level})</span>
                        </span>
                      );
                    })}
                    {criticalItems.length > 5 && (
                      <span className="text-xs font-semibold text-rose-700 self-center">
                        +{criticalItems.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={() => setStockStatusFilter('critical')}
                  className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 font-semibold text-xs rounded-xl transition-colors"
                >
                  Filter Red Alerts
                </button>
                {criticalItems[0] && (
                  <button
                    onClick={() => openReceiveBatchForMed(criticalItems[0])}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
                  >
                    + Restock Batch
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation Sub-Tabs */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center space-x-1 overflow-x-auto">
        {[
          { id: 'inventory', label: `Stock Formulations (${summaryMetrics.total})`, icon: Pill },
          { id: 'batches', label: `Batches & FEFO Expiry (${batches.length})`, icon: Layers },
          { id: 'dispense', label: `Dispense Queue (${summaryMetrics.pendingRx})`, icon: CheckCircle2 },
          { id: 'refills', label: `Refills (${summaryMetrics.pendingRefills})`, icon: RefreshCw },
          { id: 'movements', label: `Movement Ledger (${movements.length})`, icon: History },
          { id: 'diagnostics', label: 'Lab, Radiology & Blood Bank', icon: FlaskConical },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: INVENTORY & STOCK FORMULATIONS */}
      {activeTab === 'inventory' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Search Bar & Category Filter Dropdown Toolbar */}
          <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by medication name, generic name, or SKU..."
                  value={internalSearch}
                  onChange={(e) => setInternalSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                />
                {internalSearch && (
                  <button
                    onClick={() => setInternalSearch('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filter Dropdown by Category (includes 'Antibiotics', 'Painkillers', 'Emergency', etc.) */}
              <div className="flex items-center space-x-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="All">All Categories ({medicines.length})</option>
                  {allCategoryNames.map((catName) => {
                    const count = medicines.filter((m) => {
                      const c = (m.category_name || '').toLowerCase();
                      const target = catName.toLowerCase();
                      if (c === target) return true;
                      if (target === 'painkillers' && (c === 'analgesics' || c.includes('pain'))) return true;
                      if (target === 'analgesics' && (c === 'painkillers' || c.includes('pain'))) return true;
                      if (target === 'emergency' && (c.includes('emerg') || m.sku.includes('CRIT') || m.name.toLowerCase().includes('epinephrine'))) return true;
                      return false;
                    }).length;
                    return (
                      <option key={catName} value={catName}>
                        {catName} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Quick Status Filter Pills */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0">
              {[
                { id: 'all', label: `All (${medicines.length})` },
                { id: 'critical', label: `🔴 Red (${summaryMetrics.critical})` },
                { id: 'low', label: `🟡 Amber (${summaryMetrics.low})` },
                { id: 'instock', label: `🟢 Green (${summaryMetrics.optimal})` },
                { id: 'out', label: `Out of Stock (${summaryMetrics.out})` },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setStockStatusFilter(pill.id as any)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    stockStatusFilter === pill.id
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Active Filter Badges */}
          {(effectiveSearch || selectedCategory !== 'All' || stockStatusFilter !== 'all') && (
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <span className="text-slate-500">Active Filters:</span>
                {effectiveSearch && (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-medium text-[11px]">
                    <span>Search: "{effectiveSearch}"</span>
                    <button onClick={() => setInternalSearch('')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {selectedCategory !== 'All' && (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-medium text-[11px]">
                    <span>Category: {selectedCategory}</span>
                    <button onClick={() => setSelectedCategory('All')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {stockStatusFilter !== 'all' && (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-medium text-[11px]">
                    <span>Status: {stockStatusFilter}</span>
                    <button onClick={() => setStockStatusFilter('all')}><X className="w-3 h-3" /></button>
                  </span>
                )}
              </div>
              <span className="font-semibold text-slate-700">
                Showing {filteredMedicines.length} of {medicines.length} items
              </span>
            </div>
          )}

          {/* Medications Table with Color-Coded Alerts (Green / Amber / Red) */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs uppercase">
                  <th className="p-3.5 w-10 text-center"></th>
                  <th className="p-3.5">SKU / Code</th>
                  <th className="p-3.5">Medication & Generic</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5 text-right">Unit Price</th>
                  <th className="p-3.5 text-center">Stock Level vs Threshold</th>
                  <th className="p-3.5 text-center">Color-Coded Alert</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMedicines.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-400">
                      <Pill className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="font-semibold text-slate-600">No medications found matching your criteria</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Try adjusting your search query, selecting another category, or clearing the status filter.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredMedicines.map((med) => {
                    const isExpanded = !!expandedMedIds[med.id];
                    const medBatches = batches.filter((b) => b.medicine_id === med.id);
                    const isRecentlyUpdated = !!recentlyUpdatedMedIds[med.id];

                    const isOut = med.total_quantity === 0;
                    const isCritical = (med.total_quantity <= 5 && !isOut) || isOut; // RED
                    const isLow = med.total_quantity <= med.reorder_level && !isCritical; // AMBER
                    const isOptimal = med.total_quantity > med.reorder_level; // GREEN
                    const percent = Math.min(100, Math.round((med.total_quantity / Math.max(med.reorder_level * 2, 1)) * 100));

                    return (
                      <React.Fragment key={med.id}>
                        <tr
                          className={`transition-all duration-300 ${
                            isRecentlyUpdated
                              ? 'bg-blue-100/80 ring-2 ring-blue-500'
                              : isExpanded
                              ? 'bg-blue-50/30'
                              : isOut
                              ? 'bg-rose-50/30 hover:bg-rose-50/50'
                              : isCritical
                              ? 'bg-rose-50/20 hover:bg-rose-50/40'
                              : isLow
                              ? 'bg-amber-50/20 hover:bg-amber-50/40'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="p-3.5 text-center">
                            <button
                              onClick={() => toggleMedBatches(med.id)}
                              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200"
                              title={isExpanded ? 'Hide Batches' : 'View Batches'}
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          </td>

                          <td className="p-3.5 font-mono text-xs font-semibold text-blue-600">
                            {med.sku}
                          </td>

                          <td className="p-3.5">
                            <div className="font-semibold text-slate-900 text-xs flex items-center space-x-1.5">
                              <span>{med.name}</span>
                              {isRecentlyUpdated && (
                                <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-blue-600 text-white animate-pulse">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  <span>LIVE WS</span>
                                </span>
                              )}
                            </div>
                            {med.generic_name && (
                              <div className="text-[11px] text-slate-500 italic">{med.generic_name}</div>
                            )}
                          </td>

                          <td className="p-3.5 text-xs text-slate-600">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium">
                              {med.category_name || 'General'}
                            </span>
                          </td>

                          <td className="p-3.5 text-xs text-right font-mono font-medium text-slate-800">
                            ${Number(med.unit_price).toFixed(2)}
                            <span className="text-[10px] text-slate-400 block">per {med.unit}</span>
                          </td>

                          {/* Stock Level with Visual Progress Bar */}
                          <td className="p-3.5 text-xs min-w-[170px]">
                            <div className="flex items-center justify-between font-semibold mb-1">
                              <span
                                className={`font-mono text-xs font-bold ${
                                  isCritical ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-emerald-700'
                                }`}
                              >
                                {med.total_quantity} {med.unit}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">
                                Reorder: {med.reorder_level}
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  isCritical
                                    ? 'bg-rose-500'
                                    : isLow
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.max(percent, 4)}%` }}
                              />
                            </div>
                          </td>

                          {/* Color-Coded Alert Badges (Green / Amber / Red) */}
                          <td className="p-3.5 text-center">
                            {isOut ? (
                              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs">
                                <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
                                <span>Red: Out of Stock</span>
                              </span>
                            ) : isCritical ? (
                              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs">
                                <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                                <span>Red: Critical Low (&le;5)</span>
                              </span>
                            ) : isLow ? (
                              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                                <span className="w-2 h-2 rounded-full bg-amber-600" />
                                <span>Amber: Low Stock</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                                <span>Green: In Stock</span>
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              <button
                                onClick={() => openReceiveBatchForMed(med)}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors"
                                title="Receive stock batch"
                              >
                                + Batch
                              </button>
                              <button
                                onClick={() => openAdjustStockForMed(med)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                                title="Adjust inventory count"
                              >
                                Adjust
                              </button>
                              <button
                                onClick={() => openEditReorderForMed(med)}
                                className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
                                title="Edit reorder threshold & price"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Collapsible Batch Drawer */}
                        {isExpanded && (
                          <tr className="bg-slate-50/70 border-b border-slate-200">
                            <td colSpan={8} className="p-4 pl-12">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <h5 className="font-bold text-xs text-slate-700 flex items-center space-x-1.5">
                                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                                    <span>FEFO Batches for {med.name} ({medBatches.length} {medBatches.length === 1 ? 'batch' : 'batches'})</span>
                                  </h5>
                                  <button
                                    onClick={() => openReceiveBatchForMed(med)}
                                    className="text-xs font-semibold text-blue-600 hover:underline"
                                  >
                                    + Add New Batch
                                  </button>
                                </div>

                                {medBatches.length === 0 ? (
                                  <p className="text-xs text-slate-400 italic">No batches recorded for this medicine.</p>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                    {medBatches.map((b) => {
                                      const isExpiring = new Date(b.expiry_date).getTime() - Date.now() <= 60 * 24 * 60 * 60 * 1000;
                                      const isPast = new Date(b.expiry_date).getTime() < Date.now();
                                      return (
                                        <div
                                          key={b.id}
                                          className={`p-3 rounded-xl border text-xs space-y-1 ${
                                            isPast
                                              ? 'bg-rose-50/60 border-rose-200'
                                              : isExpiring
                                              ? 'bg-amber-50/60 border-amber-200'
                                              : 'bg-white border-slate-200'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between font-mono font-semibold">
                                            <span className="text-slate-900">{b.batch_number}</span>
                                            <span className={isPast ? 'text-rose-700' : isExpiring ? 'text-amber-700' : 'text-slate-600'}>
                                              {b.quantity_available} / {b.quantity_received} {med.unit}
                                            </span>
                                          </div>
                                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                                            <span>Expires: {b.expiry_date}</span>
                                            <span className="font-medium text-slate-700">Cost: ${b.cost_price}</span>
                                          </div>
                                          {isPast && (
                                            <div className="text-[10px] font-bold text-rose-700 uppercase">Expired — Do not dispense</div>
                                          )}
                                          {isExpiring && !isPast && (
                                            <div className="text-[10px] font-semibold text-amber-700">Expiring soon (&le;60 days)</div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: BATCHES & FEFO EXPIRY TRACKER */}
      {activeTab === 'batches' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base">FEFO Batch Management (First-Expired, First-Out)</h3>
              <p className="text-xs text-slate-500">
                Sorted chronologically by expiry date. Dispensing system automatically drains earliest unexpired batches first.
              </p>
            </div>
            <button
              onClick={() => setIsReceiveBatchOpen(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold"
            >
              + Receive New Batch
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs uppercase">
                  <th className="p-3.5">Batch Number</th>
                  <th className="p-3.5">Medication</th>
                  <th className="p-3.5">Expiry Date</th>
                  <th className="p-3.5 text-right">Available / Received</th>
                  <th className="p-3.5 text-right">Unit Cost</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((b) => {
                  const expiryTimestamp = new Date(b.expiry_date).getTime();
                  const isPast = expiryTimestamp < Date.now();
                  const isExpiring = !isPast && expiryTimestamp - Date.now() <= 60 * 24 * 60 * 60 * 1000;

                  return (
                    <tr key={b.id} className={isPast ? 'bg-rose-50/30' : isExpiring ? 'bg-amber-50/30' : 'hover:bg-slate-50'}>
                      <td className="p-3.5 font-mono text-xs font-semibold text-slate-900">{b.batch_number}</td>
                      <td className="p-3.5 text-xs">
                        <div className="font-semibold text-slate-900">{b.medicine_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{b.sku}</div>
                      </td>
                      <td className="p-3.5 text-xs font-mono text-slate-700">{b.expiry_date}</td>
                      <td className="p-3.5 text-xs font-mono text-right text-slate-900">
                        <strong>{b.quantity_available}</strong> / {b.quantity_received} {b.unit || ''}
                      </td>
                      <td className="p-3.5 text-xs font-mono text-right text-slate-700">${b.cost_price}</td>
                      <td className="p-3.5 text-center">
                        {isPast ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            Expired
                          </span>
                        ) : isExpiring ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            Expiring &le;60d
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => {
                            const med = medicines.find((m) => m.id === b.medicine_id);
                            if (med) openAdjustStockForMed(med);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                        >
                          Adjust
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DISPENSE QUEUE */}
      {activeTab === 'dispense' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-base">Prescription Dispensing Queue</h3>
            <p className="text-xs text-slate-500">
              Clinical prescriptions issued by attending doctors. Dispensing atomically deducts batch stock and creates the pharmacy invoice.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs uppercase">
                  <th className="p-3.5">Rx Reference</th>
                  <th className="p-3.5">Patient</th>
                  <th className="p-3.5">Prescriber</th>
                  <th className="p-3.5">Prescribed Items</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {prescriptions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400">
                      No prescriptions found in queue.
                    </td>
                  </tr>
                ) : (
                  prescriptions.map((rx) => {
                    const isDispensed = ['Dispensed', 'Completed'].includes(rx.status);
                    return (
                      <tr key={rx.id} className="hover:bg-slate-50">
                        <td className="p-3.5 font-mono text-xs font-semibold text-blue-600">{rx.prescription_ref}</td>
                        <td className="p-3.5 text-xs">
                          <div className="font-semibold text-slate-900">{rx.patient_name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{rx.patient_code}</div>
                        </td>
                        <td className="p-3.5 text-xs text-slate-700">{rx.doctor_name}</td>
                        <td className="p-3.5 text-xs text-slate-700">
                          <div className="space-y-1">
                            {rx.items.map((i) => (
                              <div key={i.id} className="flex items-center space-x-1.5">
                                <span className="font-semibold text-slate-800">{i.medicine_name}</span>
                                <span className="text-slate-500">({i.dosage}, {i.frequency}) &times; {i.quantity}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-3.5 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              isDispensed ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {rx.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          {!isDispensed && ['admin', 'pharmacist'].includes(userRole) ? (
                            <button
                              onClick={() => handleDispenseRx(rx.id)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                            >
                              Dispense & Bill
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Completed</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: REFILLS */}
      {activeTab === 'refills' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-base">Patient Prescription Refill Requests</h3>
            <p className="text-xs text-slate-500">
              Refill requests initiated by patients via patient portal. Pharmacists review and approve or reject.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {refills.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">No pending refill requests.</div>
            ) : (
              refills.map((rf) => (
                <div key={rf.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-blue-600">{rf.prescription_ref}</span>
                      <span className="text-xs font-semibold text-slate-900">&middot; {rf.patient_name}</span>
                    </div>
                    <div className="text-xs text-slate-500">{rf.notes || 'Routine maintenance refill'} &middot; {rf.created_at}</div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        rf.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {rf.status}
                    </span>
                    {rf.status === 'Requested' && ['admin', 'pharmacist'].includes(userRole) && (
                      <button
                        onClick={() => handleApproveRefill(rf.id)}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
                      >
                        Approve Refill
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: MOVEMENTS LEDGER */}
      {activeTab === 'movements' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-base">Stock Movement Audit Trail</h3>
            <p className="text-xs text-slate-500">
              Complete chronological audit ledger of stock additions, prescription deductions, and adjustments.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs uppercase">
                  <th className="p-3.5">ID</th>
                  <th className="p-3.5">Medication</th>
                  <th className="p-3.5">Movement Type</th>
                  <th className="p-3.5 text-right">Quantity Delta</th>
                  <th className="p-3.5">Batch</th>
                  <th className="p-3.5">Staff / Actor</th>
                  <th className="p-3.5">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400">
                      No stock movements recorded yet.
                    </td>
                  </tr>
                ) : (
                  movements.map((mov) => {
                    const isPositive = mov.quantity_delta > 0;
                    return (
                      <tr key={mov.id} className="hover:bg-slate-50">
                        <td className="p-3.5 font-mono text-xs text-slate-500">#{mov.id}</td>
                        <td className="p-3.5 text-xs">
                          <div className="font-semibold text-slate-900">{mov.medicine_name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{mov.sku}</div>
                        </td>
                        <td className="p-3.5 text-xs font-medium text-slate-700">{mov.movement_type}</td>
                        <td className="p-3.5 text-xs text-right font-mono font-bold">
                          <span
                            className={`inline-flex items-center space-x-1 ${
                              isPositive ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                            <span>{isPositive ? `+${mov.quantity_delta}` : mov.quantity_delta} {mov.unit}</span>
                          </span>
                        </td>
                        <td className="p-3.5 text-xs font-mono text-slate-600">{mov.batch_number || '—'}</td>
                        <td className="p-3.5 text-xs text-slate-700">{mov.actor_name || 'System'}</td>
                        <td className="p-3.5 text-xs font-mono text-slate-500">{mov.created_at}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: DIAGNOSTICS (LAB, RADIOLOGY, BLOOD BANK) */}
      {activeTab === 'diagnostics' && (
        <ClinicalDiagnosticsPanel
          initialSection="lab"
          searchQuery={searchQuery}
          userRole={userRole}
          onNotify={onNotify}
          refreshSignal={refreshSignal}
        />
      )}

      {/* MODAL: ADD MEDICINE */}
      {isAddMedOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Add Medication to Formulary</h3>
                <p className="text-xs text-slate-500">Register a new drug into the hospital catalogue</p>
              </div>
              <button onClick={() => setIsAddMedOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMedicine} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">SKU / Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MED-045"
                    value={newMedForm.sku}
                    onChange={(e) => setNewMedForm({ ...newMedForm, sku: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
                  <select
                    value={newMedForm.category_id}
                    onChange={(e) => setNewMedForm({ ...newMedForm, category_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  >
                    <option value="">General</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Brand / Medication Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amoxicillin 500mg"
                  value={newMedForm.name}
                  onChange={(e) => setNewMedForm({ ...newMedForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Generic Name</label>
                <input
                  type="text"
                  placeholder="e.g. Amoxicillin Trihydrate"
                  value={newMedForm.generic_name}
                  onChange={(e) => setNewMedForm({ ...newMedForm, generic_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Unit</label>
                  <select
                    value={newMedForm.unit}
                    onChange={(e) => setNewMedForm({ ...newMedForm, unit: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  >
                    <option value="Tablet">Tablet</option>
                    <option value="Capsule">Capsule</option>
                    <option value="Syrup">Syrup</option>
                    <option value="Vial">Vial</option>
                    <option value="Ampoule">Ampoule</option>
                    <option value="Ointment">Ointment</option>
                    <option value="Drop">Drop</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Unit Price ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    required
                    value={newMedForm.unit_price}
                    onChange={(e) => setNewMedForm({ ...newMedForm, unit_price: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Reorder Level *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newMedForm.reorder_level}
                    onChange={(e) => setNewMedForm({ ...newMedForm, reorder_level: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddMedOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs"
                >
                  Save Formulation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RECEIVE STOCK BATCH */}
      {isReceiveBatchOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Receive Medication Batch</h3>
                <p className="text-xs text-slate-500">Inbound batch intake with FEFO expiry tracking</p>
              </div>
              <button onClick={() => setIsReceiveBatchOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReceiveBatch} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Select Medication *</label>
                <select
                  required
                  value={batchForm.medicine_id}
                  onChange={(e) => setBatchForm({ ...batchForm, medicine_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                >
                  <option value="" disabled>Select medication formulation...</option>
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.sku}) — Available: {m.total_quantity} {m.unit}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-600">Batch Number *</label>
                    <button
                      type="button"
                      onClick={() =>
                        setBatchForm({
                          ...batchForm,
                          batch_number: `BCH-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`,
                        })
                      }
                      className="text-[10px] text-blue-600 hover:underline"
                    >
                      Generate
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="BCH-202611-1234"
                    value={batchForm.batch_number}
                    onChange={(e) => setBatchForm({ ...batchForm, batch_number: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    required
                    value={batchForm.expiry_date}
                    onChange={(e) => setBatchForm({ ...batchForm, expiry_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Quantity Received *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={batchForm.quantity}
                    onChange={(e) => setBatchForm({ ...batchForm, quantity: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Unit Cost Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={batchForm.cost_price}
                    onChange={(e) => setBatchForm({ ...batchForm, cost_price: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsReceiveBatchOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs"
                >
                  Receive Inventory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADJUST STOCK */}
      {isAdjustStockOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Inventory Stock Adjustment</h3>
                <p className="text-xs text-slate-500">Record cycle-count reconciliation, damaged or written-off units</p>
              </div>
              <button onClick={() => setIsAdjustStockOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdjustStock} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Medication *</label>
                <select
                  required
                  value={adjustForm.medicine_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    setAdjustForm({ ...adjustForm, medicine_id: id, batch_id: '' });
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                >
                  <option value="" disabled>Select medication...</option>
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.sku}) — Available: {m.total_quantity} {m.unit}
                    </option>
                  ))}
                </select>
              </div>

              {adjustForm.medicine_id && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Target Batch (Optional)</label>
                  <select
                    value={adjustForm.batch_id}
                    onChange={(e) => setAdjustForm({ ...adjustForm, batch_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold font-mono"
                  >
                    <option value="">General Adjustment (No specific batch)</option>
                    {batches
                      .filter((b) => b.medicine_id === Number(adjustForm.medicine_id))
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.batch_number} (Exp: {b.expiry_date}, Avail: {b.quantity_available})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Quantity Delta (+ / -) *
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. +10 or -5"
                    value={adjustForm.quantity_delta}
                    onChange={(e) => setAdjustForm({ ...adjustForm, quantity_delta: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Use minus (-) for write-off</span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Adjustment Reason *</label>
                  <select
                    value={adjustForm.reason}
                    onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  >
                    <option value="Physical Inventory Count">Physical Inventory Count</option>
                    <option value="Cycle Count Reconciliation">Cycle Count Reconciliation</option>
                    <option value="Damaged Goods Write-off">Damaged Goods Write-off</option>
                    <option value="Expired Stock Disposal">Expired Stock Disposal</option>
                    <option value="Vendor Return">Vendor Return</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Justification / Audit Note</label>
                <textarea
                  rows={2}
                  placeholder="Required audit trail documentation for inventory change..."
                  value={adjustForm.notes}
                  onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAdjustStockOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs"
                >
                  Apply Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT REORDER LEVEL & PRICE */}
      {isEditReorderOpen && selectedMedForAction && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Edit Safety Threshold</h3>
                <p className="text-xs text-blue-600 font-semibold">{selectedMedForAction.name} ({selectedMedForAction.sku})</p>
              </div>
              <button onClick={() => setIsEditReorderOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReorderLevel} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Reorder Level ({selectedMedForAction.unit})
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={reorderEditForm.reorder_level}
                  onChange={(e) => setReorderEditForm({ ...reorderEditForm, reorder_level: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  When available stock drops below this number, a live WebSocket alert is pushed to dispensary staff.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Unit Selling Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  required
                  value={reorderEditForm.unit_price}
                  onChange={(e) => setReorderEditForm({ ...reorderEditForm, unit_price: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                />
              </div>

              <div className="flex space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsEditReorderOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
