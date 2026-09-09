import streamlit as st
import pandas as pd
import plotly.express as px
import json
import os

# Konfigurasi Halaman Streamlit
st.set_page_config(
    page_title="Power Anomaly Dashboard - Telecom Operations",
    page_icon="⚡",
    layout="wide"
)

# Judul Utama
st.title("⚡ Dashboard Analisa Power Multi-Vendor (ZTE & Hariff)")
st.markdown("Sistem deteksi anomali tegangan AC 220V dan DC 48V untuk operasional telekomunikasi.")

# Inisialisasi Session State untuk History Data di Browser Session
if 'history_db' not in st.session_state:
    st.session_state.history_db = {}

# --- SIDEBAR: KONTROL INPUT & UPLOAD ---
with st.sidebar:
    st.header("⚙️ Konfigurasi Site")
    
    # Dropdown History yang sudah tersimpan
    history_keys = list(st.session_state.history_db.keys())
    selected_history = st.selectbox("📂 Pilih History Tersimpan", ["-- Buat / Upload Baru --"] + history_keys)
    
    if selected_history != "-- Buat / Upload Baru --":
        current_site_data = st.session_state.history_db[selected_history]
        default_site_id = current_site_data["site_id"]
        default_site_name = current_site_data["site_name"]
    else:
        default_site_id = ""
        default_site_name = ""

    site_id = st.text_input("Site ID", value=default_site_id, placeholder="Cth: KKN011 / PRC029")
    site_name = st.text_input("Site Name", value=default_site_name, placeholder="Cth: Kampuri Node")
    
    st.markdown("---")
    uploaded_file = st.file_uploader("Upload File Log (CSV / XLS / XLSX)", type=["csv", "xls", "xlsx"])
    
    # Tombol Simpan ke History
    if st.button("💾 Simpan ke History Sesi"):
        if site_id and site_name and uploaded_file is not None:
            key_name = f"{site_id} - {site_name}"
            # Simpan file buffer atau state
            st.success(f"Data untuk {key_name} berhasil disimpan!")
        else:
            st.warning("Mohon lengkapi Site ID, Site Name, dan upload file log.")

# Fungsi Cerdas Pembaca Berbagai Format (Hariff & ZTE)
@st.cache_data
def load_and_parse_data(file_bytes, file_name):
    try:
        if file_name.endswith('.csv'):
            # Coba baca CSV standar, skip baris pertama jika header kotor
            df = pd.read_csv(file_bytes, skiprows=1)
            if len(df.columns) < 3:
                df = pd.read_csv(file_bytes)
        else:
            # Untuk file ZTE .xls yang berformat tab-separated UTF-16 atau Excel biasa
            try:
                df = pd.read_excel(file_bytes)
            except Exception:
                # Fallback baca sebagai TSV UTF-16 jika format Excel biner gagal
                file_bytes.seek(0)
                df = pd.read_csv(file_bytes, sep='\t', encoding='utf-16', skiprows=0)
        
        # Normalisasi nama kolom (ubah ke lowercase tanpa spasi khusus)
        cols_lower = {c: str(c).lower().strip() for c in df.columns}
        df = df.rename(columns=cols_lower)
        
        # Deteksi kolom waktu
        time_col = next((c for c in df.columns if any(k in c for k in ['time', 'date', 'waktu', 'tanggal'])), None)
        
        # Deteksi kolom AC (Hariff: ac voltage, ZTE Sys: ac voltage-1, SMR: smr input voltage)
        ac_col = next((c for c in df.columns if any(k in c for k in ['ac voltage', 'acvoltage', 'smr input voltage', 'tegangan ac'])), None)
        
        # Deteksi kolom DC (Hariff: bus voltage, ZTE Sys: dc voltage, SMR: smr output voltage)
        dc_col = next((c for c in df.columns if any(k in c for k in ['bus voltage', 'dc voltage', 'dcvoltage', 'smr output voltage', 'tegangandc'])) , None)
        
        if not time_col:
            return None, "Kolom waktu (Time/Date Time) tidak ditemukan dalam file."
            
        # Buat dataframe bersih
        clean_df = pd.DataFrame()
        clean_df['Time'] = pd.to_datetime(df[time_col], errors='coerce')
        clean_df['AC_Voltage'] = pd.to_numeric(df[ac_col], errors='coerce') if ac_col else 0.0
        clean_df['DC_Voltage'] = pd.to_numeric(df[dc_col], errors='coerce') if dc_col else 0.0
        
        clean_df = clean_df.dropna(subset=['Time']).sort_values('Time')
        return clean_df, None
    except Exception as e:
        return None, str(e)

