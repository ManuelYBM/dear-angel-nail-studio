# Roadmap de producto y desarrollo

## Dear Angel Nail Studio

| Campo                    | Valor                                  |
| ------------------------ | -------------------------------------- |
| Versión                  | 1.2                                    |
| Fecha base               | 14 de agosto de 2026                   |
| Estado                   | Fases 0 a 9 implementadas y validadas  |
| Objetivo de demostración | Aplicación local ejecutable con Docker |
| Horizonte inicial        | 15 días                                |
| Idioma                   | Español                                |
| Zona horaria             | America/Merida                         |
| Moneda                   | MXN                                    |

## 1. Objetivo

Construir una plataforma profesional para Dear Angel Nail Studio que concentre agenda, manicuristas, clientas, catálogo, calculadora de diseños, cotizaciones, anticipos, visitas, recompensas, notificaciones y administración.

La primera entrega debe funcionar localmente mediante Docker y estar preparada para publicarse posteriormente sin reemplazar la arquitectura ni reescribir las reglas centrales.

## 2. Principios del proyecto

1. La base de datos, no solamente la interfaz, impedirá citas traslapadas.
2. Las reglas importantes serán configurables desde administración.
3. Los servicios externos estarán desacoplados mediante adaptadores.
4. Los secretos se proporcionarán mediante variables de entorno.
5. Se conservará auditoría de las operaciones sensibles.
6. La documentación se actualizará junto con el código.
7. La interfaz seguirá la identidad de Dear Angel: crema, rosa pastel, lila y dorado.
8. La primera versión será un monolito modular; no se introducirán microservicios sin una necesidad real.

## 3. Arquitectura objetivo

```text
Navegador / PWA
       |
       v
Frontend Next.js
       |
       v
API NestJS <----------------------- Worker BullMQ
  |      endpoints internos               |
  |      con secreto compartido            v
  |                                    Redis / BullMQ
  |                                    colas y tareas periódicas
  +----> PostgreSQL
  +----> MinIO / S3
  +----> Adaptadores externos
         - WhatsApp Cloud API
         - Correo SMTP
         - Google Calendar
```

### Contenedores locales actuales

- `web`: aplicación web/PWA.
- `api`: API y reglas de negocio.
- `worker`: programadores y consumidores BullMQ; invoca casos de uso internos de la API con un secreto compartido.
- `postgres`: base de datos relacional.
- `redis`: colas, bloqueos y tareas programadas.
- `minio`: fotografías, iconos y comprobantes en desarrollo.
- `backup`: copias periódicas verificables de PostgreSQL y MinIO.
- `restore`: herramienta bajo el perfil `tools`; no permanece en ejecución.

Los túneles `preview` y `stable-preview` no forman parte del Compose local: sólo existen en `docker/compose.public.yaml` y reciben sus secretos desde una copia local de `.env.public.example`. El overlay usa el proyecto independiente `dear-angel-public` y sus propios volúmenes; se alterna con el proyecto local porque ambos enlazan los mismos puertos.

## 4. Entregables por fase

### Fase 0 — Fundamentos y documentación (implementada)

**Objetivo:** establecer una base verificable antes de implementar funcionalidades.

Entregables:

- Roadmap y registro de decisiones.
- Arquitectura inicial.
- mapa de módulos.
- Convenciones de código y documentación.
- Estructura de variables de entorno.
- Estrategia de pruebas y datos de demostración.

Criterios de aceptación:

- El alcance aprobado está documentado.
- Las exclusiones están explícitas.
- Las dependencias externas no bloquean el desarrollo local.

### Fase 1 — Base Docker y sistema visual (implementada y validada)

**Objetivo:** disponer de una aplicación vacía pero operativa y consistente.

Entregables:

- Monorepo TypeScript.
- Docker Compose.
- Next.js, NestJS, PostgreSQL, Redis y almacenamiento local.
- Migraciones iniciales.
- Health checks.
- Sistema visual responsive.
- Navegación global persistente con acceso a Inicio, catálogo, reserva, políticas y sesión en todas las rutas.
- Logo provisional extraído del manual de marca.
- Base persistente para configurar logo, icono y datos públicos; la interfaz protegida se completa en la fase 8.

Criterios de aceptación:

- Un solo comando levanta la plataforma.
- Web, API, base de datos y worker reportan estado saludable.
- El diseño base funciona en escritorio y móvil.

### Fase 2 — Identidad, seguridad y roles (implementada)

**Objetivo:** implementar acceso seguro para clientas, manicuristas y administradora.

Entregables:

