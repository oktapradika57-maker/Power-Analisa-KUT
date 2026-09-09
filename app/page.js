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

  // Load history data dari Local Storage
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('power_logs_history')) || [];
    setSavedSites(saved);
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataBuffer = new Uint8Array(evt.target.result);
      const wb = XLSX.read(dataBuffer, { type: 'array' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const rawData = XLSX.utils.sheet_to_json(ws, { defval: "" });

      parseAndAnalyzeData(rawData);
    };
    reader.readAsArrayBuffer(file);
  };

  const parseAndAnalyzeData = (rawData) => {
    if (!rawData || rawData.length === 0) {
      alert("File kosong atau format tidak dikenali.");
      return;
    }

    const findColumn = (rowObj, possibleKeys) => {
      const keys = Object.keys(rowObj);
      const matchedKey = keys.find(k => {
        const normalized = k.toLowerCase().replace(/\s+/g, '');
        return possibleKeys.some(pk => normalized.includes(pk));
      });
      return matchedKey;
    };

    const parsedData = rawData.map(row => {
      const timeCol = findColumn(row, ['time', 'datetime', 'waktu', 'tanggal']);
      const timeVal = timeCol ? row[timeCol] : '-';

      const acCol = findColumn(row, ['acvoltage-1', 'smrinputvoltage', 'acvoltage', 'teganganac']);
      const acVal = acCol ? parseFloat(row[acCol]) : null;

      const dcCol = findColumn(row, ['dcvoltage', 'smroutputvoltage', 'busvoltage', 'tegangandc']);
      const dcVal = dcCol ? parseFloat(row[dcCol]) : null;

      return {
        time: timeVal,
        ac: isNaN(acVal) || acVal === null ? 0 : acVal,
        dc: isNaN(dcVal) || dcVal === null ? 0 : dcVal
      };
    }).filter(r => r.time !== '-' && r.time !== "");

    setData(parsedData);
    calculateAnomalies(parsedData);
  };

  const calculateAnomalies = (dataset) => {
    const found = [];
    dataset.forEach(row => {
      if (row.ac > 0 && (row.ac < 200 || row.ac > 240)) {
        found.push({ time: row.time, type: 'AC Mains', val: row.ac, status: row.ac < 200 ? 'Drop' : 'Overvoltage' });
      }
      if (row.dc > 0 && (row.dc < 46 || row.dc > 54)) {
        found.push({ time: row.time, type: 'DC Rectifier', val: row.dc, status: row.dc < 46 ? 'Drop' : 'Overvoltage' });
      }
    });
    setAnomalies(found);
  };

  const handleSave = () => {
    if (!siteId || !siteName || data.length === 0) {
      alert("Lengkapi Site ID, Site Name, dan pastikan file sudah ter-upload/terbaca!");
      return;
    }
    const newRecord = { id: Date.now().toString(), siteId, siteName, data, anomalies };
    const updated = [...savedSites, newRecord];
    
    setSavedSites(updated);
    localStorage.setItem('power_logs_history', JSON.stringify(updated));
    alert(`Sukses! Data Historikal Site ${siteName} berhasil disimpan.`);
  };

  const handleSelectSite = (e) => {
    const id = e.target.value;
    setSelectedSite(id);
    if (id === "") {
      setData([]); setAnomalies([]); setSiteId(''); setSiteName('');
      return;
    }
    const selected = savedSites.find(s => s.id === id);
    if (selected) {
      setSiteId(selected.siteId);
      setSiteName(selected.siteName);
      setData(selected.data);
      setAnomalies(selected.anomalies);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans text-gray-800">
      <div className="max-w-7xl mx-auto bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h1 className="text-2xl font-bold mb-6 text-blue-900">Dashboard Analisa Power Multi-Vendor (ZTE & Hariff)</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div>
            <label className="block text-sm font-semibold mb-1">Cari History Site</label>
            <select value={selectedSite} onChange={handleSelectSite} className="block w-full p-2 border border-gray-300 rounded bg-white">
              <option value="">-- Buat / Analisa Data Baru --</option>
              {savedSites.map(site => (
                <option key={site.id} value={site.id}>{site.siteId} - {site.siteName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Site ID</label>
            <input type="text" value={siteId} onChange={e => setSiteId(e.target.value)} className="block w-full p-2 border border-gray-300 rounded" placeholder="Contoh: BJM012" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Site Name</label>
            <input type="text" value={siteName} onChange={e => setSiteName(e.target.value)} className="block w-full p-2 border border-gray-300 rounded" placeholder="Contoh: Banjarbaru Node" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Upload Data (Hariff/ZTE)</label>
            <input type="file" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} className="block w-full p-1 text-sm" />
          </div>
        </div>

        <button onClick={handleSave} className="mb-8 bg-blue-600 text-white font-medium px-5 py-2.5 rounded hover:bg-blue-700 transition">
          Simpan History Analisa
        </button>

        {data.length > 0 && (
          <div className="space-y-8">
            <div className="p-5 border border-gray-200 rounded-lg bg-white shadow-sm">
              <h2 className="text-lg font-bold mb-4 text-gray-700">Fluktuasi Tegangan AC 220V</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" minTickGap={30} />
                    <YAxis domain={[150, 280]} />
                    <Tooltip />
                    <Legend />
                    <ReferenceLine y={240} stroke="red" strokeDasharray="3 3" label="Upper (240V)" />
                    <ReferenceLine y={200} stroke="orange" strokeDasharray="3 3" label="Lower (200V)" />
                    <Line type="monotone" dataKey="ac" stroke="#2563eb" name="Tegangan AC" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-5 border border-gray-200 rounded-lg bg-white shadow-sm">
              <h2 className="text-lg font-bold mb-4 text-gray-700">Fluktuasi Tegangan DC 48V (Battery/Bus)</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" minTickGap={30} />
                    <YAxis domain={[40, 60]} />
                    <Tooltip />
                    <Legend />
                    <ReferenceLine y={54} stroke="red" strokeDasharray="3 3" label="Upper (54V)" />
                    <ReferenceLine y={46} stroke="orange" strokeDasharray="3 3" label="Lower (46V)" />
                    <Line type="monotone" dataKey="dc" stroke="#16a34a" name="Tegangan DC" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-5 border border-red-200 rounded-lg bg-white shadow-sm">
              <h2 className="text-lg font-bold mb-4 text-red-600">Catatan Historikal Anomali ({anomalies.length} Kejadian)</h2>
              <div className="overflow-x-auto max-h-96">
                <table className="min-w-full text-sm text-left border">
                  <thead className="bg-gray-100 border-b sticky top-0">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Timestamp Kejadian</th>
                      <th className="px-4 py-3 font-semibold">Tipe Sumber</th>
                      <th className="px-4 py-3 font-semibold">Status / Analisa</th>
                      <th className="px-4 py-3 font-semibold">Tegangan Tercatat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.map((anom, idx) => (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">{anom.time}</td>
                        <td className="px-4 py-3 font-medium">{anom.type}</td>
                        <td className="px-4 py-3 text-red-500 font-bold">{anom.status}</td>
                        <td className="px-4 py-3 font-mono">{anom.val} Volt</td>
                      </tr>
                    ))}
                    {anomalies.length === 0 && (
                      <tr>
                        <td colSpan="4" className="px-4 py-8 text-center text-gray-500">Kondisi normal. Sistem tidak mendeteksi log anomali.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
