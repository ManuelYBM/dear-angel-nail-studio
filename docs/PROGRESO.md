# Progreso de implementación

## Estado al 12 de agosto de 2026

| Fase                               | Estado     | Resultado                                               |
| ---------------------------------- | ---------- | ------------------------------------------------------- |
| 0. Fundamentos y documentación     | Completada | Alcance, decisiones y arquitectura documentados         |
| 1. Base Docker y sistema visual    | Completada | Seis servicios locales operativos                       |
| 2. Identidad, seguridad y roles    | Completada | Acceso seguro y administración de clientas/manicuristas |
| 3. Disponibilidad y agenda         | Completada | Horarios flexibles y citas protegidas contra traslapes  |
| 4. Catálogo, calculadora y cotiza. | Completada | Diseños, favoritos y revisión previa a la reserva       |
| 5. Visitas y recompensas           | Completada | Camino visual, cupones, promociones y canje manual      |
| 6. Anticipos SPEI                  | Completada | Comprobantes privados y revisión administrativa         |
| 7. Notificaciones e integraciones  | Completada | Centro interno, avisos, reintentos y Google Calendar    |
| 8. Panel administrativo y PWA      | Completada | Reportes, auditoría, marca editable y aplicación PWA    |
| 9. Calidad, seguridad y entrega    | Completada | Respaldo probado, e2e, manuales y ensayo Docker limpio  |

## Entregado hasta la fase 7

- Registro de clientas por WhatsApp, OTP simulado/real, recuperación y sesiones seguras.
- Acceso de administradora y manicuristas por correo o teléfono.
- Alta, edición, pausa, archivo y reactivación de perfiles.
- Horario global inicial de lunes a viernes, 08:00 a 24:00.
- Horarios personalizados con varios periodos diarios y descansos.
- Fechas especiales, pausa de nuevas reservaciones y advertencias sobre citas existentes.
- Disponibilidad pública por manicurista o “Cualquiera”.
- Ventana configurable de anticipación, horizonte, duración, intervalo y retención.
- Citas en línea retenidas 10 minutos y citas manuales a cualquier minuto.
- Reprogramación de clienta una vez con 24 horas de anticipación.
- Cambios del personal sin consumir la oportunidad de la clienta.
- Cancelación, confirmación, cita atendida y ausencia.
- Restricción PostgreSQL que impide traslapes aun con solicitudes concurrentes.
- Pantallas responsive `/reservar`, `/agenda` y `/horarios`.
- Catálogo visual público con búsqueda, técnica, favoritos y reserva directa.
- Panel exclusivo de la administradora para diseños, imágenes, precios, tiempos y publicación.
- Calculadora migrada desde la herramienta anterior con 33 opciones editables.
- Técnicas, largos, decoraciones y extras administrables, con emoji o icono personalizado.
- Solicitudes personalizadas y flujo “No tengo diseño”, con hasta cinco imágenes.
- Elección de revisora o “Cualquiera”, toma atómica y asignación administrativa.
- Aprobación o rechazo con precio, duración y comentarios confirmados.
- Reserva posterior limitada a la manicurista responsable y duración aprobada.
- Ojito accesible para mostrar u ocultar todos los campos de contraseña.
- Navegación móvil visible y textos públicos revisados como producto final.
- Contador global construido con movimientos auditables y una visita única por cita atendida.
- Migración de citas atendidas anteriores para conservar el historial existente.
- Reglas ilimitadas por número de visita y recompensa inicial de visita 2 con 10%.
- Camino visual con hitos bloqueados, disponibles y utilizados.
- Cupones sin vencimiento, de un uso y separados completamente del anticipo.
- Aviso de cupones disponibles en la agenda de manicuristas.
- Canje manual ligado a una cita y prohibición de combinar dos cupones en la misma cita.
- Reversión de canje y corrección de visitas exclusivas de la administradora.
- Promociones generales configurables y entrega individual a clientas.
- Anticipo SPEI global editable con referencia única y datos bancarios configurables.
- Retención del horario durante diez minutos mientras se carga el comprobante.
- Carga privada de JPG, PNG, WebP o PDF con aceptación versionada de políticas.
- Estado “Pago por verificar” que mantiene bloqueado el horario.
- Aprobación o rechazo exclusivos de la administradora; el rechazo libera el espacio.
- Comprobante digital imprimible de la reservación aprobada.
- Eliminación física programada de comprobantes al cumplir un año.
- Página pública permanente de políticas y aviso dentro de la reserva.
- Contraseña secundaria y discreta en perfiles normales; destacada solo para claves temporales.
- Tratamiento cliente/clienta según el sexo registrado y redacción neutral cuando no se especifica.
- Regreso visible en páginas internas e indicador persistente de la sesión activa.
- Menú compacto en el avatar con cuenta, agenda, datos, notificaciones y cierre de sesión.
- Edición protegida de nombre, tratamiento y contacto con contraseña actual.
- Verificación obligatoria al cambiar el WhatsApp usado por un perfil cliente.
- Centro interno de notificaciones con lectura, contador y acceso directo al detalle.
- Avisos de citas, cambios, cotizaciones, anticipos, visitas, promociones y cupones.
- Recordatorios programados 24 horas y 2 horas antes de citas confirmadas.
- Entregas por WhatsApp o correo desacopladas de la operación principal.
- Cinco intentos con espera progresiva y registro administrativo del último error.
- Plantillas internas y nombres aprobados de Meta editables por la administradora.
- OAuth de Google Calendar por manicurista con tokens cifrados mediante AES-256-GCM.
- Alta, cambio y cancelación saliente de eventos de Google administrados por Dear Angel.

