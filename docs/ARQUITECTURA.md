# Arquitectura técnica

## Dear Angel Nail Studio

| Campo                   | Valor                                 |
| ----------------------- | ------------------------------------- |
| Versión                 | 1.1                                   |
| Fecha                   | 14 de agosto de 2026                  |
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

Las capas interiores no dependen de detalles externos. WhatsApp, almacenamiento, correo y calendario se consumen mediante contratos y adaptadores reemplazables.

## 3. Mapa de aplicaciones

### `apps/web`

- Interfaz responsive y PWA instalable.
- Experiencias de clienta, manicurista y administradora.
- Validación de formularios para retroalimentación inmediata.
- Consumo exclusivo de la API para reglas y datos persistentes.

### `apps/api`

- Fuente de verdad de permisos y reglas del negocio.
- API HTTP versionable bajo `/api`.
- Transacciones, restricciones de agenda y auditoría.
- Acceso a PostgreSQL, Redis y almacenamiento privado.

### `apps/worker`

- Consumer y programadores BullMQ conectados a Redis.
- Programa entregas de notificaciones, recordatorios, vencimiento de anticipos y retención de comprobantes.
- No accede a PostgreSQL ni MinIO directamente: invoca endpoints internos de `apps/api` con `WORKER_SHARED_SECRET` en `x-worker-token`.
- Reintenta cada trabajo hasta cinco veces con espera exponencial; la API conserva las reglas, transacciones e idempotencia del dominio.
- Su health check exige Redis, programadores activos y una ejecución reciente aceptada por la API.

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

Cada módulo expone casos de uso; ningún controlador modifica tablas directamente.

## 5. Persistencia y concurrencia

- PostgreSQL conserva la información transaccional.
- Prisma administra el esquema y las migraciones versionadas.
- Redis sostiene la cola BullMQ y sus programadores; las retenciones de citas permanecen persistidas en PostgreSQL.
- MinIO simula almacenamiento S3 local para imágenes y comprobantes privados.
- Los comprobantes nunca se publican como archivos estáticos.
- PostgreSQL impide definitivamente los traslapes mediante una restricción de exclusión por manicurista e intervalo; la API agrega validaciones y mensajes comprensibles.
- Todos los horarios se persisten de forma no ambigua y se presentan en `America/Merida`.

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
- Prisma Client se regenera automáticamente antes de typecheck, lint, pruebas y build mediante los hooks `pre*` del workspace raíz.
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

Existe un `seed` repetible con una administradora, varias manicuristas, clientas ficticias, horarios, diseños y recompensas. No contiene teléfonos reales, contraseñas de producción, comprobantes reales ni credenciales externas.

El proveedor simulado de WhatsApp permite demostrar los flujos sin Meta únicamente en desarrollo. El código OTP está deshabilitado por defecto y sólo se incluye en la respuesta cuando `NODE_ENV=development` y se habilita temporalmente `OTP_MOCK_DEBUG_ENABLED=true`; debe volver a `false` después de la prueba. Producción rechaza esa combinación.

La web muestra siempre país y lada, normaliza teléfonos a E.164 y elimina cualquier `debugCode` de la sesión temporal de verificación. La API exige la lada en cada entrada telefónica y no aplica un país implícito. El proveedor real usa plantillas `AUTHENTICATION` con botón **Copiar código** y una versión configurable de Graph API.

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

Los contenedores incluyen health checks y dependencias de arranque. La API no reporta disponibilidad hasta comprobar PostgreSQL, Redis y el bucket privado. El Compose base enlaza todos estos puertos exclusivamente a `127.0.0.1`.

### Separación de entornos

- `compose.yaml` es la topología de desarrollo local. Sus valores predeterminados no son credenciales de producción.
- `.env.example` usa `localhost` para base, Redis y MinIO y sirve como referencia de ejecución en Windows. `compose.yaml` inyecta directamente `postgres`, `redis` y `minio` como hosts internos de los contenedores.
- El worker ejecutado en Windows no carga automáticamente el `.env` raíz, por lo que sus variables deben exportarse en la terminal.
- `docker/compose.public.yaml` es un overlay obligatorio para los perfiles `preview` y `stable-preview`. Cambia API y worker a producción, deshabilita el OTP de depuración y exige secretos propios, URLs HTTPS y activación explícita de proveedores.
- `.env.public.example` es la plantilla pública sin secretos; se copia como `.env.public`, archivo ignorado por Git y separado del entorno local.
- El overlay fija el proyecto `dear-angel-public`; sus contenedores y volúmenes no reutilizan los de `dear-angel`. Ambos proyectos publican los mismos puertos del host, por lo que se ejecutan de forma alternada, nunca simultánea.
- La publicación temporal siempre combina plantilla y ambos archivos: `docker compose --env-file .env.public -f compose.yaml -f docker/compose.public.yaml --profile <perfil> ...`.

