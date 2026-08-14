# Arquitectura técnica

## Dear Angel Nail Studio

| Campo                   | Valor                                 |
| ----------------------- | ------------------------------------- |
| Versión                 | 1.0                                   |
| Fecha                   | 11 de agosto de 2026                  |
| Estilo                  | Monolito modular con worker asíncrono |
| Ejecución inicial       | Docker Compose                        |
| Zona horaria de negocio | `America/Merida`                      |

## 1. Decisión arquitectónica

Dear Angel se construye como un monolito modular. La web, la API y el worker son procesos separados, pero las reglas de negocio permanecen en una sola base de código y una sola base de datos.

Esta estructura permite desarrollar y desplegar con rapidez sin mezclar interfaz, negocio e infraestructura. Los módulos podrán extraerse en el futuro si el volumen o la operación lo justifican, sin introducir microservicios prematuramente.

## 2. Capas y dependencias

```text
Presentación
  - Next.js / PWA
  - Controladores HTTP de NestJS
           |
           v
Aplicación
  - Casos de uso
  - Autorización y orquestación
           |
           v
Dominio
  - Entidades, estados y reglas del negocio
           |
           v
Infraestructura
  - Prisma/PostgreSQL
  - Redis/BullMQ
  - MinIO/S3
  - WhatsApp, SMTP y Google Calendar
```

Las capas interiores no dependen de detalles externos. WhatsApp, almacenamiento, correo y calendario se consumirán mediante contratos y adaptadores reemplazables.

## 3. Mapa de aplicaciones

### `apps/web`

- Interfaz responsive y futura PWA.
- Experiencias de clienta, manicurista y administradora.
- Validación de formularios para retroalimentación inmediata.
- Consumo exclusivo de la API para reglas y datos persistentes.

### `apps/api`

- Fuente de verdad de permisos y reglas del negocio.
- API HTTP versionable bajo `/api`.
- Transacciones, restricciones de agenda y auditoría.
- Acceso a PostgreSQL, Redis y almacenamiento privado.

### `apps/worker`

- Trabajos asíncronos y programados.
- Recordatorios, reintentos de notificaciones y limpiezas.
- Nunca decide por sí solo reglas que pertenezcan al dominio; ejecuta casos de uso de forma segura e idempotente.

## 4. Mapa de módulos funcionales

| Módulo         | Responsabilidad principal                                     |
| -------------- | ------------------------------------------------------------- |
| Identidad      | Registro, OTP, sesiones, recuperación y contraseñas           |
| Personal       | Administradora, manicuristas, estado y perfiles               |
| Clientas       | Perfil, invitadas, preferencias e historial                   |
| Disponibilidad | Horario global, jornadas, descansos, excepciones y pausa      |
| Citas          | Reservas, reprogramación, cancelación, asistencia y traslapes |
| Catálogo       | Diseños publicados, imágenes, filtros y favoritos             |
| Cotizaciones   | Calculadora, revisión, asignación y aprobación                |
| Anticipos      | Referencias SPEI, comprobantes y verificación manual          |
| Fidelidad      | Visitas, hitos, cupones, promociones y canjes                 |
| Notificaciones | Centro interno, WhatsApp, correo y reintentos                 |
| Calendario     | Sincronización saliente con Google Calendar                   |
| Configuración  | Marca, datos públicos y reglas editables                      |
| Reportes       | Indicadores, filtros y exportaciones                          |
| Auditoría      | Registro inmutable de operaciones sensibles                   |

Cada módulo expondrá casos de uso; no se permitirá que un controlador modifique tablas directamente.

## 5. Persistencia y concurrencia

- PostgreSQL conserva la información transaccional.
- Prisma administra el esquema y las migraciones versionadas.
- Redis sostiene colas, tareas programadas y retenciones temporales.
- MinIO simula almacenamiento S3 local para imágenes y comprobantes privados.
- Los comprobantes nunca se publican como archivos estáticos.
- PostgreSQL impide definitivamente los traslapes mediante una restricción de exclusión por manicurista e intervalo; la API agrega validaciones y mensajes comprensibles.
- Todos los horarios se persistirán de forma no ambigua y se presentarán en `America/Merida`.

## 6. Convenciones

