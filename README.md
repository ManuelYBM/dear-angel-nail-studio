# Dear Angel Nail Studio

Plataforma de agenda, catálogo y operación para Dear Angel Nail Studio.

## Requisitos

- Docker Desktop con Docker Compose.
- Node.js `22` o posterior y npm `10.9` o posterior para ejecutar los comandos de calidad, datos y desarrollo en host.
- Puertos locales disponibles: `3000`, `3001`, `3002`, `5432`, `6379`, `9000` y `9001`.

## Levantar la aplicación

Desde PowerShell, en la raíz del proyecto:

```powershell
docker compose up -d --build
```

La primera construcción puede tardar varios minutos. Para ver el avance usa `docker compose logs -f`. El archivo Compose base es exclusivamente local: publica todos los puertos en `127.0.0.1` y usa valores de desarrollo. Para personalizar ese entorno, copia `.env.example` como `.env`; una publicación temporal usa la plantilla separada `.env.public.example` descrita más adelante.

`.env.example` usa `localhost` para PostgreSQL, Redis y MinIO, por lo que también sirve como referencia para ejecutar las aplicaciones en el host. `compose.yaml` construye y asigna por separado los hosts internos `postgres`, `redis` y `minio` a sus contenedores.

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

Las funciones de las fases 0 a 9 están implementadas. La candidata fue validada el 14 de agosto de 2026 mediante calidad integral, reconstrucción Docker, recorrido end-to-end, respaldo/restauración aislada y ensayo de instalación limpia. Las integraciones reales permanecen desactivadas hasta incorporar credenciales propias. La administradora puede consultar indicadores, filtrar y exportar reportes, revisar auditoría y cambiar la identidad pública sin modificar código. Los comprobantes se almacenan de forma privada y se eliminan automáticamente al cumplir un año.

El worker es un consumidor BullMQ real. Programa entregas de notificaciones, recordatorios, vencimientos de anticipos, retención de comprobantes y limpieza de autorregistros vencidos en Redis, y ejecuta cada caso de uso a través de endpoints internos de la API autenticados con `WORKER_SHARED_SECRET`. En Compose, `BACKGROUND_JOBS_MODE=worker` evita que la API duplique esos programadores.

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

La vista pública de revisión usa un túnel temporal de Cloudflare. No requiere abrir puertos del router ni instalar software adicional fuera de Docker. Los servicios de túnel viven en `docker/compose.public.yaml`, por lo que el archivo base y el overlay público son obligatorios.

Primero crea el archivo público, que está ignorado por Git:

```powershell
Copy-Item .env.public.example .env.public
```

Configura en `.env.public` valores propios para `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`, `DATABASE_URL`, `OTP_PEPPER`, `INTEGRATION_ENCRYPTION_KEY`, `WORKER_SHARED_SECRET`, `ADMIN_EMAIL` y `ADMIN_INITIAL_PASSWORD`. Define también `WHATSAPP_ENABLED` y `SMTP_ENABLED` explícitamente como `true` o `false`, y usa la URL HTTPS pública exacta en `PUBLIC_APP_URL` y `CORS_ORIGIN`. Dentro de `DATABASE_URL`, el host continúa siendo `postgres` y la contraseña debe estar codificada para URL. Los secretos de producción deben cumplir las longitudes exigidas por la API; no reutilices los valores de desarrollo.

El overlay fija el proyecto Compose `dear-angel-public`, por lo que crea contenedores y volúmenes distintos de los locales y PostgreSQL nace con las credenciales públicas. Ambos entornos usan los mismos puertos del host y no pueden ejecutarse al mismo tiempo. Detén primero el entorno local; este comando conserva sus volúmenes:

```powershell
docker compose down
```

Después inicia el perfil:

```powershell
docker compose --env-file .env.public -f compose.yaml -f docker/compose.public.yaml --profile preview up -d --build worker backup preview
docker compose --env-file .env.public -f compose.yaml -f docker/compose.public.yaml --profile preview logs preview
```

Copia de los logs la dirección que termina en `trycloudflare.com`. La dirección funciona mientras la computadora, Docker y el contenedor `preview` permanezcan encendidos. Para detener solamente el acceso público:

```powershell
docker compose --env-file .env.public -f compose.yaml -f docker/compose.public.yaml --profile preview stop preview
```

Este método está destinado a demostraciones, no a producción; al reiniciar el túnel la dirección puede cambiar. El overlay ejecuta API y worker con configuración de producción, desactiva la exposición del OTP simulado y exige contraseñas, secretos, URLs HTTPS y decisiones explícitas para WhatsApp y SMTP. No publiques la plataforma con los valores locales de `.env.example`.

