# Dear Angel Nail Studio

Plataforma de agenda, catálogo y operación para Dear Angel Nail Studio.

## Requisitos

- Docker Desktop con Docker Compose.
- Puertos locales disponibles: `3000`, `3001`, `3002`, `5432`, `6379`, `9000` y `9001`.

## Levantar la aplicación

Desde PowerShell, en la raíz del proyecto:

```powershell
docker compose up -d --build
```

La primera construcción puede tardar varios minutos. Para ver el avance usa `docker compose logs -f`. Si vas a conectar servicios reales, copia antes `.env.example` como `.env` y completa las variables necesarias.

Servicios disponibles:

- Web: <http://localhost:3000>
- API: <http://localhost:3001/api>
- Salud API: <http://localhost:3001/api/health/ready>
- Salud worker: <http://localhost:3002/health>
- Consola de archivos: <http://localhost:9001>

Rutas funcionales actuales:

- Reservar: <http://localhost:3000/reservar>
- Iniciar sesión: <http://localhost:3000/acceso>
- Mi cuenta: <http://localhost:3000/mi-cuenta>
- Agenda: <http://localhost:3000/agenda>
- Horarios: <http://localhost:3000/horarios>
- Administrar personas: <http://localhost:3000/administracion/usuarios>
- Catálogo: <http://localhost:3000/catalogo>
- Cotizar un diseño: <http://localhost:3000/cotizar>
- Revisar cotizaciones: <http://localhost:3000/cotizaciones>
- Administrar catálogo y calculadora: <http://localhost:3000/administracion/catalogo>
- Mis recompensas: <http://localhost:3000/recompensas>
- Recompensas para el equipo: <http://localhost:3000/recompensas/equipo>
- Administrar reglas y promociones: <http://localhost:3000/administracion/recompensas>
- Enviar un anticipo: <http://localhost:3000/anticipo>
- Administrar anticipos SPEI: <http://localhost:3000/administracion/anticipos>
- Políticas de reservación: <http://localhost:3000/politicas>
- Mis datos: <http://localhost:3000/mis-datos>
- Notificaciones: <http://localhost:3000/notificaciones>
- Conexiones y Google Calendar: <http://localhost:3000/integraciones>
- Administrar plantillas y entregas: <http://localhost:3000/administracion/notificaciones>
- Resumen administrativo: <http://localhost:3000/administracion>
- Reportes y exportaciones: <http://localhost:3000/administracion/reportes>
- Historial de auditoría: <http://localhost:3000/administracion/auditoria>
- Información, logo y contacto: <http://localhost:3000/administracion/configuracion>

Las fases 0 a 9 están implementadas. La administradora puede consultar indicadores, filtrar y exportar reportes, revisar auditoría y cambiar la identidad pública sin modificar código. Los comprobantes se almacenan de forma privada y se eliminan automáticamente al cumplir un año. WhatsApp, SMTP y Google Calendar funcionan en modo simulado hasta agregar sus credenciales al entorno.

### Instalar como aplicación

La web es una PWA. En Android/Chrome aparece el botón `Instalar Dear Angel`; en iPhone se instala desde Safari con `Compartir` → `Agregar a pantalla de inicio`. Se requiere `localhost` o una dirección HTTPS, como el enlace de ngrok. Sin internet se muestra una pantalla segura; citas, pagos y cambios de cuenta nunca se confirman sin conexión.

En desarrollo local se crea una administradora inicial:

```text
Correo: admin@dearangel.local
Contraseña: DearAngelDemo2026
```

Al entrar se solicita cambiar esa contraseña. Crea al menos una manicurista desde el panel para que aparezcan horarios en la reservación pública. En un entorno real configura `ADMIN_EMAIL` y `ADMIN_INITIAL_PASSWORD`; no conserves las credenciales de demostración.

## Detener la plataforma

```powershell
docker compose down
```

## Compartir una vista temporal por Internet

La vista pública de revisión usa un túnel temporal de Cloudflare. No requiere abrir puertos del router ni instalar software adicional fuera de Docker:

```powershell
docker compose --profile preview up -d preview
docker compose --profile preview logs preview
```

Copia de los logs la dirección que termina en `trycloudflare.com`. La dirección funciona mientras la computadora, Docker y el contenedor `preview` permanezcan encendidos. Para detener solamente el acceso público:

```powershell
docker compose --profile preview stop preview
```

Este método está destinado a demostraciones, no a producción; al reiniciar el túnel la dirección puede cambiar.

### Enlace de desarrollo permanente

Para conservar la misma dirección después de reiniciar la computadora, crea una cuenta gratuita de ngrok y copia a tu archivo `.env` el authtoken y el dominio de desarrollo que aparecen en su panel:

```dotenv
NGROK_AUTHTOKEN=tu_token_privado
NGROK_DOMAIN=tu-dominio-asignado.ngrok-free.app
PUBLIC_APP_URL=https://tu-dominio-asignado.ngrok-free.app
```

No compartas ni subas el authtoken. Después inicia el enlace permanente con:

```powershell
docker compose --profile stable-preview up -d stable-preview
docker compose --profile stable-preview logs stable-preview
```

