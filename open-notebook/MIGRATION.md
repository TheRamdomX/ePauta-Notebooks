# Open Notebook - Migration Guide

Este script permite respaldar y restaurar todos los datos persistentes de Open Notebook para migrar entre máquinas o hacer backups.

## ¿Qué se respalda?

El script `migrate.sh` respalda:

### Directorios de datos
- `surreal_data/` - Base de datos SurrealDB (todos los notebooks, sources, notes, etc.)
- `redis_data/` - Cache Redis
- `notebook_data/` - Datos adicionales de notebooks

### Archivos de configuración
- `.env` - Variables de entorno (API keys, etc.)
- `docker-compose.yml` - Configuración de Docker

## Uso

### 1. Crear un backup

Ejecuta desde la raíz de `open-notebook/`:

```bash
./migrate.sh backup
```

Esto crea un archivo `open-notebook-backup-YYYYMMDD-HHMMSS.zip` con todos los datos.

También puedes especificar un nombre personalizado:

```bash
./migrate.sh backup mi-backup-importante.zip
```

**Nota:** El script detendrá automáticamente los contenedores Docker si están corriendo.

### 2. Restaurar un backup

En la máquina destino:

1. Copia el archivo `.zip` a la raíz de `open-notebook/`
2. Ejecuta:

```bash
./migrate.sh restore open-notebook-backup-20260519-225733.zip
```

El script:
- Detiene los contenedores Docker si están corriendo
- Valida el archivo de backup
- Te pide confirmación antes de restaurar
- Extrae todos los datos en sus ubicaciones originales
- Muestra instrucciones para reiniciar los servicios

3. Reinicia los servicios:

```bash
docker-compose up -d
```

4. Verifica los logs:

```bash
docker-compose logs -f
```

## Workflow de migración completo

### En la máquina origen (A)

```bash
cd open-notebook
./migrate.sh backup migration-prod.zip
```

Resultado: Se crea `migration-prod.zip` (~1-2GB dependiendo de datos)

### Transferir el backup

```bash
# Opción 1: Usando SCP
scp migration-prod.zip usuario@maquina-destino:/ruta/open-notebook/

# Opción 2: USB, Drive, servidor FTP, etc.
```

### En la máquina destino (B)

```bash
cd open-notebook
./migrate.sh restore migration-prod.zip
# Confirmar con "yes"
docker-compose up -d
docker-compose logs -f
```

## Archivos generados

El backup contiene una estructura como esta:

```
open-notebook-backup.zip
├── backup/
│   ├── surreal_data/        (DB completa)
│   ├── redis_data/          (Cache Redis)
│   ├── notebook_data/       (Datos adicionales)
│   ├── .env                 (Configuración)
│   ├── docker-compose.yml   (Configuración Docker)
│   └── BACKUP_INFO.txt      (Metadata del backup)
```

## Consideraciones importantes

### Seguridad del .env
El archivo `.env` contiene:
- `GOOGLE_API_KEY`
- `OPEN_NOTEBOOK_ENCRYPTION_KEY`
- Otras credenciales

**Protegeprotege el archivo .zip con contraseña** si lo transmites por canales inseguros.

### Tamaño del backup
- Base de datos vacía: ~50MB
- Con datos moderados (100s de sources): 500MB-1GB
- Con muchos datos (1000s de sources): 2GB+

Comprime bien porque SurrealDB y Redis usan mucho espacio.

### Validación post-restauración

Después de restaurar, verifica que todo funcione:

```bash
# Chequea que la BD se está ejecutando
docker-compose ps

# Verifica logs de errores
docker-compose logs open_notebook | grep -i error

# Accede a la API
curl http://localhost:5055/health

# Verifica que los datos están presentes
curl http://localhost:5055/api/models/providers
```

## Troubleshooting

### El backup no se completa
```bash
# Verifica espacio en disco
df -h .

# Verifica permisos
ls -la surreal_data/ redis_data/ notebook_data/
```

### La restauración falla
```bash
# Valida el archivo ZIP
unzip -t open-notebook-backup.zip

# Verifica que no hay conflictos
ls -la surreal_data/ redis_data/ notebook_data/
```

### Los contenedores no inician después de restaurar
```bash
# Revisa logs detallados
docker-compose logs -f

# Reconstruye sin cache
docker-compose down -v
docker-compose up -d
```

## Backup automatizado (opcional)

Para hacer backups periódicos, puedes agregar un cronjob:

```bash
# Editar crontab
crontab -e

# Agregar línea para backup diario a las 2 AM
0 2 * * * cd /path/to/open-notebook && ./migrate.sh backup daily-$(date +\%Y\%m\%d).zip
```

## Preguntas frecuentes

**P: ¿Puedo hacer backup sin detener los contenedores?**
R: No recomendado. El script los detiene automáticamente para garantizar consistencia de datos.

**P: ¿Qué pasa con los datos nuevos en la máquina destino antes de restaurar?**
R: Se pierden. El restore sobrescribe todo. Haz backup de destino antes si necesitas preservar datos.

**P: ¿Se respalda el frontend (epauta)?**
R: No, este script es solo para open-notebook. Para epauta, haz commit a Git.

**P: ¿Puedo restaurar en una versión diferente de open-notebook?**
R: Generalmente sí, pero ten cuidado con cambios de schema de BD. Prueba primero en desarrollo.