Como Cloudflare asigna la URL rápida después del primer arranque, puede ser necesario usar temporalmente una URL HTTPS no operativa para satisfacer la validación inicial. En cuanto aparezca la dirección real, actualiza `PUBLIC_APP_URL` y `CORS_ORIGIN` en `.env.public` y recrea sólo la API, sin detener `preview`, para no cambiar el túnel:

```powershell
docker compose --env-file .env.public -f compose.yaml -f docker/compose.public.yaml --profile preview up -d --no-deps --force-recreate api
```

### Enlace de desarrollo permanente

Para conservar la misma dirección después de reiniciar la computadora, crea una cuenta gratuita de ngrok y copia a `.env.public` el authtoken y el dominio de desarrollo que aparecen en su panel:

```dotenv
NGROK_AUTHTOKEN=tu_token_privado
NGROK_DOMAIN=tu-dominio-asignado.ngrok-free.app
PUBLIC_APP_URL=https://tu-dominio-asignado.ngrok-free.app
CORS_ORIGIN=https://tu-dominio-asignado.ngrok-free.app
```

No compartas ni subas el authtoken. Después inicia el enlace permanente con:

```powershell
docker compose --env-file .env.public -f compose.yaml -f docker/compose.public.yaml --profile stable-preview up -d --build worker backup stable-preview
docker compose --env-file .env.public -f compose.yaml -f docker/compose.public.yaml --profile stable-preview logs stable-preview
```

La dirección será `https://` seguida del valor de `NGROK_DOMAIN`. `PUBLIC_APP_URL` permite que los avisos generen enlaces públicos correctos. La dirección permanecerá igual tras los reinicios, pero sólo responderá mientras la computadora, Docker y el contenedor `stable-preview` estén encendidos.

Para detenerlo:

```powershell
docker compose --env-file .env.public -f compose.yaml -f docker/compose.public.yaml --profile stable-preview stop stable-preview
```

Para apagar todo el entorno público y volver al local, sin borrar los volúmenes de ninguno:

```powershell
docker compose --env-file .env.public -f compose.yaml -f docker/compose.public.yaml --profile preview --profile stable-preview down
docker compose up -d
```

Los datos locales y públicos se conservan en volúmenes separados. No agregues `--volumes` a los comandos de cambio de entorno: borrarías la base y los archivos del proyecto seleccionado.

## Actualizar después de cambios

```powershell
docker compose up -d --build
```

## Respaldos y recuperación

El contenedor `backup` genera un respaldo de PostgreSQL y del bucket privado al iniciar y luego cada siete días. Conserva 90 días de forma predeterminada; ambos valores se cambian con `BACKUP_INTERVAL_SECONDS` y `BACKUP_RETENTION_DAYS`. Si un intento falla, vuelve a probar tras `BACKUP_RETRY_SECONDS` —cinco minutos por defecto— en vez de esperar una semana. El `.tar.gz` contiene el manifiesto y las sumas SHA-256 internas; a su lado se genera el checksum externo `.sha256`. La verificación sólo acepta la copia cuando existen ambos y todas las comprobaciones pasan.

Para crear y verificar una copia de inmediato:

```powershell
npm run backup:now
powershell -ExecutionPolicy Bypass -File scripts/verify-backup.ps1 -BackupFile .\backups\dear-angel-FECHA-SUFIJO.tar.gz
```

Para comprobar la recuperación sin tocar los datos actuales, el siguiente comando restaura en una base y bucket temporales, compara el número de objetos con el manifiesto, informa los conteos de usuarios y migraciones aplicadas, y elimina los destinos al terminar:

```powershell
npm run backup:test-restore
```

Los comandos PowerShell anteriores administran el proyecto local y deben usarse con el entorno público detenido. En `dear-angel-public`, el servicio `backup` iniciado junto con el túnel ejecuta el daemon automático. Si necesitas una copia pública inmediata y ese entorno está activo, usa ambos archivos y su env-file:

```powershell
docker compose --env-file .env.public -f compose.yaml -f docker/compose.public.yaml run --rm --no-deps backup once
```

Para verificar la integridad de esa copia sin restaurarla:

```powershell
docker compose --env-file .env.public -f compose.yaml -f docker/compose.public.yaml --profile tools run --rm -e "BACKUP_FILE=/backups/dear-angel-FECHA-SUFIJO.tar.gz" restore verify
```

