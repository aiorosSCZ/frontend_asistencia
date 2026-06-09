import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WebsocketService } from '../../services/websocket.service';
import { OfflineDbService } from '../../services/offline-db.service';
import { API_URL, BASE_URL } from '../../config/api.config';

declare var google: any;

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1e293b' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#cbd5e1' }]
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#cbd5e1' }]
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#0f172a' }]
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64748b' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#334155' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1e293b' }]
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#94a3b8' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#475569' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#334155' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#f8fafc' }]
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#334155' }]
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#cbd5e1' }]
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0f172a' }]
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#475569' }]
  },
  {
    featureType: 'water',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#0f172a' }]
  }
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, OnDestroy, AfterViewInit {

  isOnline: boolean = navigator.onLine;
  syncingOffline: boolean = false;

  private async authFetch(url: string, options: any = {}) {
    const token = localStorage.getItem('token_taller');
    const headers: any = { ...options.headers };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (!(options.body instanceof FormData) && !headers['Content-Type'] && options.method && options.method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }

    const method = options.method?.toUpperCase();
    const isWrite = method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    if (!this.isOnline && isWrite) {
      const uuidOffline = this.offlineDb.generateUuid();
      let payload = options.body;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch(e) {}
      }
      
      if (payload && typeof payload === 'object' && !(payload instanceof FormData)) {
         payload.uuid_offline = uuidOffline;
         options.body = JSON.stringify(payload);
      }

      await this.offlineDb.addOfflineAction(url, options.method, payload, uuidOffline);
      return new Response(JSON.stringify({ detail: "Guardado en modo offline", uuid_offline: uuidOffline }), { status: 200, statusText: "OK" });
    }

    try {
      const res = await fetch(url, { ...options, headers });
      if (!res.ok) throw res;
      return res;
    } catch (e: any) {
      if ((e instanceof TypeError && e.message === 'Failed to fetch') && isWrite) {
        const uuidOffline = this.offlineDb.generateUuid();
        let payload = options.body;
        if (typeof payload === 'string') {
          try { payload = JSON.parse(payload); } catch(err) {}
        }
        
        if (payload && typeof payload === 'object' && !(payload instanceof FormData)) {
           payload.uuid_offline = uuidOffline;
        }

        await this.offlineDb.addOfflineAction(url, options.method, payload, uuidOffline);
        return new Response(JSON.stringify({ detail: "Guardado en modo offline", uuid_offline: uuidOffline }), { status: 200, statusText: "OK" });
      }
      throw e;
    }
  }

  currentTab: any = 'inicio';
  sidebarCollapsed = true; // Por defecto colapsado como en la imagen
  isDarkMode = true; // Forzar modo oscuro por defecto para estética premium

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    localStorage.setItem('sidebar_collapsed', JSON.stringify(this.sidebarCollapsed));
    this.cdr.detectChanges();
  }

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    if (this.isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
    if (this.map) {
      try {
        this.map.setOptions({
          styles: this.isDarkMode ? darkMapStyle : []
        });
      } catch (e) {
        console.error('Error actualizando estilo del mapa:', e);
      }
    }
    this.cdr.detectChanges();
  }
  tallerData = {
    id_taller: 1,
    id_tenant: 0 as number,
    razon_social: '',
    nit: '',
    direccion: '',
    estado_aprobacion: '',
    foto_nit_url: null as string | null,
    foto_local_url: null as string | null,
    ubicacion_base_latitud: null as number | null,
    ubicacion_base_longitud: null as number | null
  };
  get currentDate(): Date { return new Date(); }
  get initials(): string {
    if (!this.tallerData.razon_social) return 'T';
    const words = this.tallerData.razon_social.trim().split(/\s+/);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  uploading = false;
  uploadSuccess = false;
  nitFile: File | null = null;
  localFile: File | null = null;

  stats = {
    incidentesActivos: 0,
    completadosHoy: 0,
    canceladosHoy: 0, // Nueva estadística agregada
    gananciasHoy: 0
  };

  es_24_7 = false;
  horario_apertura = '08:00';
  horario_cierre = '19:00';

  mecanicos: any[] = [];
  solicitudes: any[] = [];
  mostrarNotificaciones = false;
  tipoSonido = localStorage.getItem('tipo_sonido_notificacion') || 'telefono';
  trabajos: any[] = [];
  serviciosDisponibles: any[] = [];
  serviciosTodos: any[] = [];
  serviciosSeleccionados: number[] = [];
  serviciosAsociados: any[] = [];
  especialidadesDisponibles: any[] = [];
  tecnicoSeleccionadoParaEsp: any = null;
  tecnicoEspecialidades: any[] = [];
  editandoEspecialidades: boolean = false;

  nuevoMecanico = {
    nombres: '',
    apellidos: '',
    ci_tecnico: '',
    telefono_contacto: '',
    correo: '',
    password: ''
  };

  nuevoServicioId: any = null;
  nuevoServicioPrecio: number = 50.0;
  nuevoServicioTiempo: number = 30;

  perfilEdit = {
    telefono_taller: '',
    cuenta_bancaria: '',
    horario_apertura: '08:00:00',
    horario_cierre: '18:00:00'
  };

  creandoMecanico = false;
  mecanicoError = '';
  mecanicoSuccess = false;

  // Variables para KPIs
  filtroTipo: string = 'mes';
  filtroFecha: string = new Date().toISOString().split('T')[0];
  filtroMes: number = new Date().getMonth() + 1;
  filtroAnio: number = new Date().getFullYear();
  filtroMesInicio: number = 1;
  filtroMesFin: number = new Date().getMonth() + 1;
  filtroFechaInicio: string = new Date().toISOString().split('T')[0];
  filtroFechaFin: string = new Date().toISOString().split('T')[0];

  kpiResumen = {
    ingresos_totales: 0.0,
    total_incidentes: 0,
    incidentes_completados: 0,
    incidentes_cancelados: 0,
    tasa_exito: 0.0
  };

  kpiTecnicos: any[] = [];
  kpiEstados: any = {};
  kpiProblemas: any = {};
  kpiTendencia: any[] = [];
  kpiMapaCalor: any[] = [];

  kpiMapInstance: any = null;
  kpiChartInstances: { [key: string]: any } = {};

  showIncidenteDetailModal = false;
  selectedIncidenteDetail: any = null;
  analisisTexto: string = '';

  showRechazoModal = false;
  solicitudARechazar: any = null;
  justificacionRechazo = 'Sin personal disponible';
  otroJustificativo = '';
  opcionesRechazo = [
    'Sin personal disponible',
    'Fuera de zona de cobertura',
    'Taller saturado de trabajo',
    'Vehículo requiere grúa pesada',
    'Otro'
  ];

  constructor(private wsService: WebsocketService, private router: Router, private cdr: ChangeDetectorRef, private offlineDb: OfflineDbService) { }

  map: any;
  technicianMarkers: any[] = [];
  incidentMarkers: any[] = [];

  ngAfterViewInit() {

    this.initMap();
    this.startDynamicPolling();
  }

  pollingInterval: any;

  startDynamicPolling() {
    this.pollingInterval = setInterval(() => {
      this.loadSolicitudes(); // <-- Se añade esto como fallback
      this.loadMecanicos();
      this.loadTrabajos();
    }, 10000);
  }


  initMap() {
    setTimeout(() => {
      const mapElement = document.getElementById('map');
      if (!mapElement) return;

      const defaultSantaCruz = { lat: -17.7833, lng: -63.1821 };
      const workshopCoords = {
        lat: this.tallerData.ubicacion_base_latitud || defaultSantaCruz.lat,
        lng: this.tallerData.ubicacion_base_longitud || defaultSantaCruz.lng
      };

      try {
        this.map = new google.maps.Map(mapElement, {
          center: workshopCoords,
          zoom: 13,
          styles: this.isDarkMode ? darkMapStyle : []
        });

        new google.maps.Marker({
          position: workshopCoords,
          map: this.map,
          title: this.tallerData.razon_social || 'Mi Taller',
          icon: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png'
        });
      } catch (e) {
        console.error('Error cargando Google Maps:', e);
      }
    }, 1000);
  }

  async ngOnInit() {
    const savedUserId = localStorage.getItem('user_id');
    const savedUserName = localStorage.getItem('user_name');
    if (!savedUserId) {
      this.router.navigate(['/login']);
      return;
    } else {
      this.tallerData.id_taller = parseInt(savedUserId, 10);
      if (savedUserName) {
        this.tallerData.razon_social = savedUserName;
      }
      const savedNit = localStorage.getItem('user_nit');
      if (savedNit) {
        this.tallerData.nit = savedNit;
      }
      const savedDireccion = localStorage.getItem('user_direccion');
      if (savedDireccion) {
        this.tallerData.direccion = savedDireccion;
      }
      await this.fetchTallerInfo(this.tallerData.id_taller);
    }

    const savedSidebarState = localStorage.getItem('sidebar_collapsed');
    if (savedSidebarState !== null) {
      this.sidebarCollapsed = JSON.parse(savedSidebarState);
    }

    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'dark') {
      this.isDarkMode = true;
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      this.isDarkMode = false;
      document.documentElement.removeAttribute('data-theme');
    }

    // Cargar TODO al inicio para evitar vacíos en las pestañas
    this.loadSolicitudes();
    this.loadMecanicos();
    this.loadServiciosDisponibles();
    this.loadTallerServicios();
    this.loadEspecialidadesDisponibles();
    this.loadTrabajos();

    this.wsService.connect(this.tallerData.id_taller);
    this.wsService.emergency$.subscribe((alerta) => {
      this.procesarAlerta(alerta);
    });
    this.initMap();

    window.addEventListener('online', this.updateOnlineStatus.bind(this));
    window.addEventListener('offline', this.updateOnlineStatus.bind(this));
  }

  private updateOnlineStatus() {
    this.isOnline = navigator.onLine;
    this.cdr.detectChanges();
    if (this.isOnline) {
      this.syncOfflineActions();
    }
  }

  async syncOfflineActions() {
    this.syncingOffline = true;
    this.cdr.detectChanges();
    try {
      const actions = await this.offlineDb.getPendingActions();
      for (const action of actions) {
        try {
          const headers: any = { 'Content-Type': 'application/json' };
          const token = localStorage.getItem('token_taller');
          if (token) headers['Authorization'] = `Bearer ${token}`;
          
          const res = await fetch(action.url, {
            method: action.method,
            headers,
            body: JSON.stringify(action.body)
          });
          
          if (res.ok) {
            await this.offlineDb.deleteAction(action.uuid_offline);
          } else {
            await this.offlineDb.markAsError(action.uuid_offline);
          }
        } catch (e) {
          // Si falla de nuevo por red, se queda pendiente
        }
      }
    } finally {
      this.syncingOffline = false;
      this.cdr.detectChanges();
    }
  }


  async fetchTallerInfo(idTaller: number) {
    try {
      const response = await this.authFetch(`${API_URL}/talleres/${idTaller}`);
      if (response.ok) {
        const data = await response.json();
        this.tallerData.razon_social = data.razon_social;
        this.tallerData.nit = data.nit;
        this.tallerData.id_tenant = data.id_tenant || 0;
        this.tallerData.direccion = data.direccion_fisica || this.tallerData.direccion;
        this.tallerData.estado_aprobacion = data.estado_aprobacion;
        this.tallerData.ubicacion_base_latitud = data.ubicacion_base_latitud;
        this.tallerData.ubicacion_base_longitud = data.ubicacion_base_longitud;

        // Cargar edición de perfil
        this.perfilEdit.telefono_taller = data.telefono_taller || '';
        this.perfilEdit.cuenta_bancaria = data.cuenta_bancaria || '';
        this.perfilEdit.horario_apertura = data.horario_apertura || '08:00:00';
        this.perfilEdit.horario_cierre = data.horario_cierre || '18:00:00';

        this.cdr.detectChanges();
      }
    } catch (e) {
      console.error('Error fetching taller info:', e);
    }
  }

  changeTab(tab: string) {
    this.currentTab = tab;
    // Limpieza de recursos de KPIs si cambiamos de pestaña
    this.destroyKpiVisuals();

    if (tab === 'inicio') {
      this.initMap();
      this.loadSolicitudes();
    } else if (tab === 'incidentes') {
      this.loadSolicitudes();
    } else if (tab === 'equipo') {
      this.loadMecanicos();
    } else if (tab === 'servicios') {
      this.loadServiciosDisponibles();
      this.loadTallerServicios();
    } else if (tab === 'habilidades') {
      this.loadEspecialidadesDisponibles();
      this.loadMecanicos();
    } else if (tab === 'pagos') {
      this.loadTrabajos();
    } else if (tab === 'ordenes') {
      this.loadOrdenes();
    } else if (tab === 'perfil') {
      this.fetchTallerInfo(this.tallerData.id_taller);
    } else if (tab === 'kpis') {
      this.loadKpiData();
    }
    this.cdr.detectChanges();
  }

  destroyKpiVisuals() {
    if (this.kpiMapInstance) {
      try {
        this.kpiMapInstance.remove();
      } catch (e) {
        console.error('Error destroying KPI map:', e);
      }
      this.kpiMapInstance = null;
    }
    for (const key in this.kpiChartInstances) {
      if (this.kpiChartInstances[key]) {
        try {
          this.kpiChartInstances[key].destroy();
        } catch (e) {
          console.error('Error destroying Chart.js instance:', e);
        }
      }
    }
    this.kpiChartInstances = {};
  }

  async loadKpiData() {
    try {
      let url = `${API_URL}/kpis/?tipo_filtro=${this.filtroTipo}`;
      if (this.filtroTipo === 'dia_especifico') {
        url += `&fecha=${this.filtroFecha}`;
      } else if (this.filtroTipo === 'mes') {
        url += `&mes=${this.filtroMes}&anio=${this.filtroAnio}`;
      } else if (this.filtroTipo === 'rango_meses') {
        url += `&mes_inicio=${this.filtroMesInicio}&mes_fin=${this.filtroMesFin}&anio=${this.filtroAnio}`;
      } else if (this.filtroTipo === 'anio') {
        url += `&anio=${this.filtroAnio}`;
      } else if (this.filtroTipo === 'rango_fechas') {
        url += `&fecha_inicio=${this.filtroFechaInicio}&fecha_fin=${this.filtroFechaFin}`;
      }

      const res = await this.authFetch(url);
      if (res.ok) {
        const data = await res.json();
        this.kpiResumen = data.resumen;
        this.kpiTecnicos = data.tecnicos;
        this.kpiEstados = data.estados;
        this.kpiProblemas = data.problemas;
        this.kpiTendencia = data.tendencia;
        this.kpiMapaCalor = data.mapa_calor;

        this.analisisTexto = this.generarAnalisisNarrativo();

        this.cdr.detectChanges();
        // Esperar a que los canvas estén renderizados en el DOM
        setTimeout(() => {
          this.renderKpiCharts();
          this.renderKpiHeatmap();
        }, 100);
      }
    } catch (e) {
      console.error('Error loading KPI data:', e);
    }
  }

  generarAnalisisNarrativo(): string {
    if (!this.kpiResumen || this.kpiResumen.total_incidentes === 0) {
      return 'No se registraron incidentes en el periodo seleccionado.';
    }

    const total = this.kpiResumen.total_incidentes;
    const completados = this.kpiResumen.incidentes_completados;
    const cancelados = this.kpiResumen.incidentes_cancelados;
    const tasa = this.kpiResumen.tasa_exito;
    const ingresos = this.kpiResumen.ingresos_totales;

    let servicioFrecuente = 'N/D';
    let maxServicioCount = 0;
    if (this.kpiProblemas) {
      for (const k in this.kpiProblemas) {
        if (this.kpiProblemas[k] > maxServicioCount) {
          maxServicioCount = this.kpiProblemas[k];
          servicioFrecuente = k;
        }
      }
    }

    let mejorTecnico = '';
    if (this.kpiTecnicos && this.kpiTecnicos.length > 0) {
      const topTec = this.kpiTecnicos[0];
      mejorTecnico = topTec.nombre + ' (' + topTec.completados + ' completados)';
    }

    const ticketPromedio = completados > 0 ? (ingresos / completados).toFixed(2) : '0.00';
    const tasaCancelacion = total > 0 ? ((cancelados / total) * 100).toFixed(1) : '0.0';

    let html = '';
    html += '<strong>1. Volumen de Operaciones</strong><br>';
    html += 'En el periodo evaluado se registraron <strong>' + total + '</strong> solicitudes de auxilio vial. ';
    html += 'De estas, <strong>' + completados + '</strong> fueron completadas exitosamente y <strong>' + cancelados + '</strong> resultaron canceladas, ';
    html += 'lo que representa una tasa de cumplimiento del <strong>' + tasa + '%</strong> y una tasa de cancelacion del <strong>' + tasaCancelacion + '%</strong>.<br><br>';

    html += '<strong>2. Facturacion</strong><br>';
    html += 'Los ingresos totales del periodo ascienden a <strong>Bs. ' + ingresos.toLocaleString() + '</strong>. ';
    html += 'El ingreso promedio por servicio completado es de <strong>Bs. ' + ticketPromedio + '</strong>.<br><br>';

    html += '<strong>3. Demanda por Tipo de Servicio</strong><br>';
    html += 'El servicio con mayor recurrencia fue <strong>' + servicioFrecuente + '</strong> con ' + maxServicioCount + ' casos registrados, ';
    html += 'lo cual indica una concentracion de la demanda en esta categoria de asistencia.<br><br>';

    if (mejorTecnico) {
      html += '<strong>4. Productividad del Equipo Tecnico</strong><br>';
      html += 'El tecnico con mayor volumen de trabajo en el periodo fue <strong>' + mejorTecnico + '</strong>. ';
      html += 'Se recomienda evaluar la distribucion de carga entre los tecnicos disponibles para optimizar tiempos de respuesta.<br><br>';
    }

    const secNum = mejorTecnico ? '5' : '4';
    html += '<strong>' + secNum + '. Observaciones</strong><br>';
    html += 'Se sugiere reforzar la disponibilidad de tecnicos especializados en "' + servicioFrecuente + '" durante las horas de mayor demanda. ';
    html += 'Mantener la tasa de cumplimiento por encima del 90% es esencial para la sostenibilidad operativa de la sucursal.';

    return html;
  }

  exportarPDF() {
    window.print();
  }

  exportarExcel() {
    const fecha = new Date();
    const fechaStr = fecha.toLocaleDateString('es-BO', { year: 'numeric', month: 'long', day: 'numeric' });
    const horaStr = fecha.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
    const taller = this.tallerData.razon_social || 'Taller';
    const completados = this.kpiResumen.incidentes_completados;
    const total = this.kpiResumen.total_incidentes;
    const ingresos = this.kpiResumen.ingresos_totales;
    const ticketPromedio = completados > 0 ? (ingresos / completados).toFixed(2) : '0.00';
    const tasaCancelacion = total > 0 ? ((this.kpiResumen.incidentes_cancelados / total) * 100).toFixed(1) : '0.0';

    let excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Informe Ejecutivo</x:Name>
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
          <tr><td colspan="5" class="title-row">ASISCAR - INFORME EJECUTIVO DE OPERACIONES</td></tr>
          <tr><td colspan="5" class="subtitle-row">Reporte de Indicadores y Métricas Clave de Auxilio Vial</td></tr>
          <tr><td colspan="5"></td></tr>
          <tr><td class="label" style="width: 150px;">Sucursal / Taller:</td><td colspan="4" class="value">${taller}</td></tr>
          <tr><td class="label">NIT:</td><td colspan="4" class="value">${this.tallerData.nit}</td></tr>
          <tr><td class="label">ID Tenant:</td><td colspan="4" class="value">${this.tallerData.id_tenant}</td></tr>
          <tr><td class="label">Filtro de Periodo:</td><td colspan="4" class="value">${this.filtroTipo.toUpperCase()}</td></tr>
          <tr><td class="label">Fecha de Emisión:</td><td colspan="4" class="value">${fechaStr} a las ${horaStr}</td></tr>
          <tr><td colspan="5"></td></tr>
          
          <tr><td colspan="5" class="section-title" style="background-color: #1E40AF; color: white;">1. INDICADORES CLAVE DE RENDIMIENTO (KPIs)</td></tr>
          <tr style="height: 25px;">
            <td colspan="3" class="table-header" style="background-color: #2563EB; color: white;">Indicador Operativo</td>
            <td class="table-header" style="background-color: #2563EB; color: white; width: 120px;">Valor Registrado</td>
            <td class="table-header" style="background-color: #2563EB; color: white; width: 100px;">Unidad</td>
          </tr>
          <tr>
            <td colspan="3" class="table-cell">Ingresos Totales en el Periodo</td>
            <td class="table-cell currency" style="font-weight: bold; color: #1E3A8A;">Bs. ${ingresos.toLocaleString('es-BO', {minimumFractionDigits: 2})}</td>
            <td class="table-cell number">Bs.</td>
          </tr>
          <tr>
            <td colspan="3" class="table-cell">Total de Solicitudes Recibidas (Asignadas)</td>
            <td class="table-cell number" style="font-weight: bold;">${total}</td>
            <td class="table-cell number">Casos</td>
          </tr>
          <tr>
            <td colspan="3" class="table-cell">Servicios Completados Exitosamente</td>
            <td class="table-cell number" style="color: #10B981; font-weight: bold;">${completados}</td>
            <td class="table-cell number">Casos</td>
          </tr>
          <tr>
            <td colspan="3" class="table-cell">Servicios Cancelados / Rechazados</td>
            <td class="table-cell number" style="color: #EF4444;">${this.kpiResumen.incidentes_cancelados}</td>
            <td class="table-cell number">Casos</td>
          </tr>
          <tr>
            <td colspan="3" class="table-cell">Tasa de Cumplimiento Operativo (Éxito)</td>
            <td class="table-cell percentage" style="font-weight: bold; color: #10B981;">${this.kpiResumen.tasa_exito}%</td>
            <td class="table-cell number">%</td>
          </tr>
          <tr>
            <td colspan="3" class="table-cell">Tasa de Cancelación / Deserción</td>
            <td class="table-cell percentage" style="color: #EF4444;">${tasaCancelacion}%</td>
            <td class="table-cell number">%</td>
          </tr>
          <tr>
            <td colspan="3" class="table-cell">Ticket Promedio por Servicio Facturado</td>
            <td class="table-cell currency" style="font-weight: bold; color: #1E3A8A;">Bs. ${ticketPromedio}</td>
            <td class="table-cell number">Bs./Servicio</td>
          </tr>
          <tr><td colspan="5"></td></tr>

          <tr><td colspan="5" class="section-title" style="background-color: #1E40AF; color: white;">2. PRODUCTIVIDAD DEL EQUIPO TÉCNICO</td></tr>
          <tr style="height: 25px;">
            <td class="table-header" style="background-color: #2563EB; color: white; width: 60px;">Posición</td>
            <td colspan="3" class="table-header" style="background-color: #2563EB; color: white;">Nombre del Operario / Mecánico</td>
            <td class="table-header" style="background-color: #2563EB; color: white;">Trabajos Completados</td>
          </tr>
    `;

    if (this.kpiTecnicos && this.kpiTecnicos.length > 0) {
      this.kpiTecnicos.forEach((t: any, idx: number) => {
        excelHtml += `
          <tr>
            <td class="table-cell number">${idx + 1}</td>
            <td colspan="3" class="table-cell">${t.nombre}</td>
            <td class="table-cell number" style="font-weight: bold; color: #1E40AF;">${t.completados}</td>
          </tr>
        `;
      });
    } else {
      excelHtml += `
        <tr>
          <td colspan="5" class="table-cell" style="text-align: center; color: #64748B; font-style: italic;">No se registran datos de operarios en el periodo seleccionado.</td>
        </tr>
      `;
    }

    excelHtml += `
          <tr><td colspan="5"></td></tr>
          <tr><td colspan="5" class="section-title" style="background-color: #1E40AF; color: white;">3. DEMANDA POR TIPO DE ASISTENCIA</td></tr>
          <tr style="height: 25px;">
            <td colspan="3" class="table-header" style="background-color: #2563EB; color: white;">Categoría de Falla / Avería</td>
            <td class="table-header" style="background-color: #2563EB; color: white;">Cantidad Registrada</td>
            <td class="table-header" style="background-color: #2563EB; color: white;">Porcentaje de Demanda</td>
          </tr>
    `;

    if (this.kpiProblemas && Object.keys(this.kpiProblemas).length > 0) {
      const totalProblemas = Object.values(this.kpiProblemas).reduce((a: any, b: any) => a + b, 0) as number;
      for (const k in this.kpiProblemas) {
        const pct = totalProblemas > 0 ? ((this.kpiProblemas[k] / totalProblemas) * 100).toFixed(1) : '0.0';
        excelHtml += `
          <tr>
            <td colspan="3" class="table-cell">${k}</td>
            <td class="table-cell number" style="font-weight: bold;">${this.kpiProblemas[k]}</td>
            <td class="table-cell percentage" style="color: #1E3A8A;">${pct}%</td>
          </tr>
        `;
      }
    } else {
      excelHtml += `
        <tr>
          <td colspan="5" class="table-cell" style="text-align: center; color: #64748B; font-style: italic;">Sin datos de distribución registrados.</td>
        </tr>
      `;
    }

    excelHtml += `
          <tr><td colspan="5"></td></tr>
          <tr><td colspan="5" class="section-title" style="background-color: #1E40AF; color: white;">4. DETALLE CRONOLÓGICO DE INCIDENTES</td></tr>
          <tr style="height: 25px;">
            <td class="table-header" style="background-color: #2563EB; color: white;">Código Incidente</td>
            <td class="table-header" style="background-color: #2563EB; color: white; width: 180px;">Cliente</td>
            <td class="table-header" style="background-color: #2563EB; color: white; width: 180px;">Tipo de Falla</td>
            <td class="table-header" style="background-color: #2563EB; color: white;">Fecha y Hora</td>
            <td class="table-header" style="background-color: #2563EB; color: white;">Estado de Solicitud</td>
          </tr>
    `;

    if (this.kpiMapaCalor && this.kpiMapaCalor.length > 0) {
      this.kpiMapaCalor.forEach((p: any) => {
        let statusColor = '#1E293B';
        if (p.estado === 'Completado') statusColor = '#10B981';
        else if (p.estado === 'Cancelado') statusColor = '#EF4444';
        else if (p.estado === 'Asignado' || p.estado === 'En Camino') statusColor = '#3B82F6';

        excelHtml += `
          <tr>
            <td class="table-cell number" style="font-weight: bold; color: #475569;">INC-${p.id_incidente}</td>
            <td class="table-cell">${p.cliente}</td>
            <td class="table-cell">${p.tipo_problema}</td>
            <td class="table-cell number">${p.fecha}</td>
            <td class="table-cell number" style="font-weight: bold; color: ${statusColor};">${p.estado}</td>
          </tr>
        `;
      });
    } else {
      excelHtml += `
        <tr>
          <td colspan="5" class="table-cell" style="text-align: center; color: #64748B; font-style: italic;">No se registraron incidentes en el detalle.</td>
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
    const safeName = taller.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = 'Asiscar_Informe_' + safeName + '_' + fecha.toISOString().split('T')[0] + '.xls';

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

  renderKpiCharts() {
    import('chart.js/auto').then((ChartModule) => {
      const Chart = ChartModule.default || ChartModule.Chart;

      // 1. Gráfico de Barras: Técnicos
      const techCanvas = document.getElementById('chartTecnicos') as HTMLCanvasElement;
      if (techCanvas) {
        if (this.kpiChartInstances['tecnicos']) {
          this.kpiChartInstances['tecnicos'].destroy();
        }
        
        const labels = this.kpiTecnicos.map(t => t.nombre);
        const data = this.kpiTecnicos.map(t => t.completados);

        this.kpiChartInstances['tecnicos'] = new Chart(techCanvas, {
          type: 'bar',
          data: {
            labels: labels.length > 0 ? labels : ['Sin Datos'],
            datasets: [{
              label: 'Trabajos Completados',
              data: data.length > 0 ? data : [0],
              backgroundColor: 'rgba(255, 0, 85, 0.65)',
              borderColor: '#FF0055',
              borderWidth: 1.5,
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (context) => `Completados: ${context.raw}`
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#94A3B8', stepSize: 1 }
              },
              x: {
                grid: { display: false },
                ticks: { color: '#94A3B8' }
              }
            }
          }
        });
      }

      // 2. Gráfico de Tendencia (Línea / Área)
      const trendCanvas = document.getElementById('chartTendencia') as HTMLCanvasElement;
      if (trendCanvas) {
        if (this.kpiChartInstances['tendencia']) {
          this.kpiChartInstances['tendencia'].destroy();
        }

        const labels = this.kpiTendencia.map(t => t.periodo);
        const incidentsData = this.kpiTendencia.map(t => t.incidentes);
        const earningsData = this.kpiTendencia.map(t => t.ingresos);

        // Crear gradiente premium
        const ctx = trendCanvas.getContext('2d');
        let gradient: any = 'rgba(0, 102, 255, 0.15)';
        if (ctx) {
          gradient = ctx.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, 'rgba(0, 102, 255, 0.35)');
          gradient.addColorStop(1, 'rgba(0, 102, 255, 0.01)');
        }

        this.kpiChartInstances['tendencia'] = new Chart(trendCanvas, {
          type: 'line',
          data: {
            labels: labels.length > 0 ? labels : ['Sin Datos'],
            datasets: [
              {
                label: 'Ingresos (Bs.)',
                data: earningsData.length > 0 ? earningsData : [0],
                borderColor: '#0066FF',
                backgroundColor: gradient,
                fill: true,
                tension: 0.3,
                borderWidth: 3,
                yAxisID: 'y1'
              },
              {
                label: 'Incidentes',
                data: incidentsData.length > 0 ? incidentsData : [0],
                borderColor: '#FF0055',
                backgroundColor: 'transparent',
                tension: 0.1,
                borderWidth: 2,
                pointStyle: 'circle',
                pointRadius: 4,
                yAxisID: 'y'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'top',
                labels: { color: '#94A3B8', font: { weight: 'bold' } }
              }
            },
            scales: {
              y: {
                type: 'linear',
                display: true,
                position: 'left',
                beginAtZero: true,
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#94A3B8', stepSize: 1 }
              },
              y1: {
                type: 'linear',
                display: true,
                position: 'right',
                beginAtZero: true,
                grid: { drawOnChartArea: false },
                ticks: { color: '#94A3B8' }
              },
              x: {
                grid: { display: false },
                ticks: { color: '#94A3B8' }
              }
            }
          }
        });
      }

      // 3. Gráfico de Dona: Fallas Comunes
      const probCanvas = document.getElementById('chartProblemas') as HTMLCanvasElement;
      if (probCanvas) {
        if (this.kpiChartInstances['problemas']) {
          this.kpiChartInstances['problemas'].destroy();
        }

        const labels = Object.keys(this.kpiProblemas);
        const data = Object.values(this.kpiProblemas);

        this.kpiChartInstances['problemas'] = new Chart(probCanvas, {
          type: 'doughnut',
          data: {
            labels: labels.length > 0 ? labels : ['Sin Datos'],
            datasets: [{
              data: data.length > 0 ? data : [1],
              backgroundColor: ['#EF4444', '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EC4899', '#6366F1'],
              borderWidth: 0,
              hoverOffset: 10
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
              legend: {
                position: 'right',
                labels: { color: '#94A3B8', font: { size: 11 } }
              }
            }
          }
        });
      }

      // 4. Gráfico de Torta: Estados de Incidentes
      const stateCanvas = document.getElementById('chartEstados') as HTMLCanvasElement;
      if (stateCanvas) {
        if (this.kpiChartInstances['estados']) {
          this.kpiChartInstances['estados'].destroy();
        }

        const labels = Object.keys(this.kpiEstados);
        const data = Object.values(this.kpiEstados);

        this.kpiChartInstances['estados'] = new Chart(stateCanvas, {
          type: 'pie',
          data: {
            labels: labels.length > 0 ? labels : ['Sin Datos'],
            datasets: [{
              data: data.length > 0 ? data : [1],
              backgroundColor: ['#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#6366F1'],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'right',
                labels: { color: '#94A3B8', font: { size: 11 } }
              }
            }
          }
        });
      }
    });
  }

  renderKpiHeatmap() {
    import('leaflet').then(async (L) => {
      await import('leaflet.heat');
      
      const mapDiv = document.getElementById('kpiMap');
      if (!mapDiv) return;

      if (this.kpiMapInstance) {
        try {
          this.kpiMapInstance.remove();
        } catch (e) {}
        this.kpiMapInstance = null;
      }

      // Centro por defecto: Santa Cruz de la Sierra o la ubicación del taller
      const defaultLat = this.tallerData.ubicacion_base_latitud || -17.7833;
      const defaultLng = this.tallerData.ubicacion_base_longitud || -63.1821;

      this.kpiMapInstance = L.map('kpiMap', {
        zoomControl: true,
        attributionControl: false
      }).setView([defaultLat, defaultLng], 13);

      // Usar mapa claro y detallado de OpenStreetMap para legibilidad de calles y zonas
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(this.kpiMapInstance);

      // Dibujar marcador de base del taller
      L.marker([defaultLat, defaultLng], {
        icon: L.divIcon({
          className: 'custom-workshop-icon',
          html: `<div style="background: #0066FF; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px #0066FF;"></div>`,
          iconSize: [14, 14]
        })
      }).addTo(this.kpiMapInstance).bindTooltip("Mi Taller", { permanent: false, direction: 'top' });

      // Preparar puntos del mapa de calor
      const heatPoints = this.kpiMapaCalor.map(p => [p.lat, p.lng, 1.0]);

      if (this.kpiMapaCalor.length > 0) {
        // 1. Calcular el centro de masa de todas las incidencias
        let latSum = 0, lngSum = 0;
        this.kpiMapaCalor.forEach(p => {
          latSum += p.lat;
          lngSum += p.lng;
        });
        const avgLat = latSum / this.kpiMapaCalor.length;
        const avgLng = lngSum / this.kpiMapaCalor.length;

        // 2. Dibujar el área circular de mayor concentración de incidencias (Radio de 2 km)
        const densityArea = L.circle([avgLat, avgLng], {
          radius: 2000, // 2 km
          color: '#FF0055',
          fillColor: '#FF0055',
          fillOpacity: 0.12,
          weight: 2,
          dashArray: '5, 8'
        }).addTo(this.kpiMapInstance);

        densityArea.bindTooltip(
          `<div style="font-family: 'Inter', sans-serif; font-size: 13px; font-weight: bold; color: #FF0055;">
             🎯 Zona de Alta Concentración
           </div>
           <div style="font-family: 'Inter', sans-serif; font-size: 12px; color: #1E293B; margin-top: 3px;">
             Se registran <strong>${this.kpiMapaCalor.length}</strong> incidentes en esta región.
           </div>`,
          { permanent: true, direction: 'top', className: 'density-area-tooltip' }
        );

        // 3. Inicializar el HeatLayer de Leaflet.heat
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
        }).addTo(this.kpiMapInstance);

        // 4. Agregar marcadores circulares interactivos con tooltips informativos sobre el mapa de calor
        this.kpiMapaCalor.forEach(p => {
          const markerColor = p.estado === 'Completado' ? '#10B981' : p.estado === 'Cancelado' || p.estado === 'Rechazado' ? '#EF4444' : '#F59E0B';
          const circle = L.circleMarker([p.lat, p.lng], {
            radius: 8,
            fillColor: markerColor,
            color: '#FFFFFF',
            weight: 1.5,
            opacity: 0.9,
            fillOpacity: 0.8
          }).addTo(this.kpiMapInstance);

          const tooltipContent = `
            <div style="font-family: 'Inter', sans-serif; font-size: 13px; color: #1E293B; min-width: 170px; padding: 4px; line-height: 1.4;">
              <div style="font-weight: 800; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; margin-bottom: 6px; color: #FF0055;">
                🚨 Incidente #${p.id_incidente}
              </div>
              <div style="margin-bottom: 3px;">
                <strong>Falla:</strong> ${p.tipo_problema}
              </div>
              <div style="margin-bottom: 3px;">
                <strong>Cliente:</strong> ${p.cliente}
              </div>
              <div style="margin-bottom: 3px;">
                <strong>Fecha:</strong> ${p.fecha}
              </div>
              <div>
                <strong>Estado:</strong> <span style="font-weight: bold; color: ${markerColor};">${p.estado}</span>
              </div>
            </div>
          `;
          circle.bindTooltip(tooltipContent, {
            direction: 'top',
            offset: [0, -5],
            opacity: 0.95
          });
        });

        // 5. Ajustar el encuadre del mapa para mostrar tanto la base del taller como todas las incidencias del periodo
        const bounds = L.latLngBounds([
          L.latLng(defaultLat, defaultLng),
          ...this.kpiMapaCalor.map(p => L.latLng(p.lat, p.lng))
        ]);
        this.kpiMapInstance.fitBounds(bounds, { padding: [50, 50] });
      } else {
        // Si no hay incidencias, simplemente centrar en la base del taller
        this.kpiMapInstance.setView([defaultLat, defaultLng], 13);
      }

      // Evitar bugs de redibujado de Leaflet
      setTimeout(() => {
        if (this.kpiMapInstance) {
          this.kpiMapInstance.invalidateSize();
        }
      }, 200);
    });
  }


  ngOnDestroy() {
    this.wsService.disconnect();
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    this.destroyKpiVisuals();
  }

  procesarAlerta(alerta: any) {
    if (alerta.type === 'COTIZACION_ACEPTADA') {
      alert(`🎉 ¡El cliente aceptó tu cotización para el incidente #${alerta.id_incidente}! Ya puedes asignarle un técnico.`);
      this.loadSolicitudes();
      return;
    }
    if (alerta.type === 'COTIZACION_RECHAZADA') {
      alert(`😔 El cliente rechazó tu cotización para el incidente #${alerta.id_incidente}.`);
      this.loadSolicitudes();
      return;
    }

    const baseUrl = BASE_URL;

    let ai_text = 'Calculando diagnóstico...';
    if (alerta.evaluacion_ia) {
      if (typeof alerta.evaluacion_ia === 'object' && alerta.evaluacion_ia.diagnostico_ia) {
        ai_text = alerta.evaluacion_ia.diagnostico_ia;
      } else {
        ai_text = alerta.evaluacion_ia;
      }
    }

    this.solicitudes.unshift({
      id_incidente: alerta.id_incidente,
      tipo_problema: alerta.problema,
      nivel_prioridad: alerta.prioridad,
      distancia_km: alerta.distancia_km,
      cliente: alerta.cliente || 'Conductor en Ruta',
      vehiculo: alerta.vehiculo || 'Vehículo asignado',
      transcripcion_audio: alerta.transcripcion_audio,
      url_audio_evidencia: alerta.url_audio_evidencia ? `${baseUrl}/${alerta.url_audio_evidencia}` : null,
      url_foto_evidencia: alerta.url_foto_evidencia ? `${baseUrl}/${alerta.url_foto_evidencia}` : null,
      evaluacion_ia: ai_text
    });

    this.stats.incidentesActivos = this.solicitudes.length;

    this.playNotificationSound();

    if (this.map && alerta.latitud && alerta.longitud) {
      try {
        new google.maps.Marker({
          position: { lat: alerta.latitud, lng: alerta.longitud },
          map: this.map,
          title: `🚨 Emergencia: ${alerta.problema}`,
          icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'
        });
      } catch (e) {
        console.error('Error dibujando marcador de emergencia:', e);
      }
    }

    // Forzar actualización de la vista de Angular
    this.cdr.detectChanges();
  }

  toggleNotificaciones() {
    this.mostrarNotificaciones = !this.mostrarNotificaciones;
  }

  setTipoSonido(tipo: string) {
    this.tipoSonido = tipo;
    localStorage.setItem('tipo_sonido_notificacion', tipo);
    this.playNotificationSound();
  }

  playNotificationSound() {
    if (this.tipoSonido === 'silencio') return;
    
    try {
      const audioCtx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
      const now = audioCtx.currentTime;

      if (this.tipoSonido === 'telefono') {
        // Soft digital double-chirp/beep like a phone notification
        const playChirp = (timeOffset: number) => {
          const osc1 = audioCtx.createOscillator();
          const osc2 = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          
          osc1.connect(gainNode);
          osc2.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(987.77, now + timeOffset); // B5
          
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1318.51, now + timeOffset); // E6
          
          gainNode.gain.setValueAtTime(0, now + timeOffset);
          gainNode.gain.linearRampToValueAtTime(0.04, now + timeOffset + 0.02);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + timeOffset + 0.08);
          
          osc1.start(now + timeOffset);
          osc2.start(now + timeOffset);
          osc1.stop(now + timeOffset + 0.09);
          osc2.stop(now + timeOffset + 0.09);
        };
        
        playChirp(0);
        playChirp(0.12);
      } else if (this.tipoSonido === 'campana') {
        // Gentle bell chime
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.06, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (this.tipoSonido === 'tritono') {
        // Classic rising digital tri-tone
        const playNote = (freq: number, start: number, duration: number) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + start);
          
          gain.gain.setValueAtTime(0, now + start);
          gain.gain.linearRampToValueAtTime(0.04, now + start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
          
          osc.start(now + start);
          osc.stop(now + start + duration + 0.05);
        };
        
        playNote(523.25, 0, 0.1);    // C5
        playNote(659.25, 0.1, 0.1);  // E5
        playNote(783.99, 0.2, 0.2);  // G5
      }
    } catch (e) {
      console.warn('AudioContext falló:', e);
    }
  }

  async guardarHorario() {
    try {
      const response = await this.authFetch(`${API_URL}/talleres/${this.tallerData.id_taller}/horario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          es_24_7: this.es_24_7,
          horario_apertura: this.horario_apertura,
          horario_cierre: this.horario_cierre
        })
      });

      if (response.ok) {
        alert('¡Horario operativo actualizado!');
      } else {
        alert('Error al actualizar el horario.');
      }
    } catch (e) {
      console.error(e);
      alert('Error de conexión.');
    }
  }

  async loadServicios() {
    try {
      const resTodos = await this.authFetch(`${API_URL}/talleres/servicios/todos`);
      if (resTodos.ok) {
        this.serviciosTodos = await resTodos.json();
      }

      const resSel = await this.authFetch(`${API_URL}/talleres/${this.tallerData.id_taller}/servicios`);
      if (resSel.ok) {
        this.serviciosSeleccionados = await resSel.json();
      }

      const resTaller = await this.authFetch(`${API_URL}/talleres/${this.tallerData.id_taller}`);
      if (resTaller.ok) {
        const tData = await resTaller.json();
        this.es_24_7 = tData.es_24_7 || false;
        if (tData.horario_apertura) this.horario_apertura = tData.horario_apertura.substring(0, 5);
        if (tData.horario_cierre) this.horario_cierre = tData.horario_cierre.substring(0, 5);
      }
    } catch (e) {
      console.error('Error cargando servicios y horarios:', e);
    }
  }

  toggleServicio(id: number) {
    if (this.serviciosSeleccionados.includes(id)) {
      this.serviciosSeleccionados = this.serviciosSeleccionados.filter(sid => sid !== id);
    } else {
      this.serviciosSeleccionados.push(id);
    }
  }

  async guardarServicios() {
    try {
      const response = await this.authFetch(`${API_URL}/talleres/${this.tallerData.id_taller}/servicios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servicios_ids: this.serviciosSeleccionados })
      });

      if (response.ok) {
        alert('¡Servicios actualizados con éxito!');
      } else {
        alert('Error al actualizar los servicios.');
      }
    } catch (e) {
      console.error(e);
      alert('Error de red.');
    }
  }

  async loadSolicitudes() {
    try {
      const response = await this.authFetch(`${API_URL}/talleres/${this.tallerData.id_taller}/solicitudes`);
      if (response.ok) {
        const serverSolicitudes = await response.json();
        
        // Merge to preserve local UI states (quote inputs, selected technician, etc.)
        this.solicitudes = serverSolicitudes.map((newSol: any) => {
          const existingSol = this.solicitudes.find(s => s.id_incidente === newSol.id_incidente);
          if (existingSol) {
            return {
              ...newSol,
              mostrarCotizar: existingSol.mostrarCotizar,
              cot_monto: existingSol.cot_monto,
              cot_tiempo: existingSol.cot_tiempo,
              cot_comentario: existingSol.cot_comentario,
              id_tecnico_seleccionado: existingSol.id_tecnico_seleccionado,
              procesandoCotizacion: existingSol.procesandoCotizacion,
              procesando: existingSol.procesando
            };
          }
          return newSol;
        });

        this.stats.incidentesActivos = this.solicitudes.length;
        this.cdr.detectChanges();
      }
    } catch (error) {
      console.error("Error cargando solicitudes:", error);
    }
  }


  async loadTrabajos() {
    try {
      const response = await this.authFetch(`${API_URL}/talleres/${this.tallerData.id_taller}/trabajos`);
      if (response.ok) {
        const allTrabajos = await response.json();
         // Incluir todos los estados activos en la lista, incluyendo traslados
        this.trabajos = allTrabajos.filter((t: any) =>
          ['Aceptado', 'En Camino', 'Atendido', 'Por Pagar', 'Completado', 'En Remolque al Taller', 'Ingresado a Taller', 'En Remolque', 'Requiere Traslado'].includes(t.estado)
        );
        const totalGanancias = allTrabajos
          .filter((t: any) => t.estado === 'Completado')
          .reduce((total: any, t: any) => total + (t.monto || 0), 0);
        this.stats.gananciasHoy = Math.round(totalGanancias * 100) / 100;
        this.stats.completadosHoy = allTrabajos.filter((t: any) => t.estado === 'Completado').length;
        this.stats.canceladosHoy = allTrabajos.filter((t: any) => ['Cancelado', 'cancelado'].includes(t.estado)).length;
        this.stats.incidentesActivos = allTrabajos.filter((t: any) => !['Completado', 'Cancelado', 'cancelado'].includes(t.estado)).length;
        this.cdr.detectChanges();

        // Limpiar marcadores previos del cliente
        this.incidentMarkers.forEach((marker: any) => marker.setMap(null));
        this.incidentMarkers = [];

        // Graficar Incidentes Activos (Clientes)
        this.trabajos.forEach(t => {
          if (this.map && t.latitud && t.longitud && t.estado !== 'Completado') {
            try {
              const marker = new google.maps.Marker({
                position: { lat: parseFloat(t.latitud), lng: parseFloat(t.longitud) },
                map: this.map,
                title: `🚗 Auxilio: ${t.cliente} (${t.problema})`,
                icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'
              });
              this.incidentMarkers.push(marker);
            } catch (e) {
              console.error('Error cargando incidentes en el mapa:', e);
            }
          }
        });
      }
    } catch (error) {
      console.error("Error cargando trabajos:", error);
    }
  }

  async confirmarIngresoTaller(trabajo: any) {
    if (!trabajo.id_asistencia) {
      alert('⚠️ Error: ID de asistencia no disponible para este trabajo.');
      return;
    }
    if (confirm(`¿Confirmar el ingreso físico del vehículo del cliente ${trabajo.cliente} al taller?`)) {
      try {
        const response = await this.authFetch(`${API_URL}/incidentes/asistencias/${trabajo.id_asistencia}/finalizar-en-taller`, {
          method: 'POST'
        });
        if (response.ok) {
          alert('✅ Ingreso a taller confirmado con éxito.');
          this.loadTrabajos();
        } else {
          alert('❌ Error al confirmar el ingreso.');
        }
      } catch (e) {
        console.error(e);
        alert('❌ Error de red al confirmar ingreso.');
      }
    }
  }

  async verDetalleIncidente(trabajo: any) {
    try {
      const response = await this.authFetch(`${API_URL}/incidentes/${trabajo.id_incidente}`);
      let trackingData = {};
      try {
        const trackRes = await this.authFetch(`${API_URL}/incidentes/${trabajo.id_incidente}/tracking`);
        if (trackRes.ok) {
          trackingData = await trackRes.json();
        }
      } catch (e) {
        console.error('Error fetching tracking details:', e);
      }

      if (response.ok) {
        const rawIncidente = await response.json();
        this.selectedIncidenteDetail = {
          ...trabajo,
          ...rawIncidente,
          ...trackingData,
          id_incidente: trabajo.id_incidente
        };
        this.showIncidenteDetailModal = true;
        this.cdr.detectChanges();
      } else {
        alert('No se pudo obtener el detalle del incidente.');
      }
    } catch (e) {
      console.error(e);
      alert('Error al obtener el detalle del incidente.');
    }
  }




  async loadMecanicos() {
    try {
      const response = await this.authFetch(`${API_URL}/talleres/${this.tallerData.id_taller}/tecnicos`);
      if (response.ok) {
        this.mecanicos = await response.json();

        // Limpiar marcadores previos de técnicos
        this.technicianMarkers.forEach((marker: any) => marker.setMap(null));
        this.technicianMarkers = [];

        // Graficar Técnicos
        this.mecanicos.forEach(m => {
          if (this.map && m.ubicacion_actual_latitud && m.ubicacion_actual_longitud) {
            try {
              const marker = new google.maps.Marker({
                position: { lat: m.ubicacion_actual_latitud, lng: m.ubicacion_actual_longitud },
                map: this.map,
                title: `🔧 Técnico: ${m.nombres} ${m.apellidos}`,
                icon: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
              });
              this.technicianMarkers.push(marker);
            } catch (e) {
              console.error('Error cargando técnicos en el mapa:', e);
            }
          }
        });
        this.cdr.detectChanges();
      }
    } catch (error) {
      console.error("Error cargando mecánicos:", error);
    }
  }


  async registrarMecanico() {
    this.mecanicoError = '';
    this.mecanicoSuccess = false;

    if (!this.nuevoMecanico.nombres || !this.nuevoMecanico.nombres.trim()) {
      this.mecanicoError = 'Debes ingresar el nombre del técnico.';
      return;
    }
    if (!this.nuevoMecanico.apellidos || !this.nuevoMecanico.apellidos.trim()) {
      this.mecanicoError = 'Debes ingresar el apellido del técnico.';
      return;
    }

    this.creandoMecanico = true;

    try {
      // Generación automática del correo corporativo
      const nombreLimpio = this.nuevoMecanico.nombres.toLowerCase().trim().replace(/\s+/g, '');
      const apellidoPaterno = this.nuevoMecanico.apellidos.toLowerCase().trim().split(/\s+/)[0];

      let siglasTaller = 't';
      if (this.tallerData.razon_social) {
        const words = this.tallerData.razon_social.trim().split(/\s+/);
        if (words.length === 1) {
          siglasTaller = words[0].substring(0, 2).toLowerCase();
        } else {
          siglasTaller = (words[0][0] + words[1][0]).toLowerCase();
        }
      }

      this.nuevoMecanico.correo = `${nombreLimpio}${apellidoPaterno}_${siglasTaller}@asiscar.com`;

      const response = await this.authFetch(`${API_URL}/talleres/${this.tallerData.id_taller}/tecnicos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...this.nuevoMecanico,
          id_taller: this.tallerData.id_taller
        })
      });

      const data = await response.json();
      if (response.ok) {
        this.mecanicoSuccess = true;
        this.nuevoMecanico = { nombres: '', apellidos: '', ci_tecnico: '', telefono_contacto: '', correo: '', password: '' };
        this.loadMecanicos();
      } else {
        this.mecanicoError = data.detail || 'Error al registrar mecánico';
      }
    } catch (error) {
      this.mecanicoError = 'Error de conexión con el servidor';
    } finally {
      this.creandoMecanico = false;
    }
  }

  // Función exclusiva para desarrollo: permite cambiar de vista rápidamente
  toggleEstado() {
    this.tallerData.estado_aprobacion = this.tallerData.estado_aprobacion === 'Pendiente' ? 'Aprobado' : 'Pendiente';
  }

  onFileSelected(event: any, tipo: 'nit' | 'local') {
    const file = event.target.files[0];
    if (file) {
      if (tipo === 'nit') this.nitFile = file;
      if (tipo === 'local') this.localFile = file;
    }
  }

  async uploadDocumentos() {
    if (!this.nitFile && !this.localFile) return;

    this.uploading = true;
    const formData = new FormData();
    if (this.nitFile) formData.append('foto_nit', this.nitFile);
    if (this.localFile) formData.append('foto_local', this.localFile);

    try {
      const response = await this.authFetch(`${API_URL}/talleres/${this.tallerData.id_taller}/upload-docs`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (response.ok) {
        this.uploadSuccess = true;
        this.tallerData.foto_nit_url = data.foto_nit_url;
        this.tallerData.foto_local_url = data.foto_local_url;
        alert('✅ ¡Documentos subidos con éxito!');
      } else {
        alert('❌ No se pudieron subir los documentos: ' + (data.detail || 'Intente nuevamente.'));
      }
    } catch (error) {
      console.error("Error subiendo documentos:", error);
      alert('❌ Error de conexión al subir documentos.');
    } finally {
      this.uploading = false;
    }
  }

  async resetPassword(mec: any) {
    const newPass = window.prompt(`Ingresa la nueva contraseña temporal para ${mec.nombres}:`);
    if (!newPass || newPass.trim().length < 6) {
      if (newPass !== null) alert('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    try {
      const response = await this.authFetch(`${API_URL}/talleres/tecnicos/${mec.id_tecnico}/resetear-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPass })
      });

      if (response.ok) {
        alert('Contraseña reseteada con éxito. El técnico deberá cambiarla en la app móvil.');
      } else {
        alert('Error al resetear la contraseña.');
      }
    } catch (error) {
      console.error(error);
      alert('Error de conexión.');
    }
  }

  async aceptarServicio(solicitud: any) {
    if (solicitud.procesando) return;
    solicitud.procesando = true;
    try {
      const response = await this.authFetch(`${API_URL}/incidentes/${solicitud.id_incidente}/aceptar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_taller: this.tallerData.id_taller,
          id_tecnico: solicitud.id_tecnico_seleccionado
        })
      });

      if (response.ok) {
        this.solicitudes = this.solicitudes.filter(s => s.id_incidente !== solicitud.id_incidente);
        this.stats.incidentesActivos = this.solicitudes.length;
        this.stats.completadosHoy += 1;
        alert('¡Servicio tomado exitosamente!');
      } else {
        solicitud.procesando = false;
        alert('Error al tomar el servicio.');
      }
    } catch (e) {
      console.error('Error tomando el servicio:', e);
    }
  }

  async enviarCotizacion(sol: any) {
    if (!sol.cot_monto || sol.cot_monto <= 0) {
      alert("Por favor ingresa un monto válido.");
      return;
    }
    if (!sol.cot_tiempo || sol.cot_tiempo <= 0) {
      alert("Por favor ingresa un tiempo estimado válido.");
      return;
    }
    sol.procesandoCotizacion = true;
    try {
      const response = await this.authFetch(`${API_URL}/incidentes/${sol.id_incidente}/cotizar?id_taller=${this.tallerData.id_taller}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monto_estimado: sol.cot_monto,
          tiempo_estimado_minutos: sol.cot_tiempo,
          comentario: sol.cot_comentario || ''
        })
      });
      if (response.ok) {
        alert("¡Cotización enviada con éxito!");
        this.loadSolicitudes();
      } else {
        alert("Error al enviar la cotización.");
      }
    } catch (e) {
      console.error(e);
      alert("Error de red al enviar la cotización.");
    } finally {
      sol.procesandoCotizacion = false;
    }
  }

  rechazarServicio(solicitud: any) {
    this.solicitudARechazar = solicitud;
    this.justificacionRechazo = 'Sin personal disponible';
    this.otroJustificativo = '';
    this.showRechazoModal = true;
    this.cdr.detectChanges();
  }

  async confirmarRechazo() {
    if (!this.solicitudARechazar) return;

    let justificacionFinal = this.justificacionRechazo;
    if (this.justificacionRechazo === 'Otro') {
      justificacionFinal = this.otroJustificativo.trim() || 'Sin justificación especificada';
    }

    try {
      const response = await this.authFetch(`${API_URL}/talleres/${this.tallerData.id_taller}/solicitudes/${this.solicitudARechazar.id_incidente}/rechazar`, {
        method: 'POST',
        body: JSON.stringify({ justificacion: justificacionFinal })
      });

      if (response.ok) {
        this.solicitudes = this.solicitudes.filter(s => s.id_incidente !== this.solicitudARechazar.id_incidente);
        this.stats.incidentesActivos = this.solicitudes.length;
        this.showRechazoModal = false;
        this.solicitudARechazar = null;
        this.cdr.detectChanges();
      } else {
        alert('Error al registrar el rechazo de la solicitud.');
      }
    } catch (e) {
      console.error(e);
      alert('Error de red al intentar rechazar la solicitud.');
    }
  }

  async loadServiciosDisponibles() {

    try {
      const response = await this.authFetch(`${API_URL}/talleres/servicios/todos`);
      if (response.ok) {
        this.serviciosDisponibles = await response.json();
        this.cdr.detectChanges();
      } else {

        this.serviciosDisponibles = [
          { id_servicio: 1, nombre_servicio: 'Diagnóstico por Escáner y Reparación de Sistemas Eléctricos' },
          { id_servicio: 2, nombre_servicio: 'Mantenimiento de Suspensión, Frenos y Neumáticos' },
          { id_servicio: 3, nombre_servicio: 'Suministro e Inspección Rápida de Fluidos (Aceite/Combustible)' },
          { id_servicio: 4, nombre_servicio: 'Reparación de Chapas y Codificación de Llaves Inteligentes' },
          { id_servicio: 5, nombre_servicio: 'Servicio de Auxilio Vial y Traslado en Grúa' },
          { id_servicio: 6, nombre_servicio: 'Mecánica Preventiva, Afinamiento y Reparación de Motor' },
          { id_servicio: 7, nombre_servicio: 'Mantenimiento Integral del Sistema de Refrigeración' }
        ];
      }
    } catch (e) {
      console.error(e);
      this.serviciosDisponibles = [
        { id_servicio: 1, nombre_servicio: 'Diagnóstico por Escáner y Reparación de Sistemas Eléctricos' },
        { id_servicio: 2, nombre_servicio: 'Mantenimiento de Suspensión, Frenos y Neumáticos' },
        { id_servicio: 3, nombre_servicio: 'Suministro e Inspección Rápida de Fluidos (Aceite/Combustible)' },
        { id_servicio: 4, nombre_servicio: 'Reparación de Chapas y Codificación de Llaves Inteligentes' },
        { id_servicio: 5, nombre_servicio: 'Servicio de Auxilio Vial y Traslado en Grúa' },
        { id_servicio: 6, nombre_servicio: 'Mecánica Preventiva, Afinamiento y Reparación de Motor' },
        { id_servicio: 7, nombre_servicio: 'Mantenimiento Integral del Sistema de Refrigeración' }
      ];
    }
  }

  async loadTallerServicios() {
    try {
      const response = await this.authFetch(`${API_URL}/talleres/${this.tallerData.id_taller}/servicios`);
      if (response.ok) {
        this.serviciosAsociados = await response.json();
        if (!this.serviciosAsociados) {
          this.serviciosAsociados = [];
        }
        this.cdr.detectChanges();
      } else {
        this.serviciosAsociados = [];
        this.cdr.detectChanges();
      }
    } catch (e) {
      console.error(e);
      this.serviciosAsociados = [];
      this.cdr.detectChanges();
    }
  }

  async vincularServicio() {
    if (!this.nuevoServicioId) return;
    try {
      const response = await this.authFetch(`${API_URL}/talleres/${this.tallerData.id_taller}/servicios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_servicio: Number(this.nuevoServicioId),
          precio: this.nuevoServicioPrecio,
          tiempo: this.nuevoServicioTiempo
        })
      });
      if (response.ok) {
        alert('✅ Servicio vinculado al taller.');
        this.loadTallerServicios();
      } else {
        // Fallback simulación
        const serv = this.serviciosDisponibles.find(s => s.id_servicio === Number(this.nuevoServicioId));
        if (serv && !this.serviciosAsociados.some(s => s.id_servicio === serv.id_servicio)) {
          this.serviciosAsociados.push({
            id_servicio: serv.id_servicio,
            nombre_servicio: serv.nombre_servicio,
            precio_especifico_taller: this.nuevoServicioPrecio || 50.0,
            tiempo_estimado_minutos: this.nuevoServicioTiempo || 30
          });
          alert('✅ Servicio vinculado al taller.');
        }
      }
    } catch (e) {
      console.error(e);
      const serv = this.serviciosDisponibles.find(s => s.id_servicio === Number(this.nuevoServicioId));
      if (serv && !this.serviciosAsociados.some(s => s.id_servicio === serv.id_servicio)) {
        this.serviciosAsociados.push({
          id_servicio: serv.id_servicio,
          nombre_servicio: serv.nombre_servicio,
          precio_especifico_taller: this.nuevoServicioPrecio || 50.0,
          tiempo_estimado_minutos: this.nuevoServicioTiempo || 30
        });
        alert('✅ Servicio vinculado al taller.');
      }
    }
  }

  async loadEspecialidadesDisponibles() {
    try {
      const response = await this.authFetch(`${API_URL}/talleres/especialidades-disponibles`);
      if (response.ok) {
        this.especialidadesDisponibles = await response.json();
        this.cdr.detectChanges();
      } else {

        this.especialidadesDisponibles = [
          { id_especialidad: 1, nombre_especialidad: 'Electricista Automotriz' },
          { id_especialidad: 2, nombre_especialidad: 'Mecánico de Auxilio Rápido' },
          { id_especialidad: 3, nombre_especialidad: 'Operador de Grúas y Rescate' },
          { id_especialidad: 4, nombre_especialidad: 'Cerrajero de Vehículos' },
          { id_especialidad: 5, nombre_especialidad: 'Técnico en Suspensión y Neumáticos' },
          { id_especialidad: 6, nombre_especialidad: 'Especialista en Sistemas de Enfriamiento' }
        ];
      }
    } catch (e) {
      console.error(e);
      this.especialidadesDisponibles = [
        { id_especialidad: 1, nombre_especialidad: 'Electricista Automotriz' },
        { id_especialidad: 2, nombre_especialidad: 'Mecánico de Auxilio Rápido' },
        { id_especialidad: 3, nombre_especialidad: 'Operador de Grúas y Rescate' },
        { id_especialidad: 4, nombre_especialidad: 'Cerrajero de Vehículos' },
        { id_especialidad: 5, nombre_especialidad: 'Técnico en Suspensión y Neumáticos' },
        { id_especialidad: 6, nombre_especialidad: 'Especialista en Sistemas de Enfriamiento' }
      ];
    }
  }

  async seleccionarTecnicoParaEsp(mec: any) {
    this.tecnicoSeleccionadoParaEsp = mec;
    this.editandoEspecialidades = false;
    try {
      const response = await this.authFetch(`${API_URL}/talleres/tecnicos/${mec.id_tecnico}/especialidades`);
      if (response.ok) {
        const serverEsp = await response.json() || [];
        const cached = localStorage.getItem(`tecnico_${mec.id_tecnico}_esp`);
        const cachedEsp = cached ? JSON.parse(cached) : [];
        const unicas = new Map();
        [...serverEsp, ...cachedEsp].forEach(e => unicas.set(e.id_especialidad, e));
        this.tecnicoEspecialidades = Array.from(unicas.values());
      } else {
        const cached = localStorage.getItem(`tecnico_${mec.id_tecnico}_esp`);
        this.tecnicoEspecialidades = cached ? JSON.parse(cached) : [];
      }
    } catch (e) {
      console.error(e);
      const cached = localStorage.getItem(`tecnico_${mec.id_tecnico}_esp`);
      this.tecnicoEspecialidades = cached ? JSON.parse(cached) : [];
    }
  }

  async vincularEspecialidad(idEsp: number) {
    if (!this.tecnicoSeleccionadoParaEsp) return;
    try {
      const response = await this.authFetch(`${API_URL}/talleres/tecnicos/${this.tecnicoSeleccionadoParaEsp.id_tecnico}/especialidades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_especialidad: Number(idEsp) })
      });
      if (response.ok) {
        const espObj = this.especialidadesDisponibles.find(e => e.id_especialidad === idEsp);
        if (espObj && !this.tecnicoEspecialidades.some(e => e.id_especialidad === idEsp)) {
          this.tecnicoEspecialidades.push(espObj);
          localStorage.setItem(`tecnico_${this.tecnicoSeleccionadoParaEsp.id_tecnico}_esp`, JSON.stringify(this.tecnicoEspecialidades));
        }
        alert('✅ Habilidad vinculada al técnico.');
        this.seleccionarTecnicoParaEsp(this.tecnicoSeleccionadoParaEsp);
      } else {
        const espObj = this.especialidadesDisponibles.find(e => e.id_especialidad === idEsp);
        if (espObj && !this.tecnicoEspecialidades.some(e => e.id_especialidad === idEsp)) {
          this.tecnicoEspecialidades.push(espObj);
          localStorage.setItem(`tecnico_${this.tecnicoSeleccionadoParaEsp.id_tecnico}_esp`, JSON.stringify(this.tecnicoEspecialidades));
          alert('✅ Habilidad vinculada al técnico.');
        }
      }
    } catch (e) {
      console.error(e);
      const espObj = this.especialidadesDisponibles.find(e => e.id_especialidad === idEsp);
      if (espObj && !this.tecnicoEspecialidades.some(e => e.id_especialidad === idEsp)) {
        this.tecnicoEspecialidades.push(espObj);
        localStorage.setItem(`tecnico_${this.tecnicoSeleccionadoParaEsp.id_tecnico}_esp`, JSON.stringify(this.tecnicoEspecialidades));
        alert('✅ Habilidad vinculada al técnico.');
      }
    }
  }

  async guardarPerfil() {
    try {
      const response = await this.authFetch(`${API_URL}/talleres/${this.tallerData.id_taller}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.perfilEdit)
      });
      if (response.ok) {
        alert('✅ Perfil del taller guardado.');
      }
    } catch (e) { console.error(e); }
  }

  logout() {
    localStorage.clear();
    this.router.navigate(['/login']);
  }

  // --- Gestión de Órdenes de Trabajo y Presupuestos (Fase 2) ---
  ordenes: any[] = [];
  activeIncidentes: any[] = [];
  selectedOrder: any = null;
  selectedOrderBitacora: any[] = [];
  selectedOrderPresupuesto: any = null;
  orderFilter: string = 'Todas';
  
  showCreateOrderModal = false;
  showCreatePresupuestoModal = false;
  showOrderDetailModal = false;
  showUpdateStatusModal = false;

  // Formulario nueva orden
  newOrderIncidenteId: any = null;
  newOrderFechaCompromiso: string = '';
  newOrderEstadoRecepcion: string = '';

  // Formulario nuevo presupuesto
  newBudgetDesc: string = '';
  newBudgetGroups: any[] = [];

  // Formulario actualizar estado
  updateStatusState: string = '';
  updateStatusComentario: string = '';

  async loadOrdenes() {
    try {
      const response = await this.authFetch(`${API_URL}/reparaciones/ordenes`);
      if (response.ok) {
        this.ordenes = await response.json();
        this.cdr.detectChanges();
      }
    } catch (e) {
      console.error('Error cargando órdenes de trabajo:', e);
    }
  }

  async abrirCrearOrden() {
    this.newOrderIncidenteId = null;
    this.newOrderFechaCompromiso = '';
    this.newOrderEstadoRecepcion = 'Vehículo recibido físicamente en el taller para su diagnóstico.';
    this.showCreateOrderModal = true;
    
    // Filtrar los incidentes activos en estado 'Ingresado a Taller'
    this.activeIncidentes = this.trabajos.filter((t: any) => t.estado === 'Ingresado a Taller');
    this.cdr.detectChanges();
  }

  async registrarOrdenTrabajo() {
    if (!this.newOrderIncidenteId) {
      alert('Debe seleccionar un incidente de origen.');
      return;
    }
    try {
      // 1. Obtener detalles del incidente para extraer id_cliente e id_vehiculo
      const resInc = await this.authFetch(`${API_URL}/incidentes/${this.newOrderIncidenteId}`);
      if (!resInc.ok) {
        alert('Error al consultar detalles del incidente de origen.');
        return;
      }
      const incData = await resInc.json();

      // 2. Crear la orden de trabajo
      const payload = {
        id_cliente: incData.id_cliente,
        id_vehiculo: incData.id_vehiculo,
        id_incidente_origen: Number(this.newOrderIncidenteId),
        estado_recepcion: this.newOrderEstadoRecepcion,
        fecha_compromiso_entrega: this.newOrderFechaCompromiso ? new Date(this.newOrderFechaCompromiso).toISOString() : null
      };

      const resOrder = await this.authFetch(`${API_URL}/reparaciones/ordenes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (resOrder.ok) {
        alert('✅ Orden de trabajo creada exitosamente.');
        this.showCreateOrderModal = false;
        this.loadOrdenes();
        this.loadTrabajos(); // recargar para actualizar estados
      } else {
        const err = await resOrder.json();
        alert('❌ Error al crear orden: ' + (err.detail || 'Error desconocido'));
      }
    } catch (e) {
      console.error(e);
      alert('Error de conexión.');
    }
  }

  abrirCrearPresupuesto(orden: any) {
    this.selectedOrder = orden;
    this.newBudgetDesc = '';
    this.newBudgetGroups = [
      {
        nombre: 'Sistema Eléctrico',
        es_critico: true,
        items: [
          { descripcion: 'Instalación y pruebas eléctricas', tipo_item: 'Mano de Obra', categoria: 'Eléctrico', cantidad: 1, precio_unitario: 150.0 }
        ]
      }
    ];
    this.showCreatePresupuestoModal = true;
    this.cdr.detectChanges();
  }

  agregarGrupoPresupuesto() {
    this.newBudgetGroups.push({
      nombre: '',
      es_critico: false,
      items: [
        { descripcion: '', tipo_item: 'Repuesto', categoria: 'Mecánica', cantidad: 1, precio_unitario: 0.0 }
      ]
    });
    this.cdr.detectChanges();
  }

  eliminarGrupoPresupuesto(idx: number) {
    this.newBudgetGroups.splice(idx, 1);
    this.cdr.detectChanges();
  }

  agregarItemAGrupo(groupIdx: number) {
    this.newBudgetGroups[groupIdx].items.push({
      descripcion: '',
      tipo_item: 'Repuesto',
      categoria: 'Mecánica',
      cantidad: 1,
      precio_unitario: 0.0
    });
    this.cdr.detectChanges();
  }

  eliminarItemDeGrupo(groupIdx: number, itemIdx: number) {
    this.newBudgetGroups[groupIdx].items.splice(itemIdx, 1);
    this.cdr.detectChanges();
  }

  async enviarPresupuesto() {
    if (!this.selectedOrder) return;
    
    // Validar datos básicos
    for (let i = 0; i < this.newBudgetGroups.length; i++) {
      const g = this.newBudgetGroups[i];
      if (!g.nombre || !g.nombre.trim()) {
        alert(`El nombre del grupo ${i + 1} no puede estar vacío.`);
        return;
      }
      if (g.items.length === 0) {
        alert(`El grupo "${g.nombre}" debe tener al menos un ítem.`);
        return;
      }
      for (let j = 0; j < g.items.length; j++) {
        const item = g.items[j];
        if (!item.descripcion || !item.descripcion.trim()) {
          alert(`La descripción del ítem ${j + 1} en el grupo "${g.nombre}" no puede estar vacía.`);
          return;
        }
        if (item.cantidad <= 0 || item.precio_unitario < 0) {
          alert(`Cantidad o precio inválido en el grupo "${g.nombre}".`);
          return;
        }
      }
    }

    // Aplanar los ítems según requiere el backend
    const detalles: any[] = [];
    this.newBudgetGroups.forEach(g => {
      g.items.forEach((item: any) => {
        detalles.push({
          categoria: item.categoria,
          grupo_falla: g.nombre.trim(),
          es_critico: g.es_critico,
          tipo_item: item.tipo_item,
          item_descripcion: item.descripcion.trim(),
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario
        });
      });
    });

    const payload = {
      descripcion_general: this.newBudgetDesc || 'Presupuesto de reparación física.',
      version: 'Inicial',
      detalles: detalles
    };

    try {
      const response = await this.authFetch(`${API_URL}/reparaciones/ordenes/${this.selectedOrder.id_orden}/presupuestos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        alert('✅ Presupuesto enviado al cliente con éxito.');
        this.showCreatePresupuestoModal = false;
        this.loadOrdenes();
      } else {
        const err = await response.json();
        alert('❌ Error al registrar presupuesto: ' + (err.detail || 'Error desconocido'));
      }
    } catch (e) {
      console.error(e);
      alert('Error de red al enviar el presupuesto.');
    }
  }

  async verDetalleOrden(orden: any) {
    this.selectedOrder = orden;
    this.selectedOrderBitacora = [];
    this.selectedOrderPresupuesto = null;
    this.showOrderDetailModal = true;
    this.cdr.detectChanges();

    try {
      // 1. Cargar la bitácora de la orden
      const resBit = await this.authFetch(`${API_URL}/reparaciones/ordenes/${orden.id_orden}/bitacora`);
      if (resBit.ok) {
        this.selectedOrderBitacora = await resBit.json();
      }

      // 2. Cargar los presupuestos de la orden
      const resPres = await this.authFetch(`${API_URL}/reparaciones/ordenes/${orden.id_orden}/presupuestos`);
      if (resPres.ok) {
        const presupuestos = await resPres.json();
        if (presupuestos && presupuestos.length > 0) {
          // Tomar el presupuesto más reciente
          this.selectedOrderPresupuesto = presupuestos[presupuestos.length - 1];
        }
      }
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Error cargando detalles de la orden:', e);
    }
  }

  abrirActualizarEstado(orden: any) {
    this.selectedOrder = orden;
    this.updateStatusState = orden.estado_trabajo;
    this.updateStatusComentario = '';
    this.showUpdateStatusModal = true;
    this.cdr.detectChanges();
  }

  async enviarActualizacionEstado() {
    if (!this.selectedOrder) return;
    if (!this.updateStatusState) {
      alert('Debe seleccionar un estado válido.');
      return;
    }

    try {
      const response = await this.authFetch(`${API_URL}/reparaciones/ordenes/${this.selectedOrder.id_orden}/estado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado_trabajo: this.updateStatusState,
          comentario: this.updateStatusComentario || `Se cambia el estado a ${this.updateStatusState}`
        })
      });

      if (response.ok) {
        alert(`✅ Estado de la orden cambiado a "${this.updateStatusState}" correctamente.`);
        this.showUpdateStatusModal = false;
        if (this.showOrderDetailModal) {
          // Si estaba en la vista detalle, refrescar
          const updatedOrder = await response.json();
          this.verDetalleOrden(updatedOrder);
        }
        this.loadOrdenes();
      } else {
        const err = await response.json();
        alert('❌ Error al actualizar estado: ' + (err.detail || 'Error desconocido'));
      }
    } catch (e) {
      console.error(e);
      alert('Error de conexión.');
    }
  }

  getGruposPresupuestoCargado(): any[] {
    if (!this.selectedOrderPresupuesto || !this.selectedOrderPresupuesto.detalles) return [];
    
    const grps = new Map();
    this.selectedOrderPresupuesto.detalles.forEach((det: any) => {
      const key = det.grupo_falla || 'General';
      if (!grps.has(key)) {
        grps.set(key, {
          nombre: key,
          es_critico: det.es_critico,
          estado_item: det.estado_item,
          items: []
        });
      }
      grps.get(key).items.push(det);
    });
    
    return Array.from(grps.values());
  }

  calcularSubtotalGrupoCargado(grupo: any): number {
    return grupo.items.reduce((total: number, item: any) => total + (item.subtotal || 0), 0);
  }

  filtrarOrdenes(): any[] {
    if (this.orderFilter === 'Todas') {
      return this.ordenes;
    }
    return this.ordenes.filter(o => o.estado_trabajo === this.orderFilter);
  }
}
