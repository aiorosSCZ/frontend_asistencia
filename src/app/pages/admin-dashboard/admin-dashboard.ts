import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { API_URL } from '../../config/api.config';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css'
})
export class AdminDashboard implements OnInit {
  adminName: string = 'Administrador';
  currentTab: string = 'dashboard';
  stats: any = {
    clientes: 0,
    talleres: 0,
    incidentes: 0,
    especialidades: 0,
    total_recaudado: 0.0,
    ganancia_plataforma: 0.0
  };
  talleres: any[] = [];
  clientes: any[] = [];
  incidentes: any[] = [];
  historialAcciones: any[] = [];

  backups: any[] = [];
  currentDate: Date = new Date();
  
  // Métricas de Registros (SuperAdmin)
  registrosTimeline: any[] = [];
  totalTalleresRegistrados: number = 0;
  totalConductoresRegistrados: number = 0;
  registrationsChartInstance: any = null;

  get talleresPendientes() {
    return this.talleres.filter(t => t.estado_aprobacion === 'Pendiente').length;
  }

  get talleresAprobados() {
    return this.talleres.filter(t => t.estado_aprobacion === 'Aprobado').length;
  }

  constructor(private router: Router, private cdr: ChangeDetectorRef) { }

  ngOnInit() {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      this.router.navigate(['/admin-login']);
      return;
    }
    this.adminName = localStorage.getItem('admin_name') || 'SuperAdmin';
    this.loadMetrics();
    this.loadBitacora();
  }

  changeTab(tab: string) {
    this.currentTab = tab;
    this.cdr.detectChanges();
    
    // Si volvemos al dashboard, debemos recrear el canvas y el div del mapa
    // ya que Angular los destruyó al cambiar de pestaña
    if (tab === 'dashboard') {
      setTimeout(() => {
        if (this.mapInstance) {
          this.mapInstance.remove();
          this.mapInstance = null;
        }
        if (this.chartInstance) {
          this.chartInstance.destroy();
          this.chartInstance = null;
        }

        if (this.registrationsChartInstance) {
          this.registrationsChartInstance.destroy();
          this.registrationsChartInstance = null;
        }
        this.renderChart();
      }, 50);
    } else if (tab === 'backups') {
      this.loadBackups();
    }
  }

  async generarBackupManual() {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${API_URL}/admin/backups/manual`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition');
        let filename = 'backup_manual.sql';
        if (disposition && disposition.indexOf('attachment') !== -1) {
          const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
          const matches = filenameRegex.exec(disposition);
          if (matches != null && matches[1]) { 
            filename = matches[1].replace(/['"]/g, '');
          }
        }
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        
        alert('✅ Copia de seguridad generada y descargada.');
        this.loadBackups();
      } else {
        alert('❌ Error al generar el backup manual.');
      }
    } catch (e) {
      console.error(e);
      alert('❌ Error de conexión al generar backup.');
    }
  }

  async loadBackups() {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${API_URL}/admin/backups/historial`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        this.backups = await response.json();
        this.cdr.detectChanges();
      }
    } catch (e) {
      console.error('Error cargando historial de backups:', e);
    }
  }

  async descargarBackup(filename: string) {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${API_URL}/admin/backups/descargar/${filename}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      } else {
        alert('❌ Error al descargar el backup.');
      }
    } catch (e) {
      console.error(e);
      alert('❌ Error de conexión al descargar.');
    }
  }


  kpiData: any = {
    avg_asignacion_minutos: 0,
    avg_llegada_minutos: 0,
    incidentes_por_tipo: [],
    talleres_eficientes: [],
    casos_cancelados: 0,
    sla_cumplimiento_pct: 100,
    heatmap: [],
    incidentes_por_fecha: []
  };
  
  chartInstance: any = null;

  
  // Variables de filtros avanzados
  filtroTipo: string = 'mes';
  filtroFecha: string = new Date().toISOString().split('T')[0];
  filtroMes: number = new Date().getMonth() + 1;
  filtroAnio: number = new Date().getFullYear();
  filtroMesInicio: number = 1;
  filtroMesFin: number = new Date().getMonth() + 1;
  filtroFechaInicio: string = new Date().toISOString().split('T')[0];
  filtroFechaFin: string = new Date().toISOString().split('T')[0];

  filterType: string = 'mes';
  filterValue: string = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  selectedTaller: string = '';

  async onFilterChange() {
    if (this.filtroTipo === 'hoy') {
      this.filterType = 'dia';
      this.filterValue = new Date().toISOString().split('T')[0];
    } else if (this.filtroTipo === 'dia_especifico') {
      this.filterType = 'dia';
      this.filterValue = this.filtroFecha;
    } else if (this.filtroTipo === 'mes') {
      this.filterType = 'mes';
      const mesStr = String(this.filtroMes).padStart(2, '0');
      this.filterValue = `${this.filtroAnio}-${mesStr}`;
    } else if (this.filtroTipo === 'rango_meses') {
      this.filterType = 'rango_meses';
      const mesInicioStr = String(this.filtroMesInicio).padStart(2, '0');
      const mesFinStr = String(this.filtroMesFin).padStart(2, '0');
      this.filterValue = `${this.filtroAnio}-${mesInicioStr}:${this.filtroAnio}-${mesFinStr}`;
    } else if (this.filtroTipo === 'anio') {
      this.filterType = 'anual';
      this.filterValue = String(this.filtroAnio);
    } else if (this.filtroTipo === 'rango_fechas') {
      this.filterType = 'rango_fechas';
      this.filterValue = `${this.filtroFechaInicio}:${this.filtroFechaFin}`;
    } else { // historico
      this.filterType = 'historico';
      this.filterValue = '';
    }

    await this.loadMetrics();
  }

  async loadMetrics() {
    try {
      const token = localStorage.getItem('admin_token');
      let url = `${API_URL}/admin/metrics?filter_type=${this.filterType}&filter_value=${this.filterValue}`;
      if (this.selectedTaller) url += `&taller_id=${this.selectedTaller}`;
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        this.stats = data.stats;
        this.talleres = data.talleres;
        this.clientes = data.clientes;
        this.incidentes = data.incidentes;
        
        await this.loadKpis(); // Load new KPIs
        this.cdr.detectChanges();
      }
    } catch (e) {
      console.error('Error cargando métricas maestras:', e);
    }
  }

  async loadKpis() {
    try {
      const token = localStorage.getItem('admin_token');
      let url = `${API_URL}/admin/kpis?filter_type=${this.filterType}&filter_value=${this.filterValue}`;
      if (this.selectedTaller) url += `&taller_id=${this.selectedTaller}`;
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        this.kpiData = await response.json();
        this.registrosTimeline = this.kpiData.registros_timeline || [];
        this.totalTalleresRegistrados = this.kpiData.total_talleres_registrados || 0;
        this.totalConductoresRegistrados = this.kpiData.total_conductores_registrados || 0;
        this.renderChart();
      }
    } catch (e) {
      console.error('Error cargando KPIs:', e);
    }
  }

  renderChart() {
    import('chart.js/auto').then((ChartModule) => {
      const Chart = ChartModule.default || ChartModule.Chart;
      const canvas = document.getElementById('incidentsPieChart') as HTMLCanvasElement;
      if (!canvas) return;
      
      if (this.chartInstance) {
        this.chartInstance.destroy();
      }

      const labels = this.kpiData.incidentes_por_tipo.map((i: any) => i.tipo);
      const data = this.kpiData.incidentes_por_tipo.map((i: any) => i.count);

      this.chartInstance = new Chart(canvas, {
        type: 'pie',
        data: {
          labels: labels.length > 0 ? labels : ['Sin Datos'],
          datasets: [{
            data: data.length > 0 ? data : [1],
            backgroundColor: ['#EF4444', '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#94A3B8' } }
          }
        }
      });
      

      this.renderRegistrationsChart(Chart);
    });

    this.renderMap();
  }



  renderRegistrationsChart(ChartClass: any) {
    const canvas = document.getElementById('registrationsChart') as HTMLCanvasElement;
    if (!canvas) return;

    if (this.registrationsChartInstance) {
      this.registrationsChartInstance.destroy();
    }

    const arr = this.registrosTimeline || [];
    const labels = arr.map((i: any) => i.periodo);
    const workshopsData = arr.map((i: any) => i.talleres);
    const clientsData = arr.map((i: any) => i.clientes);

    this.registrationsChartInstance = new ChartClass(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Talleres Registrados',
            data: workshopsData,
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            borderWidth: 2.5,
            tension: 0.3,
            fill: true
          },
          {
            label: 'Conductores Registrados',
            data: clientsData,
            borderColor: '#F43F5E',
            backgroundColor: 'rgba(244, 63, 94, 0.1)',
            borderWidth: 2.5,
            tension: 0.3,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { 
            beginAtZero: true, 
            grid: { color: 'rgba(255,255,255,0.05)' }, 
            ticks: { stepSize: 1, color: '#94A3B8' } 
          },
          x: { 
            grid: { display: false },
            ticks: { color: '#94A3B8' }
          }
        },
        plugins: {
          legend: { 
            position: 'top',
            labels: { color: '#94A3B8', font: { family: 'Inter', weight: '600' } }
          }
        }
      }
    });
  }

  mapInstance: any = null;

  renderMap() {
    setTimeout(() => {
      import('leaflet').then(async (LeafletModule) => {
        const L = LeafletModule.default || LeafletModule;
        (window as any).L = L;
        await import('leaflet.heat');
        const mapElement = document.getElementById('incidentsMap');
        if (!mapElement) return;

        if (!this.mapInstance) {
        // Centro en Santa Cruz de la Sierra por defecto
        this.mapInstance = L.map('incidentsMap').setView([-17.7833, -63.1821], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(this.mapInstance);
      }

      // Limpiar marcadores/heatmaps anteriores
      this.mapInstance.eachLayer((layer: any) => {
        if (layer instanceof L.CircleMarker || layer instanceof L.Circle || (layer as any)._heat) {
          this.mapInstance.removeLayer(layer);
        }
      });

      // Crear marcadores interactivos
      const zonas = this.kpiData.heatmap || [];
      let latSum = 0, lngSum = 0, countCoords = 0;

      // 1. Dibujar Mapa de Calor (Heatmap) si hay incidentes
      if (zonas.length > 0) {
        const heatPoints = zonas.map((z: any) => [z.lat, z.lng, 1.0]);
        
        // Inicializar el HeatLayer de Leaflet.heat
        const heatLayer = (L as any).heatLayer(heatPoints, {
          radius: 30,
          blur: 15,
          maxZoom: 15,
          gradient: {
            0.2: '#00FF66', // Verde para baja frecuencia
            0.5: '#FFFF00', // Amarillo para media frecuencia
            0.8: '#FF9900', // Naranja
            1.0: '#FF0055'  // Rojo para alta frecuencia/hotspots
          }
        }).addTo(this.mapInstance);

        // Calcular el centro de masa de todas las incidencias
        let incLatSum = 0, incLngSum = 0;
        zonas.forEach((p: any) => {
          incLatSum += p.lat;
          incLngSum += p.lng;
        });
        const avgLat = incLatSum / zonas.length;
        const avgLng = incLngSum / zonas.length;

        // Dibujar el área circular de mayor concentración de incidencias (Radio de 2 km)
        const densityArea = L.circle([avgLat, avgLng], {
          radius: 2000, // 2 km
          color: '#FF0055',
          fillColor: '#FF0055',
          fillOpacity: 0.1,
          weight: 1.5,
          dashArray: '5, 8'
        }).addTo(this.mapInstance);

        densityArea.bindTooltip(
          `<div style="font-family: 'Inter', sans-serif; font-size: 13px; font-weight: bold; color: #FF0055;">
             🎯 Zona de Alta Concentración
           </div>
           <div style="font-family: 'Inter', sans-serif; font-size: 12px; color: #1E293B; margin-top: 3px;">
             Se registran <strong>${zonas.length}</strong> incidentes en esta región.
           </div>`,
          { permanent: true, direction: 'top', className: 'density-area-tooltip' }
        );

        // Dibujar marcadores interactivos de incidentes sobre el mapa de calor
        zonas.forEach((z: any) => {
          let markerColor = "#EF4444"; // Rojo (Pendiente/Peligro)
          if (z.estado === 'Finalizado' || z.estado === 'Completado') markerColor = "#10B981"; // Verde
          if (z.estado === 'En Progreso' || z.estado === 'Asignado' || z.estado === 'En Camino') markerColor = "#F59E0B"; // Naranja

          const marker = L.circleMarker([z.lat, z.lng], {
            radius: 6,
            fillColor: markerColor,
            color: "#FFFFFF",
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.9
          }).addTo(this.mapInstance);

          const tooltipContent = `
            <div style="font-family: 'Inter', sans-serif; min-width: 160px; padding: 4px; line-height: 1.4;">
              <div style="font-weight: 800; color: #1E293B; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; margin-bottom: 6px;">
                🚨 Incidente #${z.id || '?'}
              </div>
              <div style="font-size: 13px; color: #475569; margin-bottom: 3px;">
                <strong>Falla:</strong> ${z.tipo || 'Desconocida'}
              </div>
              <div style="font-size: 13px; color: #475569;">
                <strong>Estado:</strong> <span style="font-weight: bold; color: ${markerColor};">${z.estado || 'No definido'}</span>
              </div>
            </div>
          `;
          
          marker.bindTooltip(tooltipContent, {
            direction: 'top',
            offset: [0, -5],
            opacity: 0.95
          });

          latSum += z.lat;
          lngSum += z.lng;
          countCoords++;
        });
      }

      // 2. Dibujar Talleres Registrados (Tenants)
      const workshopsList = this.talleres || [];
      workshopsList.forEach((t: any) => {
        if (t.lat && t.lng) {
          const marker = L.circleMarker([t.lat, t.lng], {
            radius: 8,
            fillColor: "#3B82F6", // Azul para talleres
            color: "#FFFFFF",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.95
          }).addTo(this.mapInstance);

          const tooltipContent = `
            <div style="font-family: 'Inter', sans-serif; min-width: 150px; padding: 4px;">
              <div style="font-weight: 800; color: #1E293B; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; margin-bottom: 6px;">
                🛠️ Taller: ${t.razon_social}
              </div>
              <div style="font-size: 13px; color: #475569; margin-bottom: 3px;">
                <strong>NIT:</strong> ${t.nit}
              </div>
              <div style="font-size: 13px; color: #475569;">
                <strong>Estado:</strong> ${t.estado_aprobacion}
              </div>
            </div>
          `;
          marker.bindTooltip(tooltipContent, {
            direction: 'top',
            offset: [0, -5],
            opacity: 0.95
          });

          latSum += t.lat;
          lngSum += t.lng;
          countCoords++;
        }
      });

      // Centrar mapa si hay elementos pintados
      if (countCoords > 0) {
        this.mapInstance.setView([latSum / countCoords, lngSum / countCoords], 12);
      } else {
        this.mapInstance.setView([-17.7833, -63.1821], 13);
      }

      // 3. Agregar Leyenda
      const legendId = 'map-legend-box';
      const existingLegend = document.getElementById(legendId);
      if (existingLegend) {
        existingLegend.remove();
      }

      const legend = new (L.Control as any)({ position: 'bottomright' });
      legend.onAdd = () => {
        const div = L.DomUtil.create('div', 'info legend');
        div.id = legendId;
        div.style.background = 'rgba(15, 23, 42, 0.95)';
        div.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        div.style.padding = '10px 14px';
        div.style.borderRadius = '8px';
        div.style.color = '#F8FAFC';
        div.style.fontFamily = "'Inter', sans-serif";
        div.style.fontSize = '12px';
        div.style.lineHeight = '18px';
        div.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.5)';
        
        div.innerHTML = `
          <h4 style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #38BDF8; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">Leyenda</h4>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px; margin-bottom: 4px;">
            <span style="width: 12px; height: 12px; border-radius: 50%; background: #3B82F6; display: inline-block; border: 1px solid #FFF;"></span>
            <span>Taller Registrado</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="width: 12px; height: 12px; border-radius: 50%; background: #EF4444; display: inline-block; border: 1px solid #FFF;"></span>
            <span>Incidente Pendiente</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="width: 12px; height: 12px; border-radius: 50%; background: #F59E0B; display: inline-block; border: 1px solid #FFF;"></span>
            <span>Incidente En Progreso</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="width: 12px; height: 12px; border-radius: 50%; background: #10B981; display: inline-block; border: 1px solid #FFF;"></span>
            <span>Incidente Completado</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="display: inline-block; width: 14px; height: 14px; background: linear-gradient(90deg, #00FF66, #FFFF00, #FF9900, #FF0055); border-radius: 2px;"></span>
            <span>Intensidad de Incidentes</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 14px; height: 14px; border: 1.5px dashed #FF0055; border-radius: 50%; background: rgba(255, 0, 85, 0.1); display: inline-block;"></span>
            <span>Zona Alta Concentración</span>
          </div>
        `;
        return div;
      };
      legend.addTo(this.mapInstance);

      // Asegurar que el mapa calcule su tamaño correctamente
      setTimeout(() => {
        if (this.mapInstance) {
          this.mapInstance.invalidateSize();
        }
      }, 100);
    });
    }, 150); // Fin del setTimeout
  }

  procesandoId: number | null = null;

  async loadBitacora() {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${API_URL}/admin/bitacora`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        this.historialAcciones = await response.json();
      }
    } catch (e) {
      console.error('Error cargando bitácora:', e);
    }
  }

  async aprobarTaller(id: number) {
    if (this.procesandoId) return;
    this.procesandoId = id;
    const adminId = localStorage.getItem('admin_id') || '';
    const token = localStorage.getItem('admin_token');
    try {
      const response = await fetch(`${API_URL}/admin/talleres/${id}/aprobar?admin_id=${adminId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        alert('✅ ¡Taller aprobado exitosamente!');
        this.loadMetrics();
        this.loadBitacora();
      }
    } catch (e) {
      console.error('Error aprobando taller:', e);
      alert('❌ Error al aprobar taller.');
    } finally {
      this.procesandoId = null;
      this.cdr.detectChanges();
    }
  }

  async rechazarTaller(id: number) {
    if (this.procesandoId) return;
    this.procesandoId = id;
    const adminId = localStorage.getItem('admin_id') || '';
    const token = localStorage.getItem('admin_token');
    try {
      const response = await fetch(`${API_URL}/admin/talleres/${id}/rechazar?admin_id=${adminId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        alert('✅ ¡Solicitud de taller rechazada!');
        this.loadMetrics();
        this.loadBitacora();
      }
    } catch (e) {
      console.error('Error rechazando taller:', e);
      alert('❌ Error al rechazar taller.');
    } finally {
      this.procesandoId = null;
      this.cdr.detectChanges();
    }
  }

  exportarPDF() {
    window.print();
  }

  exportarExcel() {
    const fecha = new Date();
    const fechaStr = fecha.toLocaleDateString('es-BO', { year: 'numeric', month: 'long', day: 'numeric' });
    const horaStr = fecha.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
    const user = this.adminName || 'SuperAdmin';

    let excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Control Maestro</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
          .title-row { font-size: 16pt; font-weight: bold; color: #1E40AF; text-align: left; }
          .subtitle-row { font-size: 10pt; color: #475569; font-style: italic; }
          .section-title { font-size: 11pt; font-weight: bold; color: #FFFFFF; background-color: #1E40AF; padding: 6px; }
          .label { font-weight: bold; color: #475569; background-color: #F8FAFC; border: 0.5pt solid #E2E8F0; }
          .value { color: #0F172A; border: 0.5pt solid #E2E8F0; }
          .table-header { background-color: #2563EB; color: #FFFFFF; font-weight: bold; text-align: center; border: 0.5pt solid #1D4ED8; }
          .table-cell { border: 0.5pt solid #CBD5E1; padding: 6px; }
          .currency { text-align: right; }
          .number { text-align: center; }
          .percentage { text-align: center; }
        </style>
      </head>
      <body>
        <table>
          <tr><td colspan="7" class="title-row">ASISCAR - CENTRO DE CONTROL MAESTRO</td></tr>
          <tr><td colspan="7" class="subtitle-row">Informe Global de Operaciones, Facturación y Tenants de la Plataforma</td></tr>
          <tr><td colspan="7"></td></tr>
          <tr><td class="label" style="width: 180px;">Generado por:</td><td colspan="6" class="value">${user} (SuperAdmin)</td></tr>
          <tr><td class="label">Periodo de Filtro:</td><td colspan="6" class="value">${this.filtroTipo.toUpperCase()} (${this.filterValue || 'Todo el Histórico'})</td></tr>
          <tr><td class="label">Fecha de Emisión:</td><td colspan="6" class="value">${fechaStr} a las ${horaStr}</td></tr>
          <tr><td colspan="7"></td></tr>
          
          <!-- SECCIÓN 1: MÉTRICAS GENERALES -->
          <tr><td colspan="7" class="section-title">1. MÉTRICAS GENERALES DE LA PLATAFORMA</td></tr>
          <tr style="height: 25px;">
            <td colspan="4" class="table-header">Indicador Financiero / Operativo</td>
            <td colspan="2" class="table-header">Valor Registrado</td>
            <td class="table-header">Unidad</td>
          </tr>
          <tr>
            <td colspan="4" class="table-cell">Ingresos Totales (Transaccionados)</td>
            <td colspan="2" class="table-cell currency" style="font-weight: bold; color: #1E3A8A;">Bs. ${(this.stats.total_recaudado || 0).toLocaleString('es-BO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="table-cell number">Bs.</td>
          </tr>
          <tr>
            <td colspan="4" class="table-cell">Comisión Plataforma (10%)</td>
            <td colspan="2" class="table-cell currency" style="font-weight: bold; color: #10B981;">Bs. ${(this.stats.ganancia_plataforma || 0).toLocaleString('es-BO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="table-cell number">Bs.</td>
          </tr>
          <tr>
            <td colspan="4" class="table-cell">Talleres Registrados Activos</td>
            <td colspan="2" class="table-cell number" style="font-weight: bold;">${this.stats.talleres || 0}</td>
            <td class="table-cell number">Tenants</td>
          </tr>
          <tr>
            <td colspan="4" class="table-cell">Nuevos Talleres en el período</td>
            <td colspan="2" class="table-cell number">+${this.totalTalleresRegistrados || 0}</td>
            <td class="table-cell number">Talleres</td>
          </tr>
          <tr>
            <td colspan="4" class="table-cell">Conductores Registrados</td>
            <td colspan="2" class="table-cell number" style="font-weight: bold;">${this.stats.clientes || 0}</td>
            <td class="table-cell number">Conductores</td>
          </tr>
          <tr>
            <td colspan="4" class="table-cell">Nuevos Conductores en el período</td>
            <td colspan="2" class="table-cell number">+${this.totalConductoresRegistrados || 0}</td>
            <td class="table-cell number">Conductores</td>
          </tr>
          <tr>
            <td colspan="4" class="table-cell">Incidentes Totales Reportados</td>
            <td colspan="2" class="table-cell number" style="font-weight: bold;">${this.stats.incidentes || 0}</td>
            <td class="table-cell number">Casos</td>
          </tr>
          <tr>
            <td colspan="4" class="table-cell">Tiempo Promedio de Asignación</td>
            <td colspan="2" class="table-cell number">${(this.kpiData.avg_asignacion_minutos || 0).toFixed(2)}</td>
            <td class="table-cell number">Minutos</td>
          </tr>
          <tr>
            <td colspan="4" class="table-cell">Tiempo Promedio de Llegada</td>
            <td colspan="2" class="table-cell number">${(this.kpiData.avg_llegada_minutos || 0).toFixed(2)}</td>
            <td class="table-cell number">Minutos</td>
          </tr>
          <tr>
            <td colspan="4" class="table-cell">Tasa de Cumplimiento SLA</td>
            <td colspan="2" class="table-cell percentage" style="font-weight: bold; color: #10B981;">${(this.kpiData.sla_cumplimiento_pct || 0).toFixed(1)}%</td>
            <td class="table-cell number">%</td>
          </tr>
          <tr>
            <td colspan="4" class="table-cell">Casos Cancelados / Fallidos</td>
            <td colspan="2" class="table-cell number" style="color: #EF4444;">${this.kpiData.casos_cancelados || 0}</td>
            <td class="table-cell number">Casos</td>
          </tr>
          <tr><td colspan="7"></td></tr>

          <!-- SECCIÓN 2: CONTROL Y RENDIMIENTO DE TENANTS -->
          <tr><td colspan="7" class="section-title">2. CONTROL Y RENDIMIENTO DE TENANTS (TALLERES)</td></tr>
          <tr style="height: 25px;">
            <td class="table-header" style="width: 180px;">Taller</td>
            <td class="table-header" style="width: 140px;">Subdominio / Slug</td>
            <td class="table-header" style="width: 70px;">Técnicos</td>
            <td class="table-header" style="width: 80px;">Asistencias</td>
            <td class="table-header" style="width: 80px;">Calificación</td>
            <td class="table-header" style="width: 130px;">Facturación Total</td>
            <td class="table-header" style="width: 130px;">Comisión (10%)</td>
          </tr>
    `;

    if (this.talleres && this.talleres.length > 0) {
      this.talleres.forEach((t: any) => {
        excelHtml += `
          <tr>
            <td class="table-cell" style="font-weight: 600;">${t.razon_social}</td>
            <td class="table-cell" style="font-family: monospace;">${t.subdominio_slug}</td>
            <td class="table-cell number">${t.tecnicos_count || 0}</td>
            <td class="table-cell number" style="font-weight: bold; color: #10B981;">${t.asistencias_count || 0}</td>
            <td class="table-cell number">⭐ ${(t.calificacion_promedio || 0).toFixed(1)}</td>
            <td class="table-cell currency">Bs. ${(t.facturacion_total || 0).toLocaleString('es-BO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="table-cell currency" style="font-weight: bold; color: #1E3A8A;">Bs. ${(t.comision_plataforma || 0).toLocaleString('es-BO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
          </tr>
        `;
      });
    } else {
      excelHtml += `
        <tr>
          <td colspan="7" class="table-cell" style="text-align: center; color: #64748B; font-style: italic;">No hay talleres registrados en este periodo.</td>
        </tr>
      `;
    }

    excelHtml += `
          <tr><td colspan="7"></td></tr>
          
          <!-- SECCIÓN 3: DIRECTORIO DE CONDUCTORES -->
          <tr><td colspan="7" class="section-title">3. DIRECTORIO DE CONDUCTORES REGISTRADOS</td></tr>
          <tr style="height: 25px;">
            <td colspan="2" class="table-header">Código Conductor</td>
            <td colspan="3" class="table-header">Nombres y Apellidos</td>
            <td colspan="2" class="table-header">Correo Electrónico</td>
          </tr>
    `;

    if (this.clientes && this.clientes.length > 0) {
      this.clientes.forEach((c: any) => {
        excelHtml += `
          <tr>
            <td colspan="2" class="table-cell number" style="font-weight: bold;">#CL-${c.id_cliente}</td>
            <td colspan="3" class="table-cell">${c.nombres} ${c.apellidos}</td>
            <td colspan="2" class="table-cell">${c.correo}</td>
          </tr>
        `;
      });
    } else {
      excelHtml += `
        <tr>
          <td colspan="7" class="table-cell" style="text-align: center; color: #64748B; font-style: italic;">No hay conductores registrados en este periodo.</td>
        </tr>
      `;
    }

    excelHtml += `
          <tr><td colspan="7"></td></tr>
          
          <!-- SECCIÓN 4: HISTORIAL GLOBAL DE INCIDENTES -->
          <tr><td colspan="7" class="section-title">4. DETALLE DE INCIDENTES REGISTRADOS EN RUTA</td></tr>
          <tr style="height: 25px;">
            <td colspan="2" class="table-header">Código Incidente</td>
            <td colspan="2" class="table-header">Tipo de Problema / Falla</td>
            <td colspan="2" class="table-header">Nivel de Prioridad</td>
            <td class="table-header">Estado Asistencia</td>
          </tr>
    `;

    if (this.incidentes && this.incidentes.length > 0) {
      this.incidentes.forEach((inc: any) => {
        let statusColor = '#0F172A';
        if (inc.estado_solicitud === 'Completado' || inc.estado_solicitud === 'Finalizado') {
          statusColor = '#10B981';
        } else if (inc.estado_solicitud === 'Cancelado') {
          statusColor = '#EF4444';
        } else if (inc.estado_solicitud === 'En Progreso' || inc.estado_solicitud === 'Asignado' || inc.estado_solicitud === 'En Camino') {
          statusColor = '#F59E0B';
        }
        
        excelHtml += `
          <tr>
            <td colspan="2" class="table-cell number" style="font-weight: bold;">#INC-${inc.id_incidente}</td>
            <td colspan="2" class="table-cell">${inc.tipo_problema}</td>
            <td colspan="2" class="table-cell number">${inc.nivel_prioridad}</td>
            <td class="table-cell number" style="font-weight: bold; color: ${statusColor};">${inc.estado_solicitud}</td>
          </tr>
        `;
      });
    } else {
      excelHtml += `
        <tr>
          <td colspan="7" class="table-cell" style="text-align: center; color: #64748B; font-style: italic;">No hay incidentes registrados en este periodo.</td>
        </tr>
      `;
    }

    excelHtml += `
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    const filename = 'Asiscar_Informe_Maestro_' + fecha.toISOString().split('T')[0] + '.xls';

    if ((navigator as any).msSaveBlob) {
      (navigator as any).msSaveBlob(blob, filename);
    } else {
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  cerrarSesion() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_name');
    localStorage.removeItem('admin_id');
    this.router.navigate(['/admin-login']);
  }
}