- Clientas: teléfono internacional con selector visible de país/lada, formato E.164 y contraseña.
- Verificación y recuperación mediante OTP de WhatsApp.
- Autorregistro pendiente durante un máximo de 24 horas, reanudable con las mismas credenciales y activado sólo después del OTP.
- Manicuristas y administradora: correo o teléfono y contraseña.
- Recuperación de personal mediante correo.
- Una sola administradora activa.
- Alta, pausa, archivo y reactivación de cuentas.
- Perfiles invitados convertibles en cuentas.
- Sesiones seguras, límites de intentos y auditoría.
- Proveedor WhatsApp `mock` y proveedor real configurable.

Criterios de aceptación:

- Ninguna contraseña se almacena o muestra en texto legible.
- En desarrollo, el modo `mock` permite probar los flujos sin credenciales externas; el código OTP está apagado por defecto, sólo se expone al activar temporalmente `OTP_MOCK_DEBUG_ENABLED=true` y nunca en producción.
- Una clienta puede registrarse, verificar el teléfono, entrar y recuperar acceso.
- Cerrar o recargar antes de verificar no deja una cuenta utilizable: al iniciar con teléfono y contraseña válidos se recupera el intento, sin sesión, y el reenvío se limita a su `challengeId`.
- Un borrador cuyo primer envío falla se descarta de inmediato; los demás vencen a las 24 horas y se eliminan periódicamente para permitir un registro nuevo.
- La administradora puede crear clientas y manicuristas.

### Fase 3 — Disponibilidad y agenda (implementada)

**Objetivo:** ofrecer una agenda flexible y libre de traslapes.

Entregables:

- Horario global editable; valor inicial lunes a viernes de 08:00 a 24:00.
- Fines de semana cerrados inicialmente.
- Horario recurrente por manicurista.
- Descansos y modificaciones particulares.
- Perfil de manicurista pausado.
- Reservas públicas en intervalos configurables.
- Citas manuales a cualquier minuto.
- Duración predeterminada de 60 minutos y duración individual editable.
- Reserva mínima de 4 horas y máxima de 14 días, ambas configurables.
- Selección de manicurista o “Cualquiera”.
- Calendario interactivo de disponibilidad.
- Retención de horario configurable, con valor inicial de 10 minutos.
- Restricción transaccional contra traslapes.
- Advertencia al quitar disponibilidad donde ya existe una cita, sin eliminarla.
- Listado de agenda paginado con carga explícita de citas anteriores.
- Política vigente incluida en el listado para mostrar dinámicamente anticipación y límite de reprogramaciones.

Criterios de aceptación:

- Dos solicitudes simultáneas no pueden reservar el mismo tiempo de una manicurista.
- Una cita puede terminar exactamente cuando empieza la siguiente.
- Una extensión incompatible es rechazada.
- Una cita manual puede comenzar, por ejemplo, a las 13:43.
- “Cualquiera” muestra horarios libres para al menos una manicurista.

### Fase 4 — Catálogo, calculadora y cotizaciones (implementada)

**Objetivo:** permitir que la clienta explore diseños y obtenga una duración válida antes de reservar.

Entregables:

- Catálogo administrado únicamente por la administradora.
- Fotografías, descripción, precio, duración, técnica, largo y categorías.
- Favoritos y filtros.
- Reserva directa de diseños de catálogo.
- Selección editorial de hasta tres diseños destacados en Inicio, con acceso al catálogo completo.
- Migración de la lógica de la calculadora actual.
- Administración de técnicas, largos, decoraciones, extras, precios e iconos.
- Hasta cinco imágenes por solicitud personalizada.
- Flujo “No tengo diseño”.
- Selección de revisora o “Cualquiera”.
- Toma atómica de solicitudes por la primera manicurista.
- Asignación manual por la administradora.
- Confirmación o cambio de precio, duración y comentarios.
- Reserva posterior únicamente con la manicurista responsable.
- Galería administrable de hasta cinco imágenes y elección de portada sin borrar las demás.
- Cancelación por la clienta mientras la solicitud está pendiente o en revisión.
- Visibilidad privada: una manicurista sólo consulta solicitudes abiertas que puede tomar o las que le fueron asignadas.

Criterios de aceptación:

- Un diseño de catálogo puede reservarse sin revisión.
- Una configuración de calculadora no permite reservar hasta ser revisada.
- Una sola manicurista puede apropiarse de una solicitud enviada a todas.
- Ningún horario queda bloqueado durante la revisión.

### Fase 5 — Visitas, camino de recompensas y promociones (implementada)

