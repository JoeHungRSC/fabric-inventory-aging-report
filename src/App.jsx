import React, { useState, useMemo, useEffect } from 'react';

// Currency & number formatting helpers
const formatCurrency = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(val);
};

const formatNumber = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(val);
};

// Aging badge styling meeting WCAG AA contrast (>= 4.5:1)
const getAgingBadgeClass = (bucket) => {
  switch (bucket) {
    case '0-3 months':
      return 'bg-emerald-50 text-emerald-800 border-emerald-300';
    case '3-6 months':
      return 'bg-sky-50 text-sky-800 border-sky-300';
    case '6-12 months':
      return 'bg-amber-50 text-amber-900 border-amber-300';
    case '12-24 months':
      return 'bg-orange-50 text-orange-900 border-orange-300';
    case '+24 months':
      return 'bg-red-50 text-red-900 border-red-300';
    default:
      return 'bg-slate-100 text-slate-800 border-slate-300';
  }
};

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Tab & Filters
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'active_covers' | 'projection' | 'explorer'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('ALL');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedAging, setSelectedAging] = useState('ALL');
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');

  // Pagination & Sorting (Explorer Table)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState('total_after_tax');
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' | 'desc'

  // Pagination & Sorting (Projection Table)
  const [projSortField, setProjSortField] = useState('on_hand');
  const [projSortOrder, setProjSortOrder] = useState('desc');
  const [projCurrentPage, setProjCurrentPage] = useState(1);
  const [projPageSize, setProjPageSize] = useState(50);

  // Pagination & Sorting (Active Covers Table)
  const [activeSortField, setActiveSortField] = useState('total_cost');
  const [activeSortOrder, setActiveSortOrder] = useState('desc');
  const [activeCurrentPage, setActiveCurrentPage] = useState(1);
  const [activePageSize, setActivePageSize] = useState(25);
  const [activeStatusFilter, setActiveStatusFilter] = useState('ALL'); // 'ALL' | 'Low Buffer' | 'Balanced' | 'High Buffer'
  const [inspectedActiveCover, setInspectedActiveCover] = useState(null);

  // Modal inspection
  const [inspectedBatch, setInspectedBatch] = useState(null);

  // Data fetching with resilient states (Antislop R-27)
  const fetchData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('./inventory_data.json');
      if (!res.ok) throw new Error(`HTTP error ${res.status}: Failed to load inventory data`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setLoadError(err.message || 'Unknown network error loading report data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Keyboard accessibility: Escape closes modal (Antislop R-32)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setInspectedBatch(null);
        setInspectedActiveCover(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filtered records
  const filteredRecords = useMemo(() => {
    if (!data?.records) return [];
    return data.records.filter((r) => {
      if (selectedCustomer !== 'ALL' && r.customer !== selectedCustomer) return false;
      if (selectedGroup !== 'ALL' && r.product_group !== selectedGroup) return false;
      if (selectedAging !== 'ALL' && r.aging_bucket !== selectedAging) return false;
      if (selectedWarehouse !== 'ALL' && r.warehouse !== selectedWarehouse) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchItem = r.item.toLowerCase().includes(q);
        const matchBatch = r.batch.toLowerCase().includes(q);
        const matchDesc = r.description.toLowerCase().includes(q);
        const matchPo = r.po.toLowerCase().includes(q);
        const matchSupplier = r.supplier.toLowerCase().includes(q);
        if (!matchItem && !matchBatch && !matchDesc && !matchPo && !matchSupplier) return false;
      }
      return true;
    });
  }, [data, selectedCustomer, selectedGroup, selectedAging, selectedWarehouse, searchQuery]);

  // Dynamic KPIs calculated over active filtered scope
  const kpis = useMemo(() => {
    let totalQty = 0;
    let totalCost = 0;
    let totalDuty = 0;
    let totalVat = 0;
    let totalTax = 0;
    let agedCostOver180 = 0;
    let agedTaxOver180 = 0;

    for (const r of filteredRecords) {
      totalQty += r.qty;
      totalCost += r.total_cost;
      totalDuty += r.import_duty;
      totalVat += r.vat;
      totalTax += r.total_after_tax;
      if (r.aging_days >= 180) {
        agedCostOver180 += r.total_cost;
        agedTaxOver180 += r.total_after_tax;
      }
    }

    const agedCostPct = totalCost > 0 ? (agedCostOver180 / totalCost) * 100 : 0;

    return {
      totalQty,
      totalCost,
      totalDuty,
      totalVat,
      totalTax,
      agedCostOver180,
      agedTaxOver180,
      agedCostPct,
      count: filteredRecords.length,
    };
  }, [filteredRecords]);

  // Sorted records
  const sortedRecords = useMemo(() => {
    const list = [...filteredRecords];
    list.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (typeof aVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      aVal = aVal || 0;
      bVal = bVal || 0;
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return list;
  }, [filteredRecords, sortField, sortOrder]);

  // Paginated records
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRecords.slice(start, start + pageSize);
  }, [sortedRecords, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedRecords.length / pageSize) || 1;

  // Filtered projections
  const filteredProjections = useMemo(() => {
    if (!data?.projections) return [];
    return data.projections.filter((p) => {
      if (selectedCustomer !== 'ALL' && p.customer !== selectedCustomer) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchItem = p.item.toLowerCase().includes(q);
        const matchDesc = p.description.toLowerCase().includes(q);
        const matchSupplier = (p.supplier || '').toLowerCase().includes(q);
        if (!matchItem && !matchDesc && !matchSupplier) return false;
      }
      return true;
    });
  }, [data, selectedCustomer, searchQuery]);

  // Sorted projections
  const sortedProjections = useMemo(() => {
    const list = [...filteredProjections];
    list.sort((a, b) => {
      let aVal = a[projSortField];
      let bVal = b[projSortField];

      if (projSortField === 'aws') {
        const aNum = typeof aVal === 'number' ? aVal : -1;
        const bNum = typeof bVal === 'number' ? bVal : -1;
        return projSortOrder === 'asc' ? aNum - bNum : bNum - aNum;
      }

      if (typeof aVal === 'string') {
        return projSortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      aVal = aVal || 0;
      bVal = bVal || 0;
      return projSortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return list;
  }, [filteredProjections, projSortField, projSortOrder]);

  // Paginated projections
  const paginatedProjections = useMemo(() => {
    if (projPageSize === -1) return sortedProjections;
    const start = (projCurrentPage - 1) * projPageSize;
    return sortedProjections.slice(start, start + projPageSize);
  }, [sortedProjections, projCurrentPage, projPageSize]);

  const totalProjPages = projPageSize === -1 ? 1 : (Math.ceil(sortedProjections.length / projPageSize) || 1);

  // Filtered Active Covers
  const filteredActiveCovers = useMemo(() => {
    if (!data?.active_covers) return [];
    return data.active_covers.filter((c) => {
      if (selectedCustomer !== 'ALL' && c.customer !== selectedCustomer) return false;
      if (selectedGroup !== 'ALL' && c.product_group !== selectedGroup) return false;
      if (activeStatusFilter !== 'ALL' && c.status !== activeStatusFilter) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchItem = c.item.toLowerCase().includes(q);
        const matchDesc = c.description.toLowerCase().includes(q);
        const matchCust = c.customer.toLowerCase().includes(q);
        const matchSupp = (c.supplier || '').toLowerCase().includes(q);
        if (!matchItem && !matchDesc && !matchCust && !matchSupp) return false;
      }
      return true;
    });
  }, [data, selectedCustomer, selectedGroup, activeStatusFilter, searchQuery]);

  // Sorted Active Covers
  const sortedActiveCovers = useMemo(() => {
    const list = [...filteredActiveCovers];
    list.sort((a, b) => {
      let aVal = a[activeSortField];
      let bVal = b[activeSortField];
      if (activeSortField === 'weeks_of_supply') {
        const aNum = typeof aVal === 'number' ? aVal : 999999;
        const bNum = typeof bVal === 'number' ? bVal : 999999;
        return activeSortOrder === 'asc' ? aNum - bNum : bNum - aNum;
      }
      if (typeof aVal === 'string') {
        return activeSortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      aVal = aVal || 0;
      bVal = bVal || 0;
      return activeSortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return list;
  }, [filteredActiveCovers, activeSortField, activeSortOrder]);

  // Paginated Active Covers
  const paginatedActiveCovers = useMemo(() => {
    if (activePageSize === -1) return sortedActiveCovers;
    const start = (activeCurrentPage - 1) * activePageSize;
    return sortedActiveCovers.slice(start, start + activePageSize);
  }, [sortedActiveCovers, activeCurrentPage, activePageSize]);

  const totalActivePages = activePageSize === -1 ? 1 : (Math.ceil(sortedActiveCovers.length / activePageSize) || 1);

  // Active Covers KPIs
  const activeKPIs = useMemo(() => {
    const totalItems = filteredActiveCovers.length;
    const totalCost = filteredActiveCovers.reduce((sum, c) => sum + c.total_cost, 0);
    const totalTax = filteredActiveCovers.reduce((sum, c) => sum + c.total_after_tax, 0);
    const totalOrders2026 = filteredActiveCovers.reduce((sum, c) => sum + c.order_units_2026, 0);
    const lowBufferCount = filteredActiveCovers.filter((c) => c.status === 'Low Buffer').length;
    const balancedCount = filteredActiveCovers.filter((c) => c.status === 'Balanced').length;
    const highBufferCount = filteredActiveCovers.filter((c) => c.status === 'High Buffer').length;
    return {
      totalItems,
      totalCost,
      totalTax,
      totalOrders2026,
      lowBufferCount,
      balancedCount,
      highBufferCount,
    };
  }, [filteredActiveCovers]);

  // Sorting handler (Active Covers Table)
  const handleActiveSort = (field) => {
    if (activeSortField === field) {
      setActiveSortOrder(activeSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setActiveSortField(field);
      const isStringField = ['item', 'customer', 'supplier', 'product_group', 'uom', 'status'].includes(field);
      setActiveSortOrder(isStringField ? 'asc' : 'desc');
    }
    setActiveCurrentPage(1);
  };

  // Dynamic Aging Bracket Data
  const agingTierData = useMemo(() => {
    const tiers = ['0-3 months', '3-6 months', '6-12 months', '12-24 months', '+24 months'];
    return tiers.map((tier) => {
      const records = filteredRecords.filter((r) => r.aging_bucket === tier);
      const qty = records.reduce((s, r) => s + r.qty, 0);
      const cost = records.reduce((s, r) => s + r.total_cost, 0);
      const duty = records.reduce((s, r) => s + r.import_duty, 0);
      const vat = records.reduce((s, r) => s + r.vat, 0);
      const tax = records.reduce((s, r) => s + r.total_after_tax, 0);
      const qtyPct = kpis.totalQty > 0 ? (qty / kpis.totalQty) * 100 : 0;
      const costPct = kpis.totalCost > 0 ? (cost / kpis.totalCost) * 100 : 0;
      return {
        tier,
        count: records.length,
        qty,
        cost,
        duty,
        vat,
        tax,
        qtyPct,
        costPct,
      };
    });
  }, [filteredRecords, kpis.totalQty, kpis.totalCost]);

  // Dynamic Customer Risk Exposure
  const customerRiskData = useMemo(() => {
    const map = {};
    for (const r of filteredRecords) {
      if (!map[r.customer]) {
        map[r.customer] = {
          customer: r.customer,
          count: 0,
          totalQty: 0,
          totalCost: 0,
          totalTax: 0,
          agedTaxOver180: 0,
        };
      }
      map[r.customer].count += 1;
      map[r.customer].totalQty += r.qty;
      map[r.customer].totalCost += r.total_cost;
      map[r.customer].totalTax += r.total_after_tax;
      if (r.aging_days >= 180) {
        map[r.customer].agedTaxOver180 += r.total_after_tax;
      }
    }
    return Object.values(map).sort((a, b) => b.totalTax - a.totalTax);
  }, [filteredRecords]);

  // Sorting handler (Explorer Table)
  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  // Sorting handler (Projection Table)
  const handleProjSort = (field) => {
    if (projSortField === field) {
      setProjSortOrder(projSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setProjSortField(field);
      const isStringField = ['item', 'customer', 'supplier', 'uom', 'status'].includes(field);
      setProjSortOrder(isStringField ? 'asc' : 'desc');
    }
    setProjCurrentPage(1);
  };

  // Reset filters
  const resetFilters = () => {
    setSelectedCustomer('ALL');
    setSelectedGroup('ALL');
    setSelectedAging('ALL');
    setSelectedWarehouse('ALL');
    setActiveStatusFilter('ALL');
    setSearchQuery('');
    setCurrentPage(1);
    setProjCurrentPage(1);
    setActiveCurrentPage(1);
  };

  // Export filtered view to CSV
  const exportToCSV = () => {
    const headers = [
      'Batch Number',
      'Item Number',
      'Customer',
      'Material Group',
      'Warehouse',
      'Location',
      'Physical Inventory',
      'UOM',
      'Standard Cost (USD)',
      'Total Cost (USD)',
      'Import Duty (12% USD)',
      'VAT (8% USD)',
      'Total After Tax (USD)',
      'Aging Days',
      'Aging Period',
      'PO Number',
      'Supplier Code',
      'Receive Date',
      'Manufacturing Date',
      'Description',
    ];

    const rows = sortedRecords.map((r) => [
      `"${r.batch}"`,
      `"${r.item}"`,
      `"${r.customer}"`,
      `"${r.product_group}"`,
      `"${r.warehouse}"`,
      `"${r.location}"`,
      r.qty,
      `"${r.uom}"`,
      r.standard_cost,
      r.total_cost,
      r.import_duty,
      r.vat,
      r.total_after_tax,
      r.aging_days,
      `"${r.aging_bucket}"`,
      `"${r.po}"`,
      `"${r.supplier}"`,
      `"${r.receive_date}"`,
      `"${r.mfg_date}"`,
      `"${(r.description || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `fabric_inventory_aging_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Loading State (Antislop R-27)
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin mb-4" />
        <h2 className="text-base font-bold text-slate-800">Loading Fabric Inventory &amp; Aging Report</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Processing 1,859 material batches, Dynamics 365 standard costs, and tax liabilities...
        </p>
      </div>
    );
  }

  // Error State (Antislop R-27)
  if (loadError || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 bg-red-100 text-red-700 rounded-full flex items-center justify-center font-bold text-xl mb-4 border border-red-200">
          !
        </div>
        <h2 className="text-base font-bold text-slate-900">Failed to Load Report Dataset</h2>
        <p className="text-xs text-red-700 mt-1 max-w-md bg-red-50 p-2.5 rounded border border-red-200 font-mono">
          {loadError}
        </p>
        <button
          type="button"
          onClick={fetchData}
          className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-md transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-md bg-slate-900 text-white flex items-center justify-center font-bold text-sm tracking-wider border border-slate-800 shadow-2xs">
              RSC
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Rochdale Spears Company
              </div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Fabric &amp; Leather Inventory Aging Report
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <div className="text-right pl-3">
              <div className="text-[11px] text-slate-500 font-medium">As of Date</div>
              <div className="text-xs font-semibold text-slate-800">{data.metadata.generated_at.slice(0, 10)}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 flex flex-col gap-6">
        {/* KPI Cards */}
        <section aria-label="Key Performance Indicators" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <span>Total On-Hand Value</span>
              <span className="text-[11px] font-normal text-slate-400">Standard Cost</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
              {formatCurrency(kpis.totalCost)}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
              <span>Physical Volume:</span>
              <span className="font-semibold text-slate-800 tabular-nums">{formatNumber(kpis.totalQty)} units</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <span>Total Financial Liability</span>
              <span className="text-[11px] font-normal text-slate-400">Post-Tax</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-blue-900 tabular-nums">
              {formatCurrency(kpis.totalTax)}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
              <span>Duty (12%) + VAT (8%):</span>
              <span className="font-semibold text-blue-800 tabular-nums">+{formatCurrency(kpis.totalDuty + kpis.totalVat)}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-amber-200 bg-amber-50/20 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-semibold text-amber-900 uppercase tracking-wider">
              <span>Aged Liability (&gt;180 Days)</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                {kpis.agedCostPct.toFixed(1)}% of Stock
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-900 tabular-nums">
              {formatCurrency(kpis.agedTaxOver180)}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
              <span>Aged Standard Cost:</span>
              <span className="font-semibold text-slate-800 tabular-nums">{formatCurrency(kpis.agedCostOver180)}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <span>Active Scope</span>
              <span className="text-[11px] font-normal text-slate-400">Filtered View</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
              {kpis.count.toLocaleString()} <span className="text-sm font-normal text-slate-500">batches</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
              <span>Scope Valuation:</span>
              <span className="font-semibold text-slate-800 tabular-nums">
                {((kpis.totalCost / (data.metadata.totals.total_cost || 1)) * 100).toFixed(1)}% of total
              </span>
            </div>
          </div>
        </section>

        {/* Filter Controls Bar */}
        <section aria-label="Report Filters" className="bg-white rounded-xl p-5 border-2 border-slate-300 border-l-4 border-l-blue-900 shadow-sm">
          <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Filter &amp; Drill-down Controls
              </span>
              {(selectedCustomer !== 'ALL' || selectedGroup !== 'ALL' || selectedAging !== 'ALL' || selectedWarehouse !== 'ALL' || searchQuery !== '') && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-900 border border-blue-200">
                  Active Filter
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-md border border-slate-300 font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reset Filters
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5 items-end">
            <div>
              <label htmlFor="customer-filter" className="block text-xs font-bold text-slate-800 mb-1.5">
                Customer Account
              </label>
              <select
                id="customer-filter"
                value={selectedCustomer}
                onChange={(e) => { setSelectedCustomer(e.target.value); setCurrentPage(1); setProjCurrentPage(1); }}
                className="w-full text-xs rounded-lg border-2 border-slate-300 hover:border-slate-400 bg-white text-slate-900 font-semibold py-2 px-3 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-colors shadow-2xs"
              >
                <option value="ALL">All Customers ({data.metadata.customers.length})</option>
                {data.metadata.customers.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="group-filter" className="block text-xs font-bold text-slate-800 mb-1.5">
                Material Group
              </label>
              <select
                id="group-filter"
                value={selectedGroup}
                onChange={(e) => { setSelectedGroup(e.target.value); setCurrentPage(1); setProjCurrentPage(1); }}
                className="w-full text-xs rounded-lg border-2 border-slate-300 hover:border-slate-400 bg-white text-slate-900 font-semibold py-2 px-3 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-colors shadow-2xs"
              >
                <option value="ALL">All Material Groups (3)</option>
                <option value="RM_FABRIC">Fabric (RM_FABRIC)</option>
                <option value="RM_LEATHER">Leather (RM_LEATHER)</option>
                <option value="RM_PU/PVC">PU / PVC (RM_PU/PVC)</option>
              </select>
            </div>

            <div>
              <label htmlFor="aging-filter" className="block text-xs font-bold text-slate-800 mb-1.5">
                Aging Period
              </label>
              <select
                id="aging-filter"
                value={selectedAging}
                onChange={(e) => { setSelectedAging(e.target.value); setCurrentPage(1); setProjCurrentPage(1); }}
                className="w-full text-xs rounded-lg border-2 border-slate-300 hover:border-slate-400 bg-white text-slate-900 font-semibold py-2 px-3 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-colors shadow-2xs"
              >
                <option value="ALL">All Periods (0 to 24+ mos)</option>
                <option value="0-3 months">0-3 months (0-89 days)</option>
                <option value="3-6 months">3-6 months (90-179 days)</option>
                <option value="6-12 months">6-12 months (180-359 days)</option>
                <option value="12-24 months">12-24 months (360-719 days)</option>
                <option value="+24 months">+24 months (720+ days)</option>
              </select>
            </div>

            <div>
              <label htmlFor="warehouse-filter" className="block text-xs font-bold text-slate-800 mb-1.5">
                Warehouse Location
              </label>
              <select
                id="warehouse-filter"
                value={selectedWarehouse}
                onChange={(e) => { setSelectedWarehouse(e.target.value); setCurrentPage(1); setProjCurrentPage(1); }}
                className="w-full text-xs rounded-lg border-2 border-slate-300 hover:border-slate-400 bg-white text-slate-900 font-semibold py-2 px-3 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-colors shadow-2xs"
              >
                <option value="ALL">All Warehouses ({data.metadata.warehouses.length})</option>
                {data.metadata.warehouses.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="search-input" className="block text-xs font-bold text-slate-800 mb-1.5">
                Search Item / Batch / PO
              </label>
              <input
                id="search-input"
                type="text"
                placeholder="Item #, Batch, PO..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); setProjCurrentPage(1); }}
                className="w-full text-xs rounded-lg border-2 border-slate-300 hover:border-slate-400 bg-white text-slate-900 placeholder-slate-400 font-semibold py-2 px-3 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-colors shadow-2xs"
              />
            </div>
          </div>
        </section>

        {/* Tab Selection */}
        <div className="bg-slate-200/90 p-1.5 rounded-xl border border-slate-300 shadow-inner flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          <nav className="flex flex-wrap gap-1.5" aria-label="Dashboard Views">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'overview'
                  ? 'bg-blue-900 text-white shadow-md border border-blue-950'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300/80 shadow-2xs'
              }`}
            >
              <span>Overview &amp; Aging Breakdown</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('active_covers')}
              className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'active_covers'
                  ? 'bg-blue-900 text-white shadow-md border border-blue-950'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300/80 shadow-2xs'
              }`}
            >
              <span>Active Covers (Draft)</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                activeTab === 'active_covers' ? 'bg-blue-800 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {filteredActiveCovers.length.toLocaleString()}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('projection')}
              className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'projection'
                  ? 'bg-blue-900 text-white shadow-md border border-blue-950'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300/80 shadow-2xs'
              }`}
            >
              <span>Stock Projection &amp; Balance</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                activeTab === 'projection' ? 'bg-blue-800 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {filteredProjections.length.toLocaleString()}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('explorer')}
              className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'explorer'
                  ? 'bg-blue-900 text-white shadow-md border border-blue-950'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300/80 shadow-2xs'
              }`}
            >
              <span>Batch Explorer &amp; Audit</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                activeTab === 'explorer' ? 'bg-blue-800 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {filteredRecords.length.toLocaleString()}
              </span>
            </button>
          </nav>

          <div className="text-xs font-semibold text-slate-700 px-3 hidden lg:block">
            {filteredRecords.length.toLocaleString()} batches in scope
          </div>
        </div>

        {/* View 1: Overview & Aging Breakdown */}
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-6">
            {/* Visual Aging Progression Bar */}
            <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs">
              <h2 className="text-sm font-bold text-slate-900 mb-1">
                Aging Period Distribution (By Inventory Valuation)
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Proportion of standard inventory cost tied up in each aging bracket across filtered materials.
              </p>

              <div className="w-full h-8 bg-slate-100 rounded-md overflow-hidden flex border border-slate-200">
                {agingTierData.map((tier) => {
                  const width = `${tier.costPct}%`;
                  if (tier.costPct <= 0) return null;
                  let bg = 'bg-emerald-600';
                  if (tier.tier === '3-6 months') bg = 'bg-sky-600';
                  if (tier.tier === '6-12 months') bg = 'bg-amber-600';
                  if (tier.tier === '12-24 months') bg = 'bg-orange-600';
                  if (tier.tier === '+24 months') bg = 'bg-red-700';

                  return (
                    <div
                      key={tier.tier}
                      style={{ width }}
                      title={`${tier.tier}: ${formatCurrency(tier.cost)} (${tier.costPct.toFixed(1)}%)`}
                      className={`${bg} h-full transition-all flex items-center justify-center text-[11px] font-semibold text-white overflow-hidden px-1`}
                    >
                      {tier.costPct > 8 ? `${tier.costPct.toFixed(0)}%` : ''}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {agingTierData.map((t) => (
                  <div key={t.tier} className="p-2.5 rounded border border-slate-100 bg-slate-50 text-xs">
                    <div className="font-semibold text-slate-700">{t.tier}</div>
                    <div className="text-slate-900 font-bold mt-1 tabular-nums">{formatCurrency(t.cost)}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{t.costPct.toFixed(1)}% of cost ({t.count} batches)</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Aging Bracket Breakdown Table */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-900">
                  Aging Tier Valuation &amp; Statutory Tax Liability Matrix
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-700 font-semibold">
                      <th className="py-2.5 px-4">Aging Bracket</th>
                      <th className="py-2.5 px-4 text-right">Batches</th>
                      <th className="py-2.5 px-4 text-right">Physical Qty</th>
                      <th className="py-2.5 px-4 text-right">Qty Share</th>
                      <th className="py-2.5 px-4 text-right">Standard Cost</th>
                      <th className="py-2.5 px-4 text-right">Import Duty (12%)</th>
                      <th className="py-2.5 px-4 text-right">VAT (8%)</th>
                      <th className="py-2.5 px-4 text-right">Total After Tax</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {agingTierData.map((row) => (
                      <tr key={row.tier} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-4 font-semibold text-slate-800">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] border ${getAgingBadgeClass(row.tier)}`}>
                            {row.tier}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-slate-700">{row.count.toLocaleString()}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-slate-700">{formatNumber(row.qty)}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-slate-500">{row.qtyPct.toFixed(1)}%</td>
                        <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-slate-900">{formatCurrency(row.cost)}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-slate-600">{formatCurrency(row.duty)}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-slate-600">{formatCurrency(row.vat)}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums font-bold text-blue-900">{formatCurrency(row.tax)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                      <td className="py-3 px-4">Total Portfolio</td>
                      <td className="py-3 px-4 text-right tabular-nums">{kpis.count.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{formatNumber(kpis.totalQty)}</td>
                      <td className="py-3 px-4 text-right tabular-nums">100.0%</td>
                      <td className="py-3 px-4 text-right tabular-nums">{formatCurrency(kpis.totalCost)}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{formatCurrency(kpis.totalDuty)}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{formatCurrency(kpis.totalVat)}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-blue-950">{formatCurrency(kpis.totalTax)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Customer Risk Exposure Table */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-900">
                  Customer Exposure &amp; Aged Liability Breakdown
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Material inventory grouped by assigned customer program. Shows aged liability (&gt;180 days) risk exposure.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-700 font-semibold">
                      <th className="py-2.5 px-4">Customer Account</th>
                      <th className="py-2.5 px-4 text-right">Batches</th>
                      <th className="py-2.5 px-4 text-right">Total Qty</th>
                      <th className="py-2.5 px-4 text-right">Standard Cost</th>
                      <th className="py-2.5 px-4 text-right">Total After Tax</th>
                      <th className="py-2.5 px-4 text-right">Aged Liability (&gt;180d)</th>
                      <th className="py-2.5 px-4 text-right">Aged Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {customerRiskData.map((c) => {
                      const agedPct = c.totalTax > 0 ? (c.agedTaxOver180 / c.totalTax) * 100 : 0;
                      return (
                        <tr key={c.customer} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-4 font-semibold text-slate-900">{c.customer}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-slate-700">{c.count.toLocaleString()}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-slate-700">{formatNumber(c.totalQty)}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-slate-800">{formatCurrency(c.totalCost)}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-slate-900">{formatCurrency(c.totalTax)}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums font-bold text-amber-900">{formatCurrency(c.agedTaxOver180)}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${
                              agedPct > 70 ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {agedPct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* View: Active Covers (Draft) */}
        {activeTab === 'active_covers' && (
          <div className="flex flex-col gap-6">
            {/* Headline KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <span>Active Stock Value</span>
                  <span className="text-[11px] font-normal text-slate-400">Standard Cost</span>
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
                  {formatCurrency(activeKPIs.totalCost)}
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                  <span>Share of Total Stock:</span>
                  <span className="font-semibold text-slate-800 tabular-nums">
                    {((activeKPIs.totalCost / (data?.metadata?.totals?.total_cost || 1)) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <span>Active Tax Liability</span>
                  <span className="text-[11px] font-normal text-slate-400">Post-Tax</span>
                </div>
                <div className="mt-2 text-2xl font-bold text-blue-900 tabular-nums">
                  {formatCurrency(activeKPIs.totalTax)}
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                  <span>Duty (12%) + VAT (8%):</span>
                  <span className="font-semibold text-blue-800 tabular-nums">
                    +{formatCurrency(activeKPIs.totalTax - activeKPIs.totalCost)}
                  </span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <span>Active Scope</span>
                  <span className="text-[11px] font-normal text-slate-400">Catalog Count</span>
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
                  {activeKPIs.totalItems.toLocaleString()} <span className="text-sm font-normal text-slate-500">materials</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                  <span>Inventory Batches:</span>
                  <span className="font-semibold text-slate-800 tabular-nums">
                    {filteredActiveCovers.reduce((s, c) => s + c.batches_count, 0).toLocaleString()} batches
                  </span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <span>Runway &amp; Buffer Health</span>
                  <span className="text-[11px] font-normal text-slate-400">Weeks of Supply</span>
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums flex items-baseline gap-2">
                  <span className="text-red-700">{activeKPIs.lowBufferCount}</span>
                  <span className="text-xs font-semibold text-slate-500">Low</span>
                  <span className="text-slate-300">/</span>
                  <span className="text-emerald-700">{activeKPIs.balancedCount}</span>
                  <span className="text-xs font-semibold text-slate-500">Bal</span>
                  <span className="text-slate-300">/</span>
                  <span className="text-sky-700">{activeKPIs.highBufferCount}</span>
                  <span className="text-xs font-semibold text-slate-500">High</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                  <span>Low Buffer Threshold:</span>
                  <span className="font-semibold text-red-700 tabular-nums">&lt; 4 Weeks Supply</span>
                </div>
              </div>
            </div>

            {/* Monthly Production Consumption Velocity Chart */}
            {data?.metadata?.active_covers_summary?.monthly_velocity && (
              <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Monthly Production Consumption Velocity (2026)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Physical fabric and leather units issued into manufacturing batch orders by month.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2.5 pt-2">
                  {(() => {
                    const velocity = data.metadata.active_covers_summary.monthly_velocity;
                    const maxUnits = Math.max(...velocity.map(v => v.units), 1);
                    return velocity.map((pt) => {
                      const heightPct = Math.max(12, Math.round((pt.units / maxUnits) * 100));
                      return (
                        <div key={pt.month} className="flex flex-col items-center bg-slate-50/70 p-2.5 rounded-lg border border-slate-200/80">
                          <span className="text-[11px] font-bold text-slate-900 tabular-nums">
                            {formatNumber(pt.units)}
                          </span>
                          <span className="text-[10px] text-slate-500">units</span>

                          <div className="w-full h-24 flex items-end justify-center my-2">
                            <div
                              style={{ height: `${heightPct}%` }}
                              className="w-full max-w-[36px] bg-blue-900 hover:bg-blue-800 rounded-t transition-all"
                              title={`${pt.label}: ${formatNumber(pt.units)} units consumed across ${pt.active_skus} materials`}
                            />
                          </div>

                          <span className="text-xs font-bold text-slate-800">
                            {pt.label.slice(0, 3)} 26
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {pt.active_skus} SKUs
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* Active Covers Table Section */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden flex flex-col gap-4 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Active Covers Catalog ({filteredActiveCovers.length.toLocaleString()} Materials)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Click any column header to sort. Click a material row to inspect monthly consumption and batch breakdown.
                  </p>
                </div>

                {/* Status Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => { setActiveStatusFilter('ALL'); setActiveCurrentPage(1); }}
                    className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                      activeStatusFilter === 'ALL'
                        ? 'bg-blue-900 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    All Active ({data?.active_covers?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveStatusFilter('Low Buffer'); setActiveCurrentPage(1); }}
                    className={`px-3 py-1 rounded-md font-semibold transition-colors flex items-center gap-1.5 ${
                      activeStatusFilter === 'Low Buffer'
                        ? 'bg-red-800 text-white shadow-2xs'
                        : 'bg-red-50 text-red-900 border border-red-200 hover:bg-red-100'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-red-600 inline-block"></span>
                    Low Buffer ({activeKPIs.lowBufferCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveStatusFilter('Balanced'); setActiveCurrentPage(1); }}
                    className={`px-3 py-1 rounded-md font-semibold transition-colors flex items-center gap-1.5 ${
                      activeStatusFilter === 'Balanced'
                        ? 'bg-emerald-800 text-white shadow-2xs'
                        : 'bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
                    Balanced ({activeKPIs.balancedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveStatusFilter('High Buffer'); setActiveCurrentPage(1); }}
                    className={`px-3 py-1 rounded-md font-semibold transition-colors flex items-center gap-1.5 ${
                      activeStatusFilter === 'High Buffer'
                        ? 'bg-sky-800 text-white shadow-2xs'
                        : 'bg-sky-50 text-sky-900 border border-sky-200 hover:bg-sky-100'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-sky-600 inline-block"></span>
                    High Buffer ({activeKPIs.highBufferCount})
                  </button>
                </div>
              </div>

              {/* Rows Per Page & Page Summary */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                <div className="text-slate-600">
                  Showing {paginatedActiveCovers.length.toLocaleString()} of {filteredActiveCovers.length.toLocaleString()} materials
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-600">Rows per page:</span>
                  <select
                    value={activePageSize}
                    onChange={(e) => { setActivePageSize(Number(e.target.value)); setActiveCurrentPage(1); }}
                    className="rounded border border-slate-300 py-1 px-2 text-xs bg-white text-slate-800 shadow-2xs"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={-1}>All ({filteredActiveCovers.length})</option>
                  </select>
                </div>
              </div>

              {/* Active Covers Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-700 font-semibold select-none">
                      <th onClick={() => handleActiveSort('item')} className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60">
                        Cover / Part # {activeSortField === 'item' && (activeSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleActiveSort('customer')} className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60">
                        Customer {activeSortField === 'customer' && (activeSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleActiveSort('product_group')} className="py-2.5 px-2 cursor-pointer hover:bg-slate-200/60">
                        Group {activeSortField === 'product_group' && (activeSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleActiveSort('standard_cost')} className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/60">
                        Std Cost {activeSortField === 'standard_cost' && (activeSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleActiveSort('on_hand_qty')} className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/60">
                        On-Hand Qty {activeSortField === 'on_hand_qty' && (activeSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleActiveSort('total_cost')} className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/60">
                        Stock Value {activeSortField === 'total_cost' && (activeSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleActiveSort('total_after_tax')} className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/60">
                        Post-Tax Value {activeSortField === 'total_after_tax' && (activeSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleActiveSort('consumed_qty_2026')} className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/60">
                        2026 Consumed {activeSortField === 'consumed_qty_2026' && (activeSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleActiveSort('prod_orders_count')} className="py-2.5 px-2 text-right cursor-pointer hover:bg-slate-200/60">
                        Prod Orders {activeSortField === 'prod_orders_count' && (activeSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleActiveSort('last_consumed_date')} className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60">
                        Last Pick {activeSortField === 'last_consumed_date' && (activeSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleActiveSort('weeks_of_supply')} className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/60">
                        Runway {activeSortField === 'weeks_of_supply' && (activeSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleActiveSort('status')} className="py-2.5 px-3 text-center cursor-pointer hover:bg-slate-200/60">
                        Status {activeSortField === 'status' && (activeSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {paginatedActiveCovers.map((c) => {
                      const isSelected = inspectedActiveCover?.item === c.item;
                      return (
                        <tr
                          key={c.item}
                          onClick={() => setInspectedActiveCover(isSelected ? null : c)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-50/70 border-l-4 border-l-blue-900' : 'hover:bg-slate-50/90'
                          }`}
                        >
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            <div>{c.item}</div>
                            <div className="text-[10px] text-slate-500 font-normal truncate max-w-[200px]">
                              {c.description || 'No description'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 font-medium">{c.customer}</td>
                          <td className="py-2.5 px-2 text-slate-600 text-[11px] font-mono">
                            {c.product_group.replace('RM_', '')}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">
                            {formatCurrency(c.standard_cost)}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-900">
                            {formatNumber(c.on_hand_qty)} <span className="text-[10px] text-slate-500 font-normal">{c.uom}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900">
                            {formatCurrency(c.total_cost)}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-bold text-blue-950">
                            {formatCurrency(c.total_after_tax)}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-slate-800">
                            {formatNumber(c.consumed_qty_2026)}
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-slate-600">
                            {c.prod_orders_count.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 tabular-nums text-slate-600 text-[11px]">
                            {c.last_consumed_date}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                            {typeof c.weeks_of_supply === 'number' ? `${c.weeks_of_supply} wks` : c.weeks_of_supply}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              c.status === 'Low Buffer'
                                ? 'bg-red-100 text-red-900 border border-red-300'
                                : c.status === 'Balanced'
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : 'bg-sky-100 text-sky-900 border border-sky-300'
                            }`}>
                              {c.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {activePageSize !== -1 && totalActivePages > 1 && (
                <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-200">
                  <div className="text-slate-600">
                    Page {activeCurrentPage} of {totalActivePages}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={activeCurrentPage === 1}
                      onClick={() => setActiveCurrentPage(1)}
                      className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                      First
                    </button>
                    <button
                      type="button"
                      disabled={activeCurrentPage === 1}
                      onClick={() => setActiveCurrentPage(prev => Math.max(1, prev - 1))}
                      className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                      Prev
                    </button>
                    <span className="px-3 py-1 text-slate-700 font-bold">
                      {activeCurrentPage} / {totalActivePages}
                    </span>
                    <button
                      type="button"
                      disabled={activeCurrentPage === totalActivePages}
                      onClick={() => setActiveCurrentPage(prev => Math.min(totalActivePages, prev + 1))}
                      className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      disabled={activeCurrentPage === totalActivePages}
                      onClick={() => setActiveCurrentPage(totalActivePages)}
                      className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                      Last
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* View 2: Stock Projection & Balance */}
        {activeTab === 'projection' && (
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden flex flex-col gap-4 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Raw Material Stock Projection &amp; Free Stock Balance
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Click on any column header to sort ascending (↑) or descending (↓).
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600">Rows per page:</span>
                <select
                  value={projPageSize}
                  onChange={(e) => { setProjPageSize(Number(e.target.value)); setProjCurrentPage(1); }}
                  className="rounded border-slate-300 py-1 px-2 text-xs bg-white text-slate-800 shadow-2xs"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={-1}>All ({sortedProjections.length})</option>
                </select>
              </div>
            </div>

            {sortedProjections.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No matching materials found in projection scope.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-md">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold select-none">
                      <th
                        onClick={() => handleProjSort('item')}
                        className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/70 transition-colors group"
                        title="Click to sort by Item Number"
                      >
                        <span className="inline-flex items-center gap-1">
                          Item Number
                          <span className={projSortField === 'item' ? 'text-blue-900 font-bold' : 'text-slate-300 group-hover:text-slate-500'}>
                            {projSortField === 'item' ? (projSortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </span>
                      </th>

                      <th
                        onClick={() => handleProjSort('customer')}
                        className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/70 transition-colors group"
                        title="Click to sort by Customer"
                      >
                        <span className="inline-flex items-center gap-1">
                          Customer
                          <span className={projSortField === 'customer' ? 'text-blue-900 font-bold' : 'text-slate-300 group-hover:text-slate-500'}>
                            {projSortField === 'customer' ? (projSortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </span>
                      </th>

                      <th
                        onClick={() => handleProjSort('supplier')}
                        className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/70 transition-colors group"
                        title="Click to sort by Supplier"
                      >
                        <span className="inline-flex items-center gap-1">
                          Supplier
                          <span className={projSortField === 'supplier' ? 'text-blue-900 font-bold' : 'text-slate-300 group-hover:text-slate-500'}>
                            {projSortField === 'supplier' ? (projSortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </span>
                      </th>

                      <th
                        onClick={() => handleProjSort('uom')}
                        className="py-2.5 px-2 text-center cursor-pointer hover:bg-slate-200/70 transition-colors group"
                        title="Click to sort by UOM"
                      >
                        <span className="inline-flex items-center gap-1 justify-center">
                          UOM
                          <span className={projSortField === 'uom' ? 'text-blue-900 font-bold' : 'text-slate-300 group-hover:text-slate-500'}>
                            {projSortField === 'uom' ? (projSortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </span>
                      </th>

                      <th
                        onClick={() => handleProjSort('standard_cost')}
                        className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/70 transition-colors group"
                        title="Click to sort by Standard Cost"
                      >
                        <span className="inline-flex items-center gap-1 justify-end">
                          Std Cost
                          <span className={projSortField === 'standard_cost' ? 'text-blue-900 font-bold' : 'text-slate-300 group-hover:text-slate-500'}>
                            {projSortField === 'standard_cost' ? (projSortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </span>
                      </th>

                      <th
                        onClick={() => handleProjSort('on_hand')}
                        className="py-2.5 px-3 text-right bg-slate-200/50 font-bold text-slate-900 cursor-pointer hover:bg-slate-200 transition-colors group"
                        title="Click to sort by Current On-Hand"
                      >
                        <span className="inline-flex items-center gap-1 justify-end">
                          Current On-Hand
                          <span className={projSortField === 'on_hand' ? 'text-blue-900 font-bold' : 'text-slate-300 group-hover:text-slate-500'}>
                            {projSortField === 'on_hand' ? (projSortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </span>
                      </th>

                      <th
                        onClick={() => handleProjSort('incoming')}
                        className="py-2.5 px-3 text-right font-semibold text-slate-700 cursor-pointer hover:bg-slate-200/70 transition-colors group"
                        title="Click to sort by Total Incoming"
                      >
                        <span className="inline-flex items-center gap-1 justify-end">
                          Total Incoming
                          <span className={projSortField === 'incoming' ? 'text-blue-900 font-bold' : 'text-slate-300 group-hover:text-slate-500'}>
                            {projSortField === 'incoming' ? (projSortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </span>
                      </th>

                      <th
                        onClick={() => handleProjSort('demand')}
                        className="py-2.5 px-3 text-right font-semibold text-amber-900 cursor-pointer hover:bg-slate-200/70 transition-colors group"
                        title="Click to sort by Total Demand"
                      >
                        <span className="inline-flex items-center gap-1 justify-end">
                          Total Demand
                          <span className={projSortField === 'demand' ? 'text-blue-900 font-bold' : 'text-slate-300 group-hover:text-slate-500'}>
                            {projSortField === 'demand' ? (projSortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </span>
                      </th>

                      <th
                        onClick={() => handleProjSort('balance')}
                        className="py-2.5 px-3 text-right font-semibold text-slate-800 cursor-pointer hover:bg-slate-200/70 transition-colors group"
                        title="Click to sort by Balance"
                      >
                        <span className="inline-flex items-center gap-1 justify-end">
                          Balance
                          <span className={projSortField === 'balance' ? 'text-blue-900 font-bold' : 'text-slate-300 group-hover:text-slate-500'}>
                            {projSortField === 'balance' ? (projSortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </span>
                      </th>

                      <th
                        onClick={() => handleProjSort('free_stock')}
                        className="py-2.5 px-3 text-right font-bold text-blue-900 bg-blue-50/40 cursor-pointer hover:bg-blue-100/60 transition-colors group"
                        title="Click to sort by Final Free Stock"
                      >
                        <span className="inline-flex items-center gap-1 justify-end">
                          Final Free Stock
                          <span className={projSortField === 'free_stock' ? 'text-blue-900 font-bold' : 'text-slate-300 group-hover:text-slate-500'}>
                            {projSortField === 'free_stock' ? (projSortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </span>
                      </th>

                      <th
                        onClick={() => handleProjSort('free_stock_cost')}
                        className="py-2.5 px-3 text-right font-medium text-slate-800 cursor-pointer hover:bg-slate-200/70 transition-colors group"
                        title="Click to sort by Free Stock Value"
                      >
                        <span className="inline-flex items-center gap-1 justify-end">
                          Free Stock Value
                          <span className={projSortField === 'free_stock_cost' ? 'text-blue-900 font-bold' : 'text-slate-300 group-hover:text-slate-500'}>
                            {projSortField === 'free_stock_cost' ? (projSortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </span>
                      </th>

                      <th
                        onClick={() => handleProjSort('free_stock_tax')}
                        className="py-2.5 px-3 text-right font-bold text-blue-950 cursor-pointer hover:bg-slate-200/70 transition-colors group"
                        title="Click to sort by Post-Tax Liability"
                      >
                        <span className="inline-flex items-center gap-1 justify-end">
                          Post-Tax Liability
                          <span className={projSortField === 'free_stock_tax' ? 'text-blue-900 font-bold' : 'text-slate-300 group-hover:text-slate-500'}>
                            {projSortField === 'free_stock_tax' ? (projSortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </span>
                      </th>

                      <th
                        onClick={() => handleProjSort('aws')}
                        className="py-2.5 px-2.5 text-center cursor-pointer hover:bg-slate-200/70 transition-colors group"
                        title="Click to sort by Average Weeks of Stock"
                      >
                        <span className="inline-flex items-center gap-1 justify-center">
                          AWS
                          <span className={projSortField === 'aws' ? 'text-blue-900 font-bold' : 'text-slate-300 group-hover:text-slate-500'}>
                            {projSortField === 'aws' ? (projSortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </span>
                      </th>

                      <th
                        onClick={() => handleProjSort('status')}
                        className="py-2.5 px-3 text-center cursor-pointer hover:bg-slate-200/70 transition-colors group"
                        title="Click to sort by Status"
                      >
                        <span className="inline-flex items-center gap-1 justify-center">
                          Status
                          <span className={projSortField === 'status' ? 'text-blue-900 font-bold' : 'text-slate-300 group-hover:text-slate-500'}>
                            {projSortField === 'status' ? (projSortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {paginatedProjections.map((p) => {
                      const isDeficit = p.free_stock < 0;
                      return (
                        <tr key={p.item} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-3 font-semibold text-slate-900 whitespace-nowrap">{p.item}</td>
                          <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{p.customer}</td>
                          <td className="py-2 px-3 text-slate-500 whitespace-nowrap">{p.supplier || 'N/A'}</td>
                          <td className="py-2 px-2 text-center text-slate-500">{p.uom}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-700">{formatCurrency(p.standard_cost)}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-bold bg-slate-50 text-slate-900">{formatNumber(p.on_hand)}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                            {p.incoming > 0 ? formatNumber(p.incoming) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-amber-900 font-medium">
                            {p.demand > 0 ? formatNumber(p.demand) : '-'}
                          </td>
                          <td className={`py-2 px-3 text-right tabular-nums font-medium ${p.balance < 0 ? 'text-red-700 font-bold' : 'text-slate-800'}`}>
                            {formatNumber(p.balance)}
                          </td>
                          <td className={`py-2 px-3 text-right tabular-nums font-bold bg-blue-50/30 ${isDeficit ? 'text-red-700 bg-red-50' : 'text-blue-900'}`}>
                            {formatNumber(p.free_stock)}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-800">{formatCurrency(p.free_stock_cost)}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-bold text-blue-950">{formatCurrency(p.free_stock_tax)}</td>
                          <td className="py-2 px-2.5 text-center tabular-nums">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              p.aws === 'No Demand' ? 'bg-slate-100 text-slate-600' : p.aws < 4 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
                            }`}>
                              {p.aws}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                              p.status === 'Deficit'
                                ? 'bg-red-50 text-red-800 border border-red-200'
                                : p.status === 'Low Buffer'
                                ? 'bg-amber-50 text-amber-900 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                            }`}>
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls for Projections */}
            {sortedProjections.length > 0 && (
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
                <div>
                  Showing {projPageSize === -1 ? '1 to ' + sortedProjections.length.toLocaleString() : ((projCurrentPage - 1) * projPageSize + 1).toLocaleString() + ' to ' + Math.min(projCurrentPage * projPageSize, sortedProjections.length).toLocaleString()} of{' '}
                  {sortedProjections.length.toLocaleString()} items
                </div>

                {projPageSize !== -1 && totalProjPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={projCurrentPage === 1}
                      onClick={() => setProjCurrentPage(1)}
                      className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                      First
                    </button>
                    <button
                      type="button"
                      disabled={projCurrentPage === 1}
                      onClick={() => setProjCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 font-semibold text-slate-800">
                      Page {projCurrentPage} of {totalProjPages}
                    </span>
                    <button
                      type="button"
                      disabled={projCurrentPage === totalProjPages}
                      onClick={() => setProjCurrentPage((p) => Math.min(totalProjPages, p + 1))}
                      className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      disabled={projCurrentPage === totalProjPages}
                      onClick={() => setProjCurrentPage(totalProjPages)}
                      className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                      Last
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* View 3: Batch Explorer & Audit Table */}
        {activeTab === 'explorer' && (
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Batch Inventory Explorer ({filteredRecords.length.toLocaleString()} Records)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select any row to inspect batch provenance, receiving dates, and tax breakdown.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600">Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                  className="rounded border-slate-300 py-1 px-2 text-xs bg-white text-slate-800 shadow-2xs"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                </select>
              </div>
            </div>

            {/* Empty State (Antislop R-27) */}
            {sortedRecords.length === 0 ? (
              <div className="py-16 text-center px-4">
                <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-sm font-semibold text-slate-800">No matching inventory batches found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  No records match the current filter criteria. Adjust your search keywords or clear filters.
                </p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-4 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors"
                >
                  Clear All Filters
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold select-none">
                      <th onClick={() => handleSort('batch')} className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60">
                        Batch Number {sortField === 'batch' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleSort('item')} className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60">
                        Item Number {sortField === 'item' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleSort('customer')} className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60">
                        Customer {sortField === 'customer' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleSort('warehouse')} className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60">
                        Warehouse {sortField === 'warehouse' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleSort('location')} className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/60">
                        Location
                      </th>
                      <th onClick={() => handleSort('qty')} className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/60">
                        Physical Qty {sortField === 'qty' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleSort('standard_cost')} className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/60">
                        Std Cost {sortField === 'standard_cost' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleSort('total_cost')} className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/60">
                        Total Cost {sortField === 'total_cost' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleSort('import_duty')} className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/60">
                        Duty (12%)
                      </th>
                      <th onClick={() => handleSort('vat')} className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/60">
                        VAT (8%)
                      </th>
                      <th onClick={() => handleSort('total_after_tax')} className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/60">
                        Post-Tax Total {sortField === 'total_after_tax' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th onClick={() => handleSort('aging_days')} className="py-2.5 px-3 text-center cursor-pointer hover:bg-slate-200/60">
                        Aging {sortField === 'aging_days' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {paginatedRecords.map((r, idx) => (
                      <tr
                        key={`${r.batch}-${r.item}-${idx}`}
                        onClick={() => setInspectedBatch(r)}
                        className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                      >
                        <td className="py-2 px-3 font-mono font-medium text-blue-900">{r.batch}</td>
                        <td className="py-2 px-3 font-semibold text-slate-900">{r.item}</td>
                        <td className="py-2 px-3 text-slate-700">{r.customer}</td>
                        <td className="py-2 px-3 text-slate-600">{r.warehouse}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500">{r.location}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-900">
                          {formatNumber(r.qty)} <span className="text-[10px] font-normal text-slate-500">{r.uom}</span>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-700">{formatCurrency(r.standard_cost)}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-medium text-slate-800">{formatCurrency(r.total_cost)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-500">{formatCurrency(r.import_duty)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-500">{formatCurrency(r.vat)}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-bold text-blue-950">{formatCurrency(r.total_after_tax)}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${getAgingBadgeClass(r.aging_bucket)}`}>
                            {r.aging_days}d ({r.aging_bucket})
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {sortedRecords.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 bg-slate-50">
                <div>
                  Showing {((currentPage - 1) * pageSize + 1).toLocaleString()} to{' '}
                  {Math.min(currentPage * pageSize, sortedRecords.length).toLocaleString()} of{' '}
                  {sortedRecords.length.toLocaleString()} batches
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(1)}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 font-semibold text-slate-800">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Accessible Batch Inspection Modal (Antislop R-26, R-32) */}
      {inspectedBatch && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          onClick={() => setInspectedBatch(null)}
        >
          <div
            className="bg-white rounded-lg border border-slate-300 shadow-xl max-w-xl w-full p-6 text-slate-900 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Batch Audit Detail</span>
                <h3 id="modal-title" className="text-lg font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                  <span>{inspectedBatch.batch}</span>
                  <span className="text-sm font-normal text-slate-500">({inspectedBatch.item})</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedBatch(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-md focus-visible:ring-2 focus-visible:ring-blue-600"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                <div className="text-slate-500">Customer Program</div>
                <div className="font-semibold text-slate-900 text-sm mt-0.5">{inspectedBatch.customer}</div>
              </div>
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                <div className="text-slate-500">Material Category</div>
                <div className="font-semibold text-slate-900 text-sm mt-0.5">{inspectedBatch.product_group}</div>
              </div>
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                <div className="text-slate-500">Warehouse &amp; Location</div>
                <div className="font-semibold text-slate-900 mt-0.5">{inspectedBatch.warehouse} / {inspectedBatch.location}</div>
              </div>
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                <div className="text-slate-500">Supplier Code</div>
                <div className="font-semibold text-slate-900 mt-0.5">{inspectedBatch.supplier || 'N/A'}</div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50/50 rounded-lg border border-blue-200">
              <div className="text-xs font-bold text-blue-950 mb-2">Inventory &amp; Valuation Profile</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-slate-500">Physical Qty</div>
                  <div className="font-bold text-slate-900 tabular-nums">{formatNumber(inspectedBatch.qty)} {inspectedBatch.uom}</div>
                </div>
                <div>
                  <div className="text-slate-500">Standard Cost</div>
                  <div className="font-bold text-slate-900 tabular-nums">{formatCurrency(inspectedBatch.standard_cost)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Total Standard Cost</div>
                  <div className="font-bold text-slate-900 tabular-nums">{formatCurrency(inspectedBatch.total_cost)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Import Duty (12%)</div>
                  <div className="font-semibold text-slate-800 tabular-nums">+{formatCurrency(inspectedBatch.import_duty)}</div>
                </div>
                <div>
                  <div className="text-slate-500">VAT (8%)</div>
                  <div className="font-semibold text-slate-800 tabular-nums">+{formatCurrency(inspectedBatch.vat)}</div>
                </div>
                <div>
                  <div className="text-blue-900 font-medium">Post-Tax Liability</div>
                  <div className="font-bold text-blue-950 tabular-nums">{formatCurrency(inspectedBatch.total_after_tax)}</div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500">Aging Duration:</span>{' '}
                <span className="font-bold text-slate-900">{inspectedBatch.aging_days} days</span> ({inspectedBatch.aging_bucket})
              </div>
              <div>
                <span className="text-slate-500">PO Reference:</span>{' '}
                <span className="font-mono text-slate-800">{inspectedBatch.po || 'None'}</span>
              </div>
              <div>
                <span className="text-slate-500">Receive Date:</span>{' '}
                <span className="text-slate-800">{inspectedBatch.receive_date || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500">Manufacturing Date:</span>{' '}
                <span className="text-slate-800">{inspectedBatch.mfg_date || 'N/A'}</span>
              </div>
            </div>

            {inspectedBatch.description && (
              <div className="mt-4 pt-3 border-t border-slate-200 text-xs">
                <span className="text-slate-500 block mb-1 font-medium">Material Description:</span>
                <p className="text-slate-700 bg-slate-50 p-2 rounded border border-slate-200 whitespace-pre-line font-mono text-[11px]">
                  {inspectedBatch.description}
                </p>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectedBatch(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded bg-slate-800 text-white hover:bg-slate-900 transition-colors"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Cover Consumption Modal */}
      {inspectedActiveCover && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="active-cover-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={(e) => { if (e.target === e.currentTarget) setInspectedActiveCover(null); }}
        >
          <div className="bg-white rounded-xl border border-slate-300 shadow-2xl max-w-2xl w-full p-6 text-slate-800">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider">
                  Material Consumption Profile (D365)
                </span>
                <h3 id="active-cover-modal-title" className="text-lg font-bold text-slate-900 mt-0.5">
                  {inspectedActiveCover.item} - {inspectedActiveCover.customer}
                </h3>
                <p className="text-xs text-slate-600 mt-1 font-mono">
                  {inspectedActiveCover.description || 'No material description'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedActiveCover(null)}
                aria-label="Close modal window"
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-md hover:bg-slate-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-slate-500 font-medium">On-Hand Stock</div>
                <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                  {formatNumber(inspectedActiveCover.on_hand_qty)} <span className="text-xs font-normal text-slate-500">{inspectedActiveCover.uom}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{inspectedActiveCover.batches_count} batches</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-slate-500 font-medium">Stock Value</div>
                <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                  {formatCurrency(inspectedActiveCover.total_cost)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Std: {formatCurrency(inspectedActiveCover.standard_cost)}/{inspectedActiveCover.uom}</div>
              </div>

              <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-200">
                <div className="text-blue-900 font-medium">Post-Tax Liability</div>
                <div className="text-base font-bold text-blue-950 mt-1 tabular-nums">
                  {formatCurrency(inspectedActiveCover.total_after_tax)}
                </div>
                <div className="text-[11px] text-blue-800 mt-0.5">Duty 12% + VAT 8%</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-slate-500 font-medium">2026 Production Consumption</div>
                <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                  {formatNumber(inspectedActiveCover.consumed_qty_2026)} <span className="text-xs font-normal text-slate-500">{inspectedActiveCover.uom}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{inspectedActiveCover.prod_orders_count} production orders</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-slate-500 font-medium">Last Production Pick</div>
                <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                  {inspectedActiveCover.last_consumed_date}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">D365 InventTrans</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-slate-500 font-medium">Runway Status</div>
                <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                  {typeof inspectedActiveCover.weeks_of_supply === 'number' ? `${inspectedActiveCover.weeks_of_supply} wks` : inspectedActiveCover.weeks_of_supply}
                </div>
                <div className="text-[11px] font-semibold text-slate-600 mt-0.5">{inspectedActiveCover.status}</div>
              </div>
            </div>

            {/* Monthly Production Pick Breakdown */}
            <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-xs font-bold text-slate-800 mb-2">
                2026 Monthly Production Pick History ({inspectedActiveCover.uom}):
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 text-center text-xs">
                {Object.entries(inspectedActiveCover.monthly_consumed).map(([m, q]) => (
                  <div key={m} className="p-2 bg-white rounded border border-slate-200 shadow-2xs">
                    <div className="text-[10px] text-slate-500 font-semibold">{m.slice(5)}/{m.slice(2, 4)}</div>
                    <div className={`font-bold mt-1 tabular-nums text-xs ${q > 0 ? 'text-blue-900 font-bold' : 'text-slate-400 font-normal'}`}>
                      {q > 0 ? formatNumber(q) : '0'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectedActiveCover(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded bg-slate-800 text-white hover:bg-slate-900 transition-colors"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            Rochdale Spears Company &middot; Supply Chain &amp; Manufacturing Operations &middot; Fabric Stock &amp; Aging Control
          </div>
          <div className="text-slate-300 hover:text-slate-700 transition-colors duration-200 font-medium cursor-default select-none">
            made by Joe - Hung Pham
          </div>
        </div>
      </footer>
    </div>
  );
}