## Evidencia de verificación

```text
TypeScript API y web                         OK
Build de producción NestJS y Next.js         OK
Vitest API: 4 archivos / 11 pruebas          OK
Docker: api, web, worker, postgres,
        redis y minio saludables             OK
Rutas web nuevas (HTTP 200)                  OK
Disponibilidad de un día: 16 espacios        OK
Segundo apartado del mismo horario: HTTP 409 OK
Cita manual a las 13:43                      OK
Cita manual traslapada: HTTP 409             OK
Segunda reprogramación de clienta: HTTP 409  OK
Pausa conserva citas y oculta disponibilidad OK
Reducción de horario conserva y advierte     OK
Vista de reserva revisada en escritorio/móvil OK
Migraciones de catálogo y cotizaciones        OK
Calculadora migrada: 33 opciones              OK
Creación y revisión de cotización             OK
Carga privada de imagen de referencia         OK
Disponibilidad con duración de 75 min          OK
Reserva de cotización con su responsable      OK
Segunda reserva de la cotización: HTTP 409     OK
Inicio, catálogo, acceso y cálculo a 390×844   OK
Ancho de documento 390 px, sin desborde lateral OK
Acceso móvil e ícono de contraseña visibles   OK
Migración de fidelidad y restricciones SQL    OK
Conteo idempotente por cita atendida           OK
Desbloqueo único de recompensas                OK
Canje no combinable y reversión administrativa OK
Recompensas con datos a 390 px, sin desborde   OK
Build de producción con las 21 rutas web       OK
Vista pública por túnel HTTP/2                OK
Migraciones SPEI y retención anual aplicadas   OK
Anticipo aprobado confirma la cita             OK
Anticipo rechazado libera el horario           OK
Comprobante pendiente conserva el horario      OK
Apartado vencido libera el horario             OK
Comprobante privado sin sesión: HTTP 401       OK
Folio digital y referencias únicas             OK
API Vitest: 5 archivos / 14 pruebas            OK
Build web de producción con 24 rutas           OK
Migración de notificaciones e integraciones     OK
Edición de perfil con contraseña correcta       OK
Contraseña incorrecta al editar: HTTP 401       OK
Creación, conteo y lectura de notificación      OK
Cuenta, datos y avisos a 390×844 sin desborde   OK
Menú de avatar dentro del viewport móvil        OK
Build web de producción con 28 rutas            OK
TypeScript API, web y worker                    OK
API, web y enlace permanente HTTP 200           OK
```