**Objetivo:** representar de forma visual la fidelidad de cada clienta.

Entregables:

- Contador global de visitas completadas.
- Reglas ilimitadas por número de visita.
- Camino visual con recompensas bloqueadas, disponibles y utilizadas.
- Recompensas de un solo uso y sin vencimiento.
- Contenido libre para describir el descuento.
- Avisos a clienta y manicurista.
- Canje manual relacionado con una cita.
- Reversión exclusiva de la administradora.
- Códigos promocionales generales.
- Prohibición de combinar cupones.
- Auditoría de correcciones de visitas y canjes.

Criterios de aceptación:

- Una ausencia no incrementa visitas.
- Completar una cita incrementa exactamente una vez el contador.
- Un hito no genera dos veces la misma recompensa.
- Los cupones nunca reducen el anticipo.

### Fase 6 — Anticipos SPEI (implementada)

**Objetivo:** confirmar reservas mediante transferencias revisadas manualmente.

Entregables:

- Anticipo global inicial de $100, editable.
- Referencia única por reservación.
- Datos bancarios configurables.
- Carga segura de comprobante.
- Plazo de carga tomado de la política de apartado, inicialmente 10 minutos.
- Estado “Pago por verificar”.
- Bloqueo del horario hasta decisión administrativa.
- Aprobación y rechazo exclusivos de la administradora.
- Comprobante digital de reservación.
- Retención de archivos durante un año.
- Notas libres para anticipos de citas manuales.

Criterios de aceptación:

- Sin comprobante dentro del plazo se libera el horario.
- Al subirlo, el horario permanece bloqueado.
- Al rechazarlo, el horario vuelve a estar disponible.
- Los comprobantes no son accesibles públicamente.

### Fase 7 — Notificaciones e integraciones (implementada)

**Objetivo:** mantener informadas a clientas y personal.

Entregables:

- Centro de notificaciones interno.
- WhatsApp para OTP, citas, cambios, cotizaciones, pagos, cupones y recordatorios.
- Plantillas OTP `AUTHENTICATION` con botón **Copiar código** y versión de Graph API configurable.
- Recordatorios 24 horas y 2 horas antes.
- Correo para recuperación de personal.
- Integración saliente con Google Calendar por manicurista.
- Plantillas configurables.
- Reintentos y registro de entregas fallidas.
- Worker BullMQ con reintentos y cinco programadores periódicos: entregas, recordatorios, vencimiento de anticipos, retención de comprobantes y limpieza de autorregistros vencidos.
- Endpoints internos de ejecución protegidos por `WORKER_SHARED_SECRET`; la API no duplica programadores cuando `BACKGROUND_JOBS_MODE=worker`.

Criterios de aceptación:

- El modo local funciona sin WhatsApp real.
- Una falla externa no rompe la confirmación interna de la cita.
- Cambiar o cancelar una cita actualiza el evento administrado por la plataforma.

### Fase 8 — Panel administrativo, reportes y PWA (implementada)

**Objetivo:** completar la operación cotidiana del estudio.

Entregables:

- Dashboard de citas, anticipos, asistencias, ausencias y cancelaciones.
- Indicadores de diseños populares y clientas frecuentes.
- Exportación CSV/Excel.
- Auditoría consultable.
- Configuración de logo, icono, dirección, teléfono, WhatsApp, redes y mapa.
- PWA instalable para todos los roles.
- Interfaz administrativa redactada en femenino.

Criterios de aceptación:

- La administradora puede operar el negocio sin modificar código.
- Los reportes respetan filtros y zona horaria.
- Los datos exportados coinciden con los mostrados.

### Fase 9 — Calidad, seguridad y entrega (completada)

**Objetivo:** entregar una demostración reproducible y documentada.

Entregables:

- Pruebas unitarias, integración y end-to-end.
- Revisión de permisos y archivos.
- Respaldos semanales y restauración.
- Limpieza programada de comprobantes al cumplir un año.
- Datos de demostración.
- README completo.
- PDFs y manuales finales.
- Ensayo de instalación desde cero.
- Regeneración automática de Prisma Client antes de typecheck, lint, pruebas y build.
- Compose local limitado a `127.0.0.1` y overlay público separado con producción, HTTPS, secretos obligatorios y OTP de depuración deshabilitado.

Criterios de aceptación:

- El proyecto puede levantarse en una máquina limpia siguiendo el README.
- El respaldo puede restaurarse en una base vacía.
- Los flujos críticos están cubiertos por pruebas automatizadas.
- Los manuales contienen capturas reales.