La dirección será `https://` seguida del valor de `NGROK_DOMAIN`. `PUBLIC_APP_URL` permite que los avisos generen enlaces públicos correctos. La dirección permanecerá igual tras los reinicios, pero sólo responderá mientras la computadora, Docker y el contenedor `stable-preview` estén encendidos.

Para detenerlo:

```powershell
docker compose --profile stable-preview stop stable-preview
```

Los datos se conservan en volúmenes Docker. Para detener y eliminar los volúmenes de desarrollo:

```powershell
docker compose down --volumes
```

> Eliminar volúmenes borra la base de datos y los archivos locales. No uses ese comando con datos que necesites conservar.

## Actualizar después de cambios

```powershell
docker compose up -d --build
```

## Respaldos y recuperación

El contenedor `backup` genera un respaldo de PostgreSQL y del bucket privado al iniciar y luego cada siete días. Conserva 90 días de forma predeterminada; ambos valores se cambian con `BACKUP_INTERVAL_SECONDS` y `BACKUP_RETENTION_DAYS`. Los archivos quedan en `backups/` y contienen manifiesto y sumas SHA-256.

Para crear y verificar una copia de inmediato:

```powershell
npm run backup:now
powershell -ExecutionPolicy Bypass -File scripts/verify-backup.ps1 -BackupFile .\backups\dear-angel-FECHA.tar.gz
```

Para comprobar la recuperación sin tocar los datos actuales, el siguiente comando restaura en una base y bucket temporales, compara conteos y los elimina al terminar:

```powershell
npm run backup:test-restore
```

Una restauración real reemplaza datos y archivos. Hazla sólo con la copia correcta y la confirmación explícita:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restore-backup.ps1 `
  -BackupFile .\backups\dear-angel-FECHA.tar.gz `
  -ConfirmRestore
```

## Datos demostrativos y verificación

El seed es repetible y sólo corre si se habilita de manera intencional. Agrega manicuristas, clientela ficticia, citas, anticipos, visitas y recompensas sin usar datos reales:

```powershell
$env:DEMO_DATA_ENABLED='true'
npm run demo:seed
Remove-Item Env:DEMO_DATA_ENABLED
```

Credenciales locales del recorrido demo:

```text
Manicurista: demo.manicurista1@dearangel.local
Cliente: +529990000101
Contraseña: DearAngelDemo2026
```

Controles de entrega:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run test:clean-install
```

`test:clean-install` detiene temporalmente la instalación principal, crea volúmenes Docker aislados, carga el seed, ejecuta el e2e, elimina exclusivamente ese proyecto de ensayo y vuelve a levantar la plataforma y el enlace estable. Para reutilizar imágenes ya compiladas puede ejecutarse `scripts/rehearse-clean-install.ps1 -SkipBuild`.

## Desarrollo sin contenerizar las aplicaciones

Se pueden mantener PostgreSQL, Redis y MinIO en Docker y ejecutar las aplicaciones con Node.js:

```powershell
npm install
npm run db:generate
npm run dev
```

## Variables de entorno

`.env.example` documenta todas las variables. Copia el archivo como `.env` y completa secretos únicamente de forma local. Nunca subas `.env`, tokens, contraseñas de aplicación o credenciales de producción.

### Activar avisos e integraciones reales

El modo local no necesita credenciales: registra los avisos dentro de la plataforma y simula las entregas. Para producción se requieren:

- Meta WhatsApp Business Platform: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, un `WHATSAPP_ACCESS_TOKEN` permanente y las plantillas aprobadas de OTP, recuperación, citas, recordatorios, cotizaciones, anticipos y cupones.
- Correo del personal: `SMTP_USER` y una `SMTP_APP_PASSWORD`; para Gmail se crea una contraseña de aplicación con verificación en dos pasos activa.
- Google Cloud: cliente OAuth tipo aplicación web, Calendar API habilitada y `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. Agrega como URI autorizada la URL exacta indicada en `GOOGLE_REDIRECT_URI`.
- Seguridad: genera `INTEGRATION_ENCRYPTION_KEY` como un secreto aleatorio de al menos 32 bytes y define `PUBLIC_APP_URL` con la dirección pública de la plataforma.

Activa cada proveedor únicamente después de completar sus valores con `WHATSAPP_ENABLED=true`, `SMTP_ENABLED=true` y `GOOGLE_CALENDAR_ENABLED=true`. Reinicia API después de cambiar el entorno. No envíes estas claves por chat.

## Documentación

- [Roadmap](docs/ROADMAP.md)
- [Decisiones del producto](docs/DECISIONES.md)
- [Arquitectura técnica](docs/ARQUITECTURA.md)
- [Progreso de implementación](docs/PROGRESO.md)
- [Especificación y casos de uso en PDF](docs/ESPECIFICACION_REQUERIMIENTOS_CASOS_USO.pdf)
- [Manual de usuario en PDF](docs/MANUAL_USUARIO.pdf)
- [Manual técnico y de operación en PDF](docs/MANUAL_TECNICO_OPERACION.pdf)