Los registros creados para la prueba end-to-end fueron eliminados al terminar.

## Fase 8 — Panel administrativo, reportes y PWA

- Dashboard exclusivo de la administradora con citas, atenciones, ausencias, cancelaciones, anticipos, clientela frecuente y diseños populares.
- Periodos de hasta 366 días calculados y presentados en `America/Merida`.
- Reportes detallados de citas, anticipos, clientela y diseños con filtros de estado y manicurista cuando corresponde.
- Descargas CSV y XLSX generadas desde las mismas consultas que alimentan las tablas, con protección contra fórmulas inyectadas.
- Auditoría paginada con filtros por fechas, acción, entidad y rol responsable, además de exportación completa.
- Edición administrativa de nombre, frase, ciudad, dirección, teléfono, WhatsApp, redes, mapa, logo e icono.
- Marca pública dinámica con imágenes almacenadas en MinIO.
- PWA instalable con accesos directos, indicación específica para iPhone, aviso de desconexión y pantalla offline.
- El service worker excluye `/api`, sesiones y datos privados de su caché.
- Interfaz administrativa responsive y redactada para la administradora.

## Evidencia adicional de fase 8

```text
TypeScript API, web y worker                     OK
Build NestJS y Next.js (33 rutas web)            OK
ESLint completo                                  OK
npm audit producción: 0 vulnerabilidades         OK
Vitest API: 6 archivos / 16 pruebas              OK
XLSX Open XML y neutralización CSV probados       OK
Migración de panel y marca aplicada en Docker     OK
API, web, worker, PostgreSQL, Redis y MinIO sanos OK
Dashboard, 4 reportes y auditoría con permisos   OK
Exportaciones CSV/XLSX integradas                 OK
Manifest, service worker y enlace HTTPS HTTP 200 OK
4 vistas administrativas a 390 px sin desborde   OK
Avatar de sesión persistente en las 4 vistas     OK
```

## Fase 9 — Calidad, seguridad y entrega

- Respaldos atómicos semanales de PostgreSQL y MinIO con manifiesto, sumas SHA-256 y retención configurable.
- Verificación y restauración aislada probadas sin modificar la instalación principal.
- Seed demostrativo explícito, repetible y compuesto sólo por perfiles y archivos ficticios.
- Validación de secretos y orígenes HTTPS cuando la API se ejecuta en producción.
- CSP, protección contra marcos, MIME sniffing, políticas de permisos y HSTS en la web.
- Prueba end-to-end de autenticación, permisos por rol, archivos privados, traslapes, panel, reportes, exportaciones y auditoría.
- Manual de usuario con capturas reales, manual técnico/operativo y especificación 1.1 en PDF.
- Ensayo desde una instalación Docker vacía, con limpieza restringida a los volúmenes temporales.

## Evidencia de fase 9

```text
TypeScript, ESLint y build de 33 rutas             OK
Vitest API: 7 archivos / 19 pruebas                OK
npm audit de producción: 0 vulnerabilidades       OK
End-to-end integrado: 27 / 27 controles            OK
Respaldo PostgreSQL + 6 objetos MinIO verificado   OK
Restauración aislada: 9 usuarios / 13 migraciones OK
Instalación Docker limpia + seed + e2e            OK
Web, API, worker y enlace HTTPS saludables         OK
```

## Siguiente incremento

Revisión funcional con Dear Angel y sustitución de datos provisionales: logo, contacto, SPEI y credenciales aprobadas de WhatsApp, correo y Google Calendar.
