import { Component, NgZone, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { CommonModule } from '@angular/common';
import { GoogleMap, MapMarker } from '@angular/google-maps';

@Component({
  selector: 'app-registro-taller',
  standalone: true,
  imports: [FormsModule, CommonModule, GoogleMap, MapMarker],
  templateUrl: './registro-taller.html',
  styleUrl: './registro-taller.css',
})
export class RegistroTaller implements AfterViewInit {
  @ViewChild('addressInput') addressInput!: ElementRef;

  tallerData = {
    razon_social: '',
    nombre_representante: '',
    nit: '',
    correo: '',
    password: '',
    ubicacion_base_latitud: null as number | null,
    ubicacion_base_longitud: null as number | null,
    direccion_fisica: '',
    es_24_7: false,
    horario_apertura: '08:00:00',
    horario_cierre: '18:00:00',
    horario_cierre_sabado: '13:00:00'
  };

  isLoading = false;
  isSuccess = false;
  errorMessage = '';
  direccionVisible = '';
  isGeocoding = false;


  // Configuración del Mapa
  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
  };
  center: google.maps.LatLngLiteral = { lat: -17.7833, lng: -63.1821 };
  zoom = 11;
  markerPosition: google.maps.LatLngLiteral | null = null;
  markerOptions: google.maps.MarkerOptions = {};

  constructor(
    private router: Router,
    private apiService: ApiService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) { }

  ngAfterViewInit() {
    // Esperamos un tick para asegurar que el DOM esté listo
    setTimeout(() => {
      this.initAutocomplete();
      this.initMarkerOptions();
    }, 200);
  }

  initMarkerOptions() {
    try {
      if (typeof google !== 'undefined' && google.maps) {
        this.markerOptions = {
          icon: {
            url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="%230066FF" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
            scaledSize: new google.maps.Size(32, 32),
            anchor: new google.maps.Point(16, 32)
          }
        };
      }
    } catch (e) {
      console.error('Error al inicializar markerOptions:', e);
    }
  }

  initAutocomplete() {
    try {
      if (!this.addressInput?.nativeElement) {
        console.warn('addressInput no disponible todavía');
        return;
      }
      const autocomplete = new google.maps.places.Autocomplete(this.addressInput.nativeElement, {
        componentRestrictions: { country: 'bo' },
        fields: ['address_components', 'geometry', 'formatted_address']
      });

      autocomplete.addListener('place_changed', () => {
        this.ngZone.run(() => {
          const place = autocomplete.getPlace();

          if (!place.geometry || !place.geometry.location) {
            console.error('El lugar seleccionado no tiene ubicación geométrica.');
            return;
          }

          const pos = place.geometry.location.toJSON();
          this.tallerData.ubicacion_base_latitud = pos.lat;
          this.tallerData.ubicacion_base_longitud = pos.lng;
          this.center = pos;
          this.markerPosition = pos;
          this.zoom = 17;
          this.direccionVisible = place.formatted_address || '';
        });
      });
    } catch (e) {
      console.error('Error al inicializar Autocomplete:', e);
    }
  }

  toggle247() {
    if (this.tallerData.es_24_7) {
      this.tallerData.horario_apertura = '00:00:00';
      this.tallerData.horario_cierre = '23:59:59';
      this.tallerData.horario_cierre_sabado = '23:59:59';
    } else {
      this.tallerData.horario_apertura = '08:00:00';
      this.tallerData.horario_cierre = '18:00:00';
      this.tallerData.horario_cierre_sabado = '13:00:00';
    }
  }

  geocodeManualAddress() {
    if (!this.direccionVisible || this.direccionVisible.length < 5) return;

    this.isGeocoding = true;
    const geocoder = new google.maps.Geocoder();

    geocoder.geocode({ address: this.direccionVisible }, (results, status) => {
      this.ngZone.run(() => {
        this.isGeocoding = false;
        if (status === 'OK' && results && results[0]) {
          const pos = results[0].geometry.location.toJSON();
          this.tallerData.ubicacion_base_latitud = pos.lat;
          this.tallerData.ubicacion_base_longitud = pos.lng;
          this.center = pos;
          this.markerPosition = pos;
          this.zoom = 17;
          this.tallerData.direccion_fisica = results[0].formatted_address || '';
        } else {
          console.error('No se pudo encontrar la dirección:', status);
        }
      });
    });
  }


  onMapClick(event: google.maps.MapMouseEvent) {
    this.ngZone.run(() => {
      if (event.latLng) {
        const pos = event.latLng.toJSON();
        this.tallerData.ubicacion_base_latitud = pos.lat;
        this.tallerData.ubicacion_base_longitud = pos.lng;
        this.markerPosition = pos;
        this.direccionVisible = 'Buscando dirección...';
        this.updateAddress(pos);
      }
    });
  }

  updateAddress(pos: google.maps.LatLngLiteral) {
    this.isGeocoding = true;
    const geocoder = new google.maps.Geocoder();

    geocoder.geocode({ location: pos }, (results, status) => {
      this.ngZone.run(() => {
        this.isGeocoding = false;
        if (status === 'OK' && results && results[0]) {
          this.tallerData.direccion_fisica = results[0].formatted_address;
        } else {
          // Fallback a coordenadas si falla la geocodificación
          this.tallerData.direccion_fisica = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
          if (status !== 'OK') {
            console.warn('Geocodificación inversa falló:', status);
          }
        }
        // Forzar a Angular a pintar el cambio inmediatamente
        this.cdr.detectChanges();
      });
    });
  }

  onSubmit() {
    try {
      this.isLoading = true;
      this.errorMessage = '';
      this.isSuccess = false;

      // Validación de coordenadas
      if (!this.tallerData.ubicacion_base_latitud || !this.tallerData.ubicacion_base_longitud) {
        this.isLoading = false;
        this.errorMessage = 'Por favor, selecciona la ubicación de tu taller en el mapa o usa el buscador.';
        return;
      }

      // Asegurar formato de tiempo
      if (this.tallerData.horario_apertura?.length === 5) this.tallerData.horario_apertura += ':00';
      if (this.tallerData.horario_cierre?.length === 5) this.tallerData.horario_cierre += ':00';
      if (this.tallerData.horario_cierre_sabado?.length === 5) this.tallerData.horario_cierre_sabado += ':00';

      console.log('Registrando taller...', this.tallerData);

      this.apiService.registerTaller(this.tallerData).subscribe({
        next: (response) => {
          console.log('Registro exitoso', response);
          this.isSuccess = true;
          this.isLoading = false;
          alert('✅ ¡Tu taller se ha registrado de manera exitosa! Por favor inicia sesión con tu nueva cuenta.');

          // Limpiar local storage de sesiones anteriores
          localStorage.removeItem('token_taller');
          localStorage.removeItem('user_id');
          localStorage.removeItem('user_name');
          localStorage.removeItem('user_nit');
          localStorage.removeItem('user_direccion');

          setTimeout(() => {
            this.router.navigate(['/login']);
          }, 100);
        },
        error: (err) => {
          console.error('Error en registro', err);
          this.isLoading = false;

          // Extraer mensaje detallado si existe
          if (err.error && err.error.detail) {
            if (Array.isArray(err.error.detail)) {
              this.errorMessage = err.error.detail[0].msg || 'Error de validación de datos.';
            } else {
              this.errorMessage = err.error.detail;
            }
          } else {
            this.errorMessage = 'No se pudo conectar con el servidor. Por favor intente de nuevo.';
          }
        }
      });
    } catch (e) {
      console.error('Excepción local en onSubmit', e);
      this.isLoading = false;
      this.errorMessage = 'Ocurrió un error inesperado al procesar el formulario.';
    }
  }
}