Estado de aceptación: aprobado el 14 de agosto de 2026. La candidata pasó calidad integral, reconstrucción y salud Docker, E2E, respaldo/restauración aislada, instalación limpia y revisión de los manuales. La entrega real por Meta/SMTP y la autorización de Google Calendar se validarán al incorporar las cuentas externas definitivas.

## 5. Calendario objetivo de 15 días

| Día | Trabajo principal                           | Resultado verificable         |
| --: | ------------------------------------------- | ----------------------------- |
|   1 | Documentación, arquitectura y diseño visual | Base del producto aprobada    |
|   2 | Monorepo, Docker e infraestructura          | Servicios levantados          |
|   3 | Autenticación y seguridad                   | Acceso de los tres roles      |
|   4 | Usuarios, perfiles y administración         | Alta y gestión de cuentas     |
|   5 | Horarios y disponibilidad                   | Calendario por manicurista    |
|   6 | Citas y restricciones                       | Agenda sin traslapes          |
|   7 | Catálogo y favoritos                        | Exploración y reserva directa |
|   8 | Calculadora y cotizaciones                  | Revisión de precio y duración |
|   9 | Visitas y recompensas                       | Camino visual y cupones       |
|  10 | Anticipos SPEI                              | Comprobantes y aprobación     |
|  11 | WhatsApp y notificaciones                   | Mensajería simulada/real      |
|  12 | Google Calendar y PWA                       | Integraciones instalables     |
|  13 | Dashboard, reportes y auditoría             | Operación administrativa      |
|  14 | Pruebas, seguridad y respaldos              | Candidata de entrega          |
|  15 | PDFs, manuales y ensayo Docker              | Demostración final            |

## 6. Riesgos y mitigaciones

| Riesgo                                        | Impacto                                 | Mitigación                                                               |
| --------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| Aprobación de número o plantillas de WhatsApp | Mensajes reales no disponibles a tiempo | Proveedor `mock`, adaptador real y configuración documentada             |
| Credenciales de Google no disponibles         | Calendario real no conectable           | Adaptador y modo desconectado; integración activable por entorno         |
| Fotografías o logo final pendientes           | Contenido provisional                   | Logo extraído del PDF y datos editables desde administración             |
| Cambios de alcance durante los 15 días        | Retraso y regresiones                   | Registro de decisiones y control de cambios                              |
| Comprobante falso que bloquea un horario      | Disponibilidad retenida                 | Alertas administrativas, revisión y rechazo rápido                       |
| Pérdida de datos locales                      | Interrupción de la demostración         | Scripts de respaldo/restauración y volumen Docker documentado            |
| Publicar valores locales por error            | Exposición de credenciales o servicios  | Puertos locales en loopback y overlay público que exige secretos y HTTPS |

## 7. Dependencias externas

No bloquean la implementación local, pero serán necesarias para operación real:

- Cuenta Meta Business y WhatsApp Business Platform.
- Número de Dear Angel habilitado para la API.
- Plantillas de WhatsApp aprobadas.
- Credenciales OAuth de Google Calendar.
- Contraseña de aplicación SMTP.
- Datos bancarios de recepción SPEI.
- Logo y datos públicos definitivos.

## 8. Fuera del alcance inicial

- Sucursales múltiples.
- Plataforma para otros negocios.
- Inventario o tienda en línea.
- Webhook de Meta para estados `delivered`/`read`: actualmente un `wamid` confirma aceptación del mensaje por Meta, no entrega o lectura en el teléfono de destino.
- Cobro del saldo del servicio dentro de la plataforma.
- Aplicación automática de descuentos al anticipo.
- Reembolsos automáticos.
- Facturación CFDI.
- Lista de espera.
- Módulo específico de vacaciones.
- Aplicaciones nativas de App Store o Play Store.
- Sincronización bidireccional completa desde cambios hechos directamente en Google Calendar.

## 9. Definición general de terminado

Una funcionalidad se considera terminada cuando:

1. Cumple sus reglas de negocio y permisos.
2. Tiene validaciones de frontend y backend.
3. Incluye manejo de errores comprensible.
4. Tiene pruebas proporcionales a su riesgo.
5. Funciona en móvil y escritorio.
6. Está documentada.
7. No introduce secretos en el repositorio.
8. Tiene una ruta de ejecución Docker documentada y pasa su validación antes de liberarse.

## 10. Control de cambios

Toda modificación relevante se agregará al registro de decisiones con fecha, motivo, impacto y estado. Los cambios que alteren agenda, seguridad, pagos o recompensas requerirán actualizar reglas, pruebas y documentación en la misma entrega.