No uses `scripts/restore-backup.ps1` contra el proyecto público: ese script está delimitado al entorno local. Una restauración pública requiere revisar de forma explícita el proyecto y el archivo objetivo.

Una restauración real del entorno local reemplaza datos y archivos. Hazla sólo con la copia correcta y la confirmación explícita:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restore-backup.ps1 `
  -BackupFile .\backups\dear-angel-FECHA-SUFIJO.tar.gz `
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
npm run quality
npm run test:e2e
npm run test:clean-install
```

`npm run quality` ejecuta typecheck, ESLint, pruebas, build y comprobación de formato. Los hooks `pretypecheck`, `prelint`, `pretest` y `prebuild` regeneran automáticamente Prisma Client antes de cada etapa; `npm run db:generate` sigue disponible para prepararlo manualmente durante desarrollo.

`test:e2e` requiere la plataforma en ejecución. `test:clean-install` detiene temporalmente la instalación principal, crea volúmenes Docker aislados, carga el seed, ejecuta el e2e, elimina exclusivamente ese proyecto de ensayo y vuelve a levantar los servicios locales que estaban activos. No relanza los túneles `preview` ni `stable-preview`. Para reutilizar imágenes ya compiladas puede ejecutarse `scripts/rehearse-clean-install.ps1 -SkipBuild`.

> Validación registrada el 14 de agosto de 2026: `npm run quality`, `npm run test:e2e`, respaldo con restauración aislada y `npm run test:clean-install` terminaron correctamente sobre la misma candidata. Las pruebas de entrega externa real requieren las credenciales indicadas más adelante.

## Desarrollo sin contenerizar las aplicaciones

Se pueden mantener PostgreSQL, Redis y MinIO en Docker y ejecutar las aplicaciones con Node.js. Las URLs de `.env.example` ya usan `localhost`, pero el worker no carga automáticamente el `.env` raíz; exporta las variables en la misma terminal antes de `npm run dev`:

```powershell
docker compose up -d postgres redis minio

$env:DATABASE_URL='postgresql://dear_angel:dear_angel_local_password@localhost:5432/dear_angel?schema=public'
$env:REDIS_URL='redis://localhost:6379'
$env:MINIO_ENDPOINT='localhost'
$env:MINIO_PORT='9000'
$env:MINIO_USE_SSL='false'
$env:MINIO_ACCESS_KEY='dear_angel'
$env:MINIO_SECRET_KEY='dear_angel_minio_password'
$env:MINIO_BUCKET='dear-angel-private'
$env:API_INTERNAL_URL='http://localhost:3001/api'
$env:BACKGROUND_JOBS_MODE='worker'
$env:WORKER_SHARED_SECRET='dear-angel-local-worker-secret-change-me'