## 10. Estado de evolución

Identidad, roles, sesiones, agenda, catálogo, cotizaciones, fidelidad, anticipos, notificaciones y operación administrativa están implementados sobre esta base. Los avisos usan una bandeja interna y una salida persistente con reintentos; Google Calendar sincroniza únicamente eventos administrados por Dear Angel y cifra sus tokens.

Una entrega marcada como `SENT` significa que Meta o SMTP la aceptó. La plataforma no afirma entrega ni lectura final porque el webhook de estados de Meta queda fuera del alcance inicial; el panel lo presenta como “Aceptado por proveedor”.

El listado de agenda usa paginación por cursor y devuelve la política vigente junto con cada página. Esto permite que la interfaz muestre el límite de reprogramaciones y las horas de aviso configuradas sin duplicar constantes de negocio.

Las cotizaciones se filtran en la API por clienta, apertura y manicurista responsable. Una solicitud abierta puede tomarse de forma atómica; después sólo la responsable y la administradora conservan acceso operativo. Las imágenes adjuntas usan la misma autorización y se entregan con caché privada. La clienta puede cancelarla mientras siga pendiente o en revisión. El catálogo mantiene hasta cinco imágenes ordenadas por diseño y cambia la portada reordenando la galería, sin borrar archivos válidos.

El módulo `operations` concentra lecturas administrativas sin duplicar reglas transaccionales. Calcula métricas y reportes en `America/Merida`, permite exportar CSV y XLSX y expone el historial de auditoría solo a la administradora. Las exportaciones neutralizan entradas que podrían interpretarse como fórmulas de hoja de cálculo.

La identidad pública reside en `studio_settings`; logo e icono se guardan en MinIO y se publican mediante endpoints controlados. La PWA conserva únicamente el cascarón público y archivos estáticos. Las rutas `/api`, sesiones, agenda y pagos nunca se almacenan para uso sin conexión.

## 11. Respaldo, restauración y entrega

El servicio `backup` ejecuta `pg_dump` en formato comprimido y refleja el bucket privado en una carpeta temporal. El `.tar.gz` se construye a partir del manifiesto y las sumas SHA-256 internas; después se crea un `.sha256` externo adyacente. `restore verify` exige y comprueba ambos antes de considerar íntegra la copia. El respaldo no contiene variables de entorno ni secretos.

El marcador de salud se persiste en el volumen de respaldos y se actualiza tanto en ejecuciones programadas como manuales. Los fallos conservan el último éxito verificable y activan reintentos breves sin publicar archivos parciales.

La restauración requiere `ALLOW_RESTORE=true`, valida que el archivo permanezca bajo `backups/` y rechaza rutas internas inseguras. El wrapper operativo verifica el respaldo antes de detener las aplicaciones y, si falla después de iniciar la mutación, las conserva detenidas para no servir un estado parcial. La prueba rutinaria crea una base y bucket con nombres restringidos, compara los objetos restaurados con el manifiesto, informa conteos de usuarios y migraciones y elimina exclusivamente esos destinos temporales.

Las cabeceras web aplican CSP y niegan carga en marcos; API y web niegan MIME sniffing y restringen permisos del navegador. En `NODE_ENV=production`, la API rechaza credenciales locales, URLs públicas sin HTTPS, CORS comodín, OTP de depuración e integraciones habilitadas sin sus claves.

Los mecanismos de respaldo, restauración aislada, E2E y ensayo Docker están disponibles como automatización. El 14 de agosto de 2026 la candidata pasó los cuatro controles sobre una reconstrucción completa; la activación de Meta, SMTP y Google sigue separada porque requiere credenciales externas propias.
