"use client";
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';

export default function PowerAnalysisDashboard() {
  const [siteId, setSiteId] = useState('');
  const [siteName, setSiteName] = useState('');
  const [data, setData] = useState([]);
  const [savedSites, setSavedSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState('');
  const [anomalies, setAnomalies] = useState([]);
  const [debugInfo, setDebugInfo] = useState('');

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('power_logs_history')) || [];
    setSavedSites(saved);
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const dataBuffer = new Uint8Array(evt.target.result);
        const wb = XLSX.read(dataBuffer, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json(ws, { defval: "" });

        if (rawData.length === 0) {
          alert("File kosong atau tidak terbaca!");
          return;
        }

        // Tampilkan info kolom pertama untuk debugging
        setDebugInfo(`Kolom terdeteksi: ${Object.keys(rawData[0]).join(', ')} (Total baris: ${rawData.length})`);
        parseAndAnalyzeData(rawData);
      } catch (err) {
        alert("Gagal membaca file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const parseAndAnalyzeData = (rawData) => {
    const parsedData = rawData.map(row => {
      // Cari key secara fleksibel berdasarkan substring
      const keys = Object.keys(row);
      
      const findVal = (keywords) => {
        for (let kw of keywords) {
          const foundKey = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(kw));
          if (foundKey !== undefined && row[foundKey] !== "") {
            return row[foundKey];
          }
        }
        return null;
      };

      // Deteksi waktu
      const timeVal = findVal(['datetime', 'time', 'waktu', 'tanggal']) || '-';

      // Deteksi AC Voltage (Hariff: AC Voltage, ZTE Sys: AC Voltage-1, SMR: SMR Input Voltage)
      const acVal = parseFloat(findVal(['acvoltage1', 'acvoltage', 'smrinputvoltage', 'teganganac'])) || 0;

      // Deteksi DC Voltage (Hariff: Bus Voltage, ZTE Sys: DC Voltage, SMR: SMR Output Voltage)
      const dcVal = parseFloat(findVal(['busvoltage', 'dcvoltage', 'smroutputvoltage', 'tegangandc'])) || 0;

      return {
        time: String(timeVal),
        ac: acVal,
        dc: dcVal
      };
    }).filter(r => r.time !== '-' && (r.ac > 0 || r.dc > 0));

    setData(parsedData);
    calculateAnomalies(parsedData);
  };

  const calculateAnomalies = (dataset) => {
    const found = [];
    dataset.forEach(row => {
      // Logika Anomali AC (Standar 220V: < 200V Drop, > 240V Over)
      if (row.ac > 0 && (row.ac < 200 || row.ac > 240)) {
        found.push({ time: row.time, type: 'AC Mains', val: row.ac, status: row.ac < 200 ? 'Drop' : 'Overvoltage' });
      }
      // Logika Anomali DC (Standar 48V: < 46V Drop, > 54V Over)
      if (row.dc > 0 && (row.dc < 46 || row.dc > 54)) {
        found.push({ time: row.time, type: 'DC Rectifier', val: row.dc, status: row.dc < 46 ? 'Drop' : 'Overvoltage' });
      }
    });
    setAnomalies(found);
  };

  const handleSave = () => {
    if (!siteId || !siteName || data.length === 0) {
      alert("Lengkapi Site ID, Site Name, dan pastikan data log sudah tampil di grafik!");
      return;
    }
    const newRecord = { id: Date.now().toString(), siteId, siteName, data, anomalies };
    const updated = [...savedSites, newRecord];
    
    setSavedSites(updated);
    localStorage.setItem('power_logs_history', JSON.stringify(updated));
    alert(`Sukses! Data Site ${siteName} tersimpan di Vercel.`);
  };

  const handleSelectSite = (e) => {
    const id = e.target.value;
    setSelectedSite(id);
    if (id === "") {
      setData([]); setAnomalies([]); setSiteId(''); setSiteName(''); setDebugInfo('');
      return;
    }
    const selected = savedSites.find(s => s.id === id);
    if (selected) {
      setSiteId(selected.siteId);
      setSiteName(selected.siteName);
      setData(selected.data);
      setAnomalies(selected.anomalies);
      setDebugInfo(`Dimuat dari history. Total data: ${selected.data.length} baris.`);
    }
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans text-gray-900">
      <div className="max-w-7xl mx-auto bg-white p-6 rounded-xl shadow-md border border-gray-200">
        <h1 className="text-2xl font-bold mb-6 text-blue-900 border-b pb-3">Dashboard Analisa Power Multi-Vendor (ZTE & Hariff)</h1>
        
        {/* Panel Kontrol */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div>
            <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Cari History Site</label>
            <select value={selectedSite} onChange={handleSelectSite} className="w-full p-2 border border-gray-300 rounded bg-white text-sm">
              <option value="">-- Buat / Analisa Data Baru --</option>
              {savedSites.map(site => (
                <option key={site.id} value={site.id}>{site.siteId} - {site.siteName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Site ID</label>
            <input type="text" value={siteId} onChange={e => setSiteId(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm" placeholder="Contoh: KKN011" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Site Name</label>
            <input type="text" value={siteName} onChange={e => setSiteName(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm" placeholder="Contoh: Kampuri" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Upload Data (Hariff/ZTE)</label>
            <input type="file" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} className="w-full text-xs text-gray-500 file:mr-2 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          </div>
        </div>

        {debugInfo && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded font-mono">
            <strong>Status Parsing:</strong> {debugInfo} | <strong>Baris Valid Terbaca:</strong> {data.length} data
          </div>
        )}

        <button onClick={handleSave} className="mb-8 bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2 rounded text-sm shadow transition">
          Simpan History Analisa ke Vercel
        </button>

        {/* Bagian Grafik & Tabel Analisa */}
        {data.length > 0 ? (
          <div className="space-y-8">
            {/* Grafik AC */}
            <div className="p-5 border border-gray-200 rounded-lg bg-white shadow-sm">
              <h2 className="text-base font-bold mb-4 text-gray-800">Fluktuasi Tegangan AC 220V</h2>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={40} />
                    <YAxis domain={[150, 280]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <ReferenceLine y={240} stroke="red" strokeDasharray="3 3" label={{ value: 'Upper (240V)', fill: 'red', fontSize: 10 }} />
                    <ReferenceLine y={200} stroke="orange" strokeDasharray="3 3" label={{ value: 'Lower (200V)', fill: 'orange', fontSize: 10 }} />
                    <Line type="monotone" dataKey="ac" stroke="#2563eb" name="Tegangan AC" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Grafik DC */}
            <div className="p-5 border border-gray-200 rounded-lg bg-white shadow-sm">
              <h2 className="text-base font-bold mb-4 text-gray-800">Fluktuasi Tegangan DC 48V (Battery/Bus)</h2>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={40} />
                    <YAxis domain={[40, 60]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <ReferenceLine y={54} stroke="red" strokeDasharray="3 3" label={{ value: 'Upper (54V)', fill: 'red', fontSize: 10 }} />
                    <ReferenceLine y={46} stroke="orange" strokeDasharray="3 3" label={{ value: 'Lower (46V)', fill: 'orange', fontSize: 10 }} />
                    <Line type="monotone" dataKey="dc" stroke="#16a34a" name="Tegangan DC" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabel Anomali */}
            <div className="p-5 border border-red-200 rounded-lg bg-white shadow-sm">
              <h2 className="text-base font-bold mb-4 text-red-600">Catatan Historikal Anomali ({anomalies.length} Kejadian)</h2>
              <div className="overflow-x-auto max-h-80">
                <table className="min-w-full text-xs text-left border">
                  <thead className="bg-gray-100 border-b sticky top-0">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Timestamp Kejadian</th>
                      <th className="px-4 py-2 font-semibold">Tipe Sumber</th>
                      <th className="px-4 py-2 font-semibold">Status / Analisa</th>
                      <th className="px-4 py-2 font-semibold">Tegangan Tercatat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.map((anom, idx) => (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 whitespace-nowrap">{anom.time}</td>
                        <td className="px-4 py-2 font-medium">{anom.type}</td>
                        <td className="px-4 py-2 text-red-600 font-bold">{anom.status}</td>
                        <td className="px-4 py-2 font-mono">{anom.val} Volt</td>
                      </tr>
                    ))}
                    {anomalies.length === 0 && (
                      <tr>
                        <td colSpan="4" className="px-4 py-6 text-center text-gray-500">Kondisi kelistrikan normal. Tidak ada anomali terdeteksi pada dataset ini.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-gray-400 border-2 border-dashed rounded-lg bg-gray-50">
            <p className="text-sm font-medium">Silakan pilih file log CSV/Excel rectifier Anda di tombol atas untuk memuat grafik dan analisa anomali.</p>
          </div>
        )}
      </div>
    </div>
  );
}