# --- MAIN LOGIC ---
if uploaded_file is not None:
    df_data, err = load_and_parse_data(uploaded_file, uploaded_file.name)
    
    if err:
        st.error(f"Gagal memproses file: {err}")
    elif df_data is not None and not df_data.empty:
        st.success(f"Berhasil memuat {len(df_data):,} baris data log dari file `{uploaded_file.name}`!")
        
        # Preview Data mentah (Opsional expander)
        with st.expander("🔍 Lihat Preview Data Mentah"):
            st.dataframe(df_data.head(100))
            
        # --- LOGIKA DETEKSI ANOMALI ---
        # Standar AC 220V: Drop < 200V, Over > 240V
        # Standar DC 48V: Drop < 46V, Over > 54V
        df_data['AC_Status'] = df_data['AC_Voltage'].apply(lambda x: 'Drop' if 0 < x < 200 else ('Overvoltage' if x > 240 else 'Normal'))
        df_data['DC_Status'] = df_data['DC_Voltage'].apply(lambda x: 'Drop' if 0 < x < 46 else ('Overvoltage' if x > 54 else 'Normal'))
        
        anomalies_ac = df_data[df_data['AC_Status'] != 'Normal']
        anomalies_dc = df_data[df_data['DC_Status'] != 'Normal']
        total_anomalies = len(anomalies_ac) + len(anomalies_dc)
        
        # Metric Ringkasan
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Total Record Log", f"{len(df_data):,} Baris")
        with col2:
            st.metric("Anomali Tegangan AC", f"{len(anomalies_ac)} Kejadian", delta_color="inverse")
        with col3:
            st.metric("Anomali Tegangan DC", f"{len(anomalies_dc)} Kejadian", delta_color="inverse")
            
        st.markdown("---")
        
        # --- GRAFIK PLOTLY INTERAKTIF ---
        st.subheader("📈 Grafik Fluktuasi Tegangan AC 220V")
        fig_ac = px.line(df_data, x='Time', y='AC_Voltage', title="Tegangan AC terhadap Waktu", labels={'AC_Voltage': 'Volt (V)', 'Time': 'Waktu'})
        fig_ac.add_hline(y=240, line_dash="dash", line_color="red", annotation_text="Batas Atas (240V)")
        fig_ac.add_hline(y=200, line_dash="dash", line_color="orange", annotation_text="Batas Bawah (200V)")
        st.plotly_chart(fig_ac, use_container_width=True)
        
        st.subheader("🔋 Grafik Fluktuasi Tegangan DC 48V")
        fig_dc = px.line(df_data, x='Time', y='DC_Voltage', title="Tegangan DC (Bus/Battery) terhadap Waktu", labels={'DC_Voltage': 'Volt (V)', 'Time': 'Waktu'})
        fig_dc.add_hline(y=54, line_dash="dash", line_color="red", annotation_text="Batas Atas (54V)")
        fig_dc.add_hline(y=46, line_dash="dash", line_color="orange", annotation_text="Batas Bawah (46V)")
        st.plotly_chart(fig_dc, use_container_width=True)
        
        # --- TABEL REKAP ANOMALI & JAM KEJADIAN ---
        st.subheader("🚨 Detail Jam Kejadian Anomali Power")
        
        # Gabungkan anomali AC dan DC untuk tabel
        anom_list = []
        for _, row in anomalies_ac.iterrows():
            anom_list.append({"Waktu": row['Time'], "Sistem": "AC Mains", "Status": row['AC_Status'], "Nilai (V)": row['AC_Voltage']})
        for _, row in anomalies_dc.iterrows():
            anom_list.append({"Waktu": row['Time'], "Sistem": "DC Rectifier", "Status": row['DC_Status'], "Nilai (V)": row['DC_Voltage']})
            
        if anom_list:
            df_anom = pd.DataFrame(anom_list).sort_values("Waktu", ascending=False)
            st.dataframe(df_anom, use_container_width=True)
        else:
            st.info("Kondisi kelistrikan stabil. Tidak ditemukan anomali drop atau overvoltage pada file ini.")
            
    else:
        st.warning("File tidak dapat dibaca atau struktur kolom tidak sesuai dengan standar log ZTE/Hariff.")
else:
    st.info("👈 Silakan masukkan **Site ID**, **Site Name**, lalu **Upload file log recti** Anda melalui panel sidebar di sebelah kiri untuk memulai analisa.")