npm install
npm run db:generate
npm run dev
```

Estas credenciales son sólo para desarrollo en la máquina local. API y worker deben recibir el mismo `WORKER_SHARED_SECRET`; si ejecutas cada workspace en una terminal distinta, exporta las variables necesarias en cada una.

## Variables de entorno

`.env.example` documenta el Compose local y se copia como `.env`. `.env.public.example` es la plantilla separada para el overlay público y se copia como `.env.public`. Ambos archivos resultantes están ignorados por Git. Nunca subas tokens, contraseñas de aplicación o credenciales de producción.

El código OTP de prueba está deshabilitado de forma predeterminada y sólo se devuelve cuando `NODE_ENV=development` y se habilita deliberadamente `OTP_MOCK_DEBUG_ENABLED=true`. Para probar localmente registro o recuperación con Compose, actívalo únicamente durante el recorrido y vuelve a apagarlo al terminar:

```powershell
$env:OTP_MOCK_DEBUG_ENABLED='true'
docker compose up -d --no-deps --force-recreate api
# Ejecuta la prueba de registro o recuperación.
$env:OTP_MOCK_DEBUG_ENABLED='false'
docker compose up -d --no-deps --force-recreate api
Remove-Item Env:OTP_MOCK_DEBUG_ENABLED
```

Para probar la entrega real con el numero temporal de Meta sin registrar una SIM, primero el
destinatario debe responder al mensaje `hello_world` para abrir la ventana de atencion de 24 horas.
Despues agrega exclusivamente sus numeros E.164 a
`WHATSAPP_DEVELOPMENT_TEXT_OTP_RECIPIENTS`, separados por comas, y recrea la API. En ese modo los
codigos se envian como texto libre solo a esa lista; el resto continua exigiendo una plantilla
Authentication aprobada. El overlay publico vacia la lista y produccion rechaza cualquier valor.

La configuración pública fuerza este valor a `false` y la API rechaza cualquier intento de activarlo en producción.

Todos los formularios telefónicos muestran de forma visible el país y la lada —México `+52` por defecto— y guardan el resultado en formato internacional E.164. Pegar un número que ya incluya `+`, `00` o una lada reconocida no la duplica. La API rechaza números sin lada explícita en vez de asumir que son mexicanos; los campos que también aceptan correo conservan el correo sin modificar. La información temporal de verificación guardada en el navegador nunca conserva `debugCode` y limpia cualquier entrada antigua que lo contuviera.

El autorregistro conserva un borrador durante 24 horas mientras se verifica el WhatsApp. Ese borrador no es una cuenta activa, no abre sesión y queda fuera de agenda, recompensas y reportes. Si la persona cierra o recarga la página, puede escribir el mismo teléfono y contraseña en Iniciar sesión para volver automáticamente a la verificación. El reenvío queda ligado al `challengeId` vigente —nunca se solicita sólo con un teléfono—; si el primer envío falla, el borrador se descarta de inmediato, y un trabajo horario elimina los borradores vencidos para permitir comenzar de nuevo.

### Activar avisos e integraciones reales

El modo local puede operar sin credenciales externas: conserva los avisos dentro de la plataforma y, únicamente en desarrollo, puede usar el proveedor mock de WhatsApp. SMTP y Google Calendar permanecen deshabilitados hasta configurarlos. Para una operación real se requieren:

- Meta WhatsApp Business Platform: `WHATSAPP_PHONE_NUMBER_ID` del número del negocio, `WHATSAPP_BUSINESS_ACCOUNT_ID`, un `WHATSAPP_ACCESS_TOKEN` permanente y las plantillas aprobadas de OTP, recuperación, citas, recordatorios, cotizaciones, anticipos y cupones. Las dos plantillas de código deben ser de categoría `AUTHENTICATION`, con botón OTP **Copiar código**, un parámetro en el cuerpo y el mismo código en el botón; el cliente usa Graph API `v26.0` de forma configurable.
- Correo del personal: `SMTP_USER` y una `SMTP_APP_PASSWORD`; para Gmail se crea una contraseña de aplicación con verificación en dos pasos activa.
- Google Cloud: cliente OAuth tipo aplicación web, Calendar API habilitada y `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. Agrega como URI autorizada la URL exacta indicada en `GOOGLE_REDIRECT_URI`.
- Seguridad: genera `INTEGRATION_ENCRYPTION_KEY` como un secreto aleatorio de al menos 32 bytes y define `PUBLIC_APP_URL` con la dirección pública de la plataforma.

Activa cada proveedor únicamente después de completar sus valores con `WHATSAPP_ENABLED=true`, `SMTP_ENABLED=true` y `GOOGLE_CALENDAR_ENABLED=true`. Un `restart` no relee variables: después de cambiar el entorno recrea la API con `docker compose up -d --no-deps --force-recreate api` (agrega `--env-file .env.public -f compose.yaml -f docker/compose.public.yaml` para el entorno público). No envíes estas claves por chat.

### Pendientes externos

La operación local no queda bloqueada, pero una publicación real aún requiere las credenciales y aprobaciones anteriores, los datos bancarios SPEI, logo y datos públicos definitivos, y una decisión de alojamiento permanente con dominio y TLS. Los perfiles `preview` y `stable-preview` son herramientas de demostración, no un despliegue de producción.

## Documentación

- [Roadmap](docs/ROADMAP.md)
- [Decisiones del producto](docs/DECISIONES.md)
- [Arquitectura técnica](docs/ARQUITECTURA.md)
- [Progreso de implementación](docs/PROGRESO.md)
- [Especificación y casos de uso en PDF](docs/ESPECIFICACION_REQUERIMIENTOS_CASOS_USO.pdf)
- [Manual de usuario editable](docs/MANUAL_USUARIO.html) y [PDF](docs/MANUAL_USUARIO.pdf)
- [Manual técnico y de operación editable](docs/MANUAL_TECNICO_OPERACION.html) y [PDF](docs/MANUAL_TECNICO_OPERACION.pdf)

Los HTML son las fuentes editables. Los dos PDF de manuales fueron regenerados desde esas fuentes y revisados visualmente el 14 de agosto de 2026.