- TypeScript estricto en las tres aplicaciones.
- Nombres técnicos y rutas en inglés; textos visibles en español.
- Fechas de API en ISO 8601.
- Dinero en unidades enteras mínimas o tipo decimal de base de datos, nunca `float`.
- Identificadores no secuenciales para recursos públicos.
- Borrado lógico o archivado cuando exista historial relacionado.
- Migraciones aditivas y revisables; ningún cambio manual al esquema de producción.
- Variables secretas solo mediante entorno y nunca en el repositorio.
- Formato automático con Prettier y análisis estático con ESLint.
- Errores públicos claros, sin filtrar trazas, consultas ni secretos.

## 7. Estrategia de pruebas

| Nivel        | Alcance                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| Unitarias    | Reglas de horarios, estados, permisos, recompensas y anticipos           |
| Integración  | Repositorios, transacciones, restricciones PostgreSQL y adaptadores mock |
| API          | Contratos HTTP, autenticación, validación y autorización                 |
| End-to-end   | Registro, cotización, reserva, anticipo, asistencia y canje              |
| Concurrencia | Solicitudes simultáneas de cita y toma de cotización                     |
| Operación    | Health checks, respaldos, restauración y limpieza anual                  |
| Visual       | Viewports de escritorio y móvil en recorridos críticos                   |

Las pruebas con mayor riesgo se priorizan: ausencia de traslapes, control de permisos, comprobantes privados y contadores idempotentes.

## 8. Datos de demostración

Se preparará un `seed` repetible con una administradora, varias manicuristas, clientas ficticias, horarios, diseños y recompensas. No contendrá teléfonos reales, contraseñas de producción, comprobantes reales ni credenciales externas.

El proveedor simulado de WhatsApp permitirá mostrar códigos y notificaciones localmente hasta conectar Meta Business.

## 9. Infraestructura local

| Servicio      | Puerto | Persistencia                 |
| ------------- | -----: | ---------------------------- |
| Web           |   3000 | No aplica                    |
| API           |   3001 | No aplica                    |
| Worker        |   3002 | No aplica                    |
| PostgreSQL    |   5432 | Volumen `postgres_data`      |
| Redis         |   6379 | Volumen `redis_data` con AOF |
| MinIO API     |   9000 | Volumen `minio_data`         |
| MinIO consola |   9001 | Volumen `minio_data`         |

Los contenedores incluyen health checks y dependencias de arranque. La API no reporta disponibilidad hasta comprobar PostgreSQL, Redis y el bucket privado.

## 10. Estado de evolución

Identidad, roles, sesiones, agenda, catálogo, cotizaciones, fidelidad, anticipos, notificaciones y operación administrativa ya funcionan sobre esta base. Los avisos usan una bandeja interna y una salida persistente con reintentos; Google Calendar sincroniza únicamente eventos administrados por Dear Angel y cifra sus tokens.

El módulo `operations` concentra lecturas administrativas sin duplicar reglas transaccionales. Calcula métricas y reportes en `America/Merida`, permite exportar CSV y XLSX y expone el historial de auditoría solo a la administradora. Las exportaciones neutralizan entradas que podrían interpretarse como fórmulas de hoja de cálculo.

La identidad pública reside en `studio_settings`; logo e icono se guardan en MinIO y se publican mediante endpoints controlados. La PWA conserva únicamente el cascarón público y archivos estáticos. Las rutas `/api`, sesiones, agenda y pagos nunca se almacenan para uso sin conexión.

## 11. Respaldo, restauración y entrega

El servicio `backup` ejecuta `pg_dump` en formato comprimido y refleja el bucket privado en una carpeta temporal. Sólo después de generar manifiesto y sumas SHA-256 publica el archivo `.tar.gz`; una interrupción no produce una copia aparentemente válida. El respaldo no contiene variables de entorno ni secretos.

La restauración requiere `ALLOW_RESTORE=true`, valida que el archivo permanezca bajo `backups/` y rechaza rutas internas inseguras. La prueba rutinaria crea una base y bucket con nombres restringidos, verifica usuarios, migraciones y objetos, y elimina exclusivamente esos destinos temporales.

Las cabeceras web aplican CSP y niegan carga en marcos; API y web niegan MIME sniffing y restringen permisos del navegador. En `NODE_ENV=production`, la API rechaza credenciales locales, URLs públicas sin HTTPS, CORS comodín e integraciones habilitadas sin sus claves.
